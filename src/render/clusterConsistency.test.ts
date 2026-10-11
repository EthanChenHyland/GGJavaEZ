import {expect,it} from 'vitest'
import {generateRawTrace} from '../testing/traceGen'
import {normalizeTrace} from '../instrumentation/normalize'
import {seek} from '../runtime'
import {createLayoutEngine} from '../world/layoutEngine'
import {createSceneProjector} from '../world/sceneProjector'
import {planPresentation} from '../world/presentationPlanner'
import {clusterAnchor} from '../world/clusterAnchor'
import {buildSolidBatch} from './SolidBatch'
import {clusterLabelParts} from './ClusterLabels'
import {color} from '../theme/tokens'

it('routes and draws every collapsed body through the same port-free bounds and semantic material',()=>{
 const raw=generateRawTrace({seed:121,rawEvents:180,maxDepth:8,classes:8,callRate:.6,allocateRate:.7})
 const trace=normalizeTrace(raw.rawEvents,raw.manifest,{status:'complete',exitCode:0,diagnostic:null}).trace,layout=createLayoutEngine();layout.append(trace.events)
 const scene=createSceneProjector(trace).project(seek(trace,trace.events.length),layout.state,{sessionEnded:true,pausedAtLiveHead:false,liveHead:trace.events.length,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}})
 const plan=planPresentation({scene,layout:layout.state,detailLevel:'FAR',selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}}),before=JSON.stringify(scene),solids=buildSolidBatch(scene,plan)
 expect(plan.clusters.length).toBeGreaterThan(0)
 for(const cluster of plan.clusters){
  const body=solids.filter(solid=>solid.role!=='face'&&solid.pick.id===cluster.id),plate=solids.filter(solid=>solid.role==='face'&&solid.pick.id===cluster.id)
  expect(body).toHaveLength(1);expect(plate).toHaveLength(1)
  const role=cluster.anchor.region==='stack'?'stack':cluster.anchor.region==='class'?'class':'heap'
  expect(body[0]).toMatchObject({anchor:cluster.anchor,pick:{kind:'cluster',id:cluster.id},role,tint:color[role].core,edge:color[role].edge})
  expect(plate[0].tint).toBe(color[role].face)
  expect(cluster.anchor.bodyPort[2]).toBe(cluster.anchor.position[2]+cluster.anchor.size[2]/2)
  expect(cluster.anchor.ports).toEqual({})
 }
 expect(JSON.stringify(scene)).toBe(before)
 const selectedCluster=plan.clusters[0],selected=planPresentation({scene,layout:layout.state,detailLevel:'FAR',selection:{kind:'cluster',id:selectedCluster.id},focusTargetId:null,trace:{active:false,scope:'relevant'}},plan)
 expect(selected.clusters.filter(cluster=>cluster.selected).map(cluster=>cluster.id)).toEqual([selectedCluster.id])
 expect(selected.clusters.map(cluster=>[cluster.id,cluster.memberIds,cluster.anchor])).toEqual(plan.clusters.map(cluster=>[cluster.id,cluster.memberIds,cluster.anchor]))
 expect(buildSolidBatch(scene,selected).find(solid=>solid.role!=='face'&&solid.pick.id===selectedCluster.id)?.edge).toBe(color.semantic.execution)
})
it('abbreviates the grouping key without truncating the exact count and discards inherited row ports',()=>{
 const representative={entityId:'captured',region:'heap' as const,position:[9,-3,4] as const,size:[5.2,8,2.3] as const,ports:{'captured:field':[9,-2,5.15] as const},bodyPort:[9,-3,5.15] as const}
 const before=JSON.stringify(representative),anchor=clusterAnchor('cluster:type',representative),parts=clusterLabelParts({label:'VeryLongCapturedBinaryClassName$Nested',members:1842,anchor})
 expect(anchor.position).toEqual(representative.position);expect(anchor.ports).toEqual({})
 expect(parts.count).toBe('×1842');expect(parts.fits).toBe(true);expect(parts.key).toContain('…')
 expect(JSON.stringify(representative)).toBe(before)
})
