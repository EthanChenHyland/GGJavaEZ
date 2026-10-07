import type { SceneClassNode } from '../../contracts/world'
import { StorageSolid, type ObjectSolidProps } from './ObjectSolid'

export interface ClassSolidProps extends Omit<ObjectSolidProps, 'node'> {
  node: SceneClassNode
  /** The composition seam maps the actual class ID to selection kind 'class'. */
  onSelect: (id: string) => void
}

/** Actual class storage, never an instance invented to host static fields. */
export function ClassSolid({ animateEntry = false, ...props }: ClassSolidProps) {
  return <StorageSolid {...props} animateEntry={animateEntry} />
}
