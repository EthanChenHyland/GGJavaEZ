import type { PresentedEntity, SceneEntity,Vec3 } from '../contracts/worldV2';
import { world } from '../theme/tokens';
import {collectionEntryFace} from './collectionFace';
/** Shared by face drawing and correctness-required reference admission. */
export function faceRows(node: SceneEntity, presented: Pick<PresentedEntity,'detail'>&Partial<Pick<PresentedEntity,'rowSlotIds'>>) {
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
    const count=Math.min(capacity,limit);
    let visible=rows.slice(0,count);
    if(node.kind==='frame'&&presented.rowSlotIds?.length){
        const captured=new Set(rows.map(row=>row.slotId));
        const requested=[...new Set(presented.rowSlotIds)].filter(id=>captured.has(id)).slice(0,count);
        const chosen=new Set(requested);
        for(const row of rows){if(chosen.size>=count)break;chosen.add(row.slotId)}
        visible=rows.filter(row=>chosen.has(row.slotId));
    }
    return { rows, visible, pitch, header };
}

/** Matches the actual rendered row plane, including the bounded frame window.
 * This creates presentation geometry for real captured storage, never a value
 * or a permanent canonical port for an unobserved/retired row. */
export function faceRowPort(node:SceneEntity,presented:Pick<PresentedEntity,'detail'>&Partial<Pick<PresentedEntity,'rowSlotIds'>>,slotId:string,model:ReturnType<typeof faceRows>=faceRows(node,presented)):Vec3|null {
    if(node.kind==='array'||node.kind==='collection')return null;
    const index=model.visible.findIndex(row=>row.slotId===slotId);
    if(index<0)return null;
    if(!(node.kind==='frame'&&presented.rowSlotIds?.length))return node.anchor.ports[slotId]??null;
    const [x,y,z]=node.anchor.position,[w,h,d]=node.anchor.size;
    return[x+w/2,y+h/2-model.header-model.pitch*(index+.5),z+d/2+.06];
}
