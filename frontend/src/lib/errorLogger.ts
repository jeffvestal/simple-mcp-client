import type { ErrorInfo } from 'react'

export const enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export const enum ErrorCategory {
  COMPONENT = 'component',
  NETWORK = 'network',
  TOOL_EXECUTION = 'tool_execution',
  JSON_PARSING = 'json_parsing',
  STATE_MANAGEMENT = 'state_management',
  API = 'api',
  VALIDATION = 'validation',
  UNKNOWN = 'unknown'
}

export interface ErrorLogEntry {
  timestamp: string
  level: LogLevel
  category: ErrorCategory
  message: string
  error?: Error
  errorInfo?: ErrorInfo
  context?: Record<string, any>
  stack?: string
  userAgent?: string
  url?: string
}

class ErrorLogger {
  private isDevelopment: boolean
  private logs: ErrorLogEntry[] = []
  private maxLogs: number = 100

  constructor() {
    this.isDevelopment = import.meta.env.DEV
  }

  private createLogEntry(
    level: LogLevel,
    category: ErrorCategory,
    message: string,
    error?: Error,
    errorInfo?: ErrorInfo,
    context?: Record<string, any>
  ): ErrorLogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      error,
      errorInfo,
      context,
      stack: error?.stack,
      userAgent: navigator.userAgent,
      url: window.location.href
    }
  }

  private addToLogs(entry: ErrorLogEntry) {
    this.logs.push(entry)
    
    // Keep only the most recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs)
    }
  }

  private shouldLog(level: LogLevel): boolean {
    if (this.isDevelopment) {
      return true // Log everything in development
    }
    
    // In production, only log warnings and errors
    return level >= LogLevel.WARN
  }

  private formatMessage(entry: ErrorLogEntry): string {
    const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR']
    const timestamp = new Date(entry.timestamp).toLocaleTimeString()
    
    return `[${timestamp}] ${levelNames[entry.level]} [${entry.category.toUpperCase()}] ${entry.message}`
  }

  debug(message: string, category: ErrorCategory = ErrorCategory.UNKNOWN, context?: Record<string, any>) {
    if (!this.shouldLog(LogLevel.DEBUG)) return

    const entry = this.createLogEntry(LogLevel.DEBUG, category, message, undefined, undefined, context)
    this.addToLogs(entry)
    
    console.debug(this.formatMessage(entry), context ? context : '')
  }

  info(message: string, category: ErrorCategory = ErrorCategory.UNKNOWN, context?: Record<string, any>) {
    if (!this.shouldLog(LogLevel.INFO)) return

    const entry = this.createLogEntry(LogLevel.INFO, category, message, undefined, undefined, context)
    this.addToLogs(entry)
    
    console.info(this.formatMessage(entry), context ? context : '')
  }

  warn(message: string, category: ErrorCategory = ErrorCategory.UNKNOWN, context?: Record<string, any>) {
    if (!this.shouldLog(LogLevel.WARN)) return

    const entry = this.createLogEntry(LogLevel.WARN, category, message, undefined, undefined, context)
    this.addToLogs(entry)
    
    console.warn(this.formatMessage(entry), context ? context : '')
  }

  error(
    message: string,
    error?: Error,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    errorInfo?: ErrorInfo,
    context?: Record<string, any>
  ) {
    const entry = this.createLogEntry(LogLevel.ERROR, category, message, error, errorInfo, context)
    this.addToLogs(entry)
    
    if (this.isDevelopment) {
      console.group(`🔴 ${this.formatMessage(entry)}`)
      if (error) {
        console.error('Error object:', error)
        console.error('Stack trace:', error.stack)
      }
      if (errorInfo) {
        console.error('React Error Info:', errorInfo)
        console.error('Component Stack:', errorInfo.componentStack)
      }
      if (context) {
        console.error('Context:', context)
      }
      console.groupEnd()
    } else {
      console.error(this.formatMessage(entry))
    }

    // In production, you might want to send errors to a service
    // this.sendToErrorReportingService(entry)
  }

  // Specialized logging methods for common error types
  componentError(message: string, error: Error, errorInfo?: ErrorInfo, context?: Record<string, any>) {
    this.error(message, error, ErrorCategory.COMPONENT, errorInfo, context)
  }

  toolExecutionError(toolName: string, error: Error, context?: Record<string, any>) {
    this.error(
      `Tool execution failed: ${toolName}`,
      error,
      ErrorCategory.TOOL_EXECUTION,
      undefined,
      { toolName, ...context }
    )
  }

  networkError(message: string, error: Error, context?: Record<string, any>) {
    this.error(message, error, ErrorCategory.NETWORK, undefined, context)
  }

  jsonParsingError(message: string, error: Error, invalidJson?: string) {
    this.error(
      message,
      error,
      ErrorCategory.JSON_PARSING,
      undefined,
      { invalidJson: invalidJson?.substring(0, 500) } // Limit size
    )
  }

  apiError(endpoint: string, error: Error, context?: Record<string, any>) {
    this.error(
      `API error: ${endpoint}`,
      error,
      ErrorCategory.API,
      undefined,
      { endpoint, ...context }
    )
  }

  validationError(message: string, context?: Record<string, any>) {
    this.warn(message, ErrorCategory.VALIDATION, context)
  }

  // Get recent logs (useful for debugging or error reporting)
  getRecentLogs(count: number = 50): ErrorLogEntry[] {
    return this.logs.slice(-count)
  }

  // Get logs by category
  getLogsByCategory(category: ErrorCategory): ErrorLogEntry[] {
    return this.logs.filter(log => log.category === category)
  }

  // Get error logs only
  getErrorLogs(): ErrorLogEntry[] {
    return this.logs.filter(log => log.level >= LogLevel.ERROR)
  }

  // Clear all logs
  clearLogs() {
    this.logs = []
  }

  // Get error statistics
  getErrorStats(): Record<string, number> {
    const stats: Record<string, number> = {}
    
    this.logs.forEach(log => {
      const key = `${log.category}_${LogLevel[log.level]}`
      stats[key] = (stats[key] || 0) + 1
    })
    
    return stats
  }

  // Export logs for debugging or support
  exportLogs(): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      environment: this.isDevelopment ? 'development' : 'production',
      userAgent: navigator.userAgent,
      url: window.location.href,
      logs: this.logs
    }, null, 2)
  }

  // Future: Send to error reporting service
  private sendToErrorReportingService(_entry: ErrorLogEntry) {
    // Implementation would depend on your error reporting service
    // Examples: Sentry, LogRocket, Rollbar, etc.
    
    // Example implementation:
    // try {
    //   fetch('/api/errors', {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify(entry)
    //   })
    // } catch (err) {
    //   console.error('Failed to send error to reporting service:', err)
    // }
  }
}

