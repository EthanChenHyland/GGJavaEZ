import { expect, it } from 'vitest'
import fc from 'fast-check'
import { loadPersonTrace, loadArrayTrace } from '../examples/traces'
import { seek } from '../runtime'
import { historyForTrace } from '../runtime/history'
import { createLayoutEngine } from '../world/layoutEngine'
import { createSceneProjector } from '../world/sceneProjector'
import { planPresentation } from '../world/presentationPlanner'
import { createFlowCatalog } from '../world/flowCatalog'
import { createVirtualClock } from './clock'
import { createTransitionPlayer, type AnimationStep } from './transitionPlayer'
import { motionCurve, motionMarks, motionSubjects, motionTravel, visitMotionMark, visitMotionTravel } from './overlayGeometry'
import type { TraceDocument } from '../contracts/runtime'
import type { Vec3 } from '../contracts/world'
import type { RawRuntimeEvent } from '../instrumentation/contracts'
import { normalizeTrace } from '../instrumentation/normalize'

function view(trace: TraceDocument, cursor: number) {
  const layout = createLayoutEngine(); layout.append(trace.events)
  const state = seek(trace, cursor)
  const scene = createSceneProjector(trace).project(state, layout.state, { sessionEnded: false, pausedAtLiveHead: false, liveHead: trace.events.length, recording: { state: 'FULL', reason: null, budget: null, lastRecordedSeq: null, executionContinued: false } })
  const flows = state.executionGraph ? createFlowCatalog() : undefined
  if (state.executionGraph) flows!.extend(state.executionGraph, trace)
  const plan = planPresentation({ scene, layout: layout.state, flows, detailLevel: 'CLOSE', selection: null, focusTargetId: null, trace: { active: false, scope: 'relevant' } })
  return { scene, plan }
}
function step(trace: TraceDocument, cursor: number): AnimationStep {
  const clock = createVirtualClock(), player = createTransitionPlayer({ trace, history: historyForTrace(trace) }, clock)
  player.cursorChanged({ from: cursor - 1, to: cursor, reason: 'play', speed: 1, reducedMotion: false })
  const overlay = player.sample(clock.now(), () => true).overlays[0]
  if (!overlay) throw new Error('Expected an actual recorded step')
  return overlay.step
}
it('allocation reveals a bounded volume around the canonical anchor without changing it (100 runs)', () => {
  const trace = loadPersonTrace(), allocation = step(trace, 9), { scene, plan } = view(trace, 9)
  const before = JSON.stringify(scene), subjects = motionSubjects(scene, plan)
  const anchor = subjects.get(allocation.subjects[0])!.anchor
  expect(anchor).toBe(scene.entities[allocation.subjects[0]].anchor)
  const planes = (progress: number) => {
    const depths = new Set<number>()
    const mark = motionMarks({ step: allocation, progress, static: false })[0]
    visitMotionMark(anchor, mark, (a, b) => { depths.add(a[2]); depths.add(b[2]) })
    return depths
  }
  expect(planes(0).size).toBe(1)
  expect(planes(.72).size).toBe(2)
  fc.assert(fc.property(fc.double({ min: 0, max: 1, noNaN: true }), progress => {
    const [mark] = motionMarks({ step: allocation, progress, static: false })
    expect(mark.opacity).toBeGreaterThanOrEqual(0)
    expect(mark.opacity).toBeLessThanOrEqual(1)
    expect(motionMarks({ step: allocation, progress, static: true })[0]).toMatchObject({ progress: 1, opacity: .76 })
    expect(JSON.stringify(scene)).toBe(before)
  }), { numRuns: 100 })
})

it('distinguishes frame arrival, receiver, array change, return and exception cues at the same anchor', () => {
  const { scene } = view(loadPersonTrace(), 9)
  const stepFact = step(loadPersonTrace(), 9)
  const point = { kind: 'object' as const, id: stepFact.subjects[0] }, anchor = scene.entities[point.id].anchor
  const kinds = ['entry', 'allocation', 'receiver', 'field-write', 'array-write', 'return', 'throw', 'unwind', 'catch'] as const
  const distinct = new Set<string>()
  for (const kind of kinds) {
    const frame = { step: { ...stepFact, kind, transition: { ...stepFact.transition, from: point, to: { ...point, id: 'target' } } },
      progress: .43, static: false }
    const segments: [Vec3, Vec3][] = []
    for (const mark of motionMarks(frame)) visitMotionMark(anchor, mark, (a, b) => segments.push([a, b]))
    expect(segments.length).toBeLessThanOrEqual(24)
    expect(segments.flat(2).every(Number.isFinite)).toBe(true)
    distinct.add(JSON.stringify(segments))
    expect(motionTravel({ ...frame, static: true })).toBeNull()
    expect(motionMarks({ ...frame, static: true }).every(mark => mark.progress === 1)).toBe(true)
  }
  expect(distinct.size).toBe(kinds.length)
})

