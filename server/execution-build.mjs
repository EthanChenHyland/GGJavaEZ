/** Capture source evidence under the same queue as build and file commands.
 * Private snapshots are keyed by the actual build result, not a reused classesDir.
 * Capture failure remains an observation failure; it never converts a successful
 * compilation into a build failure or prevents the existing plain-run fallback.
 */
export function createExecutionBuild({ serialized, build, getProjectRoot, buildManifest }) {
  const snapshots = new WeakMap();
  return {
    build: (id, debug) => serialized(async () => {
      const compilation = await build(id, debug);
      if (compilation.success) {
        try {
          const root = await getProjectRoot(id);
          const manifest = await buildManifest(root, compilation.project.classesDir, compilation.project.sourcePaths);
          snapshots.set(compilation, { manifest });
        } catch (error) { snapshots.set(compilation, { error }); }
      }
      return compilation;
    }),
    buildManifest: (root, classesDir, sourcePaths, compilation) => {
      const snapshot = snapshots.get(compilation);
      if (!snapshot) throw new Error('Execution build has no captured source snapshot');
      if (snapshot.error) throw snapshot.error;
      return snapshot.manifest;
    },
  };
}
