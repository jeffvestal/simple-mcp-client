import { useState } from 'react'
import { useStore } from './store/useStore'

function AppWithStore() {
  const [count, setCount] = useState(0)
  const { isDarkMode, toggleTheme } = useStore()

  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'Arial, sans-serif',
      backgroundColor: isDarkMode ? '#333' : '#fff',
      color: isDarkMode ? '#fff' : '#333',
      minHeight: '100vh'
    }}>
      <h1>Simple MCP Chat Client with Store</h1>
      <p>This tests if the Zustand store is working.</p>
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={() => setCount(count + 1)}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#007bff', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          Count: {count}
        </button>
        <button 
          onClick={toggleTheme}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: isDarkMode ? '#ffc107' : '#6c757d', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {isDarkMode ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>
      <p>Current theme: {isDarkMode ? 'Dark' : 'Light'}</p>
    </div>
  )
}

export default AppWithStore