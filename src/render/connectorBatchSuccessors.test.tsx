// Current batch/route/material successors. The inert host exercises actual
// React hook cleanup without a browser, GPU or a second renderer implementation.
import {createContext,type ReactNode} from 'react'
import Reconciler from '@react-three/fiber/react-reconciler/index.js'
import {BoxGeometry,InstancedMesh,Matrix4,Object3D,PerspectiveCamera,Raycaster,Vector2,Vector3,type InstancedBufferAttribute,type Intersection,type Material} from 'three'
import {LineSegments2} from 'three/addons/lines/LineSegments2.js'
import type {LineMaterial} from 'three/addons/lines/LineMaterial.js'
import {afterEach,expect,it,vi} from 'vitest'
import type {PresentedBundle,PresentedCurve,Vec3} from '../contracts/world'
const state=vi.hoisted(()=>({size:{width:1440,height:900}}))
vi.mock('@react-three/fiber',()=>({useThree:()=>state}))
import {ConnectorBatch} from './ConnectorBatch'
import {createConnectorRouter} from '../world/connectorRouter'
import {prioritizeConnectorIntersections,type ConnectorPickData} from './geometry/connectorRaycast'
const ownedGeometry=new Set<BoxGeometry>()
const curve=(id='ref/a',options:Partial<PresentedCurve>={}):PresentedCurve=>({id,kind:'connector',points:[[-3,1,.8],[0,2,1.2],[4,-2,.9]],colorRole:'reference',opacity:1,widthPx:2.5,arrow:false,...options})
// Use Fiber's already installed React reconciler with inert host nodes. This
// exercises real hook/effect lifetimes in Node without a DOM, canvas or GPU.
type HostNode = { children: HostNode[]; visible: boolean; props?:Record<string,unknown>; publicInstance?:InstancedMesh }
const context = {}
let priority = 0
const append = (parent: HostNode, child: HostNode) => { parent.children.push(child) }
const remove = (parent: HostNode, child: HostNode) => { parent.children = parent.children.filter(node => node !== child) }
const insert = (parent: HostNode, child: HostNode, before: HostNode) => { parent.children.splice(parent.children.indexOf(before), 0, child) }
const reconciler = Reconciler({
  supportsMutation: true, supportsPersistence: false, supportsHydration: false, isPrimaryRenderer: false,
  createInstance: (type:string,props:Record<string,unknown>) => {
    const node:HostNode={children:[],visible:true,props};
    if(type==='instancedMesh'){const geometry=new BoxGeometry();ownedGeometry.add(geometry);node.publicInstance=new InstancedMesh(geometry,props.material as Material,(props.args as unknown[])[2] as number)}
    return node
  }, createTextInstance: () => ({ children: [], visible: true }),
  appendInitialChild: append, appendChild: append, appendChildToContainer: append,
  removeChild: remove, removeChildFromContainer: remove, insertBefore: insert, insertInContainerBefore: insert,
  getRootHostContext: () => context, getChildHostContext: () => context, getPublicInstance: (node: HostNode) => node.publicInstance??node,
  prepareForCommit: () => null, resetAfterCommit: () => {}, finalizeInitialChildren: () => false,
  commitUpdate: (node:HostNode,_type:string,_old:unknown,props:Record<string,unknown>) => {node.props=props}, commitTextUpdate: () => {}, shouldSetTextContent: () => false,
  clearContainer: (node: HostNode) => { node.children = [] }, detachDeletedInstance: () => {},
  supportsMicrotasks: true, scheduleMicrotask: queueMicrotask, scheduleTimeout: setTimeout, cancelTimeout: clearTimeout, noTimeout: -1,
  setCurrentUpdatePriority: (next: number) => { priority = next }, getCurrentUpdatePriority: () => priority,
  resolveUpdatePriority: () => priority || 32, trackSchedulerEvent: () => {},
  resolveEventType: () => null, resolveEventTimeStamp: () => -1.1, shouldAttemptEagerTransition: () => false,
  maySuspendCommit: () => false, preloadInstance: () => true, startSuspendingCommit: () => {},
  suspendInstance: () => {}, waitForCommitToBeReady: () => null,
  NotPendingTransition: null, HostTransitionContext: createContext(null),
} as unknown as Parameters<typeof Reconciler>[0])
const mounted = new Set<() => void>()
function render(element: ReactNode) {
  const onError = (error: Error) => { throw error }
  const container:HostNode={children:[],visible:true}
  const root = reconciler.createContainer(container, 1, null, false, null, '', onError, onError, onError, () => {})
  const update = (next: ReactNode) => {
    reconciler.updateContainerSync(next, root, null, null)
    reconciler.flushSyncWork()
    reconciler.flushPassiveEffects()
  }
  const unmount = () => { update(null); mounted.delete(unmount) }
  mounted.add(unmount)
  update(element)
  return { rerender: update, unmount, nodes:()=>{const result:HostNode[]=[];const visit=(node:HostNode)=>{result.push(node);node.children.forEach(visit)};visit(container);return result} }
}

