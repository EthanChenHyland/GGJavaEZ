export interface ValidationReport {
 gates:{name:string;expected:number;executed:number;skipped:number;exitCode:number}[]
 realJvmExecuted:number
}
export function validationFailures(report:ValidationReport):string[]
export function assertValidationReport(report:ValidationReport):void
