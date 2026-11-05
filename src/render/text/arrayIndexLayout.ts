import type { Vec3, WorldAnchor } from '../../contracts/world'
import { arrayCellTextGeometry } from '../../world/arrayCellGeometry'
import { fitWorldText, textAdvance } from './textSystem'
import indexInk from './arrayIndexInkMetrics.json'

export function arrayCellIndexLabel(index:number,activity:'read'|'write'|null=null):string {
  return `[${index}]${activity==='write'?' ←':activity==='read'?' →':''}`
}

/** Bundled index ink about Troika's middle anchor. With normal line height,
 * baseline = -(ascender+descender)/2. Clearance never replaces the cell body. */
export function arrayCellCaptionPoints(cell: Pick<WorldAnchor,'position'|'size'>,label:string): Vec3[] {
  const {index}=arrayCellTextGeometry(cell)
  const halfWidth=Math.min(1.3,textAdvance(fitWorldText(label,1.3,.28,500),500)*.28+.04)/2
  const baseline=-(indexInk.ascender+indexInk.descender)/2
  const inkY=[indexInk.inkMinY,indexInk.inkMaxY].map(y=>(y+baseline)/indexInk.unitsPerEm*.28)
  return [-halfWidth,halfWidth].flatMap(x=>inkY.map(y=>[index[0]+x,index[1]+y,index[2]] as Vec3))
}