const lines=(view:ReturnType<typeof render>)=>view.nodes().filter(node=>node.props?.object instanceof LineSegments2)
const line=(node:HostNode)=>node.props!.object as LineSegments2
const core=(view:ReturnType<typeof render>,width=2.5)=>lines(view).find(node=>(line(node).material as LineMaterial).linewidth===width)!
const coordinates=(object:LineSegments2,name:string,index:number)=>{const attribute=object.geometry.getAttribute(name);return[attribute.getX(index),attribute.getY(index),attribute.getZ(index)]}
// Uploaded vertices/camera from the failed narrow native hover case. Replaying
// these floats is a geometry regression, not another JVM execution.
const overlappingCurves=()=>[
 curve('field',{points:[[19.020000457763672,-7.514999866485596,1.3109999895095825],[13.420000076293945,-7.514999866485596,1.3109999895095825]]}),
 curve('collection',{points:[[18.579999923706055,-7.514999866485596,1.3109999895095825],[13.420000076293945,-7.514999866485596,1.3109999895095825]]}),
 curve('flow',{points:[[13.420000076293945,-7.514999866485596,1.3109999895095825],[19.020000457763672,-7.514999866485596,1.3109999895095825]]}),
]
function capturedRay(round:(value:number)=>number=value=>value){
 const camera=new PerspectiveCamera(36,760/900,.05,10000)
 camera.position.set(19.122464809195577,6.728075653715443,55.460111901115994)
 camera.lookAt(11.217859974553944,-6.384528773053349,-.7840740067049234);camera.updateMatrixWorld()
 const ray=new Raycaster();ray.setFromCamera(new Vector2(2*round(516.9528115672443)/760-1,1-2*round(493.53108117343805)/900),camera)
 return ray
}
const hitOwner=(hit:Intersection)=>{const data=hit.object.userData.runtimeConnectorPick as ConnectorPickData;return data.ids[hit.faceIndex??-1]}
afterEach(()=>{for(const unmount of mounted)unmount();for(const geometry of ownedGeometry)geometry.dispose();ownedGeometry.clear();vi.restoreAllMocks()})
it('keeps coincident core and halo owners stable when browser pointer coordinates round',()=>{
 state.size={width:760,height:900}
 try{
  const view=render(<ConnectorBatch curves={overlappingCurves()} onSelect={()=>{}}/>)
  for(const node of lines(view))for(const round of[(value:number)=>value,Math.round,Math.floor,Math.ceil]){
   const object=line(node);object.updateMatrixWorld()
   const ray=capturedRay(round),raw:Intersection[]=[]
   LineSegments2.prototype.raycast.call(object,ray,raw)
   expect(raw).toHaveLength(3)
   const hits=ray.intersectObject(object,false)
   expect(hits).toHaveLength(1);expect(hitOwner(hits[0])).toBe('field')
   const original=raw.find(hit=>hit.faceIndex===hits[0].faceIndex)!
   expect(hits[0].distance).toBe(original.distance);expect(hits[0].point).toEqual(original.point)
  }
 }finally{state.size={width:1440,height:900}}
})
it('uses supplied curve order across emphasis bands without selecting through a halo',()=>{
 state.size={width:760,height:900}
 try{
  for(const reverse of[false,true]){
   const input=overlappingCurves();input[1]={...input[1],widthPx:3.5};if(reverse)input.reverse()
   const view=render(<ConnectorBatch curves={input} onSelect={()=>{}}/>),objects=lines(view).map(line)
   objects.forEach(object=>object.updateMatrixWorld())
   for(const round of[(value:number)=>value,Math.round,Math.floor,Math.ceil]){
    const hits=capturedRay(round).intersectObjects(objects,false)
    const ordered=prioritizeConnectorIntersections(hits)
    const coreHit=ordered.find(hit=>(hit.object as LineSegments2).material.linewidth!==8)!
    const haloHit=ordered.find(hit=>(hit.object as LineSegments2).material.linewidth===8)!
    expect(hitOwner(coreHit)).toBe(input[0].id);expect(hitOwner(haloHit)).toBe(input[0].id)
    expect(ordered[0]).toBe(coreHit)
    expect(lines(view).find(node=>line(node)===haloHit.object)!.props!.onClick).toBeUndefined()
   }
   view.unmount()
  }
 }finally{state.size={width:1440,height:900}}
})
it('preserves real depth ordering and leaves protected-body ties in their original order',()=>{
 state.size={width:760,height:900}
 try{
  const input=overlappingCurves().slice(0,2),offset=capturedRay().ray.direction.clone().multiplyScalar(-.5)
  input[1]={...input[1],widthPx:3.5,points:input[1].points.map(point=>new Vector3(...point).add(offset).toArray() as Vec3)}
  const view=render(<ConnectorBatch curves={input} onSelect={()=>{}}/>),objects=lines(view).map(line)
  objects.forEach(object=>object.updateMatrixWorld())
  const hits=capturedRay().intersectObjects(objects,false),ordered=prioritizeConnectorIntersections(hits)
  expect(hitOwner(ordered[0])).toBe('collection');expect(hits.at(-1)!.distance-hits[0].distance).toBeGreaterThan(.49)
  expect(ordered.slice(0,2).every(hit=>hitOwner(hit)==='collection')).toBe(true)
  expect(ordered.every(hit=>hits.includes(hit))).toBe(true)
  const body={...hits[0],object:new Object3D()},mixed=[hits[0],body,hits[1]]
  expect(prioritizeConnectorIntersections(mixed)).toEqual(mixed)
 }finally{state.size={width:1440,height:900}}
})
it('keeps residual Flow bundles selectable on an identical individual Flow path while preserving reference priority',()=>{
 state.size={width:760,height:900}
 try{
  const captured=overlappingCurves(),individual={...captured[0],id:'individual',kind:'flow' as const,widthPx:3.5 as const}
  const bundle:PresentedBundle={...captured[1],id:'residual',kind:'flow',from:'source',to:'target',count:2,flowIds:['edge/1','edge/2']}
  const away=capturedRay().ray.direction.clone().multiplyScalar(.5)
  const fartherBundle={...bundle,points:bundle.points.map(point=>new Vector3(...point).add(away).toArray()as Vec3)}
  for(const {input,expected}of[
   {input:[individual,bundle],expected:'residual'},
   {input:[captured[2],individual,bundle],expected:captured[2].id},
   {input:[individual,fartherBundle],expected:'individual'},
  ]){
   const view=render(<ConnectorBatch curves={input} onSelect={()=>{}}/>),objects=lines(view).map(line)
   objects.forEach(object=>object.updateMatrixWorld())
   for(const round of[(value:number)=>value,Math.round,Math.floor,Math.ceil]){
    const ordered=prioritizeConnectorIntersections(capturedRay(round).intersectObjects(objects,false))
    const coreHit=ordered.find(hit=>(hit.object as LineSegments2).material.linewidth!==8)!
    expect(hitOwner(coreHit)).toBe(expected)
   }
   view.unmount()
  }
 }finally{state.size={width:1440,height:900}}
})
it('retains exact supplied XYZ terminals in visible batches without mutating the path or recorded identity',()=>{
 const input=curve(),before=JSON.stringify(input),view=render(<ConnectorBatch curves={[input]} onSelect={()=>{}}/>),object=line(core(view))
 expect(coordinates(object,'instanceStart',0)).toEqual(input.points[0].map(Math.fround))
 expect(coordinates(object,'instanceEnd',1)).toEqual(input.points.at(-1)!.map(Math.fround))
 expect(object.geometry.getAttribute('instanceStart').count).toBe(input.points.length-1)
 expect(JSON.stringify(input)).toBe(before)
})
it('renders a captured chip port at radius .08 even when no curve is admitted',()=>{
 const point:Vec3=[1,2,3],referencePorts=[{id:'captured/slot',point,opacity:.25,colorRole:'reference' as const}]
 const view=render(<ConnectorBatch curves={[]} referencePorts={referencePorts} onSelect={()=>{}}/>),matrix=new Matrix4(),position=new Vector3()
 expect(lines(view)).toHaveLength(0)
 const ports=view.nodes().find(node=>(node.props?.userData as {runtimeConnectorPorts?:boolean})?.runtimeConnectorPorts)!
 expect(ports.publicInstance!.count).toBe(1)
 ports.publicInstance!.getMatrixAt(0,matrix);expect(position.setFromMatrixPosition(matrix).toArray()).toEqual(point)
 const alpha=view.nodes().find(node=>node.props?.attach==='attributes-runtimeAlpha')!.props!.object as InstancedBufferAttribute
 expect(alpha.getX(0)).toBe(.25)
 expect(view.nodes().some(node=>(node.props?.args as unknown[])?.[0]===.08)).toBe(true)
})
it('uses shared pixel-width emphasis bands and preserves per-curve alpha instead of darkening semantic colours',()=>{
 const a=curve(),b=curve('ref/b',{opacity:.35}),c=curve('ref/c',{widthPx:3.5})
 const view=render(<ConnectorBatch curves={[a,b,c]} onSelect={()=>{}}/>),all=lines(view)
 expect(all.map(node=>(line(node).material as LineMaterial).linewidth).sort((a,b)=>a-b)).toEqual([2.5,3.5,8])
 const object=line(core(view)),alpha=object.geometry.getAttribute('instanceCurveOpacity')
 expect(alpha.getX(0)).toBe(1);expect(alpha.getX(2)).toBeCloseTo(.35)
 expect(coordinates(object,'instanceColorStart',0)).toEqual(coordinates(object,'instanceColorStart',2))
})
it('picks the actual segment owner while halo and invalid segment hits cannot select an item',()=>{
 const choose=vi.fn(),stop=vi.fn(),view=render(<ConnectorBatch curves={[curve(),curve('ref/b')]} onSelect={choose}/>),node=core(view)
 const click=node.props!.onClick as (event:{faceIndex:number;stopPropagation():void})=>void
 click({faceIndex:2,stopPropagation:stop});expect(choose).toHaveBeenCalledExactlyOnceWith('ref/b');expect(stop).toHaveBeenCalledOnce()
 click({faceIndex:-1,stopPropagation:stop});expect(choose).toHaveBeenCalledTimes(1)
 expect(lines(view).find(item=>(line(item).material as LineMaterial).linewidth===8)!.props!.onClick).toBeUndefined()
})
it('covers the core and halo with one hover owner, rejecting obscured paths and active camera gestures',()=>{
 const hover=vi.fn(),stop=vi.fn(),view=render(<ConnectorBatch curves={[curve(),curve('ref/b')]} onSelect={()=>{}} onHover={hover}/>),halo=lines(view).find(node=>(line(node).material as LineMaterial).linewidth===8)!
 const move=halo.props!.onPointerMove as (event:{faceIndex:number;buttons:number;distance:number;intersections:{distance:number;object:{userData:Record<string,unknown>}}[];clientX:number;clientY:number;stopPropagation():void})=>void
 const event={faceIndex:2,buttons:0,distance:2,intersections:[],clientX:200,clientY:300,stopPropagation:stop}
 move(event);expect(hover).toHaveBeenLastCalledWith('ref/b',[200,300]);expect(stop).toHaveBeenCalledOnce()
 move({...event,buttons:1});expect(hover).toHaveBeenLastCalledWith(null)
 move({...event,intersections:[{distance:1,object:{userData:{runtimeBloomRole:'protected'}}}]});expect(hover).toHaveBeenLastCalledWith(null);expect(stop).toHaveBeenCalledOnce()
 ;(halo.props!.onPointerOut as ()=>void)();expect(hover).toHaveBeenLastCalledWith(null)
 expect(core(view).props!.onPointerMove).toBeUndefined();expect(halo.props!.onClick).toBeUndefined()
})
it('highlights only both hovered ports and restores them without rebuilding line geometry or moving terminals',()=>{
 const input=[curve(),curve('ref/b',{opacity:.35})],view=render(<ConnectorBatch curves={input} onSelect={()=>{}}/>),first=line(core(view)),matrix=new Matrix4(),scale=new Vector3(),position=new Vector3()
 const ports=()=>view.nodes().find(node=>(node.props?.userData as {runtimeConnectorPorts?:boolean})?.runtimeConnectorPorts)!
 const alpha=()=>view.nodes().filter(node=>node.props?.attach==='attributes-runtimeAlpha')[0].props!.object as InstancedBufferAttribute
 view.rerender(<ConnectorBatch curves={input} onSelect={()=>{}} hoverId="ref/b"/>);expect(line(core(view))).toBe(first)
 for(let index=0;index<4;index++){
  ports().publicInstance!.getMatrixAt(index,matrix);scale.setFromMatrixScale(matrix);position.setFromMatrixPosition(matrix)
  expect(scale.toArray()).toEqual(Array(3).fill(index<2?1:1.5));expect(alpha().getX(index)).toBe(1)
  expect(position.toArray()).toEqual((index%2?input[Math.floor(index/2)].points.at(-1)!:input[Math.floor(index/2)].points[0]).map(Math.fround))
 }
 view.rerender(<ConnectorBatch curves={input} onSelect={()=>{}}/>);expect(line(core(view))).toBe(first)
 for(let index=0;index<4;index++){
  ports().publicInstance!.getMatrixAt(index,matrix);expect(scale.setFromMatrixScale(matrix).toArray()).toEqual([1,1,1]);expect(alpha().getX(index)).toBeCloseTo(index<2?1:.35)
 }
})
it('reuses material programs across equivalent coordinate wrappers and disposes each replaced batch geometry',()=>{
 const input=curve(),view=render(<ConnectorBatch curves={[input]} onSelect={()=>{}}/>),first=line(core(view)),disposed=vi.fn(),materialDisposed=vi.fn()
 first.geometry.addEventListener('dispose',disposed);first.material.addEventListener('dispose',materialDisposed)
 view.rerender(<ConnectorBatch curves={[{...input,opacity:.35,points:input.points.map(point=>[...point] as Vec3)}]} onSelect={()=>{}}/>)
 const next=line(core(view));expect(next).not.toBe(first);expect(next.material).toBe(first.material)
 expect(disposed).toHaveBeenCalledOnce();expect(materialDisposed).not.toHaveBeenCalled()
 expect(coordinates(next,'instanceStart',0)).toEqual(input.points[0].map(Math.fround))
 view.unmount();expect(materialDisposed).toHaveBeenCalledOnce()
})
it('replaces changed endpoints without reusing a stale picking geometry or changing unrelated semantic IDs',()=>{
 const input=curve(),choose=vi.fn(),view=render(<ConnectorBatch curves={[input]} onSelect={choose}/>),first=line(core(view)),retired=vi.fn()
 first.geometry.addEventListener('dispose',retired)
 const target:Vec3=[5,-3,2]
 view.rerender(<ConnectorBatch curves={[{...input,points:[input.points[0],input.points[1],target]}]} onSelect={choose}/>)
 const node=core(view);expect(line(node).geometry).not.toBe(first.geometry);expect(retired).toHaveBeenCalledOnce()
 expect(coordinates(line(node),'instanceEnd',1)).toEqual(target)
 ;(node.props!.onClick as (event:{faceIndex:number;stopPropagation():void})=>void)({faceIndex:1,stopPropagation:()=>{}})
 expect(choose).toHaveBeenCalledExactlyOnceWith(input.id)
})
it('owns independent core/halo materials and releases all mounted band resources on unmount',()=>{
 const view=render(<ConnectorBatch curves={[curve(),curve('return',{kind:'return',colorRole:'return',widthPx:3.5,arrow:true})]} onSelect={()=>{}}/>)
 const resources=lines(view).map(node=>({geometry:line(node).geometry,material:line(node).material,geometryDisposed:vi.fn(),materialDisposed:vi.fn()}))
 expect(new Set(resources.map(item=>item.material)).size).toBe(3)
 for(const item of resources){item.geometry.addEventListener('dispose',item.geometryDisposed);item.material.addEventListener('dispose',item.materialDisposed)}
 view.unmount()
 for(const item of resources){expect(item.geometryDisposed).toHaveBeenCalledOnce();expect(item.materialDisposed).toHaveBeenCalledOnce()}
})
it.each(['connector','return','binding-history']as const)('keeps %s terminal geometry and picking in the same batch grammar',kind=>{
 const input=curve(kind,{kind,arrow:kind==='return'}),before=JSON.stringify(input),view=render(<ConnectorBatch curves={[input]} onSelect={()=>{}}/>),object=line(core(view))
 expect(coordinates(object,'instanceStart',0)).toEqual(input.points[0].map(Math.fround))
 expect(coordinates(object,'instanceEnd',1)).toEqual(input.points.at(-1)!.map(Math.fround));expect(JSON.stringify(input)).toBe(before)
})

it.each([
 [[1,2,1],[1,2,1]],[[1,2,1],[1,-2,1]],[[8,-2,1],[-1,2,1]],
]as const)('keeps equal, same-X and reverse terminal routes finite and exact: %o → %o',(from,to)=>{
 const router=createConnectorRouter(),before=JSON.stringify([from,to]),points=router.forBodies([])(from,to)
 expect(points[0]).toEqual(from);expect(points.at(-1)).toEqual(to)
 expect(points.every(point=>point.every(Number.isFinite))).toBe(true)
 const prior=points.at(-2)!,last=points.at(-1)!
 expect(Math.hypot(...last.map((value,index)=>value-prior[index]))).toBeGreaterThan(0)
 expect(JSON.stringify([from,to])).toBe(before)
 expect(router.forBodies([])([...from],[...to])).toBe(points)
})
