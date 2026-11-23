import type {PresentedCluster,SceneModel} from '../contracts/world'
import {color,presentationScale} from '../theme/tokens'
import {WorldText} from './FaceText'
import {fitWorldText,textAdvance} from './text/textSystem'
import {displayType} from '../world/displayType'

const category:Record<PresentedCluster['key']['kind'],string> = {
 class:'CLASSES', type:'TYPE', package:'PACKAGE', ownership:'ORIGIN',
 collection:'COLLECTION', 'invocation-branch':'FRAMES', 'execution-age':'EVENT RANGE',
}

/** Package previews may simplify only when no different canonical key shares
 * the displayed name. Neither lookup nor selection ever uses the preview. */
export function clusterLabelNames(clusters:readonly (Pick<PresentedCluster,'id'|'label'>&Partial<Pick<PresentedCluster,'key'>>)[]):Map<string,string> {
 const preview=(cluster:typeof clusters[number])=>!cluster.key||['class','type','package'].includes(cluster.key.kind)?displayType(cluster.label):cluster.label
 const aliases=new Map<string,Set<string>>()
 for(const cluster of clusters){const name=preview(cluster),keys=aliases.get(name)??new Set<string>();keys.add(cluster.label);aliases.set(name,keys)}
 return new Map(clusters.map(cluster=>{const name=preview(cluster);return[cluster.id,aliases.get(name)!.size===1?name:cluster.label]}))
}

export function clusterLabelParts(cluster:Pick<PresentedCluster,'label'|'members'|'anchor'>,displayLabel=cluster.label) {
 const size=.3,width=cluster.anchor.size[0]-.4,count=`×${cluster.members}`,countWidth=textAdvance(count,500)*size+.04
 return{size,width,count,countWidth,key:countWidth>width?'':fitWorldText(displayLabel,Math.max(0,width-countWidth-.12),size,500),fits:countWidth<=width}
}
/** Structural label: key may abbreviate, exact residual count never does. */
export function ClusterLabels({cluster,displayLabel}:{cluster:PresentedCluster;displayLabel?:string}) {
 const [w]=cluster.anchor.size,parts=clusterLabelParts(cluster,displayLabel)
 if(!parts.fits)return null
 return <>
  <WorldText position={[-w/2+.2,.68,0]} size={parts.size} weight={500} width={Math.max(.01,parts.width-parts.countWidth-.12)} opacity={cluster.opacity} minimumPixels={12}>{parts.key}</WorldText>
  <WorldText position={[w/2-.2,.68,0]} size={parts.size} weight={500} width={parts.countWidth} align="right" opacity={cluster.opacity} minimumPixels={12}>{parts.count}</WorldText>
  <WorldText position={[-w/2+.2,.23,0]} size={.3} weight={500} tracking={.08} width={parts.width} tint={color.ui.textSecondary} opacity={cluster.opacity} minimumPixels={12}>{category[cluster.key.kind]}</WorldText>
 </>
}

export function clusterSummary(cluster:PresentedCluster,scene:SceneModel,displayLabel:string){
 const name=cluster.key.kind==='collection'?scene.entities[cluster.key.value]?.title??'Collection':
  cluster.key.kind==='invocation-branch'?(cluster.key.value==='live stack'?'Live frames':'Call history'):displayLabel
 const size=.32,count=`×${cluster.members}`,countWidth=textAdvance(count,600)*size+.08
 const width=Math.max(3.4,Math.min(4.8,textAdvance(name,600)*size+countWidth+.55))
 const nameWidth=width-countWidth-.49
 return{width,size,count,countWidth,nameWidth,name:fitWorldText(name,nameWidth,size,600,0,24,'end')}
}

/** A legible caption over the unchanged cluster body. It has no hit
 * geometry and never enlarges the canonical cluster or its connectors. */
export function ClusterSummaryLabel({cluster,summary}:{cluster:PresentedCluster;summary:ReturnType<typeof clusterSummary>}){
 const {width,size,count,countWidth,nameWidth,name}=summary
 const tint=cluster.anchor.region==='stack'?color.stack.edge:cluster.anchor.region==='class'?color.class.edge:color.heap.edge
 const minimumPixels=presentationScale.clusterLabelMinimumPx
 return <>
  <mesh position={[0,.32,-.035]} userData={{runtimeBloomRole:'protected'}} raycast={()=>undefined}>
   <planeGeometry args={[width,.65]}/><meshBasicMaterial color={color.stack.chip} transparent opacity={cluster.opacity} depthWrite={false} toneMapped={false}/>
  </mesh>
  <WorldText position={[-width/2+.18,.32,0]} size={size} weight={600} width={nameWidth} opacity={cluster.opacity} minimumPixels={minimumPixels}>{name}</WorldText>
  <WorldText position={[width/2-.18,.32,0]} size={size} weight={600} width={countWidth} align="right" tint={tint} opacity={cluster.opacity} minimumPixels={minimumPixels}>{count}</WorldText>
 </>
}
