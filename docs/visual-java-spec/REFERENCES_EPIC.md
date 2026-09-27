# IMPORTANT — LOCAL CONCEPT FRAMES

Before reading the external references below, inspect the local visual targets in `references/`:

- `references/00_REFERENCE_BOARD.png` — persistent-world direction at a glance
- `references/01_world_overview.png` — source / stack / reference / heap geography
- `references/02_navigation_modes.png` — Guided Follow / Free Explore / Focus / Trace / Home
- `references/03_semantic_zoom.png` — macro / meso / micro information scale
- `references/04_person_world_sequence.png` — stable object identity across execution time
- `references/05_theater_continuity.png` — special visualizers unfolding from the same world
- `references/06_true3d_person_runtime.png` — **primary true-3D runtime target**
- `references/07_true3d_object_inspector.png` — object-focused camera and world context
- `references/08_true3d_recursion.png` — recursion extending through genuine depth
- `references/09_true3d_array_sort.png` — physical array cuboids and motion
- `references/10_true3d_reference_sheet.png` — consistent cuboid vocabulary across runtime concepts
- `references/11_true3d_scene_language.png` — consistent 3D scene grammar

These are original Visual Java concept frames. **Treat them as the primary art-direction reference.** The sources below exist to explain the design principles that inspired the direction, not to replace the local frames.

---

# Visual Java — Epic Reference Board

## True 3D — non-negotiable rendering direction

The newer references `06`–`11` supersede the flatter visual treatment of the earlier concept boards when deciding **how the runtime geometry should actually render**.

- The runtime data is the architecture.
- Primary entities are genuine 3D solids, not 2D cards with perspective.
- Stack frames, heap objects, array cells, labels/anchors, and reference endpoints occupy persistent X/Y/Z coordinates.
- Favor a coherent family of extruded rectangular prisms/cuboids with restrained rounding, depth, lighting, occlusion, and shadows.
- References are precise curves/lines between real 3D endpoints, not decorative highways.
- The environment should stay abstract and minimal: near-black space, subtle floor/grid or depth cues, restrained fog, and lighting.
- Avoid literal cities, buildings, bridges, avatars, planets, rooms, or game-world scenery unless a structure directly encodes runtime semantics.
- CSS perspective, 2.5D card stacking, or a flat graph with a free camera does **not** satisfy the requirement.
- At least one hero acceptance screenshot must make the navigable Z axis obvious even as a still image.


This file is not a list of products to copy. It is a translation layer between references and Visual Java. Codex should borrow specific principles from each source while preserving a distinct visual language.

## 1. TRON: Legacy — GMUNK
Source: https://gmunk.com/TRON-Legacy

Use for:
- pure-light interfaces that feel native to a digital world
- holographic surfaces that can be spun, plucked, expanded, and manipulated
- geometric structures that feel alive instead of flat
- motion that makes information feel physical
- strong black-space composition with luminous data

Do not copy:
- TRON branding, exact colors, glyphs, typography, or film-specific motifs
- decorative glowing lines with no semantic role

Visual Java translation:
- references are luminous connective paths
- runtime events propagate visibly through those paths
- stack frames and heap entities should feel like they exist inside the computational world, not like flat cards pasted onto a canvas

## 2. Oblivion UI — GMUNK
Source: https://gmunk.com/OBLIVION-GFX
Reference review: https://ilikeinterfaces.com/2015/04/21/ui-review-oblivion/

Use for:
- dense futuristic information that remains believable and functional
- disciplined grid alignment
- restrained thin-line detail
- consistent graphic language across many kinds of displays
- interface elements that look designed for a real task rather than as sci-fi decoration

Do not copy:
- exact typography, symbols, layouts, or prop screens
- excessive micro-data purely for visual density

Visual Java translation:
- inspectors, timelines, labels, diagnostics, and overlays should be precise and systematic
- cinematic 3D can be dramatic while the supporting UI stays calm and credible

## 3. cybernetic.dev / 3D financial helix
Reference gallery: https://mesh3d.gallery/experiment/cybernetic-dev

Use for:
- information encoded as actual 3D geometry
- dense datasets forming a navigable spatial structure
- moving through data rather than merely looking at a dashboard
- switching between useful spatial representations of the same underlying data

Do not copy:
- stock-market aesthetics
- helixes just because they look cool

Visual Java translation:
- recursion, execution history, object graphs, and data structures can each adopt a spatial form that matches their semantics
- alternate scene modes are allowed when they reveal something genuinely different

