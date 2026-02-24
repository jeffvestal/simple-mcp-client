/**
 * Conversation History Service
 * 
 * Handles conversation history validation, cleaning, and management
 * Extracted from the original ChatInterfaceSimple.tsx validation logic
 */

import type { IConversationHistoryService } from './interfaces/IConversationHistoryService'
import type { 
  ChatMessage, 
  ConversationHistory,
  ServiceConfiguration
} from './types/ToolExecutionTypes'
import { TOOL_EXECUTION_CONSTANTS } from './types/ToolExecutionTypes'
import type { ExternalDependencies } from './types/ServiceDependencies'
import { devLog, DevLogCategory } from '../../lib/developmentLogger'

export class ConversationHistoryService implements IConversationHistoryService {
  // Use exact same limit as original
  private readonly MAX_CONVERSATION_HISTORY = TOOL_EXECUTION_CONSTANTS.MAX_CONVERSATION_HISTORY

  constructor(
    private externalDependencies: ExternalDependencies,
    private configuration: ServiceConfiguration
  ) {}

  /**
   * Validate and clean conversation history for OpenAI API compliance
   * Exact replication of original validateAndCleanConversationHistory logic
   */
  validateAndCleanHistory(messages: ChatMessage[]): ChatMessage[] {
    devLog.validation('Starting validation', { messageCount: messages.length })
    const cleanedHistory: ChatMessage[] = []
    let lastAssistantToolCalls: any[] | null = null
    
    for (const msg of messages) {
      if (msg.role === 'user') {
        // User messages are always valid
        devLog.validation('Keeping user message')
        cleanedHistory.push(msg)
        lastAssistantToolCalls = null // Reset tool call tracking
      } else if (msg.role === 'assistant') {
        // Assistant messages are always valid
        devLog.validation('Keeping assistant message', {
          toolCallCount: msg.tool_calls?.length || 0
        })
        cleanedHistory.push(msg)
        // Track if this assistant message has tool calls
        lastAssistantToolCalls = msg.tool_calls && msg.tool_calls.length > 0 ? msg.tool_calls : null
        if (lastAssistantToolCalls) {
          devLog.validation('Tracking tool calls for validation', {
            toolCallIds: lastAssistantToolCalls.map((tc: any) => tc.id)
          })
        }
      } else if (msg.role === 'tool') {
        // Tool messages need validation against last assistant tool calls
        if (lastAssistantToolCalls && msg.tool_call_id) {
          const matchingToolCall = lastAssistantToolCalls.find((tc: any) => tc.id === msg.tool_call_id)
          if (matchingToolCall) {
            // Valid tool message - include it
            devLog.validation('Keeping tool message, matches tool_call_id', {
              toolCallId: msg.tool_call_id
            })
            cleanedHistory.push(msg)
            // Remove this tool call from tracking to prevent duplicates
            lastAssistantToolCalls = lastAssistantToolCalls.filter((tc: any) => tc.id !== msg.tool_call_id)
          } else {
            // Orphaned tool message - exclude it
            devLog.validation('Excluding orphaned tool message', {
              toolCallId: msg.tool_call_id
            })
            this.externalDependencies.errorLogger.logWarning(
              `Orphaned tool message excluded: tool_call_id ${msg.tool_call_id} has no matching assistant tool call`
            )
          }
        } else {
          // Tool message without proper context - exclude it
          devLog.validation('Excluding tool message without context')
          this.externalDependencies.errorLogger.logWarning(
            'Tool message excluded: no tool_call_id or no preceding assistant tool calls'
          )
        }
      } else {
        // Other message types (if any) - include them
        cleanedHistory.push(msg)
        lastAssistantToolCalls = null // Reset tool call tracking
      }
    }
    
    devLog.validation('Finished validation', {
      finalMessageCount: cleanedHistory.length
    })
    return cleanedHistory
  }

  /**
   * Limit conversation history to prevent memory growth
   * Exact replication of original limitConversationHistory logic
   */
  limitConversationHistory(messages: ChatMessage[]): ChatMessage[] {
    if (messages.length <= this.MAX_CONVERSATION_HISTORY) {
      return messages
    }
    
    // Keep the most recent messages, but ensure we maintain conversation context
    // Always keep user-assistant pairs together
    const limitedMessages = messages.slice(-this.MAX_CONVERSATION_HISTORY)
    
    // If we cut off in the middle of a conversation, try to start from a user message
    const firstUserIndex = limitedMessages.findIndex(msg => msg.role === 'user')
    
    if (firstUserIndex > 0) {
      // We cut off in the middle, remove orphaned messages at the beginning
      devLog.conversation('Trimming orphaned messages from conversation start', {
        orphanedCount: firstUserIndex
      })
      return limitedMessages.slice(firstUserIndex)
    }
    
    return limitedMessages
  }

