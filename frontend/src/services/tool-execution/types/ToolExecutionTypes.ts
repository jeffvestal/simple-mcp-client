/**
 * Shared types for Tool Execution Services
 * 
 * These types mirror the existing data structures used in ChatInterfaceSimple.tsx
 * to ensure compatibility during the refactoring process.
 */

// Core tool execution types
export interface ToolCall {
  id: string
  name: string
  parameters: any
  status: 'pending' | 'completed' | 'error'
  result?: any
}

export interface ToolExecutionResult {
  success: boolean
  result?: any
  error?: string
}

export interface ToolServerMapping {
  [toolName: string]: number // toolName -> serverId
}

export interface ServerDetails {
  id: number
  name: string
  tools: Array<{
    name: string
    is_enabled: boolean
  }>
}

// Conversation management types
export interface ChatMessage {
  id?: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
  timestamp?: Date
}

export interface ConversationHistory {
  messages: ChatMessage[]
  isValid: boolean
  warnings: string[]
}

// Retry and validation types
export interface RetryContext {
  retryCount: number
  maxRetries: number
  lastError?: string
  originalParameters: any
}

export interface ValidationError {
  isValidationError: boolean
  errorMessage: string
  suggestedFix?: string
}

// Tool result processing types
export interface ToolResultContent {
  type: string
  text?: string
  data?: any
}

export interface ProcessedToolResult {
  content: string
  isValid: boolean
  metadata?: {
    toolName: string
    executionTime?: number
    retryCount?: number
  }
}

// Service execution context
export interface ToolExecutionContext {
  assistantMessageId: string
  currentUserMessage?: string
  abortSignal?: AbortSignal
  retryCount: number
  toolCalls: ToolCall[]
}

// Performance and monitoring types
export interface ExecutionMetrics {
  startTime: number
  endTime?: number
  duration?: number
  toolCount: number
  retryCount: number
  cacheHitRate: number
  memoryBefore: number
  memoryAfter: number
  success: boolean
}

// Cache management types
export interface CacheEntry<T> {
  data: T
  timestamp: number
  expiryTime: number
}

export interface CacheStats {
  hits: number
  misses: number
  size: number
  hitRate: number
}

// Error handling types
export interface ServiceError extends Error {
  service: string
  context?: any
  recoverable: boolean
}

// Constants from the original implementation
export const TOOL_EXECUTION_CONSTANTS = {
  MAX_CONVERSATION_HISTORY: 50,
  MAX_RETRY_ATTEMPTS: 3,
  TOOL_CACHE_EXPIRY_MS: 5 * 60 * 1000, // 5 minutes
  API_CALL_TIMEOUT_MS: 30000, // 30 seconds
} as const

// Service configuration types
export interface ServiceConfiguration {
  maxRetries: number
  cacheExpiryMs: number
  conversationHistoryLimit: number
  enablePerformanceMonitoring: boolean
  enableMemoryTracking: boolean
}

// Export verification - temporary debug
export { ProcessedToolResult }