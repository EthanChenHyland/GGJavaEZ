# Visual Language

## Mood

Dark, precise, immersive, premium, cinematic. The environment should feel closer to an interactive scientific instrument or high-end motion piece than to a generic developer dashboard.

Avoid visual noise. The world can be dramatic without being cluttered.

## Surfaces

Use depth, glass, translucent structural surfaces, metal-like anchors, luminous edge treatments, and restrained particles only when they help establish spatial hierarchy.

Do not turn every UI element into frosted glass. The runtime scene deserves the richer material language; ordinary controls should remain calm and legible.

## Lighting

Lighting should reinforce state. The active execution region receives focus. Inactive structures recede. New allocations can briefly bloom into visibility. References can carry pulses during dereference or assignment.

Avoid permanent neon everywhere. Contrast is what makes important events feel important.

## Motion Grammar

Allocation: assemble / emerge / resolve into stable identity.

Assignment: value transfers or morphs into the target.

Reference creation: connection grows from source to object.

Dereference: pulse travels along the connection.

Method entry: frame expands into a new spatial layer.

Method return: frame contracts and return value transfers upward.

Mutation: existing entity changes in place.

Exception: abrupt semantic break followed by upward propagation.

Timeline scrub: the world rewinds deterministically, not with arbitrary reverse animations.

## Typography

Code should feel native to a serious editor. Runtime labels should be compact, sharp, and readable at varying zoom levels. Large decorative typography should be limited to landing/intro moments, not the runtime itself.

## UI Composition

The default desktop composition should privilege the runtime:

```text
┌──────────────────────────────────────────────────────────────────────┐
│  code/editor        │                 3D runtime world               │
│                     │                                                │
│  source highlights  │     stack architecture      heap world         │
│                     │               ↘ refs ↙                         │
│                     │                                                │
├──────────────────────────────────────────────────────────────────────┤
│ execution timeline / event rail / playback / focus mode             │
└──────────────────────────────────────────────────────────────────────┘
```

The divider should be resizable. The runtime can enter a focus mode where the editor becomes a compact synchronized strip rather than a full pane.
