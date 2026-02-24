import React, { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'

interface Props {
  children: ReactNode
  fallback?: React.ComponentType<ErrorFallbackProps>
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  isolateErrors?: boolean
  enableRetry?: boolean
  errorBoundaryKey?: string
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  errorCount: number
}

export interface ErrorFallbackProps {
  error: Error
  errorInfo: ErrorInfo | null
  resetError: () => void
  errorCount: number
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const isDevelopment = import.meta.env.DEV

    // Log error details
    if (isDevelopment) {
      console.group(`🔴 Error Boundary Caught Error${this.props.errorBoundaryKey ? ` (${this.props.errorBoundaryKey})` : ''}`)
      console.error('Error:', error)
      console.error('Error Info:', errorInfo)
      console.error('Component Stack:', errorInfo.componentStack)
      console.groupEnd()
    } else {
      // In production, log minimal information
      console.error(`Error caught by boundary${this.props.errorBoundaryKey ? ` (${this.props.errorBoundaryKey})` : ''}:`, error.message)
    }

    // Update state with error details
    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1
    }))

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    // In production, you might want to send this to an error reporting service
    if (!isDevelopment) {
      // Example: sendToErrorReportingService(error, errorInfo)
    }
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback
        return (
          <FallbackComponent
            error={this.state.error}
            errorInfo={this.state.errorInfo}
            resetError={this.resetError}
            errorCount={this.state.errorCount}
          />
        )
      }

      // Default fallback UI
      return <DefaultErrorFallback
        error={this.state.error}
        errorInfo={this.state.errorInfo}
        resetError={this.resetError}
        errorCount={this.state.errorCount}
        enableRetry={this.props.enableRetry !== false}
      />
    }

    return this.props.children
  }
}

// Default error fallback component
export function DefaultErrorFallback({ 
  error, 
  errorInfo, 
  resetError, 
  errorCount,
  enableRetry = true 
}: ErrorFallbackProps & { enableRetry?: boolean }) {
  const isDevelopment = import.meta.env.DEV

  return (
    <div className="flex items-center justify-center min-h-[400px] p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle>Something went wrong</CardTitle>
          </div>
          <CardDescription>
            {errorCount > 1 && (
              <span className="text-amber-600 dark:text-amber-400">
                This error has occurred {errorCount} times. 
              </span>
            )}
            {' '}An unexpected error occurred. The application has recovered and you can continue using it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Error:</p>
            <p className="font-mono text-xs bg-muted p-2 rounded">
              {error.message}
            </p>
          </div>

          {isDevelopment && errorInfo && (
            <details className="text-xs">
              <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                Developer Details
              </summary>
              <div className="mt-2 space-y-2">
                <div className="bg-muted p-2 rounded overflow-x-auto">
                  <pre className="text-xs">{error.stack}</pre>
                </div>
                <div className="bg-muted p-2 rounded overflow-x-auto">
                  <pre className="text-xs">{errorInfo.componentStack}</pre>
                </div>
              </div>
            </details>
          )}

          {enableRetry && (
            <div className="flex gap-2">
              <Button
                onClick={resetError}
                variant="default"
                size="sm"
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                size="sm"
              >
                Refresh Page
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Specialized error boundary for async operations
export class AsyncErrorBoundary extends ErrorBoundary {
  componentDidMount() {
    // Listen for unhandled promise rejections
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection)
  }

  componentWillUnmount() {
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection)
  }

  handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const error = new Error(
      event.reason?.message || event.reason?.toString() || 'Unhandled promise rejection'
    )
    
    // Prevent default browser behavior
    event.preventDefault()
    
    // Trigger error boundary
    this.setState({
      hasError: true,
      error,
      errorInfo: null,
      errorCount: this.state.errorCount + 1
    })

    // Log in development
    if (import.meta.env.DEV) {
      console.error('Unhandled promise rejection caught by AsyncErrorBoundary:', event.reason)
    }
  }
}

// HOC for wrapping components with error boundary
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  )
  
  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`
  
  return WrappedComponent
}