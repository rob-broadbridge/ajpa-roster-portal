import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PortalAccessBoundary from './components/PortalAccessBoundary.jsx'
import PortalErrorBoundary from './components/PortalErrorBoundary.jsx'

document.title = import.meta.env.DEV ? '🛠 LOCAL — AJPA Roster Portal' : 'AJPA Roster Portal'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PortalErrorBoundary>
      <PortalAccessBoundary />
    </PortalErrorBoundary>
  </StrictMode>,
)
