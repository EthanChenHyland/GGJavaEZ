import { lazy, Suspense } from 'react'
import { color, shellLayers } from './theme/tokens'

import ReactDOM from 'react-dom/client'
import './app/base.css'
import {retirePresentationPreferences} from './app/presentationPreferences'

const AppRoot = lazy(() => import('./app/AppRoot').then(module => ({ default: module.AppRoot })))

for (const [name, value] of Object.entries(shellLayers)) document.documentElement.style.setProperty(`--layer-${name}`, String(value))
try { retirePresentationPreferences(localStorage) } catch { /* Storage access may be blocked. */ }
const kebab=(name:string)=>name.replace(/[A-Z]/g,letter=>`-${letter.toLowerCase()}`)
for (const [role, palette] of Object.entries(color)) for (const [name, value] of Object.entries(palette))
  document.documentElement.style.setProperty(`--color-${kebab(role)}-${kebab(name)}`, value)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <Suspense fallback={<div className="ide-loading">Opening Java workspace…</div>}><AppRoot /></Suspense>,
)
