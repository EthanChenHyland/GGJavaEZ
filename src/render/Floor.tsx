import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Grid } from '@react-three/drei'
import {useThree} from '@react-three/fiber'
import {createFloorReflection} from './floorReflection'
import {createFloorContact} from './floorContact'
import { Color, Group, Mesh, InstancedBufferAttribute, InstancedMesh, MeshBasicMaterial, Object3D, type ShaderMaterial } from 'three'
import type { LayoutState, PresentationPlan, SceneModel } from '../contracts/world'
import {useQualityStore,type QualityTier} from './quality/qualityStore'
import { contactFootprints, floorModel, floorStyle, type ContactFootprint } from './floorModel'
import {registerAuxiliaryPass} from './post/auxiliaryPasses'
import {configureFloorGrid} from './floorGrid'

function ContactBlobs({ footprints }: { footprints: ContactFootprint[] }) {
  const mesh = useRef<InstancedMesh>(null)
  const opacity = useMemo(() => new InstancedBufferAttribute(new Float32Array(footprints.map(item => item.opacity)), 1), [footprints])
  const material = useMemo(() => {
    const material = new MeshBasicMaterial({ color: new Color(floorStyle.contact), transparent: true, depthWrite: false, toneMapped: false })
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute float contactOpacity; varying float footprintOpacity; varying vec2 footprintUv;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nfootprintOpacity=contactOpacity; footprintUv=uv;')
      shader.fragmentShader = 'varying float footprintOpacity; varying vec2 footprintUv;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a *= footprintOpacity * pow(max(0.,1.-length(footprintUv*2.-1.)),2.);')
    }
    material.customProgramCacheKey = () => 'runtime-contact-blob-v1'
    return material
  }, [])
  useEffect(() => () => material.dispose(), [material])
  useLayoutEffect(() => {
    const object = mesh.current
    if (!object) return
    const transform = new Object3D()
    footprints.forEach((item, index) => {
      transform.position.set(...item.position); transform.rotation.x = -Math.PI / 2; transform.scale.set(item.size[0], item.size[1], 1)
      transform.updateMatrix(); object.setMatrixAt(index, transform.matrix)
    })
    object.instanceMatrix.needsUpdate = true; object.computeBoundingSphere()
  }, [footprints])
  if (!footprints.length) return null
  return <instancedMesh ref={mesh} args={[undefined, undefined, footprints.length]} material={material} userData={{runtimeBloomRole:'protected',runtimeFloorOverlay:true}} raycast={()=>undefined}>
    <planeGeometry args={[1,1]}><primitive object={opacity} attach="attributes-contactOpacity"/></planeGeometry>
  </instancedMesh>
}

export function Floor({ layout, plan, scene, quality }: { layout: LayoutState; plan: PresentationPlan; scene: SceneModel; quality: QualityTier }) {
  const floor = floorModel(layout, quality, scene.liveHead > 0)
  const footprints = useMemo(() => contactFootprints(scene, plan, floor.position[1]), [scene, plan, floor.position[1]])
  const {gl,scene:world,camera}=useThree(), group=useRef<Group>(null), surface=useRef<Mesh>(null)
  const grid=useRef<Mesh>(null),gridOpacity=useMemo(()=>({value:floor.opacity}),[])
  const lost=useQualityStore(state=>state.contextLost)
  const reflection=useMemo(()=>lost?null:createFloorReflection(gl,floor),[gl,quality,lost,floor.opacity])
  const contact=useMemo(()=>quality==='CINEMATIC'&&!lost?createFloorContact(gl,floor,layout.bounds?.size[1]??12):null,
    [gl,quality,lost,floor.position[0],floor.position[1],floor.position[2],floor.extent])
  const captured=useRef('')
  useLayoutEffect(()=>{gridOpacity.value=floor.opacity},[gridOpacity,floor.opacity])
  useLayoutEffect(()=>{if(grid.current)configureFloorGrid(grid.current.material as ShaderMaterial,gridOpacity)},[reflection,gridOpacity])
  useEffect(()=>()=>reflection?.dispose(),[reflection])
  useEffect(()=>{captured.current='';return()=>contact?.dispose()},[contact])
  useLayoutEffect(()=>registerAuxiliaryPass(gl,'floor',()=>{
    if(!group.current||!surface.current||!reflection)return
    const key=`${scene.recordingId}:${plan.revision}`
    if(contact&&key!==captured.current){contact.render(world,group.current);captured.current=key}
    reflection.render(world,camera,surface.current,group.current)
  }),[gl,world,camera,reflection,contact,scene.recordingId,plan.revision])
  if(!reflection)return null
  return <group ref={group}>
    <mesh ref={surface} rotation={[-Math.PI/2,0,0]} position={[...floor.position]} material={reflection.material} dispose={null}
      userData={{runtimeBloomRole:'protected'}} receiveShadow raycast={()=>undefined}>
      <planeGeometry args={[floor.extent,floor.extent]}/>
    </mesh>
    <Grid ref={grid} name="runtime-floor-grid" position={[floor.position[0],floor.position[1]+floorStyle.gridLift,floor.position[2]]} args={[floor.extent,floor.extent]}
      cellSize={floorStyle.minorSpacing} sectionSize={floorStyle.majorSpacing} cellThickness={.5} sectionThickness={.8}
      cellColor={floorStyle.minor} sectionColor={floorStyle.major} fadeDistance={floor.extent*floorStyle.gridFadeExtent} fadeStrength={floorStyle.gridFadeStrength} infiniteGrid={false}
      userData={{runtimeBloomRole:'protected',runtimeFloorOverlay:true}} material-depthWrite={false}/>
    {contact ? <mesh rotation={[-Math.PI/2,0,0]} position={[floor.position[0],floor.position[1]+floorStyle.contactLift,floor.position[2]]}
      userData={{runtimeBloomRole:'protected',runtimeFloorOverlay:true}} raycast={()=>undefined}>
      <planeGeometry args={[floor.extent,floor.extent]}/><meshBasicMaterial map={contact.target.texture} transparent depthWrite={false} toneMapped={false} opacity={.3*floor.opacity}/>
    </mesh> : <ContactBlobs footprints={footprints}/>}
  </group>
}
