# Build Sequence

## Milestone 0 — Preproduction + Creative Exploration

Read the full packet, including `CREATIVE_FREEDOM.md` and `HERO_OPENING.md`. Lock the semantic event schema and scene model, but allow controlled visual exploration before freezing the composition.

For the hero runtime world, prototype 2–3 materially different approaches to at least one major visual system (for example stack architecture, heap layout, reference rendering, or camera choreography). Compare them against clarity, spectacle, coherence, performance, and the reference board. Choose one direction and remove the rest.

Then lock the hero composition, persistent world layout, semantic zoom strategy, and first demo storyboard before large implementation work.

Prototype the world in both states: (1) guided playback and (2) camera fully under user control. If the scene stops making sense when the camera is free, redesign the spatial grammar before proceeding.

The goal is to prevent drift into a generic IDE **without preventing original invention**.

## Milestone 1 — Runtime Skeleton

Create deterministic `Person` trace data, the runtime reducer, snapshots, timeline state, source-line synchronization, primitive stack/heap scene objects, stable spatial IDs/anchors, and the camera/navigation state machine.

No heavy visual effects yet. Validate forward and reverse navigation first.

## Milestone 2 — Hero Scene

Turn the primitive scene into the intended persistent spatial composition. Add stack-frame architecture, heap-object identity, reference connections, inspection, selection, Home/Focus/Follow behavior, free orbit/pan/zoom, and semantic zoom levels.

## Milestone 3 — Navigation Proof

Before adding heavy cinematic polish, prove the world works as a place:
- interrupt Guided Follow and freely explore;
- focus `Person #1`;
- trace `p` from stack to heap;
- return Home;
- scrub backward while preserving spatial anchors;
- zoom from macro to meso to micro detail;
- continue execution while exploring elsewhere without camera theft.

Do not advance if this feels like orbiting a decorative scene rather than navigating runtime semantics.

## Milestone 4 — Cinematic + Originality Pass

Add event choreography: allocation formation, reference growth, field mutation, method entry/return, execution pulses, focus transitions, and carefully bounded particles/lighting.

Also add 1–3 original interaction or presentation ideas that are not literal copies of the reference frames, provided they strengthen the runtime experience and comply with `CREATIVE_FREEDOM.md`.

## Milestone 5 — Interaction Pass

Add object follow mode, frame focus, timeline scrub, replay interval, hover/tap affordances, reduced-motion mode, and resilient resize behavior.

## Milestone 6 — Additional Theaters

Add loop, recursion, array, and exception demos using the exact same semantic runtime model.

If a special visual theater is needed, it consumes the same state rather than creating a separate animation system.

## Milestone 7 — Real Java Bridge

Only after the experience is compelling, replace pre-authored traces with captured Java execution for a constrained subset of Java. Expand language/runtime coverage gradually.

## Mandatory quality gate between milestones

Before advancing from one milestone to the next:
1. run the feature;
2. capture the overview, event, and selected states;
3. compare against the local reference board;
4. check against `DESIGN_SYSTEM.md`, `MOTION_SYSTEM.md`, and `SCENE_CONSISTENCY.md`;
5. fix visible drift;
6. verify timeline determinism and reduced-motion behavior;
7. only then continue.

Do not treat visual consistency as a final cleanup phase.
