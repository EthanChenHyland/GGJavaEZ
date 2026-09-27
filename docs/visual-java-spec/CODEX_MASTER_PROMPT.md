# Codex Master Prompt — Visual Java

You are building **Visual Java**, a cinematic, 3D-first Java runtime visualization environment.

Read every specification file in this repository before modifying code.

## Consistency Is a Hard Requirement

Visual polish must come from a reusable design system, not ad hoc scene styling. Treat `DESIGN_SYSTEM.md`, `DESIGN_TOKENS.json`, `MOTION_SYSTEM.md`, `SCENE_CONSISTENCY.md`, `SPATIAL_WORLD.md`, `CAMERA_AND_NAVIGATION.md`, `IMPLEMENTATION_DISCIPLINE.md`, and `POLISH_AND_QA.md` as implementation contracts.

Before building hero visuals, create shared primitives/tokens for materials, lighting, runtime labels, stack frames, heap objects, references, selection, camera behavior, and motion. Later demos must extend these primitives rather than inventing new art directions.

After each visual milestone, capture screenshots of your own implementation, compare them against the local reference board and these contracts, identify visible inconsistencies, and fix them before adding scope. A feature that functions but looks inconsistent is not complete.


## Creative Agency — Required

Read `CREATIVE_FREEDOM.md` and `HERO_OPENING.md` before proposing the first scene.

You are not being asked to reproduce the concept frames pixel-for-pixel. You are expected to behave like a strong creative technologist: preserve the product invariants and semantic truth, while inventing stronger geometry, composition, motion, camera work, microinteractions, and atmospheric detail when you can improve the experience.

Do not ask for approval for every small aesthetic decision. Take initiative.

For major visual systems where the best direction is not obvious, briefly explore 2–3 materially different approaches, compare them against the product goals, choose one, and then converge on a single shared grammar. Do not leave abandoned experiments in the final product.

A creative deviation from a reference is welcome when it is more legible, coherent, impressive, performant, or semantically faithful.

Subtle atmosphere may exist even when it does not encode a unique runtime concept, provided it stays subordinate to runtime information. The old rule “if an effect communicates nothing, remove it” applies to prominent/persistent effects, not every trace of mood or environmental depth.

Avoid safe mediocrity. The emotional target is: **“I have never seen code execution feel like this before.”**


## Genuine 3D Geometry — Hard Requirement

The runtime world must be implemented as **real 3D geometry**, not a 2.5D composition.

- Use Three.js / React Three Fiber world coordinates for primary runtime entities.
- Stack frames, heap objects, array cells, reference endpoints, semantic regions, and camera targets must have meaningful persistent X/Y/Z positions.
- The dominant runtime shape language is extruded rectangular solids/cuboids, as shown in `references/06_true3d_person_runtime.png` through `references/11_true3d_scene_language.png`.
- The runtime itself is the architecture. Do not build a decorative sci-fi city, room, planet system, or game world around the data.
- Real perspective, occlusion, lighting, shadows, scale, and camera motion should create depth. Do not fake the result with CSS perspective or flat cards.
- Free orbit/pan/dolly must work in the first hero slice.
- A still screenshot of the hero scene must make the Z axis and navigability obvious.

Treat the newer true-3D reference images as the primary rendering target. The earlier boards remain useful for navigation and semantic structure.

## Persistent Spatial World — Hard Requirement

Read `SPATIAL_WORLD.md` and `CAMERA_AND_NAVIGATION.md` before designing the first scene.

The runtime is **a place, not a sequence of camera shots**. A viewer should eventually feel that they can move around inside a running Java program.

This means:
- stack, heap, references, and time have stable spatial meaning;
- live entities preserve recognizable locations across neighboring events;
- unchanged entities do not arbitrarily reshuffle while scrubbing;
- users can leave Guided Follow and freely orbit/pan/zoom without the camera stealing control;
- Home, Focus, Follow Execution, and Return to Execution are predictable;
- macro/meso/micro zoom levels expose different semantic detail;
- special theaters unfold from the base runtime world and return to the originating identity.

The silent-demo target is: **“That is Java running, and they are moving around inside it.”**

Do not solve this with a decorative free camera around a static scene. Navigation must make runtime semantics more inspectable.

## Product Intent

Visual Java is not a generic IDE and not a dashboard with a visualization panel. Its core experience is a living runtime world in which real Java execution becomes spatial, interactive, and cinematic.

