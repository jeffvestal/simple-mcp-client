/**
 * Development Logger Utility
 * 
 * Provides environment-based conditional logging for development debugging
 * while ensuring zero overhead in production builds.
 * 
 * Integrates seamlessly with existing ErrorLogger and PerformanceMonitor systems.
 */

// Import existing systems for integration
import { errorLogger, ErrorCategory } from './errorLogger'

/**
 * Development logging categories matching the existing console.log patterns
 */
export const enum DevLogCategory {
  VALIDATION = 'validation',
  TOOL_EXECUTION = 'tool_execution', 
  CONVERSATION = 'conversation',
  CACHE = 'cache',
  MEMORY = 'memory',
  SERVER_MAPPING = 'server_mapping',
  RETRY_LOGIC = 'retry_logic',
  PERFORMANCE = 'performance',
  STATE = 'state',
  API = 'api',
  ERROR_BOUNDARY = 'error_boundary',
  GENERAL = 'general'
}

/**
 * Logging levels for development
 */
export const enum DevLogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

/**
 * Development log entry interface
 */
export interface DevLogEntry {
  timestamp: number
  category: DevLogCategory
  level: DevLogLevel
  message: string
  data?: any
  emoji?: string
}

/**
 * Performance-optimized development logger
 * 
 * In production builds:
 * - All logging methods become no-ops
 * - Zero memory allocation for logging
 * - No performance overhead
 * 
 * In development builds:
 * - Full featured logging with categories
 * - Structured data support
 * - Integration with existing error handling
 */
class DevelopmentLogger {
  private isDevelopment: boolean
  private logs: DevLogEntry[] = []
  private maxLogs = 200 // Keep reasonable memory usage

  // Category to emoji mapping for consistent visual formatting
  private categoryEmojis: Record<DevLogCategory, string> = {
    [DevLogCategory.VALIDATION]: '🔍',
    [DevLogCategory.TOOL_EXECUTION]: '🔧',
    [DevLogCategory.CONVERSATION]: '💬',
    [DevLogCategory.CACHE]: '💾',
    [DevLogCategory.MEMORY]: '🧠',
    [DevLogCategory.SERVER_MAPPING]: '🗺️',
    [DevLogCategory.RETRY_LOGIC]: '🔄',
    [DevLogCategory.PERFORMANCE]: '📊',
    [DevLogCategory.STATE]: '📦',
    [DevLogCategory.API]: '📡',
    [DevLogCategory.ERROR_BOUNDARY]: '🛡️',
    [DevLogCategory.GENERAL]: '📝'
  }

  constructor() {
    this.isDevelopment = import.meta.env.DEV
  }

  /**
   * Core logging method - all other methods delegate to this
   */
  private log(
    level: DevLogLevel, 
    category: DevLogCategory, 
    message: string, 
    data?: any
  ): void {
    // Production fast path - early return with zero overhead
    if (!this.isDevelopment) {
      return
    }

    const emoji = this.categoryEmojis[category]
    const timestamp = Date.now()
    const entry: DevLogEntry = { timestamp, category, level, message, data, emoji }

    // Store for debugging purposes
    this.logs.push(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs)
    }

    // Format and output to console
    const formattedMessage = `${emoji} [${category.toUpperCase()}] ${message}`
    
