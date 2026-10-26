import {expect,test} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {PerspectiveCamera,Vector3} from 'three'
import type {ExecutionSession} from '../../src/execution/contracts'
import {normalizeTrace} from '../../src/instrumentation/normalize'
import {historyForTrace} from '../../src/runtime/history'
import {browserErrors,currentSession,focusSelection,ready,seekCursor,selectEntity} from './harness'
const owned=new Set<string>(),active=['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED']
test.afterEach(async({request})=>{const session=await currentSession(request);if(session&&owned.has(session.projectId)&&active.includes(session.phase))expect((await request.post(`/api/execution/${session.id}/stop`,{data:{}})).ok()).toBe(true)})
const content=`public class FrameValues {
 static final class Box { Object missing; }
 static void inspect(Object input) {
  Object local = input;
  Box box = new Box();
  System.out.println(local == box.missing);
 }
 public static void main(String[] args) { inspect(null); }
}
`
for(const viewport of[{width:1440,height:900},{width:760,height:900}])test(`actual null Frame values have inset chips while Heap null stays plain ${viewport.width}x${viewport.height}`,async({page,request})=>{
 test.setTimeout(90000);const errors=browserErrors(page);await page.setViewportSize(viewport)
 const previous=await currentSession(request);expect(!previous||!active.includes(previous.phase),'Preserve unrelated active execution').toBe(true)
 const imported=await request.post('/api/projects/import',{data:{name:`Frame values ${randomUUID()}`,files:[{path:'FrameValues.java',content}]}});expect(imported.ok()).toBe(true)
 const id=(await imported.json()).id as string;owned.add(id);await page.addInitScript(id=>localStorage.setItem('ggjavaez:project',id),id)
 await page.goto('/?qa=1');await page.waitForFunction(()=>typeof window.__ggjavaezQA?.ready==='function')
 const pending=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/projects/${id}/execution`&&response.request().method()==='POST');await page.getByRole('button',{name:'Run',exact:true}).click()
 const response=await pending;expect(response.ok()).toBe(true);const started=await response.json() as ExecutionSession
 await expect.poll(async()=>{const current=await currentSession(request);return current?.id===started.id?current.phase:null},{timeout:45000}).toBe('COMPLETED')
 const session=(await currentSession(request))!;expect(session.projectId).toBe(id);expect(session.build?.success).toBe(true);expect(session.recording?.state).toBe('FULL');expect(session.exitCode).toBe(0);expect(session.stdout).toBe('true\n');expect(session.stderr).toBe('')
 const oracle=normalizeTrace(session.rawEvents,session.sourceManifest,{status:session.terminalStatus!,exitCode:session.exitCode,diagnostic:session.diagnostic,recording:session.recording!},`execution:${session.id}`),count=oracle.trace.events.length;historyForTrace(oracle.trace).dispose()
 await test.info().attach('actual-jvm-session',{body:JSON.stringify({id:session.id,rawEvents:session.rawEvents.length,normalizedEvents:count,buildSuccess:true}),contentType:'application/json'})
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld?.scene().recordingId)).toBe(`execution:${session.id}`);await expect(page.getByRole('slider',{name:'Recorded execution position'})).toHaveAttribute('aria-valuemax',String(count),{timeout:45000})
 const cursor=await page.evaluate(()=>{const event=window.__ggjavaezWorld!.recordedEvents().find(event=>event.type==='LINE_EXECUTE'&&event.source?.fileId.endsWith('FrameValues.java')&&event.source.line===6);return event?event.seq+1:null});expect(cursor).not.toBeNull();await seekCursor(page,cursor!)
 const target=await page.evaluate(()=>{const scene=window.__ggjavaezWorld!.scene(),frame=Object.values(scene.entities).find(node=>node.kind==='frame'&&node.title.includes('inspect('));if(frame?.kind!=='frame')throw Error('Captured inspect Frame missing');return{id:frame.id,nullRows:frame.rows.filter(row=>row.value.kind==='null').map(row=>({slotId:row.slotId,name:row.name}))}})
 expect(target.nullRows.map(row=>row.name).sort()).toEqual(['input','local']);await selectEntity(page,target.id);await focusSelection(page);await ready(page)
 const before=await page.evaluate(async target=>{
  const path='/src/render/SolidBatch.tsx',{buildSolidBatch}=await import(path),world=window.__ggjavaezWorld!,scene=world.scene(),solids=buildSolidBatch(scene,world.plan())
  const chips=target.nullRows.map(row=>{const parts=solids.filter((solid:{pick:{id:string}})=>solid.pick.id===row.slotId);return{...row,parts:parts.map((solid:{part?:string})=>solid.part??'row'),fill:parts.find((solid:{part?:string})=>solid.part==='value-chip')?.anchor,references:scene.references.filter(ref=>ref.sourceSlotId===row.slotId).length,label:world.frameText().find(label=>label.kind==='value'&&label.slotId===row.slotId)}})
  const heapNulls=Object.values(scene.entities).flatMap(node=>node.kind==='object'?node.groups.flatMap(group=>group.rows).filter(row=>row.value.kind==='null').map(row=>({slotId:row.slotId,parts:solids.filter((solid:{pick:{id:string};part?:string})=>solid.pick.id===row.slotId&&solid.part).map((solid:{part:string})=>solid.part)})):[])
  return{chips,heapNulls,pose:window.__ggjavaezQA!.cameraPose(),recordingId:scene.recordingId,cursor:scene.cursor,entities:scene.entities,references:scene.references}
 },target)
 for(const chip of before.chips){expect(chip.parts).toEqual(['row','value-chip-rim','value-chip']);expect(chip.fill?.ports).toEqual({});expect(chip.references).toBe(0);expect(chip.label?.text).toBe('null');expect(chip.label!.opacity).toBeGreaterThan(0);expect(chip.label!.fontPixels).toBeGreaterThanOrEqual(11)}
 expect(before.heapNulls.length).toBeGreaterThan(0);for(const row of before.heapNulls)expect(row.parts).toEqual([])
 const fill=before.chips[0].fill!,camera=new PerspectiveCamera(36,viewport.width/viewport.height,.01,100000);camera.position.set(...before.pose.position);camera.lookAt(...before.pose.target);camera.updateMatrixWorld()
 const projected=new Vector3(fill.position[0],fill.position[1],fill.position[2]+fill.size[2]/2).project(camera),point={x:(projected.x+1)*viewport.width/2,y:(1-projected.y)*viewport.height/2}
 expect(point.x).toBeGreaterThan(0);expect(point.x).toBeLessThan(viewport.width);expect(point.y).toBeGreaterThan(0);expect(point.y).toBeLessThan(viewport.height)
 await page.mouse.click(point.x,point.y);await ready(page)
 const after=await page.evaluate(()=>{const scene=window.__ggjavaezWorld!.scene();return{selection:window.__ggjavaezQA!.selection(),pose:window.__ggjavaezQA!.cameraPose(),recordingId:scene.recordingId,cursor:scene.cursor,entities:scene.entities,references:scene.references}})
 expect(after.selection).toEqual({kind:'slot',id:before.chips[0].slotId});expect(after.pose).toEqual(before.pose);expect(after.recordingId).toBe(before.recordingId);expect(after.cursor).toBe(before.cursor);expect(after.entities).toEqual(before.entities);expect(after.references).toEqual(before.references)
 await expect(page.getByRole('complementary',{name:'Selection inspector'}).getByRole('button',{name:`Inspect ${before.chips[0].name}`,exact:true})).toHaveText('null')
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/frame-value-chips-${viewport.width}x${viewport.height}.png`});await writeFile(`.ggjavaez/qa/reference-exact/frame-value-chips-${viewport.width}x${viewport.height}.json`,JSON.stringify({sessionId:session.id,rawEvents:session.rawEvents.length,normalizedEvents:count,before,after,point,errors},null,2)+'\n');expect(errors).toEqual([])
})
