import type { SourceLocation, TraceDocument, TraceEvent,RuntimeState } from '../../contracts/runtime'
import type { DebugPause,DebugSession } from '../../debugger/contracts'
import type { InstrumentationSourceManifest } from '../../instrumentation/normalize'
import type { SceneModel } from '../../contracts/worldV2'
import { arrayCellTarget } from '../../world/arrayCellTarget'
export interface SourceFileProof {sessionId:string;fileId:string;path:string;content:string}

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
export function recordedFileFor(trace:TraceDocument,location:SourceLocation|null,retainedFileId=trace.sourceFiles[0]?.fileId) {
 return (location?trace.sourceFiles.find(file=>file.fileId===location.fileId):undefined)??trace.sourceFiles.find(file=>file.fileId===retainedFileId)
}

/** The control pause is authoritative, even before normalized events publish.
 * Match the binary class identity and captured hash; ambiguous metadata stays absent.
 */
export function pauseSourceLocation(pause:DebugPause|null,manifest:InstrumentationSourceManifest):SourceLocation|null {
 if(!pause||!Number.isInteger(pause.line)||pause.line<1)return null
 const matches=manifest.classes.filter(item=>item.className===pause.className)
 if(matches.length!==1)return null
 const binding=matches[0]
 if(binding.status!=='resolved'||!binding.fileId||!binding.sourceSha256)return null
 const files=manifest.sources.filter(file=>file.fileId===binding.fileId&&file.sha256===binding.sourceSha256)
 return files.length===1&&pause.line<=files[0].content.split('\n').length?{fileId:binding.fileId,line:pause.line}:null
}

/** A new pending attempt cannot lend its pause to the retained previous world. */
export function sourcePauseFor(debug:Pick<DebugSession,'sessionId'|'status'|'pause'>|null,worldSessionId:string|null):DebugPause|null {
 return debug?.status==='paused'&&(worldSessionId===null||worldSessionId===debug.sessionId)?debug.pause:null
}

export function sourceLocationFor(input:{hasFocus:boolean;focusLocation:SourceLocation|null;pausedAtHead:boolean;pauseLocation:SourceLocation|null;cursorEvent:TraceEvent|null}):SourceLocation|null {
 if(input.hasFocus)return input.focusLocation
 if(input.pausedAtHead)return input.pauseLocation
 return input.cursorEvent?.source??null
}

/** Extra provenance marker: never substitutes for the cursor's source target. */
export function exceptionSourceLocation(state:Pick<RuntimeState,'cursor'|'exceptions'>|null,trace:TraceDocument|undefined,runtimeRecordingId:string|null):SourceLocation|null {
 const fact=state?.exceptions.at(-1)
 if(!state||!trace||trace.demoId!==runtimeRecordingId||!fact||fact.caughtBy)return null
 const index=trace.events.findIndex(event=>event.eventId===fact.eventId),event=trace.events[index]
 if(index<0||index>=state.cursor||event?.type!=='THROW_EXCEPTION'||!event.source)return null
 const location=event.source,files=trace.sourceFiles.filter(file=>file.fileId===location.fileId)
 return files.length===1&&Number.isInteger(location.line)&&location.line>=1&&location.line<=files[0].content.split('\n').length?location:null
}

export function exceptionLineForFile(location:SourceLocation|null,file:Pick<TraceDocument['sourceFiles'][number],'fileId'|'content'>|undefined):number|null {
 return location&&file?.fileId===location.fileId&&Number.isInteger(location.line)&&location.line>=1&&location.line<=file.content.split('\n').length?location.line:null
}

/** A verified mapping remains usable only for this exact displayed version. */
export function sourceProofFile(proof:SourceFileProof|null,sessionId:string|undefined,displayed:{path:string;draft:string}|undefined):SourceFileProof|undefined {
 return proof&&proof.sessionId===sessionId&&proof.path===displayed?.path&&proof.content===displayed.draft?proof:undefined
}
