// Real React memo/effect lifetimes with inert Three groups. Glyph rasterization
// and the Fiber store/frame hooks are controlled; no GPU performance is claimed.
import {type ComponentProps} from 'react'
import {PerspectiveCamera} from 'three'
import {renderThreeLifetime as render,threeLifetimeReconciler as reconciler,unmountThreeLifetimes} from '../testing/reactThreeLifetime'
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
import {RuntimeSolid} from './RuntimeSolid'
import {sparseTrace,sparseArrayId,sparseInt} from '../testing/sparseTrace'
import {projectTrace} from '../testing/projectTrace'
import {planPresentation} from '../world/presentationPlanner'
import type {Selection} from '../contracts/interaction'
import {arrayElementSlotId} from '../contracts/runtime'
import {color} from '../theme/tokens'

type ProbeText=Text&{syncs:number;disposed:number}
const glyph=()=>state.texts[0] as ProbeText
const group=(view:ReturnType<typeof render>)=>view.nodes().find(node=>node.props?.position)!
const props=():ComponentProps<typeof WorldText>=>({children:'18',position:[0,0,-5],lines:['18'],heading:{entityId:'frame/a',kind:'title'},frameText:{entityId:'frame/a',kind:'value',slotId:'local/a'},returnText:{flowId:'return/a',kind:'value'},collectionText:{entityId:'map/a',kind:'value',slotId:'entry/a'}})
const refresh=(height:number)=>{state.snapshot={camera:new PerspectiveCamera(36,1,.1,1000),size:{width:1440,height},invalidate:()=>state.invalidations++};for(const notify of state.listeners)notify();reconciler.flushSyncWork();reconciler.flushPassiveEffects()}
const frame=()=>{for(const callback of state.frames)callback()}
beforeEach(()=>{state.texts=[];state.batches=[];state.invalidations=0;refresh(900)})
afterEach(()=>{unmountThreeLifetimes();expect(state.frames.size).toBe(0);expect(state.listeners.size).toBe(0);expect(textReadiness.pending.size).toBe(0);vi.restoreAllMocks()})
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

