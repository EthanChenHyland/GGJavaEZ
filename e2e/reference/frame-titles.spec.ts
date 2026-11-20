import {expect,test} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import {browserErrors,home,ready,runFixture,seekCursor,selectEntity,stopOwnedSession} from './harness'
import {truncateFrameText} from '../../src/world/valueText'
test.afterEach(async({request})=>stopOwnedSession(request))
for(const viewport of [{width:1440,height:900},{width:760,height:900}])test(`qualified frame titles fit their original header ${viewport.width}x${viewport.height}`,async({page,request})=>{
 const errors=browserErrors(page);await page.setViewportSize(viewport);const session=await runFixture(page,request,'domain')
 const mutation=await page.evaluate(()=>window.__ggjavaezWorld!.recordedEvents().find(event=>event.type==='SET_FIELD'&&event.value.kind==='primitive'&&event.value.value===18)?.seq)
 expect(mutation).toBeDefined();await seekCursor(page,mutation!+1);await home(page)
 const before=await page.evaluate(()=>{
  const scene=window.__ggjavaezWorld!.scene();return {recording:scene.recordingId,cursor:scene.cursor,frames:scene.liveStack.map(id=>scene.entities[id]),anchors:Object.fromEntries(Object.entries(scene.entities).map(([id,node])=>[id,node.anchor]))}
 })
 const observations=[]
 for(const node of before.frames){
  if(node.kind!=='frame')throw Error('Expected recorded invocation')
  await selectEntity(page,node.id);await page.getByRole('button',{name:'Focus',exact:true}).click();await ready(page)
  const headings=await page.evaluate(id=>window.__ggjavaezWorld!.runtimeHeadings().filter(label=>label.entityId===id),node.id)
  observations.push({id:node.id,title:node.title,headings})
  await writeFile(`.ggjavaez/qa/reference-exact/frame-title-${viewport.width}x${viewport.height}.json`,JSON.stringify({sessionId:session.id,viewport,observations,errors},null,2)+'\n')
  await page.screenshot({path:`.ggjavaez/qa/reference-exact/frame-title-focus-${viewport.width}x${viewport.height}.png`})
  const title=headings.find(label=>label.kind==='title')!,identity=headings.find(label=>label.kind==='identity')!
  expect(title.text.replaceAll('\n','')).toBe(truncateFrameText(node.title));expect(title.text).toContain('\n')
  expect(identity.text).toBe(`#${node.invocationNumber}`);expect(title.opacity).toBeGreaterThan(0);expect(title.fontPixels).toBeGreaterThanOrEqual(11)
  const bounds=title.localInkBounds!;expect(bounds).not.toBeNull()
  const [x,y]=title.position,top=node.anchor.position[1]+node.anchor.size[1]/2
  expect(x+bounds[0]).toBeGreaterThanOrEqual(node.anchor.position[0]-node.anchor.size[0]/2+.20)
  expect(x+bounds[2]).toBeLessThan(node.anchor.position[0]+node.anchor.size[0]/2-.28)
  expect(y+bounds[3]).toBeLessThanOrEqual(top-.05)
  // Status text remains at top - .94; leave its upper half clear.
  expect(y+bounds[1]).toBeGreaterThanOrEqual(top-.81)
  const idBounds=identity.localInkBounds!;expect(x+bounds[2]).toBeLessThan(identity.position[0]+idBounds[0]-.05)
  await home(page)
 }
 const after=await page.evaluate(()=>{const scene=window.__ggjavaezWorld!.scene();return {recording:scene.recordingId,cursor:scene.cursor,anchors:Object.fromEntries(Object.entries(scene.entities).map(([id,node])=>[id,node.anchor]))}})
 expect(after).toEqual({recording:before.recording,cursor:before.cursor,anchors:before.anchors})
 await writeFile(`.ggjavaez/qa/reference-exact/frame-title-${viewport.width}x${viewport.height}.json`,JSON.stringify({sessionId:session.id,viewport,observations,errors},null,2)+'\n')
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/frame-title-hero-${viewport.width}x${viewport.height}.png`});expect(errors).toEqual([])
})
