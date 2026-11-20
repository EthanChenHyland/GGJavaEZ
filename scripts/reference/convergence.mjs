import {readFile,access} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {validationFailures} from './validation.mjs'
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)))
const catalog=JSON.parse(await readFile(resolve(root,'e2e/reference/states.json'),'utf8'))
const reviewPath=resolve(root,'docs/checkpoints/reference-exact/REVIEW.md')
let review=''
try{review=await readFile(reviewPath,'utf8')}catch{ /* Report all missing reviews below. */ }
const rows=review.split('\n').filter(line=>line.startsWith('|')).map(line=>line.split(/(?<!\\)\|/).slice(1,-1).map(cell=>cell.trim()))
const columns=['State','Viewport','SHA256','Status','Largest discrepancy','Category','Fix','Reason']
const header=rows.findIndex(row=>row.every((value,index)=>value===columns[index])&&row.length===columns.length)
const entries=header<0?[]:rows.slice(header+2).filter(row=>row.length===columns.length)
let matrix=null
try{matrix=JSON.parse(await readFile(resolve(root,'.ggjavaez/qa/reference-exact/matrix-report.json'),'utf8'))}catch{ /* Gate failure is reported below. */ }
const failures=[]
for(const state of catalog.states){
 for(const viewport of [...catalog.viewports.map(size=>`${size.width}x${size.height}`),'native']){
  const id=`${state.id}-${viewport}`
  let capture
  try{capture=JSON.parse(await readFile(resolve(root,`.ggjavaez/qa/reference-exact/captures/${id}.json`),'utf8'))}catch{failures.push(`${id}: no ready real-JVM capture`);continue}
  if(!matrix?.runId||capture.runId!==matrix.runId)failures.push(`${id}: capture does not belong to the latest complete matrix run`)
  if(capture.realJvmExecuted!==true||capture.rawEventCount<=0)failures.push(`${id}: no instrumented JVM evidence`)
  if(capture.misses?.length)failures.push(`${id}: rectangle acceptance failed: ${capture.misses.join('; ')}`)
  try{const png=await readFile(resolve(root,capture.capture));if(createHash('sha256').update(png).digest('hex')!==capture.sha256)failures.push(`${id}: capture PNG changed after observation`);await access(resolve(root,`docs/checkpoints/reference-exact/side-by-side/${id}.png`));await access(resolve(root,`docs/checkpoints/reference-exact/diff/${id}.png`))}catch{failures.push(`${id}: missing capture/comparison/diff PNG`)}
  const entry=entries.findLast(row=>row[0]===state.id&&row[1]===viewport)
  if(!entry){failures.push(`${id}: visual review missing`);continue}
  const [, ,hash,status,largest,category,fix,reason]=entry
  if(hash!==capture.sha256)failures.push(`${id}: review belongs to an older capture`)
  if(!['composition','camera','lighting','material','proportion','typography','contrast','control placement','runtime content'].includes(category))failures.push(`${id}: invalid review category ${category}`)
  if(!largest||!fix)failures.push(`${id}: largest discrepancy and fix must be recorded`)
  if(status==='necessary-deviation'&&!reason)failures.push(`${id}: necessary deviation requires a reason`)
  else if(!['converged','necessary-deviation'].includes(status))failures.push(`${id}: ${largest}; next fix: ${fix}`)
 }
}
if(matrix){failures.push(...validationFailures(matrix));if(matrix.failures?.length)failures.push(...matrix.failures)}
else failures.push('Full 80-case browser matrix validation report missing')
if(failures.length){process.stderr.write(`Reference states not converged (${failures.length} findings):\n${[...new Set(failures)].join('\n')}\n`);process.exitCode=1}
else process.stdout.write('All 16 states × 5 QA viewports plus 16 native captures have passed geometry, JVM and visual-review gates.\n')
