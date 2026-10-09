import { describe,expect,it } from 'vitest'
import fc from 'fast-check'
import {createTimelineState,reconcileTimelineHost,transitionTimeline,type TimelineAction} from './timelineStore'
import {timelineCaption,timelineKeyAction} from './timelineControls'
import {loadPersonTrace} from '../examples/traces'
const actions=fc.array(fc.oneof(fc.integer({min:-500,max:500}).map(cursor=>({type:'seek',cursor}) as const),fc.constantFrom('stepForward','stepBack','playPause','reversePlay','tick','replay','returnLive','beginScrub','endScrub','debugCommand').map(type=>({type}) as TimelineAction)),{maxLength:100})
describe('normalized timeline',()=>{
 it('Property 5: commands preserve prefix boundaries, scrub stops motion and Debug never changes the lens (100 runs)',()=>{
  fc.assert(fc.property(fc.integer({min:0,max:250}),actions,(head,commands)=>{
   let state=createTimelineState('opaque recording',head)
   for(const action of commands){const before=state;state=transitionTimeline(state,action)
    expect(Number.isInteger(state.cursor)).toBe(true);expect(state.cursor).toBeGreaterThanOrEqual(0);expect(state.cursor).toBeLessThanOrEqual(head)
    if(!head)expect(state).toBe(before)
    if(action.type==='debugCommand')expect(state).toBe(before)
    if(action.type==='seek'&&head)expect(state.cursor).toBe(Math.min(head,Math.max(0,Math.round(action.cursor))))
    if(action.type==='stepForward')expect(state.cursor).toBe(Math.min(head,before.cursor+1))
    if(action.type==='stepBack')expect(state.cursor).toBe(Math.max(0,before.cursor-1))
    if(action.type==='returnLive'&&head){expect(state.cursor).toBe(head);expect(state.lens).toBe('LIVE');expect(state.playing).toBe(false)}
    if(action.type==='tick'){const delta=before.playing&&!before.scrubbing?(before.direction==='forward'?1:-1):0;expect(state.cursor).toBe(Math.min(head,Math.max(0,before.cursor+delta)))}
    if(action.type==='beginScrub'&&head){expect(state.playing).toBe(false);expect(state.scrubbing).toBe(true)}
   }
  }),{numRuns:100})
 })
 it('HISTORY holds while LIVE follows accepted semantic emissions, including zero',()=>{
  let state=createTimelineState('id',5);state=transitionTimeline(state,{type:'seek',cursor:2});state=transitionTimeline(state,{type:'head',liveHead:17,partial:true})
  expect(state.cursor).toBe(2);expect(state.boundary).toBe(17)
  state=transitionTimeline(state,{type:'returnLive'});state=transitionTimeline(state,{type:'head',liveHead:21,partial:true});expect(state.cursor).toBe(21)
  const zero=transitionTimeline(state,{type:'head',liveHead:0,partial:true});expect(zero.cursor).toBe(0);expect(zero.playing).toBe(false)
 })
 it('reverse/replay reach exact inclusive boundaries and do not wrap',()=>{
  let state=transitionTimeline(createTimelineState('id',8),{type:'replay'})
  for(let i=0;i<9;i++)state=transitionTimeline(state,{type:'tick'})
  expect(state.cursor).toBe(8);expect(state.playing).toBe(false)
  state=transitionTimeline(state,{type:'reversePlay'});for(let i=0;i<9;i++)state=transitionTimeline(state,{type:'tick'})
  expect(state.cursor).toBe(0);expect(state.playing).toBe(false)
 })
 it('stale host LIVE props never undo a synchronous HISTORY action',()=>{
  const first=reconcileTimelineHost({state:createTimelineState('id'),observedHostLens:null},{recordingId:'id',liveHead:10,partial:false,hostLens:'LIVE'})
  const seek={...first,state:transitionTimeline(first.state,{type:'seek',cursor:3})}
  expect(reconcileTimelineHost(seek,{recordingId:'id',liveHead:12,partial:false,hostLens:'LIVE'}).state.cursor).toBe(3)
 })
 it('zero keyboard actions do nothing; zero caption is Before execution',()=>{
  const state=createTimelineState('id');for(const key of[' ','ArrowLeft','ArrowRight','Home','End'])expect(timelineKeyAction(key,state)).toBeNull()
  expect(timelineCaption(loadPersonTrace().events,state)).toEqual({caption:'0 / 0',summary:'Before execution',seq:null})
 })
})
