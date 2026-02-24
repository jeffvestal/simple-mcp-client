/**
 * Conversation History Service Interface
 * 
 * Handles conversation history validation, cleaning, and management
 */

import type { ChatMessage, ConversationHistory } from '../types/ToolExecutionTypes'

export interface IConversationHistoryService {
  /**
   * Validate and clean conversation history
   * Mirrors the existing validateAndCleanHistory function
   */
  validateAndCleanHistory(messages: ChatMessage[]): ChatMessage[]

  /**
   * Limit conversation history to prevent memory growth
   * Implements the existing limitConversationHistory logic
   */
  limitConversationHistory(messages: ChatMessage[]): ChatMessage[]

  /**
   * Check if conversation history is valid for tool execution
   */
  validateHistoryForToolExecution(messages: ChatMessage[]): ConversationHistory

  /**
   * Clean orphaned tool messages
   * Removes tool messages that don't have corresponding assistant tool calls
   */
  cleanOrphanedToolMessages(messages: ChatMessage[]): {
    cleanedMessages: ChatMessage[]
    removedCount: number
    warnings: string[]
  }

  /**
   * Ensure conversation starts with user message
   * Implements the logic to maintain user-assistant conversation flow
   */
  ensureConversationFlow(messages: ChatMessage[]): ChatMessage[]

  /**
   * Get conversation statistics
   */
  getConversationStats(messages: ChatMessage[]): {
    totalMessages: number
    userMessages: number
    assistantMessages: number
    toolMessages: number
    toolCalls: number
    orphanedToolMessages: number
  }

  /**
   * Prepare conversation history for LLM API
   * Formats messages for OpenAI API compliance
   */
  prepareForLLMApi(
    messages: ChatMessage[],
    excludeTools?: boolean
  ): Array<{
    role: string
    content: string
    tool_calls?: any[]
    tool_call_id?: string
  }>

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
  }
}