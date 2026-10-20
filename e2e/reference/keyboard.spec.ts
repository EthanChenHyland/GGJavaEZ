import {expect,test,type Page} from '@playwright/test'
import {browserErrors,ready} from './harness'
/** Read the real event after dispatch; this observer never prevents a key or
 * writes application state. Window capture still sees consumed global chords. */
async function pressObserved(page:Page,code:string,chord:string){
 const pending=page.evaluate(code=>new Promise<{code:string;prevented:boolean}>(resolve=>{
  const observe=(event:KeyboardEvent)=>{
   if(event.code!==code)return
   window.removeEventListener('keydown',observe,true)
   setTimeout(()=>resolve({code:event.code,prevented:event.defaultPrevented}),0)
  };window.addEventListener('keydown',observe,true)
 }),code)
 await page.keyboard.press(chord);return pending
}
async function facts(page:Page){return page.evaluate(()=>({cursor:window.__ggjavaezQA!.cursor(),selection:window.__ggjavaezQA!.selection(),focus:window.__ggjavaezQA!.focusTarget(),pose:window.__ggjavaezQA!.cameraPose()}))}
test('global keyboard consumes disabled chords, preserves unbound/input keys and routes World Home once',async({page})=>{
 const errors=browserErrors(page),executions:string[]=[];page.on('request',request=>{if(request.method()==='POST'&&/\/execution$/.test(new URL(request.url()).pathname))executions.push(request.url())})
 await page.goto('/examples?qa=1');await page.getByRole('slider',{name:'Recorded execution position'}).focus();await page.keyboard.press('End');await ready(page)
 const world=page.getByRole('application',{name:'Three-dimensional Java runtime world'});await world.focus();await page.keyboard.press('ArrowLeft');await ready(page)
 await expect(page.getByRole('button',{name:'Run',exact:true})).toHaveAttribute('aria-disabled','true');await expect(page.getByRole('button',{name:'Focus',exact:true})).toHaveAttribute('aria-disabled','true')
 const before=await facts(page)
 expect(await pressObserved(page,'KeyR','Alt+Shift+r')).toEqual({code:'KeyR',prevented:true})
 expect(await pressObserved(page,'KeyF','Alt+Shift+f')).toEqual({code:'KeyF',prevented:true});expect(await facts(page)).toEqual(before);expect(executions).toEqual([])
 expect(await pressObserved(page,'KeyZ','Alt+Shift+z')).toEqual({code:'KeyZ',prevented:false});expect(await facts(page)).toEqual(before)
 expect(await pressObserved(page,'F1','F1')).toEqual({code:'F1',prevented:true})
 const palette=page.getByRole('dialog',{name:'Command Palette',exact:true}),query=palette.getByRole('combobox',{name:'Search commands',exact:true});await expect(query).toBeFocused()
 expect(await pressObserved(page,'KeyH','h')).toEqual({code:'KeyH',prevented:false});await expect(query).toHaveValue('h');expect(await facts(page)).toEqual(before)
 await page.keyboard.press('Escape');await expect(palette).toHaveCount(0);await world.focus();await page.keyboard.press('ArrowLeft');await ready(page)
 const orbited=await facts(page);expect(orbited.pose).not.toEqual(before.pose)
 const home=page.getByRole('button',{name:'Home',exact:true});await expect(home).toHaveAttribute('aria-pressed','false')
 const observation=await home.evaluateHandle(button=>{
  let entered=false;const observe=new MutationObserver(()=>{entered||=button.getAttribute('aria-pressed')==='true'});observe.observe(button,{attributes:true,attributeFilter:['aria-pressed']})
  return{entered:()=>entered,disconnect:()=>observe.disconnect()}
 })
 try{expect(await pressObserved(page,'KeyH','h')).toEqual({code:'KeyH',prevented:true});await ready(page);expect(await observation.evaluate(value=>value.entered())).toBe(true)}finally{await observation.evaluate(value=>value.disconnect());await observation.dispose()}
 await expect(page.getByRole('button',{name:'Explore',exact:true})).toHaveAttribute('aria-pressed','true')
 const after=await facts(page);expect(after.pose).not.toEqual(orbited.pose);expect(after.cursor).toEqual(before.cursor);expect(after.selection).toEqual(before.selection);expect(after.focus).toEqual(before.focus);expect(executions).toEqual([]);expect(errors).toEqual([])
})
