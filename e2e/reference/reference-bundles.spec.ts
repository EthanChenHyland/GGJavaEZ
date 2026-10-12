import {expect,test,type Page} from '@playwright/test'
import {PerspectiveCamera,Vector3} from 'three'
import {writeFile} from 'node:fs/promises'
import {browserErrors,home,ready,runFixture,seekCursor,stopOwnedSession} from './harness'
import {far} from './clusterInteractions'
test.afterEach(async({request})=>stopOwnedSession(request))
async function partition(page:Page){
 const data=await page.evaluate(()=>{const scene=window.__ggjavaezWorld!.scene(),plan=window.__ggjavaezWorld!.plan();return{references:scene.references,bundles:plan.bundles.filter(bundle=>bundle.kind==='connector'),individual:plan.curves.filter(curve=>curve.kind==='connector'),presentation:plan.referencePresentation,clusters:plan.clusters,entities:[...plan.entities.keys()],cursor:scene.cursor}})
 const ids=[...data.individual.map(curve=>curve.id),...data.bundles.flatMap(bundle=>{expect(bundle.count).toBe(bundle.referenceIds!.length);return bundle.referenceIds!}),...data.presentation.unavailable.map(item=>item.id),...data.presentation.internal.map(item=>item.id),...data.presentation.scopeExcluded]
 expect(ids.slice().sort()).toEqual(data.references.map(ref=>ref.id).sort());expect(new Set(ids).size).toBe(ids.length)
 const counts=data.presentation.counts;expect(counts.current).toBe(ids.length);expect(counts.drawable).toBe(counts.individual+counts.bundled);expect(counts.current).toBe(counts.drawable+counts.internal+counts.unavailable+counts.scopeExcluded)
 const proxy=new Map(data.clusters.flatMap(cluster=>cluster.memberIds.map(id=>[id,cluster.id]as const))),byId=new Map(data.references.map(ref=>[ref.id,ref])),pairs=new Set<string>()
 for(const bundle of data.bundles){
  const pair=JSON.stringify([bundle.from,bundle.to]);expect(pairs.has(pair)).toBe(false);pairs.add(pair)
  for(const id of bundle.referenceIds!){const ref=byId.get(id)!;expect(proxy.get(ref.sourceId)??ref.sourceId).toBe(bundle.from);expect(proxy.get(ref.targetId)??ref.targetId).toBe(bundle.to)}
 }
 return data
}
for(const viewport of [{width:1440,height:900},{width:760,height:900}])test(`actual JVM directed bundles and native Inspector ${viewport.width}x${viewport.height}`,async({page,request})=>{
 test.setTimeout(90000);await page.setViewportSize(viewport)
 const errors=browserErrors(page),session=await runFixture(page,request,'dense');await home(page);await far(page)
 const initial=await partition(page);expect(initial.bundles.length).toBeGreaterThan(0)
 const facts=()=>page.evaluate(()=>{const scene=window.__ggjavaezWorld!.scene();return{recording:scene.recordingId,cursor:scene.cursor,anchors:Object.fromEntries(Object.entries(scene.entities).map(([id,node])=>[id,node.anchor])),focus:window.__ggjavaezQA!.focusTarget()}})
 const before=await facts(),pose=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose()),safe=await page.evaluate(()=>window.__ggjavaezQA!.shellRects().safeFrame)
 const camera=new PerspectiveCamera(36,viewport.width/viewport.height,.05,10000);camera.position.set(...pose.position);camera.lookAt(...pose.target);camera.updateMatrixWorld()
 let selected:string|null=null
 for(const bundle of initial.bundles){
  for(let i=1;i<bundle.points.length;i++){
   const p=new Vector3(...bundle.points[i-1]).lerp(new Vector3(...bundle.points[i]),.5).project(camera),x=(p.x+1)*viewport.width/2,y=(1-p.y)*viewport.height/2
   if(p.z<=-1||p.z>=1||x<safe.x||x>safe.x+safe.width||y<safe.y||y>safe.y+safe.height)continue
   await page.mouse.click(x,y);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
   const selection=await page.evaluate(()=>window.__ggjavaezQA!.selection());if(selection?.kind==='bundle'){selected=selection.id;break}
  }
  if(selected)break
 }
 expect(selected,'A real depth-tested structural curve is selectable by native pointer input').not.toBeNull();await ready(page)
 const selectedPlan=await partition(page),bundle=selectedPlan.bundles.find(bundle=>bundle.id===selected)!
 expect(bundle).toBeTruthy();expect(await facts()).toEqual(before);expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(pose)
 const inspector=page.getByRole('complementary',{name:'Selection inspector'});await expect(inspector).toContainText(`${bundle.count} current references`)
 const references=inspector.getByRole('list',{name:'Bundle references'});await expect(references).toBeVisible();expect(await inspector.locator('*').count()).toBeLessThanOrEqual(200)
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/reference-bundles-${viewport.width}x${viewport.height}.png`})
 await references.getByRole('button').first().click();await ready(page);expect(await page.evaluate(()=>window.__ggjavaezQA!.selection()?.kind)).toBe('reference')
 expect(await facts()).toEqual(before);expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(pose);await partition(page)
 // Scrub only through the native Time Dock. Reference constituents are rebuilt
 // from each applied prefix; replay must recover the same directed cut.
 await inspector.getByRole('button',{name:'Close inspector'}).click();await ready(page)
 await seekCursor(page,0);const empty=await partition(page);expect(empty.presentation.counts.current).toBe(0)
 await seekCursor(page,initial.cursor);const replay=await partition(page)
 await seekCursor(page,0);await seekCursor(page,initial.cursor);expect(await partition(page)).toEqual(replay)
 await page.getByRole('button',{name:'Trace',exact:true}).click();await ready(page)
 const scope=page.getByRole('group',{name:'Trace scope'});await scope.getByRole('button',{name:'Current',exact:true}).click();await ready(page)
 const current=await partition(page);expect(current.bundles).toEqual([]);expect(current.individual).toEqual([]);expect(current.presentation.counts.scopeExcluded).toBe(current.references.length);expect(current.presentation.counts.unavailable).toBe(0)
 await scope.getByRole('button',{name:'All',exact:true}).click();await ready(page);await partition(page)
 expect(await facts()).toEqual(before);expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(pose)
 await writeFile(`.ggjavaez/qa/reference-exact/reference-bundles-${viewport.width}x${viewport.height}.json`,JSON.stringify({realJvmExecuted:true,sessionId:session.id,initial,selected:bundle},null,2)+'\n')
 expect(errors).toEqual([])
})
