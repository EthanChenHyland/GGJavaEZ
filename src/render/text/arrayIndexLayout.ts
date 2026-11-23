import type { Vec3, WorldAnchor } from '../../contracts/world'
import { arrayCellTextGeometry } from '../../world/arrayCellGeometry'
import { textAdvance } from './textSystem'
import indexInk from './arrayIndexInkMetrics.json'

export function arrayCellIndexLabel(index:number,activity:'read'|'write'|null=null):string {
  return `[${index}]${activity==='write'?' ←':activity==='read'?' →':''}`
}

export const arrayIndexWidth=1.3
export const arrayIndexSize=(label:string)=>Math.min(.28,(arrayIndexWidth-.04)/textAdvance(label,500))

/** Bundled index ink about Troika's middle anchor. With normal line height,
 * baseline = -(ascender+descender)/2. Clearance never replaces the cell body. */
export function arrayCellCaptionPoints(cell: Pick<WorldAnchor,'position'|'size'>,label:string): Vec3[] {
  const {index}=arrayCellTextGeometry(cell)
  const size=arrayIndexSize(label),halfWidth=(textAdvance(label,500)*size+.04)/2
  const baseline=-(indexInk.ascender+indexInk.descender)/2
  const inkY=[indexInk.inkMinY,indexInk.inkMaxY].map(y=>(y+baseline)/indexInk.unitsPerEm*size)
  return [-halfWidth,halfWidth].flatMap(x=>inkY.map(y=>[index[0]+x,index[1]+y,index[2]] as Vec3))
}