Users should be able to see stack frames, heap objects, references, method calls, field mutations, loops, recursion, returns, and exceptions as runtime entities and events. They should be able to orbit, inspect, isolate, scrub backward and forward through time, and follow causality.

The emotional target is awe. The technical constraint is truth.

## Hard Requirements

- The 3D runtime scene is the hero of the product.
- The editor and runtime remain synchronized.
- Runtime visualization must be driven by normalized execution events and stable identities.
- Animation is never the source of truth.
- Build a deterministic playback/state engine before adding large quantities of visual polish.
- 3D must communicate structure or causality; do not add decorative 3D unrelated to program state.
- The first milestone uses curated demo programs and deterministic trace JSON. Do not block on full arbitrary Java execution.
- The codebase must be designed so real Java trace capture can replace mock trace input later without rewriting the visualization architecture.

## Anti-Goals

Do not build:
- a SaaS dashboard aesthetic;
- a wall of rounded cards;
- a generic editor clone;
- a tiny 3D preview panel;
- fake AI-generated runtime explanations masquerading as execution state;
- random cyberpunk decoration;
- a full project/workspace/settings/extensions system before the hero runtime works.

## Initial Technical Direction

Preferred frontend stack:
- React + TypeScript
- Three.js + React Three Fiber
- drei
- Monaco Editor
- Zustand or equivalent focused state store
- GSAP or Framer Motion for 2D orchestration where useful
- custom deterministic timeline/playback engine

Keep runtime domain state separate from render state.

Conceptual pipeline:

```text
trace events -> runtime reducer -> semantic snapshot -> scene model -> renderers
```

## First Vertical Slice

Implement the `Person` demo from HERO_DEMOS.md.

The first slice must support:
- synchronized source-line highlighting;
- `main` frame creation;
- local variables `x`, `y`, and `p`;
- heap allocation for `Person`;
- stable reference from `p` to the heap object;
- constructor frame with `this`;
- `name` field mutation;
- method frame for `setAge`;
- `age` mutation from `0` to `18`;
- method return and frame collapse;
- timeline play/pause;
- forward step;
- backward step;
- scrub to any event;
- click stack frame / object / reference to inspect it;
- cinematic but semantically motivated camera focus transitions;
- reduced-motion fallback;
- free orbit/pan/zoom in the runtime canvas;
- interruptible Guided Follow;
- Home view;
- Focus selected entity;
- Follow Execution toggle;
- stable object/frame anchors during forward/backward scrubbing;
- semantic zoom behavior at macro/meso/micro scales;
- click/trace the `p -> Person #1` relationship without losing world context.

## Visual Quality Bar

The prototype should immediately feel more ambitious than a normal educational visualizer. Use depth, lighting, motion, spatial hierarchy, and interaction deliberately.

Do not substitute polish with glow. The experience should remain legible and premium.

## Your First Action

Do not scaffold immediately.

First:
1. read the complete spec packet;
2. propose the domain model, event schema, playback architecture, scene graph, component tree, and project folder structure;
3. identify technical risks and where to fake data versus where semantics must already be real;
4. propose the exact visual composition and persistent spatial map for the first `Person` scene;
5. define the camera/navigation state machine and semantic zoom strategy;
6. then implement the smallest complete vertical slice that proves the full event -> state -> scene -> interaction pipeline.

When making implementation tradeoffs, protect the hero runtime experience and the trace-driven architecture above ordinary IDE completeness.


## Mandatory visual reference pass
Before proposing or implementing the first scene:

1. Open `references/00_REFERENCE_BOARD.png`.
2. Inspect **every** PNG in `references/` at full size, especially `06_true3d_person_runtime.png` through `11_true3d_scene_language.png`.
3. Read `references/README.md`.
4. Read `REFERENCES_EPIC.md`.

The local concept frames are the primary ambition and art-direction reference. Do not ignore them and fall back to a generic IDE/dashboard layout, but do not reproduce them mechanically either. They establish the bar; your implementation should develop a coherent original identity within the same world. The external references explain principles behind the target; they are not assets to copy.

For each major **runtime** scene decision, state what semantic idea it communicates (hierarchy, causality, identity, time, mutation, reference topology, etc.). Prominent or persistent effects with no semantic or experiential value should be removed. Subtle atmosphere is allowed when it improves depth, mood, and coherence without competing with information.
