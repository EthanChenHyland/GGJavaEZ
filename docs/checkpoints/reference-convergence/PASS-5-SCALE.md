# Pass 5 · Responsive composition and information scaling

Pass 5 starts from published `d6b1035`. The same runtime remains explorable after completion and across all five benchmark viewports. The changes affect presentation, camera framing and the shell. Java still runs on the local JVM without a sandbox. The normalized trace, runtime state, execution graph, Console bytes and canonical spatial anchors remain authoritative.

## Dense presentation and camera

- Dense presentation begins at 54 semantic bodies. Home uses a repeatable cut during travel and at rest. It frames the invocation context, a selected/current subject or its recorded Heap relationship, relevant static and I/O context, and nearby representatives that fit at the working scale. Manual orbit, pan and dolly resume the local cut immediately. The local cut updates by zoom band, cursor and coarse camera tile.
- The overview groups retired invocations around the retained entry. MEDIUM favors relationship and group silhouettes. CLOSE keeps full fields on selected, current and directly related bodies, using MEDIUM detail for optional bodies that compete with local inspection. The dense CLOSE nominal caps are 8 frames, 16 Heap bodies and 4 static bodies, with 4 quiet bodies. Exact mandatory evidence can exceed a nominal cap.
- Focus carries ordered causal context and one ordinary binding in a dense world. The selected volume keeps its three-quarter fit. At the same viewing distance the camera can use a bounded horizontal shift to include the directly related body. Remaining members stay in their clusters and recorded Inspector lists.
- Cluster membership still partitions the recorded IDs with the individual cut. A displayed count is the exact residual count. The type or branch caption can scale up to six times its nominal world-text size for a 13 CSS px minimum. The proxy retains its canonical geometry, travel target and connector anchors. Dense cuts allow at most 10 group captions on wide displays or 7 on compact displays. Selected/current/forensic titles get a bounded fallback when normal face ink is too small. Local collision checks prefer required titles and keep captions anchored to their associated bodies.
- Relevant gives current and selected routes more weight. Current isolates changes at the cursor. All includes past bindings where their presentation geometry is available. Dense bundle limits apply per topology class and preserve the selected bundle. The Inspector accounts for records outside the cut, including those leaving scope and those exceeding budget. A missing source slot or target stays unavailable.
- Active forensic phases keep their actual exception ID, throw frame, unwind frames and handler, with cause and stack evidence where observed. Dense forensic Home uses the recorded path and exception panel as its framing priority. The ordinary Heap admission yields to that path.

## Arrays, collections and I/O

Long arrays have separate FAR/MEDIUM/CLOSE cell budgets of 2/8/24 on desktop and 2/6/16 on compact displays. Mandatory selected, focused, read/write and requested cells can exceed those bounds. Each window maps the same semantic index and slot to its actual presented location, which picking, connector routing and Focus share. A virtualized backing plate spans the displayed rows from its original top. The array retains its recorded length, shows its displayed and hidden cell counts when legible, and exposes captured or unavailable values for exact indices in the Inspector. Long numeric indices fit their existing chip width, including the read/write marker.

Collections display observed size and distinguish captured members hidden from the face from members unrecorded at the cursor. The virtualized Inspector supports the concrete recorded type, List, Set, Map, Queue or Deque semantics, and capture states `OBSERVED`, `TRUNCATED`, `PARTIALLY OBSERVED` and `UNAVAILABLE`. Map keys and values can be inspected independently. Captured members remain selectable after the spatial preview limit.

The same three I/O ports show channel identity, a count and a bounded recent excerpt. The preview preserves character boundaries and visibly elides text as needed. The stdout ink still publishes as a single glyph member with its count. Stdin consumption comes from recorded evidence and typed input stays in the existing Console workflow. Stdout and stderr preserve distinct identity and their own activity order. The Console retains the authoritative terminal text and exact per-row inspection.

## Responsive shell

At 760×900 the Inspector uses a 168 px scrollable sheet with an 8 px gap above the existing transport. It retains the same footprint when selection enters Focus. The original play, step, scrub, Return to Live and semantic caption remain available. Full source is recoverable through the existing rail and Monaco editor. With the sheet open, the source drawer ends above it. The existing Console dock retains foreground priority while preserving timeline access. At 1440×650 the Inspector ends 8 px above the Time Dock. The command rectangle uses the actual sheet boundary when fitting a narrow Home or Focus.

