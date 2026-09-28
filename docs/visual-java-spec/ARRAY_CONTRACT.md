# Milestone 3 — Array and algorithm contract

The existing trace → reducer → layout → SceneModel → representations pipeline remains canonical. No separate algorithm engine.

## Runtime truth

- RuntimeObject.array optionally holds int element type, fixed length, and ordered RuntimeSlot elements. Class/type is int[]. `arrayElementSlotId(objectId, index)` identifies the indexed location, never the value. Object fields stay separate.
- ALLOCATE_ARRAY receives explicit initialized values, stable object/display ID. ARRAY_READ verifies the observed value at a valid index and optionally places it in an already-declared destination local. ARRAY_COMPARE verifies both indexed values and the supplied `>` result. ARRAY_WRITE verifies a concrete int and its element/local origin, updates exactly one indexed slot, and appends a causal mutation record. Swaps remain the two actual Java assignments with a temp local; intermediate duplicate values are truthful and inspectable.
- REMOVE_LOCAL removes a live scoped local. The fixture reuses stable lexical variable slots on later loop/swap scope entry. Layout prepass deduplicates these IDs and reserves their rows once.
- RuntimeState.arrayActivity and arrayMutations contain event facts, not motion. Changes reconstruct through the existing checkpoints/seek implementation. No atomic fake swap or inferred execution from source.

## Shared scene and selection

- SceneObjectNode.array contains equal SceneArrayCell subdivisions with index, stable slot ID, value, and WorldAnchor. Slot selection uses the existing `{kind:'slot',id}` model; the array uses `{kind:'object',id}`. All views consume the same values, activity, references, locals, and identities.
- LayoutState reserves regular anchors and a theater anchor map. Both share the originating heap center. Stable cells are rectangular volumes; values change in place. Theater opens spacing and face area around that center, preserves order/identity, and exposes causal write paths and comparisons. It does not reorder cells by numeric value.
- SceneModel.presentation selects spatial/theater anchors only; layoutKind identifies reserved array world framing. Classic ignores 3D staging and projects the same indexed entities into conventional equal cells.
- Navigation interprets an explicit representation intent. Theater entry can fit its stage and remember the Spatial pose; return restores it. User input invalidates that move. Camera logic stays centralized. The same Canvas handles both 3D representations so controls, materials, lighting, and renderer resources are shared.

## Visual convergence

Reuse the shared stack/heap SolidBody, fonts, materials, semantic colors, lighting, timing, quality tiers, and rectangular vocabulary. Indices are fixed; comparison uses execution accents, writes use mutation accents, verified ascending order may use success accents. No variable-height bars, decorative structures, particles, or permanent bloom.

Lead owns these contracts, all layout/scene projection, application integration, and final QA. Parallel ownership: runtime/fixture; Classic projection/renderer; new ArraySolid primitive; navigation/controller. Changes to these contracts must be reconciled by the lead.

## Implemented world dimensions

Both presentations keep the array origin at `[3.45, -0.05, -0.65]`. Indexed cell centers remain at `Y=-0.30`, with X determined only by index. Spatial cells are `1.12 × 1.15 × 1.15` at 1.28 spacing; Theater cells are `1.50 × 1.45 × 1.35` at 2.05 spacing. The main frame is reserved at `[-4.90, -0.25, 1.10]`, with a permanent row for each lexical slot. These dimensions and the identity header dimensions are centralized in `worldUnits`.

The parent array anchor is a framing/identity envelope. Camera collision uses actual indexed cuboids and the extruded identity header rather than colliding with empty envelope space. Focus reserves the visible comparison caption and compared cells above the inspector. Theater remembers/restores the previous Spatial camera pose; its expansion changes presentation anchors without changing semantic state.

Guidance controls comparison/write emphasis and causal overlays. Committed values, indices, object identity, selection, and inspection remain available with guidance or motion disabled. Static write captions and arrow paths explain the Java assignments; traveling values are a bounded secondary overlay during playback.
