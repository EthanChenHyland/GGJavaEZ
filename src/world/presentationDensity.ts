import type {SceneModel} from '../contracts/world'
import {presentationScale} from '../theme/tokens'

export function isDenseWorld(scene: SceneModel): boolean {
    return scene.order.frames.length + scene.order.objects.length + scene.order.classes.length >= presentationScale.denseThreshold
}

/** One useful Heap structure for the broad completed view. Its relationship
 * must originate at the visible entry, even after that invocation returns. */
export function overviewHeapSubject(scene: SceneModel, frame: string | undefined): string | undefined {
    if (!frame) return undefined
    const targets = new Set(scene.references.filter(reference => reference.sourceId === frame).map(reference => reference.targetId))
    return scene.order.objects.find(id => {
        const node = scene.entities[id]
        return targets.has(id) && node.anchor.region === 'heap' && (node.kind === 'collection' || node.kind === 'array' && node.length > 0)
    }) ?? scene.order.objects.find(id => targets.has(id) && scene.entities[id].anchor.region === 'heap')
}
