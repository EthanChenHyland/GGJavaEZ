import type {PresentedCluster} from '../contracts/worldV2'
import {color} from '../theme/tokens'
import {WorldText} from './FaceText'
import {fitWorldText,textAdvance} from './text/textSystem'

export function clusterLabelParts(cluster:Pick<PresentedCluster,'label'|'members'|'anchor'>) {
 const size=.3,width=cluster.anchor.size[0]-.4,count=`×${cluster.members}`,countWidth=textAdvance(count,500)*size+.04
 return{size,width,count,countWidth,key:countWidth>width?'':fitWorldText(cluster.label,Math.max(0,width-countWidth-.12),size,500),fits:countWidth<=width}
}
/** Structural label: key may abbreviate, exact residual count never does. */
export function ClusterLabels({cluster}:{cluster:PresentedCluster}) {
 const [x,y,z]=cluster.anchor.position,[w,,d]=cluster.anchor.size,face=z+d/2+.085,parts=clusterLabelParts(cluster)
 if(!parts.fits)return null
 return <>
  <WorldText position={[x-w/2+.2,y+.23,face]} size={parts.size} weight={500} width={Math.max(.01,parts.width-parts.countWidth-.12)} opacity={cluster.opacity} minimumPixels={12}>{parts.key}</WorldText>
  <WorldText position={[x+w/2-.2,y+.23,face]} size={parts.size} weight={500} width={parts.countWidth} align="right" opacity={cluster.opacity} minimumPixels={12}>{parts.count}</WorldText>
  <WorldText position={[x-w/2+.2,y-.22,face]} size={.3} weight={500} tracking={.08} width={parts.width} tint={color.ui.textSecondary} opacity={cluster.opacity} minimumPixels={12}>CLUSTER</WorldText>
 </>
}
