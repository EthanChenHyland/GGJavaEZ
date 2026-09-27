# Milestone 1.5 / 1.75 — Canonical representations

The user's refinement adds Classic alongside Spatial. The true-3D requirements remain binding for Spatial; Classic is an intentional conventional 2D renderer, not a simulated 3D fallback.

## Shared vocabulary

| Runtime concept | Visual |
|---|---|
| Stack | Ordered stack region |
| Frame | Rectangular container; extruded block in Spatial |
| Local / primitive | Named slot with value inside its owning frame |
| Heap / object | Separate heap region; rectangular container / cuboid |
| Field | Named subdivision inside the object |
| Reference | Directed connector from a named slot to an object |
| null | Explicit value with no heap target |
| Method entry / return | Frame added / removed |
| Mutation | Value changes in the same slot |
| Current execution | Synchronized source location and active runtime context |
| Future array / exception | Indexed equal cells / propagation through existing frames |

## Architecture

One TraceDocument, reducer, RuntimeState, cursor, selection, and inspector serve every renderer. `buildSceneModel` provides semantic entities and stable Spatial anchors. The Classic adapter projects these same IDs, labels, slots, and reference topology into reserved 2D regions; it never infers state from source or simulates execution. Spatial renders the same rectangular vocabulary in actual XYZ space.

Representation (`Classic | Spatial | Theater`) is independent of explanatory guidance (`On | Off`). Turning guidance off preserves current state and representation. Source synchronization remains available as runtime truth. Follow Execution controls camera following; deliberate exploration cancels following without cancelling playback.

Theater is a reserved representation capability, unavailable for Person because conventional stack/heap views already explain its behavior. Future Theater adapters must consume the same semantic snapshot and originating identities. No recursion or array theater is implemented in this pass.

Camera commands share the existing navigation-intent system. Each renderer interprets the same zoom/reset/focus intents in its projection. Spatial retains its pose while hidden and suspends drawing. Switching view never resets playback or selection.
