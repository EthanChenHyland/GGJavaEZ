// Real React hooks and effect cleanup over inert Three groups. No GPU timing.
import {createContext,type ReactNode} from 'react'
import Reconciler from '@react-three/fiber/react-reconciler/index.js'
import {Group} from 'three'
const apply=(node:HostNode,props:Record<string,unknown>)=>{node.publicInstance.position.fromArray(props.position as number[]??[0,0,0]);node.publicInstance.userData=props.userData as Record<string,unknown>??{}}
export type HostNode = { children: HostNode[]; visible: boolean; props?:Record<string,unknown>; type?:string; publicInstance:Group; commits:number }
const context = {}
let priority = 0
const append = (parent: HostNode, child: HostNode) => { parent.children.push(child);parent.publicInstance.add(child.publicInstance) }
const remove = (parent: HostNode, child: HostNode) => { parent.children = parent.children.filter(node => node !== child);parent.publicInstance.remove(child.publicInstance) }
const insert = (parent: HostNode, child: HostNode, before: HostNode) => {
  parent.children.splice(parent.children.indexOf(before), 0, child);parent.publicInstance.add(child.publicInstance)
  const siblings=parent.publicInstance.children;siblings.splice(siblings.indexOf(child.publicInstance),1);siblings.splice(siblings.indexOf(before.publicInstance),0,child.publicInstance)
}
export const threeLifetimeReconciler = Reconciler({
  supportsMutation: true, supportsPersistence: false, supportsHydration: false, isPrimaryRenderer: false,
  createInstance: (_type:string,props:Record<string,unknown>) => {
    const node:HostNode={children:[],visible:true,props,type:_type,publicInstance:new Group(),commits:0};
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
export function renderThreeLifetime(element: ReactNode) {
  const onError = (error: Error) => { throw error }
  const container:HostNode={children:[],visible:true,publicInstance:new Group(),commits:0}
  const root = threeLifetimeReconciler.createContainer(container, 1, null, false, null, '', onError, onError, onError, () => {})
  const update = (next: ReactNode) => {
    threeLifetimeReconciler.updateContainerSync(next, root, null, null)
    threeLifetimeReconciler.flushSyncWork()
    threeLifetimeReconciler.flushPassiveEffects()
  }
  const unmount = () => { update(null); mounted.delete(unmount) }
  mounted.add(unmount)
  update(element)
  return { rerender: update, unmount, nodes:()=>{const result:HostNode[]=[];const visit=(node:HostNode)=>{result.push(node);node.children.forEach(visit)};visit(container);return result} }
}

export function unmountThreeLifetimes(){for(const unmount of mounted)unmount()}
