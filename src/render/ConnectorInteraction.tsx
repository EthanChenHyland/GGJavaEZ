import {useEffect,useLayoutEffect,useMemo,useRef} from 'react'
import type {PresentationPlan,PresentedCurve,SceneModel} from '../contracts/world'
import {useInteractionStore} from '../interaction/interactionStore'
import {ConnectorBatch} from './ConnectorBatch'
import {connectorHoverLabel,currentConnectorHover} from './connectorHover'
import {SurfacePortal} from '../shell/dialogs/SurfacePortal'
import {useCameraStore} from '../camera/cameraStore'
interface Context {scene:SceneModel;plan:PresentationPlan}

/** Moving pointer coordinates update only the tooltip, never the World planner. */
export function InteractiveConnectors({scene,plan,curves,onSelect}:{curves:readonly PresentedCurve[];onSelect(id:string):void}&Context){
 const hoverId=useInteractionStore(state=>currentConnectorHover(state.hover,scene,plan))
 const clear=(id?:string)=>{
  const state=useInteractionStore.getState()
  if(currentConnectorHover(state.hover,scene,plan)&&(!id||state.hover?.id===id))state.setHover(null)
 }
 useEffect(()=>()=>clear(),[scene.recordingId,scene.cursor,plan.revision])
 useEffect(()=>useCameraStore.subscribe((next,prior)=>{
  if(next.pose!==prior.pose||next.intentRevision!==prior.intentRevision)clear()
 }),[scene.recordingId,scene.cursor,plan.revision])
 return <ConnectorBatch curves={curves} onSelect={onSelect} hoverId={hoverId} onHover={(id,pointer)=>{
  if(!id||!pointer){clear();return}
  const state=useInteractionStore.getState()
  if(currentConnectorHover(state.hover,scene,plan)!==id&&!connectorHoverLabel(scene,plan,id)){clear();return}
  const curve=plan.curves.find(curve=>curve.id===id)??plan.bundles.find(curve=>curve.id===id)
  state.setHover({kind:curve?.kind==='connector'||curve?.kind==='binding-history'?'connector':'flow',id,pointer,presentation:{recordingId:scene.recordingId,cursor:scene.cursor,revision:plan.revision}})
 }}/>
}
export function ConnectorTooltip({scene,plan}:Context){
 const hover=useInteractionStore(state=>state.hover),id=currentConnectorHover(hover,scene,plan)
 const label=useMemo(()=>id?connectorHoverLabel(scene,plan,id):null,[scene,plan,id]),tip=useRef<HTMLDivElement>(null)
 useLayoutEffect(()=>{
  const element=tip.current;if(!element||!hover?.pointer)return
  const rect=element.getBoundingClientRect()
  element.style.left=`${Math.max(8,Math.min(hover.pointer[0]+12,window.innerWidth-rect.width-8))}px`
  element.style.top=`${Math.max(8,Math.min(hover.pointer[1]+12,window.innerHeight-rect.height-8))}px`
 },[label,hover?.pointer])
 if(!id||!label||!hover?.pointer)return null
 const width=typeof window==='undefined'?1440:window.innerWidth,height=typeof window==='undefined'?900:window.innerHeight
 return <SurfacePortal><div ref={tip} role="tooltip" data-connector-tooltip={id} className="shell-command-tooltip glass" style={{left:Math.max(8,Math.min(hover.pointer[0]+12,width-368)),top:Math.max(8,Math.min(hover.pointer[1]+12,height-100)),maxWidth:Math.min(352,width-16)}}>{label}</div></SurfacePortal>
}
