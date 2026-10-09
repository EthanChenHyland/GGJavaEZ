import type { PresentationPlan, PresentedEntity, SceneEntity } from '../contracts/worldV2';
import { color } from '../theme/tokens';
import { frameStatusText } from '../world/frameStatus';
import { notRecordedValue, truncateFrameText } from '../world/valueText';
import { WorldText } from './FaceText';
import { faceRows } from './faceModel';
import { displayType } from '../world/displayType';
export { WorldText } from './FaceText';
/** Face labels share the solid/row geometry model and one glyph batch. */
export function RuntimeSolid({ node, presented, plan }: {
    node: SceneEntity;
    presented: PresentedEntity;
    plan: PresentationPlan;
}) {
    if (presented.mode !== 'detailed')
        return null;
    const { anchor } = node, [x, y, z] = anchor.position, [w, h, d] = anchor.size, top = y + h / 2, face = z + d / 2 + .085, left = x - w / 2 + .28, opacity = presented.opacity;
    const model = faceRows(node, presented);
    const title = node.kind === 'frame' ? `${truncateFrameText(node.title)} #${node.invocationNumber}` : node.kind === 'class' ? node.title : `${node.title} #${node.displayId}`;
    const emphasis = presented.highlight === 'exception' ? color.semantic.exception : presented.highlight === 'mutation' ? color.semantic.mutation : color.ui.textSecondary;
    const string = node.kind === 'object' ? node.groups.flatMap(g => g.rows).find(row => row.slotId.endsWith(':captured-string')) : null;
    return <group>
    <WorldText position={[left, top - .45, face]} weight={600} size={node.anchor.region==='library'?.3:.4} width={w - .55} opacity={opacity}>{title}</WorldText>
    {node.kind === 'frame' && <WorldText position={[left, top - .94, face]} size={.25} tint={emphasis} opacity={opacity}>{frameStatusText(node.status)}</WorldText>}
    {node.kind === 'class' && <WorldText position={[left, top - .85, face]} size={.23} tint={color.ui.textSecondary} opacity={opacity}>{`static · ${node.initialization}`}</WorldText>}
    {string && <WorldText position={[left, top - 1.2, face]} size={.3} width={w - .55} opacity={opacity}>{string.value.text}</WorldText>}
    {node.kind === 'array' && <WorldText position={[x + w / 2 - .25, top - .45, face]} size={.25} tint={color.ui.textSecondary} align="right" width={1.5} opacity={opacity}>{`length ${node.length}`}</WorldText>}
    {node.kind==='object'&&node.anchor.region!=='library'&&node.groups.map(group=>{
      const first=group.rows.find(row=>row.declaringClass&&model.visible.some(visible=>visible.slotId===row.slotId)&&row.port);
      return first?.port?<WorldText key={group.declaringClass} position={[left,first.port[1]+model.pitch/2+.3,face]} size={.23} tint={color.ui.textMuted} opacity={opacity}>{displayType(group.declaringClass)}</WorldText>:null
    })}
    {model.visible.map((row, index) => {
            const ry = anchor.ports[row.slotId]?.[1] ?? top - model.header - model.pitch * (index + .5), value = row.value, mutation = node.kind === 'object' && node.mutation?.slotId === row.slotId;
            return <group key={row.slotId}>
        <WorldText position={[left + .1, ry, face + .015]} weight={500} size={node.anchor.region==='library'?.23:.32} width={w * .38} tint={color.ui.textSecondary} opacity={opacity}>{row.name}</WorldText>
        <WorldText position={[x + w / 2 - .4, ry, face + .015]} weight={600} size={node.anchor.region==='library'?.25:.34} width={w * .52} align="right" tint={mutation ? color.semantic.mutation : value.kind === 'reference' ? color.semantic.execution : value.kind === 'not-recorded' ? color.ui.textMuted : color.ui.text} opacity={opacity}>{value.text}</WorldText>
      </group>;
        })}
    {model.rows.length > model.visible.length && presented.detail !== 'FAR' && <WorldText position={[left, y - h / 2 + .3, face]} size={.22} tint={color.ui.textSecondary} opacity={opacity}>{`+${model.rows.length - model.visible.length} more`}</WorldText>}
    {node.kind === 'object' && node.summaryUnavailable && <WorldText position={[left, top - 1.2, face]} size={.23} tint={color.ui.textMuted} opacity={opacity}>summary not recorded</WorldText>}
    {node.kind === 'array' && [...(plan.cellWindows.get(node.id)?.mapping ?? [])].map(([id, cell]) => {
            const captured = node.cells.find(c => c.index === cell.index), value = captured?.value ?? notRecordedValue(), [cx, cy, cz] = cell.anchor.position;
            return <group key={id}>
        <WorldText position={[cx, cy + .38, cz + .83]} size={.22} width={1.3} align="center" tint={color.ui.textSecondary} opacity={opacity}>{`[${cell.index}]`}</WorldText>
        <WorldText position={[cx, cy - .1, cz + .83]} size={.34} width={1.3} align="center" tint={value.kind === 'reference' ? color.semantic.execution : color.ui.text} opacity={opacity}>{value.text}</WorldText>
      </group>;
        })}
  </group>;
}
