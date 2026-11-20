import {expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import type {RuntimeState} from '../contracts/runtime'
import {seek} from '../runtime'
import {loadControlTrace} from '../examples/traces'
import {InspectorControlFacts} from './InspectorControlFacts'
import {valueText} from '../world/valueText'
const trace=loadControlTrace()
const view=(runtime:RuntimeState,frameId:string)=>renderToStaticMarkup(<InspectorControlFacts runtime={runtime} frameId={frameId}/>)
const escaped=(text:string)=>renderToStaticMarkup(<span>{text}</span>).slice(6,-7)
it('shows every captured comparison, named operand and both paths through all forward and reverse prefixes',()=>{
 const cursors=Array.from({length:trace.events.length+1},(_,index)=>index)
 for(const cursor of [...cursors,...cursors.slice().reverse()]){
  const runtime=seek(trace,cursor)
  for(const frameId of Object.keys(runtime.frames)){
   const html=view(runtime,frameId),condition=runtime.conditions[frameId]
   if(!condition){expect(html).not.toContain('data-condition-id');continue}
   const values=condition.operands.map(operand=>valueText(operand.value,{context:'exact'}).exact)
   expect(html).toContain(`data-condition-id="${condition.conditionId}"`)
   expect(html).toContain(escaped(condition.expression))
   expect(html).toContain(escaped(`${values[0]} ${condition.operator} ${values[1]} → ${condition.result}`))
   expect(html).toContain(escaped(`${condition.takenLabel} · skipped: ${condition.skippedLabel}`))
   condition.operands.forEach((operand,index)=>expect(html).toContain(escaped(`${operand.label}: ${values[index]}`)))
  }
 }
})
it('keeps all recorded loop counts and endings distinct by invocation through reverse stepping',()=>{
 for(const event of trace.events.filter(event=>event.type==='LOOP_ITERATION').reverse()){
  if(event.type!=='LOOP_ITERATION')throw new Error('Expected iteration')
  const html=view(seek(trace,event.seq+1),event.frameId)
  expect(html).toContain(`data-loop-id="${event.loopId}" data-loop-iteration="${event.iteration}"`)
  expect(html).toContain(event.status==='ended'?`Loop ended · ${event.iteration} iterations`:`Iteration ${event.iteration}`)
  const before=view(seek(trace,event.seq),event.frameId)
  if(event.status==='ended')expect(before).not.toContain(`Loop ended · ${event.iteration} iterations`)
  else expect(before).not.toContain(`data-loop-id="${event.loopId}" data-loop-iteration="${event.iteration}"`)
 }
})
it('presents explicit scope closure and parents without inventing live scopes or geometry',()=>{
 for(const event of trace.events.filter(event=>event.type==='EXIT_SCOPE')){
  if(event.type!=='EXIT_SCOPE')throw new Error('Expected scope exit')
  const before=seek(trace,event.seq),after=seek(trace,event.seq+1),scope=after.scopes[event.scopeId]
  expect(view(before,event.frameId)).toContain(escaped(`${scope.label} · active`))
  const html=view(after,event.frameId)
  expect(html).toContain(escaped(`${scope.label} · closed`));expect(html).toContain(`Closed at ${event.eventId}`)
  if(scope.parentId)expect(html).toContain(`parent ${scope.parentId}`)
 }
})
it('never presents a VM jump as a Java result or invents a missing right operand',()=>{
 const runtime=seek(trace,0),frameId='captured-frame'
 const input={...runtime,branch:{frameId,eventId:'vm-branch',opcode:154,site:42,left:{kind:'unavailable' as const,reason:'Operand not captured'},taken:false}}
 const html=view(input,frameId)
 expect(html).toContain('Jump not taken · Java condition result unavailable')
 expect(html).toContain('Operand not captured');expect(html).toContain('⟨not recorded⟩')
 expect(html).toContain('No second operand recorded');expect(html).not.toContain('Right operand: 0')
 expect(html).not.toContain('data-condition-id');expect(view(input,'other-frame')).toBe('')
 const right=view({...input,branch:{...input.branch,right:{kind:'primitive',javaType:'long',value:'9223372036854775807'}}},frameId)
 expect(right).toContain('Right operand: 9223372036854775807');expect(right).not.toContain('No second operand recorded')
})
it('bounds large loop/scope DOM while preserving index navigation and exact captured totals',()=>{
 const runtime={...seek(trace,0)},frameId='many'
 runtime.loops=Object.fromEntries(Array.from({length:10000},(_,index)=>[String(index),{frameId,loopId:`loop-${index}`,eventId:`event-${index}`,iteration:index+1,status:'running' as const}]))
 runtime.scopes=Object.fromEntries(Array.from({length:10000},(_,index)=>[String(index),{id:`scope-${index}`,frameId,parentId:null,label:`scope ${index}`,depth:0,status:'closed' as const,enteredAt:'enter',exitedAt:'exit'}]))
 const html=view(runtime,frameId)
 expect(html.match(/data-loop-iteration=/g)?.length).toBeLessThanOrEqual(9)
 expect(html.match(/role="listitem"/g)?.length).toBeLessThanOrEqual(18)
 expect(html).toContain('Recorded scopes · 0 active / 10000 captured')
 expect(html).toContain('Recorded loops index navigation');expect(html).toContain('Recorded scopes index navigation')
 expect(html).toContain('aria-setsize="10000"');expect(view(runtime,'absent')).toBe('')
})