  /**
   * Check if conversation history is valid for tool execution
   */
  validateHistoryForToolExecution(messages: ChatMessage[]): ConversationHistory {
    const warnings: string[] = []
    
    try {
      // Apply full validation pipeline
      const cleanedMessages = this.validateAndCleanHistory(messages)
      const limitedMessages = this.limitConversationHistory(cleanedMessages)
      
      // Check for common issues
      const stats = this.getConversationStats(limitedMessages)
      
      if (stats.orphanedToolMessages > 0) {
        warnings.push(`Found ${stats.orphanedToolMessages} orphaned tool messages`)
      }
      
      if (stats.toolCalls > stats.toolMessages) {
        warnings.push(`Missing tool responses: ${stats.toolCalls - stats.toolMessages} tool calls without responses`)
      }
      
      if (limitedMessages.length === 0) {
        warnings.push('Empty conversation history')
        return {
          messages: [],
          isValid: false,
          warnings: ['Empty conversation history']
        }
      }
      
      // Check conversation flow
      const flowValidatedMessages = this.ensureConversationFlow(limitedMessages)
      const finalWarnings = warnings.concat(
        flowValidatedMessages.length !== limitedMessages.length ? 
        ['Conversation flow adjusted'] : []
      )
      
      return {
        messages: flowValidatedMessages,
        isValid: finalWarnings.length === 0,
        warnings: finalWarnings
      }
      
    } catch (error) {
      this.externalDependencies.errorLogger.logError(
        'Failed to validate conversation history',
        error as Error
      )
      
      return {
        messages: [],
        isValid: false,
        warnings: ['Validation failed due to error']
      }
    }
  }

  /**
   * Clean orphaned tool messages
   */
  cleanOrphanedToolMessages(messages: ChatMessage[]): {
    cleanedMessages: ChatMessage[]
    removedCount: number
    warnings: string[]
  } {
    const warnings: string[] = []
    const cleanedMessages: ChatMessage[] = []
    let removedCount = 0
    let lastAssistantToolCalls: any[] | null = null
    
    for (const msg of messages) {
      if (msg.role === 'assistant') {
        cleanedMessages.push(msg)
        lastAssistantToolCalls = msg.tool_calls && msg.tool_calls.length > 0 ? msg.tool_calls : null
      } else if (msg.role === 'tool') {
        if (lastAssistantToolCalls && msg.tool_call_id) {
          const matchingToolCall = lastAssistantToolCalls.find((tc: any) => tc.id === msg.tool_call_id)
          if (matchingToolCall) {
            cleanedMessages.push(msg)
            // Remove this tool call from tracking
            lastAssistantToolCalls = lastAssistantToolCalls.filter((tc: any) => tc.id !== msg.tool_call_id)
          } else {
            removedCount++
            warnings.push(`Removed orphaned tool message: tool_call_id ${msg.tool_call_id}`)
          }
        } else {
          removedCount++
          warnings.push('Removed tool message without proper context')
        }
      } else {
        cleanedMessages.push(msg)
        if (msg.role === 'user') {
          lastAssistantToolCalls = null // Reset on user message
        }
      }
    }
    
    return {
      cleanedMessages,
      removedCount,
      warnings
    }
  }

  /**
   * Ensure conversation starts with user message and maintains proper flow
   * Implements the logic to maintain user-assistant conversation flow
   */
  ensureConversationFlow(messages: ChatMessage[]): ChatMessage[] {
    if (messages.length === 0) {
      return messages
    }
    
    // Find first user message index
    const firstUserIndex = messages.findIndex(msg => msg.role === 'user')
    
    if (firstUserIndex === -1) {
      // No user messages found - this might be a problem but we'll allow it
      devLog.conversation('No user messages found in conversation history')
      return messages
    }
    
    if (firstUserIndex === 0) {
      // Already starts with user message
      return messages
    }
    
    // Remove messages before first user message
    devLog.conversation('Removing messages before first user message for proper flow', {
      removedCount: firstUserIndex
    })
    return messages.slice(firstUserIndex)
  }

