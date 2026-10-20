import { expect, it } from 'vitest'
import fc from 'fast-check'
import { loadPersonTrace, loadArrayTrace } from '../examples/traces'
import { seek } from '../runtime'
import { historyForTrace } from '../runtime/history'
import { createLayoutEngine } from '../world/layoutEngine'
import { createSceneProjector } from '../world/sceneProjector'
import { planPresentation } from '../world/presentationPlanner'
import { createVirtualClock } from './clock'
import { createTransitionPlayer, type AnimationStep } from './transitionPlayer'
import { motionCurve, motionSubjects, overlayEmphasis } from './overlayGeometry'
import type { TraceDocument } from '../contracts/runtime'

function view(trace: TraceDocument, cursor: number) {
  const layout = createLayoutEngine(); layout.append(trace.events)
  const scene = createSceneProjector(trace).project(seek(trace, cursor), layout.state, { sessionEnded: false, pausedAtLiveHead: false, liveHead: trace.events.length, recording: { state: 'FULL', reason: null, budget: null, lastRecordedSeq: null, executionContinued: false } })
  const plan = planPresentation({ scene, layout: layout.state, detailLevel: 'CLOSE', selection: null, focusTargetId: null, trace: { active: false, scope: 'relevant' } })
  return { scene, plan }
}
function step(trace: TraceDocument, cursor: number): AnimationStep {
  const clock = createVirtualClock(), player = createTransitionPlayer({ trace, history: historyForTrace(trace) }, clock)
  player.cursorChanged({ from: cursor - 1, to: cursor, reason: 'play', speed: 1, reducedMotion: false })
  const overlay = player.sample(clock.now(), () => true).overlays[0]
  if (!overlay) throw new Error('Expected an actual recorded step')
  return overlay.step
}
it('allocation outline scales .92→1 without changing any canonical body, port or face anchor (100 runs)', () => {
  const trace = loadPersonTrace(), allocation = step(trace, 9), { scene, plan } = view(trace, 9)
  const before = JSON.stringify(scene), subjects = motionSubjects(scene, plan)
  expect(overlayEmphasis({ step: allocation, progress: 0, static: false }).scale).toBe(.92)
  expect(overlayEmphasis({ step: allocation, progress: 1, static: false })).toEqual({ scale: 1, alpha: 0 })
  expect(subjects.get(allocation.subjects[0])?.anchor).toBe(scene.entities[allocation.subjects[0]].anchor)
  fc.assert(fc.property(fc.double({ min: 0, max: 1, noNaN: true }), progress => {
    const emphasis = overlayEmphasis({ step: allocation, progress, static: false })
    expect(emphasis.scale).toBeGreaterThanOrEqual(.92); expect(emphasis.scale).toBeLessThanOrEqual(1)
    expect(emphasis.alpha).toBeGreaterThanOrEqual(0); expect(emphasis.alpha).toBeLessThanOrEqual(.68)
    expect(overlayEmphasis({ step: allocation, progress, static: true })).toEqual({ scale: 1, alpha: .55 })
    expect(JSON.stringify(scene)).toBe(before)
  }), { numRuns: 100 })
})
it('uses the canonical visible slot/cell bounds and excludes quiet or absent subjects', () => {
  const trace = loadPersonTrace(), { scene, plan } = view(trace, 18)
  const subjects = motionSubjects(scene, plan)
  const object = scene.entities['object:person:17']
  if (object.kind !== 'object') throw new Error('Expected captured object')
  const age = object.groups.flatMap(group => group.rows).find(row => row.name === 'age')!
  expect(subjects.get(age.slotId)?.anchor.position[1]).toBe(object.anchor.ports[age.slotId][1])
  expect(subjects.has('absent-subject')).toBe(false)
  const entities = new Map(plan.entities), previous = entities.get(object.id)!
  entities.set(object.id, { ...previous, mode: 'quiet' })
  expect(motionSubjects(scene, { ...plan, entities }).has(object.id)).toBe(false)
  expect(motionSubjects(scene, { ...plan, entities }).has(age.slotId)).toBe(false)
  const array = view(loadArrayTrace(), 10), mapped = motionSubjects(array.scene, array.plan)
  expect(array.plan.cellWindows.size).toBeGreaterThan(0)
  for (const window of array.plan.cellWindows.values()) for (const [id, cell] of window.mapping) expect(mapped.get(id)?.anchor).toBe(cell.anchor)
})
it('travels only on the exact currently presented reference or graph-edge curve identity', () => {
  const trace = loadPersonTrace(), reference = step(trace, 14), { scene, plan } = view(trace, 14)
  const curves = new Map(plan.curves.map(curve => [curve.id, curve]))
  const subjects = motionSubjects(scene, plan)
  const recorded = scene.references.find(item => item.sourceSlotId === reference.transition.from?.id && item.targetId === reference.transition.to?.id)!
  expect(recorded).toBeDefined()
  expect(motionCurve(reference, subjects, curves)?.id).toBe(recorded.id)
  expect(motionCurve({ ...reference, flowId: 'absent-recorded-edge' }, subjects, curves)).toBeUndefined()
  expect(motionCurve({ ...reference, transition: { ...reference.transition, to: { kind: 'object', id: 'other-identity' } } }, subjects, curves)).toBeUndefined()
  expect(motionCurve(reference, subjects, new Map())).toBeUndefined()
})

