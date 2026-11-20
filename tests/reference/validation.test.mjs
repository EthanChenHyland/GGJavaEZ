import {expect,test} from 'vitest'
import {assertValidationReport} from '../../scripts/reference/validation.mjs'
const complete={realJvmExecuted:7,gates:[{name:'fixture JVM',expected:7,executed:7,skipped:0,exitCode:0},{name:'reference browser',expected:80,executed:80,skipped:0,exitCode:0}]}
test('reference gate accepts only complete actual executions',()=>{expect(()=>assertValidationReport(complete)).not.toThrow()})
test.each([
 ['nonzero command',{...complete,gates:[{...complete.gates[0],exitCode:1}]}],
 ['missing execution',{...complete,gates:[{...complete.gates[0],executed:6}]}],
 ['required skip',{...complete,gates:[{...complete.gates[0],skipped:1}]}],
 ['no JVM',{...complete,realJvmExecuted:0}],
 ['empty gates',{...complete,gates:[]}],
 ['missing counts',{...complete,gates:[{name:'missing',exitCode:0}]}],
])('reference gate rejects %s',(_name,report)=>{expect(()=>assertValidationReport(report)).toThrow()})
