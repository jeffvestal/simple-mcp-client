import React from 'react'
import { ErrorBoundary } from './ErrorBoundary'
import { ToolExecutionErrorBoundary } from './ToolExecutionErrorBoundary'
import { ChatErrorFallback } from './fallbacks/ChatErrorFallback'
import { ChatInterfaceSimple } from './ChatInterfaceSimple'
import { logComponentError } from '../lib/errorLogger'
import type { ErrorInfo } from 'react'

// Component that wraps individual tool operations
function ToolOperationsWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ToolExecutionErrorBoundary
      onToolError={(error, errorInfo) => {
        logComponentError(
          'Tool execution boundary triggered',
          error,
          errorInfo,
          { component: 'ToolOperationsWrapper' }
        )
      }}
      allowSkip={true}
    >
      {children}
    </ToolExecutionErrorBoundary>
  )
}

// Component that wraps the entire chat interface
function ChatInterfaceWrapper({ children }: { children: React.ReactNode }) {
  const handleChatError = (error: Error, errorInfo: ErrorInfo) => {
    logComponentError(
      'Chat interface error boundary triggered',
      error,
      errorInfo,
      { 
        component: 'ChatInterfaceWrapper',
        errorDetails: {
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack
        }
      }
    )

    // Check if this is a critical error that should be reported
    const isCritical = error.message.toLowerCase().includes('memory') || 
                      error.message.toLowerCase().includes('heap') ||
                      error.stack?.includes('executeToolCalls')

    if (isCritical) {
      console.error('🚨 Critical chat interface error detected:', error)
    }
  }

  return (
    <ErrorBoundary
      fallback={ChatErrorFallback}
      onError={handleChatError}
      enableRetry={true}
      errorBoundaryKey="chat-interface"
    >
      {children}
    </ErrorBoundary>
  )
}

// Main wrapped component
export function ChatInterfaceWithErrorBoundary() {
  return (
    <ChatInterfaceWrapper>
      <ToolOperationsWrapper>
        <ChatInterfaceSimple />
      </ToolOperationsWrapper>
    </ChatInterfaceWrapper>
  )
}

// Alternative export that provides more granular control
export function ChatInterfaceWithCustomBoundary({
  onChatError,
  onToolError,
  enableRetry = true,
  customChatFallback,
  customToolFallback
}: {
  onChatError?: (error: Error, errorInfo: ErrorInfo) => void
  onToolError?: (error: Error, errorInfo: ErrorInfo) => void
  enableRetry?: boolean
  customChatFallback?: React.ComponentType<any>
  customToolFallback?: React.ComponentType<any>
}) {
  const handleChatError = (error: Error, errorInfo: ErrorInfo) => {
    logComponentError('Custom chat error boundary triggered', error, errorInfo)
    onChatError?.(error, errorInfo)
  }

  const handleToolError = (error: Error, errorInfo: ErrorInfo) => {
    logComponentError('Custom tool error boundary triggered', error, errorInfo)
    onToolError?.(error, errorInfo)
  }

  return (
    <ErrorBoundary
      fallback={customChatFallback || ChatErrorFallback}
      onError={handleChatError}
      enableRetry={enableRetry}
      errorBoundaryKey="custom-chat-interface"
    >
      <ToolExecutionErrorBoundary
        onToolError={handleToolError}
        allowSkip={true}
      >
        <ChatInterfaceSimple />
      </ToolExecutionErrorBoundary>
    </ErrorBoundary>
  )
}