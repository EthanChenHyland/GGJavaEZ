# M7 shared text and projected frame labels

## Scope and method

Read AGENTS.md, all Visual Java spec Markdown and all 12 reference images at original resolution, M1–M6 QA and ADR006/ADR007 before implementation. Changes are limited to owned label/frame primitives, shared font startup support, focused tests and the M7 measurement script/evidence. No App or RuntimeCanvas edits by this worker; no commit. Other M7 changes in the shared checkout belong to concurrent workers/lead.

`node scripts/measure-m7.mjs before` and `after` use three fresh Chrome contexts per phase, Vite dev, balanced rendering, 1440×900, DPR 1. Two contexts seek allocation immediately after the preceding step; one first waits for synchronized stack labels. Each then rewinds/reallocates and mutates age. A fourth bounded context captures five-frame recursion Overview, expanded runtime and selected-frame Focus.

The same two real JVM fixtures are cached in `performance.json`. Initial capture used the accepted M6 recorder at `34111e4` in temporary helpers because debugger instrumentation was being changed concurrently. Subsequent samples replay those fixtures without JVM execution. Baseline browser response overrides disable only preload calls, shared `characters`, and projected label density; source files are never rolled back. Both phases use the same current frontend shell. M6 measurements/scripts are untouched.

`labelsReadyRenderMs` starts before slider input and ends at the first Fiber after-render sample containing the requested heap label, with every mounted Troika text synchronized. It includes automation scheduling. It is not physical display presentation. The older two-rAF metric is also retained: it can finish before async text appears, so it must not be treated as label readiness.

## Cold allocation result

| Sample | Before (ms) | After (ms) |
| --- | ---: | ---: |
| Fresh, immediate allocation 1 | 417.3 | 92.2 |
| Fresh, immediate allocation 2 | 815.0 | 35.8 |
| Fresh, stack synchronized first | 49.4 | 34.0 |
| Warm reallocation range | 24.6–30.4 | 28.4–29.9 |
| Age mutation range | 46.0–50.7 | 40.3–42.9 |

These are bounded descriptive samples, not a p95 claim. The approximately 833 ms M6 observation was a different two-rAF measurement with live capture; its value is preserved in the M6 checkpoint.

### Concrete cause and bounded fix

Drei Text suspends against `['troika-text', font, characters]`. Region labels (`STACK`, `HEAP`) and transient cues omit `characters`; runtime primitives now specify a shared finite alphabet. Preloading only the alphabet key left the font-only key cold. In that intermediate probe, startup preload was already ready before Visualize, but immediate allocation still took 415.0/833.6 ms. Thus warming glyphs alone did not remove the dominant cold delay.

One asynchronous shared promise now initializes Inter and 99 characters (printable ASCII plus `·→—×`), and primes both exact cache keys. Each key awaits the same job. Unknown glyphs remain on demand. The font path, SDF resolution, materials and semantic colors remain unchanged. Startup marks show this finite work completed before Visualize in all three final samples (about 94–132 ms of startup work).

The two-key change removes the measured cold gap. Cache misses entering the scene's Suspense path are the supported cause; the exact split between React reveal scheduling and browser/GPU work was not isolated. Individual measured compile/link/query/texture/readback calls were below 10 ms. Final after samples recorded no long tasks; baseline sample 1 recorded one 53 ms task. This does not prove GPU shader compilation has zero cost.

## Deep-stack semantic zoom

Only existing deep-stack `readable` frames without spacious/scoped layout adopt the policy. Camera projection and the actual canvas viewport determine row cap height; reserved stack bounds do not determine text density.

- Compact: keep method identity, body, boundaries, active/exception markers and physical row hit targets. Suppress tiny row text and metadata.
- Full: restore metadata and row text at their original world sizes. Selection/active execution/selected slot receive earlier detail and stronger identity priority.
- Hysteresis: ordinary rows enter at 13 px and exit below 11 px; priority rows enter at 12 px and exit below 10 px. Sampling uses the existing 0.29-unit primary row font and Inter's approximate 0.73 cap-height ratio.
- Only method identities grow: target 12 px, or 14 px for priority frames, bounded by measured glyph width, available face width and a 0.9-unit maximum font. Very distant frames may remain below the target because the face/world-size limits take precedence. Row fonts never enlarge.
- Policy updates mutate mesh visibility/scale during existing frames and invalidate on density changes; they do not schedule React state updates every frame.

Overview now has readable, consistent method identities without rows of oversized text. Expanded runtime uses the same rule. Focus restores selected active-frame metadata and return detail at native sizes. A neighboring frame can remain compact if its projected rows remain below threshold.

All five captured body world matrices and geometry bounds are exactly equal before/after. Dimensions, anchors, slot positions/backgrounds and selection handlers are unchanged. Tests retain slot callback routing and reserved scope positions.

## Canonical exception cue

`exceptionState` maps to THROW, UNWOUND, CATCH or FINALLY. Shared `colors.exception` accents the body boundary and a small front-face marker; the matching caption appears at readable detail. Existing cyan active cue stays visible. Historical-unwound fallback is retained. No new exception inference, particles or beams.

## Validation and evidence

- `npm run typecheck`: passed after supplying a minimal typed `preloadFont` declaration.
- Owned-file ESLint and `git diff --check`: passed.
- Focused Vitest run: 33 tests in four files, including both preload cache keys sharing one job, camera/viewport projection, hysteresis, bounded identity scaling, all four canonical exception captions, preserved scope geometry and existing recursion navigation.
- Browser runs: zero page errors. Inspected final Person, recursion Overview and Focus captures at original resolution; expanded before/after captures also saved.
- `performance.json`: fixtures, per-sample text timings/readiness, startup marks, long tasks, GL call summaries, visibility/scales and exact geometry.
- `before-*`/`after-*` PNGs: Person, recursion Overview, expanded runtime and Focus.

## Files owned in this change

- `src/scene/primitives/RuntimeLabel.tsx`, `FrameSolid.tsx`, `runtimeText.ts`, `troika-text.d.ts`
- `src/scene/primitives/runtimeText.test.ts`, `FrameSolid.scopes.test.tsx`
- `src/theme/runtimeFont.ts`, `runtimeFont.test.ts`, `tokens.ts`
- `scripts/measure-m7.mjs`
- This report, `performance.json`, and eight before/after screenshots in `docs/checkpoints/debug-v7/`

Owned dev server was restarted after measurement to load debugger routes, then kept stable for final sampling. One Vite process on 5173 and one bridge on 8787; `/api/health` available and `/api/debug/current` HTTP 200. QA agent and lead were notified when the performance window finished. The server remains running for integration QA.
