import{expect,it}from'vitest'
import{unavailableFlowSnapshot,reasons}from'./unavailableFlowSnapshot'
it('preserves complete read-only Array values, iteration, descriptors and JSON without limiting evidence',()=>{
 const ids=Array.from({length:25000},(_,i)=>`opaque/flow/${i}`),codes=ids.map((_,i)=>String(i%4)).join('')
 const expected=ids.map((id,i)=>({id,reason:reasons[i%4]})),actual=unavailableFlowSnapshot(ids,codes)
 expect(Array.isArray(actual)).toBe(true);expect(actual.length).toBe(25000)
 expect(actual[0]).toEqual(expected[0]);expect(actual.at(-1)).toEqual(expected.at(-1));expect(actual[25000]).toBeUndefined()
 expect([...actual]).toEqual(expected);expect(actual.map(item=>item.id)).toEqual(expected.map(item=>item.id))
 expect(actual.find(item=>item.id==='opaque/flow/16789')).toEqual(expected[16789])
 expect(Object.keys(actual)).toEqual(Object.keys(expected));expect(JSON.stringify(actual)).toBe(JSON.stringify(expected))
 expect(Object.getOwnPropertyDescriptor(actual,'16789')?.value).toEqual(expected[16789]);expect('24999'in actual).toBe(true);expect('25000'in actual).toBe(false)
})
it('keeps owned prefix snapshots independent and rejects writes to list, entries and captured IDs',()=>{
 const ids=['opaque/a','opaque/b'],first=unavailableFlowSnapshot(ids,'01'),before=JSON.stringify(first)
 const second=unavailableFlowSnapshot(['opaque/a','opaque/b','opaque/c'],'012')
 expect(first.length).toBe(2);expect(second.length).toBe(3);expect(JSON.stringify(first)).toBe(before)
 expect(()=>ids.push('future')).toThrow();expect(()=>Reflect.set(first,'0',{id:'future',reason:'future'})).toThrow()
 expect(()=>Reflect.deleteProperty(first,'0')).toThrow();expect(()=>Object.defineProperty(first,'1',{value:{id:'future'}})).toThrow()
 expect(()=>Object.setPrototypeOf(first,{})).toThrow();expect(Reflect.set(first[0],'reason','future')).toBe(false)
 expect(JSON.stringify(first)).toBe(before)
})
it('retains empty list behavior and rejects mismatched captured reason storage',()=>{
 expect(unavailableFlowSnapshot([],'')).toEqual([]);expect(()=>unavailableFlowSnapshot(['opaque/a'],'')).toThrow('reason count')
})
