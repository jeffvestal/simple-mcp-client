/**
 * Tool Retry Service
 * 
 * Handles retry logic, validation error detection, and LLM-powered retries
 * Extracted from the original ChatInterfaceSimple.tsx retry logic
 */

import type { IToolRetryService } from './interfaces/IToolRetryService'
import type { 
  ToolCall, 
  ToolExecutionResult, 
  RetryContext, 
  ValidationError,
  ChatMessage,
  ServiceConfiguration
} from './types/ToolExecutionTypes'
import { TOOL_EXECUTION_CONSTANTS } from './types/ToolExecutionTypes'
import type { ExternalDependencies } from './types/ServiceDependencies'
import { devLog, DevLogCategory } from '../../lib/developmentLogger'

export class ToolRetryService implements IToolRetryService {
  // Use exact same limit as original
  private readonly MAX_RETRY_ATTEMPTS = TOOL_EXECUTION_CONSTANTS.MAX_RETRY_ATTEMPTS

  // Statistics tracking
  private retryStats = {
    totalRetries: 0,
    successfulRetries: 0,
    failedRetries: 0,
    errorCounts: new Map<string, number>()
  }

  constructor(
    private externalDependencies: ExternalDependencies,
    private configuration: ServiceConfiguration
  ) {}

  /**
   * Check if an error is a validation error that can be retried
   * Exact replication of original isValidationError logic
   */
  isValidationError(error: string): boolean {
    const validationKeywords = [
      'invalid',
      'validation',
      'parameter',
      'required',
      'missing',
      'type',
      'format',
      'MCP Error -32602',
      'Invalid params'
    ]
    
    const errorLower = error.toLowerCase()
    return validationKeywords.some(keyword => errorLower.includes(keyword.toLowerCase()))
  }

  /**
   * Determine if a tool execution should be retried
   */
  shouldRetry(
    toolResult: ToolExecutionResult,
    retryContext: RetryContext
  ): {
    shouldRetry: boolean
    reason: string
    suggestedDelay?: number
  } {
    // Check if max retries exceeded
    if (this.hasExceededMaxRetries(retryContext)) {
      return {
        shouldRetry: false,
        reason: `Maximum retry attempts (${this.MAX_RETRY_ATTEMPTS}) exceeded`
      }
    }

    // Don't retry successful results
    if (toolResult.success) {
      return {
        shouldRetry: false,
        reason: 'Tool execution was successful'
      }
    }

    // Check for retryable error types
    if (toolResult.error) {
      // Validation errors are always retryable
      if (this.isValidationError(toolResult.error)) {
        return {
          shouldRetry: true,
          reason: 'Validation error detected - retryable with parameter correction',
          suggestedDelay: 0 // No delay for validation errors
        }
      }

      // Network/timeout errors are retryable with delay
      const networkKeywords = ['network', 'timeout', 'connection', 'unavailable', 'temporary']
      const errorLower = toolResult.error.toLowerCase()
      if (networkKeywords.some(keyword => errorLower.includes(keyword))) {
        return {
          shouldRetry: true,
          reason: 'Network/timeout error detected - retryable with delay',
          suggestedDelay: Math.min(1000 * Math.pow(2, retryContext.retryCount), 8000) // Exponential backoff
        }
      }

      // Rate limit errors are retryable with longer delay
      if (errorLower.includes('rate limit') || errorLower.includes('too many requests')) {
        return {
          shouldRetry: true,
          reason: 'Rate limit error detected - retryable with extended delay',
          suggestedDelay: 5000 + (retryContext.retryCount * 2000) // 5s + increasing delay
        }
      }

      // Server errors (5xx) are retryable
      if (errorLower.includes('server error') || errorLower.includes('internal error')) {
        return {
          shouldRetry: true,
          reason: 'Server error detected - retryable with delay',
          suggestedDelay: 2000 * (retryContext.retryCount + 1) // Increasing delay
        }
      }
    }

    // Default: don't retry unknown errors
    return {
      shouldRetry: false,
      reason: 'Unknown error type - not retryable'
    }
  }

