import type {SourceLocation,TraceDocument} from '../../contracts/runtime'
export interface SourceRevealRequest {recordingId:string;cursor:number;targetId:string;location:SourceLocation}
export interface SourceReveal extends SourceRevealRequest {
 revision:number
 file:TraceDocument['sourceFiles'][number]
}
/** An explicit view of captured text. No workspace path lookup or draft write
 * occurs, so source mismatches cannot silently masquerade as current source. */
export function capturedSourceReveal(trace:TraceDocument,request:SourceRevealRequest,revision:number):SourceReveal|null{
 const {recordingId,cursor,targetId,location}=request
 if(recordingId!==trace.demoId)return null
 if(!Number.isInteger(cursor)||cursor<0||cursor>trace.events.length||!Number.isInteger(location.line)||location.line<1)return null
 const file=trace.sourceFiles.find(file=>file.fileId===location.fileId)
 if(!file||location.line>file.content.split('\n').length)return null
 return{recordingId:trace.demoId,cursor,targetId,revision,file,location:{...location}}
}
/** One transient receipt is invalidated by navigation, prefix or recording
 * replacement. It cannot reappear when an old ID is selected in another run. */
export function currentSourceReveal(reveal:SourceReveal|null,recordingId:string,cursor:number,targetId:string|null):SourceReveal|null{
 return reveal&&reveal.recordingId===recordingId&&reveal.cursor===cursor&&reveal.targetId===targetId?reveal:null
}
