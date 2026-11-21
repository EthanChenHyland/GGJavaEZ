# Reference Convergence Pass 2

The working baseline is Pass 1 at `6192d9273e37bc78e559c4d3595619e841e15752`. The earlier audit's 37/100 remains the historical full-suite result. [Pass 1 composition](PASS-1-COMPOSITION.md) · [Visual scorecard](VISUAL-SCORECARD.md)

## Connectors and Trace

- The planner uses the applied event, actual storage owners and graph endpoints to distinguish current, direct, contextual and background relationships. A binding from the active invocation to a current write's object is promoted. A proved value transfer can carry its own marker and arrow when both semantic ports are present. Related calls and older bindings use quieter weight.
- Thin 1.25 px context cores share a batch. Current and selected relationships use the existing 2.5 and 3.5 px core bands. The shared hover halo still finds recorded edges, with visible halo reserved for current and selected paths. Unrelated Focus routes fade further. Selecting, hovering or inspecting still resolves real edge IDs.
- Trace starts on Relevant. Current shows graph evidence for the applied event, including a return or consumed input whose exact value reaches that write. Relevant retains current and direct context. All includes broader admitted relations and eligible historical bindings. The presentation accounts separately for unavailable, excluded, bundled and individual evidence. The runtime graph and Inspector still expose the underlying records.
- Curves depart from and arrive at the actual port side. Right-side arrivals use the matching tangent, followed by existing face-clear corridor routing if the short curve crosses represented geometry. Port coordinates, picking identities and array-cell attachments remain stable. Dense layouts can still produce long exterior detours.
- Captions are limited to a proved current or selected return, selected bundles, and up to three substantial reference groups at FAR. The active return caption uses larger ink and the RETURNS orientation text has lower contrast. On exception scenes, the latest drawable transition in the current forensic path has priority over earlier evidence.

## Faces, Source and time

- Frame headers lead with the method name followed by lighter captured parameter types where they fit. The full recorded signature remains available in Inspector. A short recursive viewport still uses the larger title.
- Object headers retain type and identity. Field names and values carry more weight than declared types. A captured changed scalar uses larger text when it fits. Quoted Strings retain their bounded value in the chip, and crowded references fall back to compact recorded identities or structural metadata. Array-cell labels, dimensions, and index order retain their Pass 1 layout.
- Focus keeps the selected entity strongest and up to six real neighbors in quieter context. On objects, Inspector places captured values above navigation, source and evidence receipts. Provenance, exact values, and expansion remain available.
- Source keeps the existing editor and mapping. A stronger gutter edge and line number identify the mapped site, and quieter tabs and panel chrome support it. The timeline headline presents the exact applied event in ordinary language. Labelled milestones prioritize entries, allocations, mutations, returns, exceptions and I/O. Underlying events retain their exact cursor coordinates, density ticks, and step behavior.

## Evidence and measurements

