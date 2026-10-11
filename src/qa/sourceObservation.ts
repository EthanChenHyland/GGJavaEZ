/** Read-only observations supplied by the actual lazy Monaco owner. No editor import. */
export interface SourceObservation {
 modelUri:string
 lineCount:number
 first:number
 last:number
 scrollTop:number
 position:{lineNumber:number;column:number}|null
 selection:readonly {startLineNumber:number;startColumn:number;endLineNumber:number;endColumn:number}[]|null
 fontSize:number
 lineHeight:number
  target:{mark:string;line:number|null}|null
  pauseId:string|null
  scrollAction:{action:string;line:number;modelUri:string;scrollTop:number}|null
  view:{height:number;visibility:string;connected:boolean;lastDecision:string;valid:boolean;rangeCount:number}|null
}
let current:{read:()=>SourceObservation|null}|null=null
export function registerSourceObservation(read:()=>SourceObservation|null):()=>void {
 const owner={read};current=owner
 return()=>{if(current===owner)current=null}
}
export function observeSource():SourceObservation|null {return current?.read()??null}
