import {expect,it,vi} from 'vitest'
import {dirtyRunPaths,saveDirtyRun} from './dirtyRun'
const gate=()=>{let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve});return{promise,release}}
it('lists dirty open/inactive and closed drafts once, with open models authoritative',()=>{
 expect(dirtyRunPaths({tabs:[{path:'main',draft:'new',content:'old',revision:'1'},{path:'clean',draft:'same',content:'same',revision:'2'}],closedDrafts:[{path:'main',draft:'stale',revision:'1',dirty:true},{path:'clean',draft:'stale',revision:'2',dirty:true},{path:'closed',draft:'changed',revision:'3',dirty:true},{path:'closed',draft:'changed',revision:'3',dirty:true},{path:'saved',draft:'same',revision:'4',dirty:false}]})).toEqual(['main','closed'])
})
it('rejects an unlisted dirty file before saving anything',async()=>{
 const save=vi.fn(async()=>{})
 await expect(saveDirtyRun(['main'],{checkContext:()=>{},paths:()=>['main','new file'],saveAll:save})).rejects.toThrow('new file')
 expect(save).not.toHaveBeenCalled()
})
it('does not release the launch continuation before all saves settle',async()=>{
 const pending=gate(),launch=vi.fn();let dirty=true
 const run=saveDirtyRun(['main','closed'],{checkContext:()=>{},paths:()=>dirty?['main','closed']:[],saveAll:async()=>{await pending.promise;dirty=false}}).then(launch)
 await Promise.resolve();expect(launch).not.toHaveBeenCalled();pending.release();await run;expect(launch).toHaveBeenCalledOnce()
})
it('retains the original save failure and blocks launch',async()=>{
 const error=new Error('closed: disk revision conflict'),launch=vi.fn()
 await expect(saveDirtyRun(['closed'],{checkContext:()=>{},paths:()=>['closed'],saveAll:async()=>{throw error}}).then(launch)).rejects.toBe(error)
 expect(launch).not.toHaveBeenCalled()
})
it('blocks launch when another edit survives the save barrier',async()=>{
 const launch=vi.fn();let paths=['main']
 await expect(saveDirtyRun(['main'],{checkContext:()=>{},paths:()=>paths,saveAll:async()=>{paths=['main','new closed']}}).then(launch)).rejects.toThrow('Files changed while saving; review before Run:\nmain\nnew closed')
 expect(launch).not.toHaveBeenCalled()
})
it('rechecks the captured workspace after awaiting Save All',async()=>{
 const pending=gate(),launch=vi.fn();let current=true
 const run=saveDirtyRun(['main'],{checkContext:()=>{if(!current)throw new Error('Older workspace')},paths:()=>['main'],saveAll:()=>pending.promise}).then(launch)
 current=false;pending.release();await expect(run).rejects.toThrow('Older workspace');expect(launch).not.toHaveBeenCalled()
})
