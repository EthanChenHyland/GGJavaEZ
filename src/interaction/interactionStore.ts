import {create} from 'zustand'
import type {Selection} from '../contracts/interaction'
import type {TraceScope} from '../contracts/world'
import type {OrbitPose} from '../camera/projection'
import type {NavigationMode} from '../camera/cameraStore'
export interface WorldHover {
 kind:'connector'|'flow'|'entity';id:string
 pointer?:readonly[number,number]
 presentation?:{recordingId:string;cursor:number;revision:number}
}
export interface InteractionState {
 selection:Selection
 focus:{targetId:string;kind:'frame'|'object'|'class'|'arrayCell'|'cluster'}|null
 preFocus:{pose:OrbitPose;mode:NavigationMode}|null
 trace:{active:boolean;scope:TraceScope}
 hover:WorldHover|null
 setHover(hover:WorldHover|null):void
 select(selection:Selection):void
 setFocus(selection:NonNullable<Selection>,pose:OrbitPose,mode:NavigationMode):void
 clearFocus():void
 enterTrace():void
 setTraceScope(scope:TraceScope):void
 clearTrace():void
 resetRecording():void
}
export function focusable(selection:Selection):selection is NonNullable<Selection>{return !!selection&&['frame','object','class','slot','cluster'].includes(selection.kind)}
export const useInteractionStore=create<InteractionState>(set=>({selection:null,focus:null,preFocus:null,trace:{active:false,scope:'relevant'},hover:null,
 setHover:hover=>set(state=>{
  const prior=state.hover
  if(prior===hover||prior&&hover&&prior.kind===hover.kind&&prior.id===hover.id&&prior.pointer?.[0]===hover.pointer?.[0]&&prior.pointer?.[1]===hover.pointer?.[1]&&prior.presentation?.recordingId===hover.presentation?.recordingId&&prior.presentation?.cursor===hover.presentation?.cursor&&prior.presentation?.revision===hover.presentation?.revision)return state
  return{hover}
 }),
 select:selection=>set({selection}),
 setFocus:(selection,pose,mode)=>{if(!focusable(selection))return;set(state=>({selection,focus:{targetId:selection.id,kind:selection.kind==='slot'?'arrayCell':selection.kind as 'frame'|'object'|'class'|'cluster'},preFocus:state.preFocus??{pose,mode},trace:{...state.trace,active:false}}))},
 clearFocus:()=>set({focus:null,preFocus:null}),
 enterTrace:()=>set({trace:{active:true,scope:'relevant'}}),
 setTraceScope:scope=>set(state=>({trace:{...state.trace,scope}})),
 clearTrace:()=>set(state=>({trace:{...state.trace,active:false}})),
 resetRecording:()=>set({selection:null,focus:null,preFocus:null,trace:{active:false,scope:'relevant'},hover:null}),
}))
export const interactionStore=useInteractionStore
