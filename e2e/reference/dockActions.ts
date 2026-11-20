import {expect,type Page} from '@playwright/test'
export type DockName='Console'|'Problems'|'Debug drawer'|'Errors'
/** Former tabs explicitly opened and pinned a tool. The new toggles close an
 * open drawer, so close/reopen when necessary to preserve that user intent. */
export async function openDock(page:Page,name:DockName){
 const button=page.getByRole('navigation',{name:'Dock',exact:true}).getByRole('button',{name,exact:true})
 if(await button.getAttribute('aria-expanded')==='true')await button.click()
 await button.click();await expect(button).toHaveAttribute('aria-expanded','true')
}
