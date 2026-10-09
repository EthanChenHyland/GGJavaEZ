import {beforeEach,expect,it} from 'vitest'
import fc from 'fast-check'
import {useCameraStore} from './cameraStore'
import {useInteractionStore} from '../interaction/interactionStore'
import type {OrbitPose} from './projection'
beforeEach(()=>{useCameraStore.setState(useCameraStore.getInitialState());useInteractionStore.setState(useInteractionStore.getInitialState())})
it('Selection and Trace entry preserve camera pose and Selection identity',()=>{
 const camera=useCameraStore.getState(),pose=camera.pose
 useInteractionStore.getState().select({kind:'frame',id:'opaque'})
 expect(useCameraStore.getState().pose).toBe(pose)
 camera.enterTrace();expect(useCameraStore.getState().pose).toBe(pose);expect(useInteractionStore.getState().selection).toEqual({kind:'frame',id:'opaque'})
 useInteractionStore.getState().setTraceScope('all');camera.enterTrace();expect(useInteractionStore.getState().trace).toEqual({active:true,scope:'relevant'})
})
it('Property 49: refocusing saves the original pre-Focus pose exactly once, and exit preserves Selection (100 runs)',()=>{
 fc.assert(fc.property(fc.integer({min:2,max:80}),fc.integer({min:-180,max:180}),fc.integer({min:-80,max:-2}),(distance,yawDeg,pitchDeg)=>{
  useCameraStore.setState(useCameraStore.getInitialState());useInteractionStore.getState().resetRecording()
  const pose:OrbitPose={target:[3,-4,5],distance,yawDeg,pitchDeg};useCameraStore.getState().setPose(pose)
  useCameraStore.getState().focus({kind:'frame',id:'first'});useCameraStore.getState().setPose({...pose,distance:distance+2});useCameraStore.getState().focus({kind:'object',id:'second'})
  expect(useInteractionStore.getState().preFocus?.pose).toBe(pose)
  useCameraStore.getState().exitFocus();expect(useCameraStore.getState().intent).toMatchObject({kind:'exitFocus',pose});expect(useInteractionStore.getState().selection).toEqual({kind:'object',id:'second'})
 }),{numRuns:100})
})
it('Property 52: manual camera input cancels travel and Follow until explicitly enabled (100 runs)',()=>{
 fc.assert(fc.property(fc.integer({min:0,max:20}),count=>{
  const state=useCameraStore.getState();state.home();state.enableFollow();state.userInput()
  expect(useCameraStore.getState()).toMatchObject({mode:'EXPLORE',intent:null,follow:false})
  for(let i=0;i<count;i++)useCameraStore.getState().setPose({...useCameraStore.getState().pose,distance:10+i})
  expect(useCameraStore.getState().follow).toBe(false);state.enableFollow();expect(useCameraStore.getState().follow).toBe(true)
 }),{numRuns:100})
})
it('Flow and connector Selection cannot enter Focus',()=>{
 const camera=useCameraStore.getState();camera.focus({kind:'flow',id:'edge'});expect(useInteractionStore.getState().focus).toBeNull();camera.focus({kind:'reference',id:'ref'});expect(useInteractionStore.getState().focus).toBeNull()
})
