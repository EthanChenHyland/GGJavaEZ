import {expect,it} from 'vitest'
import {inspectorRows} from './inspection'
import type {SceneArray} from '../contracts/world'
import {notRecordedValue} from '../world/valueText'
it('a million-cell sparse array Inspector retains logical indices without materializing unknown values',()=>{
 const array:SceneArray={kind:'array',id:'opaque array',displayId:7,title:'int[]',componentType:'int',length:1000000,cells:[{index:999999,slotId:'last',value:{kind:'primitive',text:'19',exact:'19',observation:'OBSERVED'},evidence:{kind:'observed',introducedSeq:7,changedSeq:7,eventIds:['late']}}],activity:null,outOfBounds:null,ownership:'PROJECT',anchor:{entityId:'opaque array',region:'heap',position:[0,0,0],size:[2,2,2],bodyPort:[0,0,1],ports:{}},evidence:{kind:'observed',introducedSeq:0,changedSeq:7,eventIds:['alloc']}}
 const rows=inspectorRows(array);expect(rows.count).toBe(1000000);expect(rows.at(888888).value).toEqual(notRecordedValue());expect(rows.at(999999).value.exact).toBe('19');expect(array.cells.length).toBe(1)
})