## Native evidence

The captures use instrumented Java on the local JDK 26, Chrome at DPR 1 and the existing IDE controls. The large-scale driver uses reduced motion. PNG and JSON pairs log the session, cursor, selected IDs, projection and recorded facts. Paired comparisons show Pass 4 at left and Pass 5 at right.

| State | Comparison | Pass 5 captures |
| --- | --- | --- |
| Person at the age write | [Narrow Focus](../../../test-results/reference-pass5/comparisons/person-focus-760x900.png) | [Home](../../../test-results/reference-pass5/native-root/person-home-1440x900.png) · [Desktop Focus](../../../test-results/reference-pass5/native-root/person-focus.png) · [Narrow Focus and timeline](../../../test-results/reference-pass5/native-root/person-focus-760x900.png) |
| Short execution | [Short Home](../../../test-results/reference-pass5/comparisons/person-home-1440x650.png) | [1440×650 write](../../../test-results/reference-pass5/native-root/person-home-1440x650.png) · [Short Inspector and Source](../../../test-results/reference-pass5/shell-evidence/focus-source-layout-1440x650.png) |
| Series | [Deep invocation](../../../test-results/reference-pass5/comparisons/series-deepest-follow.png) | [Deepest Follow](../../../test-results/reference-pass5/native-root/series-deepest-follow.png) · [Proved return](../../../test-results/reference-pass5/native-root/series-proven-return.png) |
| Inventory and five-cell array | [Array write](../../../test-results/reference-pass5/comparisons/array-write.png) | [Inventory write](../../../test-results/reference-pass5/native-root/inventory-domain-write.png) · [Sorting-loop write](../../../test-results/reference-pass5/native-root/array-write.png) |
| Dense and completed | [Home](../../../test-results/reference-pass5/comparisons/dense-home.png) · [FAR](../../../test-results/reference-pass5/comparisons/dense-far.png) · [MEDIUM](../../../test-results/reference-pass5/comparisons/dense-medium.png) · [CLOSE](../../../test-results/reference-pass5/comparisons/dense-close.png) | [Dense Home after completion](../../../test-results/reference-pass5/native-root/dense-home.png) · [FAR](../../../test-results/reference-pass5/native-root/dense-far.png) · [MEDIUM](../../../test-results/reference-pass5/native-root/dense-medium.png) · [CLOSE](../../../test-results/reference-pass5/native-root/dense-close.png) · [Collection Focus at 760×900](../../../test-results/reference-pass5/native-root/dense-focus-760x900.png) |
| Large array | First scale sample | [Index 99,991 write](../../../test-results/reference-pass5/native-scale/1440x900/large-array-write.png) · [Restored value](../../../test-results/reference-pass5/native-scale/1440x900/large-array-reverse.png) · [Proved read consumer](../../../test-results/reference-pass5/native-scale/1440x900/large-array-read-proved-consumer.json) |
| Large collections | First scale sample | [List](../../../test-results/reference-pass5/native-scale/1440x900/large-collection-list.png) · [Set](../../../test-results/reference-pass5/native-scale/1440x900/large-collection-set.png) · [Map Inspector](../../../test-results/reference-pass5/native-scale/1440x900/large-collection-map-inspector.png) · [Deque](../../../test-results/reference-pass5/native-scale/1440x900/large-collection-deque.png) |
| Dense exception | First dense forensic sample | [Caught branch](../../../test-results/reference-pass5/native-scale/1440x900/dense-exception-caught-catch-3688.png) · [Uncaught Relevant](../../../test-results/reference-pass5/native-scale/1440x900/dense-exception-terminal-relevant.png) · [Exact Error Explorer](../../../test-results/reference-pass5/native-scale/1440x900/dense-exception-error-explorer.png) |
| Large I/O | [Ordinary stdout](../../../test-results/reference-pass5/comparisons/io-stdout.png) | [Three spatial channels](../../../test-results/reference-pass5/native-scale/1440x900/large-io-ports.png) · [Waiting for stdin](../../../test-results/reference-pass5/native-scale/760x900/large-io-waiting.png) · [Exact Console proof](../../../test-results/reference-pass5/native-scale/1440x900/large-io-console.json) |

