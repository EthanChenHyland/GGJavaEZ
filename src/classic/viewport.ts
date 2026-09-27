import type { DiagramRect } from './classicScene'

export const classicHomeView: DiagramRect = { x: 0, y: 0, width: 1000, height: 650 }

export function constrainClassicView(view: DiagramRect): DiagramRect {
  const width = Math.max(400, Math.min(1250, view.width))
  const height = width * 0.65
  return { x: Math.max(-width * 0.4, Math.min(1000 - width * 0.6, view.x)), y: Math.max(-height * 0.4, Math.min(560 - height * 0.6, view.y)), width, height }
}

export function zoomClassicView(view: DiagramRect, direction: 'in' | 'out'): DiagramRect {
  const width = Math.max(400, Math.min(1250, view.width * (direction === 'in' ? 0.8 : 1.25)))
  const height = width * 0.65
  return constrainClassicView({ x: view.x + (view.width - width) / 2, y: view.y + (view.height - height) * (280 / 650), width, height })
}

export function focusClassicView(rect: DiagramRect): DiagramRect {
  const width = Math.min(1000, Math.max(500, rect.width + 192, (rect.height + 160) * (1000 / 560)))
  const height = width * 0.65
  return constrainClassicView({ x: rect.x + rect.width / 2 - width / 2, y: rect.y + rect.height / 2 - width * 0.28, width, height })
}
