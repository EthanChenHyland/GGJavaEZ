import {openDock} from './dockActions'
import { expect,test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { browserErrors,currentSession } from './harness'
import type {} from './fixtures/input'

test('isolated partial/no-event input presentation focuses a new wait and preserves manual focus on refresh',async({page})=>{
  const errors=browserErrors(page);await page.goto('/e2e/reference/fixtures/input.html')
  const probe=page.getByRole('button',{name:'Manual focus probe'}),input=page.getByLabel('Console input',{exact:true})
  await probe.focus()
  const elapsed=await page.evaluate(async()=>{
    const start=performance.now();window.inputFixture.set('WAITING_FOR_INPUT')
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
    return performance.now()-start
  });expect(elapsed).toBeLessThanOrEqual(200);await expect(input).toBeFocused()
  await expect(page.locator('.console-input-status')).toContainText('Program is waiting for input')
  await probe.focus();await page.evaluate(()=>{window.inputFixture.set('WAITING_FOR_INPUT');window.inputFixture.set('WAITING_FOR_INPUT')})
  await expect(probe).toBeFocused()
  const clearElapsed=await page.evaluate(async()=>{
    const start=performance.now();window.inputFixture.set('RUNNING')
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
    return performance.now()-start
  });expect(clearElapsed).toBeLessThanOrEqual(200)
  await expect(page.locator('.console-input-status')).not.toContainText('Program is waiting for input')
  await expect(page.locator('.console-input-status')).toContainText('Input wait status unknown');await expect(input).toBeEnabled()
  await expect(probe).toBeFocused();expect(errors).toEqual([])
  await writeFile('.ggjavaez/qa/reference-exact/console-input-focus-measurements.json',JSON.stringify({fixture:'isolated production ConsoleInput with stopped recording and no events',realJvm:false,waitFocusMs:elapsed,waitClearMs:clearElapsed,manualFocusPreserved:true},null,2)+'\n')
})

for(const viewport of [{width:1440,height:900},{width:760,height:900}])test(`real JVM empty input, delayed acknowledgements and ended-process guard ${viewport.width}x${viewport.height}`,async({page,request})=>{
  test.setTimeout(60000);await page.setViewportSize(viewport);const errors=browserErrors(page)
  const response=await request.post('/api/projects/import',{data:{name:`Input acknowledgements ${Date.now()}`,files:[{path:'Main.java',content:
    'import java.util.Scanner; public class Main { public static void main(String[] args) { Scanner input = new Scanner(System.in); System.out.println("first"); String a = input.nextLine(); System.out.println("first length " + a.length()); String b = input.nextLine(); System.out.println("second [" + b + "]"); } }\n'}]}})
  expect(response.ok()).toBe(true);const {id}=await response.json()
  await page.addInitScript(id=>localStorage.setItem('ggjavaez:project',id),id);await page.goto('/?qa=1')
  await page.getByRole('button',{name:'Run',exact:true}).click()
  await expect.poll(async()=>{const s=await currentSession(request);return s&&s.projectId===id?s.phase:null}).toBe('WAITING_FOR_INPUT')
  const input=page.getByLabel('Console input',{exact:true}),send=page.getByRole('button',{name:'Send ↵',exact:true})
  await expect(input).toBeFocused();await openDock(page,'Console')
  let acknowledgeFirst!:()=>void,writeSecond!:()=>void
  const firstAck=new Promise<void>(resolve=>{acknowledgeFirst=resolve}),secondWrite=new Promise<void>(resolve=>{writeSecond=resolve})
  const writes:string[]=[]
  await page.route('**/api/execution/*/input',async route=>{
    writes.push(route.request().postDataJSON().text)
    if(writes.length===2)await secondWrite
    const real=await route.fetch()
    if(writes.length===1)await firstAck
    await route.fulfill({response:real})
  })
  await input.press('Enter');await expect.poll(()=>writes.length).toBe(1)
  await expect(send).toBeDisabled();await input.fill('  & <exact> 😀  ');await input.press('Enter')
  await expect(page.locator('.console-input-status')).toContainText('Submitting input')
  expect(writes).toEqual(['\n']);acknowledgeFirst()
  await expect(send).toBeEnabled();await expect(input).toHaveValue('  & <exact> 😀  ')
  await input.press('Enter');await expect.poll(()=>writes.length).toBe(2)
  await input.fill('keep after exit');writeSecond()
  await expect.poll(async()=>{const s=await currentSession(request);return s&&s.projectId===id?s.phase:null}).toBe('COMPLETED')
  await expect(page.locator('.console-input-status')).toContainText('Input submission acknowledged')
  await expect(input).toHaveValue('keep after exit');await expect(input).toBeDisabled()
  expect(writes).toEqual(['\n','  & <exact> 😀  \n'])
  const session=await currentSession(request);expect(session?.stdout).toBe('first\nfirst length 0\nsecond [  & <exact> 😀  ]\n')
  await openDock(page,'Console')
  const console=page.getByLabel('Program console',{exact:true}),submitted=console.getByRole('list',{name:'Submitted input rows'})
  await expect(submitted.getByRole('listitem')).toHaveCount(2)
  await console.getByRole('button',{name:'Open Submitted input row 1',exact:true}).click()
  expect(await console.getByRole('region',{name:'Exact Submitted input row 1'}).locator('pre').textContent()).toBe('\n')
  await page.locator('.ide-console-input').dispatchEvent('submit')
  await expect(page.locator('.console-input-status')).toContainText('Program is not accepting input')
  await expect(input).toHaveValue('keep after exit');expect(writes).toHaveLength(2)
  await expect(submitted.getByRole('listitem')).toHaveCount(2)
  await submitted.scrollIntoViewIfNeeded();await expect(submitted.getByRole('listitem').first()).toBeVisible()
  await page.screenshot({path:`.ggjavaez/qa/reference-exact/console-submissions-${viewport.width}x${viewport.height}.png`})
  expect(errors).toEqual([])
})
