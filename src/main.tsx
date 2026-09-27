import React from 'react'
import { colors, shellLayers } from './theme/tokens'

import ReactDOM from 'react-dom/client'
import { App } from './app/App'
import './app/styles.css'

for (const [name, value] of Object.entries(shellLayers)) document.documentElement.style.setProperty(`--layer-${name}`, String(value))
for (const [name, value] of Object.entries(colors)) document.documentElement.style.setProperty(`--color-${name}`, value)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