  /**
   * Execute retry logic with LLM parameter correction
   * Implements the complex retry logic from the original function
   */
  async executeRetryWithLLM(
    toolCalls: ToolCall[],
    failedResults: ToolExecutionResult[],
    conversationHistory: ChatMessage[],
    llmConfigId: string,
    abortSignal?: AbortSignal
  ): Promise<{
    success: boolean
    updatedToolCalls?: ToolCall[]
    retryResponse?: any
    errors: string[]
  }> {
    const errors: string[] = []

    try {
      devLog.retry('Executing retry with LLM parameter correction')
      this.retryStats.totalRetries++

      // Check for cancellation
      if (abortSignal?.aborted) {
        throw new Error('Tool execution was cancelled')
      }

      // Filter for validation failures only
      const validationFailures = failedResults.filter(result => 
        result.error && this.isValidationError(result.error)
      )

      if (validationFailures.length === 0) {
        return {
          success: false,
          errors: ['No validation failures found to retry with LLM']
        }
      }

      devLog.retry('Detected validation failures, asking LLM to retry', {
        failures: validationFailures.map(f => f.error).join(', ')
      })

      // Generate retry conversation history
      const retryHistory = this.generateRetryConversationHistory(
        conversationHistory,
        toolCalls,
        failedResults
      )

      devLog.retry('Using messages for retry conversation history', {
        messageCount: retryHistory.length
      })

      // Ask LLM to retry with tool calling enabled
      const retryResponse = await this.externalDependencies.api.chat({
        message: '',
        conversation_history: retryHistory,
        llm_config_id: llmConfigId
      }, abortSignal).catch(error => {
        if (!abortSignal?.aborted) {
          devLog.error(DevLogCategory.RETRY_LOGIC, 'Failed to retry with tools', error)
          this.externalDependencies.errorLogger.logError(
            'Failed to retry with tools',
            error as Error
          )
        }
        throw error
      })

      // Check if LLM provided retry tool calls
      if (retryResponse.tool_calls && retryResponse.tool_calls.length > 0) {
        devLog.retry('LLM provided retry tool calls, processing')

        // Convert LLM tool calls to our format
        const updatedToolCalls: ToolCall[] = retryResponse.tool_calls.map((call: any) => ({
          id: call.id,
          name: call.name,
          parameters: call.arguments,
          status: 'pending' as const
        }))

        this.retryStats.successfulRetries++

        return {
          success: true,
          updatedToolCalls,
          retryResponse,
          errors: []
        }
      } else {
        // LLM didn't provide tool calls
        const errorMsg = "LLM didn't provide tool calls for retry"
        errors.push(errorMsg)
        this.retryStats.failedRetries++

        return {
          success: false,
          retryResponse,
          errors
        }
      }

    } catch (error) {
      const errorMsg = `Failed to execute retry with LLM: ${error instanceof Error ? error.message : 'Unknown error'}`
      devLog.error(DevLogCategory.RETRY_LOGIC, 'Failed to retry with LLM', error)
      
      this.retryStats.failedRetries++
      errors.push(errorMsg)

      if (!abortSignal?.aborted) {
        this.externalDependencies.errorLogger.logError(
          'Failed to execute retry with LLM',
          error as Error
        )
      }

      return {
        success: false,
        errors
      }
    }
  }

  /**
   * Create retry context for tracking retry attempts
   */
  createRetryContext(
    initialRetryCount: number = 0,
    maxRetries: number = this.MAX_RETRY_ATTEMPTS,
    lastError?: string,
    originalParameters?: any
  ): RetryContext {
    return {
      retryCount: initialRetryCount,
      maxRetries,
      lastError,
      originalParameters
    }
  }

  /**
   * Update retry context after an attempt
   */
  updateRetryContext(
    context: RetryContext,
    result: ToolExecutionResult
  ): RetryContext {
    const updatedContext: RetryContext = {
      ...context,
      retryCount: context.retryCount + 1
    }

    if (!result.success && result.error) {
      updatedContext.lastError = result.error
      
      // Track error frequency
      const currentCount = this.retryStats.errorCounts.get(result.error) || 0
      this.retryStats.errorCounts.set(result.error, currentCount + 1)
    }

    return updatedContext
  }

