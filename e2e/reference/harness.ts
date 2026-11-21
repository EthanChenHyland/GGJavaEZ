import {expect,test,type Page,type APIRequestContext} from '@playwright/test'
import {readFile,readdir} from 'node:fs/promises'
import {resolve,relative} from 'node:path'
import {randomUUID} from 'node:crypto'
import type {ExecutionSession} from '../../src/execution/contracts'
import type {} from '../../src/qa/qaBridge'
import {normalizeTrace} from '../../src/instrumentation/normalize'
import {ioPortPreview} from '../../src/world/ioPortText'
import design from '../../docs/visual-java-spec/DESIGN_TOKENS.json' with {type:'json'}
import {fitWorldText} from '../../src/render/text/textSystem'
import manifest from '../../fixtures/reference-exact/manifest.json' with {type:'json'}
export type FixtureName=keyof typeof manifest
const ownedProjects=new Map<FixtureName,string>()
export function browserErrors(page:Page):string[]{
 const errors:string[]=[]
 page.on('pageerror',error=>errors.push(error.message))
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
 return errors
}
async function javaFiles(directory:string):Promise<{path:string;content:string}[]>{
 const root=resolve(directory),result:{path:string;content:string}[]=[]
 async function visit(path:string):Promise<void>{
  for(const entry of (await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   const full=resolve(path,entry.name)
   if(entry.isDirectory())await visit(full)
   else if(entry.name.endsWith('.java'))result.push({path:relative(root,full).split('\\').join('/'),content:await readFile(full,'utf8')})
  }
 }
 await visit(root);expect(result.length,'Fixture contains ordinary Java source').toBeGreaterThan(0);return result
}
export async function currentSession(request:APIRequestContext):Promise<ExecutionSession|null>{
 const response=await request.get('/api/execution/current');expect(response.ok()).toBe(true);return response.json()
}
export async function ready(page:Page):Promise<void>{await page.evaluate(()=>window.__ggjavaezQA!.ready())}
export async function openFixture(page:Page,request:APIRequestContext,name:FixtureName):Promise<string>{
 // The recovery flow edits its imported exception project through Monaco. Each
 // exception run needs fresh source so later tests record the original failure.
 let id=name==='exception'?undefined:ownedProjects.get(name)
 if(!id){
  const response=await request.post('/api/projects/import',{data:{name:`Reference ${name} ${randomUUID()}`,files:await javaFiles(`fixtures/reference-exact/${name}`)}})
  expect(response.ok(),await response.text()).toBe(true);id=(await response.json()).id as string;ownedProjects.set(name,id)
 }
 const definition=manifest[name]
 await page.addInitScript(({id,definition})=>{
  localStorage.setItem('ggjavaez:project',id)
  if('breakpoint' in definition)localStorage.setItem(`ggjavaez:breakpoints:${id}`,JSON.stringify([{fileId:definition.breakpoint.path,line:definition.breakpoint.line}]))
 },{id,definition})
 await page.goto('/?qa=1')
 // The HTML load precedes the asynchronously imported application Shell. Wait
 // for its real published boundary before starting the editor visibility check;
 // a cold dev module graph is not a five-second Monaco mount measurement.
 await page.waitForFunction(()=>typeof window.__ggjavaezQA?.ready==='function')
 // A published Shell can still be restoring its selected project and JDK.
 await page.waitForFunction(id=>document.querySelector('[data-project-id]')?.getAttribute('data-project-id')===id,id)
 if(page.viewportSize()!.width<1024){
  const peek=page.getByRole('button',{name:'Show source drawer',exact:true})
  await expect(peek).toBeVisible();await expect(peek).toContainText('.java')
 }else{
  // A selected ID precedes the asynchronous tree/file restore. Start the
  // editor mount check once the actual active file has reached its Source tab.
  await expect(page.locator('.ide-tab.is-active')).toBeVisible()
  await expect(page.locator('.monaco-editor')).toBeVisible()
 }
 await expect(page.getByRole('button',{name:'Run',exact:true})).toBeEnabled()
 return id
}
export async function startFixture(page:Page,request:APIRequestContext,name:FixtureName,kind:'run'|'debug'='run'):Promise<ExecutionSession>{
 const id=await openFixture(page,request,name)
 const pending=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/projects/${id}/execution`&&response.request().method()==='POST')
 await page.getByRole('button',{name:kind==='run'?'Run':'Debug',exact:true}).click()
 const response=await pending;expect(response.ok(),await response.text()).toBe(true)
 const started=await response.json() as ExecutionSession
 expect(started.kind).toBe(kind);expect(started.projectId).toBe(id)
 return started
}
export async function runFixture(page:Page,request:APIRequestContext,name:FixtureName):Promise<ExecutionSession>{
 const started=await startFixture(page,request,name),definition=manifest[name]
 if('stdin' in definition){
  await expect.poll(async()=>{const session=await currentSession(request);return session?.id===started.id?session.phase:null},{timeout:15000}).toBe('WAITING_FOR_INPUT')
  const response=await request.post(`/api/execution/${started.id}/input`,{data:{text:definition.stdin}});expect(response.ok()).toBe(true)
 }
 await expect.poll(async()=>{const session=await currentSession(request);return session?.id===started.id?session.phase:null},{timeout:45000}).toMatch(/^(COMPLETED|FAILED)$/)
 const session=(await currentSession(request))!
 expect(session.build?.success).toBe(true);expect(session.sourceManifest.sources.length).toBeGreaterThan(0)
 expect(session.id).toBe(started.id);expect(session.rawEvents.length,'Real JVM emitted events').toBeGreaterThan(0)
 await test.info().attach('actual-jvm-session',{body:JSON.stringify({id:session.id,rawEvents:session.rawEvents.length,buildSuccess:session.build?.success}),contentType:'application/json'})
 // The preserved bridge reports project coverage as PARTIAL for a crashed JVM;
 // that capability label is independent of the FULL captured recording.
 expect(session.support).toBe(definition.expectedExit==='nonzero'?'PARTIAL':'FULL')
 expect(session.terminalStatus).toBe(definition.expectedExit==='nonzero'?'program_crashed':'complete')
 expect(session.recording?.state).toBe('FULL')
 expect(session.stdout).toBe(definition.stdout)
 if('stderr' in definition)expect(session.stderr).toBe(definition.stderr)
 if('stderrContains' in definition)for(const value of definition.stderrContains)expect(session.stderr).toContain(value)
 if(definition.expectedExit==='nonzero'){expect(session.exitCode).not.toBeNull();expect(session.exitCode).not.toBe(0)}else expect(session.exitCode).toBe(definition.expectedExit)
 const normalized=normalizeTrace(session.rawEvents,session.sourceManifest,{status:session.terminalStatus!,exitCode:session.exitCode,diagnostic:session.diagnostic,
  ...(session.recording?{recording:session.recording}:{}),...(session.capability?{capability:session.capability}:{})},`execution:${session.id}`).trace.events.length
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA?.appState().dimensions.view.recordingId??null)).toBe(`execution:${session.id}`)
 const slider=page.getByRole('slider',{name:'Recorded execution position'});await expect(slider).toHaveAttribute('aria-valuemax',String(normalized),{timeout:45000});await slider.focus();await page.keyboard.press('End')
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld?.scene().cursor)).toBe(normalized)
 await ready(page)
 const counts=await page.evaluate(()=>{const scene=window.__ggjavaezWorld!.scene();return{frames:scene.order.frames.length,objects:scene.order.objects.length,classes:scene.order.classes.length,references:scene.references.length}})
 expect(counts,'Final normalized scene matches the real-JVM fixture inventory').toEqual(definition.sceneCounts)
 return session
}
/** Stop only a JVM started by this harness, never an unrelated session. */
export async function stopOwnedSession(request:APIRequestContext):Promise<void>{
 const session=await currentSession(request)
 if(session&&[...ownedProjects.values()].includes(session.projectId)&&['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(session.phase)){
  const response=await request.post(`/api/execution/${session.id}/stop`,{data:{}});expect(response.ok()).toBe(true)
 }
}

export async function seekCursor(page:Page,cursor:number):Promise<void>{
 const slider=page.getByRole('slider',{name:'Recorded execution position'}),maximum=Number(await slider.getAttribute('aria-valuemax'))
 expect(cursor).toBeGreaterThanOrEqual(0);expect(cursor).toBeLessThanOrEqual(maximum)
 if(cursor===0||cursor===maximum){await slider.focus();await page.keyboard.press(cursor===0?'Home':'End')}
 else{
  const bounds=(await slider.boundingBox())!;await slider.click({position:{x:bounds.width*cursor/maximum,y:bounds.height/2}})
  await slider.focus()
  for(let correction=0;correction<8;correction++){
   const actual=Number(await slider.getAttribute('aria-valuenow'));if(actual===cursor)break
   await page.keyboard.press(actual<cursor?'ArrowRight':'ArrowLeft')
  }
 }
 await expect(slider).toHaveAttribute('aria-valuenow',String(cursor));await ready(page)
}
export async function home(page:Page):Promise<void>{await page.getByRole('button',{name:'Home',exact:true}).click();await ready(page)}
export async function focusSelection(page:Page):Promise<void>{
 await page.locator('.world-canvas').focus();await page.keyboard.press('F1')
 await page.getByRole('combobox',{name:'Search commands'}).fill('Focus Selection')
 await page.getByRole('option').filter({has:page.getByText('Navigation: Focus Selection',{exact:true})}).click()
 await expect(page.getByRole('dialog',{name:'Command Palette'})).toHaveCount(0)
 await ready(page)
}
export async function follow(page:Page):Promise<void>{
 await page.locator('.world-canvas').focus();await page.keyboard.press('F1')
 await page.getByRole('combobox',{name:'Search commands'}).fill('Follow')
 await page.getByRole('option').filter({has:page.getByText('Navigation: Follow',{exact:true})}).click()
 await expect(page.getByRole('dialog',{name:'Command Palette'})).toHaveCount(0)
 await ready(page)
}
export async function selectEntity(page:Page,id:string):Promise<void>{
 const list=page.getByRole('listbox',{name:'Runtime entities'})
 // Re-enter from the end in the opposite direction: Tab at the final entity
 // intentionally leaves the World. A selected singleton already is the target.
 const selectedOption=list.locator('[aria-selected="true"]')
 const hasSelection=await selectedOption.count()>0
 const position=hasSelection?Number(await selectedOption.getAttribute('aria-posinset')):0
 const total=hasSelection?Number(await selectedOption.getAttribute('aria-setsize')):0
 if(total===1&&await page.evaluate(()=>window.__ggjavaezQA!.selection()?.id)===id)return
 await page.locator('.world-canvas').focus();await page.keyboard.press(total>1&&position===total?'Shift+Tab':'Tab')
 await expect(list).toBeFocused()
 // The accessible list follows real pickability and projection. Never select an
 // off-screen/hidden identity through a store setter.
 const targetId=`world-entity-${encodeURIComponent(id)}`
 for(let step=0;step<64;step++){
  const active=await list.getAttribute('aria-activedescendant')
  // A native selection may repack a virtualized cell window. Selection is
  // the semantic result; the viewport catalog can change on that same frame.
  const selectedId=await page.evaluate(()=>window.__ggjavaezQA!.selection()?.id)
  if(active===targetId||selectedId===id){await ready(page);expect(await page.evaluate(()=>window.__ggjavaezQA!.selection()?.id)).toBe(id);return}
  const target=list.locator(`[id="${targetId}"]`),selected=list.locator('[aria-selected="true"]')
  const targetIndex=await target.count()?Number(await target.getAttribute('aria-posinset')):Infinity
  const selectedIndex=await selected.count()?Number(await selected.getAttribute('aria-posinset')):0
  await page.keyboard.press(targetIndex<selectedIndex?'ArrowUp':'ArrowDown')
  // QA observation is published by the real render frame, not synchronously by
  // React's key handler. Await that publication before deciding the next key.
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
 }
 throw new Error(`Runtime entity ${id} is not reachable in the actual accessible catalog`)
}

export interface ReferenceState {id:string;name:string;fixture:FixtureName;twin:string;native:{width:number;height:number};crop?:{x:number;y:number;width:number;height:number}}
/** Readiness is finite and comes from actual glyph upload/effect/camera frames.
 * Save the evidence before failing a tolerance so a miss can be inspected. */
export async function captureComparison(page:Page,request:APIRequestContext,state:ReferenceState,sessionId:string,viewportLabel:string):Promise<void>{
 const {mkdir,writeFile}=await import('node:fs/promises')
 const {createHash}=await import('node:crypto')
 const {measurementFailures,recursiveHeadingFailures}=await import('./measurements')
 await ready(page)
 // CSS surface resizing is independent of the presentation clock; wait for the
 // actual running width/height transitions, including interrupted transitions.
 await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(animation=>animation.playState==='running'&&animation.effect instanceof KeyframeEffect&&animation.effect.target instanceof Element&&animation.effect.target.closest('.ide-editor-panel')).map(animation=>animation.finished.catch(()=>undefined)))})
 const observe=()=>page.evaluate(()=>{
  const qa=window.__ggjavaezQA!,world=window.__ggjavaezWorld!,scene=world.scene()
  return{viewport:{width:innerWidth,height:innerHeight},app:qa.appState(),scene,shell:qa.shellRects(),world:qa.worldProjection()!,structuralLabels:world.structuralLabels(),runtimeHeadings:world.runtimeHeadings(),frameText:world.frameText(),arrayText:world.arrayText(),ioText:world.ioText(),returnText:world.returnText(),atmosphere:world.atmosphere(),selection:qa.selection(),pose:qa.cameraPose(),plan:qa.planStats(),renderer:world.renderer(),effects:world.effects(),quality:world.quality(),prefix:{recordingId:scene.recordingId,cursor:scene.cursor,liveHead:scene.liveHead,eventId:scene.cursorEvent?.id??null}}
 })
 const before=await observe(),session=(await currentSession(request))!
 expect(session?.id,'Capture belongs to the actual fixture JVM').toBe(sessionId)
 expect(session.rawEvents.length).toBeGreaterThan(0);expect(session.build?.success).toBe(true)
 expect(before.prefix.recordingId).toBe(`execution:${sessionId}`)
 expect(before.effects.ready).toBe(true);expect(before.effects.frames).toBeGreaterThanOrEqual(2)
 const id=`${state.id}-${viewportLabel}`,base=resolve('docs/checkpoints/reference-exact')
 for(const directory of ['captures','side-by-side','diff'])await mkdir(resolve(base,directory),{recursive:true})
 const png=await page.screenshot({path:resolve(base,'captures',`${id}.png`),animations:'disabled'})
 const after=await observe();expect(after.prefix,'Capture must retain the committed prefix').toEqual(before.prefix)
 expect(after.selection).toEqual(before.selection);expect(after.pose).toEqual(before.pose)
 const reference=await readFile(resolve('docs/visual-java-spec/references',state.twin))
 const composed=await page.evaluate(async({actual,reference,crop,stateName})=>{
  const bitmap=async(data:string)=>createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob())
  const [a,r]=await Promise.all([bitmap(actual),bitmap(reference)])
  try{
   const cut=crop??{x:0,y:0,width:r.width,height:r.height}
   if(cut.x<0||cut.y<0||cut.x+cut.width>r.width||cut.y+cut.height>r.height)throw new Error('Reference panel crop exceeds its unchanged native twin')
   const referenceCanvas=new OffscreenCanvas(cut.width,cut.height),left=referenceCanvas.getContext('2d')!
   left.drawImage(r,cut.x,cut.y,cut.width,cut.height,0,0,cut.width,cut.height)
   const actualCanvas=new OffscreenCanvas(cut.width,cut.height),right=actualCanvas.getContext('2d')!
   right.fillStyle='#03050C';right.fillRect(0,0,cut.width,cut.height)
   const scale=Math.min(cut.width/a.width,cut.height/a.height),padX=(cut.width-a.width*scale)/2,padY=(cut.height-a.height*scale)/2
   right.drawImage(a,padX,padY,a.width*scale,a.height*scale)
   const paired=new OffscreenCanvas(cut.width*2,cut.height+36),pair=paired.getContext('2d')!
   pair.fillStyle='#03050C';pair.fillRect(0,0,paired.width,paired.height);pair.drawImage(referenceCanvas,0,36);pair.drawImage(actualCanvas,cut.width,36)
   pair.fillStyle='#EEF4FF';pair.font='12px sans-serif';pair.fillText(`${stateName} · reference panel ${cut.width}×${cut.height}`,8,22);pair.fillText(`Actual ${a.width}×${a.height} · contain scale ${scale.toFixed(4)} (letterboxed)`,cut.width+8,22)
   const l=left.getImageData(0,0,cut.width,cut.height),v=right.getImageData(0,0,cut.width,cut.height),difference=new OffscreenCanvas(cut.width,cut.height),diff=difference.getContext('2d')!,pixels=diff.createImageData(cut.width,cut.height)
   for(let i=0;i<pixels.data.length;i+=4){for(let channel=0;channel<3;channel++)pixels.data[i+channel]=Math.abs(l.data[i+channel]-v.data[i+channel]);pixels.data[i+3]=255}diff.putImageData(pixels,0,0)
   const encode=async(canvas:OffscreenCanvas)=>{const bytes=new Uint8Array(await (await canvas.convertToBlob({type:'image/png'})).arrayBuffer());let encoded='';for(let i=0;i<bytes.length;i+=32768)encoded+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(encoded)}
   return{paired:await encode(paired),diff:await encode(difference),referenceSize:{width:r.width,height:r.height},comparison:{crop:cut,scale,padX,padY}}
  }finally{a.close();r.close()}
 },{actual:png.toString('base64'),reference:reference.toString('base64'),crop:state.crop,stateName:state.name})
 expect(composed.referenceSize,'Compare the original native reference without resizing its stored file').toEqual(state.native)
 await writeFile(resolve(base,'side-by-side',`${id}.png`),Buffer.from(composed.paired,'base64'))
 await writeFile(resolve(base,'diff',`${id}.png`),Buffer.from(composed.diff,'base64'))
 const misses=measurementFailures({...before,stateId:state.id})
 if(state.id==='recursion')misses.push(...recursiveHeadingFailures(before.scene,before.world,before.pose.position,before.runtimeHeadings))
 if(state.id==='return'){
  const heading=before.structuralLabels.find(label=>label.id==='RETURNS'),safe=before.shell.safeFrame
  const inside=(bounds:{x:number;y:number;width:number;height:number}|null)=>!!bounds&&bounds.x>=safe.x-.001&&bounds.y>=safe.y-.001&&bounds.x+bounds.width<=safe.x+safe.width+.001&&bounds.y+bounds.height<=safe.y+safe.height+.001
  if(!heading?.visible||heading.minimumFontPixels<12||!inside(heading.bounds))misses.push('The amber RETURNS heading is not readable inside the Safe Frame')
  if(!before.returnText.some(label=>label.kind==='value'&&label.opacity>0&&label.fontPixels>=12))misses.push('The recorded return value has no readable glyphs')
  if(!before.structuralLabels.some(label=>label.kind==='return'&&label.visible&&inside(label.bounds)))misses.push('The recorded return caption is outside the Safe Frame')
 }
 if(state.id==='array'||state.id==='array-operation'){
  const array=Object.values(before.scene.entities).find(node=>node.kind==='array'&&node.componentType==='int'&&node.length===5)
  if(!array||array.kind!=='array')misses.push('The actual five-cell integer array is missing')
  else for(const cell of array.cells)for(const kind of ['index','value'] as const){
   const label=before.arrayText.find(label=>label.entityId===array.id&&label.slotId===cell.slotId&&label.kind===kind)
   if(!label||label.opacity<=0||label.fontPixels<11||!label.bounds||label.bounds.width<=0||label.bounds.height<=0)misses.push(`Captured array ${cell.index} ${kind} has no readable glyphs`)
   if(kind==='value'&&label?.text!==cell.value.text)misses.push(`Array ${cell.index} label differs from its captured value`)
  }
 }
 if(state.id==='io')for(const io of before.scene.io){
  const label=before.ioText.find(label=>label.channel===io.id),preview=ioPortPreview(io)
  const glyph=io.id==='stderr'?'⚠':io.id==='stdout'?'→':'←'
  const row=`${glyph} ${preview.available?preview.displayText||'""':'—'}`
  const exactText=`${io.lines}\n${fitWorldText(row,io.anchor.size[0]-.24,.32,500,0,Infinity,'end')}`
  if(!label||label.text!==exactText||label.opacity<=0||label.fontPixels<11||!label.bounds||label.bounds.width<=0||label.bounds.height<=0)misses.push(`I/O channel ${io.id} has no readable exact count and bounded preview`)
 }
 if(state.id==='runtime-hero'){
  const safe=before.shell.safeFrame
  for(const body of before.world.entities.filter(body=>body.live||body.region==='heap'&&!body.structural)){
   const bounds=body.bounds
   if(!bounds||bounds.x<safe.x-1e-5||bounds.y<safe.y-1e-5||bounds.x+bounds.width>safe.x+safe.width+1e-5||bounds.y+bounds.height>safe.y+safe.height+1e-5)misses.push(`Hero body ${body.id} lies outside Safe Frame`)
  }
  if(before.viewport.width<1024)for(const id of before.scene.liveStack){
   const title=before.runtimeHeadings.find(label=>label.entityId===id&&label.kind==='title')
   if(!title||title.opacity<=0||title.planePixels<11)misses.push(`Narrow Hero live title ${id} is not readable`)
  }
  const labels=before.structuralLabels
  const frames=before.world.entities.filter(body=>before.scene.entities[body.id]?.kind==='frame').flatMap(body=>body.bounds?[body.bounds]:[])
  for(const id of ['STACK','HEAP']){
   const label=labels.find(label=>label.id===id),bounds=label?.bounds,safe=before.shell.safeFrame
   if(!label?.visible||!bounds){misses.push(`Hero ${id} heading is not actually visible`);continue}
   if(label.minimumFontPixels<12)misses.push(`Hero ${id} heading is below 12 CSS px`)
   const capHeight=label.minimumFontPixels*.75
   if(Math.abs(capHeight-design.typography.world.heading.viewportCapRatio*before.viewport.height)>.004*before.viewport.height)misses.push(`Hero ${id} heading cap height ${capHeight} misses the reference range`)
   if(bounds.x<safe.x-1e-5||bounds.y<safe.y-1e-5||bounds.x+bounds.width>safe.x+safe.width+1e-5||bounds.y+bounds.height>safe.y+safe.height+1e-5)misses.push(`Hero ${id} heading lies outside Safe Frame`)
   const top=id==='STACK'?Math.min(...frames.map(frame=>frame.y)):before.world.heap?.y
   if(top!==undefined&&bounds.y+bounds.height>top)misses.push(`Hero ${id} heading is not above its actual represented bodies`)
  }
 }
 if(state.id==='exception'){
  const panel=before.world.exception?.bounds,frame=before.world.exception?.throwFrame
  if(!panel?.visible)misses.push('Forensic exception panel is not visible')
  if(panel&&frame&&panel.x<frame.x+frame.width&&panel.x+panel.width>frame.x&&panel.y<frame.y+frame.height&&panel.y+panel.height>frame.y)misses.push('Forensic exception panel overlaps its actual throwing frame projection')
  const occluders=await page.evaluate(()=>['.shell-header','.ide-editor-panel','.world-timeline','.shell-dock-drawer','.shell-dock-strip','.inspector','.debug-toolbar'].flatMap(selector=>{const node=document.querySelector(selector);if(!node||getComputedStyle(node).visibility==='hidden')return[];const rect=node.getBoundingClientRect();return[{selector,x:rect.x,y:rect.y,width:rect.width,height:rect.height}]}))
  for(const target of [{label:'panel',rect:panel},{label:'throwing frame',rect:frame}]){
   if(!target.rect){misses.push(`Forensic ${target.label} projection missing`);continue}
   const rect=target.rect,safe=before.shell.safeFrame
   if(rect.x<safe.x-2||rect.y<safe.y-2||rect.x+rect.width>safe.x+safe.width+2||rect.y+rect.height>safe.y+safe.height+2)misses.push(`Forensic ${target.label} lies outside Safe Frame`)
   for(const surface of occluders)if(rect.x<surface.x+surface.width&&rect.x+rect.width>surface.x&&rect.y<surface.y+surface.height&&rect.y+rect.height>surface.y)misses.push(`Forensic ${target.label} is covered by ${surface.selector}`)
  }
 }
 if(state.id==='focus'||state.id==='object-inspection'){
  const target=before.world.entities.find(body=>body.id===before.selection?.id)?.face
  if(!target)misses.push('Focus front face missing')
  else{
   if(target.height<.38*before.viewport.height||target.height>.52*before.viewport.height)misses.push(`Focus height: ${target.height/before.viewport.height} H, expected .38–.52 H`)
   const w=target.width/before.viewport.width,h=target.height/before.viewport.height
   if(w<.25-1e-9&&Math.abs(h-.52)>1e-6||w>.35+1e-9&&Math.abs(h-.38)>1e-6)misses.push(`Focus width: ${w} W is not the closest height-constrained width`)
   const inspector=before.shell.inspector
   if(inspector&&target.x<inspector.x+inspector.width&&target.x+target.width>inspector.x&&target.y<inspector.y+inspector.height&&target.y+target.height>inspector.y)misses.push('Focus face is covered by the actual Inspector rectangle')
  }
  const delta=before.pose.position.map((value,index)=>value-before.pose.target[index]),yaw=Math.abs(Math.atan2(delta[0],delta[2])*180/Math.PI),pitch=-Math.atan2(delta[1],Math.hypot(delta[0],delta[2]))*180/Math.PI
  if(yaw<18||yaw>24)misses.push(`Focus yaw: ${yaw} degrees, expected 18–24`)
  if(pitch< -11||pitch> -5)misses.push(`Focus pitch: ${pitch} degrees, expected −11 to −5`)
 }
 if(state.id==='recursion'){
  const frames=before.scene.liveStack.slice(-design.camera.recursion.context),safe=before.shell.commandFrame
  if(frames.length!==8)misses.push('Recursive Follow requires all eight recorded live frames in Series')
  const centres:{x:number;y:number}[]=[]
  for(const id of frames){
   const body=before.world.entities.find(body=>body.id===id),bounds=body?.bounds,face=body?.face
   if(!bounds||!face){misses.push(`Recursive frame ${id} has no actual projection`);continue}
   if(bounds.x<safe.x-1e-5||bounds.y<safe.y-1e-5||bounds.x+bounds.width>safe.x+safe.width+1e-5||bounds.y+bounds.height>safe.y+safe.height+1e-5)misses.push(`Recursive frame ${id} lies outside Safe Frame`)
   centres.push({x:face.x+face.width/2,y:face.y+face.height/2})
  }
  const steps=centres.slice(1).map((point,index)=>({x:point.x-centres[index].x,y:point.y-centres[index].y}))
  if(!steps.every(step=>step.x>=0)&&!steps.every(step=>step.x<=0)||steps.some(step=>step.y<=0))misses.push('Recursive frame centres do not progress monotonically')
  const delta=before.pose.position.map((value,index)=>value-before.pose.target[index]),yaw=Math.atan2(delta[0],delta[2])*180/Math.PI,pitch=-Math.atan2(delta[1],Math.hypot(delta[0],delta[2]))*180/Math.PI
  const preferred=design.camera.recursion
  if(Math.abs(yaw-preferred.yaw)>4||Math.abs(pitch-preferred.pitch)>3)misses.push(`Recursive Follow angles: ${yaw}, ${pitch}; expected ${preferred.yaw}°/${preferred.pitch}° within specified tolerances`)
 }
 const report={runId:process.env.VJ_REFERENCE_RUN_ID??null,id,state:state.id,viewport:viewportLabel,capture:`docs/checkpoints/reference-exact/captures/${id}.png`,sha256:createHash('sha256').update(png).digest('hex'),twin:state.twin,...composed.comparison,sessionId,realJvmExecuted:true,rawEventCount:session.rawEvents.length,build:session.build,sourceManifest:session.sourceManifest,measurements:before,misses}
 const reports=resolve('.ggjavaez/qa/reference-exact/captures');await mkdir(reports,{recursive:true});await writeFile(resolve(reports,`${id}.json`),JSON.stringify(report,null,2)+'\n')
 expect(misses,`Reference measurements for ${id}; capture/comparison/diff saved`).toEqual([])
}
