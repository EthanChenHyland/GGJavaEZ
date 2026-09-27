You are the root/lead agent working in the `GGJavaEZ` repository.

First, read `AGENTS.md`. Then read every file in `docs/visual-java-spec/`, including the reference-image guidance, and inspect every image in `docs/visual-java-spec/references/` at full size.

Do not modify files yet.

Use subagents where independent analysis can improve quality or speed, but keep architecture, shared contracts, visual-system decisions, and final integration under the root agent.

For this planning pass, you may delegate focused analysis such as:

- runtime trace schema + reducer architecture
- persistent 3D spatial-layout + scene architecture
- camera/navigation design
- timeline/playback design
- visual QA/performance risks

Have subagents return concise proposals. Reconcile them into one coherent plan rather than presenting disconnected alternatives.

Produce a concrete implementation plan for the first Visual Java vertical slice:

**Person object creation + method call + stack + heap + references + execution timeline + free 3D navigation.**

The first version should use deterministic mock trace JSON rather than real JVM instrumentation.

Your final plan must define:

- technical stack and dependencies
- directory architecture
- normalized trace-event schema
- runtime-state reducer
- stable runtime IDs
- persistent XYZ spatial-layout system
- R3F/Three.js scene architecture
- stack-frame geometry
- heap-object geometry
- reference rendering
- labels/text strategy
- camera/navigation state machine
- timeline/playback engine
- selection/object-inspection architecture
- shared visual/motion primitives
- which parts should be delegated during implementation
- file/module ownership boundaries that minimize subagent collisions
- integration sequence
- performance strategy
- screenshot/visual QA loop
- risks and mitigations

Before proposing parallel implementation, define the shared contracts that all subagents will build against.

Pay special attention to the newer true-3D references. The target is extruded rectangular runtime geometry in a coherent navigable space, not a sci-fi city and not flat cards with CSS perspective.

You have creative freedom within the design system. If you identify a materially stronger visual or interaction solution than the references, explain it and use it.

Do not implement yet. Give me the reconciled root-agent plan first.
