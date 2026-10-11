import type {PresentedCluster} from '../contracts/worldV2'
import {color} from '../theme/tokens'
import {WorldText} from './FaceText'
import {fitWorldText,textAdvance} from './text/textSystem'
import {displayType} from '../world/displayType'

/** Package previews may simplify only when no different canonical key shares
 * the displayed name. Neither lookup nor selection ever uses the preview. */
export function clusterLabelNames(clusters:readonly Pick<PresentedCluster,'id'|'label'>[]):Map<string,string> {
 const aliases=new Map<string,Set<string>>()
 for(const cluster of clusters){const name=displayType(cluster.label),keys=aliases.get(name)??new Set<string>();keys.add(cluster.label);aliases.set(name,keys)}
 return new Map(clusters.map(cluster=>{const name=displayType(cluster.label);return[cluster.id,aliases.get(name)!.size===1?name:cluster.label]}))
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
  <WorldText position={[-w/2+.2,.23,0]} size={.3} weight={500} tracking={.08} width={parts.width} tint={color.ui.textSecondary} opacity={cluster.opacity} minimumPixels={12}>CLUSTER</WorldText>
 </>
}
