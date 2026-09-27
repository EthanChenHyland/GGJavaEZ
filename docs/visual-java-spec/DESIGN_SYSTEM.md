# Visual Java — Design System

This file is the implementation contract for visual consistency. Do not invent styling scene-by-scene. Every screen, overlay, runtime object, connection, label, and animation should feel like it belongs to the same instrument.

## 1. Design principle

Visual Java is a **precision runtime instrument inside a cinematic spatial world**.

The product should feel premium because it is controlled, not because every surface glows. The 3D scene carries spectacle. The 2D shell carries clarity.

Three visual layers must remain distinct:

1. **Shell UI** — calm, sharp, low-noise controls and editor chrome.
2. **Semantic runtime geometry** — stack, heap, references, values, data structures.
3. **Transient event emphasis** — pulses, blooms, trails, focus shifts, exception states.

Do not collapse these layers into one neon visual language.

## 2. Color tokens

Use centralized tokens. Do not scatter raw colors through components or shaders.

```ts
export const colors = {
  canvas: '#06080D',
  canvasRaised: '#090D14',
  panel: '#0B1018',
  panelRaised: '#111824',
  panelHover: '#151E2B',
  border: '#223044',
  borderStrong: '#354A64',

  text: '#F3F6FA',
  textSecondary: '#A7B1BF',
  textMuted: '#6F7B8B',

  execution: '#63E6FF',
  stack: '#6F8CFF',
  heap: '#B77CFF',
  mutation: '#FFC857',
  success: '#70E0B2',
  exception: '#FF5D6C',
  null: '#7A8492',
};
```

### Semantic rules

- `execution` = active instruction / current causal pulse.
- `stack` = stack identity, not every stack surface.
- `heap` = object identity, not every heap surface.
- `mutation` = a value that is currently changing.
- `exception` = actual error state only.
- `null` = absence / disconnected reference.
- inactive entities use neutral materials with semantic colors reduced to edge/detail accents.

Never use semantic colors as arbitrary decoration.

## 3. Surface hierarchy

### Shell
- Page/canvas background: nearly black, cool neutral.
- Panels: only one step lighter than the canvas.
- Panel boundaries: thin border + spacing before shadow.
- Avoid stacking translucent cards inside translucent cards.

### Runtime entities

Runtime entities should read as physical objects with three parts:
- stable body/material;
- semantic edge/accent;
- readable information face.

Avoid fully transparent hologram cards. Transparency should reveal depth, not destroy legibility.

### Glass
Glass is reserved for:
- inspector overlays;
- timeline floating controls;
- selected/focused object detail plates.

Do not use glass as the default surface for everything.

## 4. Typography

Recommended UI stack:

```css
font-family: Inter, Geist, ui-sans-serif, system-ui, sans-serif;
```

Code:

```css
font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
```

Hierarchy:
- Runtime micro-label: 11–12px, medium.
- Secondary UI: 12–13px.
- Primary UI: 14px.
- Inspector values: 14–16px mono where appropriate.
- Scene section labels: 12px uppercase/tracked, used sparingly.
- Large display type belongs only to entry/landing moments.

Never make runtime labels tiny merely because the scene is 3D. At default camera distance, important values must remain readable.

## 5. Shape language

Use a restrained geometry vocabulary:

- Shell corners: 8px.
- Small controls: 6px.
- Runtime object body: subtly rounded rectangular solids, not bubbly cards.
- Stack frames: architectural trays/slabs with crisp edges and inset information surfaces.
- Heap entities: compact volumes with stronger depth and identity than stack frames.
- Timeline nodes: circles or short ticks, consistent across all demos.

Do not randomly mix pills, capsules, hexagons, circles, bevels, and sci-fi polygons.

## 6. Spacing

Use an 8px base grid for shell UI.

```text
4  = micro
8  = tight
12 = compact
16 = standard
24 = section
32 = major
48 = scene breathing room
```

Scene layout uses a normalized world-space grid; see SCENE_CONSISTENCY.md.

## 7. Borders and lines

- UI borders: 1px.
- Selected UI element: border + subtle inner emphasis, not giant glow.
- Runtime reference line: 1.5–2.5 screen-space px at default view.
- Structural guides: thinner and lower contrast than references.
- Active causal pulse may temporarily thicken a reference, then return to baseline.

## 8. Light and bloom

The scene should be dark enough that focus lighting matters.

Bloom rules:
- only active execution, selection, allocation birth, mutation, and exceptions may bloom strongly;
- idle objects should not bloom;
- the whole scene must remain legible with bloom disabled;
- avoid white clipping and giant halos.

## 9. Iconography

Use one icon family throughout the shell. Prefer simple outline icons.

Icons indicate actions, not decoration. Never invent separate icon styles per demo.

## 10. Interaction states

Every interactive element has the same state progression:

```text
rest -> hover -> selected/focused -> active event -> rest
```

3D entities must show selection persistently after click. Hover is temporary and never the only source of information.

## 11. Quality bar

A screen fails the design system if:
- it looks like a generic admin dashboard;
- multiple unrelated neon colors compete for attention;
- labels become unreadable at the default camera;
- every object glows equally;
- a scene introduces a new shape/material grammar for no semantic reason;
- shell UI becomes more visually dominant than the runtime world;
- different demos look like different products.