  /**
   * Get comprehensive conversation statistics
   */
  getConversationStats(messages: ChatMessage[]): {
    totalMessages: number
    userMessages: number
    assistantMessages: number
    toolMessages: number
    toolCalls: number
    orphanedToolMessages: number
  } {
    let userMessages = 0
    let assistantMessages = 0
    let toolMessages = 0
    let toolCalls = 0
    let orphanedToolMessages = 0
    
    const assistantToolCallIds = new Set<string>()
    
    // First pass: collect all assistant tool call IDs
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.tool_calls) {
        for (const toolCall of msg.tool_calls) {
          assistantToolCallIds.add(toolCall.id)
          toolCalls++
        }
      }
    }
    
    // Second pass: count messages and identify orphaned tool messages
    for (const msg of messages) {
      switch (msg.role) {
        case 'user':
          userMessages++
          break
        case 'assistant':
          assistantMessages++
          break
        case 'tool':
          toolMessages++
          if (msg.tool_call_id && !assistantToolCallIds.has(msg.tool_call_id)) {
            orphanedToolMessages++
          }
          break
      }
    }
    
    return {
      totalMessages: messages.length,
      userMessages,
      assistantMessages,
      toolMessages,
      toolCalls,
      orphanedToolMessages
    }
  }

  /**
   * Prepare conversation history for LLM API
   * Formats messages for OpenAI API compliance
   */
  prepareForLLMApi(
    messages: ChatMessage[],
    excludeTools: boolean = false
  ): Array<{
    role: string
    content: string
    tool_calls?: any[]
    tool_call_id?: string
  }> {
    // Apply full validation and cleaning pipeline
    const validatedHistory = this.validateHistoryForToolExecution(messages)
    
    if (!validatedHistory.isValid) {
      devLog.validation('Conversation history validation warnings', {
        warnings: validatedHistory.warnings
      })
    }
    
    const apiMessages = validatedHistory.messages.map(msg => {
      const apiMessage: any = {
        role: msg.role,
        content: msg.content
      }
      
      // Add tool calls for assistant messages (unless excluded)
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0 && !excludeTools) {
        // Clean tool calls to remove internal execution data
        apiMessage.tool_calls = msg.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: typeof tc.parameters === 'string' ? tc.parameters : JSON.stringify(tc.parameters)
          }
        }))
      }
      
      // Add tool_call_id for tool messages
      if (msg.role === 'tool' && msg.tool_call_id) {
        apiMessage.tool_call_id = msg.tool_call_id
      }
      
      return apiMessage
    })
    
    // Filter out tool-related messages if tools are excluded
    if (excludeTools) {
      return apiMessages.filter((msg: any) =>
        msg.role !== 'tool' &&
        !msg.tool_calls
      )
    }
    
    return apiMessages
  }

  /**
   * Add message to conversation with validation
   */
  addMessageWithValidation(
    messages: ChatMessage[],
    newMessage: ChatMessage
  ): {
    updatedMessages: ChatMessage[]
    isValid: boolean
    warnings: string[]
  } {
    const warnings: string[] = []
    
    try {
      // Basic message validation
      if (!newMessage.role || !newMessage.content) {
        warnings.push('Message missing required role or content')
        return {
          updatedMessages: messages,
          isValid: false,
          warnings
        }
      }
      
      // Add unique ID if missing
      const messageToAdd: ChatMessage = {
        ...newMessage,
        id: newMessage.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: newMessage.timestamp || new Date()
      }
      
      // Validate tool message context
      if (messageToAdd.role === 'tool') {
        if (!messageToAdd.tool_call_id) {
          warnings.push('Tool message missing tool_call_id')
          return {
            updatedMessages: messages,
            isValid: false,
            warnings
          }
        }
        
        // Check if there's a matching assistant tool call
        const lastAssistantMessage = [...messages].reverse().find(msg => 
          msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0
        )
        
        if (!lastAssistantMessage || !lastAssistantMessage.tool_calls?.find(tc => tc.id === messageToAdd.tool_call_id)) {
          warnings.push(`Tool message tool_call_id ${messageToAdd.tool_call_id} has no matching assistant tool call`)
        }
      }
      
      const updatedMessages = [...messages, messageToAdd]
      
      // Validate the updated conversation
      const validationResult = this.validateHistoryForToolExecution(updatedMessages)
      
      return {
        updatedMessages: validationResult.messages,
        isValid: validationResult.isValid && warnings.length === 0,
        warnings: [...warnings, ...validationResult.warnings]
      }
      
    } catch (error) {
      this.externalDependencies.errorLogger.logError(
        'Failed to add message with validation',
        error as Error
      )
      
      return {
        updatedMessages: messages,
        isValid: false,
        warnings: ['Failed to add message due to error']
      }
    }
  }

  /**
   * Get conversation summary for debugging
   */
  getConversationSummary(messages: ChatMessage[]): string {
    const stats = this.getConversationStats(messages)
    const validation = this.validateHistoryForToolExecution(messages)
    
    return `Conversation Summary:
- Total messages: ${stats.totalMessages}
- User: ${stats.userMessages}, Assistant: ${stats.assistantMessages}, Tool: ${stats.toolMessages}
- Tool calls: ${stats.toolCalls}, Orphaned: ${stats.orphanedToolMessages}
- Valid: ${validation.isValid}
- Warnings: ${validation.warnings.join(', ') || 'None'}`
  }

  /**
   * Configuration management
   */
  configure(newConfiguration: ServiceConfiguration): void {
    this.configuration = { ...this.configuration, ...newConfiguration }
  }

  /**
   * Reset service state (no persistent state to reset)
   */
  reset(): void {
    // ConversationHistoryService is stateless, so nothing to reset
    devLog.general('ConversationHistoryService reset (stateless service)')
  }
}