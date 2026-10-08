# Cinematic rendering readiness — Phase 5.5

Architecture review and the Phase 5.5 hardening/validation gates are complete. This document does not authorize Phase 6 or implement cinematic effects.

## Preserve one semantic world

The rendering boundary is RuntimeState → immutable scene catalog → bounded spatial presentation → shared Three geometry. Runtime IDs, slots, source manifests and recorded ExecutionGraph edges remain authoritative. A future renderer can change shading and capture quality at this boundary without rebuilding Java semantics, source editing, persistent history or append-only spatial layout. Clusters remain presentation summaries of actual members. Unknown values, opaque library boundaries and stopped observations remain explicit.

Camera, selection and timeline already operate on actual XYZ anchors. Capture should use the same catalog, selected cursor, presentation planner and primitives. It must not manufacture a prettier alternate execution or move entities for each shot.

## Shared primitives and material requirements

`SolidBody` and `SolidFace` centralize the cuboid vocabulary; `RuntimeLabel` centralizes on-face text; connectors share exterior endpoint routes. Stack/heap/history semantic colors come from DESIGN_TOKENS.json. These are appropriate integration points for future material tiers.

Bodies could adopt controlled transmission, roughness, fresnel and reflections. Information faces must remain opaque, readable and bounded, including narrow Focus views. Transparency must never replace exact row presentation, turn references into background decoration, or make depth sorting determine semantic truth. Retain genuine attached ports and a separate pick sleeve. Begin with selected/nearby solids; many transparent overlapping historical bodies would increase overdraw and impair comprehension.

## Lighting and compositing

Current lights and floor are derived from represented runtime bounds. Keep that rule. A future neutral environment map/PMREM may improve side/top reflectance without adding decorative rooms, cities or game scenery. Test a restrained key/fill/rim configuration before effects. Contact shadows and ambient occlusion can strengthen cuboid contact/depth; cap resolution and sample counts by quality tier. Avoid global glowing edges, large bloom, volumetric backgrounds and color shifts that erase blue stack/purple heap distinctions.

Depth of field is suitable for an optional exported/cinematic capture setting, with the inspected face in focus. Interactive use needs readable connected context and should default to no depth of field. Any tone-mapping/exposure update must be tested against all semantic text, exception and mutation colors.

## Interactive versus capture settings

Keep interactive quality adaptive: bounded faces/cells/links, demand rendering, capped DPR, limited shadow maps and modest shader complexity. User orbit/pan/dolly always interrupts scripted camera motion. Reduced motion remains independent of render quality and must never suppress semantic state transitions.

Capture can explicitly request higher DPR, richer shadows and additional passes after a finite text/asset readiness barrier. Use the same scene at the same cursor and report quality settings with the artifact. Exporting a still must not make ordinary interaction pay the cost of cinematic assets or a permanently running post-processing loop.

## Blockers and order

1. Preserve the now-accepted ugly-program, camera, resource and text-readability gates through future rendering changes. The new GPU timing probe is opt-in, bounded and development-only; its measurements must be distinguished from physical presentation and whole-GPU utilization.
2. Establish approved side/top/face luminance, contrast and material samples in the shared primitives, then verify macro/meso/micro and all viewport sizes.
3. Profile real dense geometry, transient text shaping, shadow passes and transparent overdraw on more than one GPU. Renderer resource counts are not GPU memory bytes.
4. Add environment/lighting controls as central tiers with bounded assets and explicit disposal. No per-example lighting systems.
5. Trial contact shading/AO, then minimal reflection/transmission, then optional capture-only depth of field. Add a pass only when original-size review shows a useful improvement within measured budgets.
6. Re-run sustained camera/timeline/Debug, reduced-motion and resource-release checks after each pass. Do not trade exact runtime observation for prettier screenshots.

No architectural rewrite of RuntimeState or ExecutionGraph is required for this path. Cinematic fidelity still needs material/lighting iteration, cross-GPU profiling and explicit asset/pass budgets; the current simple renderer is not claimed to match the references' cinematic finish.
