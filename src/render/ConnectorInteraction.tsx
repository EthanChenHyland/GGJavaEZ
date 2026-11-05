import {useEffect,useLayoutEffect,useMemo,useRef} from 'react'
import type {PresentedCurve} from '../contracts/world'
import type {WorldRenderSnapshot} from './worldRenderSnapshot'
import {useInteractionStore} from '../interaction/interactionStore'
import {ConnectorBatch} from './ConnectorBatch'
import {connectorHoverLabel,currentConnectorHover} from './connectorHover'
import {SurfacePortal} from '../shell/dialogs/SurfacePortal'
import {useCameraStore} from '../camera/cameraStore'
import {referenceChipPorts} from './referenceChipPorts'

/** Moving pointer coordinates update only the tooltip, never the World planner. */
export function InteractiveConnectors({snapshot,curves,onSelect}:{snapshot:WorldRenderSnapshot;curves:readonly PresentedCurve[];onSelect(id:string):void}){
 const { scene, plan } = snapshot.read()
 const hoverId=useInteractionStore(state=>currentConnectorHover(state.hover,scene,plan))
 const ports=useMemo(()=>referenceChipPorts(scene,plan),[scene,plan])
 const clear=(id?:string)=>{
  const state=useInteractionStore.getState()
  if(currentConnectorHover(state.hover,scene,plan)&&(!id||state.hover?.id===id))state.setHover(null)
 }
 useEffect(()=>()=>clear(),[scene.recordingId,scene.cursor,plan.revision])
 useEffect(()=>useCameraStore.subscribe((next,prior)=>{
  if(next.pose!==prior.pose||next.intentRevision!==prior.intentRevision)clear()
 }),[scene.recordingId,scene.cursor,plan.revision])
 return <ConnectorBatch curves={curves} referencePorts={ports} onSelect={onSelect} hoverId={hoverId} onHover={(id,pointer)=>{
  if(!id||!pointer){clear();return}
  const state=useInteractionStore.getState()
  if(currentConnectorHover(state.hover,scene,plan)!==id&&!connectorHoverLabel(scene,plan,id)){clear();return}
  const curve=plan.curves.find(curve=>curve.id===id)??plan.bundles.find(curve=>curve.id===id)
  state.setHover({kind:curve?.kind==='connector'||curve?.kind==='binding-history'?'connector':'flow',id,pointer,presentation:{recordingId:scene.recordingId,cursor:scene.cursor,revision:plan.revision}})
 }}/>
}
export function ConnectorTooltip({snapshot}:{snapshot:WorldRenderSnapshot}){
 const { scene, plan } = snapshot.read()
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
