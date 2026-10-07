import type { DiagramEntity, DiagramRect } from './classicScene'

export const classicHomeView: DiagramRect = { x: 0, y: 0, width: 1000, height: 650 }

/** Drawn rows/cells also participate when they extend beyond their owner card. */
export function classicDiagramBounds(entities: readonly DiagramEntity[]): DiagramRect | null {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  const include = (rect: DiagramRect) => {
    left = Math.min(left, rect.x)
    top = Math.min(top, rect.y)
    right = Math.max(right, rect.x + rect.width)
    bottom = Math.max(bottom, rect.y + rect.height)
  }
  for (const entity of entities) {
    include(entity.rect)
    for (const row of entity.slots) include(row.rect)
    for (const cell of entity.array?.cells ?? []) include(cell.rect)
    for (const scope of entity.scopes ?? []) include(scope.rect)
  }
  return entities.length ? { x: left, y: top, width: right - left, height: bottom - top } : null
}

/** Small curated scenes retain their exact Home; large worlds retain readable zoom. */
export function classicHomeForDiagram(entities: readonly DiagramEntity[], bounds = classicDiagramBounds(entities)): DiagramRect {
  if (!entities.length || !bounds || bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 1000 && bounds.y + bounds.height <= 650) return classicHomeView
  const requiredWidth = Math.max(1000, bounds.width + 64, (bounds.height + 64) / 0.65)
  const width = Math.min(1250, requiredWidth)
  const height = width * 0.65
  let centerX = bounds.x + bounds.width / 2, centerY = bounds.y + bounds.height / 2
  if (requiredWidth > 1250) {
    // A capped view cannot fit an arbitrarily large world. Use an actual entity
    // (an observed cell for arrays), rather than the empty midpoint of its extent.
    let nearest: DiagramRect | undefined, nearestDistance = Infinity, nearestId = ''
    for (const entity of entities) {
      const candidates = entity.array?.cells.length ? entity.array.cells.map(cell => ({ id: cell.slot.id, rect: cell.rect })) : [{ id: entity.id, rect: entity.rect }]
      for (const candidate of candidates) {
        const rect = candidate.rect
        const distance = Math.hypot(rect.x + rect.width / 2 - centerX, rect.y + rect.height / 2 - centerY)
        if (distance < nearestDistance || distance === nearestDistance && candidate.id < nearestId) {
          nearest = rect; nearestDistance = distance; nearestId = candidate.id
        }
      }
    }
    if (nearest) { centerX = nearest.x + nearest.width / 2; centerY = nearest.y + nearest.height / 2 }
  }
  return constrainClassicView({ x: centerX - width / 2, y: centerY - height / 2, width, height }, bounds)
}

export function constrainClassicView(view: DiagramRect, bounds?: DiagramRect | null): DiagramRect {
  const width = Math.max(400, Math.min(1250, view.width))
  const height = width * 0.65
  // Keep the original curated navigation region and extend it to every genuine
  // projected entity. Coordinate reach grows; the zoom range does not.
  const left = Math.min(0, bounds?.x ?? 0), top = Math.min(0, bounds?.y ?? 0)
  const right = Math.max(1000, bounds ? bounds.x + bounds.width : 1000)
  const bottom = Math.max(560, bounds ? bounds.y + bounds.height : 560)
  return { x: Math.max(left - width * 0.4, Math.min(right - width * 0.6, view.x)),
    y: Math.max(top - height * 0.4, Math.min(bottom - height * 0.6, view.y)), width, height }
}

export function zoomClassicView(view: DiagramRect, direction: 'in' | 'out', bounds?: DiagramRect | null): DiagramRect {
  const width = Math.max(400, Math.min(1250, view.width * (direction === 'in' ? 0.8 : 1.25)))
  const height = width * 0.65
  return constrainClassicView({ x: view.x + (view.width - width) / 2, y: view.y + (view.height - height) * (280 / 650), width, height }, bounds)
}

export function focusClassicView(rect: DiagramRect, bounds?: DiagramRect | null): DiagramRect {
  const width = Math.min(1000, Math.max(500, rect.width + 192, (rect.height + 160) * (1000 / 560)))
  const height = width * 0.65
  return constrainClassicView({ x: rect.x + rect.width / 2 - width / 2, y: rect.y + rect.height / 2 - width * 0.28, width, height }, bounds ?? rect)
}
