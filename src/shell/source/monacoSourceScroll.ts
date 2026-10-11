import type {editor,IDisposable} from 'monaco-editor'
import {createSourceScrollPolicy,firstVisibleLineForMiddleThird,type SourceScrollTarget} from './sourceScrollPolicy'
import {registerSourceObservation} from '../../qa/sourceObservation'

/** Owns only editor scroll listeners/timers, never caret, model or world state. */
export function bindMonacoSourceScroll(instance:editor.IStandaloneCodeEditor,monaco:typeof import('monaco-editor/editor/editor.api.js')) {
 const policy=createSourceScrollPolicy()
 let dom:HTMLElement|null=null,panel:HTMLElement|null|undefined=null
 let target:SourceScrollTarget|null=null,pauseId:string|null=null,programmatic=0,userAt=-Infinity,disposed=false
 let retry:ReturnType<typeof setTimeout>|undefined
 let viewFrame:number|null=null,viewDeadline=0
 let scrollAction:{action:string;line:number;modelUri:string;scrollTop:number}|null=null
 let view:{height:number;visibility:string;connected:boolean;lastDecision:string;valid:boolean;rangeCount:number}|null=null
 const now=()=>performance.now(),intent=()=>{userAt=now()}
 const key=(event:KeyboardEvent)=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(event.key))intent()}
 function pointer(event:PointerEvent){if(event.buttons)intent()}
 const unbindDom=()=>{
  dom?.removeEventListener('wheel',intent,true);dom?.removeEventListener('pointerdown',intent,true)
  dom?.removeEventListener('pointermove',pointer,true);dom?.removeEventListener('keydown',key,true)
 }
 const bindDom=()=>{
  const next=instance.getDomNode()
  if(next===dom)return
  unbindDom();dom=next;panel=dom?.closest<HTMLElement>('.ide-editor-panel')
  dom?.addEventListener('wheel',intent,{passive:true,capture:true})
  dom?.addEventListener('pointerdown',intent,true);dom?.addEventListener('pointermove',pointer,true);dom?.addEventListener('keydown',key,true)
 }
 const listeners:IDisposable[]=[]
 const releaseObservation=registerSourceObservation(()=>{
  if(disposed)return null
  const model=instance.getModel(),ranges=instance.getVisibleRanges()
  if(!model||model.isDisposed()||!ranges.length)return null
  return{modelUri:model.uri.toString(),lineCount:model.getLineCount(),first:ranges[0].startLineNumber,last:ranges.at(-1)!.endLineNumber,scrollTop:instance.getScrollTop(),position:instance.getPosition(),selection:instance.getSelections(),fontSize:instance.getOption(monaco.editor.EditorOption.fontSize),lineHeight:instance.getOption(monaco.editor.EditorOption.lineHeight),readOnly:instance.getOption(monaco.editor.EditorOption.readOnly),target:target?{mark:target.mark,line:target.line}:null,pauseId,scrollAction,view}
 })
 const clearRetry=()=>{clearTimeout(retry);retry=undefined}
 const afterModelReady=()=>{
  if(disposed||viewFrame!==null)return
  viewFrame=requestAnimationFrame(()=>{viewFrame=null;apply()})
 }
 const apply=()=>{
  clearRetry()
  if(disposed||!target)return
  bindDom()
  const model=instance.getModel(),line=target.line
  const ranges=instance.getVisibleRanges(),shown=!!dom&&getComputedStyle(dom).visibility!=='hidden'&&dom.getBoundingClientRect().height>0
  const visible=shown&&ranges.length?{first:ranges[0].startLineNumber,last:ranges.at(-1)!.endLineNumber}:null
  const valid=!!model&&!model.isDisposed()&&line!==null&&line>=1&&line<=model.getLineCount()
  // setModel/restoreViewState finishes before Monaco publishes visible ranges.
  // Do not consume a pause while that view is still mounting.
  if(valid&&shown&&!visible&&now()<viewDeadline)afterModelReady()
  const action=policy.decide(valid?target:{...target,line:null},visible,pauseId,now())
  view={height:dom?.getBoundingClientRect().height??0,visibility:dom?getComputedStyle(dom).visibility:'absent',connected:!!dom?.isConnected,lastDecision:action,valid,rangeCount:ranges.length}
  if(!valid||line===null||!model)return
  programmatic++
  try{
   if(action==='middle-third'){
    const layout=instance.getLayoutInfo(),padding=instance.getOption(monaco.editor.EditorOption.padding),pitch=instance.getOption(monaco.editor.EditorOption.lineHeight)
    // Shell CSS variables contain the final panel dimensions during its 400 ms
    // animation. Center once for that destination, rather than an interim height.
    const finalPanelHeight=panel?Number.parseFloat(getComputedStyle(panel).getPropertyValue('--source-height')):NaN
    const height=panel&&Number.isFinite(finalPanelHeight)?finalPanelHeight-(panel.clientHeight-layout.height):layout.height
    const count=Math.max(1,Math.floor((height-layout.horizontalScrollbarHeight-padding.top-padding.bottom)/pitch))
    const first=firstVisibleLineForMiddleThird(line,count,model.getLineCount())
    instance.setScrollTop(Math.max(0,instance.getTopForLineNumber(first)-padding.top),monaco.editor.ScrollType.Immediate)
   }else if(action==='reveal')instance.revealLineInCenterIfOutsideViewport(line,monaco.editor.ScrollType.Immediate)
   if(action!=='none')scrollAction={action,line,modelUri:model.uri.toString(),scrollTop:instance.getScrollTop()}
  }finally{programmatic--}
  const until=policy.suppressedUntil()
  if(target.mark==='running'&&until>now())retry=setTimeout(apply,until-now()+1)
 }
 bindDom()
 listeners.push(instance.onDidChangeModel(()=>{viewDeadline=now()+1000;afterModelReady()}),instance.onDidLayoutChange(apply),instance.onDidScrollChange(event=>{
  if(event.scrollTopChanged&&!programmatic&&now()-userAt<250){policy.manualScroll(now());apply()}
 }))
 return {
  sync(next:SourceScrollTarget,actualPauseId:string|null){target=next;pauseId=actualPauseId;viewDeadline=now()+1000;apply()},
  dispose(){
   disposed=true;releaseObservation();clearRetry();if(viewFrame!==null)cancelAnimationFrame(viewFrame);viewFrame=null;listeners.forEach(listener=>listener.dispose())
   unbindDom();dom=null;panel=null
  },
 }
}
