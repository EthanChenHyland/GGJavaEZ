import type { PresentationPlan, PresentedEntity, SceneEntity } from '../contracts/worldV2';
import { color } from '../theme/tokens';
import { frameStatusText } from '../world/frameStatus';
import { notRecordedValue, truncateFrameText } from '../world/valueText';
import { WorldText } from './FaceText';
import { faceRows } from './faceModel';
import {faceRowPort} from '../world/faceRows';
import { displayType } from '../world/displayType';
import {faceColumns,faceHeading,rowValueLabel} from './text/faceTypography';
import {fitWorldText,textAdvance} from './text/textSystem';
import {collectionEntryFace} from '../world/collectionFace';
import {world} from '../theme/tokens';
import {compactLibraryFace} from '../world/firstObjectPresentation';
import {memo} from 'react';
export { WorldText } from './FaceText';
/** Face labels share the solid/row geometry model and one glyph batch. */
export const RuntimeSolid=memo(function RuntimeSolid({ node, presented, plan }: {
    node: SceneEntity;
    presented: PresentedEntity;
    plan: PresentationPlan;
}) {
    if (presented.mode !== 'detailed')
        return null;
    const { anchor } = node, [x, y, z] = anchor.position, [w, h, d] = anchor.size, top = y + h / 2, face = z + d / 2 + .085, left = x - w / 2 + .28, opacity = presented.opacity;
    const model = faceRows(node, presented);
    const compact=compactLibraryFace(anchor);
    const identity=node.kind==='frame'?`#${node.invocationNumber}`:node.kind==='class'?'':`#${node.displayId}`;
    const heading=faceHeading(node),titleSize=heading.title.size;
    const identityWidth=identity?textAdvance(identity,500)*(heading.identity?.size??.28)+.04:0;
    const lengthLabel=node.kind==='array'?`length ${node.length}`:null;
    const metadataWidth=Math.max(identityWidth,lengthLabel?textAdvance(lengthLabel)*.25+.04:0);
    const titleWidth=Math.max(.1,w-.56-metadataWidth-(metadataWidth?.2:0)),title=fitWorldText(truncateFrameText(node.title),titleWidth,titleSize,600,0,28);
    const columns=faceColumns(w,presented.detail);
    const emphasis = presented.highlight === 'exception' ? color.semantic.exception : presented.highlight === 'mutation' ? color.semantic.mutation : color.ui.textSecondary;
    const string = node.kind === 'object' ? node.groups.flatMap(g => g.rows).find(row => row.slotId.endsWith(':captured-string')) : null;
    return <group>
    <WorldText position={heading.title.position} weight={600} size={titleSize} width={titleWidth} opacity={opacity} heading={{entityId:node.id,kind:'title'}}>{title}</WorldText>
    {identity&&heading.identity&&<WorldText position={heading.identity.position} weight={500} size={heading.identity.size} align="right" width={identityWidth} opacity={opacity} heading={{entityId:node.id,kind:'identity'}}>{identity}</WorldText>}
    {node.kind === 'frame' && <WorldText position={[left, top - .94, face]} size={.25} tint={emphasis} opacity={opacity}>{frameStatusText(node.status)}</WorldText>}
    {node.kind === 'class' && <WorldText position={[left, top - .85, face]} size={.23} tint={color.ui.textSecondary} opacity={opacity}>{`static · ${node.initialization}`}</WorldText>}
    {string && <WorldText position={[left, top - 1.2, face]} size={.3} width={w - .55} opacity={opacity}>{string.value.text}</WorldText>}
    {lengthLabel && <WorldText position={[x + w / 2 - .28, top - .28, face]} size={.25} tint={color.ui.textSecondary} align="right" width={metadataWidth} opacity={opacity}>{lengthLabel}</WorldText>}
    {node.kind==='collection'&&presented.detail!=='FAR'&&top-world.object.header-world.collection.sizeRow*.86>=y-h/2+world.object.pad&&<WorldText position={[left,top-world.object.header-world.collection.sizeRow/2,face+.015]} size={.34} width={w-.56} opacity={opacity} tint={color.ui.textSecondary} collectionText={{entityId:node.id,kind:'size'}}>{`size = ${node.size}`}</WorldText>}
    {node.kind==='object'&&node.anchor.region!=='library'&&node.groups.map(group=>{
      const first=group.rows.find(row=>row.declaringClass&&model.visible.some(visible=>visible.slotId===row.slotId)&&row.port);
      return first?.port?<WorldText key={group.declaringClass} position={[left,first.port[1]+model.pitch/2+.3,face]} size={.23} tint={color.ui.textMuted} opacity={opacity}>{displayType(group.declaringClass)}</WorldText>:null
    })}
    {model.scopes?.dividers.map(divider=><WorldText key={divider.beforeSlotId} position={[left+divider.depth*world.frame.scopeIndent,top-model.header-divider.offset,face+.015]} size={.23} width={Math.max(.1,w-.56-divider.depth*world.frame.scopeIndent)} opacity={opacity} tint={color.ui.textMuted} frameText={{entityId:node.id,kind:'scope',slotId:divider.beforeSlotId}}>{divider.label}</WorldText>)}
    {model.visible.map((row, index) => {
            if(node.kind==='collection'){
                const entryIndex=node.entries.findIndex(entry=>entry.slotId===row.slotId),entry=node.entries[entryIndex],geometry=collectionEntryFace(anchor,entryIndex,node.collectionKind==='Map');if(!geometry||!entry)return null;
                const label=(value:typeof entry.value,point:readonly[number,number,number],kind:'key'|'value',slotId?:string)=><WorldText position={[point[0],point[1],face+.015]} align="center" size={.34} weight={600} width={geometry.valueWidth-.08} opacity={opacity} tint={value.kind==='reference'?color.semantic.execution:value.kind==='not-recorded'?color.ui.textMuted:color.ui.text} collectionText={{entityId:node.id,kind,slotId}}>{rowValueLabel(value)}</WorldText>;
                return <group key={entry.slotId}>{label(entry.value,geometry.value,'value',entry.slotId)}{entry.key&&geometry.key&&label(entry.key,geometry.key,'key',entry.keySlotId)}</group>;
            }
            const ry = faceRowPort(node,presented,row.slotId,model)?.[1] ?? top - model.header - model.pitch * (index + .5), value = row.value, mutation = node.kind === 'object' && node.mutation?.slotId === row.slotId;
            const indent=node.kind==='frame'&&'scopeDepth'in row?(row.scopeDepth??0)*world.frame.scopeIndent:0;
            return <group key={row.slotId}>
        <WorldText position={[left+indent, ry, face + .015]} weight={500} size={compact?.23:.32} width={Math.max(.1,columns.name-indent)} tint={color.ui.textSecondary} opacity={opacity} frameText={node.kind==='frame'?{entityId:node.id,kind:'name',slotId:row.slotId}:undefined}>{presented.detail==='MEDIUM'?`${row.name} →`:row.name}</WorldText>
        {presented.detail!=='MEDIUM'&&<WorldText position={[left+columns.typeOffset,ry,face+.015]} size={compact?.20:.27} width={columns.type} tint={color.ui.textMuted} opacity={opacity}>{displayType(row.type)}</WorldText>}
        <WorldText position={[x + w / 2 - .28, ry, face + .015]} weight={600} size={compact?.25:.34} width={columns.value} align="right" tint={mutation ? color.semantic.mutation : value.kind === 'reference' ? color.semantic.execution : value.kind === 'not-recorded' ? color.ui.textMuted : color.ui.text} opacity={opacity} frameText={node.kind==='frame'?{entityId:node.id,kind:'value',slotId:row.slotId}:undefined}>{rowValueLabel(value)}</WorldText>
      </group>;
        })}
    {(node.kind==='collection'?node.size:model.rows.length)>model.visible.length && presented.detail !== 'FAR' && <WorldText position={[left, y - h / 2 + .3, face]} size={node.kind==='collection'?.34:.22} width={w-.56} tint={color.ui.textSecondary} opacity={opacity} collectionText={node.kind==='collection'?{entityId:node.id,kind:'more'}:undefined}>{`+${(node.kind==='collection'?node.size:model.rows.length) - model.visible.length} more`}</WorldText>}
    {node.kind === 'object' && node.summaryUnavailable && <WorldText position={[left, top - 1.2, face]} size={.23} tint={color.ui.textMuted} opacity={opacity}>summary not recorded</WorldText>}
    {node.kind === 'array' && [...(plan.cellWindows.get(node.id)?.mapping ?? [])].map(([id, cell]) => {
            const captured = node.cells.find(c => c.index === cell.index), value = captured?.value ?? notRecordedValue(), [cx, cy, cz] = cell.anchor.position;
            const activity=node.activity?.index===cell.index?node.activity.kind:null;
            const activityTint=activity==='write'?color.semantic.mutation:activity==='read'?color.semantic.execution:null;
            return <group key={id}>
        <WorldText position={[cx, cy + .38, cz + .83]} size={.28} width={1.3} align="center" tint={activityTint??color.ui.textSecondary} opacity={opacity}>{`[${cell.index}]${activity==='write'?' ←':activity==='read'?' →':''}`}</WorldText>
        <WorldText position={[cx, cy - .1, cz + .83]} size={.34} width={1.3} align="center" tint={activityTint??(value.kind === 'reference' ? color.semantic.execution : color.ui.text)} opacity={opacity}>{value.text}</WorldText>
      </group>;
        })}
  </group>;
},(prior,next)=>prior.node===next.node
    &&prior.presented.mode===next.presented.mode&&prior.presented.detail===next.presented.detail
    &&prior.presented.opacity===next.presented.opacity&&prior.presented.highlight===next.presented.highlight
    &&prior.presented.rowSlotIds===next.presented.rowSlotIds
    &&(next.node.kind!=='array'||prior.plan.cellWindows.get(next.node.id)===next.plan.cellWindows.get(next.node.id)));
