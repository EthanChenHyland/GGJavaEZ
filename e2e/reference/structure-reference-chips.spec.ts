import {expect,test,type Page} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import {PerspectiveCamera,Vector3} from 'three'
import {browserErrors,focusSelection,home,ready} from './harness'
import {runTopology,stopTopologySession} from './topologyFixture'
import {far} from './clusterInteractions'

interface Target {id:string;title:string;displayId:number;kind:'array'|'collection';slotId:string;index:number}
test.afterEach(async({request})=>stopTopologySession(request))

async function selectStructure(page:Page,target:Target){
 await home(page);await far(page);await page.locator('.world-canvas').focus();await page.keyboard.press('Escape');await ready(page)
 const navigation=[]
 const chooseOffered=async(id:string)=>{
  const list=page.getByRole('listbox',{name:'Runtime entities',exact:true}),targetId=`world-entity-${encodeURIComponent(id)}`
  // The catalog is already open. Another Tab can change the represented cut
  // before this offered identity is selected; keep native keys in this list.
  for(let step=0;step<64;step++){
   await list.focus()
   if(await list.getAttribute('aria-activedescendant')===targetId){await ready(page);expect(await page.evaluate(()=>window.__ggjavaezQA!.selection()?.id)).toBe(id);return true}
   const option=list.locator(`[id="${targetId}"]`),selected=list.locator('[aria-selected="true"]')
   if(await option.count()!==1||await selected.count()!==1)return false
   const targetIndex=Number(await option.getAttribute('aria-posinset')),position=Number(await selected.getAttribute('aria-posinset'))
   await page.keyboard.press(targetIndex<position?'ArrowUp':'ArrowDown')
   await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
  }
  return false
 }
 for(let attempt=0;attempt<16;attempt++){
  await page.locator('.world-canvas').focus();await page.keyboard.press('Tab');await ready(page)
  const list=page.getByRole('listbox',{name:'Runtime entities',exact:true})
  for(let pageIndex=0;pageIndex<32;pageIndex++){
   // A complete virtual catalog scan cannot reveal geometry outside the
   // viewport. Dolly first unless a real cell or containing cluster can offer
   // the target; then retain the same native catalog/member selection below.
   const represented=await page.evaluate(id=>{
    const world=window.__ggjavaezWorld!,plan=world.plan()
    return world.projectedPoint(id)?.visible||[...(plan.cellWindows.get(id)?.mapping.keys()??[])].some(slot=>world.projectedPoint(slot)?.visible)||plan.clusters.some(cluster=>cluster.memberIds.includes(id))
   },target.id)
   if(!represented)break
   const offered=await list.getByRole('option').evaluateAll(options=>options.map(option=>decodeURIComponent(option.id.slice('world-entity-'.length))))
   navigation.push(await page.evaluate(({target,offered,attempt,pageIndex})=>({attempt,pageIndex,offered,point:window.__ggjavaezWorld!.projectedPoint(target.id),detail:window.__ggjavaezWorld!.plan().detailLevel,pose:window.__ggjavaezQA!.cameraPose()}),{target,offered,attempt,pageIndex}))
   const direct=offered.find(id=>id===target.id||target.kind==='array'&&id.startsWith(`${target.id}:element:`))
   if(direct&&await chooseOffered(direct))return
   const cluster=await page.evaluate(({offered,id})=>window.__ggjavaezWorld!.plan().clusters.find(cluster=>offered.includes(cluster.id)&&cluster.memberIds.includes(id)),{offered,id:target.id})
   if(cluster&&await chooseOffered(cluster.id)){
    const members=page.getByRole('list',{name:'Cluster members',exact:true})
    await members.hover();await page.mouse.wheel(0,cluster.memberIds.indexOf(target.id)*52);await ready(page)
    await members.getByRole('button',{name:`Select ${target.title} #${target.displayId}`,exact:true}).click();await ready(page);return
   }
   const selected=list.locator('[aria-selected="true"]');if(await selected.count()!==1)break
   const position=Number(await selected.getAttribute('aria-posinset')),total=Number(await selected.getAttribute('aria-setsize'))
   if(!total||position>=total)break
   for(let step=0;step<Math.min(16,total-position);step++){
    await page.keyboard.press('ArrowDown');await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
   }
  }
  const close=page.getByRole('button',{name:'Close inspector',exact:true});if(await close.count())await close.click()
  await page.locator('.world-canvas').focus();await page.keyboard.press('Escape');await page.keyboard.press('-');await ready(page)
 }
 const path=test.info().outputPath('structure-catalog-navigation.json');await writeFile(path,JSON.stringify({target,navigation},null,2)+'\n');await test.info().attach('structure-catalog-navigation',{path,contentType:'application/json'})
 throw new Error('Captured structure is not reachable through the actual catalog, cluster members and dolly navigation')
}

