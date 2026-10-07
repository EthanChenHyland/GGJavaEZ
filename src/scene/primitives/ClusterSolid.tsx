import type { Selection } from '../../contracts/interaction'
import type { PresentationNode, SpatialCluster } from '../../world/spatialPresentation'
import { colors, worldMaterial } from '../../theme/tokens'
import { SolidBody, SolidFace } from './SolidBody'
import { RuntimeLabel } from './RuntimeLabel'

/** Identity-only working representation. The original cuboid/ID remains the
 * pick target; expensive fields are mounted only in micro/selected detail. */
export function IdentitySolid({ node, onSelect, selected = false, showLabels = true }: {
  node: PresentationNode; onSelect: (selection: NonNullable<Selection>) => void; selected?: boolean; showLabels?: boolean
}) {
  const [width, height, depth] = node.anchor.size
  const accent = node.kind === 'frame' ? colors.stack : node.kind === 'class' ? colors.textSecondary : colors.heap
  const historical = node.kind === 'frame' && node.historical
  return <group position={[...node.anchor.position]} onClick={event => { event.stopPropagation(); onSelect({ kind: node.kind, id: node.id }) }}>
    <SolidBody size={node.anchor.size} accent={accent} bodyColor={historical ? worldMaterial.historyBody : node.kind === 'object' ? worldMaterial.heapBody : node.kind === 'class' ? worldMaterial.historyBody : worldMaterial.stackBody} selected={selected} related={false} historical={historical} />
    <SolidFace size={node.anchor.size} color={historical || node.kind === 'class' ? worldMaterial.historyFace : node.kind === 'object' ? worldMaterial.heapFace : worldMaterial.stackFace} accent={accent} />
    <mesh position={[0, height / 2 - 0.06, depth / 2 + 0.015]}>
      <boxGeometry args={[width - 0.12, selected ? 0.06 : 0.025, 0.018]} />
      <meshBasicMaterial color={selected ? colors.execution : accent} />
    </mesh>
    {showLabels && <><RuntimeLabel text={node.label} position={[-width / 2 + 0.22, height / 2 - 0.48, depth / 2 + 0.03]} size={0.3} maxWidth={width - 0.44} role="identity" />
    <RuntimeLabel text={node.kind === 'object' ? `#${node.displayId}` : node.kind === 'class' ? 'CLASS STORAGE' : node.invocationStatus?.toUpperCase() ?? (node.active ? 'ACTIVE' : 'INVOCATION')}
      position={[-width / 2 + 0.22, height / 2 - 0.88, depth / 2 + 0.03]} size={0.19} maxWidth={width - 0.44} color={accent} /></>}
  </group>
}

/** A summary of recorded members, never an invented object or invocation.
 * Selecting it resolves the actual first member; Focus remains an explicit action. */
export function ClusterSolid({ cluster, onSelect, showLabels = true }: { showLabels?: boolean; cluster: SpatialCluster; onSelect: (selection: NonNullable<Selection>) => void }) {
  const [width, height, depth] = cluster.anchor.size
  const accent = cluster.kind === 'frame' ? colors.stack : cluster.kind === 'class' ? colors.textSecondary : colors.heap
  const unit = cluster.kind === 'frame' ? 'invocations' : cluster.kind === 'class' ? 'classes' : 'objects'
  return <group position={[...cluster.anchor.position]} onClick={event => { event.stopPropagation(); onSelect({ kind: cluster.kind, id: cluster.representative.id }) }}>
    {cluster.body && <>
      <SolidBody size={cluster.anchor.size} selected={false} related={false} historical={cluster.representative.kind === 'frame' && cluster.representative.historical} accent={accent} bodyColor={cluster.kind === 'object' ? worldMaterial.heapBody : cluster.kind === 'class' || cluster.representative.kind === 'frame' && cluster.representative.historical ? worldMaterial.historyBody : worldMaterial.stackBody} />
      <SolidFace size={cluster.anchor.size} color={cluster.kind === 'object' ? worldMaterial.heapFace : cluster.kind === 'class' || cluster.representative.kind === 'frame' && cluster.representative.historical ? worldMaterial.historyFace : worldMaterial.stackFace} accent={accent} />
    </>}
    {showLabels && <><RuntimeLabel text={cluster.label} position={[-width / 2 + 0.2, height / 2 + 0.62, depth / 2 + 0.035]} size={0.3} maxWidth={Math.max(width, 4.8)} color={accent} role="identity" />
    <RuntimeLabel text={`${cluster.count.toLocaleString()} ${unit} · ${cluster.quietCount.toLocaleString()} quiet`}
      position={[-width / 2 + 0.2, height / 2 + 0.23, depth / 2 + 0.035]} size={0.21} maxWidth={Math.max(width, 4.8)} color={colors.textSecondary} /></>}
  </group>
}
