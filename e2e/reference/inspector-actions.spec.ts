import {expect,test,type Page} from '@playwright/test'
import {browserErrors,home,ready,runFixture,seekCursor,selectEntity,stopOwnedSession} from './harness'
const card=(page:Page)=>page.getByRole('complementary',{name:'Selection inspector'})
async function command(page:Page,title:string){
 await page.locator('.world-canvas').focus();await page.keyboard.press('F1');await page.getByRole('combobox',{name:'Search commands'}).fill(title)
 await page.getByRole('option').filter({has:page.getByText(title,{exact:true})}).click();await ready(page)
}
async function clipboard(page:Page){
 // Verify the native app action's exact API argument, never the system clipboard.
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async(value:string)=>{const target=window as unknown as {inspectionCopies?:string[]};(target.inspectionCopies??=[]).push(value)}},configurable:true}))
}
async function facts(page:Page){return page.evaluate(()=>{const qa=window.__ggjavaezQA!,scene=window.__ggjavaezWorld!.scene();return{cursor:qa.cursor(),selection:qa.selection(),focus:qa.focusTarget(),pose:qa.cameraPose(),app:qa.appState(),anchors:Object.fromEntries(Object.entries(scene.entities).map(([id,node])=>[id,node.anchor]))}})}
async function revealVisible(page:Page,line:number){
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.target)).toEqual({mark:'reveal',line})
 await expect.poll(()=>page.evaluate(line=>{const source=window.__ggjavaezQA!.source();return !!source&&source.first<=line&&line<=source.last},line)).toBe(true)
 await expect(page.locator('.gg-source-reveal-line')).toHaveCount(1);await expect(page.locator('.monaco-editor .executing-line')).toHaveCount(0)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.source()?.readOnly)).toBe(true)
}
test.afterEach(async({request})=>stopOwnedSession(request))
for(const viewport of[{width:1440,height:900},{width:760,height:900}])test(`Inspector actions reveal captured source and share contextual Focus, Copy and palette behavior ${viewport.width}x${viewport.height}`,async({page})=>{
 const errors=browserErrors(page);await clipboard(page);await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/examples?qa=1')
 await seekCursor(page,18);await home(page);await selectEntity(page,'object:person:17')
 await card(page).getByRole('button',{name:'Copy Value',exact:true}).click()
 expect(await page.evaluate(()=>(window as unknown as {inspectionCopies:string[]}).inspectionCopies)).toEqual(['Person #17'])
 await card(page).getByRole('button',{name:'Focus selection',exact:true}).click();await ready(page)
 await expect(card(page).getByRole('button',{name:'Return to World',exact:true})).toBeVisible()
 await expect(card(page).getByRole('button',{name:'Focus selection',exact:true})).toHaveCount(0)
 await card(page).getByRole('button',{name:'Return to World',exact:true}).click();await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.focusTarget())).toBeNull()
 const before=await facts(page)
 await card(page).getByRole('button',{name:'Reveal Source',exact:true}).click();await revealVisible(page,18)
 await expect(card(page)).toHaveCount(0);expect(await facts(page)).toEqual(before)
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/inspector-source-reveal-${viewport.width}.png`})
 // Reissue the registered command after a real manual source scroll. A fresh
 // explicit action must reveal again even at the same item and prefix.
 await page.locator('.monaco-editor').hover()
 // Native Chrome normalizes wheel packets to physical notches; observe each
 // actual scroll rather than assuming that a keyboard chord moves the view.
 for(let gesture=0;gesture<64&&(await page.evaluate(()=>window.__ggjavaezQA!.source()?.first??1))>1;gesture++){
  const beforeScroll=await page.evaluate(()=>window.__ggjavaezQA!.source()!.scrollTop)
  await page.mouse.wheel(0,-300)
  await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()!.scrollTop)).toBeLessThan(beforeScroll)
 }
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.first)).toBe(1)
 await command(page,'View: Reveal Source');await revealVisible(page,18);expect(await facts(page)).toEqual(before)
 await page.getByRole('button',{name:'Close recorded source preview',exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.target?.mark)).not.toBe('reveal')
 await command(page,'View: Copy Value')
 expect(await page.evaluate(()=>(window as unknown as {inspectionCopies:string[]}).inspectionCopies)).toEqual(['Person #17','Person #17'])
 await command(page,'View: Reveal Source');await revealVisible(page,18)
 await seekCursor(page,17)
 await expect(page.getByRole('button',{name:'Close recorded source preview',exact:true})).toHaveCount(0)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.source()?.target?.mark)).not.toBe('reveal')
 expect(errors).toEqual([])
})
test('missing-item actions expose registry reasons and keyboard or pointer activation leaves all state unchanged',async({page})=>{
 const errors=browserErrors(page);await clipboard(page);await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/examples?qa=1')
 await seekCursor(page,18);await home(page);await selectEntity(page,'object:person:17');await seekCursor(page,8)
 await expect(card(page)).toContainText('Not present at this point in time')
 const before=await facts(page),source=await page.evaluate(()=>window.__ggjavaezQA!.source()?.target)
 for(const name of['Focus selection','Reveal Source','Copy Value']){
  const button=card(page).getByRole('button',{name,exact:true});await expect(button).toHaveAttribute('aria-disabled','true');expect(await button.getAttribute('aria-description')).toBeTruthy()
  await button.focus();await page.keyboard.press('Enter')
  const bounds=(await button.boundingBox())!;await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2)
 }
 expect(await facts(page)).toEqual(before);expect(await page.evaluate(()=>window.__ggjavaezQA!.source()?.target)).toEqual(source)
 expect(await page.evaluate(()=>(window as unknown as {inspectionCopies?:string[]}).inspectionCopies??[])).toEqual([])
 await page.locator('.world-canvas').focus();await page.keyboard.press('F1');await page.getByRole('combobox',{name:'Search commands'}).fill('Reveal Source')
 const option=page.getByRole('option').filter({has:page.getByText('View: Reveal Source',{exact:true})})
 await expect(option).toHaveAttribute('aria-disabled','true');await expect(option).toContainText('Item is not present at this point in time')
 await page.keyboard.press('Enter');await expect(page.getByRole('dialog',{name:'Command Palette'})).toHaveCount(1)
 await page.keyboard.press('Escape');expect(await facts(page)).toEqual(before);expect(errors).toEqual([])
})
async function draftSnapshot(page:Page){return page.evaluate(async()=>{
 const path='/src/workspace/editorStore.ts',module=await import(path),state=module.editorStore.getState()
 return{active:state.active,tabs:state.tabs.map((tab:{path:string;draft:string;content:string})=>({path:tab.path,draft:tab.draft,content:tab.content})),mapped:state.mappedExecutingSource,sourceUnavailable:state.sourceUnavailable}
})}
async function displayedText(page:Page){return page.evaluate(async()=>{
 const path='/src/language/editorRuntime.ts',module=await import(path),runtime=module.getLoadedJavaEditorRuntime(),uri=window.__ggjavaezQA!.source()?.modelUri
 return runtime?.monaco.editor.getModels().find((model:{uri:{toString():string}})=>model.uri.toString()===uri)?.getValue()??null
})}
test('actual JVM Reveal Source preserves a changed editable draft and uses the recording file verbatim',async({page,request})=>{
 test.setTimeout(60000)
 const errors=browserErrors(page),session=await runFixture(page,request,'domain');await home(page)
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.readOnly)).toBe(false)
 const original=await draftSnapshot(page),marker='// unsaved source preview guard\n'
 await page.getByRole('textbox',{name:'Editor content',exact:true}).focus();await page.keyboard.press('ControlOrMeta+Home');await page.keyboard.insertText(marker)
 await expect.poll(async()=>(await draftSnapshot(page)).tabs.some((tab:{draft:string})=>tab.draft.startsWith(marker))).toBe(true)
 await home(page)
 const target=await page.evaluate(()=>Object.values(window.__ggjavaezWorld!.scene().entities).find(node=>node.kind==='object'&&node.ownership==='PROJECT'&&node.allocationSite)!)
 if(target.kind!=='object'||!target.allocationSite)throw new Error('Actual JVM supplied no recorded project-object source')
 await selectEntity(page,target.id);await ready(page)
 const before=await facts(page),draft=await draftSnapshot(page),models=await page.evaluate(()=>window.__ggjavaezQA!.editorModels().modelUris)
 const file=session.sourceManifest.sources.find(file=>file.fileId===target.allocationSite!.fileId)!
 expect(file).toBeDefined();expect(draft.tabs).not.toEqual(original.tabs)
 await card(page).getByRole('button',{name:'Reveal Source',exact:true}).click();await revealVisible(page,target.allocationSite.line)
 expect(await displayedText(page)).toBe(file.content);expect(await displayedText(page)).not.toContain(marker)
 expect(await draftSnapshot(page)).toEqual(draft);expect(await facts(page)).toEqual(before)
 const temporary=await page.evaluate(()=>({all:window.__ggjavaezQA!.editorModels().modelUris,preview:window.__ggjavaezQA!.source()!.modelUri}))
 expect(temporary.all).toEqual([...models,temporary.preview].sort());expect(models).not.toContain(temporary.preview)
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/inspector-source-proof-native.png'})
 await page.getByRole('button',{name:'Close recorded source preview',exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.readOnly)).toBe(false)
 expect(await displayedText(page)).toContain(marker);expect(await draftSnapshot(page)).toEqual(draft);expect(await facts(page)).toEqual(before)
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.editorModels().modelUris)).toEqual(models)
 for(let replay=0;replay<2;replay++){
  await command(page,'View: Reveal Source');await revealVisible(page,target.allocationSite.line)
  expect((await page.evaluate(()=>window.__ggjavaezQA!.editorModels().modelUris)).length).toBe(models.length+1)
  expect(await displayedText(page)).toBe(file.content);expect(await draftSnapshot(page)).toEqual(draft)
  await page.getByRole('button',{name:'Close recorded source preview',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.editorModels().modelUris)).toEqual(models)
 }
 expect(await facts(page)).toEqual(before);expect(errors).toEqual([])
})
