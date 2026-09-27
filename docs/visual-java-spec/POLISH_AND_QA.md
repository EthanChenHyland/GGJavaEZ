# Visual Java — Polish & QA Gate

A milestone is not complete because it compiles. It is complete only when behavior, rendering, and visual consistency pass this gate.

## 1. Required review loop for every major scene

1. Implement the semantic behavior.
2. Capture the stable overview.
3. Capture the most important event state.
4. Capture a selected/inspected state.
5. Compare against the reference board and design system.
6. Fix hierarchy, spacing, typography, lighting, and motion drift.
7. Only then move to the next scene.

Do not postpone all polish to the end.

## 2. Visual regression checkpoints

Capture screenshots at minimum:
- 1440 × 900
- 1728 × 1117 or comparable laptop viewport
- 1280 × 800

Also verify runtime-focus mode and a narrow layout.

Keep golden screenshots in a versioned `visual-tests/` or `docs/checkpoints/` directory so later changes can be compared.

## 3. Pixel-level consistency checks

Check:
- editor divider alignment;
- panel heights;
- border opacity;
- text baselines;
- control sizes;
- corner radii;
- timeline spacing;
- inspector placement;
- label padding;
- consistent semantic colors;
- same material response across equivalent 3D entities.

## 4. 3D quality checks

At default view:
- every important label is readable;
- stack and heap are immediately distinguishable;
- active event is obvious within 250 ms;
- references can be visually traced from source to target;
- selected object remains obvious while orbiting;
- bloom does not wash out text;
- depth does not create accidental overlaps;
- post-processing does not reduce UI sharpness.

## 5. Motion checks

For each event:
- can a viewer tell what changed?
- can they tell what caused it?
- does the animation end in the exact semantic state?
- does playback at 2x still make sense?
- does reverse/scrub reconstruct correctly?
- does reduced-motion mode preserve meaning?

If not, the effect fails regardless of how impressive it looks.

## 6. Performance target

Hero scene target on modern laptop hardware:
- smooth interaction near 60 fps;
- no avoidable React rerenders on every render frame;
- reuse geometry/materials where practical;
- instancing for repeated array/graph entities when useful;
- adaptive quality for expensive post-processing;
- pause or reduce nonessential animation when the tab is not active.

Never trade semantic correctness for frame rate; instead reduce decorative rendering cost.

## 7. Anti-slop sweep

Before a milestone is accepted, search for and remove:
- arbitrary raw hex colors;
- arbitrary z-index values;
- inconsistent spacing constants;
- duplicate materials;
- duplicate easing curves;
- ad hoc shadow/glow definitions;
- unused particles;
- decorative grids/rings with no meaning;
- different interaction behavior for equivalent entities;
- placeholder copy or generic AI text.

## 8. Definition of polished

A polished Visual Java scene should survive all three tests:

### Screenshot test
A still frame looks deliberately art-directed.

### Motion test
A screen recording communicates causality without narration.

### Interaction test
A new user can click, orbit, scrub, and inspect without fighting the interface.


## 9. Spatial navigation gate

A hero scene must also pass the persistent-world test:

- **Home test:** from an arbitrary camera pose, Home returns to a recognizable overview.
- **Interruption test:** user camera input immediately cancels nonessential auto-camera motion.
- **No-theft test:** with Guided Follow off, execution never yanks the camera away.
- **Anchor test:** unchanged objects do not jump when stepping or scrubbing.
- **Focus test:** focus an entity, inspect it, then return to the prior/world pose without disorientation.
- **Path test:** following `p -> Person #1` makes the relationship clearer than a static line alone.
- **LOD test:** macro, meso, and micro zoom levels reveal intentionally different information density.
- **Theater return test:** enter a special theater and return to the same originating runtime identity.
- **Lost-user test:** after 30 seconds of free exploration, the user has obvious Home / Return to Execution affordances.

If a screen recording only makes sense because of scripted camera choreography, this gate fails.

## 10. Originality check

Before accepting the hero scene, ask:
- does this merely resemble the supplied concept frames, or has it become a product with its own identity?
- is there at least one interaction, transition, or spatial idea that feels uniquely Visual Java?
- did any safe/default UI convention survive simply because it was easiest?
- does the scene still obey the shared semantic grammar despite creative additions?

## 11. Performance gate

Apply `PERFORMANCE_BUDGET.md` before accepting cinematic polish. A beautiful feature that damages interaction latency or makes ordinary playback feel heavy must be simplified or made adaptive.
