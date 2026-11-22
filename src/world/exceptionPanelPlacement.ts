import type {SceneModel,PresentationPlan,WorldAnchor} from '../contracts/world'
import {buildExceptionPanelModel,layoutExceptionPanel} from '../render/exceptionPanelModel'
import {forensicPhaseAtCursor} from './forensicPresentation'

/** Structural evidence stays on the Stack side of the recorded invocation.
 * This never reserves, moves or creates a runtime identity. */
export function exceptionPanelFor(scene:SceneModel):PresentationPlan['exceptionPanel']{
 const content=scene.exception,phase=forensicPhaseAtCursor(scene)
 if(!content||!phase)return null
 const size=layoutExceptionPanel(buildExceptionPanelModel(content,scene.recording.state)).size
 const frameId=phase==='uncaught'?content.throwFrameId:content.current?.frameId
 const frame=scene.entities[frameId??''],origin=scene.entities[content.throwFrameId??'']
 const anchor=frame?.kind==='frame'?frame.anchor:origin?.kind==='frame'?origin.anchor:undefined
 const position=anchor?[anchor.position[0]-anchor.size[0]/2-.8-size[0]/2,anchor.position[1],anchor.position[2]+anchor.size[2]/2-size[2]/2] as const:[-5,0,0] as const
 return{position,content}
}
export function exceptionPanelAnchor(panel:NonNullable<PresentationPlan['exceptionPanel']>,recording:Pick<SceneModel['recording'],'state'>):WorldAnchor{
 const size=layoutExceptionPanel(buildExceptionPanelModel(panel.content,recording.state)).size
 return{entityId:'structural:exception-panel',region:'stack',position:panel.position,size,ports:{},bodyPort:panel.position}
}
