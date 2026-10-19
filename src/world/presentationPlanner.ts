import {exceptionPanelFor,exceptionPanelAnchor} from './exceptionPanelPlacement'
import type { Selection } from '../contracts/interaction';
import type { ArrayIndexReason, DetailLevel, EntityId, LayoutState, MaterialRole, PresentationPlan, PresentedCurve, PresentedEntity, SceneEntity, SceneModel, TraceScope, Vec3, WorldAnchor } from '../contracts/world';
import { budgets, world } from '../theme/tokens';
import { computeArrayWindow, type ArrayWindow } from './arrayWindow';
import type { FlowCatalog, RecordedFlow } from './flowCatalog';
import { arrayCellTarget } from './arrayCellTarget';
import {createConnectorRouter,type ConnectorRouter} from './connectorRouter';
export {curvedPath} from './connectorRouting';
import {presentationClusters,prepareClusterClearance,residualGroups} from './presentationClusters';
import {clusterHierarchy} from './clusterHierarchy';
import {recordedOwnership} from './recordedOwnership';
import {faceRows} from './faceRows';
import {referencePresentationTopology} from './referencePresentationTopology';
import {historicalReferenceCatalog} from './historicalReference';
import {buildFlowTopology} from './flowTopology';
import {stackContextHeading} from './invocationContext';
import {anchorCorners} from './anchorGeometry';
import {solveHeroFraming,type HeroViewport} from '../camera/heroFraming';
export {anchorCorners} from './anchorGeometry';
export interface PlanInput {
    scene: SceneModel;
    flows?: FlowCatalog;
    router?: ConnectorRouter;
    layout: LayoutState;
    detailLevel: DetailLevel;
    selection: Selection;
    focusTargetId: EntityId | null;
    clusterTravelMemberId?: EntityId;
    viewTile?: Vec3; // coarse target tile only; continuous orbit does not re-plan
    /** Scripted Hero admission only. User exploration never inherits this cut. */
    hero?:HeroViewport;
    trace: {
        active: boolean;
        scope: TraceScope;
    };
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
    const {references:historicalRefs,lifetimeExcluded}=historicalReferenceCatalog(scene.historicalBindings);
    const selectedRef = selection?.kind === 'reference' ? scene.references.find(r => r.id === selection.id)??historicalRefs.find(r=>r.id===selection.id) : null;
    const selected = owner(selection?.id), focused = owner(focusTargetId);
    const expand = (id: string | null | undefined): ReadonlySet<string> => new Set(id ? [id, ...(scene.entities[id] ? rowIds(scene.entities[id]) : [])] : []);
    const priority = { selectedIds: expand(selection?.id), focusedIds: expand(focusTargetId), currentIds: new Set((scene.cursorEvent?.subjects ?? []).flatMap(id => [...expand(id)])) };
    const currentFlows = input.flows?.atEvent(scene.cursor, scene) ?? [];
    const queriedFlows = input.flows?.query({ cursor: scene.cursor, scene, priority, limit: budget.flows * 3 }) ?? [];
    const targetedFlow = selection?.kind === 'flow' ? queriedFlows.find(flow => flow.id === selection.id) : null;
    const requiredFlows = [...new Map([...currentFlows, ...(targetedFlow&&!(trace.active&&trace.scope==='current') ? [targetedFlow] : [])].map(flow => [flow.id, flow])).values()];
    const rowRequests=new Map<string,Set<string>>();
    const requestRow=(slotId:string|undefined)=>{
      const id=owner(slotId),node=id?scene.entities[id]:null;
      if(!id||node?.kind!=='frame'||!node.rows.some(row=>row.slotId===slotId))return;
      const ids=rowRequests.get(id)??new Set<string>();ids.add(slotId!);rowRequests.set(id,ids);
    };
    if(selection?.kind==='slot')requestRow(selection.id);
    requestRow(focusTargetId??undefined);requestRow(selectedRef?.sourceSlotId);
    for(const slotId of scene.cursorEvent?.storageIds??[])requestRow(slotId);
    for(const flow of requiredFlows){if(flow.from?.kind==='slot')requestRow(flow.from.id);if(flow.to?.kind==='slot')requestRow(flow.to.id)}
    const flowRelevant = (flow: RecordedFlow) => flow.id === selection?.id || [flow.from, flow.to].some(point => point && (priority.selectedIds.has(point.id) || priority.focusedIds.has(point.id) || priority.currentIds.has(point.id)));

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
    const collapsedExternal = (id: string) => detailLevel !== 'CLOSE' && scene.entities[id].anchor.region==='library' && ['LIBRARY', 'JDK'].includes(recordedOwners.get(id) ?? '');
    const dependencies = (id: string): string[] => {
        const node = scene.entities[id];
        if (detailLevel === 'CLOSE' || !(node.kind === 'frame' || node.kind === 'object' && recordedOwners.get(id) === 'PROJECT')) return [];
        return [...new Set(faceRows(node, {detail:id === focused ? 'CLOSE' : detailLevel==='FAR'&&rowRequests.has(id)?'MEDIUM':detailLevel,rowSlotIds:[...(rowRequests.get(id)??[])]}).visible.flatMap(row =>
            row.value.kind === 'reference' && scene.entities[row.value.targetId] && collapsedExternal(row.value.targetId) ? [row.value.targetId] : []))];
    };
    // Optional sources and their represented dependencies share the remaining
    // admission budget. They never expand semantic mandatory camera evidence.
    const reservedObjects = new Set(ids.filter(id => category(scene.entities[id]) === 'objects' && mandatory.has(id)));
    const reserve = (targets: readonly string[]) => { for (const target of targets) reservedObjects.add(target); };
    const entities = new Map<string, PresentedEntity>(), overflow: PresentationPlan['budgetOverflow'][number][] = [];
    const heroActive=!!input.hero&&scene.liveStack.length>0&&scene.liveStack.length<4,heroSeed=scene.order.objects.find(id=>scene.entities[id].anchor.region==='heap');
    const heroHeadings=[{id:'STACK' as const,position:stackContextHeading(scene,layout.headings.stack),opacity:1},{id:'HEAP' as const,position:layout.headings.heap,opacity:1}];
    const hierarchy=clusterHierarchy(scene,layout);
    let clusterClearance:ReturnType<typeof prepareClusterClearance>|undefined;
    let heroAttempts=0;
    const heroFits=(extra:readonly string[])=>{
      if(!heroActive||!input.hero)return true;
      if(!extra.some(id=>scene.entities[id].anchor.region==='heap'))return true;
      // One nominal object budget of ranked optional trials. Mandatory evidence
      // is already admitted; arbitrary-world context cannot trigger N fits.
      if(heroAttempts++>=budget.objects)return false;
      const represented=new Set([...mandatory.keys(),...entities.keys(),...extra]),heapIds=[...represented].filter(id=>scene.entities[id].anchor.region==='heap');
      clusterClearance??=prepareClusterClearance(scene,layout,ids,detailLevel,budget.clusters,hierarchy);
      const clearance=[...[...represented].map(id=>scene.entities[id].anchor),...clusterClearance(represented)];
      return !!solveHeroFraming(scene,mandatory.keys(),heroHeadings,heapIds,input.hero.safeFrame,input.hero.viewport,true,clearance);
    };
    const oneHop=new Set(scene.references.flatMap(ref=>mandatory.has(ref.sourceId)?[ref.targetId]:mandatory.has(ref.targetId)?[ref.sourceId]:[]));
    const tile=input.viewTile??[0,0,0];
    const rank=(members:readonly string[])=>{
      const result={hop:1,project:1,distance:Infinity,first:Infinity};
      for(const id of members){if(oneHop.has(id))result.hop=0;if(recordedOwners.get(id)==='PROJECT')result.project=0;result.distance=Math.min(result.distance,layout.anchors[id].position.reduce((sum,value,axis)=>sum+(Math.floor(value/12)-tile[axis])**2,0));result.first=Math.min(result.first,layout.placement[id].firstSeq)}
      return result;
    };
    let pickableQuiet = 0;
    const add = (id: string, mode: 'detailed' | 'quiet') => {
        const node = scene.entities[id], pinned = mandatory.has(id);
        const isFocused = id === focused || neighbours.includes(id);
        const forensic = scene.exception && mandatory.get(id)?.has('exception evidence');
        let opacity = node.kind === 'frame' && !node.live ? world.opacity.historicalFrame : mode === 'quiet' ? world.opacity.quiet : 1;
        if (focused)
            opacity = isFocused ? 1 : Math.min(opacity, world.opacity.focusDim);
        if (forensicState)opacity=forensic?1:Math.min(opacity,world.opacity.forensicDim);
        const canPick = mode === 'detailed' || pinned || pickableQuiet < budget.pickable;
        if (canPick && mode === 'quiet')
            pickableQuiet++;
        const requested=[...(rowRequests.get(id)??[])],prior=previous?.entities.get(id)?.rowSlotIds;
        const rowSlotIds=prior&&prior.length===requested.length&&prior.every((slot,index)=>slot===requested[index])?prior:requested;
        entities.set(id, { id, mode, detail: id === focused ? 'CLOSE' : detailLevel==='FAR'&&requested.length?'MEDIUM':detailLevel, opacity, pinned, pickable: canPick,
            ...(requested.length?{rowSlotIds}:{}),
            highlight: forensic ? 'exception' : id === selected ? 'selected' : id === focused ? 'focus' : node.kind === 'object' && node.mutation ? 'mutation' : scene.cursorEvent?.subjects.includes(id) ? 'current' : null });
    };
    for (const cat of ['frames', 'objects', 'classes'] as const) {
        const required = ids.filter(id => category(scene.entities[id]) === cat && mandatory.has(id));
        for (const id of required)
            add(id, 'detailed');
        if (required.length > budget[cat])
            overflow.push({ category: cat, nominal: budget[cat], actual: required.length, mandatoryIds: required, reasons: [...new Set(required.flatMap(id => [...mandatory.get(id)!]))] });
        const optional = residualGroups(scene,layout,ids.filter(id => category(scene.entities[id]) === cat && !mandatory.has(id) && !collapsedExternal(id)),detailLevel)
          .map(group=>({...group,rank:rank(group.members)})).sort((a,b)=>(heroActive?Number(b.members.includes(heroSeed!))-Number(a.members.includes(heroSeed!)):0)||a.rank.hop-b.rank.hop||a.rank.project-b.rank.project||a.rank.distance-b.rank.distance||a.rank.first-b.rank.first||a.id.localeCompare(b.id));
        let remaining = Math.max(0, budget[cat] - required.length);
        for (const group of optional) {
            if (!remaining) break;
            const members=group.members.filter(id=>!entities.has(id));
            if(!members.length||members.length>remaining)continue;
            const targets=[...new Set(members.flatMap(dependencies))],additional=targets.filter(target=>!reservedObjects.has(target)&&!members.includes(target));
            const cost = additional.length + (cat === 'objects' ? members.length : 0);
            if (cost > Math.max(0, budget.objects - reservedObjects.size)) continue;
            if (cat === 'objects' && cost > remaining) continue;
            if(!heroFits([...members,...additional]))continue;
            reserve(targets);
            for(const id of members)add(id,'detailed');
            for(const target of additional)add(target,'detailed');
            remaining-=members.length;
            if (cat === 'objects') {
                for(const id of members)reservedObjects.add(id);
                remaining -= additional.length;
            }
        }
    }
    // Hero coarsens unadmitted groups as groups. Exploration retains its normal
    // quiet-volume budget instead of retrying every declined member one by one.
    if(!heroActive)for (const id of ids.filter(id => !entities.has(id) && !collapsedExternal(id)).slice(0, budget.quiet)){
        add(id, 'quiet');
    }
    const residual = ids.filter(id => !entities.has(id));
    const clusters = presentationClusters(scene, layout, residual, detailLevel, budget.clusters, selection, !!focused,hierarchy);
    if(clusters.length>budget.clusters)overflow.push({category:'clusters',nominal:budget.clusters,actual:clusters.length,mandatoryIds:clusters.map(cluster=>cluster.id),reasons:['irreducible recorded ownership/region and live-depth partitions required for exact accounting']});
    const cellWindows = new Map<string, ArrayWindow>();
    const arrayRequests = new Map<string, Set<number>>();
    const arrayReasons = new Map<string, Map<number, Set<ArrayIndexReason>>>();
    const requestIndex = (id:string,index:number,reason:ArrayIndexReason) => {
      const indices=arrayRequests.get(id)??new Set<number>();indices.add(index);arrayRequests.set(id,indices);
      const reasons=arrayReasons.get(id)??new Map<number,Set<ArrayIndexReason>>(),entry=reasons.get(index)??new Set<ArrayIndexReason>();
      entry.add(reason);reasons.set(index,entry);arrayReasons.set(id,reasons);
    };
    const request = (slotId: string | undefined,reason:ArrayIndexReason='requested') => { const cell = arrayCellTarget(scene,slotId); if(cell)requestIndex(cell.array.id,cell.index,reason); };
    if (selection?.kind === 'slot') request(selection.id,'selected');
    request(focusTargetId ?? undefined,'focused'); request(selectedRef?.sourceSlotId);
    for (const flow of requiredFlows) { if (flow.from?.kind === 'slot') request(flow.from.id); if (flow.to.kind === 'slot') request(flow.to.id); }
    for (const [id, presented] of entities) { const node = scene.entities[id]; if (node.kind === 'array' && presented.mode === 'detailed' && node.activity) requestIndex(id,node.activity.index,'current'); }
    let remainingCells = budget.cells, remainingMandatory = [...arrayRequests.values()].reduce((sum,indices)=>sum+indices.size,0);
    const mandatoryCells: string[] = [];
    for (const [id, presented] of entities) {
        const node = scene.entities[id];
        if (node.kind !== 'array' || presented.mode !== 'detailed') continue;
        const requested = [...(arrayRequests.get(id) ?? [])]; remainingMandatory -= requested.length;
        const reasons=(reason:ArrayIndexReason)=>requested.filter(index=>arrayReasons.get(id)?.get(index)?.has(reason));
        const window = computeArrayWindow({ recordingId: scene.recordingId, arrayId: id, recordedLength: node.length, anchor: node.anchor,
            nominalCellBudget: Math.max(requested.length, remainingCells - remainingMandatory), requestedIndices: reasons('requested'),
            selectedIndices:reasons('selected'),focusedIndices:reasons('focused'),currentIndices:reasons('current'),
            previous: previous?.cellWindows.get(id) as ArrayWindow | undefined });
        cellWindows.set(id, window); remainingCells -= window.visible.length; mandatoryCells.push(...window.budgetOverflow.mandatoryIds);
    }
    if (remainingCells < 0) overflow.push({ category: 'cells', nominal: budget.cells, actual: budget.cells - remainingCells, mandatoryIds: mandatoryCells, reasons: ['selected, focused or current semantic cell'] });
    const bodyAnchors = new Map<string, WorldAnchor>();
    for (const id of entities.keys()) {
      const node = scene.entities[id], anchor = node.anchor;
      // An array's reserved envelope is not a visible face. Route around the
      // actual header and the current cell mapping, never future/hidden cells.
      bodyAnchors.set(id, node.kind === 'array' ? { ...anchor, position: [anchor.position[0], anchor.position[1] + anchor.size[1] / 2 - .45, anchor.position[2]], size: [anchor.size[0], .9, .12] } : anchor);
    }
    const cellAnchors = new Map([...cellWindows.values()].flatMap(window => [...window.mapping].map(([id, cell]) => [id, cell.anchor] as const)));
    const routeBodies = [...bodyAnchors.values(), ...cellAnchors.values(), ...scene.io.map(io => io.anchor), ...clusters.map(cluster => cluster.anchor),...(exceptionPanel?[exceptionPanelAnchor(exceptionPanel,scene.recording)]:[])];
    const route = (input.router??createConnectorRouter()).forBodies(routeBodies);
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
    const referenceRelevant = (ref: SceneModel['references'][number]) => trace.active&&trace.scope==='all'||ref.id===selection?.id||relevantEntities.has(ref.sourceId)||relevantEntities.has(ref.targetId);
    const referenceRole = (ref: SceneModel['references'][number]): MaterialRole => ref.overlay??(ref.role==='object-object'?'heap':ref.role==='class-object'?'class':'reference');
    const referenceOpacity = (refs: readonly SceneModel['references'][number][], relevant: boolean) => Math.min(relevant?1:.35,
      focused&&!refs.some(ref=>[focused,...neighbours].some(id=>id===ref.sourceId||id===ref.targetId))?world.opacity.focusDim:1,
      forensicState&&!refs.every(ref=>ref.overlay==='exception')?world.opacity.forensicDim:1);
    const {current:topology,historical:historicalTopology}=referencePresentationTopology({scene,entities,clusters,cellWindows,individualLimit:budget.connectors,
      mandatoryIds:new Set([...scene.references.filter(ref=>ref.id===selectedRef?.id||ref.evidence.changedSeq===scene.cursorEvent?.seq).map(ref=>ref.id),...(selectedRef?[selectedRef.id]:[])]),
      priorityIds:new Set(scene.references.filter(referenceRelevant).map(ref=>ref.id)),enabled:!trace.active||trace.scope!=='current'},historicalRefs,trace.active&&trace.scope==='all');
    const requiredRefs=topology.individual.filter(({reference})=>reference.id===selectedRef?.id||reference.evidence.changedSeq===scene.cursorEvent?.seq);
    const requiredHistory=historicalTopology.individual.filter(({reference})=>reference.id===selectedRef?.id),requiredConnectors=[...requiredRefs,...requiredHistory];
    if(requiredConnectors.length>budget.connectors)overflow.push({category:'connectors',nominal:budget.connectors,actual:requiredConnectors.length,mandatoryIds:requiredConnectors.map(item=>item.reference.id),reasons:['selected current/historical connector or current evidence']});
    for(const {reference:ref,sourcePoint,destinationPoint,sourceAnchor,destinationAnchor}of topology.individual){
      const relevant=referenceRelevant(ref);
      curve(ref.id,'connector',sourcePoint,destinationPoint,referenceRole(ref),relevant,false,ref.role==='object-object'||!!ref.overlay,undefined,sourceAnchor,destinationAnchor,ref.overlay==='exception');
      curves[curves.length-1].opacity=referenceOpacity([ref],relevant);
      if(relevant)participate(ref.sourceId,ref.targetId);
    }
    for(const {reference:ref,sourcePoint,destinationPoint,sourceAnchor,destinationAnchor}of historicalTopology.individual){
      curve(ref.id,'binding-history',sourcePoint,destinationPoint,referenceRole(ref),ref.id===selection?.id,false,ref.role==='object-object',undefined,sourceAnchor,destinationAnchor);
      curves[curves.length-1].opacity=Math.min(.25,referenceOpacity([ref],true));
      participate(ref.sourceId,ref.targetId);
    }
    for (const call of (trace.active&&trace.scope==='current'?[]:scene.callLinks.filter(c => entities.has(c.callerId) && entities.has(c.calleeId)).slice(-budget.calls))) {
        const from = scene.entities[call.callerId].anchor, to = scene.entities[call.calleeId].anchor;
        const relevant=trace.active&&trace.scope==='all'||relevantEntities.has(call.callerId)||relevantEntities.has(call.calleeId);
        curve(call.id, 'call', [from.position[0] - from.size[0] / 2, from.position[1] + from.size[1] / 2 - .7, from.position[2] + from.size[2] / 2], [to.position[0] - to.size[0] / 2, to.position[1] + to.size[1] / 2 - .7, to.position[2] + to.size[2] / 2], 'call', relevant, true, false, undefined, from, to);
        if(relevant)participate(call.callerId,call.calleeId);
    }
    const flowTopology=buildFlowTopology({scene,entities,cellWindows,flows:input.flows?.prefix(scene.cursor,scene)??[],limit:budget.flows,
      mandatoryIds:new Set(requiredFlows.map(flow=>flow.id)),aggregate:trace.active&&trace.scope==='all',
      priority:flow=>flow.id===selection?.id?0:[flow.from,flow.to].some(point=>point&&priority.focusedIds.has(point.id))?1:flow.evidenceSeqs.includes(scene.cursorEvent?.seq??-1)?2:flowRelevant(flow)?3:4,
      inScope:flow=>!trace.active||trace.scope==='all'||trace.scope==='current'&&flow.evidenceSeqs.includes(scene.cursorEvent?.seq??-1)||trace.scope==='relevant'&&flowRelevant(flow)});
    if(flowTopology.mandatory.length>budget.flows)overflow.push({category:'flows',nominal:budget.flows,actual:flowTopology.mandatory.length,mandatoryIds:flowTopology.mandatory,reasons:['drawable selected flow or current evidence']});
    for (const {flow,from,to} of flowTopology.individual) {
      const exception = ['throw','unwind','catch'].includes(flow.kind), returned = flow.kind === 'return';
      const relevant=trace.active&&trace.scope==='all'||flowRelevant(flow)||requiredFlows.includes(flow);
      const forensicPath=exception&&flow.evidenceEventIds.some(id=>scene.exception?.evidence.eventIds.includes(id));
      curve(flow.id, exception ? 'exception' : returned ? 'return' : 'flow', from.point, to.point, exception ? 'exception' : returned ? 'return' : flow.kind === 'input' ? 'stdin' : flow.kind === 'output' ? flow.to.kind==='io'&&flow.to.id==='stderr'?'stderr':'stdout' : 'reference', relevant, false, exception || returned, flow.valueText ?? undefined, from.anchor, to.anchor,forensicPath);
      if(relevant)participate(flow.from?.id,flow.to.id);
    }
    const bundles = topology.bundles.map<PresentationPlan['bundles'][number]>(bundle=>{
      const relevant=bundle.id===selection?.id||bundle.references.some(referenceRelevant),roles=new Set(bundle.references.map(referenceRole));
      const opacity=referenceOpacity(bundle.references,relevant);
      if(relevant)for(const ref of bundle.references)participate(ref.sourceId,ref.targetId);
      return{id:bundle.id,kind:'connector',from:bundle.from,to:bundle.to,count:bundle.count,points:route(bundle.sourcePoint,bundle.destinationPoint,bundle.sourceAnchor,bundle.destinationAnchor),colorRole:roles.size===1?[...roles][0]:'reference',opacity,widthPx:relevant?3.5:2.5,arrow:bundle.references.every(ref=>ref.role==='object-object'||!!ref.overlay),referenceIds:bundle.references.map(ref=>ref.id)};
    });
    for(const bundle of historicalTopology.bundles){
      const roles=new Set(bundle.references.map(referenceRole));
      bundles.push({id:bundle.id,kind:'binding-history',from:bundle.from,to:bundle.to,count:bundle.count,points:route(bundle.sourcePoint,bundle.destinationPoint,bundle.sourceAnchor,bundle.destinationAnchor),colorRole:roles.size===1?[...roles][0]:'reference',opacity:Math.min(.25,referenceOpacity(bundle.references,true)),widthPx:bundle.id===selection?.id?3.5:2.5,arrow:bundle.references.every(ref=>ref.role==='object-object'),referenceIds:bundle.references.map(ref=>ref.id)});
      for(const ref of bundle.references)participate(ref.sourceId,ref.targetId);
    }
    for (const bundle of flowTopology.bundles) {
      const exemplar=bundle.flows[0],exception=['throw','unwind','catch'].includes(exemplar.kind),returned=exemplar.kind==='return';
      bundles.push({id:bundle.id,kind:'flow',from:exemplar.from!.id,to:exemplar.to.id,count:bundle.flows.length,points:route(bundle.from.point,bundle.to.point,bundle.from.anchor,bundle.to.anchor),colorRole:exception?'exception':returned?'return':exemplar.kind==='input'?'stdin':exemplar.kind==='output'?exemplar.to.kind==='io'&&exemplar.to.id==='stderr'?'stderr':'stdout':'reference',opacity:Math.min(.35,focused?world.opacity.focusDim:1),widthPx:bundle.id===selection?.id?3.5:2.5,arrow:exception||returned,flowIds:bundle.flows.map(flow=>flow.id)});
      participate(exemplar.from!.id,exemplar.to.id);
    }
    if(trace.active)for(const[id,presented]of entities)if(!traceParticipants.has(id)&&!(forensicState&&mandatory.get(id)?.has('exception evidence')))entities.set(id,{...presented,opacity:Math.min(presented.opacity,world.opacity.traceDim)});
    const headings: PresentationPlan['headings'][number][] = [{ id: 'STACK', position: stackContextHeading(scene,layout.headings.stack), opacity: 1 }, { id: 'HEAP', position: layout.headings.heap, opacity: 1 }, ...(layout.headings.classState ? [{ id: 'CLASS STATE' as const, position: layout.headings.classState, opacity: 1 }] : [])];
    if (curves.some(curve=>curve.kind === 'return')) headings.push({id:'RETURNS', position:layout.headings.returns, opacity:1});
    const homeIds = [...new Set([live.at(-1) ?? scene.order.frames.at(-1), ...live.slice(-4), scene.order.frames[0], ...scene.order.objects.filter(id => layout.anchors[id].region === 'heap').slice(0, 12)])].filter((id): id is string => !!id);
    const hero = [...headings.slice(0, 2).flatMap(h => [h.position, [h.position[0] + 2.4, h.position[1] + .4, h.position[2]] as Vec3]), ...homeIds.flatMap(id => anchorCorners(scene.entities[id].anchor))];
    return { revision: (previous?.revision ?? 0) + 1, sceneRevision: scene.revision, detailLevel, budgetOverflow: overflow, entities, clusters:forensicState?clusters.map(cluster=>({...cluster,opacity:Math.min(cluster.opacity,world.opacity.forensicDim)})):clusters, curves, bundles, referencePresentation:{counts:topology.counts,unavailable:topology.unavailable.map(item=>({id:item.reference.id,reason:item.reason})),internal:topology.internal.map(item=>({id:item.reference.id,clusterId:item.clusterId})),scopeExcluded:topology.scopeExcluded.map(ref=>ref.id)}, historicalReferencePresentation:{counts:{recorded:scene.historicalBindings.length,eligible:historicalTopology.counts.current,drawable:historicalTopology.counts.drawable,individual:historicalTopology.counts.individual,bundled:historicalTopology.counts.bundled,bundleCurves:historicalTopology.counts.bundleCurves,unavailable:historicalTopology.counts.unavailable,internal:historicalTopology.counts.internal,scopeExcluded:historicalTopology.counts.scopeExcluded,lifetimeExcluded:lifetimeExcluded.length},unavailable:historicalTopology.unavailable.map(item=>({id:item.reference.id,reason:item.reason})),internal:historicalTopology.internal.map(item=>({id:item.reference.id,clusterId:item.clusterId})),scopeExcluded:historicalTopology.scopeExcluded.map(ref=>ref.id),lifetimeExcluded:lifetimeExcluded}, flowPresentation:flowTopology.presentation, cellWindows, headings,
        structural: focusTargetId && !focused && layout.anchors[focusTargetId] ? [{ id: focusTargetId, text: 'Not present at this point in time', position: layout.anchors[focusTargetId].position }] : [],
        exceptionPanel, io: scene.io.map(io => ({ id: io.id, opacity: 1 })), pinned: new Set(mandatory.keys()),
        accounting: { detailed: [...entities.values()].filter(e => e.mode === 'detailed').length, quiet: [...entities.values()].filter(e => e.mode === 'quiet').length, clustered: residual.length, total: ids.length },
        framing: { hero, home: { ids: homeIds, headings: headings.slice(0, 2).map(h => h.position) }, focus: focused ? { targetId: focused, neighbours } : null } };
}
