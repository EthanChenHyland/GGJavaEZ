import {expect,it,vi} from 'vitest'
import type {WebGLRenderer} from 'three'
import {registerAuxiliaryPass,renderAuxiliaryPasses} from './auxiliaryPasses'

it('runs registered passes once in order for their actual renderer only',()=>{
 const first={}as WebGLRenderer,second={}as WebGLRenderer,order:string[]=[]
 const removeA=registerAuxiliaryPass(first,'floor',()=>order.push('reflection'))
 const removeB=registerAuxiliaryPass(first,'contact',()=>order.push('contact'))
 const removeC=registerAuxiliaryPass(second,'floor',()=>order.push('other renderer'))
 renderAuxiliaryPasses(first);expect(order).toEqual(['reflection','contact'])
 removeA();removeB();renderAuxiliaryPasses(first);expect(order).toHaveLength(2)
 renderAuxiliaryPasses(second);expect(order.at(-1)).toBe('other renderer');removeC()
})
it('rejects duplicate owners and stale cleanup cannot remove a replacement pass',()=>{
 const renderer={}as WebGLRenderer,first=vi.fn(),replacement=vi.fn()
 const remove=registerAuxiliaryPass(renderer,'floor',first)
 expect(()=>registerAuxiliaryPass(renderer,'floor',replacement)).toThrow('Duplicate')
 remove();const removeReplacement=registerAuxiliaryPass(renderer,'floor',replacement);remove()
 renderAuxiliaryPasses(renderer);expect(first).not.toHaveBeenCalled();expect(replacement).toHaveBeenCalledOnce();removeReplacement()
})
it('propagates pass failures to the render owner and cleanup remains usable',()=>{
 const renderer={}as WebGLRenderer,remove=registerAuxiliaryPass(renderer,'floor',()=>{throw new Error('Actual pass failure')})
 expect(()=>renderAuxiliaryPasses(renderer)).toThrow('Actual pass failure');remove()
 expect(()=>renderAuxiliaryPasses(renderer)).not.toThrow()
})
