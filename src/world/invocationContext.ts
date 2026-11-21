import type {SceneModel,Vec3} from '../contracts/world'
import {camera} from '../theme/tokens'

export function isBroadCompletedWorld(scene:SceneModel):boolean {
 return scene.cursor===scene.liveHead&&!scene.liveStack.length&&scene.order.frames.length>camera.home.groups
}

/** Follow recorded ancestry. Very deep worlds keep the active end of the chain
 * readable; a broad finished call tree uses its entry as the overview anchor. */
export function contextInvocations(scene:SceneModel, start = scene.liveStack.at(-1)
 ?? (isBroadCompletedWorld(scene) ? scene.order.frames[0] : scene.order.frames.at(-1))):string[] {
 const ids:string[]=[],seen=new Set<string>()
 let id=start
 while(id&&ids.length<camera.recursion.context&&!seen.has(id)){
  const frame=scene.entities[id];if(frame?.kind!=='frame')break
  seen.add(id);ids.unshift(id);id=frame.callerId??undefined
 }
 return ids
}

export function stackContextHeading(scene:SceneModel,fallback:Vec3):Vec3 {
 const id=contextInvocations(scene)[0],frame=id?scene.entities[id]:null
 if(!frame||id===scene.order.frames[0])return fallback
 return[frame.anchor.position[0]-frame.anchor.size[0]/3,frame.anchor.position[1]+frame.anchor.size[1]/2+.75,frame.anchor.position[2]+frame.anchor.size[2]/2]
}