The real large-array program used 100,003 logical cells. Index 99,991 stayed selected while the write changed `17` to `29`, reverse seek restored `17`, and the later read routed to the recorded consumer. Each of the four collection types reported 64 members and 32 captured entries. The Inspector opened a captured Map key `15` and value `55` beyond the spatial face. The I/O program preserved 12 stdout and 8 stderr rows separately. The Console kept the submitted `  007  \n`, while the recorded Scanner consumption was `007`.

## Responsive acceptance

Verdicts reflect runtime prominence, active entity and current value legibility, Source/Inspector/transport/Console access, Focus, semantic zoom and accidental clipping. Manual navigation is judged at the chosen pose, and the intended subject is judged separately from peripheral context.

| Viewport | Verdict | Observed behavior |
| --- | --- | --- |
| 1728×1117 | GOOD | Full Source remains beside the active World. Home and Focus have separation and readable primary values. Dock panels stay on the same command surface. |
| 1440×900 | GOOD | Dense Home has a readable invocation and collection, with local inspection and normal access to transport and Console. The farthest references still extend beyond the current view. |
| 1280×800 | GOOD | Person Home and Focus preserve the primary subject with Source and Inspector beside it. The reduced horizontal area gives nearby context less space. |
| 760×900 | ACCEPTABLE | Focus, current value, sheet and timeline coexist. Source rail and Console remain reachable. Wide arrays and distant optional neighbors regularly extend beyond the narrow World. |
| 1440×650 | ACCEPTABLE | Short Home and recursive Follow preserve the useful content. Focus and Inspector clear the dock. Less vertical separation remains above playback and below the header. |

