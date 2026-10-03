import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { describe, it, expect, vi } from 'vitest';
import { streamExecution, queryRawRange, transportOptions } from './execution-transport.mjs';
function fixture(count=12) {
 const events=Array.from({length:count},(_,seq)=>({v:1,seq,type:'line'}));
 let subscriber, unsubscribed=0;
 const manager={snapshot:()=>({id:'s',rawEventCount:events.length,rawEvents:[],recording:{state:'FULL'}}),has:()=>true,
 subscribe:(_id,fn)=>{subscriber=fn;return()=>unsubscribed++},
 raw:(_id,from,limit)=>({version:1,sessionId:'s',fromSequence:from,toSequence:Math.min(events.length,from+limit),events:events.slice(from,from+limit),recording:{state:'FULL'}})};
 const response=new EventEmitter();response.frames=[];response.writableLength=0;response.writeHead=()=>{};
 response.write=frame=>{response.frames.push(frame);return true};response.end=()=>{response.ended=true;response.emit('close')};response.destroy=()=>{response.destroyed=true;response.emit('close')};
 return {manager,response,publish:()=>subscriber(manager.snapshot()),unsubscribed:()=>unsubscribed};
}
const decode=response=>response.frames.map(frame=>({event:/event: (\w+)/.exec(frame)[1],value:JSON.parse(/data: (.*)/.exec(frame)[1])}));
describe('bounded versioned execution transport',()=>{
 it('publishes metadata and only the requested suffix, resuming from accepted sequence',()=>{
  const f=fixture();const close=streamExecution({},f.response,f.manager,'s',{from:5,limit:3});
  const frames=decode(f.response);expect(frames[0].value.rawEvents).toEqual([]);
  expect(frames.slice(1).flatMap(x=>x.value.events.map(e=>e.seq))).toEqual([5,6,7,8,9,10,11]);
  expect(frames.at(-1).value.toSequence).toBe(12);close();expect(f.unsubscribed()).toBe(1);
 });
 it('bounds catch-up publication per tick without a retained queue',()=>{
  const f=fixture(100);const close=streamExecution({},f.response,f.manager,'s',{limit:3,batchesPerTick:2});
  expect(decode(f.response).filter(x=>x.event==='raw')).toHaveLength(2);close();
 });
 it('drains an accepted large metadata frame before sending raw facts instead of reconnecting forever',()=>{
  vi.useFakeTimers();
  const f=fixture();let writes=0;
  f.response.write=frame=>{f.response.frames.push(frame);return ++writes>1};
  const close=streamExecution({},f.response,f.manager,'s');
  try {
   expect(f.response.ended).not.toBe(true);
   expect(decode(f.response).map(frame=>frame.event)).toEqual(['session']);
   // New Console metadata arriving while blocked cannot starve the raw suffix.
   f.publish();
   f.response.emit('drain');
   expect(decode(f.response).map(frame=>frame.event)).toEqual(['session']);
   vi.advanceTimersByTime(100);
   expect(decode(f.response).filter(frame=>frame.event==='session')).toHaveLength(1);
   expect(decode(f.response).filter(frame=>frame.event==='raw').flatMap(frame=>frame.value.events.map(event=>event.seq))).toEqual(Array.from({length:12},(_,i)=>i));
  } finally {close();vi.useRealTimers();}
  expect(f.response.listenerCount('drain')).toBe(0);
 });
 it('disconnects a genuinely stalled response after its bounded drain deadline without invoking a process stop',()=>{
  vi.useFakeTimers();
  const f=fixture();f.response.write=frame=>{f.response.frames.push(frame);return false};
  try {
   streamExecution({},f.response,f.manager,'s');expect(f.response.ended).not.toBe(true);
   vi.advanceTimersByTime(1000);expect(f.response.ended).toBe(true);expect(f.unsubscribed()).toBe(1);
  } finally {vi.useRealTimers();}
 });
 it('delivers raw facts over HTTP after metadata exceeds the socket high-water mark',async()=>{
  const f=fixture();const snapshot=f.manager.snapshot;
  f.manager.snapshot=()=>({...snapshot(),stdout:'x'.repeat(512*1024)});
  let pressure=0,reader;
  const server=createServer((request,response)=>{
   const write=response.write.bind(response);
   response.write=(...args)=>{const accepted=write(...args);if(!accepted)pressure++;return accepted};
   streamExecution(request,response,f.manager,'s');
  });
  try {
   await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
   const response=await fetch(`http://127.0.0.1:${server.address().port}/`);
   reader=response.body.getReader();let text='';const decoder=new TextDecoder();
   while(!text.includes('event: raw\n')){
    const chunk=await reader.read();expect(chunk.done).toBe(false);text+=decoder.decode(chunk.value,{stream:true});
   }
   while(!text.endsWith('\n\n')){const chunk=await reader.read();expect(chunk.done).toBe(false);text+=decoder.decode(chunk.value,{stream:true});}
   const frames=text.trim().split('\n\n').map(frame=>({event:/event: (\w+)/.exec(frame)[1],value:JSON.parse(/data: (.*)/.exec(frame)[1])}));
   expect(pressure).toBeGreaterThan(0);
   expect(frames.filter(frame=>frame.event==='session')).toHaveLength(1);
   expect(frames.filter(frame=>frame.event==='raw').flatMap(frame=>frame.value.events.map(event=>event.seq))).toEqual(Array.from({length:12},(_,i)=>i));
  } finally {
   await reader?.cancel();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
 },5000);
 it('rejects oversized buffered publication before writing',()=>{
  const f=fixture();streamExecution({},f.response,f.manager,'s',{maxBufferedBytes:1});
  expect(f.response.frames).toEqual([]);expect(f.response.ended).toBe(true);
 });
 it('rejects a client ahead of archived history',()=>{
  const f=fixture();expect(()=>streamExecution({},f.response,f.manager,'s',{from:13})).toThrow('ahead');
 });
 it('validates ranges and gives explicit acknowledgment precedence over native delivery',()=>{
  expect(queryRawRange(new URL('http://local/?from=8&limit=2000'),{'last-event-id':'12'})).toEqual({from:8,limit:1024});
  expect(queryRawRange(new URL('http://local/'),{'last-event-id':'12'}).from).toBe(12);
  for(const q of ['from=-1','from=1.5','limit=0','from=9007199254740992'])expect(()=>queryRawRange(new URL('http://local/?'+q))).toThrow();
  expect(transportOptions(new URL('http://local/?transport=delta'))).toEqual({transport:'delta'});
  expect(()=>transportOptions(new URL('http://local/?transport=other'))).toThrow();
 });
});
