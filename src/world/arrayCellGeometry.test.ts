import { expect, it } from 'vitest'
import indexInk from '../render/text/arrayIndexInkMetrics.json'
import type { TraceEvent } from '../contracts/runtime'
import { world } from '../theme/tokens'
import { createLayoutEngine } from './layoutEngine'
import { computeArrayWindow } from './arrayWindow'
import { arrayBackplate,arrayCellTextGeometry } from './arrayCellGeometry'
import { arrayCellCaptionPoints } from '../render/text/arrayIndexLayout'

it('binds index clearance to the actual bundled font and its middle-anchor ink', () => {
  expect(indexInk.alphabet).toBe('[]0123456789 ←→…')
  const cell={position:[3,4,5] as const,size:[1.55,1.55,1.55] as const}
  const origin=arrayCellTextGeometry(cell).index
  const points=arrayCellCaptionPoints(cell,'[6500]')
  expect(Math.min(...points.map(point=>point[1]))-origin[1]).toBeCloseTo(-.14,12)
  expect(Math.max(...points.map(point=>point[1]))-origin[1]).toBeCloseTo(.114296875,12)
  expect(points.every(point=>point[2]===origin[2])).toBe(true)
})

it.each([0, 1, 5, 8, 9, 128, 129, 10001])('uses reserved index space above the cells without changing tray extent for length %i', length => {
  // Explicit normalized allocation, not a claimed JVM recording.
  const event: TraceEvent = {type:'ALLOCATE_ARRAY',seq:0,eventId:`unit/array-caption/${length}`,objectId:'array',displayId:1,elementType:'int',elements:[],length,metadata:{ownership:'PROJECT',runtimeType:'int[]',packageName:''},source:null,label:'Observed allocation',importance:'normal'}
  const engine=createLayoutEngine();engine.append([event])
  const tray=engine.state.anchors.array,top=tray.position[1]+tray.size[1]/2
  const columns=Math.max(world.array.cellsPerRowMin,Math.min(world.array.cellsPerRowMax,length))
  const rows=length>128?8:Math.ceil(length/columns)
  expect(tray.size[1]).toBe(world.array.titlePlate+(rows?rows*(world.array.cell+world.array.gap)+world.array.indexLabel:.45))
  const backplate=arrayBackplate(tray)
  expect(backplate.size).toEqual([tray.size[0],tray.size[1],.12])
  expect(backplate.position.slice(0,2)).toEqual(tray.position.slice(0,2))
  expect(backplate.position[2]-backplate.size[2]/2).toBeCloseTo(tray.position[2]-tray.size[2]/2,10)
  const window=computeArrayWindow({recordingId:'unit',arrayId:'array',recordedLength:length,anchor:tray,nominalCellBudget:length>128?48:128,requestedIndices:length?[length-1]:[]})
  for(const[id,cell]of window.mapping){
    const row=Math.floor(cell.presentedSlot/columns)
    // Header ends at top-.9. The required caption center sits on that
    // boundary for the first row, clear of the header's title/identity bands.
    const captionY=cell.anchor.position[1]+cell.anchor.size[1]/2+.5
    expect(captionY).toBeCloseTo(top-.9-row*1.63,10)
    expect(cell.anchor.size).toEqual([1.55,1.55,1.55])
    expect(cell.anchor.position[2]-cell.anchor.size[2]/2).toBeCloseTo(backplate.position[2]+backplate.size[2]/2,10)
    if(length<=128){
      expect(engine.state.anchors[id].position).toEqual(cell.anchor.position)
      expect(engine.state.anchors[id].size).toEqual(cell.anchor.size)
      expect(engine.state.anchors[id].bodyPort).toEqual(cell.port)
      expect(tray.ports[id]).toEqual(cell.port)
    }
  }
  if(window.mapping.size){
    const bySlot=[...window.mapping.values()].sort((a,b)=>a.presentedSlot-b.presentedSlot)
    const first=bySlot[0]
    expect(first.anchor.position[1]).toBeCloseTo(top-.9-.5-.775-Math.floor(first.presentedSlot/columns)*1.63,10)
    for(const cell of bySlot){
      expect(cell.anchor.position[1]-cell.anchor.size[1]/2).toBeGreaterThanOrEqual(tray.position[1]-tray.size[1]/2-1e-9)
      const below=bySlot.find(other=>other.presentedSlot===cell.presentedSlot+columns)
      if(below)expect(cell.anchor.position[1]-below.anchor.position[1]-1.55).toBeCloseTo(.08,10)
    }
  }
})
