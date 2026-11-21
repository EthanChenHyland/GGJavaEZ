import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Color, InstancedBufferAttribute, InstancedMesh, Mesh, Object3D } from 'three'
import { createFloorReflection } from './floorReflection'
import { contactFootprints, createFloorContactMaterial, floorSupports, type ContactFootprint } from './floorContact'
import type { WorldRenderSnapshot } from './worldRenderSnapshot'
import { useQualityStore, type QualityTier } from './quality/qualityStore'
import { floorModel, floorStyle } from './floorModel'
import { registerAuxiliaryPass } from './post/auxiliaryPasses'
import { createFloorSurface } from './floorGrid'

const noRaycast = () => undefined

function FloorContacts({ footprints }: { footprints: readonly ContactFootprint[] }) {
  const mesh = useRef<InstancedMesh>(null)
  const styles = useMemo(() => new InstancedBufferAttribute(new Float32Array(floorStyle.maxContacts * 4), 4), [])
  const material = useMemo(createFloorContactMaterial, [])
  useEffect(() => () => material.dispose(), [material])
  useLayoutEffect(() => {
    const object = mesh.current
    return () => object?.dispose()
  }, [])
  useLayoutEffect(() => {
    const object = mesh.current
    if (!object) return
    const transform = new Object3D()
    const tint = new Color()
    transform.rotation.x = -Math.PI / 2
    footprints.forEach((item, index) => {
      transform.position.set(...item.position)
      transform.scale.set(item.size[0], item.size[1], 1)
      transform.updateMatrix()
      object.setMatrixAt(index, transform.matrix)
      object.setColorAt(index, tint.set(item.accent))
      styles.setXYZW(index, item.core[0], item.core[1], item.opacity, item.sheen)
    })
    object.count = footprints.length
    object.instanceMatrix.needsUpdate = styles.needsUpdate = true
    if (object.instanceColor) object.instanceColor.needsUpdate = true
    object.computeBoundingSphere()
  }, [footprints, styles])

  return <instancedMesh ref={mesh} name="runtime-floor-contact" args={[undefined, undefined, floorStyle.maxContacts]}
    material={material} count={0} visible={footprints.length > 0} renderOrder={-9}
    userData={{ runtimeBloomRole: 'protected', runtimeFloorOverlay: true }} raycast={noRaycast}>
    <planeGeometry args={[1, 1]}><primitive object={styles} attach="attributes-runtimeContact" /></planeGeometry>
  </instancedMesh>
}

export function Floor({ snapshot, quality }: { snapshot: WorldRenderSnapshot; quality: QualityTier }) {
  const { layout, plan, scene } = snapshot.read()
  const supports = useMemo(() => floorSupports(scene, plan), [scene, plan])
  const floor = useMemo(() => floorModel(layout, quality, scene.liveHead > 0, supports.map(item => item.anchor),
    plan.framing.home.ids.flatMap(id => scene.entities[id]?.anchor ?? [])), [layout, plan.framing.home.ids, quality, scene, supports])
  const floorY = floor.position[1]
  const footprints = useMemo(() => contactFootprints(supports, floorY), [supports, floorY])
  const { gl, scene: world, camera } = useThree()
  const surface = useRef<Mesh>(null)
  const lost = useQualityStore(state => state.contextLost)
  const reflection = useMemo(() => floor.reflection && !lost ? createFloorReflection(gl) : null, [gl, floor.reflection, lost])
  const stage = useMemo(() => createFloorSurface(reflection), [reflection])

  useLayoutEffect(() => stage.update(floor), [stage, floor])
  useEffect(() => () => stage.material.dispose(), [stage])
  useEffect(() => () => reflection?.dispose(), [reflection])
  useLayoutEffect(() => {
    if (!reflection) return
    return registerAuxiliaryPass(gl, 'floor', () => {
      if (surface.current) reflection.render(world, camera, surface.current)
    })
  }, [gl, world, camera, reflection])

  return <group>
    <mesh ref={surface} name="runtime-floor" rotation={[-Math.PI / 2, 0, 0]} position={[...floor.position]}
      material={stage.material} renderOrder={-10} raycast={noRaycast}
      userData={{
        runtimeBloomRole: 'protected', runtimeFloorOverlay: true,
        runtimeFloorMetrics: { contacts: footprints.length, targets: reflection ? 1 : 0, reflection: reflection?.stats ?? null },
      }}>
      <planeGeometry args={[floor.extent, floor.extent]} />
    </mesh>
    <FloorContacts footprints={footprints} />
  </group>
}
