# Shared face emphasis, captured return captions and Classic removal

Implementation checkpoint, 2026-10-15; whole-product A–G acceptance remains open.

## Production changes

`world/facePlate` supplies the physical chip geometry to both the instanced renderer and temporal emphasis. Scoped/windowed rows use their presented row position; a captured late row does not need a permanent canonical port to receive an outline. Map keys and values have separate actual half-chip positions. Canonical runtime IDs, anchors and recording semantics are unchanged.

Already drawable graph-backed return curves now have amber `return <captured value>` captions. Only matching captured operand text can supply the secondary line, at 0.65 of the primary size. Captions retain their graph edge ID, bounded text, a dark readability plate, shared Safe Frame/body/Inspector clearance and minimum 12-pixel admission. They create no curve, value, operand or permanent runtime port. Native QA reads the actual Troika glyph text, opacity and projected size.

Source-unknown arrays and known collection types reserve their typed geometry in the library region at allocation. They retain that region and body through later observations/ownership changes; ordinary library objects retain their exact compact dimensions and positions. Variable library footprints use region occupancy to avoid overlap. A regression run exposed a second issue: raw fields inside a reserved collection body still used compact port limits. Port capacity, chip spacing and typography now distinguish the actual compact body from the library region itself. No captured collection summary is inferred from type alone.

## Original Classic cases and current successors

| Retired consumer | Cases | Production successor and retained facts |
| --- | ---: | --- |
| classicScene | 7 | `render/runtimeScene.test.ts`; Person allocation, age 0→18, actual p/this references, identity, picking, replay |
| deepStack | 6 | `render/runtimeRecursion.test.ts`; all recorded recursive calls/operands, return storage, reverse prefixes, camera and completion retention |
| arrays | 8 | `render/runtimeArrays.test.ts`; all 122 captured prefixes, five cells, four lexical locals, exact reads/sequential writes, Inspector and physical slots |
| scopes | 7 | `render/runtimeScopes.test.ts`; eight original named locals, live Scanner/input destination, retired scopes/reverse replay, empty blocks, exact graphless return facts |
| classicStaticSparse | 12 | `render/runtimeSparse.test.ts`; written statics, exact static references, 1M/2M sparse arrays, late/selected cells, observed reads, unavailable contents |
| viewport | 12 | `camera/runtimeViewport.test.ts`; original four adversarial rectangles, actual sparse/static/overflow subjects, Home/Focus, 40 repeated requests and finite pan/zoom |
| **Total** | **52** | **All cases have current production successors.** |

The first 13 cases moved in checkpoint `4bb4062`; the remaining 39 move in this checkpoint. Successors use normalized captured unit records, fixture recordings and the actual reducer/layout/projector/planner, renderer, Inspector, accessibility and camera. Unit fixture records are not fresh JVM evidence. Original Java type, lexical lifetime and recorder validation remain binding: the old mixed Box[]/int fake scene becomes separately typed reference/int records; a Scanner reference is declared before input; scoped method entry has empty locals; an unobserved sparse read is rejected unless explicitly observed. Matching final values alone never authorize provenance.

Corrected presentation oracles replace retired empty-completion worlds, phantom scope volumes and fictional return slots. Selected input in the scope unit test does not establish automatic late-row promotion for every graphless cursor event; that separate gap remains open.

The Classic renderer, motion component, stylesheet, selector/index and its old projection/viewport are removed. Dead app/example layout adapters, old world layout/SceneModel/object-face facades and the unused visualization contract are also removed after consumer review. The remaining old 3D primitives/navigation, browser selector consumers, CSS, contract aliases and persistence cleanup are **not** claimed removed.

## Failed and corrected evidence

- Initial motion checks: three failures demonstrate scoped Y mismatch, a missing promoted late-row outline and Map key/full-row overlap. Corrected focused integration: **57/57**, eight files (`face-motion-successors-confirmed.log`).
- Caption tests: **18/18**, four files (`return-captions-initial.log`). Native targeted integration: **4/4**, including actual JVM returns and collection captures (`browser-face-motion-caption-initial.log`). The return capture contains actual `return 21`, opacity 1 and 23.94-pixel font; it does not establish that every historical caption or the RETURNS heading is visible.
- Initial Classic successor drafts fail for invalid fixture/recorder assumptions; logs are retained. Corrected arrays/scope/sparse: **27/27** (`classic-array-scope-sparse-successors-confirmed.log`). Initial viewport run: **10 passed / two failed**; the actual selected cell lay outside its compact library body/Home frame. Typed reservation fixes the body, preserving the original assertions.
- Reservation integration and unchanged layout goldens: **116/116**, nine files (`library-structure-reservation-confirmed-2.log`). No golden was edited or updated.
- First full default regression: **2025 passed / two failed / 70 explicit opt-in skips / 2097 total**, 209 files (`unit-face-motion-classic-removal.log`). Failures are JDK-discovery timeout and raw-field drawable/visible mismatch. The unchanged JDK case and corrected raw-face/viewport/reservation/golden corpus pass **25/25**, six files (`library-raw-face-regression.log`). A fresh full run is required; the first run remains a failure.

## Remaining gates and visual limits

Current strict reference TypeScript, source lint and production build pass. Fresh defaults pass **2027/70 explicit opt-in skips/2097 total**, 209 files, 173.03 seconds (`unit-face-motion-classic-confirmed.log`). Cached projection passes **3/3, zero skips**, 90 seeded seeks/270 plans, explicit GC, 1.04 seconds; four guardrail files pass **19/19**, 1.15 seconds. Actual main entry is **71,931 gzip bytes**, closures **72,359/653,050** diagnostic bytes, Monaco/Cinematic split. AST inventory: **619 tracked modules / 2146 literal edges / 217 production-reachable / 44 remaining legacy targets / zero production-reachable legacy**. Fresh full native reconstruction passes **71/71**, 8.9 minutes, exit 0 (`browser-face-motion-classic-confirmed.log`, unique results in `native-face-motion-classic-removal-results/`). The actual complete default browser inventory is 197 cases: these 71 plus 126 older cases still requiring migration/confirmation. The root opened the actual return capture and recursion reference at original resolution: opaque saturated faces, excessive cyan halos, oversized headings, clipped lower stack and weak glass/environment treatment remain open. Functional captions and Classic removal do not approve visual convergence, fixed Dense latency/retention budgets, the full legacy browser suite or final A–G completion.