Generated files are local under `test-results/reference-pass2/`. The same browser driver ran both revisions with a local JDK 26, a UTF-8 locale and Chromium on one Mac. Each revision recorded fresh JVM sessions. For each row below, `pass1/` and `final-captures/` contain the individual images and JSON receipts. Full-resolution strips in `comparisons/` put Pass 1 on the left. `person-native-reference.png` puts R1 before both 1672×941 Person captures. [Original reference inventory](AUDIT.md#reference-inventory)

| State | Matched capture stems | What to look for |
| --- | --- | --- |
| Person write | `person-home-1672x941`, `person-field-provenance` | Mapped line 18, `this` binding, `18` on the changed face, and the exact applied write in the dock. The slot stays emphasized when the recorder appends its matching provenance. |
| Person Focus | `person-focus` | Both captured fields are legible on the face and visible above Inspector actions. Focus shows the selected object's recorded source site. Returning to the World restores the current execution line. Bright direct relations and the edge-cropped String remain visible. |
| Recursion and return | `series-deepest-follow`, `series-proven-return` | The Pass 1 camera still frames the recorded lineage. The proved return `0` reaches the caller's `prior` write. |
| Inventory and array | `inventory-domain-write`, `inventory-domain-write-760x900`, `array-write` | Quantity is `18`. The independent five-cell run retains the same tray and indices and writes index 1 from `8` to `1`, yielding `[3, 1, 1, 6, 2]`. |
| Exception | `exception-unwind`, `exception-propagation` | The current unwind and recorded throw site are distinct. `IllegalStateException` preserves the exact message and indicates unavailable stack and cause details. |
| I/O | `io-input`, `io-stdout`, `io-stderr`, `io-completed` | Recorded input `7` connects to the write that consumes it. The active output channel and exact prefix remain available. A channel can have recorded output with no proved spatial producer. |
| Completion and class state | `person-completed`, `class-state-home` | The returned frames and objects retain their places after completion. The class shelf still shows recorded static state. |
| Narrow Hero and density | `person-home-760x900`, `dense-home`, `dense-far-from-home`, `dense-medium-from-home`, `dense-close-from-home` | The 760 px Source rail offers the mapped line. Dense samples retain quiet stack and heap context, with cropped peripheral faces at closer distances. |

The normal Home run covers all five target viewports and R1's native size. On desktop it exposes the mapped line in the editor. The selected reference matrix also exercised staged camera and inspection states at 1440×900 and 760×900. Grayscale pairs show that the Person write, current source, shorter frame names, primary routes and return caption stay distinguishable through size, weight and opacity. The array's index-level contrast and terminal channel distinctions still benefit from color. [Affected-state rescore](VISUAL-SCORECARD.md#pass-2-rescore)

### Performance sample

The 47 matched browser commands per revision had median first composition of **88.3 → 90.7 ms** and median settle of **994.9 → 993.3 ms**. The 24 Home commands were **85.9 → 86.1 ms** to first composition. The single-machine dev sample uses `pass1/` and `final-captures/`. Settle includes scripted camera durations. First composition includes the browser action, UI commit and two animation frames.

| Settled state | Draw calls, Pass 1 → Pass 2 | Triangles, Pass 1 → Pass 2 |
| --- | ---: | ---: |
| Person Home | 93 → 93 | 41,451 → 41,139 |
| Person field provenance | 93 → 97 | 44,299 → 43,363 |
| Person Focus | 89 → 107 | 41,739 → 41,439 |
| Series return | 105 → 109 | 44,989 → 44,789 |
| Array write | 72 → 76 | 25,357 → 25,221 |
| Exception propagation | 114 → 118 | 47,835 → 47,571 |
| I/O input | 96 → 103 | 27,435 → 27,427 |
| Dense Home | 97 → 97 | 408,735 → 407,607 |

Focus had the largest measured draw-call increase. Its adjacent GPU timer samples show approximately 2.5 → 2.7 ms median. The full runs had one Focus command each. Settle was 1,000 → 1,029 ms, and first composition was 116 ms at baseline and 698 ms on the final capture. About 493 ms of the slower sample was in the Playwright action. The standalone recheck returned to 116 ms first composition and 999 ms settle. Track the additional draws and latency variation during optics work. Sustained frame time, memory, a second GPU and production performance remain separate qualification work.

### Qualification

- The 22-case selected real-JVM reference matrix covered Hero, Focus, recursion, return, array write, completion, exception, I/O and the three zoom levels at 1440×900 and 760×900. The final proved-return caption also passed retests at 1440×900, 1440×650 and 760×900.
- Six array workflows verified indexed selection and reverse scrubbing in fixed cells, exact writes, Home/Focus, replay and manual navigation during playback. Five recursive camera cases verified Follow framing and manual takeover. The browser checks also exercised true connector hover, Trace All bundles and Focus context.
- The initial frame-title check exposed tight status clearance under descenders in normal views. The final title position passed at 1440×900 and 760×900, including Inspector access to the full signature. The short recursion title placement remained intact.
- The final presentation and golden run passed 1,944 tests with seven skips. Both typechecks, ESLint and the production build passed. The build still reports its existing large-chunk advisory. The eight-case normal-mode capture replay passed on both revisions and again after the final typography adjustment.

## Remaining visual work

Busy dense scenes can still place faces and exterior routes at the edge of the viewport. A few small or long values still need inspection. Reflections, broad floor highlights and opaque face treatment affect contrast even with substantially quieter routes. Pass 3 should improve acrylic, side and edge response, contact, and the floor's reflected hierarchy using the same cameras and captured values.

## Execution boundary

The planner uses accepted semantic events, graph evidence and the presentation cut. It introduces no new process or transport dependency. The real JVM still runs locally and unsandboxed. A future hosted execution provider still needs isolation and a versioned event boundary.
