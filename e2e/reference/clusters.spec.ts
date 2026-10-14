import {expect,test} from '@playwright/test'
import {browserErrors,home,ready,runFixture,stopOwnedSession} from './harness'
import {writeFile} from 'node:fs/promises'
test.afterEach(async({request})=>stopOwnedSession(request))

for(const viewport of [{width:1728,height:1117},{width:1440,height:900},{width:1280,height:800},{width:760,height:900},{width:1440,height:650}])test(`collapsed cluster bounds and reachable exact members ${viewport.width}x${viewport.height}`,async({page,request})=>{
 test.setTimeout(60000);await page.setViewportSize(viewport)
 const errors=browserErrors(page);await runFixture(page,request,'dense');await home(page)
 const world=page.locator('.world-canvas');await world.focus()
 for(let index=0;index<40&&await page.evaluate(()=>window.__ggjavaezWorld!.plan().detailLevel!=='FAR');index++){
  await page.waitForTimeout(210);await page.keyboard.press('-');await ready(page)
 }
 expect(await page.evaluate(()=>window.__ggjavaezWorld!.plan().detailLevel)).toBe('FAR')
 const before=await page.evaluate(()=>({recording:window.__ggjavaezWorld!.scene().recordingId,cursor:window.__ggjavaezWorld!.scene().cursor,pose:window.__ggjavaezQA!.cameraPose(),anchors:Object.fromEntries(Object.entries(window.__ggjavaezWorld!.scene().entities).map(([id,node])=>[id,node.anchor]))}))
 const clusters=await page.evaluate(()=>window.__ggjavaezWorld!.plan().clusters)
 expect(clusters.length).toBeGreaterThan(0)
 await test.info().attach('actual-cluster-cut',{body:JSON.stringify({clusters,accessible:await page.locator('.gg-world-entities').getByRole('option').allTextContents(),before}),contentType:'application/json'})
 for(const cluster of clusters){
  expect(cluster.members).toBe(cluster.memberIds.length);expect(new Set(cluster.memberIds).size).toBe(cluster.members)
  expect(cluster.anchor.size).toEqual([2.4,1.2,.8]);expect(cluster.anchor.ports).toEqual({})
 }
 // Select through the production spatial accessibility order, with real keys.
 for(let index=0;index<100;index++){
  await page.keyboard.press('Tab')
  if(await page.evaluate(()=>{const selection=window.__ggjavaezQA!.selection();return selection?.kind==='cluster'&&(window.__ggjavaezWorld!.plan().clusters.find(cluster=>cluster.id===selection.id)?.members??0)>=11}))break
 }
 const cluster=await page.evaluate(()=>window.__ggjavaezWorld!.plan().clusters.find(cluster=>cluster.id===window.__ggjavaezQA!.selection()?.id))
 if(!cluster){
  const observation=await page.evaluate(()=>({selection:window.__ggjavaezQA!.selection(),plan:window.__ggjavaezWorld!.plan().clusters,catalog:document.querySelector('.gg-world-entities')?.outerHTML}))
  const path=test.info().outputPath('cluster-keyboard-failure.json');await writeFile(path,JSON.stringify(observation,null,2));await test.info().attach('cluster-keyboard-failure',{path,contentType:'application/json'})
 }
 expect(cluster).toBeTruthy();expect(cluster!.members).toBeGreaterThanOrEqual(11);await ready(page)
 await test.info().attach('actual-cluster-members',{body:JSON.stringify(cluster),contentType:'application/json'})
 const inspector=page.getByRole('complementary',{name:'Selection inspector'})
 await expect(inspector).toBeVisible();await expect(inspector.locator('.inspector-heading')).toContainText(`Cluster · ${cluster!.label} ×${cluster!.members}`)
 await expect(inspector.locator('p').first()).toHaveText(`Structural summary · ${cluster!.members} recorded entities`)
 const count=await inspector.locator('.inspector-cluster-title span').last().boundingBox(),heading=await inspector.locator('.inspector-cluster-title').boundingBox()
 expect(count!.x+count!.width).toBeLessThanOrEqual(heading!.x+heading!.width+.01)
 expect(await page.evaluate(()=>window.__ggjavaezWorld!.plan().clusters.find(cluster=>cluster.id===window.__ggjavaezQA!.selection()?.id)?.selected)).toBe(true)
 await expect(page.getByRole('option',{name:`Cluster ${cluster!.label} ×${cluster!.members} recorded entities`,exact:true})).toHaveAttribute('aria-selected','true')
 const list=inspector.getByRole('list',{name:'Cluster members'}),rows=list.getByRole('listitem')
 await expect(rows.first()).toHaveAttribute('aria-setsize',String(cluster!.members))
 expect(await rows.count()).toBeLessThanOrEqual(200)
 expect(await rows.count()).toBeLessThan(cluster!.members)
 const observed=new Set<string>()
 for(let pass=0;pass<cluster!.members+1;pass++){
  for(const id of await list.getByRole('button').evaluateAll(buttons=>buttons.map(button=>button.getAttribute('title')!)))observed.add(id)
  const done=await list.evaluate(element=>element.scrollTop+element.clientHeight>=element.scrollHeight-1)
  if(done){
   // Native scrolling can reach its limit before React commits the final
   // virtual window. Observe that actual row, then sample its real IDs.
   await expect(rows.last()).toHaveAttribute('aria-posinset',String(cluster!.members))
   for(const id of await list.getByRole('button').evaluateAll(buttons=>buttons.map(button=>button.getAttribute('title')!)))observed.add(id)
   break
  }
  const previousScroll=await list.evaluate(element=>element.scrollTop)
  await list.hover();await page.mouse.wheel(0,180)
  await expect.poll(()=>list.evaluate(element=>element.scrollTop)).toBeGreaterThan(previousScroll)
  // Native wheel completion does not imply React committed its virtual window.
  // Observe that the mounted rows cover the actual physical viewport before
  // sampling IDs or issuing the next wheel packet; no scroll setters are used.
  await expect.poll(()=>list.evaluate(element=>{
   const mounted=[...element.querySelectorAll<HTMLElement>('[role="listitem"]')]
   if(!mounted.length||element.clientHeight<=0)return false
   const height=Number.parseFloat(mounted[0].style.height),total=Number(mounted[0].getAttribute('aria-setsize'))
   const first=Number(mounted[0].getAttribute('aria-posinset')),last=Number(mounted.at(-1)!.getAttribute('aria-posinset'))
   return height>0&&first<=Math.floor(element.scrollTop/height)+1&&last>=Math.min(total,Math.ceil((element.scrollTop+element.clientHeight)/height))
  })).toBe(true)
 }
 expect([...observed].sort()).toEqual([...cluster!.memberIds].sort())
 const after=await page.evaluate(()=>({recording:window.__ggjavaezWorld!.scene().recordingId,cursor:window.__ggjavaezWorld!.scene().cursor,pose:window.__ggjavaezQA!.cameraPose(),anchors:Object.fromEntries(Object.entries(window.__ggjavaezWorld!.scene().entities).map(([id,node])=>[id,node.anchor]))}))
 expect(after).toEqual(before)
 const labels=await page.evaluate(()=>({labels:window.__ggjavaezWorld!.structuralLabels().filter(label=>label.visible),shell:window.__ggjavaezQA!.shellRects()}))
 expect(labels.labels.some(label=>label.id===cluster!.id)).toBe(true)
 for(const label of labels.labels){
  expect(label.minimumFontPixels).toBeGreaterThanOrEqual(12);expect(label.bounds).toBeTruthy()
  const rect=label.bounds!,safe=labels.shell.safeFrame
  expect(rect.x).toBeGreaterThanOrEqual(safe.x);expect(rect.y).toBeGreaterThanOrEqual(safe.y)
  expect(rect.x+rect.width).toBeLessThanOrEqual(safe.x+safe.width);expect(rect.y+rect.height).toBeLessThanOrEqual(safe.y+safe.height)
  if(labels.shell.inspector){const area=labels.shell.inspector;expect(rect.x>=area.x+area.width+4||rect.x+rect.width+4<=area.x||rect.y>=area.y+area.height+4||rect.y+rect.height+4<=area.y).toBe(true)}
 }
 for(let i=0;i<labels.labels.length;i++)for(let j=i+1;j<labels.labels.length;j++){
  const a=labels.labels[i].bounds!,b=labels.labels[j].bounds!
  expect(a.x>=b.x+b.width+4||a.x+a.width+4<=b.x||a.y>=b.y+b.height+4||a.y+a.height+4<=b.y).toBe(true)
 }
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/cluster-members-${viewport.width}x${viewport.height}.png`})
 const button=list.getByRole('button').last(),id=await button.getAttribute('title');await button.click();await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.selection()?.id)).toBe(id)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(before.pose)
 expect(await page.evaluate(id=>window.__ggjavaezWorld!.plan().entities.get(id!)?.mode,id)).toBe('detailed')
 expect(errors).toEqual([])
})
