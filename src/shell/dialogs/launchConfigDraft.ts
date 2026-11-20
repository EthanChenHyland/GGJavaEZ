import type {LaunchConfiguration} from '../../ide/javaProject'
export interface LaunchConfigDraft {mainClass:string;workingDirectory:string;program:string;jvm:string}
/** Parse only the actual JSON argument arrays. Never trim paths/arguments,
 * perform shell splitting, infer a main class or change build dependencies. */
export function parseLaunchConfigDraft(draft:LaunchConfigDraft):LaunchConfiguration{
 const programArgs:unknown=JSON.parse(draft.program),jvmArgs:unknown=JSON.parse(draft.jvm)
 if(![programArgs,jvmArgs].every(args=>Array.isArray(args)&&args.every((arg:unknown)=>typeof arg==='string')))throw new Error('Arguments must be JSON arrays of strings.')
 return{mainClass:draft.mainClass,workingDirectory:draft.workingDirectory,programArgs:programArgs as string[],jvmArgs:jvmArgs as string[]}
}
