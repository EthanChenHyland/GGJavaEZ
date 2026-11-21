import type {ComponentProps} from 'react'
import {BufferGeometry,Color} from 'three'
import {afterEach,expect,it,vi} from 'vitest'
import {renderThreeLifetime as render,unmountThreeLifetimes} from '../testing/reactThreeLifetime'
import {SolidEdges} from './SolidBatch'

type Item=ComponentProps<typeof SolidEdges>['items'][number]
function item(overrides:Partial<Item>={}):Item{return{anchor:{entityId:'object/a',region:'heap',position:[1,2,3],size:[5.2,4.65,2.3],ports:{},bodyPort:[1,2,4.15]},pick:{kind:'object',id:'object/a'},pickable:true,role:'heap',opacity:1,tint:'#28135F',edge:'#9966ff',...overrides}}
function geometry(view:ReturnType<typeof render>):BufferGeometry{return(view.nodes().find(node=>node.type==='lineSegments')!.props?.geometry??view.nodes().find(node=>node.type==='primitive')!.props?.object) as BufferGeometry}
afterEach(()=>{unmountThreeLifetimes();vi.restoreAllMocks()})
it('retains the actual outline buffer through 100 equivalent camera/cut wrappers while material opacity updates',()=>{
 const view=render(<SolidEdges items={[item()]}/>),original=geometry(view),dispose=vi.spyOn(original,'dispose'),positions=original.getAttribute('position').array.slice(),colors=original.getAttribute('color').array.slice()
 for(let index=0;index<100;index++){
  const opacity=index%2?.25:1
  view.rerender(<SolidEdges items={[item({opacity})]}/>);expect(geometry(view)).toBe(original)
  expect(view.nodes().find(node=>node.type==='lineBasicMaterial')!.props?.opacity).toBe(opacity)
 }
 expect(original.getAttribute('position').array).toEqual(positions);expect(original.getAttribute('color').array).toEqual(colors);expect(dispose).not.toHaveBeenCalled()
 view.unmount();expect(dispose).toHaveBeenCalledTimes(1)
})
it('replaces and releases the buffer when position, dimensions, edge color or member topology changes',()=>{
 let shape=item();const view=render(<SolidEdges items={[shape]}/>);let current=geometry(view)
 const replace=(items:Item[])=>{const old=current,dispose=vi.spyOn(old,'dispose');view.rerender(<SolidEdges items={items}/>);current=geometry(view);expect(current).not.toBe(old);expect(dispose).toHaveBeenCalledTimes(1)}
 const before=current.getAttribute('position').array.slice();shape=item({anchor:{...shape.anchor,position:[4,2,3]}});replace([shape])
 const shifted=current.getAttribute('position').array;for(let index=0;index<shifted.length;index++)expect(shifted[index]-before[index]).toBeCloseTo(index%3===0?3:0,5)
 const oldExtent=Math.max(...Array.from(shifted).filter((_,index)=>index%3===0));shape={...shape,anchor:{...shape.anchor,size:[8,4.65,2.3]}};replace([shape]);expect(Math.max(...Array.from(current.getAttribute('position').array).filter((_,index)=>index%3===0))).toBeGreaterThan(oldExtent)
 shape={...shape,edge:'#ff0000'};replace([shape]);const red=new Color('#ff0000').multiplyScalar(1.03);expect([...current.getAttribute('color').array.slice(0,3)]).toEqual([expect.closeTo(red.r,5),0,0])
 const other=item({anchor:{...shape.anchor,entityId:'object/b',position:[-3,0,1]},edge:'#00ff00'}),oneCount=current.getAttribute('position').count
 replace([shape,other]);expect(current.getAttribute('position').count).toBe(oneCount*2)
 const ordered=current.getAttribute('position').array.slice();replace([other,shape]);expect(current.getAttribute('position').array).not.toEqual(ordered)
 replace([other]);expect(current.getAttribute('position').count).toBe(oneCount)
})
it('does not retain outline resources after their owning batch unmounts or across a new recording mount',()=>{
 const first=render(<SolidEdges items={[item()]}/>),old=geometry(first),dispose=vi.spyOn(old,'dispose');first.unmount();expect(dispose).toHaveBeenCalledTimes(1)
 const next=render(<SolidEdges items={[item()]}/>),fresh=geometry(next),freshDispose=vi.spyOn(fresh,'dispose');expect(fresh).not.toBe(old)
 next.unmount();expect(freshDispose).toHaveBeenCalledTimes(1);expect(dispose).toHaveBeenCalledTimes(1)
})
