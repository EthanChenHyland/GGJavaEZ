# Visual Java reference images

These images are design references, not pixel-perfect implementation targets.

## Primary true-3D direction

Use these first. They are the clearest statement of the intended geometry and product feel:

- `06_true3d_person_runtime.png` — preferred overall composition: editor + real 3D stack + real 3D heap + timeline.
- `07_true3d_object_inspector.png` — camera close to a heap object while preserving world context.
- `08_true3d_recursion.png` — call frames extending through the Z axis; recursion should be spatial, not merely stacked cards.
- `09_true3d_array_sort.png` — array elements as physical cuboids that can move in real 3D space.
- `10_true3d_reference_sheet.png` — shared cuboid vocabulary across overview, inspection, recursion, arrays, references, time, and navigation.
- `11_true3d_scene_language.png` — consistent scene language across multiple runtime concepts.

## Earlier spatial planning frames

- `00_REFERENCE_BOARD.png`
- `01_world_overview.png`
- `02_navigation_modes.png`
- `03_semantic_zoom.png`
- `04_person_world_sequence.png`
- `05_theater_continuity.png`

These remain useful for product structure, navigation, semantic zoom, stable identity, and theater continuity, but their flatter diagrammatic look is **not** the final 3D rendering target.

## Non-negotiable interpretation

The runtime data is the architecture.

Primary runtime entities must exist in genuine Three.js / React Three Fiber world coordinates with meaningful X/Y/Z positions. Use extruded rectangular solids/cuboids as the dominant geometry family for stack frames, heap objects, array cells, and related runtime entities.

Do not turn the product into a literal sci-fi city, game level, room, planet system, or decorative environment. Do not fake 3D using CSS perspective or flat cards placed in a scene. A still screenshot from the hero view should make the Z axis, occlusion, depth, and navigability obvious.
