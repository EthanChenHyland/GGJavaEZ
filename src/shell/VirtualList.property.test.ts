import { expect, it } from 'vitest'
import fc from 'fast-check'
import { virtualPageRows, virtualRange } from './virtualRange'
// Feature: reference-exact-rebuild, Property 59: Virtualized lists
it('every logical row is reachable with bounded physical extents and mounted rows (100 runs)',()=>{
  fc.assert(fc.property(fc.integer({min:1,max:2147483647}),fc.nat(2147483646),fc.integer({min:24,max:100}),fc.integer({min:52,max:650}),
    (count,candidate,rowHeight,viewport)=>{
      const index=candidate%count,pageStart=Math.floor(index/virtualPageRows)*virtualPageRows;
      const range=virtualRange(count,rowHeight,index,(index-pageStart)*rowHeight,viewport);
      expect(range.pageStart).toBe(pageStart);
      expect(range.start).toBeLessThanOrEqual(index);
      expect(range.start+range.count).toBeGreaterThan(index);
      expect(range.start+range.count).toBeLessThanOrEqual(count);
      expect(range.count).toBeLessThanOrEqual(Math.ceil(viewport/rowHeight)+4);
      expect(range.height).toBeLessThanOrEqual(virtualPageRows*rowHeight);
    }),{numRuns:100});
});
it('empty and exhausted pages mount no invented rows',()=>{
  expect(virtualRange(0,52,0,0,260)).toMatchObject({count:0,pageCount:0,height:0});
  expect(virtualRange(10,52,0,10000,260)).toMatchObject({count:0,start:10});
});
