import type {SceneModel,PresentationPlan,WorldAnchor} from '../contracts/world'
import {buildExceptionPanelModel,layoutExceptionPanel} from '../render/exceptionPanelModel'
/** Structural evidence beside the actual throwing frame, away from +X heap.
 * This never reserves, moves or creates a runtime identity. */
export function exceptionPanelFor(scene:SceneModel):PresentationPlan['exceptionPanel']{
 const content=scene.exception
 if(!content?.uncaught||scene.cursor!==scene.liveHead)return null
 const size=layoutExceptionPanel(buildExceptionPanelModel(content,scene.recording.state)).size
 const frame=content.throwFrameId?scene.entities[content.throwFrameId]:null
 const anchor=frame?.kind==='frame'?frame.anchor:Object.values(scene.entities).find(node=>node.kind==='frame')?.anchor
 const position=anchor?[anchor.position[0]-anchor.size[0]/2-.8-size[0]/2,anchor.position[1],anchor.position[2]+anchor.size[2]/2-size[2]/2] as const:[-5,0,0] as const
 return{position,content}
}
export function exceptionPanelAnchor(panel:NonNullable<PresentationPlan['exceptionPanel']>,recording:Pick<SceneModel['recording'],'state'>):WorldAnchor{
 const size=layoutExceptionPanel(buildExceptionPanelModel(panel.content,recording.state)).size
 return{entityId:'structural:exception-panel',region:'stack',position:panel.position,size,ports:{},bodyPort:panel.position}
}
