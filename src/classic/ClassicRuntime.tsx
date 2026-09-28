import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react'
import type { Selection } from '../contracts/interaction'
import type { TraceEvent } from '../contracts/runtime'
import type { SceneModel } from '../contracts/world'
import { useNavigationStore } from '../navigation/navigation'
import { colors, line, motionMs, typography, worldMaterial } from '../theme/tokens'
import { buildClassicScene, emphasizedSlot, relatedReference, selectedBounds, type DiagramEntity, type DiagramRect } from './classicScene'
import { classicHomeView, constrainClassicView, focusClassicView, zoomClassicView } from './viewport'
import { useReducedMotion } from '../scene/primitives/presentationMotion'
import './ClassicRuntime.css'

export interface ClassicRuntimeProps {
  visible?: boolean
  playing?: boolean
  scene: SceneModel
  event: TraceEvent | null
  guided: boolean
  selection: Selection
  onSelect: (selection: NonNullable<Selection>) => void
  onFocusSelected: (selection: NonNullable<Selection>) => void
}

const theme = {
  '--classic-canvas': colors.canvas,
  '--classic-text': colors.text,
  '--classic-secondary': colors.textSecondary,
  '--classic-border': colors.borderStrong,
  '--classic-execution': colors.execution,
  '--classic-mutation': colors.mutation,
  fontFamily: typography.ui,
} as CSSProperties