for(const viewport of[{width:1440,height:900},{width:760,height:900}])for(const reduced of[false,true])test(`actual array and collection reference chips retain ports and slot picks ${viewport.width}x${viewport.height}${reduced?' reduced motion':''}`,async({page,request})=>{
 test.setTimeout(120000);const errors=browserErrors(page)
 await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'})
 const{session}=await runTopology(page,request)
 const targets=await page.evaluate(()=>{
  const nodes=Object.values(window.__ggjavaezWorld!.scene().entities)
  const array=nodes.find(node=>node.kind==='array'&&node.cells.some(cell=>cell.value.kind==='null')&&node.cells.filter(cell=>cell.value.kind==='reference').length>1)
  const list=nodes.find(node=>node.kind==='collection'&&node.collectionKind==='List'&&node.entries.some(entry=>entry.value.kind==='reference')&&node.entries.some(entry=>entry.value.kind==='null'))
  const map=nodes.find(node=>node.kind==='collection'&&node.collectionKind==='Map'&&node.entries.some(entry=>entry.key?.kind==='reference'&&entry.value.kind==='reference'))
  if(array?.kind!=='array'||list?.kind!=='collection'||map?.kind!=='collection')throw new Error('Actual JVM must capture nullable reference arrays, List and reference Map keys/values')
  const cell=array.cells.find(cell=>cell.value.kind==='reference')!
  return[{id:array.id,title:array.title,displayId:array.displayId,kind:array.kind,slotId:cell.slotId,index:cell.index},
   ...[list,map].map(node=>({id:node.id,title:node.title,displayId:node.displayId,kind:node.kind,slotId:node.collectionKind==='Map'?node.entries.find(entry=>entry.key?.kind==='reference')!.keySlotId!:node.entries.find(entry=>entry.value.kind==='reference')!.slotId,index:0}))]
 })
 expect(targets).toHaveLength(3)
 const captures=[]
 for(const target of targets){
  const capture=`structure-chip-${target.kind==='array'?'array':target.title}-${viewport.width}x${viewport.height}${reduced?'-reduced':''}`
  await selectStructure(page,target)
  if(target.kind==='array'){
   await page.getByRole('button',{name:`Reveal index ${target.index}`,exact:true}).click();await ready(page)
  }
  await focusSelection(page);await page.mouse.move(15,15);await ready(page)
  if(target.kind==='array'){
   // Make the following real raycast a selection change, with cell Focus kept.
   await page.getByRole('button',{name:'Reveal index 0',exact:true}).click();await ready(page)
  }
  const before=await page.evaluate(target=>{
   const world=window.__ggjavaezWorld!,scene=world.scene(),node=scene.entities[target.id]
   const references=scene.references.filter(ref=>ref.sourceId===target.id)
   const ids=new Set(node?.kind==='array'?node.cells.map(cell=>cell.slotId):node?.kind==='collection'?node.entries.flatMap(entry=>[entry.slotId,...entry.keySlotId?[entry.keySlotId]:[]]):[])
   return{recordingId:scene.recordingId,cursor:scene.cursor,node,references,
    chips:world.valueChips().filter(chip=>chip.part==='reference-chip'&&ids.has(chip.slotId)),ports:world.connectorPorts().filter(port=>port.referenceChip),
    curves:world.plan().curves.filter(curve=>references.some(ref=>ref.id===curve.id)),
    labels:world.arrayText().filter(label=>label.entityId===target.id),collectionLabels:world.collectionText().filter(label=>label.entityId===target.id),headings:world.runtimeHeadings().filter(label=>label.entityId===target.id),pose:window.__ggjavaezQA!.cameraPose(),focus:window.__ggjavaezQA!.focusTarget(),selection:window.__ggjavaezQA!.selection()}
  },target)
  await writeFile(`.ggjavaez/qa/reference-exact/${capture}.json`,JSON.stringify({sessionId:session.id,target,before,errors},null,2)+'\n')
  expect(before.chips).toHaveLength(before.references.length);expect(before.chips.length).toBeGreaterThan(0)
  expect(before.chips.map(chip=>chip.slotId).sort()).toEqual(before.references.map(reference=>reference.sourceSlotId).sort())
  if(target.kind==='collection'){
   expect(before.collectionLabels.filter(label=>label.kind==='key'||label.kind==='value').length).toBeGreaterThan(0)
   for(const curve of before.curves){
    const owner=before.node.anchor,exit=curve.points.find(point=>Math.abs(point[0]-owner.position[0])>owner.size[0]/2+.035)
    expect(exit).toBeDefined();expect(Math.sign(exit![0]-owner.position[0])).toBe(curve.points.at(-1)![0]<owner.position[0]?-1:1)
   }
   for(const label of [...before.collectionLabels,...before.headings].filter(label=>label.opacity>0)){
    expect(label.inkCorners).toHaveLength(4)
    const lower=[Math.min(...label.inkCorners.map(point=>point[0])),Math.min(...label.inkCorners.map(point=>point[1])),before.node.anchor.position[2]+before.node.anchor.size[2]/2+.02]
    const upper=[Math.max(...label.inkCorners.map(point=>point[0])),Math.max(...label.inkCorners.map(point=>point[1])),Infinity]
    for(const curve of before.curves)for(let segment=1;segment<curve.points.length;segment++){
     const a=curve.points[segment-1],b=curve.points[segment];let enter=0,leave=1
     for(let axis=0;axis<3&&enter<=leave;axis++){
      const delta=b[axis]-a[axis]
      if(Math.abs(delta)<1e-12){if(a[axis]<lower[axis]||a[axis]>upper[axis])enter=2;continue}
      const first=(lower[axis]-a[axis])/delta,last=(upper[axis]-a[axis])/delta
      enter=Math.max(enter,Math.min(first,last));leave=Math.min(leave,Math.max(first,last))
     }
     expect(enter<=leave,`${curve.id} crosses captured ${label.kind} ink ${label.text} in segment ${segment}`).toBe(false)
    }
   }
  }
  const matches=(a:readonly number[],b:readonly number[])=>a.every((value,index)=>Math.abs(value-b[index])<1e-4)
  for(const chip of before.chips){
   // Observe uploaded Float32 instance transforms, not buildSolidBatch output.
   const edge=[chip.position[0]+chip.size[0]/2,chip.position[1],chip.position[2]+chip.size[2]/2]
   const ports=before.ports.filter(port=>matches(port.position,edge));expect(ports).toHaveLength(1)
   expect(ports[0].radius).toBeCloseTo(.08,5)
   const reference=before.references.find(ref=>ref.sourceSlotId===chip.slotId)!,curve=before.curves.find(curve=>curve.id===reference.id)
   if(curve)expect(matches(curve.points[0],edge)).toBe(true)
   if(target.kind==='array'){
    expect(ports[0].opacity).toBeLessThanOrEqual(chip.slotId===target.slotId?1:.25)
    const label=before.labels.find(label=>label.slotId===chip.slotId&&label.kind==='value')!
    expect(label.position[0]).toBeCloseTo(chip.position[0],4);expect(label.position[1]).toBeCloseTo(chip.position[1],4)
    expect(label.position[2]-edge[2]).toBeGreaterThan(.01)
    expect(label.text.includes('…')?label.text.endsWith('…'):true).toBe(true)
   }
  }
  const picked=before.chips.find(chip=>chip.slotId===target.slotId)!
  expect(before.selection?.id).not.toBe(target.slotId)
  const camera=new PerspectiveCamera(36,viewport.width/viewport.height,.05,10000)
  camera.position.set(...before.pose.position);camera.lookAt(...before.pose.target);camera.updateMatrixWorld()
  const point=new Vector3(...picked.position);point.x-=picked.size[0]*.25;point.z+=picked.size[2]/2+.02;point.project(camera)
  expect(Math.abs(point.x)).toBeLessThan(1);expect(Math.abs(point.y)).toBeLessThan(1)
  await page.mouse.click((point.x+1)*viewport.width/2,(1-point.y)*viewport.height/2);await ready(page)
  const after=await page.evaluate(()=>({selection:window.__ggjavaezQA!.selection(),pose:window.__ggjavaezQA!.cameraPose()}))
  await writeFile(`.ggjavaez/qa/reference-exact/${capture}.json`,JSON.stringify({sessionId:session.id,target,before,after,errors},null,2)+'\n')
  expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual({kind:'slot',id:target.slotId})
  expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(before.pose)
  expect(await page.evaluate(id=>window.__ggjavaezWorld!.scene().entities[id],target.id)).toEqual(before.node)
  await page.screenshot({path:`.ggjavaez/qa/reference-exact/${capture}.png`})
  await page.getByRole('button',{name:'Trace',exact:true}).click();await ready(page)
  await page.getByRole('button',{name:'Current',exact:true}).click();await page.mouse.move(15,15);await ready(page)
  const withoutRoutes=await page.evaluate(({target,slotIds})=>{
   const world=window.__ggjavaezWorld!,scene=world.scene(),referenceIds=new Set(scene.references.filter(ref=>ref.sourceId===target.id).map(ref=>ref.id))
   return{recordingId:scene.recordingId,cursor:scene.cursor,focus:window.__ggjavaezQA!.focusTarget(),chips:world.valueChips().filter(chip=>chip.part==='reference-chip'&&slotIds.includes(chip.slotId)),ports:world.connectorPorts().filter(port=>port.referenceChip),curves:world.plan().curves.filter(curve=>referenceIds.has(curve.id)),counts:world.plan().referencePresentation.counts}
  },{target,slotIds:before.chips.map(chip=>chip.slotId)})
  await writeFile(`.ggjavaez/qa/reference-exact/${capture}.json`,JSON.stringify({sessionId:session.id,target,before,after,withoutRoutes,errors},null,2)+'\n')
  expect(withoutRoutes.curves).toEqual([]);expect(withoutRoutes.chips.map(chip=>chip.slotId).sort()).toEqual(before.chips.map(chip=>chip.slotId).sort())
  for(const chip of withoutRoutes.chips){const edge=[chip.position[0]+chip.size[0]/2,chip.position[1],chip.position[2]+chip.size[2]/2];expect(withoutRoutes.ports.some(port=>matches(port.position,edge))).toBe(true)}
  expect(withoutRoutes.recordingId).toBe(before.recordingId);expect(withoutRoutes.cursor).toBe(before.cursor);expect(withoutRoutes.focus).toEqual(before.focus)
  captures.push({target,before,withoutRoutes,capture})
  await page.getByRole('button',{name:'Trace',exact:true}).click();await ready(page)
 }
 await writeFile(`.ggjavaez/qa/reference-exact/structure-chips-${viewport.width}x${viewport.height}${reduced?'-reduced':''}.json`,JSON.stringify({sessionId:session.id,captures,errors},null,2)+'\n')
 expect(errors).toEqual([])
})
