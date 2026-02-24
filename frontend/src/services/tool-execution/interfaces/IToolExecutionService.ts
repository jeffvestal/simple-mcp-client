/**
 * Tool Execution Service Interface
 * 
 * Main orchestrator service that coordinates all other services
 * Replaces the massive executeToolCalls function
 */

import type { 
  ToolCall, 
  ToolExecutionContext, 
  ExecutionMetrics,
  ServiceError,
  ChatMessage 
} from '../types/ToolExecutionTypes'

export interface IToolExecutionService {
  /**
   * Main entry point for tool execution
   * Replaces the executeToolCalls function
   */
  executeToolCalls(
    toolCalls: ToolCall[],
    assistantMessageId: string,
    currentUserMessage?: string,
    abortSignal?: AbortSignal,
    retryCount?: number
  ): Promise<void>

  /**
   * Execute a single tool with full error handling and retry logic
   */
  executeSingleTool(
    toolCall: ToolCall,
    context: ToolExecutionContext
  ): Promise<{
    success: boolean
    result?: any
    error?: string
    updatedToolCall: ToolCall
  }>

  /**
   * Process tool results and update conversation
   */
  processToolResults(
    toolCalls: ToolCall[],
    context: ToolExecutionContext
  ): Promise<{
    hasValidResults: boolean
    toolResults: ChatMessage[]
    processedCount: number
  }>

  /**
   * Handle tool execution errors and determine recovery strategy
   */
  handleToolExecutionError(
    error: ServiceError,
    context: ToolExecutionContext
  ): Promise<{
    canRecover: boolean
    recoveryAction?: 'retry' | 'skip' | 'abort'
    updatedContext?: ToolExecutionContext
  }>

  /**
   * Update UI state during tool execution
   */
  updateToolExecutionStatus(
    toolCall: ToolCall,
    assistantMessageId: string,
    status: 'pending' | 'completed' | 'error',
    result?: any
  ): void

  /**
   * Send the current conversation to the LLM, optionally with tools enabled.
   */
  sendConversationToLLM(
    conversationHistory: ChatMessage[],
    llmConfigId: string,
    excludeTools: boolean,
    abortSignal?: AbortSignal
  ): Promise<{
    success: boolean
    response?: string
    toolCalls?: any[]
    error?: string
  }>

  /**
   * Get execution metrics for performance monitoring
   */
  getExecutionMetrics(context: ToolExecutionContext): ExecutionMetrics

  /**
   * Cancel all ongoing tool executions
   */
  cancelExecution(reason: string): void

  /**
   * Check if service is currently executing tools
   */
  isExecuting(): boolean

  /**
   * Get current execution context
   */
  getCurrentContext(): ToolExecutionContext | null

  /**
   * Validate tool calls before execution
   */
  validateToolCalls(toolCalls: ToolCall[]): {
    isValid: boolean
    validToolCalls: ToolCall[]
    invalidToolCalls: Array<{ toolCall: ToolCall; reason: string }>
  }

  /**
   * Cleanup resources after execution
   */
  cleanup(): void
}