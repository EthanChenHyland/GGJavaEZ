import { lazy, Suspense } from 'react'
import { colors, shellLayers } from './theme/tokens'

import ReactDOM from 'react-dom/client'
import './app/styles.css'

const AppRoot = lazy(() => import('./app/AppRoot').then(module => ({ default: module.AppRoot })))

for (const [name, value] of Object.entries(shellLayers)) document.documentElement.style.setProperty(`--layer-${name}`, String(value))
for (const [name, value] of Object.entries(colors)) document.documentElement.style.setProperty(`--color-${name}`, value)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <Suspense fallback={<div className="ide-loading">Opening Java workspace…</div>}><AppRoot /></Suspense>,
)
