/**
 * Tool Execution Service
 * 
 * Main orchestrator service that coordinates all other services
 * Replaces the massive executeToolCalls function from ChatInterfaceSimple.tsx
 */

import type { IToolExecutionService } from './interfaces/IToolExecutionService'
import type { IToolResultProcessor } from './interfaces/IToolResultProcessor'
import type { IToolServerMappingService } from './interfaces/IToolServerMappingService'
import type { IConversationHistoryService } from './interfaces/IConversationHistoryService'
import type { IToolRetryService } from './interfaces/IToolRetryService'
import type { 
  ToolCall, 
  ToolExecutionContext, 
  ExecutionMetrics,
  ServiceError,
  ChatMessage,
  ToolExecutionResult,
  ServiceConfiguration
} from './types/ToolExecutionTypes'
import { TOOL_EXECUTION_CONSTANTS } from './types/ToolExecutionTypes'
import type { ExternalDependencies } from './types/ServiceDependencies'
import { trackAsyncOperation } from '../../lib/MemoryManager'
import { devLog, DevLogCategory } from '../../lib/developmentLogger'

export class ToolExecutionService implements IToolExecutionService {
  // Use exact same limit as original
  private readonly MAX_RETRY_ATTEMPTS = TOOL_EXECUTION_CONSTANTS.MAX_RETRY_ATTEMPTS
  private readonly MAX_TOOL_ITERATIONS = 15

  // Execution state
  private isCurrentlyExecuting = false
  private currentContext: ToolExecutionContext | null = null
  private currentAbortController: AbortController | null = null

  // Performance tracking
  private executionMetrics: Map<string, ExecutionMetrics> = new Map()

  constructor(
    private externalDependencies: ExternalDependencies,
    private configuration: ServiceConfiguration,
    private toolResultProcessor: IToolResultProcessor,
    private serverMappingService: IToolServerMappingService,
    private conversationHistoryService: IConversationHistoryService,
    private toolRetryService: IToolRetryService
  ) {
    this.setupMemoryIntegration()
  }

