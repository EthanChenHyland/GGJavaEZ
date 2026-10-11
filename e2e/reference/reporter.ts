import type {FullConfig,FullResult,Reporter,Suite,TestCase,TestResult} from '@playwright/test/reporter'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import states from './states.json' with {type:'json'}
import {validationFailures} from '../../scripts/reference/validation.mjs'
/** A filtered/zero/skipped reference run is useful for diagnosis but cannot
 * return a successful exhaustive gate. Root can use the regular config for a
 * explicitly named focused diagnostic instead. */
export default class ReferenceReporter implements Reporter {
 private planned=0
 private results:{title:string;status:string;sessionId:string|null;realJvmExecuted:boolean}[]=[]
 onBegin(_config:FullConfig,suite:Suite){this.planned=suite.allTests().length}
 onTestEnd(test:TestCase,result:TestResult){
  const attachment=result.attachments.find(value=>value.name==='actual-jvm-session')
  const session=attachment?.body?JSON.parse(attachment.body.toString()):null
  this.results.push({title:test.title,status:result.status,sessionId:session?.id??null,realJvmExecuted:session?.buildSuccess===true&&session.rawEvents>0})
 }
 async onEnd(result:FullResult):Promise<{status:'failed'}|void>{
  if(process.argv.includes('--list'))return
  const expected=states.states.length*states.viewports.length
  const executed=this.results.filter(value=>value.status!=='skipped').length,skipped=this.results.filter(value=>value.status==='skipped').length
  const realJvmExecuted=new Set(this.results.filter(value=>value.realJvmExecuted).map(value=>value.sessionId)).size
  const report={runId:process.env.VJ_REFERENCE_RUN_ID??null,generatedAt:new Date().toISOString(),planned:this.planned,realJvmExecuted,gates:[{name:'reference browser matrix',expected,executed,skipped,exitCode:result.status==='passed'?0:1}],results:this.results}
  const failures=validationFailures(report)
  if(this.planned!==expected)failures.push(`Planned ${this.planned}/${expected} cases; filtered runs are not exhaustive validation`)
  if(realJvmExecuted!==expected)failures.push(`Actual instrumented JVM sessions ${realJvmExecuted}/${expected}`)
  const directory=resolve('.ggjavaez/qa/reference-exact');await mkdir(directory,{recursive:true});await writeFile(resolve(directory,'matrix-report.json'),JSON.stringify({...report,failures},null,2)+'\n')
  if(failures.length){process.stderr.write(`\nReference gate incomplete:\n${failures.join('\n')}\n`);return{status:'failed'}}
 }
}
