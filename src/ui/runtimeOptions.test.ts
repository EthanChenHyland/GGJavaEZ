import { describe, expect, it } from 'vitest'
import { runtimeOptionBudget, runtimeOptions } from './runtimeOptions'
import type { SceneModel } from '../contracts/world'
const scene: SceneModel = { detailLevel:'macro', activeEventId:null, objects:[], references:[], frames:Array.from({length:4000}, (_, index) => ({
  kind:'frame', id:`frame:${index}`, label:`operation${index}()`, depth:0, active:false, slots:[],
  anchor:{entityId:`frame:${index}`, region:'stack',position:[index,0,0],size:[5,3,1],bodyPort:[index,0,0],ports:{}},
})) }
describe('bounded searchable runtime identity list', () => {
  it('bounds DOM choices while retaining old selected identity and recent calls', () => {
    const options = runtimeOptions(scene,{kind:'frame',id:'frame:2000'})
    expect(options.length).toBeLessThanOrEqual(runtimeOptionBudget)
    expect(options[0].id).toBe('frame:2000')
    expect(options.at(-1)?.id).toBe('frame:3999')
  })
  it('finds an actual identity outside the recent window without changing its geometry', () => {
    const before = scene.frames[2345].anchor
    expect(runtimeOptions(scene,null,'operation2345')).toEqual([{id:'frame:2345',kind:'frame',label:'operation2345() · invocation 2346'}])
    expect(scene.frames[2345].anchor).toBe(before)
    expect(runtimeOptions(scene,null,'not-recorded')).toEqual([])
  })
})
