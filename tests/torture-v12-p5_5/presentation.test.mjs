import { expect, test } from 'vitest';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createLayout } from '../../src/world/layout.ts';
import { seek } from '../../src/runtime/seek.ts';
import { buildSceneModel } from '../../src/world/sceneModel.ts';
import { planSpatialPresentation } from '../../src/world/spatialPresentation.ts';
import { spatial2HomePose } from '../../src/navigation/cameraSpatial2.ts';
import { arrayHeaderAnchor } from '../../src/world/arrayGeometry.ts';
const enabled = process.env.VJ_TORTURE_PRESENTATION === '1';
test.skipIf(!enabled)('measures accepted fresh small-program overview without a JVM rerun', async () => {
  const trace = JSON.parse(await readFile('.ggjavaez/qa/v12-p5_5/traces/06-small-debug.trace.json', 'utf8'));
  const state = seek(trace, trace.events.length), layout = createLayout(trace), scene = buildSceneModel(state, layout, 'macro');
  const options = { detailLevel: 'macro', event: trace.events.at(-1) };
  const plan = planSpatialPresentation(scene, null, options);
  const withoutIo = planSpatialPresentation({ ...scene, io: [] }, null, options);
  const view = { verticalFov: Math.PI / 4, aspect: 1440 / 900 };
  const viewport = { width: 1440, height: 900, topInset: 94, bottomInset: 100, rightInset: 20, leftInset: 20 };
  const pose = spatial2HomePose(plan.homeBounds, view, viewport);
  const evidence = { method: 'Same accepted complete JVM trace; no recapture or identity/layout substitution',
    view, viewport, io: scene.io, withIo: plan.homeBounds, withoutIo: withoutIo.homeBounds,
    homeNodes: [...plan.homeScene.frames, ...plan.homeScene.objects, ...(plan.homeScene.classes ?? [])].map(node => ({ id: node.id, label: node.label, anchor: node.anchor })),
    pose, range: Math.hypot(...pose.position.map((value, axis) => value - pose.target[axis])) };
  await mkdir('docs/checkpoints/v12-p5_5/camera', { recursive: true });
  await writeFile(`docs/checkpoints/v12-p5_5/camera/small-${process.env.VJ_CAMERA_STAGE ?? 'baseline'}.json`, JSON.stringify(evidence, null, 2) + '\n');
  expect(plan.homeBounds).toBeDefined();
});

test.skipIf(!enabled)('accepted ragged references attach to real bounded headers without moving stable array anchors', async () => {
  const trace = JSON.parse(await readFile('.ggjavaez/qa/v12-p5_5/traces/02-arrays-cycles-collections.trace.json', 'utf8'));
  const state = seek(trace, trace.events.length), layout = createLayout(trace), before = JSON.stringify(layout.anchors);
  const scene = buildSceneModel(state, layout, 'micro');
  const edges = scene.references.filter(edge => state.objects[edge.targetObjectId].array);
  expect(edges.length).toBeGreaterThan(5);
  for (const edge of edges) {
    const header = arrayHeaderAnchor(layout.anchors[edge.targetObjectId]);
    expect(edge.to).toEqual(layout.anchors[edge.targetObjectId].bodyPort);
    expect(edge.toFace).toEqual(header.bodyPort);
    expect(Math.abs(edge.toFace[0] - header.position[0])).toBeLessThan(header.size[0] / 2);
    expect(edge.toFace[2] - header.position[2] - header.size[2] / 2).toBeCloseTo(0.055);
    expect(arrayHeaderAnchor(layout.anchors[edge.targetObjectId])).toBe(header);
  }
  expect(JSON.stringify(layout.anchors)).toBe(before);
});
