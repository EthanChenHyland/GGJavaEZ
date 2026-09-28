# Visual Java

Visual Java provides trace-driven Classic and navigable 3D Spatial views of the `Person` and recursive `factorial(5)` Java programs. It uses deterministic mock execution data. The source, timeline, inspector, and runtime representations read one semantic cursor.

## Run

```sh
npm install
npm run dev -- --port 5173
```

Open `http://127.0.0.1:5173/`.

## Explore

- Choose **Person** or **Recursion · factorial(5)** in the Example selector. Switching examples starts its trace from the beginning; switching Classic/Spatial preserves execution and inspection state.
- Recursion exposes six invocation frames, each parameter and evaluated call result, and the return chain **1 → 2 → 6 → 24 → 120**. Playback stops naturally; **Replay** restarts explicitly. Theater remains unavailable because the expanded Spatial stack already explains this fixture.
- Play, pause, step backward or forward, or scrub the timeline.
- Drag inside the runtime to orbit; right-drag to pan; scroll or pinch to dolly.
- Click a frame, object, or reference to inspect it; double-click or use **Focus** to approach it.
- Use **Trace Path** for the live `p` or `this` relationship, **Home** for the stable overview, and **Follow** to toggle guided camera behavior. User camera input cancels guided motion while playback continues.
- **Runtime view** compresses source to its executing line; the source divider can be dragged or resized with arrow keys. Narrow viewports start with this source strip.
- Select an entity from the keyboard-accessible inspection menu. Choose **Low effects** for reduced rendering cost.
- Space toggles playback, Left/Right arrows step, and H returns Home when the source editor or a form control does not own keyboard focus.

## Validate

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

`npm run capture:visual` saves the reference checkpoints in `docs/checkpoints/person-v1/` while the dev server is running. The browser checks use installed Google Chrome.

`node scripts/capture-recursion.mjs` captures the recursion comparison matrix and Person regressions. Final review and performance evidence: [Recursion QA](docs/checkpoints/recursion-v2/QA.md).

## Architecture

`src/demos/` contains curated Java source and versioned traces. `src/runtime/` validates and reduces all traces through one semantic pipeline, including typed direct-caller returns. `src/world/` reserves stable XYZ anchors and builds a renderer-independent scene model. `src/classic/` projects that model into conventional stack/heap diagrams; `src/scene/` draws actual cuboid geometry and reference/return curves. `src/navigation/` owns camera behavior; `src/playback/` owns the event cursor. The spec and reference images live in `docs/visual-java-spec/`.
