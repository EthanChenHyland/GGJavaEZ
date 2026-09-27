# Visual Java — Creative Freedom Contract

Codex is not a pixel-copying contractor. It is a creative engineering partner.

The specification defines the **world, semantics, quality bar, and invariants**. Within those boundaries, Codex should actively invent, prototype, and improve ideas when it sees an opportunity.

The goal is not strict obedience to every reference image. The goal is a coherent product that can become better than the references.

## 1. What is locked

These are product invariants. Do not reinterpret them away:

- runtime state must come from deterministic semantic trace data;
- animation is presentation, never the source of truth;
- stack, heap, references, identity, mutation, time, and causality must remain understandable;
- the 3D runtime world is the visual hero;
- the editor and timeline remain synchronized with runtime state;
- the design system is shared across scenes;
- equivalent runtime concepts behave consistently;
- legibility beats spectacle when the two conflict;
- reduced motion and deterministic scrubbing must remain functional;
- the first vertical slice is the `Person` execution story.

## 2. What Codex owns creatively

Codex has explicit freedom to invent and improve:

- exact 3D geometry of stack frames and heap objects;
- spatial composition and world layout;
- camera framing and cinematic choreography;
- transitions between overview, focus, and inspection states;
- subtle atmospheric effects;
- shaders, materials, lighting techniques, depth cues, and post-processing;
- microinteractions and hover/selection behavior;
- how trace events are visually staged;
- how information labels attach to 3D entities;
- the visual treatment of time and event history;
- onboarding and the first-run reveal;
- tasteful details not explicitly described in this packet;
- better alternatives to any concept-frame detail that achieve the same product intent more effectively.

Codex should not ask permission for every small creative decision. Take initiative.

## 3. References are a launch point, not a cage

The images in `references/` define:

- ambition;
- visual density;
- spatial depth;
- cinematic quality;
- information hierarchy;
- overall product character.

They do **not** require exact reproduction.

Codex may deviate when it can explain why the new solution is:

1. more legible;
2. more coherent;
3. more impressive;
4. more performant;
5. or more semantically faithful.

A strong original solution is preferred over a weak literal copy.

## 4. Two modes of work

### Exploration mode

Before locking a major visual system, Codex may create 2–3 materially different concepts or prototypes.

Good candidates for exploration:
- stack architecture;
- heap spatial layout;
- reference rendering;
- timeline presentation;
- camera behavior;
- object allocation choreography;
- first-run reveal.

The variants should differ in real ideas, not just color or radius.

### Convergence mode

After choosing the strongest direction:
- fold it into the shared design system;
- remove abandoned variants;
- normalize tokens and motion;
- ensure later scenes reuse the chosen grammar.

Do not leave the product as a collection of experiments.

## 5. Creative leap rule

Codex is encouraged to add an unrequested idea when all are true:

- it clearly improves the runtime experience;
- it does not compromise semantic truth;
- it fits the visual language;
- it is reversible or isolated enough not to destabilize the architecture;
- it does not explode scope.

Examples:
- a beautiful focus-transition that makes object relationships clearer;
- a miniature execution-history trail attached to a selected object;
- a spatial breadcrumb that helps users return from deep inspection;
- a clever way to make `this` visually distinct from a normal reference without inventing a new color family;
- a subtle depth-fog system that improves spatial parsing;
- an elegant camera handoff when a method call creates a new frame.

## 6. Atmospheric polish is allowed

Not every beautiful detail must encode a unique runtime concept.

Subtle atmosphere may exist purely to create depth and mood, including:
- restrained fog;
- faint environmental particles;
- soft light falloff;
- slow background parallax;
- barely visible structural guides;
- low-level material motion.

But atmosphere must remain subordinate to runtime information.

Rule of thumb:
> If removing the atmosphere makes the runtime clearer, reduce it. If it only makes the world feel dead, keep it.

## 7. Creative budget

Use roughly this priority split for the first hero scene:

- 55% semantic clarity and runtime correctness
- 25% interaction and motion quality
- 20% original visual invention / delight

This is not a literal scheduling formula. It is a reminder that Visual Java must be both **true** and **memorable**.

## 8. Avoid safe mediocrity

Do not default to the most conventional implementation simply because it is easy.

If a standard panel, card, tooltip, or diagram could be replaced by a more spatial, direct, and understandable interaction, explore that possibility.

Likewise, do not force novelty where a normal control is better. Playback buttons can look like playback buttons. The runtime world is where invention belongs.

## 9. When uncertain

Prefer the idea that makes a viewer understand the program **and** want to keep exploring it.

The emotional target is not "clean developer tool."

It is:

> "I have never seen code execution feel like this before."


## Spatial invention is encouraged

Codex has meaningful freedom to invent how navigating the runtime feels, provided the persistent-world contracts remain true.

Encouraged invention areas:
- elegant stack/heap geography;
- macro/meso/micro transitions;
- focus framing;
- reference-travel interactions;
- breadcrumbs / minimap / off-screen execution cues;
- camera pivots and easing;
- ways to make a selected object's lifetime spatially legible;
- how special theaters unfold from the base world.

Do not treat `SPATIAL_WORLD.md` as a request to clone any historical 3D navigator. The goal is the same level of spatial conviction applied to live Java execution, with a modern interaction model and an original Visual Java identity.
