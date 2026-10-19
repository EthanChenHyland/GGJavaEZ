import {expect,test} from '@playwright/test'
import {browserErrors} from './harness'
for(const viewport of [{width:1440,height:900},{width:760,height:900}]){
 test(`nested Shell surfaces trap only the top owner and restore surviving openers ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);const errors=browserErrors(page)
  await page.goto('/e2e/reference/fixtures/surfaces.html')
  const opener=page.getByRole('button',{name:'Open parent',exact:true});await opener.click()
  const parent=page.getByRole('dialog',{name:'Parent dialog',exact:true}),first=parent.getByLabel('First field')
  await expect(first).toBeFocused();await first.press('Shift+Tab');await expect(parent.getByRole('button',{name:'Close parent',exact:true})).toBeFocused()
  await page.keyboard.press('Tab');await expect(first).toBeFocused()
  await first.press('Tab');await expect(parent.getByRole('button',{name:'Open nested menu',exact:true})).toBeFocused()
  const nested=parent.getByRole('button',{name:'Open nested menu',exact:true});await nested.click()
  const menu=page.getByRole('menu',{name:'Nested actions'}),firstAction=menu.getByRole('menuitem',{name:'First action',exact:true}),lastAction=menu.getByRole('menuitem',{name:'Last action',exact:true}),blocked=menu.getByRole('menuitem',{name:'Blocked command',exact:true})
  await expect(firstAction).toBeFocused();await expect(blocked).toBeDisabled();await expect(blocked).toHaveAccessibleDescription('Unavailable in this captured state')
  await blocked.focus();await blocked.press('Enter');await expect(page.getByLabel('Chosen command')).toHaveText('');await firstAction.focus();
  await blocked.dispatchEvent('click');await expect(page.getByLabel('Chosen command')).toHaveText('')
  await firstAction.press('End');await expect(lastAction).toBeFocused();await lastAction.press('ArrowDown');await expect(firstAction).toBeFocused()
  const rect=await menu.boundingBox();expect(rect).not.toBeNull();expect(rect!.x).toBeGreaterThanOrEqual(8);expect(rect!.y).toBeGreaterThanOrEqual(8);expect(rect!.x+rect!.width).toBeLessThanOrEqual(viewport.width-8);expect(rect!.y+rect!.height).toBeLessThanOrEqual(viewport.height-8)
  await page.screenshot({path:`.ggjavaez/qa/reference-exact/shell-menu-${viewport.width}x${viewport.height}.png`})
  await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);await expect(parent).toBeVisible();await expect(nested).toBeFocused()
  await nested.click();await firstAction.press('Enter');await expect(page.getByLabel('Chosen command')).toHaveText('first;');await expect(nested).toBeFocused()
  await nested.click();await first.click();await expect(menu).toHaveCount(0);await expect(first).toBeFocused()
  await nested.click();await page.keyboard.press('Tab');await expect(menu).toHaveCount(0);await expect(nested).toBeFocused()
  const childOpener=parent.getByRole('button',{name:'Open child dialog',exact:true});await childOpener.click()
  const child=page.getByRole('dialog',{name:'Child dialog',exact:true});await expect(child.getByLabel('Child field')).toBeFocused()
  await first.evaluate(element=>(element as HTMLElement).focus());await expect(child.getByLabel('Child field')).toBeFocused()
  await page.keyboard.press('Escape');await expect(child).toHaveCount(0);await expect(childOpener).toBeFocused();await expect(parent).toBeVisible()
  await page.screenshot({path:`.ggjavaez/qa/reference-exact/shell-dialog-${viewport.width}x${viewport.height}.png`})
  await page.keyboard.press('Escape');await expect(parent).toHaveCount(0);await expect(opener).toBeFocused();expect(errors).toEqual([])
 })
 test(`Shell Launch validates exact arrays and retains a saved unlisted main ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);const errors=browserErrors(page);await page.goto('/e2e/reference/fixtures/surfaces.html')
  const opener=page.getByRole('button',{name:'Open launch',exact:true});await opener.click()
  const dialog=page.getByRole('dialog',{name:'Launch configuration',exact:true}),main=dialog.getByLabel('Main class',{exact:true})
  await expect(main).toBeFocused();await expect(main).toHaveValue('saved.Unlisted');await expect(main).toContainText('not listed by the latest build')
  await main.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'Save configuration'})).toBeFocused();await page.keyboard.press('Tab');await expect(main).toBeFocused()
  await dialog.getByLabel('Program arguments').fill('[1]');await dialog.getByRole('button',{name:'Save configuration'}).click()
  await expect(dialog.getByRole('alert')).toHaveText('Arguments must be JSON arrays of strings.');await expect(page.getByLabel('Saved launch')).toHaveText('')
  const args=['',' two words ','"quoted"','<&>','🟣'];await dialog.getByLabel('Program arguments').fill(JSON.stringify(args));await expect(dialog.getByRole('alert')).toHaveCount(0)
  await dialog.getByLabel('Working directory').fill(' folder with spaces ');await dialog.getByLabel('JVM arguments').fill('["-Xmx256m","-Dkey=two words"]')
  await dialog.getByRole('button',{name:'Save configuration'}).click();await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused()
  expect(JSON.parse(await page.getByLabel('Saved launch').innerText())).toEqual({mainClass:'saved.Unlisted',workingDirectory:' folder with spaces ',programArgs:args,jvmArgs:['-Xmx256m','-Dkey=two words']});expect(errors).toEqual([])
 })
}
test('Shell surface subtree removal and StrictMode remount leave no stale focus owner',async({page})=>{
 const errors=browserErrors(page);await page.goto('/e2e/reference/fixtures/surfaces.html')
 for(let index=0;index<3;index++){
  await page.getByRole('button',{name:'Open parent',exact:true}).click();await page.getByRole('button',{name:'Open child dialog',exact:true}).click()
  await page.getByRole('button',{name:'Remove whole subtree',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0)
  // The child opener disappeared with the parent. Fallback remains editable.
  await expect(page.getByLabel('Editor fallback')).toBeFocused()
 }
 expect(errors).toEqual([])
})
