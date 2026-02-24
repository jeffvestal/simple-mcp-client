import type { ErrorFallbackProps } from '../ErrorBoundary'
import { AlertTriangle, RefreshCw, Settings, Save } from 'lucide-react'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { useToast } from '../ui/use-toast'
import { safeJsonParseWithDefault } from '../../lib/safeJson'

export function SettingsErrorFallback({ 
  error, 
  errorInfo, 
  resetError, 
  errorCount 
}: ErrorFallbackProps) {
  const { toast } = useToast()
  const isDevelopment = import.meta.env.DEV

  const handleRetrySettings = () => {
    resetError()
    toast({
      title: "Settings restored",
      description: "The settings interface has been recovered."
    })
  }

  const handleBackupSettings = () => {
    try {
      // Attempt to backup current settings from localStorage
      const settings: Record<string, any> = {}
      
      // Common settings keys that might be stored
      const settingsKeys = [
        'simple-mcp-client-theme',
        'simple-mcp-client-llm-configs',
        'simple-mcp-client-mcp-servers'
      ]
      
      settingsKeys.forEach(key => {
        const value = localStorage.getItem(key)
        if (value) {
          const parsed = safeJsonParseWithDefault(value, value, `settings-backup-${key}`)
          settings[key] = parsed
        }
      })

      if (Object.keys(settings).length > 0) {
        const blob = new Blob([JSON.stringify(settings, null, 2)], { 
          type: 'application/json' 
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `settings-backup-${new Date().getTime()}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        toast({
          title: "Settings backed up",
          description: "Your settings have been saved to a file."
        })
      } else {
        toast({
          title: "No settings found",
          description: "No settings data could be found to backup.",
          variant: "default"
        })
      }
    } catch (backupError) {
      console.error('Failed to backup settings:', backupError)
      toast({
        title: "Backup failed",
        description: "Could not backup settings data.",
        variant: "destructive"
      })
    }
  }

  const handleClearCorruptedSettings = () => {
    const confirmed = window.confirm(
      'This will clear all settings and return to defaults. Are you sure?'
    )
    
    if (confirmed) {
      try {
        // Clear settings-related localStorage items
        const keysToRemove = Object.keys(localStorage).filter(key => 
          key.includes('simple-mcp-client')
        )
        
        keysToRemove.forEach(key => {
          localStorage.removeItem(key)
        })

        toast({
          title: "Settings cleared",
          description: "All settings have been reset to defaults."
        })

        // Reset the error boundary
        resetError()
      } catch (clearError) {
        console.error('Failed to clear settings:', clearError)
        toast({
          title: "Clear failed",
          description: "Could not clear settings data.",
          variant: "destructive"
        })
      }
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[500px] p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <CardTitle>Settings Error</CardTitle>
              <CardDescription>
                The settings interface encountered an error
                {errorCount > 1 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {' '}({errorCount} times)
                  </span>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Error Details */}
          <div className="space-y-3">
            <div className="text-sm">
              <p className="font-medium text-foreground mb-1">Error:</p>
              <div className="bg-muted p-2 rounded font-mono text-xs break-words">
                {error.message}
              </div>
            </div>

            {isDevelopment && errorInfo && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                  Debug Information
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
          <div className="space-y-3">
            <Button
              onClick={handleRetrySettings}
              className="w-full gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Retry Settings
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleBackupSettings}
                variant="outline"
                size="sm"
                className="gap-1"
              >
                <Save className="h-3 w-3" />
                Backup
              </Button>
              
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                size="sm"
                className="gap-1"
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </Button>
            </div>

            {errorCount > 2 && (
              <Button
                onClick={handleClearCorruptedSettings}
                variant="destructive"
                size="sm"
                className="w-full gap-1"
              >
                <Settings className="h-3 w-3" />
                Reset All Settings
              </Button>
            )}
          </div>

          {/* Settings Safety Info */}
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-3 rounded text-sm">
            <div className="flex items-start gap-2">
              <Settings className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-blue-800 dark:text-blue-200">
                <p className="font-medium mb-1">Settings Data Safety</p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Your LLM configurations and server settings are stored locally and can be backed up before making changes.
                </p>
              </div>
            </div>
          </div>

          {/* Persistent Error Help */}
          {errorCount > 3 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 rounded text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-amber-800 dark:text-amber-200">
                  <p className="font-medium mb-1">Persistent Settings Error</p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                    Multiple settings errors suggest corrupted data. Consider:
                  </p>
                  <ul className="text-xs text-amber-700 dark:text-amber-300 list-disc ml-4 space-y-1">
                    <li>Backing up current settings first</li>
                    <li>Clearing browser storage</li>
                    <li>Refreshing the page</li>
                    <li>Checking for browser issues</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}