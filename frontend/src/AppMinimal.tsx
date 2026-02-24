import { useEffect, useState } from 'react'
import { useStore } from './store/useStore'
import { api } from './lib/api'
import { Button } from './components/ui/button'
import { Settings, Sun, Moon, MessageCircle } from 'lucide-react'
import { ChatInterfaceWithErrorBoundary } from './components/ChatInterfaceWithErrorBoundary'
import { SettingsPage } from './components/SettingsPage'
import { Toaster } from './components/ui/toaster'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppErrorFallback } from './components/fallbacks/AppErrorFallback'
import { SettingsErrorFallback } from './components/fallbacks/SettingsErrorFallback'
import { logComponentError } from './lib/errorLogger'
import type { ErrorInfo } from 'react'

type View = 'chat' | 'settings'

function AppMinimalCore() {
  const { isDarkMode, toggleTheme, activeLLMConfig, setActiveLLMConfig } = useStore()
  const [currentView, setCurrentView] = useState<View>('chat')

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDarkMode])

  useEffect(() => {
    const handleNavigateToSettings = () => {
      setCurrentView('settings')
    }
    
    window.addEventListener('navigateToSettings', handleNavigateToSettings)
    return () => window.removeEventListener('navigateToSettings', handleNavigateToSettings)
  }, [])

  // Load and auto-activate LLM configurations on startup
  useEffect(() => {
    const loadLLMConfigs = async () => {
      try {
        const llmResponse = await api.getLLMConfigs()
        const active = llmResponse.find((config: any) => config.is_active)
        
        // Auto-activate if there's only one LLM and none is active
        if (!active && llmResponse.length === 1) {
          try {
            await api.activateLLMConfig(llmResponse[0].id)
            // Get updated config after activation
            const updatedResponse = await api.getLLMConfigs()
            const newActive = updatedResponse.find((config: any) => config.is_active)
            setActiveLLMConfig(newActive || null)
          } catch (error) {
            console.error('Auto-activation failed:', error)
            setActiveLLMConfig(null)
          }
        } else {
          setActiveLLMConfig(active || null)
        }
      } catch (error) {
        console.error('Failed to load LLM configurations:', error)
        setActiveLLMConfig(null)
      }
    }

    loadLLMConfigs()
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Simple MCP Client</h1>
            <img 
              src="/robot-logo.png" 
              alt="Robot Logo" 
              className="h-8 w-auto"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={currentView === 'chat' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCurrentView('chat')}
              className="gap-2"
            >
              <MessageCircle className="h-4 w-4" />
              Chat
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="rounded-full"
            >
              {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <div className="relative">
              <Button
                variant={currentView === 'settings' ? 'default' : 'ghost'}
                size="icon"
                onClick={() => setCurrentView('settings')}
                className="rounded-full"
              >
                <Settings className="h-5 w-5" />
              </Button>
              {/* LLM Status Indicator */}
              <div 
                className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-background ${
                  activeLLMConfig ? 'bg-green-500' : 'bg-red-500'
                }`}
                title={activeLLMConfig ? 'LLM Connected' : 'No LLM Configuration'}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {currentView === 'chat' ? (
          <div className="h-full">
            <ChatInterfaceWithErrorBoundary />
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <ErrorBoundary
              fallback={SettingsErrorFallback}
              onError={(error, errorInfo) => {
                logComponentError(
                  'Settings page error',
                  error,
                  errorInfo,
                  { component: 'SettingsPage' }
                )
              }}
              errorBoundaryKey="settings-page"
            >
              <SettingsPage />
            </ErrorBoundary>
          </div>
        )}
      </main>

      <Toaster />
    </div>
  )
}

// Main App component wrapped with app-level error boundary
function AppMinimal() {
  const handleAppError = (error: Error, errorInfo: ErrorInfo) => {
    logComponentError(
      'Application-level error boundary triggered',
      error,
      errorInfo,
      {
        component: 'AppMinimal',
        severity: 'critical',
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
      }
    )

    // Log critical app errors with extra detail
    console.group('🚨 CRITICAL APPLICATION ERROR')
    console.error('Error:', error.message)
    console.error('Stack:', error.stack)
    console.error('Component Stack:', errorInfo.componentStack)
    console.error('Location:', window.location.href)
    console.groupEnd()
  }

  return (
    <ErrorBoundary
      fallback={AppErrorFallback}
      onError={handleAppError}
      enableRetry={true}
      errorBoundaryKey="app-level"
    >
      <AppMinimalCore />
    </ErrorBoundary>
  )
}

export default AppMinimal