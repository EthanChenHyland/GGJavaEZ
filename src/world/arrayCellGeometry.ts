import type { Vec3, WorldAnchor } from '../contracts/world'
import { world } from '../theme/tokens'

export function arrayTitlePlate(tray: WorldAnchor): WorldAnchor {
  const { titlePlate, backplate } = world.array
  const [x, y, z] = tray.position
  const centerY = y + tray.size[1] / 2 - titlePlate / 2
  return { ...tray, position: [x, centerY, z], size: [tray.size[0], titlePlate, backplate],
    ports: {}, bodyPort: [x, centerY, z + backplate / 2] }
}

/** The tray already reserves indexLabel space in its initial height. Spend
 * that space before the first row, clear of the title, rather than below it. */
export function arrayCellPosition(tray: WorldAnchor, presentedSlot: number, columns: number, tokens=world.array): Vec3 {
  const {cell,gap,titlePlate,indexLabel}=tokens,pitch=cell+gap
  return [
    tray.position[0]-tray.size[0]/2+cell/2+(presentedSlot%columns)*pitch,
    tray.position[1]+tray.size[1]/2-titlePlate-indexLabel-cell/2-Math.floor(presentedSlot/columns)*pitch,
    tray.position[2]+tray.size[2]/2-cell/2,
  ]
}

/** Actual world positions used by labels and subsequent framing clearance.
 * The front offset retains the established plate/text depth separation. */
export function arrayCellTextGeometry(cell: Pick<WorldAnchor,'position'|'size'>): {index:Vec3;value:Vec3} {
  const [x,y,z]=cell.position,front=z+cell.size[2]/2+.055
  return {index:[x,y+cell.size[1]/2+world.array.indexLabel,front],value:[x,y,z+cell.size[2]/2+.1]}
}
