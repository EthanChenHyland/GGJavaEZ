# Visual Java — Scene Consistency Contract

Every hero demo is a different **theater inside the same runtime universe**. Do not redesign the product for each program.

## 1. Stable spatial ontology

The default world orientation is constant:

```text
left / near-left      = source / editor context
center-left           = stack / call hierarchy
center-right          = references / transition space
right                  = heap / persistent objects
down / bottom plane    = execution time / history
forward toward camera  = focus / current context
backward from camera   = older / de-emphasized context
```

Special theaters may bend this layout, but transitions into and out of them must preserve continuity.

## 2. World units

Use a shared world scale.

Suggested baseline:
- standard stack frame width: 4.8 units
- stack frame height: 1.35 units
- stack frame depth: 0.55 units
- standard heap object width: 3.2 units
- heap object height: 2.1 units
- heap object depth: 0.85 units
- vertical frame gap: 0.36 units
- heap object gap: 1.25 units
- stack-to-heap semantic gap: 4–6 units

Do not size entities arbitrarily per scene.

## 3. Stable entity grammar

### Stack frame
Always contains:
- method name;
- class/owner context when useful;
- locals/parameters;
- active-line indicator when the frame is current.

### Heap object
Always contains:
- class/type;
- stable object identity (e.g. `Person #1`);
- fields;
- selection affordance.

### Primitive/local value
Use compact value chips/slots inside the owning frame, not free-floating objects unless a theater explicitly visualizes values spatially.

### Reference
A reference is a connection between a named source slot and a target identity.

It is never represented as a decorative beam detached from its source.

### Null
Null is a first-class visual state:
- source slot exists;
- connection terminates into a short, unmistakable null marker;
- do not render null as an object in the heap.

## 4. Stable labels

Runtime labels follow one hierarchy:

```text
ENTITY TYPE / METHOD        small semantic heading
Identity / variable name    primary label
value / fields              mono or value style
metadata                    secondary muted text
```

Do not change label structure between Person, recursion, arrays, and exceptions.

## 5. Selection

A selected runtime entity always gets:
- persistent edge emphasis;
- inspector synchronization;
- related connections emphasized;
- unrelated scene content slightly de-emphasized, not hidden by default.

Selection behavior must be identical across all theaters.

## 6. Focus transitions

Special theaters are scene modes, not separate apps.

Examples:
- recursion mode stretches stack architecture into a depth shaft;
- array mode expands an array object into an Array Rail;
- graph mode expands a graph object into a navigable topology;
- exception mode overlays propagation on the existing world.

The originating runtime entity remains identifiable before, during, and after transformation.

## 7. Environment

The scene environment is stable:
- same background;
- same lighting philosophy;
- same floor/depth cues;
- same fog/atmosphere settings;
- same material family;
- same camera controls.

Do not make recursion purple-space, arrays blue-cyberpunk, and exceptions red-sci-fi as separate art directions.

## 8. Editor/runtime composition

Desktop baseline:
- editor: ~30–36% width;
- runtime: ~64–70% width;
- timeline spans the composition;
- inspector appears contextually without permanently shrinking the runtime.

Runtime focus mode may compress the editor to a synchronized code strip.

## 9. Responsive behavior

At narrower widths:
- preserve runtime readability over showing every panel simultaneously;
- allow editor/runtime mode switching rather than crushing both;
- inspector becomes a drawer/sheet;
- timeline remains directly accessible.

## 10. One-world test

Put screenshots from every demo side by side. If they do not obviously belong to the same product without the logo, consistency has failed.


## 11. Persistent-world contract

The spatial ontology survives playback and exploration.

- Stable entities keep stable anchors whenever possible.
- Unchanged objects do not jump during timeline scrubbing.
- Special theaters transform from an originating entity and return to it.
- Guided Follow may reframe the world, but Free Explore never gets overridden by nonessential camera moves.
- Macro, meso, and micro zoom levels reveal different semantic detail rather than merely scaling the same labels.
- Home, Focus, Follow, and Return to Execution are predictable across every demo.

A scene that requires a scripted camera path to make spatial sense fails the one-world test.
