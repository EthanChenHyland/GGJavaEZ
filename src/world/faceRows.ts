import type { PresentedEntity, SceneEntity } from '../contracts/worldV2';
import { world } from '../theme/tokens';
import {collectionEntryFace} from './collectionFace';
/** Shared by face drawing and correctness-required reference admission. */
export function faceRows(node: SceneEntity, presented: Pick<PresentedEntity,'detail'>) {
    const rows = node.kind === 'frame' || node.kind === 'class' ? node.rows : node.kind === 'object' ? node.groups.flatMap(g => g.rows).filter(row => !row.slotId.endsWith(':captured-string')) : node.kind === 'collection' ? node.entries.map((entry, index) => ({ ...entry, name: entry.key?.text ?? `[${index}]`, type: entry.value.kind === 'reference' ? entry.value.targetType : '' })) : [];
    if(node.kind==='collection'){
        const limit=presented.detail==='FAR'?0:presented.detail==='MEDIUM'?8:world.collection.rows*world.collection.columns;
        return{rows,visible:rows.slice(0,limit).filter((_,index)=>!!collectionEntryFace(node.anchor,index,node.collectionKind==='Map')),pitch:world.collection.pitch,header:world.object.header+world.collection.sizeRow};
    }
    const compact=node.anchor.region==='library'&&node.kind==='object';
    const header = compact?.7:node.kind === 'frame' ? world.frame.header : node.kind === 'class' ? world.classShelf.header : world.object.header;
    const pitch = compact?.55:node.kind === 'frame' ? world.frame.row : node.kind === 'class' ? world.classShelf.row : world.object.row;
    const padding = compact?.25:node.kind === 'frame' || node.kind === 'class' ? world.frame.pad : world.object.pad;
    const capacity = Math.max(0, Math.floor((node.anchor.size[1] - header - padding) / pitch + 1e-6));
    const limit = presented.detail === 'FAR' ? 0 : presented.detail === 'MEDIUM' ? 4 : node.kind === 'frame' ? 10 : 12;
    const visible = rows.slice(0, Math.min(capacity, limit));
    return { rows, visible, pitch, header };
}
