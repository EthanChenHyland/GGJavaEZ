import {afterEach,expect,it,vi} from 'vitest'
import * as fs from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ProjectStore} from './projects.mjs'
import {PROJECT_META} from './project-paths.mjs'

vi.mock('node:fs/promises',async original=>{
 const actual=await original()
 return{...actual,readFile:vi.fn(actual.readFile)}
})
const actual=await vi.importActual('node:fs/promises'),roots=[]
afterEach(async()=>{vi.mocked(fs.readFile).mockReset().mockImplementation(actual.readFile);await Promise.all(roots.splice(0).map(root=>fs.rm(root,{recursive:true,force:true})))})
async function fixture(count){
 const root=await fs.mkdtemp(join(tmpdir(),'vj-catalog-'));roots.push(root)
 await fs.mkdir(join(root,'projects'))
 const summaries=Array.from({length:count},(_,i)=>({id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,name:`Project ${i}`,createdAt:`2026-11-${i%2?'17':'18'}T00:00:00.000Z`}))
 for(const summary of summaries){const directory=join(root,'projects',summary.id);await fs.mkdir(directory);await fs.writeFile(join(directory,PROJECT_META),JSON.stringify(summary))}
 return{store:new ProjectStore(root),root,summaries:summaries.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))}
}

it('reads independent metadata concurrently with a fixed cap and returns exact deterministic order',async()=>{
 const {store,summaries}=await fixture(23)
 let active=0,maximum=0,release
 const gate=new Promise(resolve=>{release=resolve})
 vi.mocked(fs.readFile).mockImplementation(async(...args)=>{
  if(!String(args[0]).endsWith(PROJECT_META))return actual.readFile(...args)
  active++;maximum=Math.max(maximum,active)
  try{await gate;return await actual.readFile(...args)}finally{active--}
 })
 const listing=store.listProjects()
 try{await vi.waitFor(()=>expect(active).toBeGreaterThan(1),{timeout:2000,interval:5});expect(maximum).toBeLessThanOrEqual(8)}finally{release()}
 expect(await listing).toEqual(summaries)
 expect(maximum).toBeLessThanOrEqual(8);expect(active).toBe(0)
})

it('revalidates changed metadata and rejects an invalid captured project instead of caching a stale catalog',async()=>{
 const {store,root,summaries}=await fixture(3)
 expect(await store.listProjects()).toEqual(summaries)
 const changed={...summaries[1],name:'Renamed outside this store'}
 const file=join(root,'projects',changed.id,PROJECT_META)
 await fs.writeFile(file,JSON.stringify(changed))
 expect((await store.listProjects()).find(project=>project.id===changed.id)).toEqual(changed)
 await fs.writeFile(file,JSON.stringify({...changed,id:'wrong'}))
 await expect(store.listProjects()).rejects.toMatchObject({status:400,message:'Invalid project metadata'})
})

it('still rejects symlinked UUID entries and preserves empty and non-project directory behavior',async()=>{
 const {store,root}=await fixture(0)
 await fs.mkdir(join(root,'projects','ordinary-file-cache'))
 expect(await store.listProjects()).toEqual([])
 const outside=await fs.mkdtemp(join(tmpdir(),'vj-catalog-outside-'));roots.push(outside)
 await fs.symlink(outside,join(root,'projects','00000000-0000-4000-8000-000000000001'))
 await expect(store.listProjects()).rejects.toMatchObject({status:400,message:'Symlinks are not allowed in projects'})
})
