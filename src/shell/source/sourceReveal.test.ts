import {expect,it} from 'vitest'
import {loadPersonTrace} from '../../examples/traces'
import {capturedSourceReveal,currentSourceReveal} from './sourceReveal'
const trace=loadPersonTrace(),request={recordingId:trace.demoId,cursor:18,targetId:'object:person:17',location:{fileId:'Main.java',line:18}}
it('reveals captured source without requiring or inventing a Selection',()=>{
 const reveal=capturedSourceReveal(trace,{...request,targetId:null},1)!
 expect(reveal).not.toBeNull();expect(currentSourceReveal(reveal,trace.demoId,18,null)).toBe(reveal)
 expect(currentSourceReveal(reveal,trace.demoId,18,request.targetId)).toBeNull()
 expect(currentSourceReveal(reveal,trace.demoId,17,null)).toBeNull()
})
it('uses exact recorded text and an independent location receipt, without changing source content',()=>{
 const before=JSON.stringify(trace),reveal=capturedSourceReveal(trace,request,1)!
 expect(reveal.file).toBe(trace.sourceFiles[0]);expect(reveal.location).toEqual(request.location);expect(reveal.location).not.toBe(request.location)
 expect(reveal.file.content).toContain('p.setAge(18)');expect(JSON.stringify(trace)).toBe(before)
})
it('rejects other recordings, invalid prefixes and uncaptured source paths/lines',()=>{
 for(const changed of[{...request,recordingId:'another-run'},{...request,cursor:-1},{...request,cursor:trace.events.length+1},{...request,location:{fileId:'invented.java',line:1}},{...request,location:{fileId:'Main.java',line:9999}},{...request,location:{fileId:'Main.java',line:0}}])expect(capturedSourceReveal(trace,changed,1)).toBeNull()
})
it('invalidates the view on recording, prefix or item change and never aliases the same ID in another run',()=>{
 const reveal=capturedSourceReveal(trace,request,1)!
 expect(currentSourceReveal(reveal,trace.demoId,18,request.targetId)).toBe(reveal)
 for(const [id,cursor,target]of[['other',18,request.targetId],[trace.demoId,17,request.targetId],[trace.demoId,18,'other'],[trace.demoId,18,null]]as const)expect(currentSourceReveal(reveal,id,cursor,target)).toBeNull()
})
it('distinguishes repeated explicit reveals so a manual scroll can be followed by a fresh reveal',()=>{
 const first=capturedSourceReveal(trace,request,1)!,second=capturedSourceReveal(trace,request,2)!
 expect(first.revision).not.toBe(second.revision);expect(first.file).toBe(second.file);expect(first.location).toEqual(second.location)
})

it('uses a distinct non-execution marker and honors a repeated explicit reveal after manual scrolling',async()=>{
 const {createSourceScrollPolicy}=await import('./sourceScrollPolicy'),{sourceDecorations}=await import('./sourceDecorations')
 const policy=createSourceScrollPolicy(),target={mark:'reveal' as const,line:18,key:'reveal:1'},visible={first:1,last:10}
 expect(policy.decide(target,visible,null,0)).toBe('reveal');policy.manualScroll(1)
 expect(policy.decide(target,visible,null,2)).toBe('none')
 expect(policy.decide({...target,key:'reveal:2'},visible,null,3)).toBe('reveal')
 const decoration=sourceDecorations(18,'reveal',null,22)[0]
 expect(decoration.options.className).toBe('gg-source-reveal-line');expect(decoration.options.className).not.toContain('executing-line')
 expect(decoration.range.startLineNumber).toBe(18)
})
