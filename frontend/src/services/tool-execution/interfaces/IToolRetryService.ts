/**
 * Tool Retry Service Interface
 * 
 * Handles retry logic, validation error detection, and LLM-powered retries
 */

import type { 
  ToolCall, 
  ToolExecutionResult, 
  RetryContext, 
  ValidationError,
  ChatMessage 
} from '../types/ToolExecutionTypes'

export interface IToolRetryService {
  /**
   * Check if an error is a validation error that can be retried
   * Mirrors the existing isValidationError function
   */
  isValidationError(error: string): boolean

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
  }

  /**
   * Execute retry logic with LLM parameter correction
   * Implements the complex retry logic from the original function
   */
  executeRetryWithLLM(
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
  }>

  /**
   * Create retry context for tracking retry attempts
   */
  createRetryContext(
    initialRetryCount: number,
    maxRetries: number,
    lastError?: string,
    originalParameters?: any
  ): RetryContext

  /**
   * Update retry context after an attempt
   */
  updateRetryContext(
    context: RetryContext,
    result: ToolExecutionResult
  ): RetryContext

  /**
   * Check if maximum retry attempts have been reached
   */
  hasExceededMaxRetries(retryContext: RetryContext): boolean

  /**
   * Generate retry conversation history for LLM
   * Formats the conversation for LLM to understand the retry context
   */
  generateRetryConversationHistory(
    originalHistory: ChatMessage[],
    toolCalls: ToolCall[],
    failedResults: ToolExecutionResult[]
  ): ChatMessage[]

  /**
   * Parse validation error and suggest fixes
   */
  parseValidationError(error: string): ValidationError

  /**
   * Apply automatic parameter fixes for common validation errors
   */
  applyAutomaticFixes(
    toolCall: ToolCall,
    validationError: ValidationError
  ): ToolCall | null

  /**
   * Get retry statistics
   */
  getRetryStats(): {
    totalRetries: number
    successfulRetries: number
    failedRetries: number
    retrySuccessRate: number
    commonErrors: Array<{ error: string; count: number }>
  }
}