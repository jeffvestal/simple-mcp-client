import type { ErrorFallbackProps } from '../ErrorBoundary'
import { AlertTriangle, RefreshCw, MessageCircle, Download } from 'lucide-react'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { useStore } from '../../store/useStore'
import { useToast } from '../ui/use-toast'

export function ChatErrorFallback({ 
  error, 
  errorInfo, 
  resetError, 
  errorCount 
}: ErrorFallbackProps) {
  const { messages } = useStore()
  const { toast } = useToast()
  const isDevelopment = import.meta.env.DEV

  const handleExportConversation = () => {
    try {
      const conversationData = {
        timestamp: new Date().toISOString(),
        messageCount: messages.length,
        messages: messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          toolCallsCount: msg.tool_calls?.length || 0
        })),
        error: {
          message: error.message,
          stack: error.stack
        }
      }

      const blob = new Blob([JSON.stringify(conversationData, null, 2)], { 
        type: 'application/json' 
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `chat-conversation-${new Date().getTime()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: "Conversation exported",
        description: "Your chat history has been saved to a file."
      })
    } catch (exportError) {
      console.error('Failed to export conversation:', exportError)
      toast({
        title: "Export failed",
        description: "Could not export conversation data.",
        variant: "destructive"
      })
    }
  }

  const handleRefreshChat = () => {
    resetError()
    toast({
      title: "Chat interface refreshed",
      description: "The chat interface has been restored."
    })
  }

  return (
    <div className="flex items-center justify-center min-h-[600px] p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <div>
              <CardTitle className="text-lg">Chat Interface Error</CardTitle>
              <CardDescription>
                The chat interface encountered an error but your conversation history is safe
                {errorCount > 1 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {' '}(Error occurred {errorCount} times)
                  </span>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Conversation Status */}
          <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="font-medium text-green-800 dark:text-green-200">
                Conversation Preserved
              </span>
            </div>
            <p className="text-sm text-green-700 dark:text-green-300">
              Your chat history with {messages.length} messages is safe and will be restored when you continue.
            </p>
          </div>

          {/* Error Information */}
          <div className="space-y-3">
            <div className="text-sm">
              <p className="font-medium text-foreground mb-2">Error Details:</p>
              <div className="bg-muted p-3 rounded font-mono text-xs break-words">
                {error.message}
              </div>
            </div>

            {isDevelopment && errorInfo && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                  Technical Details (Development)
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
          </div>

          {/* Recovery Actions */}
          <div className="space-y-4">
            <div className="flex gap-3 flex-wrap">
              <Button
                onClick={handleRefreshChat}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Restore Chat
              </Button>
              
              <Button
                onClick={handleExportConversation}
                variant="outline"
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export Conversation
              </Button>
              
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
              >
                Refresh Page
              </Button>
            </div>

            {errorCount > 2 && (
              <div className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 rounded border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Persistent Error Detected</p>
                    <p className="mt-1">
                      The chat interface has failed {errorCount} times. This might indicate:
                    </p>
                    <ul className="mt-2 ml-4 list-disc space-y-1">
                      <li>Network connectivity issues</li>
                      <li>Browser compatibility problems</li>
                      <li>Corrupted application state</li>
                      <li>Server-side issues</li>
                    </ul>
                    <p className="mt-2">
                      Try refreshing the page or exporting your conversation before continuing.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Help Text */}
          <div className="text-xs text-muted-foreground border-t pt-4">
            <p>
              If this error persists, your conversation data remains safe and can be exported. 
              The error has been logged for debugging purposes.
            </p>
            {isDevelopment && (
              <p className="mt-1">
                Check the browser console for additional debugging information.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}