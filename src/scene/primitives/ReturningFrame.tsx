import { useRef } from 'react'
import type { Group } from 'three'
import type { SceneFrameNode } from '../../contracts/world'
import { motionMs } from '../../theme/tokens'
import { FrameSolid } from './FrameSolid'
import { useMountSettle } from './presentationMotion'

/** Noninteractive departure shell, shown only during continuous playback. */
export function ReturningFrame({ node }: { node: SceneFrameNode }) {
  const group = useRef<Group>(null)
  useMountSettle(motionMs.quick, false, (progress) => {
    group.current?.scale.set(1, 1 - progress * 0.85, 1 - progress * 0.85)
  })
  return <group ref={group} position={[...node.anchor.position]}>
    <FrameSolid node={{ ...node, active: false, anchor: { ...node.anchor, position: [0, 0, 0] } }} selected={false} related={false} detailLevel="macro" onSelect={() => {}} reducedMotion />
  </group>
}
