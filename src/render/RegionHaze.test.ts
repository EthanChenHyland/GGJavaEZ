import {expect,it,vi} from 'vitest'
import {LinearFilter} from 'three'
import {createHazeMask} from './RegionHaze'

it('keeps the owned soft mask transparent at every edge with a continuous radial falloff instead of a rectangular veil',()=>{
 const texture=createHazeMask(),{width,height,data}=texture.image
 if(!data)throw new Error('Haze mask has no owned alpha buffer')
 const alpha=(x:number,y:number)=>data[(y*width+x)*4+3]
 expect([width,height]).toEqual([64,64]);expect(texture.minFilter).toBe(LinearFilter);expect(texture.magFilter).toBe(LinearFilter)
 for(let index=0;index<width;index++)for(const value of [alpha(index,0),alpha(index,height-1),alpha(0,index),alpha(width-1,index)])expect(value).toBe(0)
 expect(alpha(31,31)).toBeGreaterThanOrEqual(250)
 for(let x=0;x<31;x++){expect(alpha(x,31)).toBeLessThanOrEqual(alpha(x+1,31));expect(alpha(x,31)).toBe(alpha(63-x,31))}
 const dispose=vi.fn();texture.addEventListener('dispose',dispose);texture.dispose();expect(dispose).toHaveBeenCalledOnce()
})
