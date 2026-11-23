import {create} from 'zustand'
import type {Selection} from '../contracts/interaction'
import type {DetailLevel} from '../contracts/world'
import type {OrbitPose} from './projection'
import {camera} from '../theme/tokens'
import {focusable,useInteractionStore} from '../interaction/interactionStore'
export type NavigationMode='EXPLORE'|'FOCUS'|'TRACE'|'HOME'
export type CameraIntent={kind:'home'}|{kind:'recording'}|{kind:'hero'}|{kind:'focus';targetId:string}|{kind:'exitFocus';pose:OrbitPose;mode:NavigationMode}|{kind:'followPath';flowId:string}|{kind:'cluster';clusterId:string;recordingId:string;cursor:number;memberId?:string}|{kind:'zoom';factor:number}|{kind:'pose';pose:OrbitPose}
export interface CameraStore {
 mode:NavigationMode;follow:boolean;pose:OrbitPose;detailLevel:DetailLevel;viewTile:string;overview:boolean
 intent:CameraIntent|null;intentRevision:number;reducedMotion:boolean
 explore():void;home():void;focus(selection:NonNullable<Selection>):void;exitFocus(mode?:NavigationMode):void;enterTrace():void;resetRecording(follow?:boolean):void
 followPath(flowId:string):void;enableFollow():void;userInput():void;setPose(pose:OrbitPose):void;setDetailLevel(detailLevel:DetailLevel):void
 setReducedMotion(value:boolean):void;requestPose(pose:OrbitPose):void
 frameHero():void
 travelCluster(clusterId:string,recordingId:string,cursor:number):void
}
const initialPose:OrbitPose={target:[4,-2,0],distance:24,yawDeg:camera.hero.yaw,pitchDeg:camera.hero.pitch}
export const useCameraStore=create<CameraStore>((set,get)=>({mode:'EXPLORE',follow:false,pose:initialPose,detailLevel:'MEDIUM',viewTile:'0:0:0',overview:false,intent:null,intentRevision:0,reducedMotion:false,
 explore(){const interaction=useInteractionStore.getState();interaction.clearTrace();if(interaction.focus){get().exitFocus('EXPLORE');return}set(state=>({mode:'EXPLORE',follow:true,overview:false,intent:null,intentRevision:state.intentRevision+1}))},
 home(){const interaction=useInteractionStore.getState();interaction.clearFocus();interaction.clearTrace();set(state=>({mode:'HOME',follow:false,overview:true,intent:{kind:'home'},intentRevision:state.intentRevision+1}))},
 focus(selection){if(!focusable(selection))return;const state=get();useInteractionStore.getState().setFocus(selection,state.pose,state.mode);set(current=>({mode:'FOCUS',follow:false,intent:{kind:'focus',targetId:selection.id},intentRevision:current.intentRevision+1}))},
 exitFocus(override){const interaction=useInteractionStore.getState(),saved=interaction.preFocus;interaction.clearFocus();if(!saved)return;const mode=override??(saved.mode==='FOCUS'||saved.mode==='HOME'?'EXPLORE':saved.mode);useInteractionStore.setState({trace:{...saved.trace,active:mode==='TRACE'}});set(state=>({mode,follow:override==='EXPLORE',overview:!override&&state.overview,intent:{kind:'exitFocus',pose:saved.pose,mode},intentRevision:state.intentRevision+1}))},
 enterTrace(){const interaction=useInteractionStore.getState();interaction.enterTrace();set({mode:interaction.focus?'FOCUS':'TRACE'})},
 resetRecording(follow=false){useInteractionStore.getState().resetRecording();set(state=>({mode:'EXPLORE',follow,overview:!follow,intent:{kind:'recording'},intentRevision:state.intentRevision+1}))},
 followPath(flowId){set(state=>({follow:false,overview:false,intent:{kind:'followPath',flowId},intentRevision:state.intentRevision+1}))},
 travelCluster(clusterId,recordingId,cursor){set(state=>({follow:false,overview:false,intent:{kind:'cluster',clusterId,recordingId,cursor},intentRevision:state.intentRevision+1}))},
 enableFollow(){set(state=>state.intent?.kind==='cluster'?{follow:true,overview:false,intent:null,intentRevision:state.intentRevision+1}:{follow:true,overview:false})},
 userInput(){set(state=>({follow:false,overview:false,intent:null,intentRevision:state.intentRevision+1,mode:state.mode==='HOME'?'EXPLORE':state.mode}))},
 setPose(pose){const prior=get().pose;if(Math.abs(prior.distance-pose.distance)<1e-7&&Math.abs(prior.yawDeg-pose.yawDeg)<1e-7&&Math.abs(prior.pitchDeg-pose.pitchDeg)<1e-7&&prior.target.every((value,i)=>Math.abs(value-pose.target[i])<1e-7))return;set({pose,viewTile:pose.target.map(value=>Math.floor(value/12)).join(':')})},
 requestPose(pose){set(state=>({pose,overview:false,intent:{kind:'pose',pose},intentRevision:state.intentRevision+1,follow:false}))},
 frameHero(){set(state=>({overview:false,intent:{kind:'hero'},intentRevision:state.intentRevision+1,follow:false}))},
 setDetailLevel:detailLevel=>set({detailLevel}),setReducedMotion:reducedMotion=>set({reducedMotion}),
}))
export const cameraStore=useCameraStore
