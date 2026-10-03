# Visual Java — Epic Spec v2.6

Visual Java is a cinematic, 3D-first Java runtime visualization environment.

The central rule:

> Make execution feel alive without ever making runtime truth fake.

The spatial rule:

> The runtime is a place, not a sequence of shots. Users must be able to build a mental map, navigate it freely, and return to the same semantic locations over time.

The creative rule:

> Treat the references as a launch point, not a cage. The implementation should develop its own coherent visual identity.

## Recommended reading order

1. `VISION_EPIC.md`
2. `EXPERIENCE_PILLARS.md`
3. `SPATIAL_WORLD.md`
4. `CAMERA_AND_NAVIGATION.md`
5. `CREATIVE_FREEDOM.md`
6. `HERO_OPENING.md`
7. `HERO_DEMOS.md`
8. `REFERENCES_EPIC.md`
9. `VISUAL_LANGUAGE.md`
10. `DESIGN_SYSTEM.md`
11. `DESIGN_TOKENS.json`
12. `MOTION_SYSTEM.md`
13. `SCENE_CONSISTENCY.md`
14. `RUNTIME_ARCHITECTURE.md`
15. `PERFORMANCE_BUDGET.md`
16. `IMPLEMENTATION_DISCIPLINE.md`
17. `POLISH_AND_QA.md`
18. `BUILD_SEQUENCE.md`
19. `CODEX_MASTER_PROMPT.md`

## Spatial ambition

Visual Java should not feel like an editor playing a 3D animation. It should feel like a persistent computational environment the user can enter, navigate, inspect, rewind, and understand.

The first implementation must prove both sides of the experience:

- **guided causality** — execution can direct attention when helpful;
- **free spatial exploration** — the user can take control, move through the runtime, and never lose orientation.

A build that only looks impressive while the automatic camera is playing has not reached the target.

## Visual reference direction

Open `references/00_REFERENCE_BOARD.png`, then inspect every image in `references/` at full size. These concept frames establish ambition, atmosphere, spatial density, navigation, and product character.

They are **not** pixel-perfect blueprints. Codex may improve composition and invent new details when the result is more coherent, more usable, more impressive, or more faithful to runtime semantics.

Read `REFERENCES_EPIC.md` for the external cinematic/spatial/interaction principles behind the concept frames.

## Shared implementation contract

These files keep the product coherent:

- `DESIGN_SYSTEM.md`
- `DESIGN_TOKENS.json`
- `MOTION_SYSTEM.md`
- `SCENE_CONSISTENCY.md`
- `SPATIAL_WORLD.md`
- `CAMERA_AND_NAVIGATION.md`
- `IMPLEMENTATION_DISCIPLINE.md`
- `POLISH_AND_QA.md`
- `PERFORMANCE_BUDGET.md`

These are constraints on the world, not a ban on creativity. `CREATIVE_FREEDOM.md` defines where Codex is expected to invent.

## True-3D rendering update (v2.6)

The newest references in `references/06` through `references/11` are the primary implementation targets for runtime geometry. The intended result is genuine Three.js/R3F space built from coherent extruded rectangular solids with real depth, occlusion, lighting, camera travel, and stable XYZ positions.

The runtime data itself is the architecture. Avoid literal sci-fi cities or decorative game environments.

## Future Spatial 2.0 direction

The root [best.png](../../best.png) is the future visual north star. [The Phase 3 design note](../checkpoints/v12-p3/BEST_REFERENCE.md) states what to emulate and what must remain grounded in execution. Phase 3 supplies semantic provenance; it does not authorize a shell or Spatial rewrite.