/** An SVG representation of the shared scene, with a presentation-only viewport. */
export function ClassicRuntime({ visible = true, playing = false, scene, event, guided, selection, onSelect, onFocusSelected }: ClassicRuntimeProps) {
  const diagram = useMemo(() => buildClassicScene(scene), [scene])
  const diagramRef = useRef(diagram)
  diagramRef.current = diagram
  const visibleRef = useRef(visible)
  visibleRef.current = visible
  const [view, setView] = useState(classicHomeView)
  const viewRef = useRef(view)
  const previousView = useRef<DiagramRect | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef<{ x: number; y: number; scale: number; view: DiagramRect; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const motionReduced = useReducedMotion()
  const arrowId = useId().replaceAll(':', '')
  const returnArrowId = `${arrowId}-return`
  const changedSlotId = guided ? emphasizedSlot(event) : null
  const traceReferenceId = useNavigationStore((state) => state.traceReferenceId)

  function changeView(next: DiagramRect) {
    viewRef.current = next
    setView(next)
  }

  useEffect(() => {
    // Existing intents belong to the representation that consumed them. Mounting is never a navigation action.
    let revision = useNavigationStore.getState().intentRevision
    const consumeIntent = () => {
      const state = useNavigationStore.getState()
      if (revision === state.intentRevision) return
      revision = state.intentRevision
      if (!visibleRef.current) return
      const intent = state.intent
      if (!intent) return
      if (intent.kind === 'home' || intent.kind === 'resetView') {
        previousView.current = null
        changeView(classicHomeView)
      } else if (intent.kind === 'zoom') {
        changeView(zoomClassicView(viewRef.current, intent.direction))
      } else if (intent.kind === 'focus' || intent.kind === 'tracePath') {
        const focusSelection: NonNullable<Selection> = intent.kind === 'focus' ? intent.selection : { kind: 'reference', id: intent.referenceId }
        const bounds = selectedBounds(diagramRef.current, focusSelection)
        if (bounds) {
          previousView.current = viewRef.current
          changeView(focusClassicView(bounds))
        }
      } else if (intent.kind === 'returnToPrevious') {
        changeView(previousView.current ?? classicHomeView)
        previousView.current = null
      }
    }
    return useNavigationStore.subscribe(consumeIntent)
  }, [])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const zoom = (wheel: WheelEvent) => {
      if (!visibleRef.current || wheel.deltaY === 0) return
      wheel.preventDefault()
      useNavigationStore.getState().freeExplore()
      changeView(zoomClassicView(viewRef.current, wheel.deltaY < 0 ? 'in' : 'out'))
    }
    svg.addEventListener('wheel', zoom, { passive: false })
    return () => svg.removeEventListener('wheel', zoom)
  }, [])

  const interactions = (target: NonNullable<Selection>) => ({
    tabIndex: visible ? 0 : -1,
    role: 'button' as const,
    'aria-pressed': selection?.kind === target.kind && selection.id === target.id,
    onClick: (click: MouseEvent<SVGElement>) => {
      click.stopPropagation()
      if (!suppressClick.current) onSelect(target)
    },
    onDoubleClick: (click: MouseEvent<SVGElement>) => {
      click.stopPropagation()
      if (!suppressClick.current) { onSelect(target); onFocusSelected(target) }
    },
    onKeyDown: (key: KeyboardEvent<SVGElement>) => {
      if (key.key === 'Enter' || key.key === ' ') { key.preventDefault(); key.stopPropagation(); onSelect(target) }
      if (key.key.toLowerCase() === 'f') { key.preventDefault(); key.stopPropagation(); onSelect(target); onFocusSelected(target) }
    },
  })

  function entity(entity: DiagramEntity) {
    const selected = selection?.kind === entity.kind && selection.id === entity.id
    const linked = diagram.references.some((edge) => relatedReference(edge, selection) && (edge.sourceEntityId === entity.id || edge.targetObjectId === entity.id))
    const accent = entity.kind === 'frame' ? colors.stack : colors.heap
    const body = entity.kind === 'frame' ? worldMaterial.stackFace : worldMaterial.heapFace
    const { x, y, width, height } = entity.rect
    const current = (guided || diagram.deepStack) && entity.active
    const compact = diagram.deepStack && entity.kind === 'frame'
    const headingHeight = compact ? 26 : 64
    const rowTextSize = compact ? 15 : 20
    return <g key={entity.id} data-runtime-id={entity.id} data-runtime-kind={entity.kind}>
      <rect x={x} y={y} width={width} height={height} rx={4} fill={body} stroke={selected ? colors.execution : accent} strokeWidth={selected ? 3 : 1.5} />
      <g className="classic-target classic-heading" {...interactions({ kind: entity.kind, id: entity.id })} aria-label={`${entity.kind === 'frame' ? 'Stack frame' : 'Heap object'} ${entity.label}`}>
        <rect x={x} y={y} width={width} height={headingHeight} rx={4} fill={body} />
        <rect x={x} y={y} width={4} height={headingHeight} fill={current ? colors.execution : accent} />
        <text x={x + 20} y={y + (compact ? 18 : 32)} fontSize={compact ? 18 : 24} fontWeight={600} fill={colors.text}>{entity.label}</text>
        {!compact && <text x={x + 20} y={y + 52} fontSize={12} letterSpacing={1} fill={accent}>{entity.kind === 'frame' ? 'LOCALS / PARAMETERS' : 'FIELDS'}</text>}
        {current && <text x={x + width - 16} y={y + (compact ? 18 : 52)} textAnchor="end" fontSize={12} fill={colors.execution}>EXECUTING</text>}
      </g>
      <line x1={x} y1={y + headingHeight} x2={x + width} y2={y + headingHeight} stroke={accent} strokeOpacity={0.35} />
      {entity.slots.map((row) => {
        const highlighted = row.slot.id === changedSlotId || (guided && event?.type === 'RETURN_VALUE' &&
          event.frameId === entity.id && row.slot.role === 'return')
        const slotSelected = selection?.kind === 'slot' && selection.id === row.slot.id
        const nullValue = row.slot.value.kind === 'null' || row.slot.value.kind === 'uninitialized'
        const rowY = row.rect.y
        const typeX = x + (compact ? 246 : entity.kind === 'frame' ? 116 : 104)
        const valueX = x + (compact ? 300 : entity.kind === 'frame' ? 220 : 190)
        return <g key={row.slot.id} className="classic-target classic-slot" data-slot-id={row.slot.id}
          {...interactions({ kind: 'slot', id: row.slot.id })} aria-label={`${entity.label} ${row.slot.name}${row.slot.role === 'operand' ? ' expression operand' : ''}, ${row.slot.javaType}, ${row.value}`}>
          <rect x={x + 1} y={rowY} width={width - 2} height={row.rect.height} fill={highlighted ? colors.mutation : slotSelected ? colors.execution : linked ? accent : body} fillOpacity={highlighted || slotSelected ? 0.13 : linked ? 0.05 : 1} />
          {highlighted && <rect x={x + 1} y={rowY + 5} width={3} height={row.rect.height - 10} fill={colors.mutation} />}
          <text x={x + 20} y={rowY + row.rect.height / 2 + 6} fontSize={rowTextSize} fill={row.slot.role === 'operand' ? colors.textSecondary : colors.text}>{row.slot.role === 'operand' ? 'call result (operand)' : row.slot.name}</text>
          <text x={typeX} y={rowY + row.rect.height / 2 + 6} fontSize={compact ? 12 : 16} fill={colors.textSecondary}>{row.slot.javaType}</text>
          <text x={valueX} y={rowY + row.rect.height / 2 + 6} fontFamily={typography.code} fontSize={rowTextSize} fill={highlighted ? colors.mutation : row.slot.role === 'return' && !nullValue ? colors.success : nullValue ? colors.null : row.slot.value.kind === 'reference' ? accent : colors.text}>{row.value}</text>
          <line x1={x + 16} y1={rowY + row.rect.height} x2={x + width - 16} y2={rowY + row.rect.height} stroke={colors.borderStrong} strokeOpacity={0.5} />
        </g>
      })}
      {entity.slots.length === 0 && <text x={x + 20} y={y + (compact ? 50 : 100)} fontSize={18} fill={colors.textSecondary}>No locals yet</text>}
    </g>
  }

  return <div className={`classic-view${selection ? ' has-selection' : ''}`} style={theme} aria-hidden={!visible}><svg ref={svgRef} className="classic-runtime" role="group" aria-label="Classic runtime stack and heap diagram"
    data-guided={guided} data-stack-depth={scene.stackDepth ?? 1} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} preserveAspectRatio="xMidYMid meet"
    onPointerDown={(pointer) => {
      if (!visible) return
      if (pointer.button !== 0 && pointer.button !== 2) return
      suppressClick.current = false
      dragging.current = { x: pointer.clientX, y: pointer.clientY, view: viewRef.current, scale: 1 / (svgRef.current?.getScreenCTM()?.a ?? 1), moved: false }
    }}
    onPointerMove={(pointer) => {
      const drag = dragging.current
      if (!drag) return
      const dx = pointer.clientX - drag.x, dy = pointer.clientY - drag.y
      if (!drag.moved && Math.hypot(dx, dy) <= 5) return
      if (!drag.moved) {
        drag.moved = true
        suppressClick.current = true
        svgRef.current?.setPointerCapture(pointer.pointerId)
        useNavigationStore.getState().freeExplore()
      }
      changeView(constrainClassicView({ ...drag.view, x: drag.view.x - dx * drag.scale, y: drag.view.y - dy * drag.scale }))
    }}
    onPointerUp={(pointer) => { dragging.current = null; if (svgRef.current?.hasPointerCapture(pointer.pointerId)) svgRef.current.releasePointerCapture(pointer.pointerId) }}
    onPointerCancel={() => { dragging.current = null }} onContextMenu={(context) => context.preventDefault()}>
    <title>Stack frames on the left, heap objects on the right. Arrows connect named references to their objects.</title>
    <defs>
      <marker id={returnArrowId} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={8} markerHeight={8} orient="auto" markerUnits="userSpaceOnUse">
        <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke={colors.success} strokeWidth={1.7} strokeLinejoin="round" />
      </marker>
      <marker id={arrowId} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={8} markerHeight={8} orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke={colors.execution} strokeWidth={1.7} strokeLinejoin="round" />
      </marker>
    </defs>
    <g aria-hidden="true">
      <text x={diagram.deepStack ? 104 : 72} y={diagram.deepStack ? 36 : 94} fontSize={16} fontWeight={600} letterSpacing={3} fill={colors.stack}>STACK</text>
      <text x={655} y={diagram.deepStack ? 36 : 94} fontSize={16} fontWeight={600} letterSpacing={3} fill={diagram.deepStack && !scene.objects.length ? colors.success : colors.heap}>{diagram.deepStack && !scene.objects.length ? 'RETURN FLOW' : 'HEAP'}</text>
      <line x1={diagram.deepStack ? 104 : 72} y1={diagram.deepStack ? 48 : 108} x2={diagram.deepStack ? 524 : 428} y2={diagram.deepStack ? 48 : 108} stroke={colors.stack} strokeOpacity={0.25} />
      <line x1={655} y1={diagram.deepStack ? 48 : 108} x2={955} y2={diagram.deepStack ? 48 : 108} stroke={diagram.deepStack && !scene.objects.length ? colors.success : colors.heap} strokeOpacity={0.25} />
      {diagram.deepStack && !scene.objects.length && <text x={655} y={68} fontSize={14} fill={colors.textMuted}>No heap allocations</text>}
    </g>
    {diagram.entities.map(entity)}
    {diagram.references.map((edge) => {
      const related = relatedReference(edge, selection) || traceReferenceId === edge.id
      const source = diagram.entities.find((node) => node.id === edge.sourceEntityId)
      const target = diagram.entities.find((node) => node.id === edge.targetObjectId)
      const middleX = (edge.from[0] + edge.to[0]) / 2, middleY = (edge.from[1] + edge.to[1]) / 2
      return <g key={edge.id} className="classic-target classic-reference" data-reference-id={edge.id} {...interactions({ kind: 'reference', id: edge.id })}
        aria-label={`${source?.label} ${edge.label} points to ${target?.label}`}>
        <path d={edge.path} fill="none" stroke={colors.execution} strokeWidth={16} strokeOpacity={0} className="classic-reference-hit" />
        <path d={edge.path} fill="none" stroke={colors.execution} strokeWidth={related ? line.referenceMaxPx : line.referenceDefaultPx} opacity={selection && !related ? 0.5 : 0.9} markerEnd={`url(#${arrowId})`} vectorEffect="non-scaling-stroke" />
        <circle cx={edge.from[0]} cy={edge.from[1]} r={3.5} fill={colors.execution} />
        <text x={middleX} y={middleY - 13} textAnchor="middle" fontSize={16} fill={colors.execution} paintOrder="stroke" stroke={colors.canvas} strokeWidth={6} strokeLinejoin="round">{edge.label}</text>
      </g>
    })}
    {diagram.returnTransfer && <g className="classic-return" data-return-event={diagram.returnTransfer.eventId}
      role="img" aria-label={`${diagram.returnTransfer.fromLabel} returns ${diagram.returnTransfer.value} to ${diagram.returnTransfer.toLabel}${diagram.returnTransfer.expression ? `, ${diagram.returnTransfer.expression}` : ''}`}>
      <path d={diagram.returnTransfer.path} fill="none" stroke={colors.success} strokeWidth={line.referenceDefaultPx} markerEnd={`url(#${returnArrowId})`} vectorEffect="non-scaling-stroke" />
      <circle cx={diagram.returnTransfer.to[0]} cy={diagram.returnTransfer.to[1]} r={3.5} fill={colors.success} />
      <text x={diagram.returnTransfer.from[0] + 112} y={diagram.returnTransfer.from[1] + 5} fontSize={18} fill={colors.success}>{diagram.returnTransfer.fromLabel} returns {diagram.returnTransfer.value}</text>
      {diagram.returnTransfer.expression && <text x={diagram.returnTransfer.from[0] + 112} y={diagram.returnTransfer.from[1] + 29} fontSize={16} fontFamily={typography.code} fill={colors.textSecondary}>{diagram.returnTransfer.expression}</text>}
      <text x={diagram.returnTransfer.to[0] + 112} y={diagram.returnTransfer.to[1] + 5} fontSize={16} fill={colors.textSecondary}>→ {diagram.returnTransfer.toLabel}</text>
      {visible && guided && playing && !motionReduced && event?.type === 'RETURN_VALUE' && event.eventId === diagram.returnTransfer.eventId &&
        <g key={diagram.returnTransfer.eventId} className="classic-return-travel" aria-hidden="true">
          <animateMotion dur={`${motionMs.deliberate}ms`} path={diagram.returnTransfer.path} fill="freeze" />
          <rect x={-17} y={-12} width={34} height={24} rx={4} fill={colors.canvas} stroke={colors.success} />
          <text y={5} textAnchor="middle" fontSize={14} fontFamily={typography.code} fill={colors.success}>{diagram.returnTransfer.value}</text>
        </g>}
    </g>}
  </svg></div>
}
