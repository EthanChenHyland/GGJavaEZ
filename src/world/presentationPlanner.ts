import {exceptionPanelFor,exceptionPanelAnchor} from './exceptionPanelPlacement'
import type { Selection } from '../contracts/interaction';
import type { DetailLevel, EntityId, LayoutState, MaterialRole, PresentationPlan, PresentedCurve, PresentedEntity, SceneEntity, SceneModel, TraceScope, Vec3, WorldAnchor } from '../contracts/worldV2';
import { budgets, world } from '../theme/tokens';
import { computeArrayWindow, type ArrayWindow } from './arrayWindow';
import type { FlowCatalog, SceneFlow } from './flowCatalog';
import type { FlowEndpoint } from '../motion/semanticTransition';
import { arrayCellTarget } from './arrayCellTarget';
import { connectorClearsFaces, roundedConnectorPoints, surfaceConnectorPoints } from './connectorRouting';
import {presentationClusters} from './presentationClusters';
import {recordedOwnership} from './recordedOwnership';
import {faceRows} from './faceRows';
export interface PlanInput {
    scene: SceneModel;
    flows?: FlowCatalog;
    layout: LayoutState;
    detailLevel: DetailLevel;
    selection: Selection;
    focusTargetId: EntityId | null;
    clusterTravelMemberId?: EntityId;
    trace: {
        active: boolean;
        scope: TraceScope;
    };
}
export function anchorCorners(anchor: WorldAnchor): Vec3[] {
    return [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [anchor.position[0] + x * anchor.size[0] / 2, anchor.position[1] + y * anchor.size[1] / 2, anchor.position[2] + z * anchor.size[2] / 2] as Vec3)));
}
export function curvedPath(from: Vec3, to: Vec3, left = false): Vec3[] {
    const reach = Math.max(.6, Math.min(3, Math.abs(to[0] - from[0]) * .35 + Math.abs(to[1] - from[1]) * .1));
    const a: Vec3 = [from[0] + (left ? -reach : reach), from[1], from[2] + .5];
    const b: Vec3 = [to[0] - reach, to[1], to[2] + .5];
    return Array.from({ length: 33 }, (_, i) => {
        const t = i / 32, u = 1 - t;
        return from.map((v, axis) => u ** 3 * v + 3 * u ** 2 * t * a[axis] + 3 * u * t ** 2 * b[axis] + t ** 3 * to[axis]) as unknown as Vec3;
    });
}
const category = (node: SceneEntity): 'frames' | 'objects' | 'classes' => node.kind === 'frame' ? 'frames' : node.kind === 'class' ? 'classes' : 'objects';
const rowIds = (node: SceneEntity): readonly string[] => node.kind === 'frame' || node.kind === 'class' ? node.rows.map(r => r.slotId) : node.kind === 'object' ? node.groups.flatMap(g => g.rows.map(r => r.slotId)) : node.kind === 'array' ? node.cells.map(c => c.slotId) : node.entries.flatMap(e => e.keySlotId ? [e.slotId, e.keySlotId] : [e.slotId]);
/** Complete catalog in, one accounted hierarchy cut out. Required identities cannot be budgeted away. */
export function planPresentation(input: PlanInput, previous?: PresentationPlan): PresentationPlan {
    const { scene, layout, detailLevel, selection, focusTargetId, trace } = input, budget = budgets[detailLevel];
    const exceptionPanel=exceptionPanelFor(scene),forensicState=!!exceptionPanel;
    const ids = [...scene.order.frames, ...scene.order.objects, ...scene.order.classes];
    const owners = new Map<string, string>();
    for (const id of ids)
        for (const slot of rowIds(scene.entities[id]))
            owners.set(slot, id);
    const owner = (id: string | null | undefined) => id ? scene.entities[id] ? id : owners.get(id) ?? arrayCellTarget(scene,id)?.array.id ?? null : null;
    const selectedRef = selection?.kind === 'reference' ? scene.references.find(r => r.id === selection.id) : null;
    const selected = owner(selection?.id), focused = owner(focusTargetId);
    const expand = (id: string | null | undefined): ReadonlySet<string> => new Set(id ? [id, ...(scene.entities[id] ? rowIds(scene.entities[id]) : [])] : []);
    const priority = { selectedIds: expand(selection?.id), focusedIds: expand(focusTargetId), currentIds: new Set((scene.cursorEvent?.subjects ?? []).flatMap(id => [...expand(id)])) };
    const currentFlows = input.flows?.atEvent(scene.cursor, scene) ?? [];
    const queriedFlows = input.flows?.query({ cursor: scene.cursor, scene, priority, limit: budget.flows * 3 }) ?? [];
    const targetedFlow = selection?.kind === 'flow' ? queriedFlows.find(flow => flow.id === selection.id) : null;
    const requiredFlows = [...new Map([...currentFlows, ...(targetedFlow&&!(trace.active&&trace.scope==='current') ? [targetedFlow] : [])].map(flow => [flow.id, flow])).values()];
    const flowCandidates = trace.active && trace.scope === 'current' ? currentFlows : [...requiredFlows, ...queriedFlows.filter(flow => !requiredFlows.some(required => required.id === flow.id))];
    const flowRelevant = (flow: SceneFlow) => flow.id === selection?.id || [flow.from, flow.to].some(point => point && (priority.selectedIds.has(point.id) || priority.focusedIds.has(point.id) || priority.currentIds.has(point.id)));
    const admittedFlows = [...requiredFlows, ...flowCandidates.filter(flow => !requiredFlows.includes(flow) && (!trace.active || trace.scope !== 'relevant' || flowRelevant(flow))).slice(0, Math.max(0, budget.flows - requiredFlows.length))];

    const mandatory = new Map<string, Set<string>>();
    const pin = (id: string | null | undefined, reason: string) => { const resolved = owner(id); if (!resolved)
        return; const reasons = mandatory.get(resolved) ?? new Set(); reasons.add(reason); mandatory.set(resolved, reasons); };
    for (const flow of requiredFlows) { pin(flow.from?.id, 'targeted flow endpoint'); pin(flow.to.id, 'targeted flow endpoint'); }
    pin(selected, 'selection');
    pin(focused, 'focus');
    if(input.clusterTravelMemberId&&scene.entities[input.clusterTravelMemberId])pin(input.clusterTravelMemberId,'cluster travel member');
    if (selectedRef) {
        pin(selectedRef.sourceId, 'selected connector');
        pin(selectedRef.targetId, 'selected connector');
    }
    for (const id of scene.cursorEvent?.subjects ?? [])
        pin(id, 'current evidence');
    const live = scene.liveStack.filter(id => scene.entities[id]?.kind === 'frame' && (scene.entities[id] as {
        live: boolean;
    }).live);
    pin(live[0], 'outermost live invocation');
    for (const id of live.slice(-4))
        pin(id, 'executing invocation and nearest ancestors');
    const current = live.at(-1);
    for (const ref of scene.references)
        if (ref.sourceId === current)
            pin(ref.targetId, 'direct executing-frame reference');
    const neighbours = focused ? scene.references.filter(r => r.sourceId === focused || r.targetId === focused)
        .sort((a, b) => ['frame-object', 'object-object', 'class-object'].indexOf(a.role) - ['frame-object', 'object-object', 'class-object'].indexOf(b.role) || (a.evidence.introducedSeq ?? Infinity) - (b.evidence.introducedSeq ?? Infinity) || a.id.localeCompare(b.id))
        .map(r => r.sourceId === focused ? r.targetId : r.sourceId).filter((id, i, all) => scene.entities[id] && all.indexOf(id) === i).slice(0, 6) : [];
    for (const id of neighbours)
        pin(id, 'focus neighbour');
    if (scene.exception)
        for (const id of [scene.exception.throwFrameId, ...scene.exception.unwound, scene.exception.catchFrameId, scene.exception.exceptionId,...scene.exception.causes])
            pin(id, 'exception evidence');
    const recordedOwners = new Map(ids.map(id => [id, recordedOwnership(layout, id, scene.cursor)]));
    const collapsedExternal = (id: string) => detailLevel !== 'CLOSE' && ['LIBRARY', 'JDK'].includes(recordedOwners.get(id) ?? '');
    const dependencies = (id: string): string[] => {
        const node = scene.entities[id];
        if (detailLevel === 'CLOSE' || !(node.kind === 'frame' || node.kind === 'object' && recordedOwners.get(id) === 'PROJECT')) return [];
        return [...new Set(faceRows(node, {detail:id === focused ? 'CLOSE' : detailLevel}).visible.flatMap(row =>
            row.value.kind === 'reference' && scene.entities[row.value.targetId] && collapsedExternal(row.value.targetId) ? [row.value.targetId] : []))];
    };
    // Correctness-required sources may exceed a nominal limit. Optional sources
    // must fit together with their visible-row dependencies before admission.
    for (const id of [...mandatory.keys()]) for (const target of dependencies(id)) pin(target, 'direct detailed-row reference');
    const reservedObjects = new Set(ids.filter(id => category(scene.entities[id]) === 'objects' && mandatory.has(id)));
    const reserve = (targets: readonly string[]) => { for (const target of targets) { pin(target, 'direct detailed-row reference'); reservedObjects.add(target); } };
    const entities = new Map<string, PresentedEntity>(), overflow: PresentationPlan['budgetOverflow'][number][] = [];
    if (requiredFlows.length > budget.flows) overflow.push({category:'flows', nominal:budget.flows, actual:requiredFlows.length, mandatoryIds:requiredFlows.map(flow=>flow.id), reasons:['selected flow or current evidence']});
    let pickableQuiet = 0;
    const add = (id: string, mode: 'detailed' | 'quiet') => {
        const node = scene.entities[id], pinned = mandatory.has(id);
        const isFocused = id === focused || neighbours.includes(id);
        const forensic = scene.exception && mandatory.get(id)?.has('exception evidence');
        let opacity = node.kind === 'frame' && !node.live ? world.opacity.historicalFrame : mode === 'quiet' ? world.opacity.quiet : 1;
        if (focused && !isFocused)
            opacity = Math.min(opacity, world.opacity.focusDim);
        if (forensicState)opacity=forensic?1:Math.min(opacity,world.opacity.forensicDim);
        const canPick = mode === 'detailed' || pinned || pickableQuiet < budget.pickable;
        if (canPick && mode === 'quiet')
            pickableQuiet++;
        entities.set(id, { id, mode, detail: id === focused ? 'CLOSE' : detailLevel, opacity, pinned, pickable: canPick,
            highlight: forensic ? 'exception' : id === selected ? 'selected' : id === focused ? 'focus' : node.kind === 'object' && node.mutation ? 'mutation' : scene.cursorEvent?.subjects.includes(id) ? 'current' : null });
    };
    for (const cat of ['frames', 'objects', 'classes'] as const) {
        const required = ids.filter(id => category(scene.entities[id]) === cat && mandatory.has(id));
        for (const id of required)
            add(id, 'detailed');
        if (required.length > budget[cat])
            overflow.push({ category: cat, nominal: budget[cat], actual: required.length, mandatoryIds: required, reasons: [...new Set(required.flatMap(id => [...mandatory.get(id)!]))] });
        const optional = ids.filter(id => category(scene.entities[id]) === cat && !mandatory.has(id) && !collapsedExternal(id)).reverse();
        let remaining = Math.max(0, budget[cat] - required.length);
        for (const id of optional) {
            if (!remaining) break;
            if (entities.has(id)) continue;
            const targets = dependencies(id), additional = targets.filter(target => !reservedObjects.has(target));
            const cost = additional.length + (cat === 'objects' ? 1 : 0);
            if (cost > Math.max(0, budget.objects - reservedObjects.size)) continue;
            if (cat === 'objects' && cost > remaining) continue;
            reserve(targets); add(id, 'detailed'); remaining--;
            if (cat === 'objects') {
                reservedObjects.add(id);
                for (const target of additional) add(target, 'detailed');
                remaining -= additional.length;
            }
        }
    }
    for (const id of ids.filter(id => !entities.has(id) && !collapsedExternal(id)).slice(0, budget.quiet))
        add(id, 'quiet');
    const residual = ids.filter(id => !entities.has(id));
    const clusters = presentationClusters(scene, layout, residual, detailLevel, budget.clusters, selection, !!focused);
    const cellWindows = new Map<string, ArrayWindow>();
    const arrayRequests = new Map<string, Set<number>>();
    const request = (slotId: string | undefined) => { const cell = arrayCellTarget(scene,slotId); if (!cell) return; const indices = arrayRequests.get(cell.array.id) ?? new Set<number>(); indices.add(cell.index); arrayRequests.set(cell.array.id, indices); };
    if (selection?.kind === 'slot') request(selection.id);
    request(focusTargetId ?? undefined); request(selectedRef?.sourceSlotId);
    for (const flow of requiredFlows) { if (flow.from?.kind === 'slot') request(flow.from.id); if (flow.to.kind === 'slot') request(flow.to.id); }
    for (const [id, presented] of entities) { const node = scene.entities[id]; if (node.kind === 'array' && presented.mode === 'detailed' && node.activity) { const indices = arrayRequests.get(id) ?? new Set<number>(); indices.add(node.activity.index); arrayRequests.set(id, indices); } }
    let remainingCells = budget.cells, remainingMandatory = [...arrayRequests.values()].reduce((sum,indices)=>sum+indices.size,0);
    const mandatoryCells: string[] = [];
    for (const [id, presented] of entities) {
        const node = scene.entities[id];
        if (node.kind !== 'array' || presented.mode !== 'detailed') continue;
        const requested = [...(arrayRequests.get(id) ?? [])]; remainingMandatory -= requested.length;
        const window = computeArrayWindow({ recordingId: scene.recordingId, arrayId: id, recordedLength: node.length, anchor: node.anchor,
            nominalCellBudget: Math.max(requested.length, remainingCells - remainingMandatory), requestedIndices: requested,
            previous: previous?.cellWindows.get(id) as ArrayWindow | undefined });
        cellWindows.set(id, window); remainingCells -= window.visible.length; mandatoryCells.push(...window.budgetOverflow.mandatoryIds);
    }
    if (remainingCells < 0) overflow.push({ category: 'cells', nominal: budget.cells, actual: budget.cells - remainingCells, mandatoryIds: mandatoryCells, reasons: ['selected, focused or current semantic cell'] });
    const port = (id: string, slot?: string): Vec3 | null => {
      const node = scene.entities[id]; if (!node || !entities.has(id)) return null;
      if (!slot) return node.anchor.bodyPort;
      if (node.kind === 'array') return cellWindows.get(id)?.mapping.get(slot)?.port ?? null;
      if (!rowIds(node).includes(slot)) return null;
      if (node.kind === 'collection') { const entry = node.entries.find(entry=>entry.slotId === slot || entry.keySlotId === slot); return entry?.keySlotId === slot ? entry.keyPort ?? null : entry?.port ?? null; }
      return node.anchor.ports[slot] ?? null;
    };
    const bodyAnchors = new Map<string, WorldAnchor>();
    for (const id of entities.keys()) {
      const node = scene.entities[id], anchor = node.anchor;
      // An array's reserved envelope is not a visible face. Route around the
      // actual header and the current cell mapping, never future/hidden cells.
      bodyAnchors.set(id, node.kind === 'array' ? { ...anchor, position: [anchor.position[0], anchor.position[1] + anchor.size[1] / 2 - .45, anchor.position[2]], size: [anchor.size[0], .9, .12] } : anchor);
    }
    const cellAnchors = new Map([...cellWindows.values()].flatMap(window => [...window.mapping].map(([id, cell]) => [id, cell.anchor] as const)));
    const routeBodies = [...bodyAnchors.values(), ...cellAnchors.values(), ...scene.io.map(io => io.anchor), ...clusters.map(cluster => cluster.anchor),...(exceptionPanel?[exceptionPanelAnchor(exceptionPanel,scene.recording)]:[])];
    const portAnchor = (id: string, slot?: string) => slot && scene.entities[id]?.kind === 'array' ? cellAnchors.get(slot) : bodyAnchors.get(id);
    const endpointAnchor = (point: FlowEndpoint | null): WorldAnchor | undefined => point?.kind === 'io' ? scene.io.find(io => io.id === point.id)?.anchor : point?.kind === 'slot' ? portAnchor(owner(point.id) ?? '', point.id) : point ? portAnchor(point.id) : undefined;
    const endpoint = (point: FlowEndpoint | null): Vec3 | null => point?.kind === 'io' ? scene.io.find(io=>io.id===point.id)?.anchor.bodyPort ?? null : point ? point.kind === 'slot' ? owner(point.id) ? port(owner(point.id)!, point.id) : null : port(point.id) : null;
    const routes = new Map<string, Vec3[]>();
    const route = (from: Vec3, to: Vec3, source?: WorldAnchor, target?: WorldAnchor, left = false) => {
      const key = `${from.join(',')}/${to.join(',')}/${source?.entityId}/${target?.entityId}/${left}`, cached = routes.get(key);
      if (cached) return cached;
      let points = curvedPath(from, to, left);
      if (source && target && !connectorClearsFaces(points, source, target, routeBodies)) {
        const corridor = surfaceConnectorPoints(from, to, source, target, routeBodies);
        points = roundedConnectorPoints(corridor);
        for (const radius of [.35, .18, .08]) {
          const rounded = roundedConnectorPoints(corridor, radius);
          if (connectorClearsFaces(rounded, source, target, routeBodies)) { points = rounded; break; }
        }
      }
      routes.set(key, points); return points;
    };
    const relevantEntities=new Set([selected,focused,...(scene.cursorEvent?.subjects??[]).map(owner)].filter((id):id is string=>!!id));
    const traceParticipants=new Set<string>();
    const participate=(...ids:(string|undefined)[])=>{for(const id of ids){const resolved=owner(id);if(resolved)traceParticipants.add(resolved)}};
    const curves: PresentedCurve[] = [];
    const curve = (id: string, kind: PresentedCurve['kind'], from: Vec3 | null, to: Vec3 | null, role: MaterialRole, relevant: boolean, left = false, arrow = false, label?: string, source?: WorldAnchor, target?: WorldAnchor, forensicPath = false) => {
        if (!from || !to)
            return;
        const opacity=forensicState?(forensicPath?1:Math.min(world.opacity.forensicDim,focused&&!relevant?.25:relevant?1:.35)):focused&&!relevant?.25:relevant?1:.35;
        curves.push({ id, kind, points: route(from, to, source, target, left), sourceAnchor:source, destinationAnchor:target, colorRole: role, opacity, widthPx: relevant ? 3.5 : 2.5, arrow, label });
    };
    const refs = scene.references.filter(r => entities.has(r.sourceId) && entities.has(r.targetId)).sort((a, b) => Number(b.id === selection?.id) - Number(a.id === selection?.id) || Number(mandatory.has(b.sourceId) || mandatory.has(b.targetId)) - Number(mandatory.has(a.sourceId) || mandatory.has(a.targetId)) || (b.evidence.changedSeq ?? 0) - (a.evidence.changedSeq ?? 0));
    const requiredRefs = refs.filter(r => r.id === selection?.id || r.evidence.changedSeq === scene.cursorEvent?.seq);
    const admittedRefs = [...requiredRefs, ...refs.filter(r => !requiredRefs.includes(r)).slice(0, Math.max(0, budget.connectors - requiredRefs.length))];
    if (requiredRefs.length > budget.connectors)
        overflow.push({ category: 'connectors', nominal: budget.connectors, actual: requiredRefs.length, mandatoryIds: requiredRefs.map(r => r.id), reasons: ['selected connector or current evidence'] });
    if (!trace.active || trace.scope !== 'current')
        for (const ref of admittedRefs){
            const relevant=trace.active&&trace.scope==='all'||ref.id===selection?.id||relevantEntities.has(ref.sourceId)||relevantEntities.has(ref.targetId),count=curves.length;
            curve(ref.id, 'connector', port(ref.sourceId, ref.sourceSlotId), port(ref.targetId), 'reference', relevant, false, ref.role === 'object-object', undefined, portAnchor(ref.sourceId, ref.sourceSlotId), portAnchor(ref.targetId));
            if(relevant&&curves.length>count)participate(ref.sourceId,ref.targetId);
        }
    for (const call of (trace.active&&trace.scope==='current'?[]:scene.callLinks.filter(c => entities.has(c.callerId) && entities.has(c.calleeId)).slice(-budget.calls))) {
        const from = scene.entities[call.callerId].anchor, to = scene.entities[call.calleeId].anchor;
        const relevant=trace.active&&trace.scope==='all'||relevantEntities.has(call.callerId)||relevantEntities.has(call.calleeId);
        curve(call.id, 'call', [from.position[0] - from.size[0] / 2, from.position[1] + from.size[1] / 2 - .7, from.position[2] + from.size[2] / 2], [to.position[0] - to.size[0] / 2, to.position[1] + to.size[1] / 2 - .7, to.position[2] + to.size[2] / 2], 'call', relevant, true, false, undefined, from, to);
        if(relevant)participate(call.callerId,call.calleeId);
    }
    const drawnFlowIds = new Set<string>();
    for (const flow of admittedFlows) {
      const source=flow.from?.kind==='frame'?scene.entities[flow.from.id]:null;
      const from = flow.kind==='return'&&source?.kind==='frame'?[source.anchor.position[0]+source.anchor.size[0]/2,source.anchor.position[1]+source.anchor.size[1]/2-.85,source.anchor.position[2]+source.anchor.size[2]/2] as Vec3:endpoint(flow.from), to = endpoint(flow.to); if (!from || !to) continue;
      const exception = ['throw','unwind','catch'].includes(flow.kind), returned = flow.kind === 'return';
      const relevant=trace.active&&trace.scope==='all'||flowRelevant(flow)||requiredFlows.includes(flow);
      const forensicPath=exception&&flow.evidenceEventIds.some(id=>scene.exception?.evidence.eventIds.includes(id));
      curve(flow.id, exception ? 'exception' : returned ? 'return' : 'flow', from, to, exception ? 'exception' : returned ? 'return' : flow.kind === 'input' ? 'stdin' : flow.kind === 'output' ? flow.to.kind==='io'&&flow.to.id==='stderr'?'stderr':'stdout' : 'reference', relevant, false, exception || returned, flow.valueText ?? undefined, endpointAnchor(flow.from), endpointAnchor(flow.to),forensicPath);
      if(relevant)participate(flow.from?.id,flow.to.id);
      drawnFlowIds.add(flow.id);
    }
    if (!input.flows) for (const flow of scene.returnFlows.slice(0, budget.flows))
      if (entities.has(flow.frameId) && entities.has(flow.destination.entityId)) curve(flow.id, 'return', port(flow.frameId), port(flow.destination.entityId, flow.destination.slotId), 'return', scene.cursorEvent?.seq === flow.returnSeq, false, true, flow.value.text, portAnchor(flow.frameId), portAnchor(flow.destination.entityId, flow.destination.slotId));
    const bundles: PresentationPlan['bundles'][number][] = [];
    if (trace.active && trace.scope === 'all') for (const bundle of input.flows?.bundles({cursor:scene.cursor,scene,exclude:drawnFlowIds}) ?? []) {
      const from = endpoint(bundle.from), to = endpoint(bundle.to); if (!bundle.drawable || !from || !to) continue;
      bundles.push({id:bundle.id,kind:'flow',from:bundle.from.id,to:bundle.to.id,count:bundle.count,points:route(from,to,endpointAnchor(bundle.from),endpointAnchor(bundle.to))});
      participate(bundle.from.id,bundle.to.id);
    }
    if(trace.active)for(const[id,presented]of entities)if(!traceParticipants.has(id)&&!(forensicState&&mandatory.get(id)?.has('exception evidence')))entities.set(id,{...presented,opacity:Math.min(presented.opacity,world.opacity.traceDim)});
    const headings: PresentationPlan['headings'][number][] = [{ id: 'STACK', position: layout.headings.stack, opacity: 1 }, { id: 'HEAP', position: layout.headings.heap, opacity: 1 }, ...(layout.headings.classState ? [{ id: 'CLASS STATE' as const, position: layout.headings.classState, opacity: 1 }] : [])];
    if (curves.some(curve=>curve.kind === 'return')) headings.push({id:'RETURNS', position:layout.headings.returns, opacity:1});
    const homeIds = [...new Set([live.at(-1) ?? scene.order.frames.at(-1), ...live.slice(-4), scene.order.frames[0], ...scene.order.objects.filter(id => layout.anchors[id].region === 'heap').slice(0, 12)])].filter((id): id is string => !!id);
    const hero = [...headings.slice(0, 2).flatMap(h => [h.position, [h.position[0] + 2.4, h.position[1] + .4, h.position[2]] as Vec3]), ...homeIds.flatMap(id => anchorCorners(scene.entities[id].anchor))];
    return { revision: (previous?.revision ?? 0) + 1, sceneRevision: scene.revision, detailLevel, budgetOverflow: overflow, entities, clusters:forensicState?clusters.map(cluster=>({...cluster,opacity:Math.min(cluster.opacity,world.opacity.forensicDim)})):clusters, curves, bundles, cellWindows, headings,
        structural: focusTargetId && !focused && layout.anchors[focusTargetId] ? [{ id: focusTargetId, text: 'Not present at this point in time', position: layout.anchors[focusTargetId].position }] : [],
        exceptionPanel, io: scene.io.map(io => ({ id: io.id, opacity: 1 })), pinned: new Set(mandatory.keys()),
        accounting: { detailed: [...entities.values()].filter(e => e.mode === 'detailed').length, quiet: [...entities.values()].filter(e => e.mode === 'quiet').length, clustered: residual.length, total: ids.length },
        framing: { hero, home: { ids: homeIds, headings: headings.slice(0, 2).map(h => h.position) }, focus: focused ? { targetId: focused, neighbours } : null } };
}
