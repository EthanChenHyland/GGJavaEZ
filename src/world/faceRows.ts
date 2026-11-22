import type { PresentedEntity, SceneEntity,Vec3 } from '../contracts/world';
import { world } from '../theme/tokens';
import {collectionEntryFace} from './collectionFace';
import {frameFace} from './frameFace';
import {compactLibraryFace} from './firstObjectPresentation';
import {hasRecordedValuePort} from './valueText';
import {valueChipReferencePort} from './valueChipGeometry';
/** Shared by face drawing and correctness-required reference admission. */
export function faceRows(node: SceneEntity, presented: Pick<PresentedEntity,'detail'>&Partial<Pick<PresentedEntity,'rowSlotIds'>>) {
    const rows = node.kind === 'frame' || node.kind === 'class' ? node.rows : node.kind === 'object' ? node.groups.flatMap(g => g.rows).filter(row => !row.slotId.endsWith(':captured-string')) : node.kind === 'collection' ? node.entries.map((entry, index) => ({ ...entry, name: entry.key?.text ?? `[${index}]`, type: entry.value.kind === 'reference' ? entry.value.targetType : '' })) : [];
    if(node.kind==='collection'){
        const limit=presented.detail==='FAR'?0:presented.detail==='MEDIUM'?8:world.collection.rows*world.collection.columns;
        return{rows,visible:rows.slice(0,limit).filter((_,index)=>!!collectionEntryFace(node.anchor,index,node.collectionKind==='Map')),pitch:world.collection.pitch,header:world.object.header+world.collection.sizeRow,scopes:null};
    }
    const compact=node.kind==='object'&&compactLibraryFace(node.anchor);
    const header = compact?.7:node.kind === 'frame' ? world.frame.header : node.kind === 'class' ? world.classShelf.header : world.object.header;
    const pitch = compact?.55:node.kind === 'frame' ? world.frame.row : node.kind === 'class' ? world.classShelf.row : world.object.row;
    const padding = compact?.25:node.kind === 'frame' || node.kind === 'class' ? world.frame.pad : world.object.pad;
    const capacity = Math.max(0, Math.floor((node.anchor.size[1] - header - padding) / pitch + 1e-6));
    const limit = presented.detail === 'FAR' ? 0 : presented.detail === 'MEDIUM' ? 4 : node.kind === 'frame' ? 10 : 12;
    let count=Math.min(capacity,limit);
    const choose=()=>{
      if(presented.rowSlotIds?.length){
        // Frame storage may be windowed. Heap and Class rows have a fixed
        // face position, so only a physically anchored row can be promoted.
        const captured=new Set(rows.filter(row=>node.kind==='frame'||node.anchor.ports[row.slotId]).map(row=>row.slotId));
        const requested=[...new Set(presented.rowSlotIds)].filter(id=>captured.has(id)).slice(0,count);
        const chosen=new Set(requested);
        for(const row of rows){if(chosen.size>=count)break;chosen.add(row.slotId)}
        return rows.filter(row=>chosen.has(row.slotId));
      }
      return rows.slice(0,count);
    };
    let visible=choose(),scopes=node.kind==='frame'?frameFace(node,visible,pitch):null;
    while(count>0&&visible.length*pitch+(scopes?.extraHeight??0)>node.anchor.size[1]-header-padding+1e-6){
      count--;visible=choose();scopes=node.kind==='frame'?frameFace(node,visible,pitch):null;
    }
    return { rows, visible, pitch, header,scopes };
}

/** Matches the actual rendered row plane, including the bounded frame window.
 * This creates presentation geometry for real captured storage, never a value
 * or a permanent canonical port for an unobserved/retired row. */
export function faceRowPosition(node:SceneEntity,presented:Pick<PresentedEntity,'detail'>&Partial<Pick<PresentedEntity,'rowSlotIds'>>,slotId:string,model:ReturnType<typeof faceRows>=faceRows(node,presented)):Vec3|null {
    if(node.kind==='array'||node.kind==='collection')return null;
    const index=model.visible.findIndex(row=>row.slotId===slotId);
    if(index<0)return null;
    // A retired row can expose captured storage beyond the permanent port cut.
    // Window the whole visible face together so fallback chips cannot overlap
    // a remaining canonical row or disagree with its connector endpoint.
    const windowed=node.kind==='frame'&&(!!presented.rowSlotIds?.length||!!model.scopes?.dividers.length||model.visible.some(row=>!node.anchor.ports[row.slotId]));
    if(!windowed)return node.anchor.ports[slotId]??null;
    const [x,y,z]=node.anchor.position,[w,h,d]=node.anchor.size;
    return[x+w/2,y+h/2-model.header-model.pitch*(index+.5)-(model.scopes?.offsets.get(slotId)??0),z+d/2+.06];
}

/** Spatial evidence may attach only to an observed, non-null visible value. */
export function faceRowPort(node:SceneEntity,presented:Pick<PresentedEntity,'detail'>&Partial<Pick<PresentedEntity,'rowSlotIds'>>,slotId:string,model:ReturnType<typeof faceRows>=faceRows(node,presented)):Vec3|null {
    const row=model.visible.find(row=>row.slotId===slotId);
    const point=row&&hasRecordedValuePort(row.value)?faceRowPosition(node,presented,slotId,model):null;
    // A reference attaches to its value inset. Primitive transfers use the
    // existing frame boundary, not a glowing port on the primitive chip.
    return point&&row?.value.kind==='reference'?valueChipReferencePort(node.anchor,point[1]):point;
}
