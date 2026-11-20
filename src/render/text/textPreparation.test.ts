import {expect,it,vi} from 'vitest'
import {observeTextPreparation} from './textPreparation'

function harness(){
 const listeners=new Map<string,Set<()=>void>>()
 const batch={
  addEventListener(type:string,listener:()=>void){const group=listeners.get(type)??new Set();group.add(listener);listeners.set(type,group)},
  removeEventListener(type:string,listener:()=>void){listeners.get(type)?.delete(listener)},
 }
 return{batch,emit:(type:string)=>listeners.get(type)?.forEach(listener=>listener()),readiness:{pending:new Set<string>(),lastSync:0},invalidate:vi.fn()}
}

it('waits for the font atlas and every overlapping batch pack after member layout finishes',async()=>{
 const h=harness();let finishFont!:()=>void
 const font=new Promise<void>(resolve=>{finishFont=resolve})
 const release=observeTextPreparation(h.batch,h.readiness,'world',font,h.invalidate)
 h.readiness.pending.add('member')
 h.emit('syncstart');h.emit('syncstart')
 h.readiness.pending.delete('member')
 h.emit('synccomplete')
 expect(h.readiness.pending).toEqual(new Set(['world:font','world:batch']))
 finishFont();await font
 expect(h.readiness.pending).toEqual(new Set(['world:batch']))
 h.emit('synccomplete')
 expect(h.readiness.pending.size).toBe(0)
 expect(h.readiness.lastSync).toBeGreaterThan(0)
 expect(h.invalidate).toHaveBeenCalledTimes(3)
 // Demand rendering must wake again after later edits have repacked glyphs.
 h.emit('syncstart');expect(h.readiness.pending.has('world:batch')).toBe(true)
 h.emit('synccomplete');expect(h.invalidate).toHaveBeenCalledTimes(4)
 release()
})

it('retiring one batch removes only its own pending work and ignores its late font completion',async()=>{
 const h=harness();let finish!:()=>void
 const font=new Promise<void>(resolve=>{finish=resolve})
 const release=observeTextPreparation(h.batch,h.readiness,'retired',font,h.invalidate)
 h.readiness.pending.add('other-world:batch');h.emit('syncstart')
 release();h.emit('synccomplete');finish();await font
 expect(h.readiness.pending).toEqual(new Set(['other-world:batch']))
 expect(h.readiness.lastSync).toBe(0)
 expect(h.invalidate).not.toHaveBeenCalled()
})

it('does not report a rejected atlas as ready',async()=>{
 const h=harness(),font=Promise.reject(new Error('Font fetch failed'))
 const release=observeTextPreparation(h.batch,h.readiness,'failed',font,h.invalidate)
 await font.catch(()=>{})
 expect(h.readiness.pending).toEqual(new Set(['failed:font']))
 expect(h.invalidate).toHaveBeenCalledOnce()
 release();expect(h.readiness.pending.size).toBe(0)
})
