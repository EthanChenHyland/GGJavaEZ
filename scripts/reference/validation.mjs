/** A successful command alone cannot certify an incomplete/skipped matrix. */
export function validationFailures(report){
 const failures=[]
 for(const gate of report.gates??[]){
  if(gate.exitCode!==0)failures.push(`${gate.name}: exit ${gate.exitCode}`)
  if(!Number.isInteger(gate.expected)||gate.expected<=0||gate.executed!==gate.expected)failures.push(`${gate.name}: executed ${gate.executed}/${gate.expected}`)
  if(gate.skipped!==0)failures.push(`${gate.name}: ${gate.skipped} required skips`)
 }
 if(!report.gates?.length)failures.push('No validation gates recorded')
 if(!Number.isInteger(report.realJvmExecuted)||report.realJvmExecuted<=0)failures.push('No actual real-JVM execution recorded')
 return failures
}
export function assertValidationReport(report){const failures=validationFailures(report);if(failures.length)throw new Error(failures.join('\n'))}