## 4. Apple visionOS spatial design
Sources:
- https://developer.apple.com/visionos/
- https://developer.apple.com/design/human-interface-guidelines/spatial-layout/
- https://developer.apple.com/design/human-interface-guidelines/immersive-experiences/

Use for:
- readable depth hierarchy
- occlusion, shadow, distance, and scale as information
- spatial content that remains comfortable and understandable
- calm panels floating around a more immersive central scene
- moments of immersion rather than constant visual overload

Do not copy:
- Apple chrome wholesale
- frosted-glass everything
- passive floating windows as the main experience

Visual Java translation:
- source code and controls should remain visually stable while the runtime world provides depth
- selected objects can come toward the user while unrelated structures recede
- camera choreography should direct attention without disorienting the user

## 5. Blender Geometry Nodes
Sources:
- https://docs.blender.org/manual/en/latest/editors/geometry_node.html
- https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/introduction.html

Use for:
- explicit visual relationships
- graph structures that remain inspectable at high complexity
- strong distinction between entities, ports, connections, and flows
- navigation through large systems

Do not copy:
- node-editor visuals as the default representation for everything
- Blender's exact controls or styling

Visual Java translation:
- heap-object references and object graphs need clear topology
- selecting a reference must make source and destination obvious
- complex graphs need focus/isolation modes, minimaps, and progressive disclosure

## 6. LAUNCH IT — WebGL experience
Reference: https://www.behance.net/gallery/59530933/LAUNCH-IT-WebGL-Experience

Use for:
- making a dataset feel like a world
- strong focal object surrounded by restrained instrumentation
- cinematic camera motion and depth
- interaction that encourages exploration

Do not copy:
- globe metaphor
- decorative data spikes without direct meaning

Visual Java translation:
- heap, stack, and execution timeline should feel explorable at multiple scales
- the camera can move from global runtime overview to one variable/object without breaking continuity

## 7. Bret Victor — Learnable Programming / Inventing on Principle
Sources:
- https://worrydream.com/LearnableProgramming/
- https://worrydream.com/

Use for:
- immediate connection between code and consequence
- seeing execution state instead of mentally simulating it
- seeing flow and state change as directly as possible
- interaction as a thinking tool, not decoration

Do not copy:
- old visual style
- 2D-only presentation limitations

Visual Java translation:
- every meaningful code event should have a visible consequence
- clicking or scrubbing should reveal causality immediately
- users should be able to answer “what just happened?” by looking at the scene

# Combined Art Direction

The target is NOT “TRON + Apple + Blender.” The target is a new coherent language with these properties:

- cinematic like high-end motion graphics
- spatially disciplined like visionOS
- structurally legible like Blender
- computationally immediate like Bret Victor's work
- function-first like Oblivion UI
- visually alive like TRON's digital-world interfaces

# Hard Visual Rules

1. Every glow communicates active state, causality, selection, or connectivity.
2. Every major animation corresponds to a runtime event or navigation action.
3. 3D depth must encode hierarchy, relationship, scale, or time.
4. The supporting UI stays quiet enough that the runtime world dominates.
5. A still frame should already look striking; motion should make it understandable.
6. The world must still be readable when effects are reduced or motion is paused.
7. No meaningless particles, holograms, rings, grids, or noise.
8. Avoid the generic “AI dashboard” look entirely.

# Reference Assignment for Codex

Before implementing a scene, explicitly state which reference principles are being used and why. Example:

- Object allocation: TRON-like pure-light emergence + visionOS depth cues.
- Object inspector: Oblivion information discipline.
- Heap graph navigation: Blender graph readability.
- Timeline interaction: Bret Victor immediacy.
- Global camera transition: LAUNCH IT cinematic spatial navigation.

The result should not visibly imitate any one reference.


## Persistent spatial navigation — FSN-level principle

The user specifically wants the ambition associated with systems like **FSN / 3D filesystem navigators**: abstract structure becomes a **place** with stable spatial relationships that the user can actually travel through. This is a conceptual reference, not a request to reproduce FSN’s visual style.

Borrow the principle, not a literal retro visual style:
- persistent geography;
- navigable hierarchy;
- spatial memory;
- direct travel from one semantic node to another;
- zoom as a change in information scale.

Visual Java should apply that principle to a runtime that is alive and time-varying. The world must still feel coherent while objects are allocated, frames enter/return, values mutate, and the user scrubs history.

The implementation should look contemporary and uniquely Visual Java, not like a nostalgic recreation of an older 3D file browser.