it('clips forward and reverse travel to the actual polyline without drawing shortcuts', () => {
  const points: Vec3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]]
  const visit = (reverse: boolean) => {
    const result: [Vec3, Vec3][] = []
    expect(visitMotionTravel(points, { start: 0, end: .5 }, reverse, (a, b) => result.push([a, b]))).toBe(true)
    return result
  }
  expect(visit(false)).toEqual([[points[0], points[1]], [points[1], [1, .5, 0]]])
  expect(visit(true)).toEqual([[[1, .5, 0], points[2]], [points[2], points[3]]])
  expect(visitMotionTravel(Array.from({ length: 130 }, () => points[0]), { start: 0, end: 1 }, false,
    () => { throw new Error('The route is outside the overlay budget') })).toBe(false)
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

it('matches the projected call ID and marks both ends of a proved return at its consuming prefix', () => {
  const caller = { v: 1, provenanceVersion: 1, coverageVersion: 1, threadId: '1', frameId: 'caller', className: 'Probe', methodName: 'main', descriptor: '()V', line: 1, site: 0 } as const
  const child = { ...caller, frameId: 'child', methodName: 'value', descriptor: '()I' } as const
  const value = { kind: 'int', value: 7 } as const
  const events: RawRuntimeEvent[] = [
    { ...caller, type: 'enter', seq: 0, callerFrameId: null, receiver: null, parameters: [] },
    { ...caller, type: 'call', seq: 1, callId: 'recorded-call', invokeKind: 'static', owner: 'Probe',
      name: 'value', callDescriptor: '()I', receiver: null, arguments: [], argumentOrigins: [], receiverOrigin: { kind: 'unknown' } },
    { ...child, type: 'enter', seq: 2, callerFrameId: 'caller', callId: 'recorded-call', receiver: null, parameters: [] },
    { ...child, type: 'return', seq: 3, value, origin: { kind: 'constant', value } },
    { ...child, type: 'exit', seq: 4 },
    { ...caller, type: 'call_return', seq: 5, callId: 'recorded-call', value },
    { ...caller, type: 'local', seq: 6, site: 1, slot: 2, name: 'result', descriptor: 'I', liveRange: '2:0:999', value, origin: { kind: 'call_result', site: 0 } },
    { ...caller, type: 'exit', seq: 7 },
  ]
  const trace = normalizeTrace(events, { sources: [], classes: [] }, { status: 'complete', exitCode: 0, diagnostic: null }).trace
  const entry = trace.events.find(event => event.type === 'EXECUTION_FACT' && event.fact.kind === 'enter' && event.fact.callId)!
  const entryView = view(trace, entry.seq + 1)
  const entered = step(trace, entry.seq + 1)
  expect(entered.kind).toBe('entry')
  expect(entered.transition.routeId).toBe(entryView.scene.callLinks[0].id)
  expect(motionCurve(entered, motionSubjects(entryView.scene, entryView.plan), new Map(entryView.plan.curves.map(curve => [curve.id, curve]))))
    .toMatchObject({ id: entryView.scene.callLinks[0].id, kind: 'call' })

  const write = trace.events.find(event => event.type === 'EXECUTION_FACT' && event.fact.kind === 'write' && event.fact.origin.kind === 'call_result')!
  const destinationView = view(trace, write.seq + 1)
  const returned = step(trace, write.seq + 1), subjects = motionSubjects(destinationView.scene, destinationView.plan)
  const curve = motionCurve(returned, subjects, new Map(destinationView.plan.curves.map(line => [line.id, line])))!
  expect(curve).toMatchObject({ id: destinationView.scene.returnFlows[0].id, kind: 'return' })
  const source = subjects.get(returned.transition.from!.id)
  expect(source).toMatchObject({ id: returned.transition.from!.id, anchor: { position: curve.points[0] } })
  expect(subjects.get(returned.transition.to!.id)).toBeDefined()
  expect(motionMarks({ step: returned, progress: .4, static: false }).map(mark => mark.id))
    .toEqual([source!.id, returned.transition.to!.id])
  expect(motionSubjects(destinationView.scene, { ...destinationView.plan, curves: [] }).has(returned.transition.from!.id)).toBe(false)
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