    switch (level) {
      case DevLogLevel.DEBUG:
        console.debug(formattedMessage, data || '')
        break
      case DevLogLevel.INFO:
        console.log(formattedMessage, data || '')
        break
      case DevLogLevel.WARN:
        console.warn(formattedMessage, data || '')
        break
      case DevLogLevel.ERROR:
        console.error(formattedMessage, data || '')
        // Also log to ErrorLogger for error tracking
        errorLogger.error(
          message, 
          data instanceof Error ? data : undefined,
          this.mapCategoryToErrorCategory(category),
          undefined,
          data instanceof Error ? {} : data
        )
        break
    }
  }

  /**
   * Map development categories to error logger categories
   */
  private mapCategoryToErrorCategory(category: DevLogCategory): ErrorCategory {
    const mapping: Record<DevLogCategory, ErrorCategory> = {
      [DevLogCategory.VALIDATION]: ErrorCategory.VALIDATION,
      [DevLogCategory.TOOL_EXECUTION]: ErrorCategory.TOOL_EXECUTION,
      [DevLogCategory.API]: ErrorCategory.API,
      [DevLogCategory.CONVERSATION]: ErrorCategory.COMPONENT,
      [DevLogCategory.CACHE]: ErrorCategory.STATE_MANAGEMENT,
      [DevLogCategory.MEMORY]: ErrorCategory.STATE_MANAGEMENT,
      [DevLogCategory.SERVER_MAPPING]: ErrorCategory.NETWORK,
      [DevLogCategory.RETRY_LOGIC]: ErrorCategory.TOOL_EXECUTION,
      [DevLogCategory.PERFORMANCE]: ErrorCategory.COMPONENT,
      [DevLogCategory.STATE]: ErrorCategory.STATE_MANAGEMENT,
      [DevLogCategory.ERROR_BOUNDARY]: ErrorCategory.COMPONENT,
      [DevLogCategory.GENERAL]: ErrorCategory.UNKNOWN
    }
    return mapping[category] || ErrorCategory.UNKNOWN
  }

  // Primary logging methods
  debug(category: DevLogCategory, message: string, data?: any): void {
    this.log(DevLogLevel.DEBUG, category, message, data)
  }

  info(category: DevLogCategory, message: string, data?: any): void {
    this.log(DevLogLevel.INFO, category, message, data)
  }

  warn(category: DevLogCategory, message: string, data?: any): void {
    this.log(DevLogLevel.WARN, category, message, data)
  }

  error(category: DevLogCategory, message: string, data?: any): void {
    this.log(DevLogLevel.ERROR, category, message, data)
  }

  // Specialized logging methods matching existing console.log patterns
  
  /**
   * Validation logging - matches 🔍 VALIDATION patterns
   */
  validation(message: string, data?: any): void {
    this.info(DevLogCategory.VALIDATION, message, data)
  }

  /**
   * Tool execution logging - matches 🔧 patterns  
   */
  toolExecution(message: string, data?: any): void {
    this.info(DevLogCategory.TOOL_EXECUTION, message, data)
  }

  /**
   * Conversation processing - matches 💬 patterns
   */
  conversation(message: string, data?: any): void {
    this.info(DevLogCategory.CONVERSATION, message, data)
  }

  /**
   * Cache operations - matches cache-related logging
   */
  cache(message: string, data?: any): void {
    this.info(DevLogCategory.CACHE, message, data)
  }

  /**
   * Memory management - matches 🧠 patterns
   */
  memory(message: string, data?: any): void {
    this.info(DevLogCategory.MEMORY, message, data)
  }

  /**
   * Server mapping and discovery - matches 🗺️ patterns
   */
  serverMapping(message: string, data?: any): void {
    this.info(DevLogCategory.SERVER_MAPPING, message, data)
  }

  /**
   * Retry logic - matches 🔄 patterns  
   */
  retry(message: string, data?: any): void {
    this.info(DevLogCategory.RETRY_LOGIC, message, data)
  }

  /**
   * Performance monitoring - matches 📊 patterns
   */
  performance(message: string, data?: any): void {
    this.info(DevLogCategory.PERFORMANCE, message, data)
  }

  /**
   * State management - matches state-related patterns
   */
  state(message: string, data?: any): void {
    this.info(DevLogCategory.STATE, message, data)
  }

  /**
   * API operations - matches API-related logging
   */
  api(message: string, data?: any): void {
    this.info(DevLogCategory.API, message, data)
  }

  /**
   * Error boundary operations
   */
  errorBoundary(message: string, data?: any): void {
    this.info(DevLogCategory.ERROR_BOUNDARY, message, data)
  }

  /**
   * General purpose logging
   */
  general(message: string, data?: any): void {
    this.info(DevLogCategory.GENERAL, message, data)
  }

  // Utility methods for debugging and monitoring

  /**
   * Get recent development logs (development only)
   */
  getRecentLogs(count: number = 50): DevLogEntry[] {
    if (!this.isDevelopment) {
      return []
    }
    return this.logs.slice(-count)
  }

  /**
   * Get logs by category (development only)
   */
  getLogsByCategory(category: DevLogCategory): DevLogEntry[] {
    if (!this.isDevelopment) {
      return []
    }
    return this.logs.filter(log => log.category === category)
  }

  /**
   * Clear development logs
   */
  clearLogs(): void {
    if (!this.isDevelopment) {
      return
    }
    this.logs = []
  }

  /**
   * Get logging statistics (development only)
   */
  getLogStats(): Record<string, number> {
    if (!this.isDevelopment) {
      return {}
    }

    const stats: Record<string, number> = {}
    this.logs.forEach(log => {
      const key = `${log.category}_${DevLogLevel[log.level]}`
      stats[key] = (stats[key] || 0) + 1
    })
    return stats
  }

  /**
   * Export logs for debugging (development only)
   */
  exportLogs(): string {
    if (!this.isDevelopment) {
      return JSON.stringify({ logs: [], note: 'Logging disabled in production' })
    }

    return JSON.stringify({
      timestamp: new Date().toISOString(),
      environment: 'development',
      totalLogs: this.logs.length,
      logs: this.logs
    }, null, 2)
  }

  /**
   * Check if development logging is enabled
   */
  isEnabled(): boolean {
    return this.isDevelopment
  }
}