// Create singleton instance
export const errorLogger = new ErrorLogger()

// Convenience functions
export const logError = errorLogger.error.bind(errorLogger)
export const logWarn = errorLogger.warn.bind(errorLogger)
export const logInfo = errorLogger.info.bind(errorLogger)
export const logDebug = errorLogger.debug.bind(errorLogger)

// Specialized convenience functions
export const logComponentError = errorLogger.componentError.bind(errorLogger)
export const logToolError = errorLogger.toolExecutionError.bind(errorLogger)
export const logNetworkError = errorLogger.networkError.bind(errorLogger)
export const logJsonError = errorLogger.jsonParsingError.bind(errorLogger)
export const logApiError = errorLogger.apiError.bind(errorLogger)
export const logValidationError = errorLogger.validationError.bind(errorLogger)

// Hook for using error logger in components
export function useErrorLogger() {
  return {
    logError: errorLogger.error.bind(errorLogger),
    logWarn: errorLogger.warn.bind(errorLogger),
    logInfo: errorLogger.info.bind(errorLogger),
    logDebug: errorLogger.debug.bind(errorLogger),
    logComponentError: errorLogger.componentError.bind(errorLogger),
    logToolError: errorLogger.toolExecutionError.bind(errorLogger),
    logNetworkError: errorLogger.networkError.bind(errorLogger),
    logJsonError: errorLogger.jsonParsingError.bind(errorLogger),
    logApiError: errorLogger.apiError.bind(errorLogger),
    getRecentLogs: () => errorLogger.getRecentLogs(),
    getErrorStats: () => errorLogger.getErrorStats(),
    exportLogs: () => errorLogger.exportLogs()
  }
}

// Global error handlers
window.addEventListener('error', (event) => {
  errorLogger.error(
    'Uncaught JavaScript error',
    event.error || new Error(event.message),
    ErrorCategory.UNKNOWN,
    undefined,
    {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    }
  )
})

window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason instanceof Error 
    ? event.reason 
    : new Error(event.reason?.toString() || 'Unhandled promise rejection')
    
  errorLogger.error(
    'Unhandled promise rejection',
    error,
    ErrorCategory.UNKNOWN,
    undefined,
    { reason: event.reason }
  )
})