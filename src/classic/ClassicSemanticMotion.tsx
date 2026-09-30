import type { FlowEndpoint, SemanticTransition } from '../motion/semanticTransition'
import { colors, motionMs, typography } from '../theme/tokens'
import type { ClassicScene, DiagramRect } from './classicScene'

type Point = readonly [number, number]
const center = (rect: DiagramRect): Point => [rect.x + rect.width / 2, rect.y + rect.height / 2]

/** Project the same semantic endpoints used by Spatial into Classic's stable diagram. */
export function classicEndpoint(endpoint: FlowEndpoint | undefined, diagram: ClassicScene): Point | null {
  if (!endpoint) return null
  if (endpoint.kind === 'io') return endpoint.id === 'stdin' ? [35, 560] : [1000, 560]
  const entity = diagram.entities.find((item) => item.id === endpoint.id)
  if (entity) return center(entity.rect)
  for (const item of diagram.entities) {
    const row = [...item.slots, ...(item.array?.cells ?? [])].find((candidate) => candidate.slot.id === endpoint.id)
    if (row) return center(row.rect)
  }
  return null
}

function label(transition: SemanticTransition): string {
  const value = transition.value
  if (value?.kind === 'primitive' || value?.kind === 'stringSummary') return String(value.value).slice(0, 22)
  if (value?.kind === 'reference') return `→ ${value.javaType}`
  return value?.kind === 'null' ? 'null' : transition.kind.replaceAll('-', ' ')
}

export function ClassicSemanticMotion({ transition, diagram, reduced }: { transition: SemanticTransition; diagram: ClassicScene; reduced: boolean }) {
  const to = classicEndpoint(transition.to, diagram)
  if (!to) return null
  const from = classicEndpoint(transition.from, diagram) ?? [to[0] - 50, to[1] - 26]
  const color = transition.kind === 'exception' ? colors.exception
    : transition.kind === 'field-write' || transition.kind === 'array-write' ? colors.mutation
      : transition.kind === 'return' ? colors.success : colors.execution
  const text = label(transition)
  const path = `M ${from[0]} ${from[1]} L ${to[0]} ${to[1]}`
  return <g role="img" aria-label={`${transition.kind.replaceAll('-', ' ')}: ${transition.label}`} data-semantic-motion={transition.id}>
    {!reduced && <path d={path} fill="none" stroke={color} strokeWidth={2} strokeOpacity={transition.evidence === 'correlated' ? 0.35 : 0.65} strokeDasharray={transition.evidence === 'correlated' ? '5 4' : undefined} />}
    <g transform={reduced ? `translate(${to[0]} ${to[1]})` : undefined}>
      {!reduced && <animateMotion dur={`${motionMs.standard}ms`} path={path} fill="freeze" />}
      <rect x={-Math.max(20, text.length * 4 + 9)} y={-15} width={Math.max(40, text.length * 8 + 18)} height={30} rx={4} fill={colors.canvas} stroke={color} strokeWidth={2} />
      <text y={5} textAnchor="middle" fontFamily={typography.code} fontSize={14} fill={color}>{text}</text>
    </g>
  </g>
}