  /**
   * Main entry point for tool execution
   * Exact replication of original executeToolCalls function logic
   */
  async executeToolCalls(
    toolCalls: ToolCall[],
    assistantMessageId: string,
    currentUserMessage?: string,
    abortSignal?: AbortSignal,
    retryCount: number = 0
  ): Promise<void> {
    if (!toolCalls || toolCalls.length === 0) return

    // Check if operation was cancelled before starting
    if (abortSignal?.aborted) {
      throw new Error('Tool execution was cancelled')
    }

    // Circuit breaker: prevent infinite retry loops - exact original logic
    if (retryCount >= this.MAX_RETRY_ATTEMPTS) {
      devLog.error(DevLogCategory.RETRY_LOGIC, 'Max retry attempts exceeded for tool execution', {
        maxAttempts: this.MAX_RETRY_ATTEMPTS
      })
      
      // Mark all tools as failed and provide user feedback - exact original behavior
      for (const toolCall of toolCalls) {
        this.externalDependencies.messageManager.safeAddMessage({
          role: 'tool',
          content: `Tool ${toolCall.name} failed: Maximum retry attempts exceeded. The tool may be experiencing persistent issues.`,
          tool_call_id: toolCall.id
        })
      }
      
      this.externalDependencies.messageManager.safeAddMessage({
        role: 'assistant',
        content: "I've encountered persistent issues with the tools and have reached the maximum retry limit. Please try your request again later, or let me know if you'd like help in a different way.",
        tool_calls: []
      })
      
      return
    }

    if (retryCount > 0) {
      devLog.retry('Tool execution retry attempt', {
        attempt: retryCount,
        maxAttempts: this.MAX_RETRY_ATTEMPTS
      })
    }

    // Set execution state
    this.isCurrentlyExecuting = true
    this.currentAbortController = new AbortController()
    
    // Create execution context
    const context: ToolExecutionContext = {
      assistantMessageId,
      currentUserMessage,
      abortSignal: abortSignal || this.currentAbortController.signal,
      retryCount,
      toolCalls: toolCalls.map(tc => ({ ...tc, status: 'pending' as const }))
    }
    this.currentContext = context

    // Start performance tracking
    const executionId = `execution_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const metrics: ExecutionMetrics = {
      startTime: Date.now(),
      toolCount: toolCalls.length,
      retryCount,
      cacheHitRate: 0,
      memoryBefore: this.getMemoryUsage(),
      memoryAfter: 0,
      success: false
    }
    this.executionMetrics.set(executionId, metrics)

    try {
      // Validate tool calls before execution
      const validation = this.validateToolCalls(context.toolCalls)
      if (!validation.isValid) {
        devLog.validation('Invalid tool calls found', {
          invalidCount: validation.invalidToolCalls.length
        })
        validation.invalidToolCalls.forEach(({ toolCall, reason }) => {
          devLog.validation('Invalid tool call details', {
            toolName: toolCall.name,
            reason
          })
        })
        
        // Use only valid tool calls
        context.toolCalls = validation.validToolCalls
      }

      let allToolsCompleted = true
      let currentToolCalls = [...context.toolCalls]

      // Execute tools sequentially - exact original behavior
      for (let i = 0; i < currentToolCalls.length; i++) {
        const toolCall = currentToolCalls[i]
        
        // Check for cancellation before each tool
        if (context.abortSignal?.aborted) {
          throw new Error('Tool execution was cancelled')
        }

        try {
          devLog.toolExecution('Executing tool', {
            toolIndex: i + 1,
            totalTools: currentToolCalls.length,
            toolName: toolCall.name
          })
          
          // Execute single tool with full error handling
          const result = await this.executeSingleTool(toolCall, context)
          
          // Update the tool call with result
          currentToolCalls[i] = result.updatedToolCall
          context.toolCalls = currentToolCalls
          
          // Update UI status - exact original behavior
          this.updateToolExecutionStatus(
            result.updatedToolCall,
            assistantMessageId,
            result.success ? 'completed' : 'error',
            result.result
          )
          
          allToolsCompleted = allToolsCompleted && result.success
          
          if (result.success) {
            // Update tool call with successful result - essential for processToolResults
            currentToolCalls[i] = result.updatedToolCall
            
            devLog.toolExecution('Tool completed successfully', {
              toolName: toolCall.name
            })
          } else {
            devLog.toolExecution('Tool execution failed', {
              toolName: toolCall.name,
              error: result.error
            })
          }

        } catch (error) {
          devLog.error(DevLogCategory.TOOL_EXECUTION, 'Individual tool execution failed', error)
          
          // Update tool call with error status - exact original behavior
          currentToolCalls[i] = {
            ...toolCall,
            status: 'error' as const,
            result: error instanceof Error ? error.message : 'Tool execution failed'
          }
          context.toolCalls = currentToolCalls
          
          this.updateToolExecutionStatus(
            currentToolCalls[i],
            assistantMessageId,
            'error',
            error instanceof Error ? error.message : 'Tool execution failed'
          )
          
          allToolsCompleted = false
        }
      }

      // Update context with modified tool calls before processing results
      context.toolCalls = currentToolCalls
      
      // Process results based on success/failure - exact original logic
      if (!allToolsCompleted) {
        await this.handlePartialToolFailure(context, executionId)
      } else {
        await this.handleSuccessfulToolExecution(context, executionId)
      }

      // Update final metrics
      metrics.endTime = Date.now()
      metrics.duration = metrics.endTime - metrics.startTime
      metrics.success = allToolsCompleted
      metrics.memoryAfter = this.getMemoryUsage()
      metrics.cacheHitRate = this.serverMappingService.getCacheStats().hitRate

      devLog.performance('Tool execution completed', {
        duration: metrics.duration,
        success: metrics.success
      })

    } catch (error) {
      devLog.error(DevLogCategory.ERROR_BOUNDARY, 'CRITICAL: Failed to process tool results', error)
      
      // Handle critical errors - exact original behavior
      try {
        this.externalDependencies.messageManager.safeAddMessage({
          role: 'assistant',
          content: "I encountered unexpected difficulties while processing your request. Please try again, and if the problem persists, try rephrasing your question.",
          tool_calls: []
        })
      } catch (recoveryError) {
        devLog.error(DevLogCategory.ERROR_BOUNDARY, 'CRITICAL: Failed to add recovery message', recoveryError)
      }

      // Update metrics for failure
      metrics.endTime = Date.now()
      metrics.duration = metrics.endTime - metrics.startTime
      metrics.success = false
      metrics.memoryAfter = this.getMemoryUsage()

      if (!abortSignal?.aborted) {
        this.externalDependencies.errorLogger.logError(
          'Critical tool execution failure',
          error as Error
        )
      }

    } finally {
      // Cleanup execution state
      this.isCurrentlyExecuting = false
      this.currentContext = null
      this.currentAbortController = null
      
      // Store final metrics
      this.executionMetrics.set(executionId, metrics)
    }
  }

  /**
   * Execute a single tool with full error handling and retry logic
   */
  async executeSingleTool(
    toolCall: ToolCall,
    context: ToolExecutionContext
  ): Promise<{
    success: boolean
    result?: any
    error?: string
    updatedToolCall: ToolCall
  }> {
    try {
      // Find server for this tool
      const serverId = await this.serverMappingService.findServerForTool(
        toolCall.name,
        context.abortSignal
      )

      if (serverId === null) {
        const error = `Tool ${toolCall.name} not found or disabled`
        return {
          success: false,
          error,
          updatedToolCall: { ...toolCall, status: 'error', result: error }
        }
      }

      // Execute tool via API with memory tracking
      const toolResult = await trackAsyncOperation(
        () => this.externalDependencies.api.callTool({
          tool_name: toolCall.name,
          parameters: toolCall.parameters,
          server_id: serverId
        }, context.abortSignal),
        `Execute tool ${toolCall.name}`,
        context.abortSignal
      ).catch(error => {
        if (!context.abortSignal?.aborted) {
          devLog.error(DevLogCategory.TOOL_EXECUTION, 'Tool execution failed', {
            toolName: toolCall.name,
            error
          })
        }
        // Return error result instead of throwing - exact original behavior
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        }
      })

      if (toolResult.success) {
        return {
          success: true,
          result: toolResult.result,
          updatedToolCall: { ...toolCall, status: 'completed', result: toolResult.result }
        }
      } else {
        // Check if this is a validation error that we can fix automatically
        const errorMessage = toolResult.error || 'Unknown error occurred'
        const isValidationError = this.toolRetryService.isValidationError(errorMessage)

        if (isValidationError) {
          devLog.retry('Detected validation error, attempting automatic parameter correction', {
            toolName: toolCall.name,
            error: errorMessage
          })

          // Parse the validation error
          const validationError = this.toolRetryService.parseValidationError(errorMessage)

          // Try automatic fixes
          const fixedToolCall = this.toolRetryService.applyAutomaticFixes(toolCall, validationError)

          if (fixedToolCall) {
            devLog.retry('Applied automatic parameter fixes, retrying tool execution', {
              toolName: toolCall.name,
              originalParameters: toolCall.parameters,
              fixedParameters: fixedToolCall.parameters
            })

            // Retry with fixed parameters
            try {
              const retryResult = await trackAsyncOperation(
                () => this.externalDependencies.api.callTool({
                  tool_name: fixedToolCall.name,
                  parameters: fixedToolCall.parameters,
                  server_id: serverId
                }, context.abortSignal),
                `Retry tool ${fixedToolCall.name} with fixes`,
                context.abortSignal
              )

              if (retryResult.success) {
                devLog.retry('Automatic parameter correction successful', {
                  toolName: toolCall.name
                })

                return {
                  success: true,
                  result: retryResult.result,
                  updatedToolCall: {
                    ...fixedToolCall,
                    status: 'completed',
                    result: retryResult.result
                  }
                }
              } else {
                devLog.retry('Automatic parameter correction failed, will use LLM retry', {
                  toolName: toolCall.name,
                  retryError: retryResult.error
                })

                // Use the original error for LLM retry
                return {
                  success: false,
                  error: errorMessage,
                  updatedToolCall: { ...toolCall, status: 'error', result: errorMessage }
                }
              }
            } catch (retryError) {
              devLog.retry('Exception during automatic parameter correction retry', {
                toolName: toolCall.name,
                error: retryError
              })

              // Fall back to original error for LLM retry
              return {
                success: false,
                error: errorMessage,
                updatedToolCall: { ...toolCall, status: 'error', result: errorMessage }
              }
            }
          } else {
            devLog.retry('No automatic fixes available, will use LLM retry', {
              toolName: toolCall.name
            })
          }
        }

        return {
          success: false,
          error: errorMessage,
          updatedToolCall: { ...toolCall, status: 'error', result: errorMessage }
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      return {
        success: false,
        error: errorMessage,
        updatedToolCall: { ...toolCall, status: 'error', result: errorMessage }
      }
    }
  }

  /**
   * Handle partial tool failure with retry logic - exact original behavior
   */
  private async handlePartialToolFailure(
    context: ToolExecutionContext,
    executionId: string
  ): Promise<void> {
    const validationFailures = context.toolCalls.filter(tc => 
      tc.status === 'error' && 
      tc.result &&
      this.toolRetryService.isValidationError(tc.result as string)
    )

    if (validationFailures.length > 0) {
      devLog.retry('Detected validation failures, attempting LLM retry')
      
      // Add error responses for all failed tools BEFORE retry - exact original behavior
      for (const tc of context.toolCalls) {
        if (tc.status === 'error') {
          const errorContent = `Error executing ${tc.name}: ${tc.result || 'Tool execution failed'}`
          
          this.externalDependencies.messageManager.safeAddMessage({
            role: 'tool',
            content: errorContent,
            tool_call_id: tc.id
          })
          
          devLog.retry('Added error response for failed tool before retry', {
            toolName: tc.name,
            toolId: tc.id
          })
        }
      }

      // Get current conversation history
      const conversationHistory = this.externalDependencies.messageManager.getMessages()
      
      // Execute retry with LLM
      const retryResult = await this.toolRetryService.executeRetryWithLLM(
        context.toolCalls,
        validationFailures.map(tc => ({ success: false, error: tc.result as string })),
        conversationHistory,
        this.externalDependencies.llmConfigManager.getActiveLLMConfig()!.id,
        context.abortSignal
      )

      if (retryResult.success && retryResult.updatedToolCalls) {
        devLog.retry('LLM provided retry tool calls, continuing execution')
        
        // Start new tool execution with retry calls - exact original behavior
        const retryAssistantMessageId = this.externalDependencies.messageManager.safeAddMessage({
          role: 'assistant',
          content: retryResult.retryResponse?.response || 'Retrying with corrected parameters...',
          tool_calls: retryResult.updatedToolCalls.map(call => ({
            id: call.id,
            name: call.name,
            parameters: call.parameters,
            status: 'pending' as const
          }))
        })

        // Execute retry recursively - exact original behavior
        await this.executeToolCalls(
          retryResult.updatedToolCalls,
          retryAssistantMessageId,
          context.currentUserMessage,
          context.abortSignal,
          context.retryCount + 1
        )
        return
      } else {
        // LLM didn't provide tool calls, treat as final response - exact original behavior
        this.externalDependencies.messageManager.safeAddMessage({
          role: 'assistant',
          content: retryResult.retryResponse?.response || "I apologize, but I'm having trouble with the tool parameters. Could you please rephrase your request?",
          tool_calls: []
        })
        return
      }
    } else {
      // No validation failures, proceed with normal flow - exact original behavior
      await this.handleSuccessfulToolExecution(context, executionId)
    }
  }

  /**
   * Build a complete conversation history by reading the store and then
   * patching in any assistant-with-tool_calls or tool-result messages that
   * were added via safeAddMessage but may not be visible yet because
   * Zustand batches state updates outside the React render cycle.
   */
  private buildFullConversation(
    currentToolCalls: ToolCall[],
    processedToolResults: ChatMessage[]
  ): ChatMessage[] {
    const storeMessages = this.externalDependencies.messageManager.getMessages()
    const full: ChatMessage[] = [...storeMessages]

    // Ensure the assistant message that triggered these tool calls is present
    const currentToolIds = new Set(currentToolCalls.map(tc => tc.id))
    const hasMatchingAssistant = full.some(m =>
      m.role === 'assistant' &&
      m.tool_calls?.some((tc: any) => currentToolIds.has(tc.id))
    )
    if (!hasMatchingAssistant) {
      full.push({
        role: 'assistant',
        content: '',
        tool_calls: currentToolCalls.map(tc => ({
          id: tc.id,
          name: tc.name,
          parameters: tc.parameters,
        } as any))
      })
    }

    // Append successful tool results not yet visible in the store
    for (const toolResult of processedToolResults) {
      const alreadyPresent = full.some(
        m => m.role === 'tool' && m.tool_call_id === toolResult.tool_call_id
      )
      if (!alreadyPresent) {
        full.push(toolResult)
      }
    }

    // Append error tool responses not yet visible in the store
    for (const tc of currentToolCalls.filter(t => t.status === 'error')) {
      const alreadyPresent = full.some(
        m => m.role === 'tool' && m.tool_call_id === tc.id
      )
      if (!alreadyPresent) {
        full.push({
          role: 'tool',
          content: `Error executing ${tc.name}: ${tc.result || 'Tool execution failed'}`,
          tool_call_id: tc.id
        })
      }
    }

    devLog.conversation('Built full conversation for LLM', {
      storeCount: storeMessages.length,
      fullCount: full.length,
      patchedMessages: full.length - storeMessages.length
    })

    return full
  }

  /**
   * Handle successful tool execution with iterative multi-round tool loop.
   * After processing tool results, sends them back to the LLM with tools ENABLED.
   * If the LLM requests more tools, executes them and loops. Stops when the LLM
   * returns a text response with no tool_calls, or when MAX_TOOL_ITERATIONS is reached.
   */
  private async handleSuccessfulToolExecution(
    context: ToolExecutionContext,
    executionId: string
  ): Promise<void> {
    let iteration = 0
    let currentToolCalls = context.toolCalls

    while (iteration < this.MAX_TOOL_ITERATIONS) {
      if (context.abortSignal?.aborted) {
        throw new Error('Tool execution was cancelled')
      }

      devLog.conversation('Tool iteration loop', { iteration, maxIterations: this.MAX_TOOL_ITERATIONS })

      // Step 1: Process the tool results from the current round.
      // This adds tool messages to the store via safeAddMessage, but Zustand
      // state updates are batched and NOT synchronously visible to getMessages().
      const processedResults = await this.processToolResults(currentToolCalls, context)

      if (!processedResults.hasValidResults && iteration === 0) {
        devLog.conversation('No valid tool results to send to LLM')
        this.externalDependencies.messageManager.safeAddMessage({
          role: 'assistant',
          content: "I attempted to use tools to help with your request, but didn't get useful results. Could you try rephrasing your question?",
          tool_calls: []
        })
        return
      }

      // Step 2: Build the full conversation by patching in any tool results
      // that the store may not reflect yet, then send to LLM with tools ENABLED.
      const llmConfigId = this.externalDependencies.llmConfigManager.getActiveLLMConfig()!.id
      const fullConversation = this.buildFullConversation(
        currentToolCalls,
        processedResults.toolResults
      )

      devLog.conversation('Sending tool results to LLM with tools enabled', {
        iteration,
        historyLength: fullConversation.length,
        processedCount: processedResults.processedCount
      })

      const llmResponse = await this.sendConversationToLLM(
        fullConversation,
        llmConfigId,
        false, // tools enabled
        context.abortSignal
      )

      if (!llmResponse.success) {
        devLog.error(DevLogCategory.API, 'LLM call failed during iteration', { iteration, error: llmResponse.error })
        this.externalDependencies.messageManager.safeAddMessage({
          role: 'assistant',
          content: "I've completed some tool operations but encountered difficulties continuing. The tool results should be visible above.",
          tool_calls: []
        })
        return
      }

      // Step 3: Check if LLM wants to call more tools
      const newToolCalls = llmResponse.toolCalls || []

      if (newToolCalls.length === 0) {
        // LLM is done -- show its text response
        devLog.conversation('LLM returned final text response (no more tool calls)', { iteration })
        this.externalDependencies.messageManager.safeAddMessage({
          role: 'assistant',
          content: llmResponse.response || 'I have processed your request using the available tools.',
          tool_calls: []
        })
        return
      }

      // Step 4: LLM wants more tools -- execute them
      iteration++
      devLog.toolExecution('LLM requested additional tools', {
        iteration,
        newToolCount: newToolCalls.length,
        toolNames: newToolCalls.map((tc: any) => tc.name || tc.function?.name)
      })

      // Normalize tool calls from the LLM response format
      const formattedNewToolCalls: ToolCall[] = newToolCalls.map((call: any) => ({
        id: call.id,
        name: call.name || call.function?.name,
        parameters: call.arguments || call.function?.arguments || call.parameters,
        status: 'pending' as const
      }))

      // Add the assistant message (with its tool_calls) to the store
      const newAssistantMessageId = this.externalDependencies.messageManager.safeAddMessage({
        role: 'assistant',
        content: llmResponse.response || '',
        tool_calls: formattedNewToolCalls
      })

      // Execute each new tool
      let allSucceeded = true
      for (let i = 0; i < formattedNewToolCalls.length; i++) {
        if (context.abortSignal?.aborted) {
          throw new Error('Tool execution was cancelled')
        }

        const toolCall = formattedNewToolCalls[i]
        try {
          const result = await this.executeSingleTool(toolCall, context)
          formattedNewToolCalls[i] = result.updatedToolCall

          this.updateToolExecutionStatus(
            result.updatedToolCall,
            newAssistantMessageId,
            result.success ? 'completed' : 'error',
            result.result
          )

          allSucceeded = allSucceeded && result.success
        } catch (error) {
          formattedNewToolCalls[i] = {
            ...toolCall,
            status: 'error' as const,
            result: error instanceof Error ? error.message : 'Tool execution failed'
          }
          this.updateToolExecutionStatus(
            formattedNewToolCalls[i],
            newAssistantMessageId,
            'error',
            error instanceof Error ? error.message : 'Tool execution failed'
          )
          allSucceeded = false
        }
      }

      // Update for next iteration -- processToolResults at the top of the loop
      // will handle adding these results, and buildFullConversation will patch
      // them in if the store hasn't caught up.
      currentToolCalls = formattedNewToolCalls
      context.toolCalls = formattedNewToolCalls
      context.assistantMessageId = newAssistantMessageId
    }

    // Safety cap reached
    devLog.error(DevLogCategory.TOOL_EXECUTION, 'Max tool iterations reached', {
      maxIterations: this.MAX_TOOL_ITERATIONS
    })

    // One final attempt to get a summary with tools disabled.
    // Use buildFullConversation to ensure all tool results are present.
    const fallbackConversation = this.buildFullConversation(
      currentToolCalls,
      [] // processToolResults already ran for these at the top of the last iteration
    )
    const llmConfigId = this.externalDependencies.llmConfigManager.getActiveLLMConfig()!.id

    const fallbackResponse = await this.sendConversationToLLM(
      fallbackConversation,
      llmConfigId,
      true, // exclude tools to force a text answer
      context.abortSignal
    )

    this.externalDependencies.messageManager.safeAddMessage({
      role: 'assistant',
      content: fallbackResponse.response || "I've reached the maximum number of tool operations. Here is what I've gathered so far from the tool results above.",
      tool_calls: []
    })
  }

  /**
   * Process tool results and update conversation
   */
  async processToolResults(
    toolCalls: ToolCall[],
    context: ToolExecutionContext
  ): Promise<{
    hasValidResults: boolean
    toolResults: ChatMessage[]
    processedCount: number
  }> {
    const toolResults: ChatMessage[] = []
    let processedCount = 0

    // Process successful tools only - exact original logic
    const successfulTools = toolCalls.filter(tc => tc.status === 'completed' && tc.result)
    
    for (const toolCall of successfulTools) {
      try {
        // Process result using ToolResultProcessor
        // Create proper ToolExecutionResult object with success property
        const toolExecutionResult = {
          success: toolCall.status === 'completed',
          result: toolCall.result,
          error: toolCall.status === 'error' ? toolCall.result : undefined
        }

        const processedResult = this.toolResultProcessor.processToolResult(
          toolExecutionResult,
          toolCall.name
        )
        
        console.log('DEBUG: Tool result processing -', toolCall.name, {
          toolCallStatus: toolCall.status,
          toolExecutionResultSuccess: toolExecutionResult.success,
          isValid: processedResult.isValid,
          contentLength: processedResult.content?.length,
          hasContent: processedResult.content?.trim().length > 0,
          content: processedResult.content?.substring(0, 100)
        })

        // DEBUG: Enhanced logging for tool result processing
        devLog.toolExecution('Processing tool result', {
          toolName: toolCall.name,
          toolCallStatus: toolCall.status,
          isValid: processedResult.isValid,
          contentLength: processedResult.content?.length || 0,
          hasContent: processedResult.content?.trim().length > 0,
          contentPreview: processedResult.content?.substring(0, 200)
        })

        if (processedResult.isValid && processedResult.content.trim() !== '') {
          // Add to conversation history
          const toolMessage: ChatMessage = {
            id: `tool_${toolCall.id}_${Date.now()}`,
            role: 'tool',
            content: processedResult.content,
            tool_call_id: toolCall.id,
            timestamp: new Date()
          }

          toolResults.push(toolMessage)

          // Add to main message store
          const messageId = this.externalDependencies.messageManager.safeAddMessage(toolMessage)

          // DEBUG: Confirm tool message was added
          devLog.toolExecution('Tool message added to conversation', {
            messageId,
            toolCallId: toolCall.id,
            contentLength: toolMessage.content.length
          })

          processedCount++
          devLog.toolExecution('Added tool response', {
            toolName: toolCall.name,
            toolCallId: toolCall.id
          })
        } else {
          // DEBUG: Log why tool result was rejected
          devLog.toolExecution('Tool result rejected', {
            toolName: toolCall.name,
            toolCallId: toolCall.id,
            isValid: processedResult.isValid,
            contentLength: processedResult.content?.length || 0,
            hasContent: processedResult.content?.trim().length > 0,
            reason: !processedResult.isValid ? 'Invalid result' : 'Empty content'
          })
        }
      } catch (error) {
        devLog.error(DevLogCategory.TOOL_EXECUTION, 'Error processing result for tool', {
          toolName: toolCall.name,
          error
        })
        this.externalDependencies.errorLogger.logError(
          `Failed to process result for tool ${toolCall.name}`,
          error as Error
        )
      }
    }

    // Add error responses for failed tools - exact original behavior
    const failedTools = toolCalls.filter(tc => 
      tc.status === 'error' || (tc.status === 'completed' && !tc.result)
    )

    for (const toolCall of failedTools) {
      let errorContent: string
      
      if (toolCall.status === 'error' && toolCall.result) {
        errorContent = `Error executing ${toolCall.name}: ${toolCall.result}`
      } else {
        errorContent = `Tool ${toolCall.name} did not complete successfully (status: ${toolCall.status})`
      }

      const errorMessage: ChatMessage = {
        id: `tool_error_${toolCall.id}_${Date.now()}`,
        role: 'tool',
        content: errorContent,
        tool_call_id: toolCall.id,
        timestamp: new Date()
      }

      this.externalDependencies.messageManager.safeAddMessage(errorMessage)
      devLog.toolExecution('Added error response for tool', {
        toolName: toolCall.name,
        toolId: toolCall.id,
        contentPreview: errorContent.substring(0, 50)
      })
    }

    return {
      hasValidResults: toolResults.length > 0,
      toolResults,
      processedCount
    }
  }

  /**
   * Send the current conversation to the LLM. Returns the full response
   * including any tool_calls the LLM may have requested.
   *
   * @param excludeTools - When true, tools are stripped so the LLM must give a
   *   text answer. Used only as a safety-cap fallback when MAX_TOOL_ITERATIONS
   *   is reached. Normal flow passes false so the LLM can request more tools.
   */
  async sendConversationToLLM(
    conversationHistory: ChatMessage[],
    llmConfigId: string,
    excludeTools: boolean,
    abortSignal?: AbortSignal
  ): Promise<{
    success: boolean
    response?: string
    toolCalls?: any[]
    error?: string
  }> {
    try {
      const apiConversation = this.conversationHistoryService.prepareForLLMApi(
        conversationHistory,
        false // always include tool messages in the history
      )

      devLog.api('Sending conversation to LLM', {
        messageCount: apiConversation.length,
        excludeTools
      })

      let apiCallAttempts = 0
      let llmResponse: any

      while (apiCallAttempts < this.MAX_RETRY_ATTEMPTS) {
        apiCallAttempts++

        try {
          if (abortSignal?.aborted) {
            throw new Error('Tool execution was cancelled')
          }

          devLog.api('LLM API call attempt', { attempt: apiCallAttempts, excludeTools })

          llmResponse = await this.externalDependencies.api.chat({
            message: "",
            conversation_history: apiConversation,
            llm_config_id: llmConfigId,
            exclude_tools: excludeTools
          }, abortSignal)

          // When tools are excluded, strip any tool_calls the LLM shouldn't have returned
          if (excludeTools && llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
            devLog.error(DevLogCategory.API, 'LLM returned tool calls despite exclude_tools=true', {
              toolCalls: llmResponse.tool_calls
            })
            llmResponse.tool_calls = []
            if (!llmResponse.response || llmResponse.response.trim() === '') {
              llmResponse.response = "I've gathered the information you requested using tools, but I'm having difficulty generating a final response. The tool results should be visible above."
            }
          }

          break

        } catch (apiError) {
          devLog.error(DevLogCategory.API, 'API call attempt failed', { attempt: apiCallAttempts, error: apiError })

          const errorMessage = apiError instanceof Error ? apiError.message : String(apiError)
          const isLLMFormatError =
            (errorMessage.includes('function.name') && errorMessage.includes('null')) ||
            errorMessage.includes('Invalid type') ||
            errorMessage.includes('BadRequestError') ||
            errorMessage.includes('litellm') ||
            (errorMessage.includes('400') && errorMessage.includes('messages'))

          if (isLLMFormatError) {
            devLog.error(DevLogCategory.API, 'LLM API format error detected', { error: errorMessage })
            return {
              success: true,
              response: "I executed the requested tools but encountered a conversation format issue. The tool results should be visible above.",
              toolCalls: []
            }
          }

          if (apiCallAttempts >= this.MAX_RETRY_ATTEMPTS) {
            throw apiError
          }

          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      return {
        success: true,
        response: llmResponse.response,
        toolCalls: llmResponse.tool_calls || []
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      devLog.error(DevLogCategory.API, 'Failed to send conversation to LLM', error)

      if (!abortSignal?.aborted) {
        this.externalDependencies.errorLogger.logError(
          'Failed to send conversation to LLM',
          error as Error
        )
      }

      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * Update UI state during tool execution - exact original behavior
   */
  updateToolExecutionStatus(
    toolCall: ToolCall,
    assistantMessageId: string,
    status: 'pending' | 'completed' | 'error',
    result?: any
  ): void {
    try {
      // Update the tool call status in the assistant message
      const updatedToolCall = { ...toolCall, status, result }
      
      this.externalDependencies.messageManager.safeUpdateMessage(assistantMessageId, {
        tool_calls: this.currentContext?.toolCalls || [updatedToolCall]
      })
      
    } catch (error) {
      devLog.error(DevLogCategory.TOOL_EXECUTION, 'Error updating tool execution status', error)
      this.externalDependencies.errorLogger.logError(
        'Failed to update tool execution status',
        error as Error
      )
    }
  }

  /**
   * Handle tool execution errors and determine recovery strategy
   */
  async handleToolExecutionError(
    error: ServiceError,
    context: ToolExecutionContext
  ): Promise<{
    canRecover: boolean
    recoveryAction?: 'retry' | 'skip' | 'abort'
    updatedContext?: ToolExecutionContext
  }> {
    devLog.error(DevLogCategory.ERROR_BOUNDARY, 'Tool execution error', error)
    
    // Log error with context
    this.externalDependencies.errorLogger.logError(
      `Tool execution error in service: ${error.service}`,
      error
    )

    // Determine recovery strategy based on error type
    if (error.recoverable) {
      // Check if we can retry
      const retryContext = this.toolRetryService.createRetryContext(
        context.retryCount,
        this.MAX_RETRY_ATTEMPTS
      )

      if (!this.toolRetryService.hasExceededMaxRetries(retryContext)) {
        return {
          canRecover: true,
          recoveryAction: 'retry',
          updatedContext: {
            ...context,
            retryCount: context.retryCount + 1
          }
        }
      }
    }

    // Cannot recover
    return {
      canRecover: false,
      recoveryAction: 'abort'
    }
  }

  /**
   * Validate tool calls before execution
   */
  validateToolCalls(toolCalls: ToolCall[]): {
    isValid: boolean
    validToolCalls: ToolCall[]
    invalidToolCalls: Array<{ toolCall: ToolCall; reason: string }>
  } {
    const validToolCalls: ToolCall[] = []
    const invalidToolCalls: Array<{ toolCall: ToolCall; reason: string }> = []

    for (const toolCall of toolCalls) {
      // Validate required fields
      if (!toolCall.id) {
        invalidToolCalls.push({ toolCall, reason: 'Missing tool call ID' })
        continue
      }

      if (!toolCall.name) {
        invalidToolCalls.push({ toolCall, reason: 'Missing tool name' })
        continue
      }

      if (toolCall.parameters === undefined || toolCall.parameters === null) {
        invalidToolCalls.push({ toolCall, reason: 'Missing parameters' })
        continue
      }

      // Validate tool name format - allow letters, numbers, underscores, and hyphens
      if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(toolCall.name)) {
        invalidToolCalls.push({ toolCall, reason: 'Invalid tool name format' })
        continue
      }

      validToolCalls.push(toolCall)
    }

    return {
      isValid: invalidToolCalls.length === 0,
      validToolCalls,
      invalidToolCalls
    }
  }

  /**
   * Get execution metrics for performance monitoring
   */
  getExecutionMetrics(context: ToolExecutionContext): ExecutionMetrics {
    // Find metrics for this context
    const contextMetrics = Array.from(this.executionMetrics.values())
      .find(m => m.toolCount === context.toolCalls.length && m.retryCount === context.retryCount)

    if (contextMetrics) {
      return { ...contextMetrics }
    }

    // Return current metrics if not found
    return {
      startTime: Date.now(),
      toolCount: context.toolCalls.length,
      retryCount: context.retryCount,
      cacheHitRate: this.serverMappingService.getCacheStats().hitRate,
      memoryBefore: this.getMemoryUsage(),
      memoryAfter: this.getMemoryUsage(),
      success: false
    }
  }

  /**
   * Cancel all ongoing tool executions
   */
  cancelExecution(reason: string): void {
    devLog.general('Cancelling tool execution', { reason })
    
    if (this.currentAbortController) {
      this.currentAbortController.abort()
    }

    this.isCurrentlyExecuting = false
    this.currentContext = null
    this.currentAbortController = null
  }

  /**
   * Check if service is currently executing tools
   */
  isExecuting(): boolean {
    return this.isCurrentlyExecuting
  }

  /**
   * Get current execution context
   */
  getCurrentContext(): ToolExecutionContext | null {
    return this.currentContext ? { ...this.currentContext } : null
  }

  /**
   * Cleanup resources after execution
   */
  cleanup(): void {
    devLog.memory('Cleaning up ToolExecutionService resources')
    
    this.cancelExecution('Service cleanup')
    this.executionMetrics.clear()
  }

  /**
   * Get memory usage if available
   */
  private getMemoryUsage(): number {
    const memory = (performance as any).memory
    return memory ? memory.usedJSHeapSize : 0
  }

  /**
   * Setup memory integration with MemoryManager
   */
  private setupMemoryIntegration(): void {
    // Register cleanup task with MemoryManager
    this.externalDependencies.memoryManager.registerCleanupTask({
      priority: 'high',
      description: 'ToolExecutionService cleanup',
      execute: () => this.cleanup()
    })
  }

  /**
   * Configuration management
   */
  configure(newConfiguration: ServiceConfiguration): void {
    this.configuration = { ...this.configuration, ...newConfiguration }
  }

  /**
   * Reset service state
   */
  reset(): void {
    devLog.general('ToolExecutionService reset')
    this.cleanup()
  }
}