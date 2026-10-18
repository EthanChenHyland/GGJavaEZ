// One-for-one successors for the retired playback reducer's ten cases. At a
// disabled endpoint actions are inert; replay is an explicit timeline command.
import {describe,expect,it} from 'vitest'
import {createTimelineState,transitionTimeline,type TimelineState} from './timelineStore'
import type {PlaybackSpeed} from './playbackState'
import {loadPersonTrace} from '../examples/traces'
import {seek} from '../runtime'
const speeds:PlaybackSpeed[]=[.5,1,2,4]
const initial=(head:number,speed:PlaybackSpeed=1)=>createTimelineState('recording',head,speed)
const position=(state:TimelineState)=>({cursor:state.cursor,playing:state.playing,speed:state.speed})

describe('production playback transition successors',()=>{
 it('steps through 0..N and stops on the final event; only explicit Replay restarts',()=>{
  let state=transitionTimeline(initial(3),{type:'playPause'})
  expect(position(state)).toEqual({cursor:0,playing:true,speed:1})
  for(let i=0;i<3;i++)state=transitionTimeline(state,{type:'tick'})
  expect(position(state)).toEqual({cursor:3,playing:false,speed:1})
  expect(transitionTimeline(state,{type:'playPause'})).toBe(state)
  expect(position(transitionTimeline(state,{type:'replay'}))).toEqual({cursor:0,playing:true,speed:1})
 })
 it('manual stepping and scrubbing pause and stay within the accepted prefix',()=>{
  const playing=transitionTimeline(initial(5),{type:'playPause'})
  expect(position(transitionTimeline(playing,{type:'seek',cursor:4}))).toEqual({cursor:4,playing:false,speed:1})
  const stepped=transitionTimeline(playing,{type:'stepForward'})
  expect(position(stepped)).toEqual({cursor:1,playing:false,speed:1})
  expect(transitionTimeline(stepped,{type:'tick'})).toBe(stepped)
  expect(transitionTimeline(stepped,{type:'seek',cursor:99}).cursor).toBe(5)
  expect(transitionTimeline(stepped,{type:'seek',cursor:-4}).cursor).toBe(0)
  expect(transitionTimeline(stepped,{type:'stepBack'}).cursor).toBe(0)
 })
 it('preserves playback speed across a recording reset',()=>{
  const fast=transitionTimeline(initial(2),{type:'speed',speed:4}),advanced=transitionTimeline(fast,{type:'stepForward'})
  expect(position(transitionTimeline(advanced,{type:'reset',recordingId:'next-recording',liveHead:2}))).toEqual({cursor:0,playing:false,speed:4})
 })
 it.each([1,21])('naturally completes %i events at every speed and never loops on later ticks',count=>{
  for(const speed of speeds){
   let state=transitionTimeline(initial(count,speed),{type:'playPause'})
   for(let cursor=1;cursor<=count;cursor++){
    state=transitionTimeline(state,{type:'tick'})
    expect(position(state)).toEqual({cursor,playing:cursor<count,speed})
   }
   const completed=state
   for(let i=0;i<4;i++)expect(transitionTimeline(completed,{type:'tick'})).toBe(completed)
  }
 })
 it('forward at completion stays final; back pauses at the preceding event',()=>{
  for(const speed of speeds){
   const completed={...initial(21,speed),cursor:21}
   expect(transitionTimeline(completed,{type:'stepForward'})).toBe(completed)
   const previous=transitionTimeline(completed,{type:'stepBack'})
   expect(position(previous)).toEqual({cursor:20,playing:false,speed})
   expect(position(transitionTimeline(previous,{type:'stepForward'}))).toEqual(position(completed))
  }
 })
 it('every enabled manual cursor transition pauses, clamps and preserves speed; disabled endpoints are inert',()=>{
  for(const speed of speeds)for(const playing of[false,true])for(let cursor=0;cursor<=21;cursor++){
   const state={...initial(21,speed),cursor,playing}
   const forward=transitionTimeline(state,{type:'stepForward'}),back=transitionTimeline(state,{type:'stepBack'})
   if(cursor===21)expect(forward).toBe(state)
   else expect(position(forward)).toEqual({cursor:cursor+1,playing:false,speed})
   if(cursor===0)expect(back).toBe(state)
   else expect(position(back)).toEqual({cursor:cursor-1,playing:false,speed})
   for(const destination of[0,21,-10,100])expect(position(transitionTimeline(state,{type:'seek',cursor:destination}))).toEqual({cursor:Math.max(0,Math.min(destination,21)),playing:false,speed})
  }
 })
 it('empty recordings remain paused at zero through all disabled actions and reset',()=>{
  for(const speed of speeds){
   let state=initial(0,speed)
   for(const action of[{type:'playPause'},{type:'tick'},{type:'stepForward'},{type:'stepBack'},
    {type:'seek',cursor:0},{type:'seek',cursor:21},{type:'seek',cursor:-1},
    {type:'reset',recordingId:'recording',liveHead:0}]as const){
    state=transitionTimeline(state,action)
    expect(position(state)).toEqual({cursor:0,playing:false,speed})
   }
  }
 })
 it('Play pauses or resumes within the prefix; completion requires explicit Replay',()=>{
  for(let cursor=0;cursor<=21;cursor++){
   const paused={...initial(21,4),cursor}
   expect(transitionTimeline(paused,{type:'tick'})).toBe(paused)
   const running=transitionTimeline(paused,{type:'playPause'})
   if(cursor===21){
    expect(running).toBe(paused)
    expect(position(transitionTimeline(paused,{type:'replay'}))).toEqual({cursor:0,playing:true,speed:4})
   }else{
    expect(position(running)).toEqual({cursor,playing:true,speed:4})
    expect(position(transitionTimeline(running,{type:'playPause'}))).toEqual(position(paused))
   }
  }
 })
 it('three complete 21-event fixture replays and endpoint seeks reconstruct identical runtime snapshots',()=>{
  const trace=loadPersonTrace(),count=trace.events.length
  expect(count).toBe(21)
  const first=seek(trace,0),last=seek(trace,count)
  let state={...initial(count,4),cursor:count}
  for(let replay=0;replay<3;replay++){
   state=transitionTimeline(state,{type:'replay'})
   expect(state.cursor).toBe(0);expect(seek(trace,state.cursor)).toEqual(first)
   while(state.playing)state=transitionTimeline(state,{type:'tick'})
   expect(state.cursor).toBe(count);expect(seek(trace,state.cursor)).toEqual(last)
   for(const cursor of[0,count,0,count]){
    state=transitionTimeline(state,{type:'seek',cursor})
    expect(seek(trace,state.cursor)).toEqual(cursor===0?first:last)
   }
  }
 })
})