it('scoped face motion outlines coincide with the actual whole-row geometry throughout captured replay',async()=>{
 const {loadControlTrace}=await import('../examples/traces'),{buildSolidBatch}=await import('../render/SolidBatch')
 const trace=loadControlTrace();let compared=0
 for(let cursor=1;cursor<=trace.events.length;cursor++){
  const {scene,plan}=view(trace,cursor)
  if(!Object.values(scene.entities).some(node=>node.kind==='frame'&&node.scopeDividers?.length))continue
  const subjects=motionSubjects(scene,plan)
  for(const solid of buildSolidBatch(scene,plan).filter(solid=>solid.role==='face'&&solid.pick.kind==='slot'&&!solid.part)){
   expect(subjects.get(solid.pick.id)?.anchor.position).toEqual(solid.anchor.position)
   expect(subjects.get(solid.pick.id)?.anchor.size).toEqual(solid.anchor.size);compared++
  }
 }
 expect(compared).toBeGreaterThan(0)
})
it('a captured late row outside permanent ports receives motion emphasis on its real promoted chip',async()=>{
 const {projectTrace}=await import('../testing/projectTrace'),{buildSolidBatch}=await import('../render/SolidBatch')
 const payloads=[{type:'PROGRAM_START'},{type:'ENTER_METHOD',frameId:'f',callerFrameId:null,className:'Unit',methodName:'run',locals:[]},...Array.from({length:20},(_,i)=>({type:'DECLARE_LOCAL',frameId:'f',slot:{id:`late/${i}`,name:`v${i}`,javaType:'int',value:{kind:'primitive',javaType:'int',value:i}}}))]
 const trace:TraceDocument={schemaVersion:2,demoId:'late-motion-unit',sourceFiles:[],events:payloads.map((event,seq)=>({...event,seq,eventId:`late-motion/${seq}`,source:null,label:'Recorded local',importance:'normal'})) as TraceDocument['events']}
 const projection=projectTrace(trace),scene=projection.project(trace.events.length),plan=planPresentation({scene,layout:projection.layout,detailLevel:'CLOSE',selection:{kind:'slot',id:'late/19'},focusTargetId:null,trace:{active:false,scope:'relevant'}})
 expect(scene.entities.f.anchor.ports['late/19']).toBeUndefined()
 const plate=buildSolidBatch(scene,plan).find(solid=>solid.pick.id==='late/19')!
 expect(plate).toBeDefined();expect(motionSubjects(scene,plan).get('late/19')?.anchor).toEqual(plate.anchor)
})
it('Map key and value motion outlines retain their separate actual half-entry plates',async()=>{
 const {projectTrace}=await import('../testing/projectTrace'),{buildSolidBatch}=await import('../render/SolidBatch')
 const reference={kind:'reference',javaType:'Unit',objectId:'target'}
 const payloads=[{type:'PROGRAM_START'},{type:'ALLOCATE_OBJECT',objectId:'map',displayId:1,className:'java.util.HashMap',fields:[]},{type:'ALLOCATE_OBJECT',objectId:'target',displayId:2,className:'Unit',fields:[]},{type:'OBJECT_OBSERVE',objectId:'map',library:{kind:'MAP',size:2,entries:[{key:reference,value:reference},{key:reference,value:reference}]}}]
 const trace:TraceDocument={schemaVersion:2,demoId:'map-motion-unit',sourceFiles:[{fileId:'Unit.java',name:'Unit.java',content:'// explicit unit records'}],events:payloads.map((event,seq)=>({...event,seq,eventId:`map-motion/${seq}`,source:{fileId:'Unit.java',line:1},label:'Recorded map',importance:'normal'})) as TraceDocument['events']}
 const projection=projectTrace(trace),scene=projection.project(trace.events.length),plan=planPresentation({scene,layout:projection.layout,detailLevel:'CLOSE',selection:{kind:'object',id:'map'},focusTargetId:null,trace:{active:false,scope:'relevant'}}),node=scene.entities.map
 if(node.kind!=='collection')throw new Error('Expected recorded Map')
 expect(node.entries).toHaveLength(2)
 const subjects=motionSubjects(scene,plan),solids=buildSolidBatch(scene,plan)
 for(const entry of node.entries){
  const key=solids.find(solid=>solid.pick.id===entry.keySlotId)!,value=solids.find(solid=>solid.pick.id===entry.slotId)!
  expect(key.anchor.position[0]).toBeLessThan(value.anchor.position[0])
  expect(subjects.get(entry.keySlotId!)?.anchor).toEqual(key.anchor);expect(subjects.get(entry.slotId)?.anchor).toEqual(value.anchor)
 }
})
