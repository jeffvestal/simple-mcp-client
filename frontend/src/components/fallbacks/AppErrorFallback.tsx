import type { ErrorFallbackProps } from '../ErrorBoundary'
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { useErrorLogger } from '../../lib/errorLogger'

export function AppErrorFallback({ 
  error, 
  errorInfo, 
  resetError, 
  errorCount 
}: ErrorFallbackProps) {
  const { exportLogs } = useErrorLogger()
  const isDevelopment = import.meta.env.DEV

  const handleResetApp = () => {
    resetError()
    // Clear any potentially corrupted state
    try {
      // Clear localStorage if it might be corrupted
      if (errorCount > 3) {
        const confirm = window.confirm(
          'Multiple errors detected. Clear application storage? This will reset your settings but may resolve the issue.'
        )
        if (confirm) {
          localStorage.clear()
          sessionStorage.clear()
        }
      }
    } catch (err) {
      console.error('Failed to clear storage:', err)
    }
  }

  const handleExportLogs = () => {
    try {
      const logs = exportLogs()
      const blob = new Blob([logs], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `app-error-logs-${new Date().getTime()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (exportError) {
      console.error('Failed to export logs:', exportError)
    }
  }

  const handleRefreshPage = () => {
    window.location.reload()
  }

  const handleGoHome = () => {
    window.location.href = '/'
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full border-destructive/20">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <AlertTriangle className="h-16 w-16 text-destructive" />
              <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-1">
                <Bug className="h-6 w-6 text-muted-foreground" />
              </div>
            </div>
          </div>
          <CardTitle className="text-2xl">
            Application Error
          </CardTitle>
          <CardDescription className="text-base">
            Something went wrong with the Simple MCP Client
            {errorCount > 1 && (
              <span className="text-amber-600 dark:text-amber-400 block mt-1">
                This error has occurred {errorCount} times
              </span>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Error Details */}
          <div className="space-y-3">
            <div className="text-sm">
              <p className="font-medium text-foreground mb-2">Error Information:</p>
              <div className="bg-destructive/5 border border-destructive/20 p-3 rounded">
                <p className="font-mono text-sm text-destructive">
                  {error.message}
                </p>
              </div>
            </div>

            {isDevelopment && errorInfo && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground mb-2">
                  Developer Information
                </summary>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Stack Trace:</p>
                    <div className="bg-muted p-2 rounded overflow-x-auto">
                      <pre className="text-xs">{error.stack}</pre>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Component Stack:</p>
                    <div className="bg-muted p-2 rounded overflow-x-auto">
                      <pre className="text-xs">{errorInfo.componentStack}</pre>
                    </div>
                  </div>
                </div>
              </details>
            )}
          </div>

          {/* Recovery Actions */}
          <div className="space-y-4">
            <div className="text-sm font-medium">Try these recovery options:</div>
            
            <div className="grid gap-3">
              <Button
                onClick={handleResetApp}
                className="gap-2 justify-start"
                size="lg"
              >
                <RefreshCw className="h-4 w-4" />
                Reset Application
              </Button>
              
              <Button
                onClick={handleRefreshPage}
                variant="outline"
                className="gap-2 justify-start"
                size="lg"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh Page
              </Button>
              
              <Button
                onClick={handleGoHome}
                variant="outline"
                className="gap-2 justify-start"
                size="lg"
              >
                <Home className="h-4 w-4" />
                Go to Home
              </Button>
            </div>

            {isDevelopment && (
              <Button
                onClick={handleExportLogs}
                variant="ghost"
                className="gap-2 justify-start w-full"
                size="sm"
              >
                <Bug className="h-4 w-4" />
                Export Error Logs (Dev)
              </Button>
            )}
          </div>

          {/* Persistent Error Warning */}
          {errorCount > 3 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4 rounded">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-200 mb-2">
                    Critical Error Pattern Detected
                  </p>
                  <p className="text-amber-700 dark:text-amber-300 mb-3">
                    The application has crashed {errorCount} times. This suggests a serious issue that may require:
                  </p>
                  <ul className="text-amber-700 dark:text-amber-300 list-disc ml-5 space-y-1 mb-3">
                    <li>Clearing browser cache and cookies</li>
                    <li>Updating your browser</li>
                    <li>Checking network connectivity</li>
                    <li>Disabling browser extensions</li>
                    <li>Contacting support with error details</li>
                  </ul>
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Consider exporting error logs before refreshing if you need to report this issue.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Help Information */}
          <div className="border-t pt-4 text-center">
            <p className="text-sm text-muted-foreground">
              If this error persists, please refresh the page or contact support.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Error ID: {new Date().getTime()} | 
              Time: {new Date().toLocaleString()}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}