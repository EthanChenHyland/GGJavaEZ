import {expect,type Page} from '@playwright/test'
import type {IdeCommandId} from '../../src/ide/commands'
const projectMenu=(page:Page)=>page.getByRole('button',{name:'Project menu',exact:true})
function action(page:Page,id:string){return page.getByRole('menuitem').and(page.locator(`[data-menu-action=${JSON.stringify(id)}]`))}
export async function projectCommand(page:Page,id:IdeCommandId){await projectMenu(page).click();await action(page,id).click()}
/** Native actions against the production Header; no application state writes. */
export async function selectRecording(page:Page,id:string){
 const button=projectMenu(page);await expect(button).toBeVisible()
 if(await button.getAttribute('data-recording-id')!==id){await button.click();await action(page,'recording:'+id).click()}
 await expect(button).toHaveAttribute('data-recording-id',id)
}
export async function selectProject(page:Page,id:string){
 const button=projectMenu(page);await expect(button).toBeVisible()
 if(await button.getAttribute('data-project-id')!==id){await button.click();await action(page,'project:'+id).click()}
 await expect(button).toHaveAttribute('data-project-id',id);await expect(button).toHaveAttribute('aria-disabled','false')
}
