import type {SceneModel,Vec3} from '../contracts/world'

/** Current/deepest invocation plus three recorded caller ancestors; completed
 * worlds use the most recently entered invocation. No synthetic parent chain. */
export function contextInvocations(scene:SceneModel):string[] {
 const ids:string[]=[],seen=new Set<string>()
 let id=scene.liveStack.at(-1)??scene.order.frames.at(-1)
 while(id&&ids.length<4&&!seen.has(id)){
  const frame=scene.entities[id];if(frame?.kind!=='frame')break
  seen.add(id);ids.unshift(id);id=frame.callerId??undefined
 }
 return ids
}

/** A viewport-aware structural heading follows the framed stack context.
 * Canonical runtime bodies/ports and the first-invocation heading stay fixed. */
export function stackContextHeading(scene:SceneModel,fallback:Vec3):Vec3 {
 const id=contextInvocations(scene)[0],frame=id?scene.entities[id]:null
 if(!frame||id===scene.order.frames[0])return fallback
 // Older callers can remain above this four-frame context. Keep its title
 // outside the column's right edge so those real bodies cannot cover it.
 return[frame.anchor.position[0]+frame.anchor.size[0]/2+.45,frame.anchor.position[1]+frame.anchor.size[1]/2+.75,frame.anchor.position[2]+frame.anchor.size[2]/2]
}
