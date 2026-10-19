import {expect,it} from 'vitest'
import {virtualPageRows,virtualRange} from './virtualRange'
it('caps summary rows including overscan even when an enormous viewport requests the whole page',()=>{
 for(const rowHeight of[32,52,76])for(const count of[0,1,20,200,1000000]){
  const range=virtualRange(count,rowHeight,0,0,1000000,2,20)
  expect(range.count).toBeLessThanOrEqual(20);expect(range.count).toBeLessThanOrEqual(count)
  expect(range.height).toBe(Math.min(virtualPageRows,count)*rowHeight)
 }
})
it('keeps first, arbitrary middle and last logical entries reachable under a fixed summary cap',()=>{
 const count=2147483647,rowHeight=52
 for(const index of[0,1,4095,4096,70112,count-1]){
  const pageStart=Math.floor(index/virtualPageRows)*virtualPageRows
  const range=virtualRange(count,rowHeight,index,(index-pageStart)*rowHeight,1000000,2,20)
  expect(range.start).toBeLessThanOrEqual(index);expect(range.start+range.count).toBeGreaterThan(index)
  expect(range.count).toBeLessThanOrEqual(20);expect(range.height).toBeLessThanOrEqual(virtualPageRows*rowHeight)
 }
})
