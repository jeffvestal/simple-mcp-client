import { useState, useEffect } from 'react'
import { useStore } from './store/useStore'
import { Button } from './components/ui/button'

function AppWithUI() {
  const [count, setCount] = useState(0)
  const { isDarkMode, toggleTheme } = useStore()

  useEffect(() => {
    // Apply theme to document root for Tailwind dark mode
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDarkMode])

  return (
    <div className="min-h-screen p-8 bg-background text-foreground transition-colors">
      <h1 className="text-3xl font-bold mb-4">Simple MCP Chat Client with UI</h1>
      <p className="mb-6">This tests if Shadcn/ui components are working.</p>
      
      <div className="space-x-4 mb-6">
        <Button 
          onClick={() => setCount(count + 1)}
          variant="default"
        >
          Count: {count}
        </Button>
        
        <Button 
          onClick={toggleTheme}
          variant="outline"
        >
          {isDarkMode ? '☀️ Light' : '🌙 Dark'}
        </Button>
      </div>
      
      <p className="text-muted-foreground">Current theme: {isDarkMode ? 'Dark' : 'Light'}</p>
    </div>
  )
}

export default AppWithUI