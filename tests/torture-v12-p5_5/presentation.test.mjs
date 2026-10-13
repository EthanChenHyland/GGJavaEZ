import { expect, test } from 'vitest';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { projectTrace } from '../../src/testing/projectTrace.ts';
import { planPresentation } from '../../src/world/presentationPlanner.ts';
import { homeFraming } from '../../src/camera/homeFraming.ts';
import { cameraPosition, projectionCamera, screenPoint } from '../../src/camera/projection.ts';
import { computeArrayWindow } from '../../src/world/arrayWindow.ts';
import { buildReferenceTopology } from '../../src/world/referenceTopology.ts';
import { presentedFlowPorts } from '../../src/world/flowTopology.ts';
import { buildSolidBatch } from '../../src/render/SolidBatch.tsx';
const enabled = process.env.VJ_TORTURE_PRESENTATION === '1';
const planning = (scene, layout, detailLevel) => planPresentation({ scene, layout, detailLevel, selection: null, focusTargetId: null, trace: { active: false, scope: 'relevant' } });

test.skipIf(!enabled)('measures accepted fresh small-program overview without a JVM rerun', async () => {
  const trace = JSON.parse(await readFile('.ggjavaez/qa/v12-p5_5/traces/06-small-debug.trace.json', 'utf8'));
  const projection = projectTrace(trace, { sessionEnded: true }), scene = projection.project(trace.events.length), layout = projection.layout;
  const plan = planning(scene, layout, 'FAR'), withoutIo = planning({ ...scene, io: [] }, layout, 'FAR');
  const viewport = { width: 1440, height: 900 }, safeFrame = { x: 20, y: 94, width: 1400, height: 706 };
  const home = homeFraming(scene, plan, safeFrame, viewport, layout), noIoHome = homeFraming({ ...scene, io: [] }, withoutIo, safeFrame, viewport, layout);
  const camera = projectionCamera(home.pose, viewport);
  expect(home.points.length).toBeGreaterThan(0);
  for (const point of home.points) {
    const pixel = screenPoint(point, camera, viewport);
    expect(pixel.x).toBeGreaterThanOrEqual(safeFrame.x - 1e-6);
    expect(pixel.x).toBeLessThanOrEqual(safeFrame.x + safeFrame.width + 1e-6);
    expect(pixel.y).toBeGreaterThanOrEqual(safeFrame.y - 1e-6);
    expect(pixel.y).toBeLessThanOrEqual(safeFrame.y + safeFrame.height + 1e-6);
  }
  const evidence = { method: 'Same accepted complete JVM trace; production planner/Home; no fresh JVM claim',
    viewport, safeFrame, io: scene.io, withIo: home.points, withoutIo: noIoHome.points,
    homeNodes: home.ids.map(id => ({ id, label: scene.entities[id].title, anchor: scene.entities[id].anchor })),
    pose: home.pose, position: cameraPosition(home.pose), range: home.pose.distance };
  const output = process.env.VJ_TORTURE_PRESENTATION_REPORT ?? '.ggjavaez/qa/reference-exact/retained-presentation';
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/small-home.json`, JSON.stringify(evidence, null, 2) + '\n');
});

test.skipIf(!enabled)('accepted ragged references attach to real bounded headers without moving stable array anchors', async () => {
  const trace = JSON.parse(await readFile('.ggjavaez/qa/v12-p5_5/traces/02-arrays-cycles-collections.trace.json', 'utf8'));
  const projection = projectTrace(trace, { sessionEnded: true }), layout = projection.layout, before = JSON.stringify(layout.anchors);
  const scene = projection.project(trace.events.length), base = planning(scene, layout, 'CLOSE');
  // The retired test examined the complete scene, rather than a budgeted cut.
  // Preserve that scope using actual entities and captured source-cell indices.
  const entities = new Map(Object.keys(scene.entities).map(id => [id, { id, mode: 'detailed', detail: 'CLOSE', opacity: 1, pinned: true, pickable: true, highlight: null }]));
  const cellWindows = new Map();
  for (const node of Object.values(scene.entities)) if (node.kind === 'array') {
    const requestedIndices = node.cells.filter(cell => scene.references.some(ref => ref.sourceId === node.id && ref.sourceSlotId === cell.slotId)).map(cell => cell.index);
    cellWindows.set(node.id, computeArrayWindow({ recordingId: scene.recordingId, arrayId: node.id, recordedLength: node.length, anchor: node.anchor, requestedIndices, nominalCellBudget: Math.max(32, requestedIndices.length) }));
  }
  const plan = { ...base, entities, clusters: [], cellWindows };
  const topology = buildReferenceTopology({ scene, entities, clusters: [], cellWindows, individualLimit: scene.references.length, mandatoryIds: new Set(scene.references.map(ref => ref.id)) });
  const solids = buildSolidBatch(scene, plan).filter(solid => solid.role !== 'face');
  const ports = presentedFlowPorts(scene, entities, cellWindows);
  const edges = scene.references.filter(ref => scene.entities[ref.targetId]?.kind === 'array');
  expect(edges.length).toBeGreaterThan(5);
  for (const edge of edges) {
    const route = topology.individual.find(item => item.reference.id === edge.id);
    const header = solids.find(solid => solid.anchor.entityId === edge.targetId).anchor;
    const destination = ports({ kind: 'object', id: edge.targetId });
    expect(destination, edge.id).not.toBeNull();
    expect(destination.anchor.position).toEqual(header.position);
    expect(destination.anchor.size).toEqual(header.size);
    expect(destination.point).toEqual([header.position[0], header.position[1], header.position[2] + header.size[2] / 2]);
    expect(scene.entities[edge.targetId].anchor).toBe(layout.anchors[edge.targetId]);
    if (!route) {
      // A bounded source face may omit a captured row. Target geometry is
      // still checked for every edge; no substitute drawable curve is allowed.
      expect(topology.unavailable.find(item => item.reference.id === edge.id)?.reason).toBe('Source slot is not in the visible face rows');
      continue;
    }
    expect(route.destinationAnchor.position).toEqual(header.position);
    expect(route.destinationAnchor.size).toEqual(header.size);
    const offsets = route.destinationPoint.map((value, axis) => Math.abs(value - header.position[axis]));
    const outside = offsets.findIndex((value, axis) => Math.abs(value - header.size[axis] / 2 - .06) < 1e-6);
    expect(outside).toBeGreaterThanOrEqual(0);
    for (let axis = 0; axis < 3; axis++) if (axis !== outside) expect(offsets[axis]).toBeCloseTo(0);
  }
  expect(topology.individual.some(item => scene.entities[item.reference.targetId]?.kind === 'array')).toBe(true);
  for (const cursor of [0, Math.floor(trace.events.length / 2), trace.events.length]) projection.project(cursor);
  expect(JSON.stringify(layout.anchors)).toBe(before);
});
