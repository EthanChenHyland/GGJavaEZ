import type { SourceLocation, TraceDocument } from '../../contracts/runtime'
import type { SceneModel } from '../../contracts/worldV2'
import { arrayCellTarget } from '../../world/arrayCellTarget'

/** Focus locations come from recorded identity/evidence, never from a type-name guess. */
export function focusSourceLocation(scene:SceneModel,targetId:string|null,trace:TraceDocument):SourceLocation|null {
 if(!targetId)return null
 const direct=scene.entities[targetId]
 const node=direct??arrayCellTarget(scene,targetId)?.array
 if(!node)return null
 if(node.kind==='frame')return node.sourceLine
 if(node.kind==='object')return node.allocationSite
 if(node.kind==='array'||node.kind==='collection'){
  for(const eventId of node.evidence.eventIds){
   const event=trace.events.find(event=>event.eventId===eventId)
   if(event&&(event.type==='ALLOCATE_ARRAY'||event.type==='ALLOCATE_OBJECT')&&event.objectId===node.id)return event.source??null
  }
 }
 return null
}
export function recordedFileFor(trace:TraceDocument,location:SourceLocation|null) {
 return location?trace.sourceFiles.find(file=>file.fileId===location.fileId):trace.sourceFiles[0]
}
