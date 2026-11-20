import {expect,it} from 'vitest'
import {measurementFailures,type CaptureMeasurements} from '../../e2e/reference/measurements'
const observed=():CaptureMeasurements=>({viewport:{width:1440,height:900},stateId:'completed',app:{execution:'COMPLETED',overlays:[]},scene:{entities:{}},world:{entities:[],stack:null,liveStack:null,heap:null},shell:{header:{x:0,y:0,width:1440,height:72},source:{x:8.64,y:90,width:360,height:504},timeDock:{x:12.96,y:782.1,width:1414.08,height:95.4},safeFrame:{x:388.8,y:90,width:1029.6,height:675},inspector:null}})
it('accepts exact shell geometry and rejects a shifted dock, widened source and wrong header',()=>{
 expect(measurementFailures(observed())).toEqual([])
 const changed=observed();changed.shell.timeDock!.x+=3;changed.shell.source!.width+=3;changed.shell.header!.height+=3
 expect(measurementFailures(changed)).toHaveLength(3)
})
it('a hero capture cannot pass without actual live stack and heap projections',()=>{
 const capture=observed();capture.stateId='runtime-hero'
 expect(measurementFailures(capture)).toEqual(['Hero live stack projection missing','Hero heap projection missing'])
 capture.world.liveStack={x:432,y:130,width:273.6,height:200,visible:true};capture.world.heap={x:792,y:130,width:450,height:500,visible:true}
 expect(measurementFailures(capture)).toEqual([])
 capture.world.liveStack.x+=50
 expect(measurementFailures(capture).some(value=>value.startsWith('Hero stack left'))).toBe(true)
})