  /**
   * Check if maximum retry attempts have been reached
   */
  hasExceededMaxRetries(retryContext: RetryContext): boolean {
    return retryContext.retryCount >= retryContext.maxRetries
  }

  /**
   * Generate retry conversation history for LLM
   * Formats the conversation for LLM to understand the retry context
   */
  generateRetryConversationHistory(
    originalHistory: ChatMessage[],
    toolCalls: ToolCall[],
    failedResults: ToolExecutionResult[]
  ): ChatMessage[] {
    try {
      // Clean the original history to remove internal execution data
      const cleanedHistory = originalHistory.map(msg => {
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          return {
            ...msg,
            tool_calls: msg.tool_calls.map(tc => ({
              id: tc.id,
              name: tc.name,
              parameters: tc.parameters
            }))
          }
        }
        return msg
      })

      // Create error description for failed tools
      const errorDescriptions = failedResults.map(result => {
        const toolCall = toolCalls.find(tc => tc.id === result.error)
        const toolName = toolCall?.name || 'unknown_tool'
        return `Tool "${toolName}" failed with validation error: ${result.error}. Please retry this tool call with the correct parameters.`
      }).join('\n\n')

      // Add retry context message
      const retryContextMessage: ChatMessage = {
        id: `retry-context-${Date.now()}`,
        role: 'user',
        content: `The previous tool calls failed with validation errors:\n\n${errorDescriptions}\n\nPlease retry the failed tool calls with the correct parameters based on the error messages.`,
        timestamp: new Date()
      }

      return [...cleanedHistory, retryContextMessage]

    } catch (error) {
      devLog.error(DevLogCategory.RETRY_LOGIC, 'Error generating retry conversation history', error)
      this.externalDependencies.errorLogger.logError(
        'Failed to generate retry conversation history',
        error as Error
      )
      
      // Return simplified history on error
      return [...originalHistory, {
        id: `retry-fallback-${Date.now()}`,
        role: 'user',
        content: 'Please retry the failed tool calls with corrected parameters.',
        timestamp: new Date()
      }]
    }
  }

  /**
   * Parse validation error and suggest fixes
   */
  parseValidationError(error: string): ValidationError {
    const isValidation = this.isValidationError(error)
    
    let suggestedFix: string | undefined

    if (isValidation) {
      const errorLower = error.toLowerCase()
      
      // Common parameter fixes
      if (errorLower.includes('index_name') && errorLower.includes('indices')) {
        suggestedFix = 'Convert index_name parameter to indices array format'
      } else if (errorLower.includes('missing') && errorLower.includes('required')) {
        const match = error.match(/missing.*?parameter[:\s]+([a-zA-Z_]+)/i)
        if (match) {
          suggestedFix = `Add required parameter: ${match[1]}`
        }
      } else if (errorLower.includes('invalid type')) {
        suggestedFix = 'Check parameter types and format'
      } else if (errorLower.includes('format')) {
        suggestedFix = 'Verify parameter format requirements'
      }
    }

    return {
      isValidationError: isValidation,
      errorMessage: error,
      suggestedFix
    }
  }

  /**
   * Apply automatic parameter fixes for common validation errors
   */
  applyAutomaticFixes(
    toolCall: ToolCall,
    validationError: ValidationError
  ): ToolCall | null {
    if (!validationError.isValidationError) {
      return null
    }

    try {
      const errorLower = validationError.errorMessage.toLowerCase()
      let fixedParameters = { ...toolCall.parameters }
      let wasFixed = false

      // Add missing required parameters with intelligent defaults
      const missingParameters = this.extractMissingParameters(validationError.errorMessage)
      for (const missingParam of missingParameters) {
        if (!fixedParameters.hasOwnProperty(missingParam)) {
          const defaultValue = this.getDefaultParameterValue(missingParam, toolCall.name, fixedParameters)
          if (defaultValue !== null) {
            fixedParameters[missingParam] = defaultValue
            wasFixed = true
            devLog.retry('Applied automatic fix: added missing required parameter', {
              parameter: missingParam,
              defaultValue: defaultValue,
              toolName: toolCall.name
            })
          }
        }
      }

      // Fix index_name -> indices conversion
      if (errorLower.includes('index_name') && errorLower.includes('indices')) {
        if (fixedParameters.index_name) {
          fixedParameters.indices = Array.isArray(fixedParameters.index_name)
            ? fixedParameters.index_name
            : [fixedParameters.index_name]
          delete fixedParameters.index_name
          wasFixed = true
          devLog.retry('Applied automatic fix: index_name -> indices conversion')
        }
      }

      // Fix string numbers to actual numbers
      if (errorLower.includes('expected number') || errorLower.includes('invalid type')) {
        for (const [key, value] of Object.entries(fixedParameters)) {
          if (typeof value === 'string' && !isNaN(Number(value))) {
            fixedParameters[key] = Number(value)
            wasFixed = true
            devLog.retry('Applied automatic fix: converted string to number', {
              key,
              originalValue: value
            })
          }
        }
      }

      // Fix boolean strings
      if (errorLower.includes('expected boolean') || errorLower.includes('boolean')) {
        for (const [key, value] of Object.entries(fixedParameters)) {
          if (value === 'true' || value === 'false') {
            fixedParameters[key] = value === 'true'
            wasFixed = true
            devLog.retry('Applied automatic fix: converted string to boolean', {
              key,
              originalValue: value
            })
          }
        }
      }

      if (wasFixed) {
        return {
          ...toolCall,
          parameters: fixedParameters
        }
      }

      return null

    } catch (error) {
      devLog.error(DevLogCategory.RETRY_LOGIC, 'Error applying automatic fixes', error)
      this.externalDependencies.errorLogger.logError(
        'Failed to apply automatic parameter fixes',
        error as Error
      )
      return null
    }
  }

  /**
   * Extract missing parameter names from MCP error messages
   */
  private extractMissingParameters(errorMessage: string): string[] {
    const missingParams: string[] = []

    try {
      // Try to parse JSON error structure first
      if (errorMessage.includes('[{') && errorMessage.includes('}]')) {
        const jsonMatch = errorMessage.match(/\[({.*?})\]/s)
        if (jsonMatch) {
          try {
            const errorObj = JSON.parse(jsonMatch[1])
            if (errorObj.path && Array.isArray(errorObj.path) && errorObj.path.length > 0) {
              missingParams.push(errorObj.path[0])
            }
          } catch (parseError) {
            devLog.retry('Failed to parse JSON error structure, falling back to regex')
          }
        }
      }

      // Fallback to regex patterns for common error formats
      if (missingParams.length === 0) {
        const patterns = [
          /path[:\s]*\[\s*"([^"]+)"\s*\]/gi,
          /parameter[:\s]*"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*.*required/gi,
          /missing.*?parameter[:\s]*"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi,
          /required.*?field[:\s]*"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi,
          /"([a-zA-Z_][a-zA-Z0-9_]*)"[:\s]*.*required/gi
        ]

        for (const pattern of patterns) {
          let match
          while ((match = pattern.exec(errorMessage)) !== null) {
            const param = match[1]
            if (param && !missingParams.includes(param)) {
              missingParams.push(param)
            }
          }
        }
      }

      devLog.retry('Extracted missing parameters from error', {
        errorMessage: errorMessage.substring(0, 200),
        missingParams
      })

    } catch (error) {
      devLog.error(DevLogCategory.RETRY_LOGIC, 'Error extracting missing parameters', error)
    }

    return missingParams
  }

  /**
   * Get intelligent default values for missing required parameters
   */
  private getDefaultParameterValue(
    parameterName: string,
    toolName: string,
    existingParameters: any
  ): any {
    // Tool-specific defaults
    const toolSpecificDefaults: Record<string, Record<string, any>> = {
      'utilities_research_asset-news': {
        'time_period': '1w', // 1 week default for news research
        'symbol': existingParameters.symbol || 'SPY', // Use existing symbol if available, fallback to SPY
        'limit': 10,
        'offset': 0
      },
      'utilities_search_customer-lookup': {
        'limit': 20,
        'offset': 0,
        'include_inactive': false
      }
    }

    // Parameter name-based defaults (universal across tools)
    const universalDefaults: Record<string, any> = {
      // Time-related parameters
      'time_period': '1w',
      'period': '1w',
      'timeframe': '1w',
      'duration': '7d',
      'start_date': new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 week ago
      'end_date': new Date().toISOString().split('T')[0], // today

      // Pagination parameters
      'limit': 10,
      'page_size': 10,
      'max_results': 10,
      'count': 10,
      'offset': 0,
      'page': 1,

      // Boolean flags
      'include_inactive': false,
      'include_deleted': false,
      'active_only': true,
      'detailed': false,
      'verbose': false,

      // String parameters with context
      'format': 'json',
      'sort': 'desc',
      'order': 'desc',
      'type': 'all',
      'status': 'active',

      // Numeric parameters
      'timeout': 30,
      'retry_count': 3,
      'max_depth': 5
    }

    // Try tool-specific default first
    if (toolSpecificDefaults[toolName] && toolSpecificDefaults[toolName][parameterName]) {
      const defaultValue = toolSpecificDefaults[toolName][parameterName]
      devLog.retry('Using tool-specific default value', {
        toolName,
        parameter: parameterName,
        defaultValue
      })
      return defaultValue
    }

    // Try universal default
    if (universalDefaults[parameterName]) {
      const defaultValue = universalDefaults[parameterName]
      devLog.retry('Using universal default value', {
        parameter: parameterName,
        defaultValue
      })
      return defaultValue
    }

    // Context-based inference for symbol/ticker parameters
    if ((parameterName === 'symbol' || parameterName === 'ticker') && !existingParameters[parameterName]) {
      // Look for symbol-like values in other parameters
      for (const [key, value] of Object.entries(existingParameters)) {
        if (typeof value === 'string' && value.length <= 5 && /^[A-Z]+$/.test(value)) {
          devLog.retry('Inferred symbol from existing parameters', {
            parameter: parameterName,
            inferredValue: value,
            sourceParameter: key
          })
          return value
        }
      }
      // Default fallback for symbols
      devLog.retry('Using default symbol fallback', {
        parameter: parameterName,
        defaultValue: 'SPY'
      })
      return 'SPY'
    }

    // No suitable default found
    devLog.retry('No suitable default found for parameter', {
      parameter: parameterName,
      toolName
    })
    return null
  }

  /**
   * Get retry statistics
   */
  getRetryStats(): {
    totalRetries: number
    successfulRetries: number
    failedRetries: number
    retrySuccessRate: number
    commonErrors: Array<{ error: string; count: number }>
  } {
    const totalRetries = this.retryStats.totalRetries
    const retrySuccessRate = totalRetries > 0 
      ? this.retryStats.successfulRetries / totalRetries 
      : 0

    // Get most common errors
    const commonErrors = Array.from(this.retryStats.errorCounts.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10) // Top 10 most common errors

    return {
      totalRetries: this.retryStats.totalRetries,
      successfulRetries: this.retryStats.successfulRetries,
      failedRetries: this.retryStats.failedRetries,
      retrySuccessRate,
      commonErrors
    }
  }

  /**
   * Reset retry statistics
   */
  resetStats(): void {
    devLog.retry('Resetting retry statistics')
    this.retryStats = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      errorCounts: new Map()
    }
  }

  /**
   * Get detailed retry summary for debugging
   */
  getRetrySummary(): string {
    const stats = this.getRetryStats()
    const topErrors = stats.commonErrors.slice(0, 3)
    
    return `Retry Summary:
- Total retries: ${stats.totalRetries}
- Success rate: ${(stats.retrySuccessRate * 100).toFixed(1)}%
- Top errors: ${topErrors.map(e => `${e.error.substring(0, 30)}... (${e.count}x)`).join(', ') || 'None'}`
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
    devLog.general('ToolRetryService reset')
    this.resetStats()
  }
}