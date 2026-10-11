import {expect,test} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import {browserErrors,runFixture,stopOwnedSession} from './harness'
import {ownershipObservation} from '../../src/world/recordedOwnership'
test.afterEach(async({request})=>stopOwnedSession(request))

test('actual JVM metadata binds to prefix-present runtime identities',async({page,request})=>{
 test.setTimeout(60000)
 const errors=browserErrors(page),session=await runFixture(page,request,'dense')
 const snapshot=await page.evaluate(()=>({scene:window.__ggjavaezWorld!.scene(),events:window.__ggjavaezWorld!.recordedEvents()}))
 const observations=snapshot.events.flatMap(event=>{const observation=ownershipObservation(event);return observation?[observation]:[]})
 const matched=observations.filter(observation=>snapshot.scene.entities[observation.id]),unmatched=observations.filter(observation=>!snapshot.scene.entities[observation.id])
 const jdk=matched.filter(observation=>observation.value==='JDK')
 expect(observations.length).toBeGreaterThan(0);expect(jdk.length).toBeGreaterThan(0)
 expect(unmatched).toEqual([])
 const report={realJvmExecuted:true,sessionId:session.id,recordingId:snapshot.scene.recordingId,cursor:snapshot.scene.cursor,rawEvents:session.rawEvents.length,observations:observations.length,matched:matched.length,unmatched:unmatched.length,jdk:jdk.map(observation=>({...observation,kind:snapshot.scene.entities[observation.id].kind})),unmatchedExamples:unmatched.slice(0,12),entries:snapshot.events.filter(event=>event.type==='ENTER_METHOD'||event.type==='EXECUTION_FACT'&&event.fact.kind==='enter').slice(0,12),frames:Object.values(snapshot.scene.entities).filter(node=>node.kind==='frame').slice(0,6).map(node=>({id:node.id,title:node.title,ownership:node.ownership}))}
 await writeFile('.ggjavaez/qa/reference-exact/ownership-bridge-dense.json',JSON.stringify(report,null,2)+'\n')
 await test.info().attach('actual-ownership-bindings',{body:JSON.stringify(report),contentType:'application/json'})
 expect(snapshot.scene.recordingId).toBe(`execution:${session.id}`);expect(snapshot.scene.cursor).toBe(snapshot.scene.liveHead)
 expect(errors).toEqual([])
})
