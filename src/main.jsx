import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import PortalErrorBoundary from './components/PortalErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PortalErrorBoundary>
      <App />
    </PortalErrorBoundary>
  </StrictMode>,
)