function arrayLifetime(extra:object[]=[]){
 const indices=[0,1,2,3,4],trace=sparseTrace({length:5,indices,extra}),projection=projectTrace(trace),initial=trace.events.length-extra.length
 const at=(cursor:number,selection:Selection=null)=>{
  const scene=projection.project(cursor),node=scene.entities[sparseArrayId]
  if(node.kind!=='array')throw new Error('Expected captured array')
  const plan=planPresentation({scene,layout:projection.layout,detailLevel:'CLOSE',selection,focusTargetId:null,trace:{active:false,scope:'relevant'}})
  return {node,plan,presented:plan.entities.get(node.id)!}
 }
 return {at,initial,indices}
}
function cellGroups(view:ReturnType<typeof render>){
 const result=new Map<number,ReturnType<typeof view.nodes>[number]>()
 for(const node of view.nodes()){
  const children=node.props?.children as {props?:{children?:unknown}}[]|undefined
  if(!Array.isArray(children)||children.length!==2)continue
  const label=children[0]?.props?.children
  if(typeof label==='string'&&/^\[\d+\]/.test(label))result.set(Number(label.match(/^\[(\d+)\]/)![1]),node)
 }
 return result
}
it('skips unchanged cell groups across captured array observations with fresh evidence and value wrappers',()=>{
 const extra=Array.from({length:20},()=>({type:'OBJECT_OBSERVE',objectId:sparseArrayId,arrayElements:[0,1,2,3,4].map(index=>({index,value:sparseInt(index)}))}))
 const fixture=arrayLifetime(extra),first=fixture.at(fixture.initial),view=render(<RuntimeSolid {...first}/>),groups=cellGroups(view),resources=[...state.texts]
 expect([...groups.keys()]).toEqual(fixture.indices)
 let previous=first.node
 for(let cursor=fixture.initial+1;cursor<=fixture.initial+extra.length;cursor++){
  const next=fixture.at(cursor)
  expect(next.node).not.toBe(previous);expect(next.node.cells).not.toBe(previous.cells)
  expect(next.node.cells.map(cell=>cell.value.exact)).toEqual(['0','1','2','3','4'])
  view.rerender(<RuntimeSolid {...next}/>);previous=next.node
 }
 for(const [index,group] of groups){expect(cellGroups(view).get(index)).toBe(group);expect(group.commits).toBe(0)}
 expect(state.texts).toEqual(resources)
 view.unmount();expect(resources.every(text=>(text as ProbeText).disposed===1)).toBe(true)
})
it('updates only affected cell labels for actual writes, reads, reverse stepping and physical selection',()=>{
 const fixture=arrayLifetime([
  {type:'ARRAY_WRITE',frameId:'observed-call',objectId:sparseArrayId,index:1,value:sparseInt(42)},
  {type:'ARRAY_READ',frameId:'observed-call',objectId:sparseArrayId,index:2,value:sparseInt(2)},
 ]),first=fixture.at(fixture.initial),view=render(<RuntimeSolid {...first}/>),groups=cellGroups(view),resources=[...state.texts]
 const labels=(index:number)=>groups.get(index)!.props!.children as {props:{children:string;tint:string;opacity:number}}[]
 const commits=()=>fixture.indices.map(index=>groups.get(index)!.commits)
 view.rerender(<RuntimeSolid {...fixture.at(fixture.initial+1)}/>);
 expect(commits()).toEqual([0,1,0,0,0]);expect(labels(1).map(label=>label.props.children)).toEqual(['[1] ←','42'])
 expect(labels(1).every(label=>label.props.tint===color.semantic.mutation)).toBe(true)
 view.rerender(<RuntimeSolid {...fixture.at(fixture.initial+2)}/>);
 expect(commits()).toEqual([0,2,1,0,0]);expect(labels(1).map(label=>label.props.children)).toEqual(['[1]','42'])
 expect(labels(2)[0].props.children).toBe('[2] →');expect(labels(2).every(label=>label.props.tint===color.semantic.execution)).toBe(true)
 view.rerender(<RuntimeSolid {...fixture.at(fixture.initial)}/>);
 expect(commits()).toEqual([0,3,2,0,0]);expect(labels(1).map(label=>label.props.children)).toEqual(['[1]','1']);expect(labels(2)[0].props.children).toBe('[2]')
 view.rerender(<RuntimeSolid {...fixture.at(fixture.initial,{kind:'slot',id:arrayElementSlotId(sparseArrayId,3)})}/>);
 expect(commits()).toEqual([0,3,2,1,0]);expect(labels(3).every(label=>label.props.tint===color.semantic.execution)).toBe(true)
 view.rerender(<RuntimeSolid {...fixture.at(fixture.initial,{kind:'slot',id:arrayElementSlotId(sparseArrayId,4)})}/>);
 expect(commits()).toEqual([0,3,2,2,1]);expect(labels(3)[0].props.tint).toBe(color.ui.textSecondary);expect(labels(4).every(label=>label.props.tint===color.semantic.execution)).toBe(true)
 const selected=fixture.at(fixture.initial,{kind:'slot',id:arrayElementSlotId(sparseArrayId,4)})
 view.rerender(<RuntimeSolid {...selected} presented={{...selected.presented,opacity:.35}}/>);
 expect(commits()).toEqual([1,4,3,3,2]);for(const index of fixture.indices)expect(labels(index).every(label=>label.props.opacity===.35)).toBe(true)
 const window=selected.plan.cellWindows.get(sparseArrayId)!,slotId=arrayElementSlotId(sparseArrayId,0),cell=window.mapping.get(slotId)!,[x,y,z]=cell.anchor.position
 const moved={...cell,anchor:{...cell.anchor,position:[x+2,y-1,z+.5] as const}},mapping=new Map(window.mapping).set(slotId,moved)
 view.rerender(<RuntimeSolid {...selected} presented={{...selected.presented,opacity:.35}} plan={{...selected.plan,cellWindows:new Map([[sparseArrayId,{...window,mapping}]])}}/>);
 expect(commits()).toEqual([2,4,3,3,2]);expect(groups.get(0)!.children.map(child=>child.publicInstance.position.toArray())).toEqual([[x+2,y-1+.38,z+.5+.83],[x+2,y-1-.1,z+.5+.83]])
 expect(state.texts).toEqual(resources)
})
