# Visual Java — Motion System

Primary motion is semantic. It shows **cause, state change, hierarchy, and time**. Major animations should answer at least one of those questions. Subtle ambient motion may exist for depth and atmosphere when it stays quiet enough that the semantic layer always wins.

## 1. Shared timing tokens

Use shared timing values instead of one-off durations.

```ts
export const motion = {
  instant: 90,
  quick: 160,
  standard: 260,
  deliberate: 420,
  cinematic: 680,
  hero: 950,
};
```

Recommended easing families:

```ts
export const easing = {
  ui: [0.22, 1, 0.36, 1],
  enter: [0.16, 1, 0.3, 1],
  exit: [0.4, 0, 1, 1],
  causal: [0.65, 0, 0.35, 1],
};
```

Do not give every event a different custom curve.

## 2. Event choreography

### Line execution
1. Source line enters active state (`quick`).
2. Causal pulse begins in runtime (`standard`).
3. State mutation lands.
4. Emphasis settles before the next event.

### Allocation
1. Heap destination region subtly focuses.
2. Object identity appears as a low-opacity volume.
3. Geometry resolves/assembles into its stable body (`cinematic`).
4. Object ID/fields become readable.
5. Reference connection grows only when the trace says the reference exists.

### Assignment
- Existing target remains in place.
- Old value transitions out while new value arrives/morphs.
- Mutation accent is temporary.
- Do not rebuild the whole object.

### Reference creation
- Connection grows from semantic source to target.
- Use one consistent path style in every scene.
- Endpoint confirmation pulse occurs once.

### Dereference
- A short energy pulse travels along an already-existing reference.
- The line itself does not permanently change style.

### Method entry
- New frame expands from the caller's stack context.
- Camera may reframe only when needed.
- The user's sense of caller/callee relationship must remain intact.

### Method return
- Return value travels to its semantic destination if one exists.
- Frame then contracts/dissolves.
- Returning should visually reverse hierarchy, not merely fade out.

### Exception
- Normal cadence breaks abruptly.
- Origin becomes unmistakable.
- Propagation travels frame-to-frame.
- Nonessential ambient motion pauses.
- Error state remains inspectable after the animation completes.

## 3. Camera grammar

The camera is an explanatory tool, not a demo reel.

Use only these camera operations unless a scene specifically justifies another:
- `reframe`: fit selected semantic region;
- `dolly`: move closer/farther while preserving orientation;
- `orbit`: user-controlled inspection;
- `track`: follow a causal event or selected entity;
- `return`: go back to the stable overview.

Automatic camera movement rules:
- never rotate wildly around the scene;
- never move on every single trace event;
- keep horizon/orientation stable across ordinary operations;
- camera motion should complete before fine text inspection is required;
- user interaction cancels or softens automatic camera control.

## 4. Ambient motion

Ambient movement is restrained but not forbidden:
- subtle material breathing, depth drift, fog, or data flow may exist;
- environmental particles may exist at low density when they add depth;
- idle runtime entities do not bob, spin, or float continuously unless that motion encodes state;
- event particles remain stronger and more local than environmental atmosphere;
- the scene should still read clearly with atmospheric effects temporarily disabled.

## 5. Playback speed

Support speed multipliers with semantic stability:
- 0.5x
- 1x
- 2x
- 4x

At faster speeds, reduce or skip secondary flourishes while preserving state transitions and causal readability.

## 6. Scrubbing

Timeline scrubbing must be deterministic.

When scrubbing:
- reconstruct the semantic snapshot first;
- place all entities in their correct stable state;
- use only short interpolation to avoid harsh popping;
- never attempt to literally reverse particle simulations or procedural birth effects.

## 7. Reduced motion

Reduced-motion mode must preserve meaning:
- replace camera flights with quick reframes;
- replace object assembly with opacity/scale transition;
- replace traveling pulses with endpoint emphasis;
- remove particles and nonessential motion;
- keep timeline and state transitions fully usable.
