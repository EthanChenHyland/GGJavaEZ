import { useLayoutEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Color, InstancedMesh, Object3D } from 'three'
import type { Selection } from '../../contracts/interaction'
import type { PresentationNode } from '../../world/spatialPresentation'
import { colors, worldMaterial } from '../../theme/tokens'

type Node = PresentationNode
const noRaycast = () => undefined

/** Every represented quiet record retains its genuine volume and exact XYZ.
 * Passive volumes skip raycasting; a separate capped batch restores detail on click. */
export function ArchiveSolids({ nodes, onSelect, pickable = false }: { nodes: Node[]; onSelect: (selection: NonNullable<Selection>) => void; pickable?: boolean }) {
  const mesh = useRef<InstancedMesh>(null)
  const { invalidate } = useThree()
  useLayoutEffect(() => {
    if (!mesh.current) return
    const transform = new Object3D()
    const color = new Color()
    for (const [index, node] of nodes.entries()) {
      transform.position.set(...node.anchor.position)
      transform.scale.set(...node.anchor.size)
      transform.updateMatrix()
      mesh.current.setMatrixAt(index, transform.matrix)
      color.set(node.kind === 'object' ? worldMaterial.heapBody : node.kind === 'class' ? worldMaterial.stackBody
        : node.invocationStatus === 'failed' || node.invocationStatus === 'unwound' ? colors.exception : node.historical ? worldMaterial.historyBody : worldMaterial.stackBody)
      mesh.current.setColorAt(index, color)
    }
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
    mesh.current.computeBoundingSphere()
    invalidate()
  }, [nodes, invalidate])
  if (!nodes.length) return null
  return <instancedMesh key={nodes.length} ref={mesh} args={[undefined, undefined, nodes.length]} raycast={pickable ? undefined : noRaycast} onClick={pickable ? event => {
    const node = event.instanceId === undefined ? null : nodes[event.instanceId]
    if (node) { event.stopPropagation(); onSelect({ kind: node.kind, id: node.id }) }
  } : undefined}>
    <boxGeometry args={[1, 1, 1]} />
    <meshStandardMaterial roughness={0.55} metalness={0.12} />
  </instancedMesh>
}