// Create singleton instance
const developmentLogger = new DevelopmentLogger()

// Export singleton
export { developmentLogger }

// Convenience functions following the existing errorLogger pattern
export const devLog = {
  debug: developmentLogger.debug.bind(developmentLogger),
  info: developmentLogger.info.bind(developmentLogger), 
  warn: developmentLogger.warn.bind(developmentLogger),
  error: developmentLogger.error.bind(developmentLogger),
  
  // Specialized methods
  validation: developmentLogger.validation.bind(developmentLogger),
  toolExecution: developmentLogger.toolExecution.bind(developmentLogger),
  conversation: developmentLogger.conversation.bind(developmentLogger),
  cache: developmentLogger.cache.bind(developmentLogger),
  memory: developmentLogger.memory.bind(developmentLogger),
  serverMapping: developmentLogger.serverMapping.bind(developmentLogger),
  retry: developmentLogger.retry.bind(developmentLogger),
  performance: developmentLogger.performance.bind(developmentLogger),
  state: developmentLogger.state.bind(developmentLogger),
  api: developmentLogger.api.bind(developmentLogger),
  errorBoundary: developmentLogger.errorBoundary.bind(developmentLogger),
  general: developmentLogger.general.bind(developmentLogger),

  // Utility methods
  getRecentLogs: () => developmentLogger.getRecentLogs(),
  getLogsByCategory: (category: DevLogCategory) => developmentLogger.getLogsByCategory(category),
  clearLogs: () => developmentLogger.clearLogs(),
  getLogStats: () => developmentLogger.getLogStats(),
  exportLogs: () => developmentLogger.exportLogs(),
  isEnabled: () => developmentLogger.isEnabled()
}

// Hook for using development logger in React components
export function useDevLogger() {
  return {
    devLog,
    isEnabled: developmentLogger.isEnabled(),
    getRecentLogs: (count?: number) => developmentLogger.getRecentLogs(count),
    exportLogs: () => developmentLogger.exportLogs()
  }
}

// Note: DevLogCategory and DevLogLevel are already exported above as const enums