import React from 'react'
import type { ErrorInfo } from 'react'
import { ErrorBoundary } from './ErrorBoundary'
import type { ErrorFallbackProps } from './ErrorBoundary'
import { AlertTriangle, Wrench, RefreshCw, SkipForward } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { useToast } from './ui/use-toast'

interface ToolExecutionErrorBoundaryProps {
  children: React.ReactNode
  onToolError?: (error: Error, errorInfo: ErrorInfo) => void
  onSkipTool?: () => void
  toolName?: string
  allowSkip?: boolean
}

export function ToolExecutionErrorBoundary({
  children,
  onToolError,
  onSkipTool,
  toolName,
  allowSkip = false
}: ToolExecutionErrorBoundaryProps) {
  const handleError = (error: Error, errorInfo: ErrorInfo) => {
    // Log tool-specific error information
    if (import.meta.env.DEV) {
      console.group(`🔧 Tool Execution Error${toolName ? ` (${toolName})` : ''}`)
      console.error('Tool Error:', error.message)
      console.error('Error Info:', errorInfo)
      console.groupEnd()
    } else {
      console.error(`Tool execution error${toolName ? ` for ${toolName}` : ''}:`, error.message)
    }

    // Call optional error handler
    if (onToolError) {
      onToolError(error, errorInfo)
    }
  }

  return (
    <ErrorBoundary
      onError={handleError}
      fallback={(props) => (
        <ToolExecutionErrorFallback
          {...props}
          toolName={toolName}
          onSkipTool={onSkipTool}
          allowSkip={allowSkip}
        />
      )}
      errorBoundaryKey={`tool-execution${toolName ? `-${toolName}` : ''}`}
    >
      {children}
    </ErrorBoundary>
  )
}

interface ToolExecutionErrorFallbackProps extends ErrorFallbackProps {
  toolName?: string
  onSkipTool?: () => void
  allowSkip?: boolean
}

function ToolExecutionErrorFallback({
  error,
  errorInfo,
  resetError,
  errorCount,
  toolName,
  onSkipTool,
  allowSkip = false
}: ToolExecutionErrorFallbackProps) {
  const { toast } = useToast()

  const handleRetry = () => {
    resetError()
    toast({
      title: "Retrying tool execution",
      description: `Attempting to execute ${toolName || 'the tool'} again...`
    })
  }

  const handleSkip = () => {
    if (onSkipTool) {
      onSkipTool()
      toast({
        title: "Tool skipped",
        description: `Skipped ${toolName || 'the tool'} and continuing with conversation...`,
        variant: "default"
      })
    }
    resetError()
  }

  return (
    <Card className="border-destructive/20 bg-destructive/5 my-2">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <CardTitle className="text-sm">
            Tool Execution Failed
            {toolName && ` - ${toolName}`}
          </CardTitle>
        </div>
        <CardDescription className="text-xs">
          {errorCount > 1 && (
            <span className="text-amber-600 dark:text-amber-400">
              Failed {errorCount} times. 
            </span>
          )}
          {' '}The tool encountered an error but your conversation can continue.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="text-xs">
          <p className="font-medium text-destructive mb-1">Error Details:</p>
          <p className="font-mono bg-muted/50 p-2 rounded text-xs break-words">
            {error.message}
          </p>
        </div>

        {import.meta.env.DEV && errorInfo && (
          <details className="text-xs">
            <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
              Debug Information
            </summary>
            <div className="mt-2 bg-muted/50 p-2 rounded overflow-x-auto">
              <pre className="text-xs whitespace-pre-wrap">{error.stack}</pre>
            </div>
          </details>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={handleRetry}
            variant="default"
            size="sm"
            className="gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            Retry Tool
          </Button>
          
          {allowSkip && (
            <Button
              onClick={handleSkip}
              variant="outline"
              size="sm"
              className="gap-1"
            >
              <SkipForward className="h-3 w-3" />
              Skip & Continue
            </Button>
          )}
        </div>

        {errorCount > 2 && (
          <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 p-2 rounded border border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Multiple failures detected</p>
                <p className="mt-1">
                  This tool has failed {errorCount} times. Consider checking:
                </p>
                <ul className="mt-1 ml-4 list-disc space-y-1">
                  <li>Network connectivity</li>
                  <li>Tool server status</li>
                  <li>Parameter validity</li>
                  {toolName && <li>{toolName} specific requirements</li>}
                </ul>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Hook for handling tool execution errors in components
export function useToolExecutionError() {
  const { toast } = useToast()

  const handleToolError = (error: Error, toolName?: string) => {
    console.error(`Tool execution error${toolName ? ` for ${toolName}` : ''}:`, error)
    
    toast({
      title: "Tool execution failed",
      description: `${toolName || 'The tool'} encountered an error: ${error.message}`,
      variant: "destructive"
    })
  }

  const handleToolRetry = (toolName?: string) => {
    toast({
      title: "Retrying tool",
      description: `Attempting to execute ${toolName || 'the tool'} again...`
    })
  }

  const handleToolSkip = (toolName?: string) => {
    toast({
      title: "Tool skipped",
      description: `Skipped ${toolName || 'the tool'} and continuing...`
    })
  }

  return {
    handleToolError,
    handleToolRetry,
    handleToolSkip
  }
}

// Wrapper component for individual tool operations
interface ToolOperationWrapperProps {
  children: React.ReactNode
  toolName: string
  onError?: (error: Error) => void
  onSkip?: () => void
  allowSkip?: boolean
}

export function ToolOperationWrapper({
  children,
  toolName,
  onError,
  onSkip,
  allowSkip = true
}: ToolOperationWrapperProps) {
  return (
    <ToolExecutionErrorBoundary
      toolName={toolName}
      onToolError={(error) => onError?.(error)}
      onSkipTool={onSkip}
      allowSkip={allowSkip}
    >
      {children}
    </ToolExecutionErrorBoundary>
  )
}