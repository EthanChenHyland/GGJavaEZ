import {expect,test} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import {browserErrors,home,ready,runFixture,seekCursor,stopOwnedSession} from './harness'

test.afterEach(async({request})=>stopOwnedSession(request))
test('actual JVM returns draw only the recorded return edge after its consuming write',async({page,request})=>{
 test.setTimeout(60000)
 const errors=browserErrors(page),session=await runFixture(page,request,'recursion')
 const evidence=await page.evaluate(async(sourceFiles)=>{
  const modulePath='/src/runtime/seek.ts',{seek}=await import(modulePath)
  const world=window.__ggjavaezWorld!,events=world.recordedEvents(),trace={schemaVersion:2,demoId:world.scene().recordingId,sourceFiles,events}
  const graph=seek(trace,events.length).executionGraph!
  for(const flow of world.scene().returnFlows){
   const edge=graph.edges.find((edge:{id:string})=>edge.id===flow.id)
   if(!edge||edge.kind!=='RETURN')continue
   const write=(graph.outgoing[edge.to]??[]).map((index:number)=>graph.edges[index]).find((candidate:{to:string;kind:string;eventId:string})=>{
    const event=events.find(event=>event.eventId===candidate.eventId)
    return candidate.to===flow.destination.slotId&&event?.type==='EXECUTION_FACT'&&event.fact.kind==='write'&&event.fact.origin.kind==='call_result'
   })
   const event=write&&events.find(event=>event.eventId===write.eventId)
   if(event)return {flow,edge,writeSeq:event.seq,writeId:event.eventId,returnEvent:events.find(event=>event.eventId===edge.eventId),anchors:Object.fromEntries(Object.entries(world.scene().entities).map(([id,node])=>[id,node.anchor]))}
  }
  return null
 },session.sourceManifest.sources)
 expect(evidence).not.toBeNull();if(!evidence)throw new Error('Fresh JVM supplied no proven return consumer')
 expect(evidence.returnEvent).toMatchObject({type:'EXECUTION_FACT',fact:{kind:'return',invocationId:evidence.flow.frameId}})
 expect(evidence.flow.id).toBe(evidence.edge.id)
 await seekCursor(page,evidence.writeSeq)
 const before=await page.evaluate(id=>({node:window.__ggjavaezWorld!.scene().entities[id],flows:window.__ggjavaezWorld!.scene().returnFlows}),evidence.flow.frameId)
 expect(before.flows.some(flow=>flow.id===evidence.flow.id)).toBe(false)
 expect(before.node).toMatchObject({status:{kind:'returned',value:{exact:evidence.flow.value.exact}}})
 await seekCursor(page,evidence.writeSeq+1);await home(page)
 await page.locator('.world-canvas').focus();await page.keyboard.press('F1')
 await page.getByRole('combobox',{name:'Search commands'}).fill('Trace: All')
 await page.getByRole('option').filter({has:page.getByText('Navigation: Trace: All',{exact:true})}).click();await ready(page)
 const actual=await page.evaluate(id=>({scene:window.__ggjavaezWorld!.scene(),curves:window.__ggjavaezWorld!.plan().curves.filter(curve=>curve.kind==='return'&&curve.id===id),headings:window.__ggjavaezWorld!.plan().headings,returnText:window.__ggjavaezWorld!.returnText()}),evidence.flow.id)
 expect(actual.scene.returnFlows.filter(flow=>flow.id===evidence.flow.id)).toHaveLength(1)
 expect(actual.curves).toHaveLength(1)
 const caption=actual.returnText.find(label=>label.flowId===evidence.flow.id&&label.kind==='value')
 expect(caption).toMatchObject({text:`return ${evidence.flow.value.text}`,opacity:1})
 expect(caption!.fontPixels).toBeGreaterThanOrEqual(12)
 expect(actual.returnText.some(label=>label.flowId===evidence.flow.id&&label.kind==='operands')).toBe(false)
 expect(actual.curves[0].sourceAnchor?.entityId).toBe(evidence.flow.frameId)
 expect(actual.curves[0].destinationAnchor?.entityId).toBe(evidence.flow.destination.entityId)
 expect(actual.curves[0].points.at(-1)).toEqual(actual.scene.entities[evidence.flow.destination.entityId].anchor.ports[evidence.flow.destination.slotId])
 expect(actual.headings.filter(heading=>heading.id==='RETURNS')).toHaveLength(1)
 expect(actual.scene.entities[evidence.flow.frameId]).toMatchObject({status:{kind:'returned',value:null}})
 for(const node of Object.values(actual.scene.entities))expect(node.anchor).toEqual(evidence.anchors[node.id])
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/return-provenance-native.png'})
 await seekCursor(page,evidence.writeSeq)
 expect(await page.evaluate(id=>window.__ggjavaezWorld!.plan().curves.some(curve=>curve.id===id),evidence.flow.id)).toBe(false)
 expect(errors).toEqual([])
 await writeFile('.ggjavaez/qa/reference-exact/return-provenance-native.json',JSON.stringify({realJvmExecuted:true,sessionId:session.id,rawEvents:session.rawEvents.length,evidence,actual,errors},null,2)+'\n')
})
