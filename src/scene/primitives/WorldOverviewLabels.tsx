import { Billboard } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Group, Vector3 } from 'three'
import type { Selection } from '../../contracts/interaction'
import type { SceneModel } from '../../contracts/world'
import { displayJavaType } from '../../runtime/displayType'
import { colors } from '../../theme/tokens'
import type { SpatialCluster } from '../../world/spatialPresentation'
import { RuntimeLabel } from './RuntimeLabel'
import { projectedTextPixels } from './runtimeText'

/** Bounded, camera-facing overview annotations. These name actual represented
 * cuboids/groups; they never replace geometry, change anchors or invent edges. */
export function WorldOverviewLabels({scene, clusters, inspectorVisible, onSelect}: {
  scene: SceneModel; clusters: readonly SpatialCluster[]; inspectorVisible: boolean;
  onSelect: (selection: NonNullable<Selection>) => void;
}) {
  const { camera, size } = useThree()
  const groups = useRef<Array<Group | null>>([])
  const entries = useMemo(() => {
    const summary = new Map(clusters.map(cluster => [cluster.representative.id, cluster]))
    const nodes = [...new Map([...scene.frames, ...scene.objects, ...(scene.classes ?? []), ...clusters.map(cluster => cluster.representative)].map(node => [node.id,node])).values()]
    return nodes.map(node => {
      const cluster = summary.get(node.id)
      const name = node.kind === 'frame' ? cluster ? `${displayJavaType(node.className ?? node.label)} calls` : node.label.replace(/ · (completed|unwound|failed|stopped|last recorded)$/, '')
        : `${displayJavaType(node.className)}${node.kind === 'class' ? ' · static' : cluster && cluster.count > 1 ? '' : ` #${node.displayId}`}`
      const title = name.length > 30 ? `${name.slice(0,29)}…` : name
      return { node, title, detail: cluster ? `${cluster.count} recorded ${node.kind === 'frame' ? cluster.count === 1 ? 'invocation' : 'invocations' : node.kind === 'class' ? cluster.count === 1 ? 'class' : 'classes' : cluster.count === 1 ? 'object' : 'objects'}` : node.kind === 'frame' ? node.invocationStatus ?? 'invocation' : node.kind === 'class' ? 'class storage' : 'observed identity',
        position: [node.anchor.position[0],node.anchor.position[1]+node.anchor.size[1]/2+0.65,node.anchor.position[2]+node.anchor.size[2]/2] as [number,number,number] }
    }).sort((a,b)=>Number(b.node.metadata?.ownership==='PROJECT')-Number(a.node.metadata?.ownership==='PROJECT')).slice(0,20)
  },[scene.frames,scene.objects,scene.classes,clusters])
  useFrame(() => {
    const occupied: Array<{left:number;right:number;top:number;bottom:number}> = []
    for(let i=0;i<entries.length;i++) {
      const group=groups.current[i],entry=entries[i]
      if(!group)continue
      const projected=new Vector3(...entry.position).project(camera)
      const pixels=projectedTextPixels(camera,size,entry.position,1)
      group.scale.setScalar(pixels>0 ? 12/(0.26*pixels) : 1)
      const x=(projected.x+1)*size.width/2,y=(1-projected.y)*size.height/2
      const width=Math.min(270,Math.max(entry.title.length*8.5,entry.detail.length*6.8)),height=34
      const rect={left:x-width/2-5,right:x+width/2+5,top:y-height/2-4,bottom:y+height/2+4}
      group.visible=projected.z>=-1&&projected.z<=1&&rect.left>8&&rect.right<size.width-(inspectorVisible?300:8)&&rect.top>94&&rect.bottom<size.height-100
        &&!occupied.some(other=>rect.left<other.right&&rect.right>other.left&&rect.top<other.bottom&&rect.bottom>other.top)
      if(group.visible)occupied.push(rect)
    }
  })
  return <group>{entries.map((entry,index)=><Billboard key={entry.node.id} position={entry.position}>
    <group ref={group=>{groups.current[index]=group}} onClick={event=>{event.stopPropagation();onSelect({kind:entry.node.kind,id:entry.node.id})}}>
      <RuntimeLabel text={entry.title} position={[0,0.15,0]} size={0.26} depthTest={false} align="center" color={entry.node.kind==='frame'?colors.text:entry.node.kind==='class'?colors.textSecondary:colors.heap}/>
      <RuntimeLabel text={entry.detail} position={[0,-0.17,0]} size={0.21} depthTest={false} align="center" color={colors.textSecondary}/>
    </group>
  </Billboard>)}</group>
}
