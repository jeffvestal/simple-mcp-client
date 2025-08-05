import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AppMinimal from './AppMinimal.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppMinimal />
  </StrictMode>,
)
