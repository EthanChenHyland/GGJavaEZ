import { useLayoutEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Color, InstancedMesh, Object3D } from 'three'
import type { Selection } from '../../contracts/interaction'
import type { SceneFrameNode, SceneObjectNode } from '../../contracts/world'
import { colors, worldMaterial } from '../../theme/tokens'

type Node = SceneFrameNode | SceneObjectNode

/** Every quiet record retains its genuine volume and exact XYZ. One draw call
 * replaces thousands of face labels; clicking an instance restores its details. */
export function ArchiveSolids({ nodes, onSelect }: { nodes: Node[]; onSelect: (selection: NonNullable<Selection>) => void }) {
  const mesh = useRef<InstancedMesh>(null)
  const { invalidate } = useThree()
  useLayoutEffect(() => {
    if (!mesh.current) return
    const transform = new Object3D()
    for (const [index, node] of nodes.entries()) {
      transform.position.set(...node.anchor.position)
      transform.scale.set(...node.anchor.size)
      transform.updateMatrix()
      mesh.current.setMatrixAt(index, transform.matrix)
      mesh.current.setColorAt(index, new Color(node.kind === 'object' ? worldMaterial.heapBody : node.invocationStatus === 'failed' || node.invocationStatus === 'unwound' ? colors.exception : colors.textMuted))
    }
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
    mesh.current.computeBoundingSphere()
    invalidate()
  }, [nodes, invalidate])
  if (!nodes.length) return null
  return <instancedMesh key={nodes.length} ref={mesh} args={[undefined, undefined, nodes.length]} onClick={event => {
    const node = event.instanceId === undefined ? null : nodes[event.instanceId]
    if (node) { event.stopPropagation(); onSelect({ kind: node.kind, id: node.id }) }
  }}>
    <boxGeometry args={[1, 1, 1]} />
    <meshStandardMaterial roughness={0.55} metalness={0.12} />
  </instancedMesh>
}
