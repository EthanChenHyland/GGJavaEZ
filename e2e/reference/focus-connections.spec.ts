import {expect,test,type Page} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import {browserErrors,runFixture,home,selectEntity,focusSelection,ready,stopOwnedSession} from './harness'

test.describe.configure({timeout:90000})
test.afterEach(async({request})=>stopOwnedSession(request))
async function observation(page:Page){return page.evaluate(()=>{
 const world=window.__ggjavaezWorld!,scene=world.scene(),plan=world.plan(),qa=window.__ggjavaezQA!,owners=new Map<string,string>()
 for(const node of Object.values(scene.entities)){
  const slots=node.kind==='frame'||node.kind==='class'?node.rows.map(row=>row.slotId):node.kind==='object'?node.groups.flatMap(group=>group.rows.map(row=>row.slotId)):node.kind==='array'?node.cells.map(cell=>cell.slotId):node.entries.flatMap(entry=>entry.keySlotId?[entry.slotId,entry.keySlotId]:[entry.slotId])
  for(const id of slots)owners.set(id,node.id)
 }
 for(const window of plan.cellWindows.values())for(const id of window.mapping.keys())owners.set(id,window.arrayId)
 const owner=(id:string|undefined)=>id?scene.entities[id]?id:owners.get(id)??null:null
 const connections=[...plan.curves.map(curve=>({id:curve.id,kind:curve.kind,opacity:curve.opacity,source:owner(curve.sourceAnchor?.entityId),target:owner(curve.destinationAnchor?.entityId)})),...plan.bundles.map(bundle=>({id:bundle.id,kind:bundle.kind,opacity:bundle.opacity,source:owner(bundle.from),target:owner(bundle.to)}))]
 return{recordingId:scene.recordingId,cursor:scene.cursor,anchors:Object.fromEntries(Object.entries(scene.entities).map(([id,node])=>[id,node.anchor])),entities:Object.fromEntries([...plan.entities].map(([id,node])=>[id,{opacity:node.opacity,detail:node.detail}])),references:scene.references,selection:qa.selection(),focus:qa.focusTarget(),pose:qa.cameraPose(),framing:plan.framing.focus,connections,referenceCount:plan.referencePresentation.counts.current,recordedFlows:plan.flowPresentation.counts.recorded}
})}
function checkMask(value:Awaited<ReturnType<typeof observation>>,targetId:string){
 expect(value.focus?.targetId).toBe(targetId);expect(value.framing?.targetId).toBe(targetId)
 const context=new Set([targetId,...value.framing!.neighbours]);expect(value.framing!.neighbours.length).toBeLessThanOrEqual(6)
 let outsideReferences=0,outsideCalls=0,directReferences=0
 for(const connection of value.connections){
  const direct=!!connection.source&&!!connection.target&&(connection.source===targetId||connection.target===targetId)&&context.has(connection.source)&&context.has(connection.target)
  if(!direct){
   expect(connection.opacity,`${connection.kind} ${connection.id} is outside the direct Focus cut`).toBeLessThanOrEqual(.25)
   if(connection.kind==='connector')outsideReferences++
   if(connection.kind==='call')outsideCalls++
  }else if(connection.kind==='connector'||connection.kind==='call'){
   expect(connection.opacity).toBe(1);if(connection.kind==='connector')directReferences++
  }
 }
 return{outsideReferences,outsideCalls,directReferences}
}
for(const viewport of[{width:1440,height:900},{width:760,height:900}])test(`actual Focus caps indirect connections across Trace All and keeps callers as dim context ${viewport.width}x${viewport.height}`,async({page,request},info)=>{
 await page.setViewportSize(viewport);const errors=browserErrors(page),session=await runFixture(page,request,'domain')
 const targets=await page.evaluate(()=>{
  const scene=window.__ggjavaezWorld!.scene()
  const object=Object.values(scene.entities).find(node=>node.kind==='object'&&node.ownership==='PROJECT'&&scene.references.some(ref=>ref.sourceId===node.id&&scene.references.some(next=>next.sourceId===ref.targetId&&next.targetId!==node.id)))
  const call=scene.callLinks.find(call=>{const frame=scene.entities[call.calleeId];return frame?.kind==='frame'&&frame.rows.some(row=>row.value.kind==='reference')})
  if(!object||!call)throw new Error('Captured execution lacks a two-hop object and caller context')
  return{objectId:object.id,frameId:call.calleeId,callerId:call.callerId}
 })
 const captures=[]
 for(const[kind,targetId]of[['object',targets.objectId],['frame',targets.frameId]]as const){
  await home(page);await selectEntity(page,targetId);await focusSelection(page);await ready(page)
  const before=await observation(page),beforeCounts=checkMask(before,targetId)
  expect(beforeCounts.directReferences).toBeGreaterThan(0);expect(beforeCounts.outsideCalls).toBeGreaterThan(0)
  if(kind==='object')expect(beforeCounts.outsideReferences).toBeGreaterThan(0)
  else{
   expect(before.framing!.neighbours).not.toContain(targets.callerId)
   expect(before.entities[targets.callerId].opacity).toBeLessThanOrEqual(.25)
   expect(before.entities[targetId]).toEqual({opacity:1,detail:'CLOSE'})
  }
  await page.getByRole('button',{name:'Trace',exact:true}).click()
  await page.getByRole('group',{name:'Trace scope'}).getByRole('button',{name:'All',exact:true}).click();await ready(page)
  const all=await observation(page),allCounts=checkMask(all,targetId)
  expect(allCounts.outsideCalls).toBeGreaterThan(0)
  if(kind==='object')expect(allCounts.outsideReferences).toBeGreaterThan(0)
  expect(all.recordingId).toBe(before.recordingId);expect(all.cursor).toBe(before.cursor)
  expect(all.anchors).toEqual(before.anchors);expect(all.references).toEqual(before.references)
  expect(all.selection).toEqual(before.selection);expect(all.focus).toEqual(before.focus);expect(all.pose).toEqual(before.pose)
  expect(all.referenceCount).toBe(before.referenceCount);expect(all.recordedFlows).toBe(before.recordedFlows)
  await page.mouse.move(20,20);await ready(page)
  await page.screenshot({path:`.ggjavaez/qa/reference-exact/focus-connections-${kind}-${viewport.width}x${viewport.height}.png`})
  captures.push({kind,before,all,beforeCounts,allCounts})
 }
 await writeFile(info.outputPath('focus-connection-evidence.json'),JSON.stringify({sessionId:session.id,targets,captures},null,2)+'\n')
 expect(errors).toEqual([])
})
