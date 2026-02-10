import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import './themes.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext'
import { initTheme } from './utils/theme'

// Apply persisted theme before React mounts to prevent FOUC
initTheme()

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

createRoot(rootElement).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
)
