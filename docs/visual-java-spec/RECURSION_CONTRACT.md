# Milestone 2 — Shared call and return contract

Extends the existing trace/reducer/scene pipeline. Person schema-v1 events remain compatible.

- Optional ENTER_METHOD invocationLabel identifies arguments (factorial(5)); optional returnType reserves an explicit evaluation result subdivision in the same frame.
- RuntimeSlot.role distinguishes parameters, Java locals, and VM expression operands. An operand labeled `child` is the evaluated recursive-call result, not a Java source variable.
- RETURN_VALUE requires the top active frame, a defined return type, a concrete compatible scalar, and either its direct caller's already-declared destination slot or null when there is no caller. It stores frame.returnValue and an immutable causal ReturnTransfer; it does not pop the frame.
- EXIT_METHOD removes the frame. Non-void calls must have returned first. Existing void Person exits need no value.
- After RETURN_VALUE, the callee cannot execute, assign, or enter another call before EXIT_METHOD. This prevents an impossible continuation after a Java return.
- RuntimeState.returns retains semantic transfer history for scrubbing, returned-frame inspection, and final result summaries. It contains no animation progress.
- SceneModel.returnFlow is the latest semantic transfer with persistent endpoint anchors and labels. Both representations consume it; guidance controls motion, not the value truth.
- SceneModel.stackDepth/bounds are reserved from the entire trace, not live entity counts. Home composition and Classic frame bands therefore stay fixed as calls appear/disappear.
- The bounds include padded corners of occupied cuboids. Camera fitting uses these points rather than empty corners of the enclosing box. At depth d, the recursive fixture reserves `[-4.7 + 0.9d, 2.2(maxDepth - d) - 0.3, -3 + 1.1d]`. Bodies retain the shared frame proportions and materials. Deeper calls descend toward the camera; parent positions never shift.
- Return subdivisions use stable `return:<frameId>` scene-slot IDs backed by frame.returnValue, not invented Java locals. Pending evaluation is explicit. Returned invocation records remain inspectable without leaving live geometry in the world.
- Recursion extends the shared rectangular frame/material vocabulary. All view modes preserve the same selection, cursor, source, playback, invocation IDs, and values. No recursion-specific execution engine.

The lead owns shared contracts, spatial layout, integration, and final visual decisions. A compressed shaft-like depth arrangement obscured labels during visual review. The expanded, separated Spatial arrangement plus invocation Focus and contextual Follow explain both descent and return without another representation. Theater remains unavailable for this fixture; no alternate runtime or misleading inactive mode was introduced.
