import { arrayBackplate,arrayTitlePlate } from './arrayCellGeometry';
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
const connector = world.connector;
const category = (node: SceneEntity): 'frames' | 'objects' | 'classes' => node.kind === 'frame' ? 'frames' : node.kind === 'class' ? 'classes' : 'objects';
const rowIds = (node: SceneEntity): readonly string[] => node.kind === 'frame' || node.kind === 'class' ? node.rows.map(r => r.slotId) : node.kind === 'object' ? node.groups.flatMap(g => g.rows.map(r => r.slotId)) : node.kind === 'array' ? node.cells.map(c => c.slotId) : node.entries.flatMap(e => e.keySlotId ? [e.slotId, e.keySlotId] : [e.slotId]);
/** Complete catalog in, one accounted hierarchy cut out. Required identities cannot be budgeted away. */
export function planPresentation(input: PlanInput, previous?: PresentationPlan): PresentationPlan {
    const { scene, layout, detailLevel, selection, focusTargetId, trace } = input, budget = budgets[detailLevel];
    const exceptionPanel=exceptionPanelFor(scene),forensicState=!!exceptionPanel;
    const forensicEvidence=new Set(forensicState ? scene.exception?.evidence.eventIds : undefined);
    const isExceptionFlow=(flow:RecordedFlow)=>flow.kind==='throw'||flow.kind==='unwind'||flow.kind==='catch';
    const isForensicFlow=(flow:RecordedFlow)=>isExceptionFlow(flow)&&flow.evidenceEventIds.some(id=>forensicEvidence.has(id));
    const ids = [...scene.order.frames, ...scene.order.objects, ...scene.order.classes];
    const owners = new Map<string, string>();
    for (const id of ids)
        for (const slot of rowIds(scene.entities[id]))
            owners.set(slot, id);
    const owner = (id: string | null | undefined) => id ? scene.entities[id] ? id : owners.get(id) ?? arrayCellTarget(scene,id)?.array.id ?? null : null;
    const {references:historicalRefs,lifetimeExcluded}=historicalReferenceCatalog(scene.historicalBindings);
    const selectedRef = selection?.kind === 'reference' ? scene.references.find(r => r.id === selection.id)??historicalRefs.find(r=>r.id===selection.id) : null;
    const selected = owner(selection?.id), focused = owner(focusTargetId);
    const focusedCell=arrayCellTarget(scene,focusTargetId);
    const expand = (id: string | null | undefined): ReadonlySet<string> => new Set(id ? [id, ...(scene.entities[id] ? rowIds(scene.entities[id]) : [])] : []);
    const priority = { selectedIds: expand(selection?.id), focusedIds: expand(focusTargetId), currentIds: new Set((scene.cursorEvent?.subjects ?? []).flatMap(id => [...expand(id)])) };
    const currentFlows = input.flows?.atEvent(scene.cursor, scene) ?? [];
    const currentFlowIds = new Set(currentFlows.map(flow => flow.id));
    if (scene.cursorEvent) for (const returned of scene.returnFlows)
        if (returned.consumerSeq === scene.cursorEvent.seq) currentFlowIds.add(returned.id);
    const appliedSeq=scene.cursorEvent?.seq??-1;
    const isCurrentFlow = (flow: RecordedFlow) => currentFlowIds.has(flow.id) || flow.consumerSeq===appliedSeq || flow.evidenceSeqs.includes(appliedSeq);
    const queriedFlows = input.flows?.query({ cursor: scene.cursor, scene, priority, limit: budget.flows * 3 }) ?? [];
    const targetedFlow = selection?.kind === 'flow' ? queriedFlows.find(flow => flow.id === selection.id) : null;
    const requiredFlows = [...new Map([...currentFlows, ...queriedFlows.filter(isCurrentFlow), ...(targetedFlow&&!(trace.active&&trace.scope==='current') ? [targetedFlow] : [])].map(flow => [flow.id, flow])).values()];
    const rowRequests=new Map<string,Set<string>>();
    const requestRow=(slotId:string|undefined)=>{
      const id=owner(slotId),node=id?scene.entities[id]:null;
      if(!id||!node||!slotId)return;
      const captured=node.kind==='frame' ? node.rows.some(row=>row.slotId===slotId)
        : (node.kind==='object'||node.kind==='class') && !!node.anchor.ports[slotId];
      if(!captured)return;
      const rows=rowRequests.get(id)??new Set<string>();rows.add(slotId);rowRequests.set(id,rows);
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
    const referenceNeighbours = focused ? scene.references.filter(r => focusedCell?r.sourceSlotId===focusedCell.slotId:r.sourceId === focused || r.targetId === focused)
        .sort((a, b) => ['frame-object', 'object-object', 'class-object'].indexOf(a.role) - ['frame-object', 'object-object', 'class-object'].indexOf(b.role) || (a.evidence.introducedSeq ?? Infinity) - (b.evidence.introducedSeq ?? Infinity) || a.id.localeCompare(b.id))
        .map(r => r.sourceId === focused ? r.targetId : r.sourceId) : [];
    const invocationNeighbours = focused && scene.entities[focused].kind === 'frame'
      ? scene.callLinks.flatMap(call => call.calleeId === focused ? [call.callerId] : call.callerId === focused ? [call.calleeId] : [])
        .sort((a,b) => Number(live.includes(b))-Number(live.includes(a)))
      : [];
    const eventNeighbours = focused ? requiredFlows.flatMap(flow => {
      const source = focusedCell ? flow.from?.id === focusedCell.slotId : owner(flow.from?.id) === focused;
      const destination = focusedCell ? flow.to.id === focusedCell.slotId : owner(flow.to.id) === focused;
      const neighbour = owner(source ? flow.to.id : destination ? flow.from?.id : null);
      return neighbour && neighbour !== focused ? [neighbour] : [];
    }) : [];
    const neighbours = [...new Set([...invocationNeighbours.slice(0, 2), ...eventNeighbours, ...referenceNeighbours, ...invocationNeighbours])].filter(id=>scene.entities[id]).slice(0,6);
    const focusContext=new Set([focused,...neighbours]);
    const focusConnection=(source:string|null|undefined,target:string|null|undefined)=>{
        if(!focused)return true;
        if(!source||!target)return false;
        const from=owner(source),to=owner(target);
        if(!from||!to||!focusContext.has(from)||!focusContext.has(to))return false;
        return focusedCell?source===focusedCell.slotId||target===focusedCell.slotId:from===focused||to===focused;
    };
    for (const id of neighbours)
        pin(id, 'focus neighbour');
    if (forensicState && scene.exception)
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
    for (const call of scene.callLinks) {
        if (mandatory.has(call.callerId)) oneHop.add(call.calleeId);
        if (mandatory.has(call.calleeId)) oneHop.add(call.callerId);
    }
    const tile=input.viewTile??[0,0,0];
    const distance=(id:string)=>layout.anchors[id].position.reduce((sum,value,axis)=>sum+(Math.floor(value/12)-tile[axis])**2,0);
    const rank=(members:readonly string[])=>{
      const result={hop:1,project:1,distance:Infinity,first:Infinity};
      for(const id of members){if(oneHop.has(id))result.hop=0;if(recordedOwners.get(id)==='PROJECT')result.project=0;result.distance=Math.min(result.distance,distance(id));result.first=Math.min(result.first,layout.placement[id].firstSeq)}
      return result;
    };
    const compareRank=(a:ReturnType<typeof rank>,b:ReturnType<typeof rank>)=>
        detailLevel==='CLOSE' && input.viewTile ? a.distance-b.distance||a.hop-b.hop||a.project-b.project||a.first-b.first
            : a.hop-b.hop||a.project-b.project||a.distance-b.distance||a.first-b.first;
    const hasLocalCut=!!input.viewTile&&!heroActive&&!forensicState&&!focused&&detailLevel!=='FAR';
    const localMembers=(candidates:readonly string[],count:number)=>{
        const nearest:{id:string;rank:ReturnType<typeof rank>}[]=[];
        for (const id of candidates) {
            const item={id,rank:rank([id])};
            const index=nearest.findIndex(next=>compareRank(item.rank,next.rank)<0);
            if (index>=0) nearest.splice(index,0,item);
            else if (nearest.length<count) nearest.push(item);
            if (nearest.length>count) nearest.pop();
        }
        return nearest.map(item=>item.id);
    };
    let pickableQuiet = 0;
    const add = (id: string, mode: 'detailed' | 'quiet') => {
        const node = scene.entities[id], pinned = mandatory.has(id);
        const forensic = scene.exception && mandatory.get(id)?.has('exception evidence');
        let opacity = id!==selected && node.kind === 'frame' && !node.live ? world.opacity.historicalFrame : mode === 'quiet' ? world.opacity.quiet : 1;
        if (focused)
            opacity = id === focused ? 1 : neighbours.includes(id) ? world.opacity.focusNeighbour : Math.min(opacity, world.opacity.focusDim);
        if (forensicState && id!==focused)opacity=forensic?1:Math.min(opacity,world.opacity.forensicDim);
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
          .map(group=>({...group,rank:rank(group.members)})).sort((a,b)=>(heroActive?Number(b.members.includes(heroSeed!))-Number(a.members.includes(heroSeed!)):0)||compareRank(a.rank,b.rank)||a.id.localeCompare(b.id));
        let remaining = Math.max(0, budget[cat] - required.length);
        for (const group of optional) {
            if (!remaining) break;
            let members=group.members.filter(id=>!entities.has(id));
            if(hasLocalCut && members.length>remaining && (group.rank.hop===0 || group.rank.distance<=3))
                members=localMembers(members,Math.min(remaining,detailLevel==='CLOSE'?8:3));
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
    // Keep a small local silhouette and represent every other optional volume
    // through its canonical residual group.
    if(!heroActive && budget.quiet) {
        const quiet=ids.filter(id=>!entities.has(id)&&!collapsedExternal(id));
        const count=focused||forensicState?Math.min(6,budget.quiet):budget.quiet;
        for(const id of (hasLocalCut&&quiet.length>count?localMembers(quiet,count):quiet.slice(0,count))) add(id,'quiet');
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
    const bodyAnchors = new Map<string, WorldAnchor>(), backs:ReturnType<typeof arrayBackplate>[]=[];
    for (const [id,presented] of entities) {
      const node = scene.entities[id], anchor = node.anchor;
      // An array's reserved envelope is not a visible face. Route around the
      // actual header, plate and current cell mapping.
      bodyAnchors.set(id, node.kind === 'array' ? arrayTitlePlate(anchor) : anchor);
      if (node.kind==='array'&&presented.mode==='detailed') backs.push(arrayBackplate(anchor));
    }
    const cellAnchors = new Map([...cellWindows.values()].flatMap(window => [...window.mapping].map(([id, cell]) => [id, cell.anchor] as const)));
    const routeBodies = [...bodyAnchors.values(), ...backs, ...cellAnchors.values(), ...scene.io.map(io => io.anchor), ...clusters.map(cluster => cluster.anchor),...(exceptionPanel?[exceptionPanelAnchor(exceptionPanel,scene.recording)]:[])];
    const route = (input.router??createConnectorRouter()).forBodies(routeBodies);
    const relevantEntities=new Set([selected,focused,...(scene.cursorEvent?.subjects??[]).map(owner)].filter((id):id is string=>!!id));
    const traceParticipants=new Set<string>();
    const participate=(...ids:(string|undefined)[])=>{for(const id of ids){const resolved=owner(id);if(resolved)traceParticipants.add(resolved)}};
    const all = trace.active && trace.scope === 'all';
    const contextOpacity = all ? connector.allTopologyOpacity : connector.topologyOpacity;
    const liveFrames = new Set(live);
    const actedOn = new Set(scene.cursorEvent?.subjects);
    const coreWidth = (id:string, active=false) => (id===selection?.id
      ? connector.selectedPx : active ? connector.corePx : connector.contextPx) as PresentedCurve['widthPx'];
    const curves: PresentedCurve[] = [];
    const curve = (id: string, kind: PresentedCurve['kind'], from: Vec3, to: Vec3, colorRole: MaterialRole, opacity: number,
      source: WorldAnchor, target: WorldAnchor, options: {active?:boolean;left?:boolean;arrow?:boolean;label?:string;departure?:Vec3} = {}) => {
        curves.push({id,kind,points:route(from,to,source,target,options.left,options.departure),sourceAnchor:source,destinationAnchor:target,
          colorRole,opacity,widthPx:coreWidth(id,options.active),arrow:!!options.arrow,label:options.label});
    };
    const activeBinding = (ref: SceneModel['references'][number]) => ref.evidence.changedSeq===scene.cursorEvent?.seq
      || ref.sourceId===current && actedOn.has(ref.targetId) && !!scene.cursorEvent?.storageIds.length;
    const referenceRelevant = (ref: SceneModel['references'][number]) => ref.id===selection?.id
      || activeBinding(ref) || relevantEntities.has(ref.sourceId) || relevantEntities.has(ref.targetId) || ref.sourceId===current;
    const referenceRole = (ref: SceneModel['references'][number]): MaterialRole => ref.overlay??(ref.role==='object-object'?'heap':ref.role==='class-object'?'class':'reference');
    const referenceOpacity = (ref: SceneModel['references'][number]) => {
      if (focused && !focusConnection(ref.sourceSlotId??ref.sourceId,ref.targetId)) return connector.focusAwayOpacity;
      if (ref.id===selection?.id || focused && !forensicState) return 1;
      if (ref.overlay==='exception'&&forensicState) return connector.directOpacity;
      if (forensicState) return connector.topologyOpacity;
      if (activeBinding(ref)) return connector.currentOpacity;
      const source=scene.entities[ref.sourceId];
      if (source?.kind==='frame' && !source.live) return contextOpacity;
      if (ref.sourceId===current || relevantEntities.has(ref.sourceId) || liveFrames.has(ref.sourceId)&&actedOn.has(ref.targetId)) return connector.directOpacity;
      return contextOpacity;
    };
    const {current:topology,historical:historicalTopology}=referencePresentationTopology({scene,entities,clusters,cellWindows,individualLimit:budget.connectors,
      mandatoryIds:new Set([...scene.references.filter(ref=>ref.id===selectedRef?.id||ref.evidence.changedSeq===scene.cursorEvent?.seq).map(ref=>ref.id),...(selectedRef?[selectedRef.id]:[])]),
      priorityIds:new Set(scene.references.filter(referenceRelevant).map(ref=>ref.id)),enabled:!trace.active||trace.scope!=='current'},historicalRefs,trace.active&&trace.scope==='all');
    const requiredRefs=topology.individual.filter(({reference})=>reference.id===selectedRef?.id||reference.evidence.changedSeq===scene.cursorEvent?.seq);
    const requiredHistory=historicalTopology.individual.filter(({reference})=>reference.id===selectedRef?.id),requiredConnectors=[...requiredRefs,...requiredHistory];
    if(requiredConnectors.length>budget.connectors)overflow.push({category:'connectors',nominal:budget.connectors,actual:requiredConnectors.length,mandatoryIds:requiredConnectors.map(item=>item.reference.id),reasons:['selected current/historical connector or current evidence']});
    for (const {reference:ref,sourcePoint,destinationPoint,sourceAnchor,destinationAnchor,departure} of topology.individual) {
      const opacity=referenceOpacity(ref),active=opacity>=connector.currentOpacity && (activeBinding(ref)||!!ref.overlay);
      curve(ref.id,'connector',sourcePoint,destinationPoint,referenceRole(ref),opacity,sourceAnchor,destinationAnchor,
        {active,arrow:!!ref.overlay||((active||ref.id===selection?.id)&&ref.role==='object-object'),departure});
      if(all||referenceRelevant(ref))participate(ref.sourceId,ref.targetId);
    }
    for (const {reference:ref,sourcePoint,destinationPoint,sourceAnchor,destinationAnchor} of historicalTopology.individual) {
      const opacity=ref.id===selection?.id?world.connector.historyOpacity:connector.pastBindingOpacity;
      curve(ref.id,'binding-history',sourcePoint,destinationPoint,referenceRole(ref),opacity,sourceAnchor,destinationAnchor,
        {arrow:ref.id===selection?.id&&ref.role==='object-object'});
      participate(ref.sourceId,ref.targetId);
    }
    const callCut = trace.active&&trace.scope==='current' ? [] : scene.callLinks.filter(c => entities.has(c.callerId) && entities.has(c.calleeId));
    const keyCalls = callCut.filter(c => c.calleeId===current || focused && focusConnection(c.callerId,c.calleeId));
    const keyCallIds = new Set(keyCalls.map(call=>call.id));
    const otherCalls = callCut.filter(call=>!keyCallIds.has(call.id));
    const retainedCalls = Math.max(0,budget.calls-keyCalls.length);
    for (const call of [...keyCalls,...otherCalls.slice(otherCalls.length-retainedCalls)]) {
        const from = scene.entities[call.callerId].anchor, to = scene.entities[call.calleeId].anchor;
        const direct=call.calleeId===current&&liveFrames.has(call.callerId);
        const active=direct&&call.callSeq===scene.cursorEvent?.seq;
        const focusDirect=!!focused&&focusConnection(call.callerId,call.calleeId);
        const opacity=forensicState?connector.focusAwayOpacity:focused?focusDirect?1:connector.focusAwayOpacity:direct?connector.directOpacity:liveFrames.has(call.calleeId)?connector.contextOpacity:contextOpacity;
        curve(call.id, 'call', [from.position[0] - from.size[0] / 2, from.position[1] + from.size[1] / 2 - .7, from.position[2] + from.size[2] / 2],
          [to.position[0] - to.size[0] / 2, to.position[1] + to.size[1] / 2 - .7, to.position[2] + to.size[2] / 2], 'call', opacity, from, to, {left:true,active});
        if(all||direct||focusDirect)participate(call.callerId,call.calleeId);
    }
    const flowTopology=buildFlowTopology({scene,entities,cellWindows,flows:input.flows?.iteratePrefix(scene.cursor,scene)??[],limit:budget.flows,
      mandatoryIds:new Set(requiredFlows.map(flow=>flow.id)),aggregate:all,
      priority:flow=>isCurrentFlow(flow)?0:flow.id===selection?.id?1:isForensicFlow(flow)?2:[flow.from,flow.to].some(point=>point&&priority.focusedIds.has(point.id))?3:flowRelevant(flow)?4:5,
      inScope:flow=>!trace.active||all||isCurrentFlow(flow)||trace.scope==='relevant'&&(flowRelevant(flow)||isForensicFlow(flow))});
    if(flowTopology.mandatory.length>budget.flows)overflow.push({category:'flows',nominal:budget.flows,actual:flowTopology.mandatory.length,mandatoryIds:flowTopology.mandatory,reasons:['drawable selected flow or current evidence']});
    // An assignment using the same proven return as its source can be drawn
    // at the same ports. Keep that valid graph edge in the cut, but let the
    // explicit return own the visible caption, arrow, and contrast.
    const currentReturnPorts=new Set(flowTopology.individual.filter(({flow})=>flow.kind==='return'&&isCurrentFlow(flow))
      .map(({flow})=>JSON.stringify([flow.from,flow.to])));
    const latestForensic=flowTopology.individual.reduce<RecordedFlow|null>((latest,{flow})=>
        isForensicFlow(flow)&&(!latest||flow.evidenceSeqs[0]>latest.evidenceSeqs[0])?flow:latest,null);
    for (const {flow,from,to} of flowTopology.individual) {
      const exception = isExceptionFlow(flow), returned = flow.kind === 'return';
      const current=isCurrentFlow(flow);
      const selected=flow.id===selection?.id;
      const forensicPath=isForensicFlow(flow);
      const duplicateReturn=!returned&&current&&currentReturnPorts.has(JSON.stringify([flow.from,flow.to]));
      const offFocus=!!focused&&!focusConnection(flow.from?.id,flow.to.id)&&!forensicPath;
      // The ordered evidence beside the stack carries the incident. Recurring
      // edges into a distant heap stay faint unless the user asks for the route.
      const localRoute=Math.hypot(...from.point.map((coordinate,axis)=>coordinate-to.point[axis]))
        <=2*Math.max(from.anchor.size[0],to.anchor.size[0]);
      const showExact=all||selected||trace.active&&trace.scope==='current';
      const quietForensic=forensicPath&&!showExact&&(!localRoute||flow.id!==latestForensic?.id);
      const strong=(current||selected||flow.id===latestForensic?.id)&&!duplicateReturn&&!offFocus&&!quietForensic;
      const direct=!!focused&&focusConnection(flow.from?.id,flow.to.id);
      const opacity=offFocus||quietForensic?connector.focusAwayOpacity:strong?(selected?1:connector.currentOpacity):
        direct?connector.directOpacity:forensicState||duplicateReturn?connector.topologyOpacity:contextOpacity;
      const role=exception?'exception':returned?'return':flow.kind==='input'?'stdin':flow.kind==='output'
        ?flow.to.kind==='io'&&flow.to.id==='stderr'?'stderr':'stdout':strong&&['local-field','array-write'].includes(flow.kind)?'mutation':'reference';
      curve(flow.id,exception?'exception':returned?'return':'flow',from.point,to.point,role,opacity,from.anchor,to.anchor,
        {active:strong,arrow:strong,label:returned&&strong?flow.valueText??undefined:undefined});
      if(all||strong||forensicPath||flowRelevant(flow))participate(flow.from?.id,flow.to.id);
    }
    const bundles = topology.bundles.map<PresentationPlan['bundles'][number]>(bundle=>{
      const relevant=bundle.references.some(referenceRelevant),roles=new Set(bundle.references.map(referenceRole));
      const selected=bundle.id===selection?.id;
      const opacity=selected?connector.currentOpacity:focused||forensicState?connector.focusAwayOpacity:
        all||detailLevel==='FAR'||relevant||bundle.count>=4?connector.bundleOpacity:connector.topologyOpacity;
      if(all||relevant||selected)for(const ref of bundle.references)participate(ref.sourceId,ref.targetId);
      return{id:bundle.id,kind:'connector',from:bundle.from,to:bundle.to,count:bundle.count,points:route(bundle.sourcePoint,bundle.destinationPoint,bundle.sourceAnchor,bundle.destinationAnchor),colorRole:roles.size===1?[...roles][0]:'reference',opacity,widthPx:coreWidth(bundle.id),arrow:selected,referenceIds:bundle.references.map(ref=>ref.id)};
    });
    for(const bundle of historicalTopology.bundles){
      const roles=new Set(bundle.references.map(referenceRole)),selected=bundle.id===selection?.id;
      bundles.push({id:bundle.id,kind:'binding-history',from:bundle.from,to:bundle.to,count:bundle.count,points:route(bundle.sourcePoint,bundle.destinationPoint,bundle.sourceAnchor,bundle.destinationAnchor),colorRole:roles.size===1?[...roles][0]:'reference',opacity:selected?connector.historyOpacity:connector.pastBindingOpacity,widthPx:coreWidth(bundle.id),arrow:selected,referenceIds:bundle.references.map(ref=>ref.id)});
      for(const ref of bundle.references)participate(ref.sourceId,ref.targetId);
    }
    for (const bundle of flowTopology.bundles) {
      const exemplar=bundle.flows[0],exception=['throw','unwind','catch'].includes(exemplar.kind),returned=exemplar.kind==='return',selected=bundle.id===selection?.id;
      bundles.push({id:bundle.id,kind:'flow',from:exemplar.from!.id,to:exemplar.to.id,count:bundle.flows.length,points:route(bundle.from.point,bundle.to.point,bundle.from.anchor,bundle.to.anchor),colorRole:exception?'exception':returned?'return':exemplar.kind==='input'?'stdin':exemplar.kind==='output'?exemplar.to.kind==='io'&&exemplar.to.id==='stderr'?'stderr':'stdout':'reference',opacity:selected?connector.currentOpacity:focused?connector.focusAwayOpacity:connector.bundleOpacity,widthPx:coreWidth(bundle.id),arrow:selected,flowIds:bundle.flows.map(flow=>flow.id)});
      participate(exemplar.from!.id,exemplar.to.id);
    }
    if (trace.active) for (const [id,presented] of entities) {
      const essential = id===focused || id===selected || actedOn.has(id) || forensicState&&mandatory.get(id)?.has('exception evidence');
      if (!essential&&!traceParticipants.has(id))
        entities.set(id,{...presented,opacity:Math.min(presented.opacity,world.opacity.traceDim)});
    }
    const headings: PresentationPlan['headings'][number][] = [{ id: 'STACK', position: stackContextHeading(scene,layout.headings.stack), opacity: world.opacity.regionHeading }, { id: 'HEAP', position: layout.headings.heap, opacity: world.opacity.regionHeading }, ...(layout.headings.classState ? [{ id: 'CLASS STATE' as const, position: layout.headings.classState, opacity: world.opacity.regionHeading }] : [])];
    const returnCurve=curves.find(curve=>curve.kind==='return'&&curve.label!==undefined),returnAnchor=returnCurve?.sourceAnchor;
    if(returnCurve)headings.push({id:'RETURNS',position:returnAnchor
      ?[returnAnchor.position[0]+returnAnchor.size[0]/2+.45,returnAnchor.position[1]+returnAnchor.size[1]/2+.75,returnAnchor.position[2]+returnAnchor.size[2]/2]
      :layout.headings.returns,opacity:world.opacity.returnHeading});
    const homeIds = [...new Set([live.at(-1) ?? scene.order.frames.at(-1), ...live.slice(-4), scene.order.frames[0], ...scene.order.objects.filter(id => layout.anchors[id].region === 'heap').slice(0, 12)])].filter((id): id is string => !!id);
    const hero = [...headings.slice(0, 2).flatMap(h => [h.position, [h.position[0] + 2.4, h.position[1] + .4, h.position[2]] as Vec3]), ...homeIds.flatMap(id => anchorCorners(scene.entities[id].anchor))];
    return { revision: (previous?.revision ?? 0) + 1, sceneRevision: scene.revision, detailLevel, budgetOverflow: overflow, entities, clusters:forensicState?clusters.map(cluster=>({...cluster,opacity:Math.min(cluster.opacity,world.opacity.forensicDim)})):clusters, curves, bundles, referencePresentation:{counts:topology.counts,unavailable:topology.unavailable.map(item=>({id:item.reference.id,reason:item.reason})),internal:topology.internal.map(item=>({id:item.reference.id,clusterId:item.clusterId})),scopeExcluded:topology.scopeExcluded.map(ref=>ref.id)}, historicalReferencePresentation:{counts:{recorded:scene.historicalBindings.length,eligible:historicalTopology.counts.current,drawable:historicalTopology.counts.drawable,individual:historicalTopology.counts.individual,bundled:historicalTopology.counts.bundled,bundleCurves:historicalTopology.counts.bundleCurves,unavailable:historicalTopology.counts.unavailable,internal:historicalTopology.counts.internal,scopeExcluded:historicalTopology.counts.scopeExcluded,lifetimeExcluded:lifetimeExcluded.length},unavailable:historicalTopology.unavailable.map(item=>({id:item.reference.id,reason:item.reason})),internal:historicalTopology.internal.map(item=>({id:item.reference.id,clusterId:item.clusterId})),scopeExcluded:historicalTopology.scopeExcluded.map(ref=>ref.id),lifetimeExcluded:lifetimeExcluded}, flowPresentation:flowTopology.presentation, cellWindows, headings,
        structural: focusTargetId && !focused && layout.anchors[focusTargetId] ? [{ id: focusTargetId, text: 'Not present at this point in time', position: layout.anchors[focusTargetId].position }] : [],
        exceptionPanel, io: scene.io.map(io => ({ id: io.id, opacity: 1 })), pinned: new Set(mandatory.keys()),
        accounting: { detailed: [...entities.values()].filter(e => e.mode === 'detailed').length, quiet: [...entities.values()].filter(e => e.mode === 'quiet').length, clustered: residual.length, total: ids.length },
        framing: { hero, home: { ids: homeIds, headings: headings.slice(0, 2).map(h => h.position) }, focus: focused ? { targetId: focused, neighbours } : null } };
}
