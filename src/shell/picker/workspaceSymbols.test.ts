import {expect,it,vi} from 'vitest'
import {createWorkspaceSymbolSearch,type SymbolSnapshot} from './workspaceSymbols'
import {documentUri,type LspWorkspaceSymbol} from '../../language/protocol'
const symbol=(name:string,path='src/Main.java',project='project'):LspWorkspaceSymbol=>({name,kind:12,location:{uri:documentUri(project,path),range:{start:{line:7,character:4},end:{line:7,character:12}}}})
const deferred=()=>{let resolve!:(items:LspWorkspaceSymbol[])=>void,reject!:(error:Error)=>void;const promise=new Promise<LspWorkspaceSymbol[]>((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
function fixture(request=(async()=>[])as(query:string)=>Promise<LspWorkspaceSymbol[]|null>){let project:string|null='project';const snapshots:SymbolSnapshot[]=[],ask=vi.fn(request),search=createWorkspaceSymbolSearch({projectId:()=>project,request:ask,publish:snapshot=>snapshots.push(snapshot)});return{search,ask,snapshots,switchProject(id:string|null){project=id}}}
it('retains actual JDT order, local Unicode paths and exact one-based source positions without re-filtering semantic matches',async()=>{
 const rows=[symbol('semanticMatch','src/État.java'),symbol('anotherMatch')],before=JSON.stringify(rows),f=fixture(async()=>rows)
 await f.search.search('a server-owned pattern');expect(f.ask).toHaveBeenCalledWith('a server-owned pattern')
 const final=f.snapshots.at(-1)!;expect(final.items.map(item=>item.label)).toEqual(['semanticMatch','anotherMatch'])
 expect(final.items[0]).toMatchObject({enabled:true,location:{path:'src/État.java',line:8,column:5}});expect(final.status).toBe('2 symbols');expect(JSON.stringify(rows)).toBe(before)
})
it('filters foreign/external locations before bounding the same-project list at80',async()=>{
 const external={...symbol('external'),location:{uri:'file:///outside/Main.java'}},rows=[symbol('foreign','Main.java','elsewhere'),external,...Array.from({length:100},(_,i)=>symbol('local'+i))],f=fixture(async()=>rows)
 await f.search.search('local');expect(f.snapshots.at(-1)!.items.map(item=>item.label)).toEqual(Array.from({length:80},(_,i)=>'local'+i))
 expect(new Set(f.snapshots.at(-1)!.items.map(item=>item.id)).size).toBe(80)
})
it('keeps missing or invalid positions explicitly disabled instead of inventing line one',async()=>{
 const missing=symbol('missing');delete missing.location.range
 const invalid=symbol('invalid');invalid.location.range!.start.line=-1
 const f=fixture(async()=>[missing,invalid,symbol('valid')]);await f.search.search('query')
 expect(f.snapshots.at(-1)!.items.map(item=>({enabled:item.enabled,location:item.location}))).toEqual([{enabled:false,location:null},{enabled:false,location:null},{enabled:true,location:{path:'src/Main.java',line:8,column:5}}])
 expect(f.snapshots.at(-1)!.items[0].reason).toContain('no valid source position')
})
it('rejects a late query response after a newer query has committed',async()=>{
 const old=deferred(),recent=deferred(),f=fixture(query=>query==='old'?old.promise:recent.promise),a=f.search.search('old'),b=f.search.search('recent')
 recent.resolve([symbol('new')]);await b;const count=f.snapshots.length
 old.resolve([symbol('stale')]);await a;expect(f.snapshots).toHaveLength(count);expect(f.snapshots.at(-1)!.items[0].label).toBe('new')
})
it('invalidates pending success and error publication on owner cleanup',async()=>{
 const pending=deferred(),f=fixture(()=>pending.promise),run=f.search.search('before unmount');f.search.invalidate();const count=f.snapshots.length
 pending.reject(new Error('late error'));await run;expect(f.snapshots).toHaveLength(count)
 const next=deferred(),g=fixture(()=>next.promise),another=g.search.search('pending');g.search.invalidate();const otherCount=g.snapshots.length;next.resolve([symbol('late')]);await another;expect(g.snapshots).toHaveLength(otherCount)
})
it('cannot relabel a previous-project response as belonging to the new project',async()=>{
 const pending=deferred(),f=fixture(()=>pending.promise),run=f.search.search('same query');f.switchProject('new project');const count=f.snapshots.length
 pending.resolve([symbol('oldProject')]);await run;expect(f.snapshots).toHaveLength(count)
})
it('surfaces the actual request error and permits a later successful search',async()=>{
 const f=fixture(async query=>{if(query==='bad')throw new Error('JDT unavailable: actual reason');return[symbol('recovered')]})
 await f.search.search('bad');expect(f.snapshots.at(-1)).toMatchObject({items:[],status:'JDT unavailable: actual reason'})
 await f.search.search('good');expect(f.snapshots.at(-1)!.items[0].label).toBe('recovered')
})
it('clears empty/unavailable-project queries without sending a request or leaking a prior result',async()=>{
 const f=fixture(async()=>[symbol('previous')]);await f.search.search('first');await f.search.search('  ');expect(f.ask).toHaveBeenCalledTimes(1);expect(f.snapshots.at(-1)).toMatchObject({items:[],status:'Search project symbols'})
 f.switchProject(null);await f.search.search('query');expect(f.ask).toHaveBeenCalledTimes(1);expect(f.snapshots.at(-1)).toMatchObject({projectId:null,items:[]})
})
