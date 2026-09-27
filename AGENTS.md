# GGJavaEZ / Visual Java — Multi-Agent Operating Contract

## Mission

Build **Visual Java** as a true 3D, explorable runtime world where Java execution becomes spatial, inspectable, and time-navigable.

This is not a generic IDE, SaaS dashboard, flat node graph, or decorative sci-fi scene. The runtime data itself is the architecture.

Before changing the repository, every agent must:

1. Read this file.
2. Read every Markdown file under `docs/visual-java-spec/`.
3. Inspect every image under `docs/visual-java-spec/references/` at full size.
4. Treat `docs/visual-java-spec/CODEX_MASTER_PROMPT.md` as the primary product brief.
5. Treat the design system, runtime architecture, spatial world, camera/navigation, motion system, performance budget, implementation discipline, and QA documents as binding constraints.

---

## Root / Lead Agent Responsibilities

The root agent owns the product as a coherent whole. It is responsible for:

- architecture and system-wide contracts
- task decomposition and delegation
- protecting the visual language and product vision
- deciding shared interfaces before parallel work begins
- resolving disagreements between subagent proposals
- integration and final code review
- visual consistency across all scenes
- running the complete validation suite before declaring a milestone complete

The root agent should delegate when independent work can proceed in parallel **without causing architectural or visual drift**.

Do not delegate the final decision on system-wide contracts. Subagents may propose alternatives, but the root agent must choose and document the shared direction.

---

## Delegation Rules

### Delegate good boundaries

Good subagent tasks are narrow, testable, and independently reviewable, for example:

- normalized trace schema + runtime reducer
- persistent spatial-layout engine
- reusable R3F stack/heap geometry primitives
- reference-line rendering
- camera/navigation state machine
- timeline/playback/reverse stepping
- object selection + inspector plumbing
- performance profiling
- screenshot-based visual QA
- focused tests or documentation

### Do not delegate vague ownership

Avoid assignments such as:

- "make the UI cool"
- "build the 3D stuff"
- "finish the frontend"
- "improve the design"

Those invite incompatible local design systems.

### Prevent file collisions

When parallelizing implementation:

- give each subagent explicit file/module ownership where practical
- avoid having multiple agents make broad edits to the same files concurrently
- define shared types/interfaces first
- if two tasks necessarily touch the same integration file, serialize those edits or let only the root agent perform integration

### Every subagent handoff must include

A subagent should report:

1. what it changed
2. files touched
3. architectural decisions made
4. assumptions
5. tests/checks run
6. known limitations or follow-ups
7. anything the root agent must reconcile before merge

The root agent must review the diff rather than accepting a subagent's summary at face value.

---

## Shared Contracts Before Parallel Coding

Before major implementation fan-out, the root agent should establish the minimum shared contracts needed to prevent drift, especially:

- trace event types and IDs
- `RuntimeState` shape
- stable object/frame identity rules
- spatial entity IDs and anchors
- scene-model interfaces
- design tokens and semantic colors
- camera mode/state definitions
- playback/timeline semantics
- selection/focus contracts

Once these are defined, subagents may build against them in parallel.

Do not casually mutate shared contracts mid-flight. If a change is necessary, the root agent must update the contract and reconcile affected work.

---

## Suggested Multi-Agent Split for Milestone 1

For the first `Person` vertical slice, a strong split is:

### Root Agent — Architecture + Integration + Visual Direction

Own:

- product interpretation
- shared contracts
- repository structure
- integration scene
- design-system enforcement
- final polish
- acceptance testing

### Subagent A — Trace + Runtime State

Own:

- deterministic mock trace JSON
- normalized event schema
- runtime reducer
- forward/backward state reconstruction
- stable runtime IDs
- reducer tests

### Subagent B — 3D Runtime Primitives

Own:

- stack-frame cuboid primitive
- heap-object cuboid primitive
- field/local presentation in 3D
- shared materials
- semantic selection/highlight states
- reference-line primitive if scoped cleanly

Must use the shared design system rather than inventing a new aesthetic.

### Subagent C — Camera + Navigation

Own:

- orbit/pan/dolly behavior
- Home
- Focus
- Guided Follow vs Free Explore behavior
- user-input-overrides-camera rule
- semantic zoom behavior

### Subagent D — Timeline + Playback

Own:

- play/pause
- next/previous step
- scrubbing
- deterministic event index/time mapping
- reverse stepping behavior
- playback state hooks

### Subagent E — QA + Performance Review

Prefer using this after the first integration pass.

Own:

