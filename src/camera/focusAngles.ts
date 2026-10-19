import type {WorldAnchor} from '../contracts/world'
import {camera as tokens} from '../theme/tokens'

/** Structural proxies live outside their runtime band. With no semantic
 * neighbours, looking inward can trap a later user dolly against its slabs.
 * Real entity Focus retains the recorded-neighbour composition preference. */
export function focusAngles(anchor:WorldAnchor,neighbours:readonly WorldAnchor[],structuralCluster=false) {
 const magnitude=Math.abs(tokens.focus.yaw)
 if(structuralCluster)return{yaw:anchor.region==='stack'||anchor.region==='class'?-magnitude:magnitude,pitch:tokens.focus.pitch}
 const left=neighbours.filter(neighbour=>neighbour.position[0]<anchor.position[0]).length
 return{yaw:left>=neighbours.length-left?magnitude:-magnitude,pitch:tokens.focus.pitch}
}
