import { useState, useEffect } from 'react'
import { useStore } from './store/useStore'

function AppTailwindTest() {
  const [count, setCount] = useState(0)
  const { isDarkMode, toggleTheme } = useStore()

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDarkMode])

  return (
    <div className="min-h-screen p-8">
      {/* Test basic Tailwind classes */}
      <div className="bg-blue-500 text-white p-4 rounded-lg mb-4">
        <h1 className="text-2xl font-bold">Tailwind Blue Box Test</h1>
        <p>If this box is blue, basic Tailwind is working</p>
      </div>

      {/* Test dark mode classes */}
      <div className="bg-white dark:bg-gray-800 text-black dark:text-white p-4 rounded-lg mb-4 border">
        <h2 className="text-xl font-semibold mb-2">Dark Mode Test</h2>
        <p>This should have white background in light mode, dark gray in dark mode</p>
        <p>Text should be black in light mode, white in dark mode</p>
      </div>

      <div className="space-x-4 mb-4">
        <button 
          onClick={() => setCount(count + 1)}
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
        >
          Count: {count}
        </button>
        
        <button 
          onClick={toggleTheme}
          className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded"
        >
          {isDarkMode ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>
      
      <p className="text-sm">Current theme: {isDarkMode ? 'Dark' : 'Light'}</p>
    </div>
  )
}

export default AppTailwindTest