See [five-size Person captures](../../../test-results/reference-pass5/native-root/) and [narrow Source disclosure](../../../test-results/reference-pass5/shell-evidence/focus-source-layout-open-760x900.png). The per-state rescore uses the inherited 0–5 dimensions. [Pass 5 visual scorecard](VISUAL-SCORECARD.md#pass-5-rescore)

## Dense accounting

The completed Dense fixture records 150 semantic bodies. The individual column includes detailed and quiet bodies. Clusters count their residual members. A mandatory viewport clip means a pinned body's bounds cross any viewport edge or lie entirely outside it. The separate partial-projection count includes visible bodies, proxies and array parts crossing an edge. Measured labels include readable instrumented face glyph members and visible structural labels. Label and connector counts are per capture.

| State | Recorded | Individual | Clustered | Mandatory | Mandatory clipped | Partial projections | Labels | Curves / bundles |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Home 1440×900 | 150 | 6 | 144 | 2 | 0 | 1 | 38 | 5 / 8 |
| FAR 1440×900 | 150 | 7 | 143 | 0 | 0 | 0 | 6 | 0 / 10 |
| MEDIUM 1440×900 | 150 | 19 | 131 | 0 | 0 | 4 | 6 | 13 / 16 |
| CLOSE 1440×900 | 150 | 25 | 125 | 0 | 0 | 7 | 63 | 20 / 18 |
| Collection Focus 1440×900 | 150 | 21 | 129 | 2 | 0 | 7 | 68 | 7 / 18 |
| Home 760×900 | 150 | 6 | 144 | 2 | 0 | 2 | 44 | 5 / 8 |
| FAR 760×900 | 150 | 4 | 146 | 1 | 0 | 0 | 5 | 0 / 7 |
| MEDIUM 760×900 | 150 | 19 | 131 | 1 | 0 | 3 | 5 | 14 / 16 |
| CLOSE 760×900 | 150 | 25 | 125 | 1 | 0 | 6 | 80 | 19 / 18 |
| Collection Focus 760×900 | 150 | 21 | 129 | 2 | 0 | 11 | 65 | 7 / 18 |
| Terminal dense exception 1440×900 | 205 | 8 | 197 | 4 | 0 | — | See forensic JSON | 8 / 4 |

All mandatory bodies were admitted in these cuts. The desktop navigation samples at the completed cursor have no active frame or selection unless shown in the Focus or Home row. The narrow sequence kept one selected identity across zoom. In the indexed-array Focus capture, the selected cell and its exact caption fit while the larger tray and distant pinned bodies extend beyond the view.

At completed Dense Home, explicit Relevant, Current and All drew 4/8, 0/0 and 5/8 curves/bundles respectively. Current has no applied relationship at that completed cursor. At the terminal dense exception the same scopes drew 8/4, 0/0 and 9/5. The real throw and unwind prefixes retain their current phase and separately proved endpoints. [Dense scope captures](../../../test-results/reference-pass5/native-root/) · [Forensic scope and authority](../../../test-results/reference-pass5/native-scale/1440x900/dense-exception-terminal-relevant.json)

## Practical render cost

These are settled Interactive renderer counters on the same development machine and Dense fixture. Semantic band captures can land at different camera distances as a result of the Home cut. Partial projection counts compare the visible edge intersections shown in the captured poses.

| State | Draw calls, Pass 4 → 5 | Triangles, Pass 4 → 5 | Partial projections, Pass 4 → 5 |
| --- | ---: | ---: | ---: |
| Dense Home | 59 → 62 | 302,582 → 57,896 | 17 → 1 |
| Dense FAR | 56 → 68 | 39,254 → 35,810 | 0 → 0 |
| Dense MEDIUM, forward zoom | 62 → 74 | 190,544 → 107,234 | 0 → 4 |
| Dense CLOSE, forward zoom | 59 → 68 | 302,582 → 160,172 | 19 → 7 |

The new caption surfaces add a bounded number of small draws. The geometry cut is substantially smaller at Home and CLOSE. The Pass 4 19→7 MEDIUM result came from a separate Home-to-MEDIUM comparison and remains recorded in the Pass 4 checkpoint. These are individual renderer samples. Formal budgets, memory, soak and cross-environment acceptance belong to Pass 6.

## Qualification

- Application and reference typechecks, ESLint, `git diff --check` and the production build passed. Vite emitted its existing chunk-size advisory. [Build output](../../../test-results/reference-pass5/build.log)
- The serial source, golden and reference suites passed 1,988 tests with seven skips. The command excluded local QA copies and capture directories. [Serial test log](../../../test-results/reference-pass5/final-unit-serial.log)
- Twenty-eight selected real-JVM reference cases passed across the five sizes. They cover Hero, object inspection, Series Follow, return provenance, the small array write, I/O, exceptions, all three zoom bands and free navigation. [Reference matrix](../../../test-results/reference-pass5/reference-matrix.log)
- Twenty targeted browser cases passed across the main and focused retests. They cover Source and the Inspector at narrow and short sizes, one timeline with stepping/scrubbing/Return to Live, demand rendering, fallback and context restore, native Focus orbit, directed bundles, collection picking and exact Console/port behavior. After the collection typography retake, the smallest measured label dimension was 13.4 CSS px at 1440×900 and 12.5 CSS px at 760×900. [Browser cases](../../../test-results/reference-pass5/browser-regression.log) · [Browser retests](../../../test-results/reference-pass5/browser-retest.log) · [Final collection retest](../../../test-results/reference-pass5/collection-final.log) · [Glyph measurements](../../../test-results/reference-pass5/collection-glyphs/)
- Six deterministic real-JVM motion regressions passed. They cover Person playback, scrub, camera takeover and restoration, the array write, the recorded return, throw/unwind/catch, and separate consumed input and output. [Motion run](../../../test-results/reference-pass5/motion-regression.log) · [Frames and cursor evidence](../../../test-results/reference-pass5/native-motion/)
- The large array, four collections, dense forensic path and large I/O each passed at desktop and narrow. The local native driver is retained alongside the prior interaction driver for comparable runs. [1440×900 scale run](../../../test-results/reference-pass5/native-scale-final-1440x900.log) · [760×900 scale run](../../../test-results/reference-pass5/native-scale-final-760x900.log) · [Local scale driver](../../../.ggjavaez/qa/reference-convergence-checkout/e2e/reference/local-pass5-scale.spec.ts)

## Remaining issues and the next checkpoint

Dense forensic routes can still cross most of the view when the throw and unwind endpoints are physically distant. Their canonical endpoints and the explanation remain available. Manual CLOSE and indexed Focus can still cut across optional contours and connectors. Some FAR bodies remain very small under their readable captions. The narrow and short layouts retain visible compromises in situational depth and neighboring context, which is why both are rated ACCEPTABLE.

Pass 6 should reuse the native Dense, large array, large collection, dense exception and large I/O workloads. Start with phase-specific attribution for planning, routing, text and rendering, then apply the fixed performance gates and repeated lifecycle memory and soak checks. Pass 5 preserves the local execution boundary and keeps the viewport decisions in shell, camera and presentation code.