- screenshot review against references
- true-3D acceptance checks
- visual-consistency audit
- performance profiling
- interaction regression checks
- identifying flatness, excessive glow, weak hierarchy, scene drift, or jank

The root agent remains responsible for actually approving and integrating fixes.

---

## Model Use

When model selection is available:

- use the strongest reasoning/coding model available for the root/lead role
- use strong coding-capable models for delegated implementation tasks
- reserve cheaper/faster models for low-risk repetitive work such as small tests, cleanup, or documentation

Do not sacrifice architectural coherence merely to maximize parallelism.

---

## Visual Java Non-Negotiables

1. The primary runtime visualization must use genuine 3D world coordinates and actual WebGL/Three.js geometry.
2. CSS perspective, flat cards in a 3D-looking layout, or a 2D node graph do not satisfy the core requirement.
3. The runtime data itself is the architecture. Do not construct decorative cities, rooms, roads, planets, avatars, bridges, or game scenery around it.
4. Prefer extruded rectangular solids/cuboids as the shared visual vocabulary for stack frames, heap objects, arrays, and runtime structures unless a different geometry is semantically justified.
5. Preserve stable spatial identity through time. Scrubbing execution should update the world in place rather than arbitrarily relayouting it.
6. User camera input always wins over scripted camera motion.
7. Stack, heap, references, timeline, and special theaters must feel like one visual universe.
8. Shared materials, lighting, typography, semantic colors, motion grammar, and interaction states should come from central primitives/tokens rather than per-scene reinvention.
9. A still screenshot of the hero scene should make real Z-depth obvious.
10. Free orbit/pan/dolly must make it clear that the runtime is a place the user can navigate.

---

## Creative Freedom

Agents are encouraged to improve on the references when they have a stronger solution.

Creative freedom is welcome in:

- exact cuboid proportions and spatial composition
- camera choreography
- shaders/material treatment
- subtle atmosphere
- microinteractions
- transitions
- inspector presentation
- elegant semantic zoom behavior
- novel visual encodings that remain faithful to runtime truth

Creative freedom is **not** permission to change the semantic meaning of stack, heap, references, execution state, or timeline behavior.

A strong original solution is preferred over a weak literal copy of a reference.

Do not ask permission for every small creative decision. Take initiative inside the design contract.

---

## First Vertical Slice

Build the `Person` runtime scene first using deterministic mock trace JSON.

Required behavior:

- source-code view with current-line highlighting
- stack frames as true 3D extruded solids
- heap objects as true 3D extruded solids
- stable references in 3D space
- `Person #17` allocation
- constructor frame and `this` reference
- `p -> Person #17`
- `setAge(18)` frame
- visible `age: 0 -> 18` mutation
- play/pause
- forward/backward stepping
- scrubbable timeline
- free orbit/pan/dolly navigation
- Home and Focus interactions
- object selection and inspector
- stable world layout while scrubbing through time

Do not move on to recursion, arrays, AI integration, or real JVM instrumentation until this vertical slice is coherent, polished, and passes the acceptance criteria below.

---

## Integration + Quality Gate

After parallel work is integrated, the root agent must run a convergence pass.

At minimum:

1. build/typecheck succeeds
2. lint/tests succeed where configured
3. timeline is deterministic forward and backward
4. runtime IDs remain stable through replay/scrubbing
5. no obvious file/module duplication from parallel work
6. scene uses genuine X/Y/Z geometry
7. orbit/pan/dolly works
8. Home/Focus behavior works
9. screenshot clearly shows real spatial depth
10. design tokens and shared primitives are used consistently
11. no scene-specific visual system has drifted from the product language
12. interaction remains responsive at the intended desktop target
13. root agent captures screenshots and compares them against the supplied references
14. root agent performs a dedicated polish pass after functionality is complete

A milestone that functions but looks inconsistent, flat, generic, or visually unfinished is not complete.

---

## Build Discipline

- Prefer a polished vertical slice over broad feature coverage.
- Do not install large libraries without a concrete reason.
- Avoid premature abstraction, but centralize truly shared visual/runtime primitives early enough to prevent divergence.
- Keep deterministic mock traces separate from rendering logic so real JVM traces can later feed the same runtime pipeline.
- Do not let subagents independently invent incompatible event schemas, design tokens, coordinate systems, or camera semantics.
- Preserve rollback points and make changes in reviewable increments.
- If a delegated path turns out to be wrong, stop and simplify rather than layering workarounds on top of it.

The goal of multi-agent execution is **higher quality and faster iteration**, not maximum agent count.
