import { observedArrayCell } from '../world/arrayCellTarget'
import type { ArrayWindow, PresentedEntity, SceneEntity } from '../contracts/world';
import { color } from '../theme/tokens';
import { frameStatusText } from '../world/frameStatus';
import { notRecordedValue, truncateFrameText } from '../world/valueText';
import { FaceTextOpacity, WorldText } from './FaceText';
import { faceRows } from './faceModel';
import {faceRowPosition} from '../world/faceRows';
import { displayType } from '../world/displayType';
import {faceRowColumns,faceHeading,faceRowFont,faceValueInset,faceValueLayout} from './text/faceTypography';
import {fitWorldText} from './text/textSystem';
import {collectionEntryFace,collectionFaceSummary} from '../world/collectionFace';
import {world} from '../theme/tokens';
import {compactLibraryFace} from '../world/firstObjectPresentation';
import {memo} from 'react';
import {arrayCellTargeted,arrayCellFocusOpacity} from './arrayCellStyle';
import {arrayCellTextGeometry} from '../world/arrayCellGeometry';
import {arrayCellIndexLabel,arrayIndexSize,arrayIndexWidth} from './text/arrayIndexLayout';
import {arrayReferenceTextWidth,collectionReferenceTextWidth} from '../world/structureValueChipGeometry';
export { WorldText } from './FaceText';
// Observations can replace evidence/value wrappers without changing a cell's
// face. Keep the label subtree stable using its actual presentation scalars.
const ArrayCellLabels=memo(function ArrayCellLabels({entityId,slotId,x,y,z,indexLabel,valueText,indexTint,valueTint,opacity,valueWidth}:{
    entityId:string;slotId:string;x:number;y:number;z:number;indexLabel:string;valueText:string;indexTint:string;valueTint:string;opacity:number;valueWidth:number;
}){
    const geometry=arrayCellTextGeometry({position:[x,y,z],size:[world.array.cell,world.array.cell,world.array.cell]});
    return <group>
        <WorldText position={geometry.index} size={arrayIndexSize(indexLabel)} weight={500} width={arrayIndexWidth} align="center" tint={indexTint} opacity={opacity} arrayText={{entityId,slotId,kind:'index'}}>{indexLabel}</WorldText>
        <WorldText position={geometry.value} size={.34} weight={600} width={valueWidth} align="center" tint={valueTint} opacity={opacity} truncation="end" arrayText={{entityId,slotId,kind:'value'}}>{valueText}</WorldText>
    </group>;
});
type RuntimeSolidProps={
    node: SceneEntity;
    presented: PresentedEntity;
    arrayWindow?: ArrayWindow;
    shortFrameTitle?: boolean;
};
function sameFaceLabels(prior:RuntimeSolidProps,next:RuntimeSolidProps){
    return prior.node===next.node
        &&prior.presented.mode===next.presented.mode&&prior.presented.detail===next.presented.detail
        &&prior.presented.highlight===next.presented.highlight
        &&prior.presented.rowSlotIds===next.presented.rowSlotIds
        &&prior.arrayWindow===next.arrayWindow&&prior.shortFrameTitle===next.shortFrameTitle;
}
/** Face labels share the solid/row geometry model and one glyph batch. */
export const RuntimeSolid=memo(function RuntimeSolid(props:RuntimeSolidProps){
    if(props.presented.mode!=='detailed')return null;
    return <FaceTextOpacity opacity={props.presented.opacity}><RuntimeSolidLabels {...props}/></FaceTextOpacity>;
},(prior,next)=>prior.presented.opacity===next.presented.opacity&&sameFaceLabels(prior,next));
const RuntimeSolidLabels=memo(function RuntimeSolidLabels({node,presented,arrayWindow,shortFrameTitle}:RuntimeSolidProps) {
    if (presented.mode !== 'detailed')
        return null;
    const { anchor } = node, [x, y, z] = anchor.position, [w, h, d] = anchor.size, top = y + h / 2, face = z + d / 2 + .085, left = x - w / 2 + .28, opacity = 1;
    const model = faceRows(node, presented);
    const collection=node.kind==='collection'?collectionFaceSummary(node,model.visible.length):null;
    const targeted=arrayWindow?arrayCellTargeted(presented,arrayWindow):()=>false;
    const cellFocusOpacity=arrayWindow?arrayCellFocusOpacity(arrayWindow):()=>1;
    const compact=compactLibraryFace(anchor);
    const identity=node.kind==='frame'?`#${node.invocationNumber}`:node.kind==='class'?'':`#${node.displayId}`;
    const heading=faceHeading(node,shortFrameTitle),titleSize=heading.title.size;
    const {identityWidth,length,parameters}=heading;
    const titleWidth=heading.title.width,titleLines=heading.title.lines,title=titleLines?.join('')??fitWorldText(truncateFrameText(node.title),titleWidth,titleSize,600,0,28);
    const columns=faceRowColumns(node,presented,model);
    const emphasis = presented.highlight === 'exception' ? color.semantic.exception
        : presented.highlight === 'mutation' ? color.semantic.mutation
        : node.kind === 'frame' && node.status.kind === 'running' ? color.ui.textMuted
        : color.ui.textSecondary;
    const string = node.kind === 'object' ? node.groups.flatMap(g => g.rows).find(row => row.slotId.endsWith(':captured-string')) : null;
    return <>
    <WorldText position={heading.title.position} weight={600} size={titleSize} width={titleWidth} lines={titleLines} opacity={opacity} heading={{entityId:node.id,kind:'title'}}>{title}</WorldText>
    {parameters&&<WorldText position={parameters.position} size={parameters.size} width={parameters.width} tint={color.ui.textSecondary} opacity={opacity}>{parameters.text}</WorldText>}
    {identity&&heading.identity&&<WorldText position={heading.identity.position} weight={500} size={heading.identity.size} align="right" width={identityWidth} tint={node.kind==='frame'||node.kind==='object'?color.ui.textSecondary:color.ui.text} opacity={opacity} heading={{entityId:node.id,kind:'identity'}}>{identity}</WorldText>}
    {node.kind === 'frame' && <WorldText position={[left, top - .94, face]} size={node.status.kind==='running'?.22:.25} width={w-.56} tint={emphasis} opacity={opacity}>{frameStatusText(node.status)}</WorldText>}
    {node.kind === 'class' && <WorldText position={[left, top - .85, face]} size={.23} tint={color.ui.textSecondary} opacity={opacity}>{`static · ${node.initialization}`}</WorldText>}
    {string && <WorldText position={[left, top - 1.2, face]} size={.3} width={w - .55} opacity={opacity}>{string.value.text}</WorldText>}
    {length && <WorldText position={length.position} size={length.size} tint={color.ui.textSecondary} align="right" width={length.width} opacity={opacity} heading={{entityId:node.id,kind:'length'}}>{length.text}</WorldText>}
    {node.kind==='array'&&node.length>16&&arrayWindow&&arrayWindow.hiddenCount>0&&presented.detail!=='FAR'&&<WorldText position={[heading.title.position[0],top-.68,heading.title.position[2]]} size={.26} width={titleWidth} tint={color.ui.textSecondary} opacity={opacity}>{`${arrayWindow.visible.length} shown · ${arrayWindow.hiddenCount} hidden`}</WorldText>}
    {collection&&presented.detail!=='FAR'&&top-world.object.header-world.collection.sizeRow*.86>=y-h/2+world.object.pad&&<WorldText position={[left,top-world.object.header-world.collection.sizeRow/2,face+.015]} size={world.collection.labelSize} width={w-.56} opacity={opacity} tint={color.ui.textSecondary} collectionText={{entityId:node.id,kind:'size'}}>{collection.sizeCaption}</WorldText>}
    {node.kind==='object'&&node.anchor.region!=='library'&&node.groups.map(group=>{
      if(node.groups.length===1&&displayType(group.declaringClass)===node.title)return null;
      const first=group.rows.find(row=>row.declaringClass&&model.visible.some(visible=>visible.slotId===row.slotId)),point=first?faceRowPosition(node,presented,first.slotId,model):null;
      return point?<WorldText key={group.declaringClass} position={[left,point[1]+model.pitch/2+.3,face]} size={.23} tint={color.ui.textMuted} opacity={opacity}>{displayType(group.declaringClass)}</WorldText>:null
    })}
    {model.scopes?.dividers.map(divider=><WorldText key={divider.beforeSlotId} position={[left+divider.depth*world.frame.scopeIndent,top-model.header-divider.offset,face+.015]} size={.23} width={Math.max(.1,w-.56-divider.depth*world.frame.scopeIndent)} opacity={opacity} tint={color.ui.textMuted} frameText={{entityId:node.id,kind:'scope',slotId:divider.beforeSlotId}}>{divider.label}</WorldText>)}
    {model.visible.map((row, index) => {
            if(node.kind==='collection'){
                const entryIndex=node.entries.findIndex(entry=>entry.slotId===row.slotId),entry=node.entries[entryIndex],geometry=collectionEntryFace(anchor,entryIndex,node.collectionKind==='Map');if(!geometry||!entry)return null;
                const label=(value:typeof entry.value,point:readonly[number,number,number],kind:'key'|'value',slotId?:string)=><WorldText position={[point[0],point[1],face+.015]} align="center" size={world.collection.labelSize} weight={600} width={value.kind==='reference'?collectionReferenceTextWidth(anchor,entryIndex,node.collectionKind==='Map'):geometry.valueWidth-.08} opacity={opacity} tint={value.kind==='reference'?color.semantic.execution:value.kind==='not-recorded'?color.ui.textMuted:color.ui.text} collectionText={{entityId:node.id,kind,slotId}}>{value.text}</WorldText>;
                return <group key={entry.slotId}>{label(entry.value,geometry.value,'value',entry.slotId)}{entry.key&&geometry.key&&label(entry.key,geometry.key,'key',entry.keySlotId)}</group>;
            }
            const ry = faceRowPosition(node,presented,row.slotId,model)?.[1] ?? top - model.header - model.pitch * (index + .5), value = row.value, mutation = node.kind === 'object' && node.mutation?.slotId === row.slotId;
            const indent=node.kind==='frame'&&'scopeDepth'in row?(row.scopeDepth??0)*world.frame.scopeIndent:0;
            const chip=faceValueLayout(value,columns.value,compact,mutation);
            return <group key={row.slotId}>
        <WorldText position={[left+indent, ry, face + .015]} weight={500} size={compact?faceRowFont.compactName:faceRowFont.name} width={Math.max(.1,columns.name-indent)} tint={color.ui.textSecondary} opacity={opacity} frameText={node.kind==='frame'?{entityId:node.id,kind:'name',slotId:row.slotId}:undefined}>{presented.detail==='MEDIUM'?`${row.name} →`:row.name}</WorldText>
        {presented.detail!=='MEDIUM'&&<WorldText position={[left+columns.typeOffset,ry,face+.015]} size={compact?faceRowFont.compactType:faceRowFont.type} width={columns.type} tint={color.ui.textMuted} opacity={opacity}>{displayType(row.type)}</WorldText>}
        <WorldText position={[x + w / 2 - .28 - faceValueInset, ry, face + .015]} weight={chip.weight} size={chip.size} width={chip.width} align="right" tint={mutation ? color.semantic.mutation : value.kind === 'reference' ? color.semantic.execution : value.kind === 'not-recorded' ? color.ui.textMuted : color.ui.text} opacity={opacity} frameText={node.kind==='frame'?{entityId:node.id,kind:'value',slotId:row.slotId}:undefined}>{chip.text}</WorldText>
      </group>;
        })}
    {presented.detail!=='FAR'&&collection?.coverageCaption&&<WorldText position={[x-w/2+.14,y-h/2+.3,face]} size={world.collection.labelSize} width={w-.28} tint={color.ui.textSecondary} opacity={opacity} collectionText={{entityId:node.id,kind:'more'}}>{collection.coverageCaption}</WorldText>}
    {!collection&&model.rows.length>model.visible.length&&presented.detail!=='FAR'&&<WorldText position={[left,y-h/2+.3,face]} size={.22} width={w-.56} tint={color.ui.textSecondary} opacity={opacity}>{`+${model.rows.length-model.visible.length} more`}</WorldText>}
    {node.kind === 'object' && node.summaryUnavailable && <WorldText position={[left, top - 1.2, face]} size={.23} tint={color.ui.textMuted} opacity={opacity}>summary not recorded</WorldText>}
    {node.kind === 'array' && [...(arrayWindow?.mapping ?? [])].map(([id, cell]) => {
            const captured = observedArrayCell(node.cells,cell.index), value = captured?.value ?? notRecordedValue(), [cx, cy, cz] = cell.anchor.position;
            const activity=node.activity?.index===cell.index?node.activity.kind:null;
            const activityTint=targeted(id)?color.semantic.execution:activity==='write'?color.semantic.mutation:activity==='read'?color.semantic.execution:null;
            return <ArrayCellLabels key={id} entityId={node.id} slotId={id} x={cx} y={cy} z={cz}
                indexLabel={arrayCellIndexLabel(cell.index,activity)} valueText={value.text}
                valueWidth={value.kind==='reference'&&value.observation!=='UNAVAILABLE'?arrayReferenceTextWidth:1.3}
                indexTint={activityTint??color.ui.textSecondary}
                valueTint={activityTint??(value.kind==='reference'?color.semantic.execution:color.ui.text)} opacity={opacity*cellFocusOpacity(id)}/>;
        })}
  </>;
},sameFaceLabels);
