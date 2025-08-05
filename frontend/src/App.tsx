import { useEffect, useState } from 'react'
import { useStore } from './store/useStore'
import { Button } from './components/ui/button'
import { Settings, Sun, Moon, MessageCircle } from 'lucide-react'
import { ChatInterface } from './components/ChatInterface'
import { SettingsPage } from './components/SettingsPage'
import { Toaster } from './components/ui/toaster'

type View = 'chat' | 'settings'

function App() {
  const { isDarkMode, toggleTheme } = useStore()
  const [currentView, setCurrentView] = useState<View>('chat')

  useEffect(() => {
    // Apply theme to document
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDarkMode])

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Simple MCP Chat Client</h1>
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
            <Button
              variant={currentView === 'settings' ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setCurrentView('settings')}
              className="rounded-full"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {currentView === 'chat' ? (
          <div className="h-full">
            <ChatInterface />
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <SettingsPage />
          </div>
        )}
      </main>

      <Toaster />
    </div>
  )
}

export default App
