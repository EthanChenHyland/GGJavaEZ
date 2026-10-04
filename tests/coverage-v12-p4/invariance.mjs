import { renamer, renameJava } from '../../scripts/acceptance-variants.mjs';

export { renameJava };
export const SHIFT = '// Phase 4 line invariance\n\n// Only source coordinates change\n\n';

/** Canonical ordinal identities come from observation order, never identifiers.
 * Include new static, string, collection, nested-array and ownership facts along
 * with ALL ordered graph edges. Source coordinates are compared independently.
 */
export function semanticSignature(run, undoNames = {}) {
  const ids = new Map();
  const graph = run.graph;
  for (const collection of ['invocations', 'calls', 'values', 'storage', 'objects', 'io', 'classes']) {
    Object.keys(graph[collection] ?? {}).forEach((id, index) => ids.set(id, `${collection}:${index}`));
  }
  graph.edges.forEach((edge, index) => ids.set(edge.id, `edge:${index}`));
  run.trace.events.forEach((event, index) => ids.set(event.eventId, `event:${index}`));
  run.trace.sourceFiles.forEach((source, index) => ids.set(source.fileId, `source:${index}`));
  const rename = renamer(undoNames);
  const identify = text => {
    if (ids.has(text)) return ids.get(text);
    // Provenance has an explicit argument-node identity even if it is not stored
    // as GraphStorage. Normalize its parent call, preserving its actual index.
    for (const call of Object.values(graph.calls)) if (text.startsWith(`${call.id}:argument:`))
      return `${ids.get(call.id)}:argument:${text.slice(`${call.id}:argument:`.length)}`;
    // Hidden lambda classes carry a fresh VM address on every JVM launch. The
    // address is neither a Java identifier nor a semantic relationship.
    return rename(text).replace(/\/0x[0-9a-f]+/gi, '/<vm-address>');
  };
  const canonical = (value, key = '') => {
    if (Array.isArray(value)) return value.map(item => canonical(item, key));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value)
        .filter(([field]) => !['source', 'rawSeq', 'currentSource', 'label', 'invocationLabel'].includes(field))
        .map(([field, item]) => [identify(field), canonical(item, field)]));
    }
    if (typeof value === 'string') {
      // Text and primitive String/char payloads remain literal Java data; only
      // identity/type/member labels are renamed for isomorphism comparison.
      if (['text', 'reason'].includes(key) || key === 'value') return value;
      return identify(value);
    }
    return value;
  };
  return canonical({
    graph,
    frames: run.state.frames,
    objects: run.state.objects,
    classes: run.state.classes,
    arrayMutations: run.state.arrayMutations,
    console: run.state.console,
    status: run.state.status,
    recording: run.snapshot.recording.state,
    stdout: run.snapshot.stdout,
    stderr: run.snapshot.stderr,
  });
}

export function sourceLines(run) {
  return run.trace.events.filter(event => event.source).map(event => event.source.line);
}
