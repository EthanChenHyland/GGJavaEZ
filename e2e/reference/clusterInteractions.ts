import {expect,test,type Page} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import {PerspectiveCamera,Vector3} from 'three'
import {ready} from './harness'
import type {PresentedCluster} from '../../src/contracts/world'
import type {Selection} from '../../src/contracts/interaction'

export async function far(page:Page){
 const observations:unknown[]=[]
 await page.locator('.world-canvas').focus()
 for(let index=0;index<40&&await page.evaluate(()=>window.__ggjavaezWorld!.plan().detailLevel!=='FAR');index++){
  await page.waitForTimeout(210);await page.keyboard.press('-');await ready(page)
  observations.push(await page.evaluate(()=>({pose:window.__ggjavaezQA!.cameraPose(),detail:window.__ggjavaezWorld!.plan().detailLevel,focus:window.__ggjavaezQA!.focusTarget()})))
 }
 if(await page.evaluate(()=>window.__ggjavaezWorld!.plan().detailLevel!=='FAR')){
  const geometry=await page.evaluate(()=>({shell:window.__ggjavaezQA!.shellRects(),entities:Object.values(window.__ggjavaezWorld!.scene().entities).map(node=>({id:node.id,kind:node.kind,anchor:node.anchor})),clusters:window.__ggjavaezWorld!.plan().clusters}))
  const path=test.info().outputPath('far-native-observations.json')
  await writeFile(path,JSON.stringify({observations,geometry},null,2))
  await test.info().attach('far-native-observations',{path,contentType:'application/json'})
 }
 expect(await page.evaluate(()=>window.__ggjavaezWorld!.plan().detailLevel)).toBe('FAR')
}
export async function clickCluster(page:Page,double=false,region?:'heap'|'library',ownership=false,memberId?:string):Promise<PresentedCluster>{
 const snapshot=await page.evaluate(()=>({pose:window.__ggjavaezQA!.cameraPose(),shell:window.__ggjavaezQA!.shellRects(),clusters:window.__ggjavaezWorld!.plan().clusters}))
 const viewport=page.viewportSize()!,camera=new PerspectiveCamera(36,viewport.width/viewport.height,.05,10000)
 camera.position.set(...snapshot.pose.position);camera.lookAt(...snapshot.pose.target);camera.updateMatrixWorld()
 for(const cluster of snapshot.clusters){
  if(region&&cluster.anchor.region!==region||ownership&&cluster.key.kind!=='ownership'||memberId&&!cluster.memberIds.includes(memberId))continue
  const [x,y,z]=cluster.anchor.position,[w,h,d]=cluster.anchor.size
  for(const [u,v] of [[0,0],[-.3,0],[.3,0],[0,.3],[0,-.3]]){
   const p=new Vector3(x+u*w,y+v*h,z+d/2+.02).project(camera),point={x:(p.x+1)*viewport.width/2,y:(1-p.y)*viewport.height/2}
   const safe=snapshot.shell.safeFrame,inspector=snapshot.shell.inspector
   if(p.z<=-1||p.z>=1||point.x<safe.x||point.x>safe.x+safe.width||point.y<safe.y||point.y>safe.y+safe.height||inspector&&point.x>=inspector.x&&point.x<=inspector.x+inspector.width&&point.y>=inspector.y&&point.y<=inspector.y+inspector.height)continue
   // An unchanged old selection does not prove a new raycast hit. Observe the
   // actual selection publication for this click, including same-ID reselects.
   // This subscription is read-only; it issues no application action.
   const publication=await page.evaluateHandle(async()=>{
    const modulePath='/src/interaction/interactionStore.ts',module=await import(modulePath)
    return{done:new Promise<Selection>(resolve=>{
     const finish=(selection:Selection)=>{clearTimeout(timer);unsubscribe();resolve(selection)}
     const unsubscribe=module.useInteractionStore.subscribe((state:{selection:Selection})=>finish(state.selection))
     const timer=setTimeout(()=>finish(null),500)
    })}
   })
   await page.mouse.click(point.x,point.y)
   const published=await publication.evaluate(holder=>holder.done);await publication.dispose()
   // Read-only observation after the real raycast selection has committed.
   await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
   if(published?.kind==='cluster'&&published.id===cluster.id&&await page.evaluate(id=>window.__ggjavaezQA!.selection()?.kind==='cluster'&&window.__ggjavaezQA!.selection()?.id===id,cluster.id)){
    if(double)await page.mouse.dblclick(point.x,point.y)
    return cluster
   }
  }
 }
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/cluster-travel-unreachable.png'})
 throw new Error('No actual cluster face was reachable by native pointer input')
}
