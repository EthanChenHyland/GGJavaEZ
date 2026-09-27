# Visual Java — Performance Budget

Visual Java only feels premium if interaction remains immediate. The hero scene must not become a beautiful 24 fps demo.

## Targets

Primary target:
- modern Apple Silicon / modern discrete-GPU laptop;
- ~60 fps during normal orbit and playback at the default quality level;
- responsive input even during event choreography.

Graceful fallback:
- maintain semantic clarity at lower rendering quality;
- reduce decorative effects before reducing important runtime information.

## Rendering priorities

Protect, in order:
1. input responsiveness;
2. semantic geometry and labels;
3. reference readability;
4. camera motion;
5. event emphasis;
6. atmospheric polish.

## Practical constraints

- Cap device pixel ratio where necessary.
- Reuse geometry and materials.
- Use instancing for repeated data structures.
- Use semantic LOD so macro views do not render micro detail.
- Cull or simplify labels/references that are semantically irrelevant at the current scale.
- Preserve stable spatial anchors when quality tiers change; quality adaptation must never move the world.
- Avoid React state updates in the render loop.
- Keep semantic state updates event-driven.
- Pool transient particles/effects where practical.
- Use post-processing selectively and allow quality scaling.
- Avoid expensive full-scene transparency.
- Suspend/reduce ambient work when the tab is inactive.
- Dispose of Three.js resources deliberately.

## Adaptive quality

Define quality tiers rather than scattering performance conditionals:

### High
- full post-processing;
- richer shadows;
- higher particle count;
- higher render scale.

### Balanced
- reduced samples / shadow quality;
- limited particles;
- moderate render scale.

### Low
- semantic geometry and labels preserved;
- minimal post-processing;
- simplified shadows;
- no nonessential particles.

Quality changes must never alter semantic state.

## Performance QA

For each hero milestone, record:
- average frame rate while idle;
- average frame rate during allocation choreography;
- average frame rate while orbiting;
- scrub responsiveness through the complete trace;
- memory stability after repeated replay/reset cycles.

If a visual effect is expensive and not memorable, remove it.


## Navigation performance

Free exploration is a core workflow, so measure it directly.

Required checks:
- no perceptible input lag when orbit begins during playback;
- cancelling Guided Follow does not hitch;
- semantic LOD transitions avoid large allocation spikes;
- focusing a dense object cluster remains smooth;
- Home transition remains smooth after extended free exploration;
- timeline scrubbing does not rebuild the entire spatial layout when only values changed.
