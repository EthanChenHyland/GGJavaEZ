import {expect,test} from '@playwright/test'
import {browserErrors,focusSelection,ready,runFixture,seekCursor,selectEntity} from './harness'

test('real Java array values have rendered glyph pixels when World readiness resolves after scrubbing',async({page,request})=>{
 test.setTimeout(120000)
 const errors=browserErrors(page)
 await page.emulateMedia({reducedMotion:'reduce'})
 const session=await runFixture(page,request,'array')
 const target=await page.evaluate(()=>{
  const world=window.__ggjavaezWorld!,node=Object.values(world.scene().entities).find(node=>node.kind==='array'&&node.length===5)
  if(node?.kind!=='array')throw Error('Missing actual five-cell array')
  const writes=world.recordedEvents().filter(event=>event.type==='ARRAY_WRITE'&&event.objectId===node.id)
  if(writes.length<3)throw Error('Actual Java did not capture three indexed writes')
  return{id:node.id,cursors:[writes[0].seq+1,writes.at(-1)!.seq+1,writes[1].seq+1,world.scene().liveHead]}
 })
 await selectEntity(page,target.id);await focusSelection(page)
 for(const [step,cursor]of target.cursors.entries()){
  await seekCursor(page,cursor);await ready(page)
  const labels=await page.evaluate(id=>{
   const world=window.__ggjavaezWorld!,node=world.scene().entities[id]
   if(node.kind!=='array')throw Error('Array disappeared during replay')
   return world.arrayText().filter(label=>label.entityId===id&&label.kind==='value').map(label=>{
    const cell=node.cells.find(cell=>cell.slotId===label.slotId)
    if(!cell)throw Error('A glyph has no captured semantic cell')
    return{...label,captured:cell.value.text}
   })
  },target.id)
  expect(labels).toHaveLength(5)
  for(const label of labels){expect(label.text).toBe(label.captured);expect(label.opacity).toBe(1);expect(label.fontPixels).toBeGreaterThanOrEqual(11);expect(label.bounds).not.toBeNull()}
  const screenshot=await page.screenshot({path:test.info().outputPath(`array-glyphs-${step}.png`)})
  const pixels=await page.evaluate(async({png,labels})=>{
   const response=await fetch(`data:image/png;base64,${png}`),bitmap=await createImageBitmap(await response.blob())
   const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),context=canvas.getContext('2d')!
   context.drawImage(bitmap,0,0);bitmap.close()
   return labels.map(label=>{
    const rect=label.bounds!,x=Math.max(0,Math.floor(rect.x)),y=Math.max(0,Math.floor(rect.y))
    const width=Math.min(canvas.width-x,Math.ceil(rect.width)+2),height=Math.min(canvas.height-y,Math.ceil(rect.height)+2)
    if(width<=0||height<=0)return{slotId:label.slotId,inkPixels:0}
    const {data}=context.getImageData(x,y,width,height);let inkPixels=0
    // Read the captured PNG. Bright cyan/white ink is distinct from the dark
    // violet face; semantic metadata alone cannot satisfy this assertion.
    for(let i=0;i<data.length;i+=4)if(data[i+1]>110&&data[i+2]>100)inkPixels++
    return{slotId:label.slotId,inkPixels}
   })
  },{png:screenshot.toString('base64'),labels})
  for(const sample of pixels)expect(sample.inkPixels,`${sample.slotId} has actual glyph pixels at cursor ${cursor}`).toBeGreaterThan(3)
  await test.info().attach(`glyph-pixels-${step}`,{body:JSON.stringify({sessionId:session.id,cursor,labels,pixels}),contentType:'application/json'})
 }
 expect(errors).toEqual([])
})
