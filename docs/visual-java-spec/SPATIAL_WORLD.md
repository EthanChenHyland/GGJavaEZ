# Visual Java — Persistent Runtime World

## North star

The runtime is a **place**, not a sequence of disconnected shots.

A user should be able to build a mental map of a running Java program, move through that map, leave the guided execution camera, explore freely, and return to the same semantic locations later.

The closest conceptual ambition is the class of systems that make abstract information spatially navigable. Visual Java applies that idea to **live computation**: stack, heap, references, control flow, and time become a persistent world.

This is not permission to turn the product into a game. Spatial navigation exists to make program state and causality easier to understand.

## 1. Persistent spatial ontology

The default world has stable semantic regions:

```text
SOURCE EDGE            STACK SPINE          REFERENCE FIELD                 HEAP CONSTELLATION
(left / near-left)     (center-left)        (center / connective space)     (right / deeper space)

       code  ->  main()  ->  setAge()  ------------------------------->  Person #1
                    |                                              \\----> String #2
                    |
                    +---- locals / parameters

-----------------------------------------------------------------------------------------------
                              EXECUTION TIME / HISTORY PLANE
```

The exact geometry is open to creative interpretation, but these meanings must stay stable across the product.

- Stack frames occupy a coherent call-hierarchy zone.
- Heap identities persist in a coherent object zone.
- References cross a connective field rather than appearing as arbitrary decoration.
- Execution time has a stable spatial anchor, normally beneath or behind the primary world.
- The source editor remains a portal into the same world, not a separate product.

## 2. Stable identity means stable location

If `Person #17` exists at event 42 and still exists at event 43, it should not teleport to a completely different location because the layout recomputed.

Use stable IDs and incremental layout.

When topology changes:
- preserve existing anchors where possible;
- add new entities into available semantic space;
- move existing entities only when necessary to maintain legibility;
- animate necessary relocation as a meaningful re-layout, not an unexplained jump.

Scrubbing backward should restore previous semantic state while preserving the user's mental map whenever possible.

## 3. Three semantic zoom levels

The world should reveal different information as the user moves through it.

### Macro — program landscape

Purpose: understand the whole runtime.

Show:
- active call-chain silhouette;
- clusters of live heap objects;
- major reference topology;
- thread lanes when supported;
- event-density hints on the history plane.

Hide or simplify:
- most field values;
- micro-labels;
- individual primitive slots unless selected.

At this level, the runtime should read like a computational map.

### Meso — frame/object inspection

Purpose: understand relationships and current state.

Show:
- method names;
- locals / parameters;
- object identities;
- important fields;
- explicit references;
- current execution event.

This is the default working level.

### Micro — inside an entity

Purpose: inspect one object, frame, collection, or causal chain.

Show:
- complete relevant fields / locals;
- mutation history;
- inbound and outbound references;
- source-line relationship;
- exact event history for that entity.

The transition between levels should feel like zooming into the same world, not opening unrelated modal screens.

## 4. Navigation modes

### Guided Follow

Default during first-run playback.

The camera follows important execution events with restrained choreography. The user may interrupt at any time.

### Free Explore

The user owns the camera.

Execution may continue, but the camera does not forcibly drag the user away. Current execution is communicated through lighting, pulses, directional cues, and optional edge indicators.

### Focus

Double-click / dedicated Focus action on an entity.

The camera frames it cleanly, nearby relationships become readable, and the inspector synchronizes. Focus does not destroy the surrounding world.

### Trace Path

Follow a semantic relationship:
- variable -> referenced object;
- object -> referenced object;
- caller -> callee;
- exception origin -> propagation path;
- object -> mutation history.

The camera and emphasis should make the path understandable while preserving context.

### Home

A single predictable action returns to the stable runtime overview.

The user should never feel lost in 3D space.

## 5. The user can enter the program

Important interactions should feel spatially direct:

- click a frame -> select it;
- double-click -> focus / approach it;
- click a reference -> emphasize and optionally travel along the connection;
- click an object -> inspect its identity and field state;
- choose “show inbound references” -> illuminate all sources pointing at it;
- choose “follow lifetime” -> reveal its events along the time dimension;
- choose a source line -> locate the corresponding current or historical runtime entity/event;
- choose a runtime entity -> reveal the relevant source line.

## 6. Time must not destroy space

Time navigation changes **state**, not the existence of the world model.

When scrubbing:
- unchanged entities remain spatially stable;
- changed values morph in place;
- created entities emerge from their semantic region;
- destroyed/out-of-scope entities resolve out of the world;
- relationships update without wholesale graph reshuffling;
- camera position stays where the user put it unless Guided Follow is explicitly enabled.

Optional historical ghosts/trails may show where an object or relationship existed, but only when useful and visually controlled.

## 7. Special theaters are transformations of the same world

Recursion, arrays, graphs, and exceptions must not feel like unrelated mini-apps.

Examples:
- recursion stretches the existing stack spine into a deeper call shaft;
- an array object expands in place into an Array Rail;
- a graph object unfolds from its heap identity into a topology field;
- exception mode overlays propagation onto the existing stack architecture;
- returning from a theater collapses back to the originating entity/location.

The user should always know **where the theater came from**.

## 8. Orientation aids

Provide enough orientation to make free exploration practical without cluttering the scene.

Recommended:
- subtle world-axis / region labels at macro scale;
- Home / Focus / Follow controls;
- selected-entity breadcrumb;
- optional compact runtime minimap or overview strip;
- off-screen indicators for current execution when the user is exploring elsewhere;
- visible “return to execution” affordance.

Do not cover the runtime with a game HUD.

## 9. Spatial layout rules

Prefer deterministic, semantic placement over unconstrained physics.

Physics/springs may soften motion, but they must not decide semantic meaning.

Good:
- call hierarchy determines stack depth;
- stable object IDs anchor heap placement;
- reference topology influences nearby grouping;
- selected entity can temporarily gain breathing room;
- new objects enter near related identities if legibility remains strong.

Bad:
- force-directed layout continuously rearranging the heap;
- random coordinates per run;
- camera-dependent object movement;
- objects drifting for atmosphere.

## 10. World continuity test

A build passes only if all are true:

1. Pause execution, freely navigate away, then return Home and recognize the same world.
2. Scrub backward and forward without unchanged objects jumping arbitrarily.
3. Focus an object, inspect it, return to overview, and retain orientation.
4. Enter a special theater and return to the originating entity.
5. Turn Guided Follow off and continue execution without the camera stealing control.
6. At macro, meso, and micro scales, information density changes deliberately rather than labels simply becoming tiny.

If the experience is only impressive when the automatic camera is playing, the spatial model is not finished.
