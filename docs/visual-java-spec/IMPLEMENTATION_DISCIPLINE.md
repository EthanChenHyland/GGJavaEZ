# Visual Java — Codex Implementation Discipline

These rules exist to stop a strong coding agent from producing individually impressive pieces that do not cohere.

## 1. Build the system, not isolated screens

Before scene polish, create shared modules for:
- design tokens;
- materials;
- lighting rig;
- camera/navigation state machine;
- persistent spatial layout/anchor engine;
- semantic zoom / LOD controller;
- runtime label components;
- stack frame primitive;
- heap object primitive;
- reference connection primitive;
- selection/focus state;
- motion tokens;
- timeline controls.

Every demo must reuse these primitives.

## 2. No local visual inventions without justification

Do not introduce a new:
- color;
- material;
- glow;
- font size;
- radius;
- camera behavior;
- connection style;
- animation curve;
- runtime entity shape;

inside an individual feature unless it represents a genuinely new semantic concept.

If a new concept is needed, add it to the shared design system first.

## 3. Separate semantic and presentation state

Never store visual animation progress in the semantic runtime snapshot.

Semantic state says:
- what exists;
- what values are;
- what references point to;
- which frame is active;
- what event index/time is current.

Presentation state says:
- current camera interpolation;
- hover;
- material emphasis;
- transient event pulse;
- inspector transition.

## 4. Screenshot-driven implementation

After each major milestone, Codex should inspect screenshots of its own output and critique them against:
- `references/00_REFERENCE_BOARD.png`;
- `DESIGN_SYSTEM.md`;
- `SCENE_CONSISTENCY.md`;
- `MOTION_SYSTEM.md`;
- `SPATIAL_WORLD.md`;
- `CAMERA_AND_NAVIGATION.md`.

It should explicitly identify visible inconsistencies before continuing.

## 5. One hero scene first

Do not build recursion, arrays, graphs, and exceptions in parallel.

The `Person` scene must establish the reusable visual grammar first. Only after it passes the polish gate may later theaters extend the system.

## 6. Avoid premature platform work

Do not spend early cycles on:
- authentication;
- accounts;
- cloud sync;
- project management;
- extension systems;
- collaborative editing;
- AI chat;
- settings panels;
- arbitrary Java support.

The initial product succeeds or fails on the runtime experience.

## 7. Preserve a living style contract

When implementation reveals a necessary design change, update the relevant spec file and shared token source at the same time. Never let the code silently diverge from the design packet.

## 8. Do not confuse consistency with rigidity

Shared primitives and tokens are a foundation, not a prohibition on invention.

Codex is expected to propose better solutions where appropriate. When a new visual idea deserves to become part of the product language:
1. prototype it locally;
2. validate it against semantic clarity and performance;
3. promote it into the shared system;
4. reuse it consistently thereafter.

The wrong outcome is ad hoc divergence. The equally wrong outcome is refusing a strong idea because the first draft of the design system did not already contain it.


## 9. No camera logic hidden in entities

Runtime primitives may emit semantic focus intents, but they do not directly animate the camera. Centralize Home, Guided Follow, Free Explore, Focus, Trace Path, and Theater transitions in the navigation system.

This keeps behavior consistent and makes all auto-motion interruptible.

## 10. Preserve spatial anchors through time

The runtime reducer should not decide world coordinates. The spatial layout layer should reuse anchors by stable runtime identity and only re-layout when topology requires it.

Add tests that step and scrub through the same trace and assert that unchanged identities keep stable anchors within defined tolerance.
