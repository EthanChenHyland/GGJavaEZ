/** Bounded V8 heap attribution. The snapshot stays in ignored local QA storage.
 * Self bytes are not dominator/retained bytes; shared descendants are counted once
 * in each stated structural category, never summed into a claimed retained total.
 */
import { readFile, writeFile } from 'node:fs/promises';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/summarize-heap.mjs <snapshot> <summary.json>');
const snapshot = JSON.parse(await readFile(input, 'utf8'));
const { nodes, edges, strings } = snapshot;
const meta = snapshot.snapshot.meta, fields = meta.node_fields;
const width = fields.length, edgeWidth = meta.edge_fields.length;
const nameField = fields.indexOf('name'), sizeField = fields.indexOf('self_size'), countField = fields.indexOf('edge_count');
const types = meta.node_types[0], edgeTypes = meta.edge_types[0];
const offsets = new Uint32Array(nodes.length / width);
let offset = 0;
for (let node = 0; node < nodes.length; node += width) { offsets[node / width] = offset; offset += nodes[node + countField] * edgeWidth; }
const categories = new Map(), allocations = new Map(), childArrays = new Set(), backingArrays = new Set();
const add = (map, name, bytes) => { const category = map.get(name) ?? { count: 0, selfBytes: 0 }; category.count++; category.selfBytes += bytes; map.set(name, category); };
function properties(node) {
  const result = new Map(), start = offsets[node / width];
  for (let edge = start; edge < start + nodes[node + countField] * edgeWidth; edge += edgeWidth) {
    if (edgeTypes[edges[edge]] === 'property') result.set(strings[edges[edge + 1]], edges[edge + 2]);
  }
  return result;
}
function backing(node) {
  const start = offsets[node / width];
  for (let edge = start; edge < start + nodes[node + countField] * edgeWidth; edge += edgeWidth)
    if (edgeTypes[edges[edge]] === 'internal' && strings[edges[edge + 1]] === 'elements') return edges[edge + 2];
}
let totalSelfBytes = 0;
for (let node = 0; node < nodes.length; node += width) {
  const type = types[nodes[node]], size = nodes[node + sizeField], name = strings[nodes[node + nameField]];
  totalSelfBytes += size;
  // Never copy source text, application values or host paths into the report.
  add(allocations, type.includes('string') ? type : `${type}:${name.slice(0, 80)}`, size);
  if (type !== 'object') continue;
  const props = properties(node);
  if (props.has('children') || props.has('branches')) {
    add(categories, props.has('branches') ? 'packedHashBranches' : 'radixBranches', size);
    const child = props.get('children') ?? props.get('branches'); childArrays.add(child);
    const arrayBacking = backing(child); if (arrayBacking !== undefined) backingArrays.add(arrayBacking);
  }
  if (props.has('key') && props.has('value')) add(categories, 'persistentEntries', size);
  if (props.has('frameId') && props.has('owner') && props.has('descriptor') && props.has('source')) add(categories, 'executionContexts', size);
  if (props.has('from') && props.has('to') && props.has('context')) add(categories, 'graphEdges', size);
  if (props.has('value') && props.has('eventId') && props.has('context')) add(categories, 'graphValues', size);
  if (props.has('fact') && props.has('eventId')) add(categories, 'semanticFactEnvelopes', size);
  if (props.has('source') && props.has('eventId')) add(categories, 'semanticEvents', size);
  if (props.has('fileId') && !props.has('eventId')) add(categories, 'sourceLocationsAndFiles', size);
  if (props.has('descriptor') && props.has('owner') && props.has('name') && !props.has('frameId')) add(categories, 'methodIdentities', size);
  if (props.has('inputs') && props.has('kind')) add(categories, 'computedOriginRecipes', size);
  if (props.has('state')) add(categories, 'checkpointAndStateHolders', size);
}
for (const node of childArrays) add(categories, 'uniqueTrieChildArrays', nodes[node + sizeField]);
for (const node of backingArrays) add(categories, 'uniqueTrieArrayBacking', nodes[node + sizeField]);
const report = {
  note: 'One explicit-GC bounded heap snapshot. Includes test runner and all live inputs. Counts/shallow self bytes, not graph-only retention or dominators. Categories overlap. Source text, values and host paths omitted.',
  totalSelfBytes, nodeCount: nodes.length / width,
  categories: Object.fromEntries(categories),
  allocations: [...allocations].map(([kind, data]) => ({ kind, ...data })).sort((a, b) => b.selfBytes - a.selfBytes).slice(0, 25),
};
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ totalSelfBytes, categories: report.categories }));
