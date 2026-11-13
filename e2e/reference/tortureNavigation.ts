import type { Page } from '@playwright/test'
import { ready, selectEntity } from './harness'
import { clickCluster } from './clusterInteractions'

const inspector = (page: Page) => page.getByRole('complementary', { name: 'Selection inspector', exact: true })

export async function clearTortureSelection(page:Page) {
  await page.locator('.world-canvas').focus()
  await page.keyboard.press('Escape')
  await ready(page)
}
async function selectClusterMember(page: Page, id: string, memberIndex: number) {
  const members=inspector(page).getByRole('list',{name:'Cluster members',exact:true})
  const member=members.getByRole('button').and(members.locator(`button[title=${JSON.stringify(id)}]`))
  if(!await member.count()){
    await members.hover()
    await page.mouse.wheel(0,memberIndex*52)
    await ready(page)
  }
  await member.click()
  await ready(page)
}
export async function pickTortureEntity(page:Page,id:string) {
  const canvas=page.locator('.world-canvas')
  const catalogue=page.getByRole('listbox',{name:'Runtime entities',exact:true})
  for(let attempt=0;attempt<20;attempt++){
    await canvas.focus()
    await page.keyboard.press('Escape')
    const route = await page.evaluate(target => {
      const world = window.__ggjavaezWorld!
      const options = document.querySelectorAll('[aria-label="Runtime entities"] [role="option"]')
      for (const option of options) {
        const optionId = decodeURIComponent(option.id.slice('world-entity-'.length))
        if (optionId === target) return { id: optionId, memberIndex: -1 }
      }
      for (const option of options) {
        const optionId = decodeURIComponent(option.id.slice('world-entity-'.length))
        const cluster = world.plan().clusters.find(item => item.id === optionId)
        const memberIndex = cluster?.memberIds.indexOf(target) ?? -1
        if (memberIndex >= 0) return { id: optionId, memberIndex }
      }
      return null
    }, id)
    if (route) {
      await selectEntity(page, route.id)
      if (route.memberIndex >= 0) await selectClusterMember(page, id, route.memberIndex)
      return
    }
    const cluster=await page.evaluate(target=>{
      const world=window.__ggjavaezWorld!
      const clusters=world.plan().clusters.filter(item=>item.pickable&&item.memberIds.includes(target))
      return clusters.length>0&&world.worldProjection().entities.some(body=>body.bounds?.visible&&clusters.some(item=>item.id===body.id))
    },id)
    if(cluster){
      const picked=await clickCluster(page,false,undefined,false,id)
      await ready(page)
      await selectClusterMember(page,id,picked.memberIds.indexOf(id))
      return
    }
    await page.keyboard.press('Tab')
    // The World renders a window of its ordered catalog. Advance only while
    // there are more options to expose; check the actual selection each time.
    for (let step = 0; step < 64; step++) {
      const snapshot = await catalogue.evaluate((node, target) => {
        if (node !== document.activeElement) return null
        const world = window.__ggjavaezWorld!, selection = world.selection()
        const cluster = selection?.kind === 'cluster' ? world.plan().clusters.find(item => item.id === selection.id) : undefined
        const current = node.querySelector('[aria-selected="true"]')
        return { selected: selection?.id, memberIndex: cluster?.memberIds.indexOf(target) ?? -1,
          hasNext: !!current && Number(current.getAttribute('aria-posinset')) < Number(current.getAttribute('aria-setsize')) }
      }, id)
      if (!snapshot) break
      if (snapshot.selected === id) { await ready(page); return }
      if (snapshot.memberIndex >= 0) { await selectClusterMember(page, id, snapshot.memberIndex); return }
      if (!snapshot.hasNext) break
      await page.keyboard.press('ArrowDown')
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    }
    await canvas.focus()
    await page.keyboard.press('-')
    await ready(page)
  }
  throw new Error(`Captured target ${id} could not be reached through the native World controls`)
}
