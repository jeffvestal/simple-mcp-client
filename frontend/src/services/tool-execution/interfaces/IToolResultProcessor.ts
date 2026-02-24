/**
 * Tool Result Processing Service Interface
 * 
 * Handles extraction, cleaning, and formatting of tool execution results
 */

import type { 
  ToolResultContent, 
  ProcessedToolResult,
  ToolExecutionResult 
} from '../types/ToolExecutionTypes'

export interface IToolResultProcessor {
  /**
   * Extract and clean content from MCP tool responses
   * Mirrors the existing extractAndCleanToolContent function
   */
  extractAndCleanToolContent(
    toolResult: ToolExecutionResult,
    toolName: string
  ): string

  /**
   * Process tool result with metadata
   */
  processToolResult(
    toolResult: ToolExecutionResult,
    toolName: string,
    executionTime?: number,
    retryCount?: number
  ): ProcessedToolResult

  /**
   * Format tool result for conversation history
   * Handles the formatting logic for different tool types
   */
  formatToolResultForConversation(
    toolResult: ToolExecutionResult,
    toolName: string,
    toolCallId: string
  ): {
    role: 'tool'
    content: string
    tool_call_id: string
  }

  /**
   * Validate tool result structure
   * Ensures tool results conform to expected format
   */
  validateToolResult(toolResult: any): {
    isValid: boolean
    errors: string[]
    cleanedResult?: ToolExecutionResult
  }

  /**
   * Get tool-specific formatter
   * Returns specialized formatting for known tool types
   */
  getToolSpecificFormatter(toolName: string): ((result: any) => string) | null
}