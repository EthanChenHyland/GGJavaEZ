# Runtime Architecture

## Core Rule

The renderer never infers runtime truth from source code alone.

The system is layered:

```text
Java execution
      ↓
trace capture / instrumentation
      ↓
normalized semantic events
      ↓
runtime state reducer
      ↓
stable snapshots + identities
      ↓
persistent spatial layout model
      ↓
scene model
      ↓
2D controls + 3D renderer
```

## Normalized Events

Initial event vocabulary:

```text
PROGRAM_START
PROGRAM_END
LINE_EXECUTE
ENTER_METHOD
EXIT_METHOD
DECLARE_LOCAL
ASSIGN_LOCAL
ALLOCATE_OBJECT
SET_FIELD
CREATE_REFERENCE
CLEAR_REFERENCE
RETURN_VALUE
BRANCH_TAKEN
LOOP_ITERATION
THROW_EXCEPTION
CATCH_EXCEPTION
```

Each event should contain enough identity information to deterministically reconstruct state.

## Stable Runtime Identities

Every stack frame, heap object, array, and reference target must have a stable identifier independent of its screen position.

Example:

```json
{
  "type": "ALLOCATE_OBJECT",
  "eventId": 24,
  "frameId": "frame-main-1",
  "objectId": "obj-person-1",
  "className": "Person",
  "source": { "file": "Main.java", "line": 15 }
}
```

A renderer may completely reorganize the scene while preserving the same runtime identity.

## Playback Model

For the hero prototype, pre-authored trace files are acceptable. The state engine should still behave exactly as though events came from a live runtime.

A reducer advances semantic state from event N to event N+1. Reverse scrubbing can either use inverse operations or periodically cached snapshots with deterministic replay.

Do not make animation state the source of truth. Animation is a visual transition between semantic states.

## Future Trace Capture

Potential production routes include JDI, bytecode instrumentation, Java agents, compiler instrumentation, or a hybrid approach. Do not let that choice block the first high-fidelity visual prototype.

The first technical goal is to prove the scene model, playback system, and interaction model against deterministic traces.


## Persistent spatial layout state

Runtime identity and world position are related but not identical. Keep a dedicated spatial layout model between semantic state and rendering.

It owns:
- stable world anchors for frames and heap objects;
- semantic region assignment (stack / reference field / heap / timeline);
- incremental layout when topology changes;
- macro / meso / micro level-of-detail decisions;
- theater expansion origin and return anchor.

It must **not** invent runtime facts. It only maps known semantic state into stable space.

Recommended conceptual flow:

```text
semantic snapshot
   + previous spatial anchors
   + current focus / LOD context
          ↓
incremental spatial layout
          ↓
stable scene model
```

Never rerun an unconstrained force layout from scratch on every event.
