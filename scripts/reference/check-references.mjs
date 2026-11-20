import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

export const referencePairs=Object.freeze([
 ['best.png','06_true3d_person_runtime.png'],
 ['ChatGPT Image Oct 3, 2026, 02_21_17 PM.png','07_true3d_object_inspector.png'],
 ['ChatGPT Image Oct 3, 2026, 02_21_12 PM.png','08_true3d_recursion.png'],
 ['ChatGPT Image Oct 3, 2026, 02_21_08 PM.png','09_true3d_array_sort.png'],
 ['ChatGPT Image Oct 3, 2026, 02_21_05 PM.png','10_true3d_reference_sheet.png'],
 ['ChatGPT Image Oct 3, 2026, 02_20_44 PM.png','11_true3d_scene_language.png'],
])
const baseline='68b394c98eee45c5e07a1f3b6340049449185941'
const digest=bytes=>createHash('md5').update(bytes).digest('hex')
const repository=resolve(fileURLToPath(new URL('../../',import.meta.url)))

/** Read-only integrity check. Root user-owned images are never copied or staged. */
export function checkReferences(root=repository){
 const failures=[],images=[]
 const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:['ignore','pipe','pipe'],maxBuffer:64*1024*1024})
 const rootNames=readdirSync(root).filter(name=>/^ChatGPT Image.*\.png$/.test(name))
 if(rootNames.length!==5)failures.push(`Expected exactly five root ChatGPT Image*.png references; found ${rootNames.length}`)
 for(const[rootName,twinName]of referencePairs){
  const twin=`docs/visual-java-spec/references/${twinName}`
  try{
   const original=readFileSync(resolve(root,rootName)),trackedTwin=readFileSync(resolve(root,twin))
   let tracked=false
   try{git('ls-files','--error-unmatch','--',rootName);tracked=true}catch{ /* Expected for five user-owned references. */ }
   if(tracked!==(rootName==='best.png'))failures.push(`${rootName}: must remain ${rootName==='best.png'?'tracked':'untracked and user-owned'}`)
   const md5=digest(original)
   if(md5!==digest(trackedTwin))failures.push(`${rootName}: differs from tracked twin ${twin}`)
   if(md5!==digest(git('show',`${baseline}:${twin}`)))failures.push(`${rootName}: changed since the corrected specification baseline`)
   images.push({root:rootName,twin,md5,tracked})
  }catch(error){failures.push(`${rootName}: ${error.message}`)}
 }
 return{images,failures}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=checkReferences()
 if(report.failures.length){process.stderr.write(report.failures.join('\n')+'\n');process.exitCode=1}
 else process.stdout.write(`Six references are byte-identical to their baseline twins; best.png is tracked and five user-owned roots remain untracked.\n`)
}
