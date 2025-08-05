import { useState } from 'react'

function AppSimple() {
  const [count, setCount] = useState(0)

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Simple MCP Client</h1>
      <p>This is a test to see if React is working.</p>
      <button 
        onClick={() => setCount(count + 1)}
        style={{ 
          padding: '10px 20px', 
          backgroundColor: '#007bff', 
          color: 'white', 
          border: 'none', 
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Count: {count}
      </button>
    </div>
  )
}

export default AppSimple