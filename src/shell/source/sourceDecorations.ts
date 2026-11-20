import type {editor} from 'monaco-editor'
import type {SourceMark} from './sourceScrollPolicy'

/** One visual grammar for editable and recorded source; no editor loading here. */
export function sourceDecorations(line:number|null,mark:SourceMark,exceptionLine:number|null,lineCount:number):editor.IModelDeltaDecoration[] {
 const valid=(value:number|null):value is number=>value!==null&&Number.isInteger(value)&&value>=1&&value<=lineCount
 const range=(value:number)=>({startLineNumber:value,endLineNumber:value,startColumn:1,endColumn:1})
 const decorations:editor.IModelDeltaDecoration[]=[]
 if(valid(line))decorations.push({range:range(line),options:{isWholeLine:true,className:mark==='reveal'?'gg-source-reveal-line':mark==='paused'?'debug-paused-line':mark==='history'?'executing-line gg-source-history-line':mark==='focus'?'executing-line gg-source-focus-line':'executing-line',linesDecorationsClassName:mark==='reveal'?'gg-source-reveal-gutter':mark==='paused'?'debug-paused-gutter':mark==='history'?'gg-source-history-gutter':'executing-gutter'}})
 if(valid(exceptionLine))decorations.push({range:range(exceptionLine),options:{isWholeLine:true,className:'gg-source-exception-line',linesDecorationsClassName:'gg-source-exception-gutter'}})
 return decorations
}
