// Real React memo/effect lifetimes with inert Three groups. Glyph rasterization
// and the Fiber store/frame hooks are controlled; no GPU performance is claimed.
import {createContext,type ComponentProps,type ReactNode} from 'react'
import Reconciler from '@react-three/fiber/react-reconciler/index.js'
import {Group,PerspectiveCamera} from 'three'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({frames:new Set<()=>void>(),listeners:new Set<()=>void>(),snapshot:null as unknown,invalidations:0,texts:[] as unknown[],batches:[] as unknown[]}))
vi.mock('@react-three/fiber',async()=>{
 const {useEffect,useSyncExternalStore}=await import('react')
 return {
  useThree:(selector?:(value:unknown)=>unknown)=>{const value=useSyncExternalStore(callback=>{state.listeners.add(callback);return()=>{state.listeners.delete(callback)}},()=>state.snapshot);return selector?selector(value):value},
  useFrame:(callback:()=>void)=>useEffect(()=>{state.frames.add(callback);return()=>{state.frames.delete(callback)}},[callback]),
 }
})
vi.mock('troika-three-text',async()=>{
 const {Group}=await import('three')
 class Text extends Group{syncs=0;disposed=0;text='';font='';fontSize=0;maxWidth=0;anchorX='';fillOpacity=1;color='';constructor(){super();state.texts.push(this)}sync(callback:()=>void){this.syncs++;callback()}dispose(){this.disposed++}}
 class BatchedText extends Group{added:unknown[]=[];removed:unknown[]=[];disposed=0;material={dispose(){}};constructor(){super();state.batches.push(this)}addText(text:unknown){this.added.push(text)}removeText(text:unknown){this.removed.push(text)}dispose(){this.disposed++}}
 return {Text,BatchedText}
})
import {Text} from 'troika-three-text'
import {FaceTextBatch,WorldText,textReadiness} from './FaceText'
const apply=(node:HostNode,props:Record<string,unknown>)=>{node.publicInstance.position.fromArray(props.position as number[]??[0,0,0]);node.publicInstance.userData=props.userData as Record<string,unknown>??{}}
type HostNode = { children: HostNode[]; visible: boolean; props?:Record<string,unknown>; publicInstance:Group; commits:number }
const context = {}
let priority = 0
const append = (parent: HostNode, child: HostNode) => { parent.children.push(child) }
const remove = (parent: HostNode, child: HostNode) => { parent.children = parent.children.filter(node => node !== child) }
const insert = (parent: HostNode, child: HostNode, before: HostNode) => { parent.children.splice(parent.children.indexOf(before), 0, child) }
const reconciler = Reconciler({
  supportsMutation: true, supportsPersistence: false, supportsHydration: false, isPrimaryRenderer: false,
  createInstance: (_type:string,props:Record<string,unknown>) => {
    const node:HostNode={children:[],visible:true,props,publicInstance:new Group(),commits:0};
    apply(node,props);return node
  }, createTextInstance: () => ({ children: [], visible: true, publicInstance:new Group(),commits:0 }),
  appendInitialChild: append, appendChild: append, appendChildToContainer: append,
  removeChild: remove, removeChildFromContainer: remove, insertBefore: insert, insertInContainerBefore: insert,
  getRootHostContext: () => context, getChildHostContext: () => context, getPublicInstance: (node: HostNode) => node.publicInstance,
  prepareForCommit: () => null, resetAfterCommit: () => {}, finalizeInitialChildren: () => false,
  commitUpdate: (node:HostNode,_type:string,_old:unknown,props:Record<string,unknown>) => {node.props=props;node.commits++;apply(node,props)}, commitTextUpdate: () => {}, shouldSetTextContent: () => false,
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
  const container:HostNode={children:[],visible:true,publicInstance:new Group(),commits:0}
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

type ProbeText=Text&{syncs:number;disposed:number}
const glyph=()=>state.texts[0] as ProbeText
const group=(view:ReturnType<typeof render>)=>view.nodes().find(node=>node.props?.position)!
const props=():ComponentProps<typeof WorldText>=>({children:'18',position:[0,0,-5],lines:['18'],heading:{entityId:'frame/a',kind:'title'},frameText:{entityId:'frame/a',kind:'value',slotId:'local/a'},returnText:{flowId:'return/a',kind:'value'},collectionText:{entityId:'map/a',kind:'value',slotId:'entry/a'}})
const refresh=(height:number)=>{state.snapshot={camera:new PerspectiveCamera(36,1,.1,1000),size:{width:1440,height},invalidate:()=>state.invalidations++};for(const notify of state.listeners)notify();reconciler.flushSyncWork();reconciler.flushPassiveEffects()}
const frame=()=>{for(const callback of state.frames)callback()}
beforeEach(()=>{state.texts=[];state.batches=[];state.invalidations=0;refresh(900)})
afterEach(()=>{for(const unmount of mounted)unmount();expect(state.frames.size).toBe(0);expect(state.listeners.size).toBe(0);expect(textReadiness.pending.size).toBe(0);vi.restoreAllMocks()})
it('skips unchanged text host commits across 100 reconstructed coordinate, line and semantic wrappers',()=>{
 const view=render(<WorldText {...props()}/>),anchor=group(view),text=glyph(),syncs=text.syncs
 for(let index=0;index<100;index++)view.rerender(<WorldText {...props()}/>)
 expect(group(view)).toBe(anchor);expect(anchor.commits).toBe(0);expect(glyph()).toBe(text);expect(text.syncs).toBe(syncs);expect(state.texts).toHaveLength(1)
 view.unmount();expect(text.disposed).toBe(1)
})
it('updates all semantic identities without rerasterizing unchanged glyphs',()=>{
 const initial=props(),view=render(<WorldText {...initial}/>),text=glyph(),syncs=text.syncs
 const next={...initial,heading:{entityId:'frame/b',kind:'identity' as const},frameText:{entityId:'frame/b',kind:'name' as const,slotId:'local/b'},returnText:{flowId:'return/b',kind:'operands' as const},collectionText:{entityId:'map/b',kind:'key' as const,slotId:'entry/b'},exceptionText:true}
 view.rerender(<WorldText {...next}/>);const data=group(view).publicInstance.userData
 expect(data.runtimeHeading).toEqual({...next.heading,text});expect(data.runtimeFrameText).toEqual({...next.frameText,text});expect(data.runtimeReturnText).toEqual({...next.returnText,text});expect(data.runtimeCollectionText).toEqual({...next.collectionText,text});expect(data.runtimeExceptionText).toEqual({text});expect(text.syncs).toBe(syncs)
 view.rerender(<WorldText children="18" position={[0,0,-5]}/>);expect(group(view).publicInstance.userData).toEqual({})
})
it('keeps camera visibility active when parent props are skipped and store dimensions change',()=>{
 const view=render(<WorldText {...props()}/>),anchor=group(view),text=glyph();frame();expect(text.fillOpacity).toBe(1)
 view.rerender(<WorldText {...props()}/>);expect(anchor.commits).toBe(0)
 anchor.publicInstance.position.z=-500;frame();expect(text.fillOpacity).toBe(0)
 anchor.publicInstance.position.z=-5;frame();expect(text.fillOpacity).toBe(1)
 refresh(10);view.rerender(<WorldText {...props()}/>);frame();expect(text.fillOpacity).toBe(0)
 refresh(900);view.rerender(<WorldText {...props()}/>);frame();expect(text.fillOpacity).toBe(1)
 anchor.publicInstance.visible=false;frame();expect(text.fillOpacity).toBe(0)
})
it('updates content, font layout, tint, opacity and physical anchors on the same text resource',()=>{
 const view=render(<WorldText children="18" position={[0,0,-5]}/>),text=glyph(),syncs=text.syncs
 view.rerender(<WorldText children="19" lines={['19','20']} position={[1,2,-6]} size={.34} width={3} weight={600} tracking={.02} align="right" tint="#ff8800" opacity={.35}/>)
 expect(state.texts).toHaveLength(1);expect(text.text).toBe('19\n20');expect(text.fontSize).toBe(.34);expect(text.maxWidth).toBe(3);expect(text.anchorX).toBe('right');expect(text.color).toBe('#ff8800');expect(text.fillOpacity).toBe(.35);expect(text.syncs).toBe(syncs+1);expect(group(view).publicInstance.position.toArray()).toEqual([1,2,-6])
})
it('releases the old glyph and creates a fresh resource on remount',()=>{
 const first=render(<WorldText {...props()}/>),retired=glyph();first.unmount();expect(retired.disposed).toBe(1)
 const second=render(<WorldText {...props()}/>);expect(state.texts).toHaveLength(2);expect(state.texts[1]).not.toBe(retired);second.unmount();expect((state.texts[1] as ProbeText).disposed).toBe(1)
})

it('preserves one batch registration through skipped parents and releases it on canvas teardown',()=>{
 const view=render(<FaceTextBatch><WorldText {...props()}/></FaceTextBatch>),text=glyph(),batch=state.batches[0] as {added:unknown[];removed:unknown[];disposed:number}
 expect(batch.added).toEqual([text]);expect(textReadiness.mounted).toBe(true)
 for(let index=0;index<20;index++)view.rerender(<FaceTextBatch><WorldText {...props()}/></FaceTextBatch>)
 expect(batch.added).toEqual([text]);expect(batch.removed).toEqual([]);expect(state.texts).toHaveLength(1)
 view.unmount();expect(batch.removed).toEqual([text]);expect(batch.disposed).toBe(1);expect(text.disposed).toBe(1);expect(textReadiness.mounted).toBe(false)
})
