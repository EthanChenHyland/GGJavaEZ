# Reference-Exact Rebuild — Audit

Base: `316b94ad79582c284fd466174db6f82d939aebba` (`reference-exact-rebuild` = `main` = `spatial-2-hardened`). This audit covers the full reference suite and the shipped Phase 5.5 product. It is the evidence base for requirements.md, design.md and tasks.md.

Method: every reference image was opened at original resolution with the image reader. Current-product findings come from reading `src/`, `server/`, `instrumentation/`, the Phase 5/5.5 checkpoint documents, and accepted Phase 5.5 browser captures (`docs/checkpoints/v12-p5_5/browser-accepted/**`, local and gitignored). Where a statement is inferred rather than read, it says so.

## 1. Reference inventory

| ID | File (root, read-only) | Tracked twin | Size | Depicted state | Role |
| --- | --- | --- | --- | --- | --- |
| R1 | `best.png` | `references/06_true3d_person_runtime.png` | 1672×941 | Hero runtime: source left, stack tower, heap, two reference connectors, bottom timeline at 4/4 | Primary composition, shell, materials, typography |
| R2 | `ChatGPT Image Oct 3, 2026, 02_21_17 PM.png` | `references/07_true3d_object_inspector.png` | 1672×941 | Close inspection of one heap object + compact Object Inspector | Focus/close-inspection behavior, inspector scale |
| R3 | `ChatGPT Image Oct 3, 2026, 02_21_12 PM.png` | `references/08_true3d_recursion.png` | 1672×941 | Recursive descent with amber return propagation | Recursion depth, call links, returns |
| R4 | `ChatGPT Image Oct 3, 2026, 02_21_08 PM.png` | `references/09_true3d_array_sort.png` | 1672×941 | Array as indexed cubes, compare/swap emphasis, 8/20 timeline | Array cells, array operation |
| R5 | `ChatGPT Image Oct 3, 2026, 02_21_05 PM.png` | `references/10_true3d_reference_sheet.png` | 1536×1024 | 8-panel sheet: overview, close inspection, recursion, array, references, zoomed-out world, time controls, navigation modes | Behavior catalogue |
| R6 | `ChatGPT Image Oct 3, 2026, 02_20_44 PM.png` | `references/11_true3d_scene_language.png` | 1536×1024 | 8-panel sheet: overview, object inspection, recursion, array op, exception propagation, time travel, free navigation, semantic zoom | Behavior catalogue incl. exceptions/semantic zoom |
| B0 | — | `references/00_REFERENCE_BOARD.png` | 1600×1000 | Schematic board: world overview, navigation modes, semantic zoom, theater continuity | Ontology |
| B1 | — | `references/01_world_overview.png` | 1600×1000 | "Persistent Runtime World": source edge, stack spine, reference field, heap constellation, execution time, HOME•FOCUS•FOLLOW | Region ontology |
| B2 | — | `references/02_navigation_modes.png` | 1600×1000 | Guided Follow, Free Explore, Focus, Trace Path, Home; "User input always wins" | Camera contract |
| B3 | — | `references/03_semantic_zoom.png` | 1600×1000 | Macro (clusters, call silhouette), Meso (frames/objects/refs), Micro (history, in/out refs, exact mutation) | Semantic zoom contract |
| B4 | — | `references/04_person_world_sequence.png` | 1600×1000 | T0–T3: same identity through time | Stable identity |
| B5 | — | `references/05_theater_continuity.png` | 1600×1000 | Array expands in place; recursion collapses back to spine | Theater = transformation, not mini-app |

Checksums (md5) confirm each root image is byte-identical to its tracked twin. Root images stay untracked and unmodified; QA comparison assets use the tracked twins.

## 2. Per-reference analysis

Pixel coordinates refer to each image's native size. Percentages: x of width W, y of height H.

### R1 — hero runtime (`best.png`)
- Header band 0–8% H. Brand: isometric blue cube icon (~40 px), title "Visual Java" (~22 px semibold), subtitle (~14 px, muted). Right: four mode buttons Explore (active: blue-tinted fill, bright 1.5 px blue border, faint glow), Focus, Trace, Home; each ~38 px tall, 98–112 px wide, ~14 px gaps, icons left of labels.
- Source: floating glass panel x 0.6–25.1% W, y 10–64% H. Single tab with filename + dot. Line numbers muted, code ~15 px mono, line pitch ~27 px, syntax colors (keywords blue, types orange/amber, identifiers white). Current line: full-width blue fill with a 1.5 px brighter border. The panel edge reads slightly receding (implied 3D tilt).
- STACK heading: cyan, ~28 px, tracking ~0.18 em, glow, at (29.6% W, 12% H) above the tower. HEAP heading: violet-magenta, same style, at (66% W, 17% H), slightly perspective.
- Stack tower x 30.8–48.4% W, y 19.7–77% H. Three frames touching vertically (top→bottom main() #1, setAge(int) #3, Person() #2). Front-face aspect ≈ 1.75:1 (2 rows) to 1.6:1 (3 rows). Visible slab depth ≈ 0.12 of width (thin slabs). A deck of translucent ghost frames recedes behind the tower toward back-left.
- Frame face: title (method signature, ~22 px) left, id (#1, ~16 px) right; rows `name | type | value-chip`, row pitch ~38 px. Value chips are dark inset rounded plates with bright text; a reference chip carries a glowing port dot at its right edge.
- Heap: dominant violet acrylic cube "Person #17" x 60.7–81.6% W, y 27–58% H (front aspect ≈ 1.2:1, depth ≈ 0.45 of width). Title ~28 px, id ~22 px, rows pitch ~55 px. Smaller related objects (String #12 upper right, ArrayList #31 right). Background heap cubes dim and defocused at depth.
- Connectors: two cyan glowing S-curves (~2.5–3 px core + soft halo) from frame value ports to the object's left face with end dots. Heap→heap: violet curve with arrowhead.
- Materials: luminous translucent acrylic bodies with interior glow, crisp bright edges, readable darker inner faces. Lighting: blue key from the stack side, violet from the heap side, glossy dark floor with reflections and a perspective grid, haze/fog at lower corners, deep navy background.
- Timeline: floating glass bar x 0.9–99% W, y 87–97.5% H (~100 px). Left: circular play (~58 px, ring glow), step back, step forward. Caption "4 / 4" (blue) + "Executing: p.setAge(18)". Track with event nodes and labels below ("1. new Person()" …), current node ringed and labelled in blue. Right: `t = 34`, `1.0x`, gear.
- No Explorer, Console, Problems, status line or activity rail is visible.

### R2 — close object inspection
- Same shell. Source narrower (x 0.6–22.7% W). Stack tower smaller and pushed left (26–40% W). Inspected object enlarged and centered (x 48–76.5% W, y 26–71% H): strong three-quarter view, side face ~37% of front width. Field rows large (~30 px values).
- Object Inspector: compact glass card x 79–99% W, y 34–86% H: title + close; icon + "Person #17" + "class Person"; Fields table; Inbound References (count, entry "Stack Frame main() → local variable p", blue dot); Outbound References (entry "String Person.name → "Ethan"", violet dot).
- Only the relevant connector is shown; unrelated objects recede/blur. Mode bar still shows Explore active (inconsistency: this is Focus behavior).

### R3 — recursion
- Source `Factorial.java`, current line highlighted. STACK heading centered above.
- Recursive frames form a staircase: each deeper invocation steps back in depth (and up on screen through perspective), slightly smaller; ghost history columns behind. A wide base slab sits under the first call.
- Call links: white-cyan C-arcs on the left between consecutive frames (port dots on left edges). Returns: amber glowing arrows rise from the right side of each frame to amber value nodes; labels `return 24` (~24 px) with an evidence sub-label `4 * 6` (~16 px). "RETURNS" amber heading.
- Timeline 1/8 with events `call(4)…return 24`, t = 0. Fiction: the image shows returns while the timeline is at event 1, and skips factorial(3). The resolved product shows only returns that exist at the cursor.

### R4 — array operation
- Source `SortDemo.java` wider (x 0.6–27.5% W).
- Stack column shows main() plus separate slabs for `i`, `j`, `temp` (fiction: locals are rows of a frame, not frames).
- Heap array: glass tray/backplate with title plate `int[] numbers`, id `#23`, five near-cubic cells nearly touching, index labels above, large centered numerals (~40 px). Compared cells: one cyan-filled, one magenta-bordered; dashed circular swap arrows above and below. Cells recede left (perspective).
- Background ghost heap objects. Timeline 8/20 with semantic event labels; future events greyed.

### R5 — reference sheet (8 panels)
1. Overview: stack left, heap right, labelled connector `p` with a mid-curve node; compact rows `p → #17`; floor label "Call Stack (deeper →)".
2. Close inspection: "Fly up to a single object"; compact inspector (Class, Object ID, Fields (2), Referenced by `main().p`, `setAge().this`, Refers to `String #12`).
3. Recursion: "Camera can travel down the call stack"; "Deeper stack frames in −Z direction"; status rows `return pending` / `return 1`.
4. Array: "Array as 3D blocks that can be animated"; header `int[] numbers (length = 5)`; before/after rows.
5. References in 3D: clean single curve with label.
6. Program world zoomed out: full topology; small boxes, many connectors.
7. Time controls: "world updates in place"; changed rows highlighted amber.
8. Navigation modes: Home, Follow Execution, Free Explore (active), Focus Object, Trace Reference, Recenter; dashed camera path.

### R6 — scene language (8 panels)
1. Overview: vertical stack tower with `line N` (blue) under titles and status words (`returning`); heap field of many small cubes; selected object prominent.
2. Object inspection 3D: nested value plates (`name → String #21 "Ethan"`, `courses → Array #4 length = 3`) and adjacent target objects with per-element references.
3. Recursion: "Call stack as a 3D stack you can travel through"; frames stepping into depth.
4. Array op: header plate with `length = 5` and identity; moved value amber with an arc to its destination index.
5. Exception propagation: frames `main()` (`try { … }`), `process()` (`throw e`), `parse()`; red curved arrows through frames; red glass exception panel (class, message, `at …` trace lines).
6. Time travel: three states of the same object (Allocated → Field write (amber) → Method return).
7. Free navigation: orbit/pan/zoom across STACK and HEAP regions.
8. Semantic zoom: Zoomed Out (Program Overview) → Medium (Related Objects) → Close Up (Object Details).

### B0–B5 — schematic boards
Flat diagrams establishing ontology rather than finish: source edge → stack spine → reference field → heap constellation; execution time strip; Guided Follow / Free Explore / Focus / Trace Path / Home with "User input always wins"; macro/meso/micro; identity stable through time; arrays and recursion unfold in place and collapse back.

## 3. Resolved design system

| Topic | Inconsistency across references | Resolution |
| --- | --- | --- |
| Call-depth direction | R1/R5-1: deeper below caller. R3: deeper recedes back (appears higher). R5-3/R6-3: deeper steps down and into −Z. R6-1: newest on top | Callee is placed below its caller and recessed in −Z ("descends through depth"). Perspective from the elevated hero camera produces the R3 staircase reading. One rule for every call; no recursion special case |
| Sibling calls / history | R1/R3/R4 show ghost decks behind the tower | Completed sibling invocations stay where they ran. Later siblings at the same depth are placed in front of earlier ones (+Z history deck), so the newest work faces the camera and history recedes behind it |
| Locals | R4 renders locals as separate slabs | Locals are rows of their frame. Never separate frames |
| Mode bar | R2 shows Explore active during Focus | Mode buttons reflect the actual navigation mode |
| Inspector | R2 large card, R5-2 compact | Compact contextual card (≤ 20% W), secondary to the in-world face |
| Labels | R5/R6 compact `p → #17` vs R1 `name | type | value` grid | Grid at close range; compact `name → value` rows at medium range |
| Heap palette | R6-7 shows teal/amber cubes | Teal reserved for class/static state; amber only for mutation/return emphasis |
| Recursion returns at cursor 1 | R3 shows all returns at t = 0 | Show only returns recorded at or before the cursor |
| Exception color | Red glass panel + red arrows | Red reserved for actual exception paths; ordinary stderr uses restrained orange |

### 3.1 Composition tokens (viewport-normalized; derived from R1–R4 at 16:9)

| Token | Value | Evidence |
| --- | --- | --- |
| `shell.header.h` | 0.080 H (56–76 px) | R1–R4 header band |
| `shell.brand.title` | 0.024 H, weight 600 | "Visual Java" |
| `shell.brand.subtitle` | 0.015 H, muted | subtitle |
| `shell.modeButton.h` | 0.041 H (34–40 px), radius 8 px | Explore/Focus/Trace/Home |
| `source.panel` | x 0.006 W, y 0.100 H, w 0.250 W (clamp 340–470 px), h 0.56 H (RUN); EDIT expands to 0.48 W × 0.76 H | R1 (0.245 W), R2 (0.221 W), R4 (0.269 W) |
| `source.code` | 0.016 H font, 0.029 H line pitch | R1 code |
| `region.heading` | 0.029 H, tracking 0.18 em, glow; STACK cyan, HEAP violet, CLASS STATE teal | R1 headings |
| `world.safeFrame` | x 0.27–0.985 W, y 0.10–0.85 H when source visible | Stack starts at 0.30 W, heap ends at 0.98 W |
| `stack.screenBand` | 0.30–0.49 W | R1 tower |
| `heap.screenBand` | 0.55–0.98 W | R1 heap |
| `timeline.dock` | inset 0.009 W, bottom 0.025 H, h 0.106 H (84–112 px), radius 12 px | R1–R4 |
| `timeline.play` | ⌀ 0.062 H | play button |
| `timeline.track` | 0.15–0.81 W, node ⌀ 10 px, current ring ⌀ 20 px, labels 0.015 H | track |
| `inspector.card` | w 0.20 W (min 300 px), top 0.34 H, max-h 0.52 H | R2 |

### 3.2 World tokens (world units; hero framing ≈ 60 px per unit at 941 px height)

| Token | Value | Evidence |
| --- | --- | --- |
| `frame.size` | W 4.8, header 1.0, row 0.72, pad 0.3 → 3 visible rows: H 3.46, D 1.1 | R1 frame 290×165 px with 2 rows, slab depth ≈ 0.12–0.25 W |
| `frame.stackGap` | 0.10 vertical between caller and callee | R1 tower frames touch |
| `frame.depthStepZ` | 1.25 per call depth | R3/R5-3 recession |
| `frame.deckStepZ` | D + 0.35 per later sibling at the same depth | R1 ghost deck |
| `object.size` | W 5.2, header 1.5, row 1.05, pad 0.45; D 2.3; library/summary objects W 4.2 | R1 Person 350×290 px, side ≈ 0.45 W |
| `array.cell` | 1.55³, gap 0.08, index label 0.5 above, tray backplate depth 0.12, title plate 0.9 high | R4 cells nearly touching |
| `region.gapStackHeap` | 0.7 × frame W (≈ 3.4) between tower edge and first heap column | R1 810→1015 px |
| `heap.typeColumnPitch` | object W + 2.4 | R1 heap spacing |
| `text.title` | 0.40 u (≈ 24 px at hero) | frame/object titles |
| `text.id` | 0.28 u | `#17` |
| `text.row` | 0.32 u, values 0.34 u semibold | rows |
| `text.type` | 0.27 u, muted | types |
| `connector.width` | core 2.5 px (screen-space), halo 8 px; selected 3.5 px | R1 |
| `connector.port` | ⌀ 0.16 u glowing dot | R1/R3 |
| `solid.bevel` | 0.10 u radius; chips 0.06 u | R1 soft edges |

### 3.3 Camera tokens

| Pose | Value | Evidence |
| --- | --- | --- |
| Vertical FOV | 36° (current app: 41°) | R2 side-face ratio and R1 floor convergence |
| Hero pitch | −13° (camera above, looking down) | thin visible tops of slabs and objects |
| Hero yaw | +8° toward the stack side | R1 side faces |
| Hero fit | world bounds into `world.safeFrame`, stack tower ≈ 18% W wide | R1 |
| Focus pose | target face fills ≈ 30% W × 45% H, 18–24° side yaw, pitch −8° | R2 |
| Recursion pose | pitch −16°, yaw +18°, staircase diagonal across the safe frame | R3 |
| Far / macro | pitch −28°, whole topology inside the safe frame | R5-6, R6-7 |

### 3.4 Palette and materials

| Role | Value | Notes |
| --- | --- | --- |
| Background | vertical gradient `#080C20` → `#03050C`; violet haze `#24104F` behind the heap, blue haze `#0A2463` behind the stack; low corner fog | R1–R4 |
| Stack | core `#1F6BFF`, edge `#5CC8FF`, face tint `rgba(18,52,140,0.62)`, chip `#081538` | electric blue acrylic |
| Heap | core `#7A3CF0`, edge `#C58BFF`, face tint `rgba(62,26,140,0.62)`, chip `#170B3C` | violet acrylic |
| Class/static | core `#14B8A6`, edge `#5EEAD4` | teal, distinct from stack/heap |
| Execution / current | `#3FD8FF` | current line, active frame halo, live head |
| Return / mutation | `#FFB23E` / `#FFC857` | amber warm family |
| Exception | `#FF4A5E` | actual throw/unwind/uncaught only |
| stdout / stdin / stderr | `#5BE3A8` / `#3FD8FF` / `#FF8A5B` | restrained endpoints |
| Text | `#EEF4FF` / `#A9B8DA` / `#6E7FA6` | primary / secondary / muted |
| Acrylic body | physical material: roughness 0.22, ior 1.45, thickness 1, transmission 0.75 (cinematic) or fresnel-rim emulation (interactive), emissive interior 0.08–0.18 | readable faces stay opaque-tinted |
| Edges | bright emissive edge strips, bloom-eligible | crisp illuminated edges |
| Floor | dark glossy reflective, faint blue grid (1 u minor, 4 u major) | R1–R4 |

Typography: one geometric sans (Inter) for UI and in-world text, JetBrains Mono for code. Titles 600, rows 500, values 600, types 400 muted; region headings 600 uppercase with wide tracking.

### 3.5 Fiction versus design

| Reference content | Status | Production rule |
| --- | --- | --- |
| `Person #17`, `"Ethan"`, `18`, `String #12`, `ArrayList #31`, `#45`, `#28`, `Factorial`, `SortDemo`, `numbers = {3,8,1,6,2}`, `NumberFormatException "abc"`, `Course #22`, `0x7f3a2c10`, `t = 34`, event labels | Fictional example data | Never copied. Real types, ids, values, event labels and timestamps come from the recording |
| Ghost background heap cubes | Implied unrelated objects | Only real, de-emphasized objects; never decorative cubes |
| Locals as frames (R4) | Visual cheat | Rows inside the owning frame |
| Return labels with expressions (`4 * 6`) | Evidence-dependent | Shown only when the recording supplies the expression/operands |
| Dashed swap arcs (R4) | Evidence-dependent | Only for recorded array compare/write facts |
| Exception stack text (R6-5) | Evidence-dependent | Exact recorded class, message and frames only |
| City-like background glow columns | Atmosphere | Not reproduced as scenery; background is gradient/haze only |

## 4. Current product audit (Phase 5.5)

Each table row: **Reference behavior | Current behavior | Gap | Semantic dependency | Implementation consequence**.

### 4.1 Current Phase 5.5 application (overall)
Production entry `src/main.tsx` lazy-loads `IdeWorkspace` (1,323-line monolith) for `/`; `/examples` renders the older stand-alone `App` shell with curated traces. `IdeWorkspace` embeds `App` (`embedded`) inside a "RUNTIME" panel. Accepted Phase 5.5 captures show a near-black neutral canvas, dark matte boxes with hairline outlines, small text, large empty areas, and dense IDE chrome.

| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Runtime world is the full-bleed workspace; IDE surfaces float subtly | Split-pane IDE (activity rail, project panel, editor 30–64%, runtime panel, bottom tools, status line) | Fundamental: the world is a pane | None | Replace shell composition entirely |
| Luminous acrylic, cinematic lighting | Matte `meshStandardMaterial`, ambient+hemisphere+one directional, two point lights | Fundamental | None | New material/lighting/post pipeline |
| One product | Two shells (`/` IDE, `/examples` App) and two runtime views (Spatial + Classic) plus Theater | Parallel products | Curated traces are regression fixtures | Single shell; `/examples` becomes a recording viewer in the same shell; Classic and Theater removed |

### 4.2 Current shell (`src/ide/IdeWorkspace.tsx`, `src/ide/ide.css`, `src/app/App.tsx`, `src/app/styles.css`)
| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Header: brand + subtitle left; Explore/Focus/Trace/Home right | Top bar: brand, command-search pill, JDK badge, Run/Debug/Stop/launch; camera tools live inside the runtime panel (7-icon toolbar, Classic/Spatial, Guided toggle) | Mode bar absent from header; chrome duplicated | Navigation store modes | Header owns mode buttons + compact Run/Debug cluster |
| No rail, no status line | Activity rail (5 icons), status line with support details/shortcuts | Extra persistent chrome | Status facts (JDK, JDT, build system, capture limits) must stay reachable | Move to a slim dock strip + popovers |
| Shell states transform one world | `workspaceMode` code/visualize/debug changes editor width (64% / ~30%); `runtimeExpanded` "Focus runtime" mode | Partial; modes are layout presets, not product states | ExecutionSession phase, lens | Introduce explicit `AppState` machine driving composition |
| Layout state scattered | ~60 `useState` hooks in one component | Unmaintainable for reconstruction | Command host/ops contracts must survive | Split into stores/hooks: workspace, editor tabs, execution, shell layout |

### 4.3 Current Spatial renderer (`src/scene/RuntimeCanvas.tsx`, `src/scene/primitives/*`)
| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Translucent glowing frames/objects with readable inset chips | `SolidBody` matte box + `SolidFace` panels; Troika text; opaque | Material and face design | SceneModel slots/values | Rebuild primitives (`FrameSlab`, `ObjectBlock`, `ArrayTray`, `ClassShelf`) on a shared material system |
| Glossy reflective floor with grid | Matte plane sized to bounds | Missing reflections/grid | None | Floor/environment module with quality tiers |
| Region headings with glow | Troika text STACK/HEAP/CLASS STATE, 0.31 u | Style/size | Bounds | Heading tokens |
| Demand rendering, bounded draw calls | `frameloop="demand"`, 125–134 draw calls in soak | Good base | — | Keep demand rendering; animation invalidates frames |

### 4.4 SceneModel (`src/world/sceneModel.ts`, `src/contracts/world.ts`)
| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Every visible entity is real | Immutable projection with WeakMap caches; never reads source; frames/objects/classes/references/io/returnFlow | Good truth discipline | RuntimeState, ExecutionGraph | Preserve the projection principle; extend with presentation-free semantic fields only (invocation status, exception role, caller evidence already present) |
| Return propagation along the whole chain | Only `returnFlow` for the latest return | Missing per-invocation return history | `runtime.returns`, graph return edges | Project bounded recent returns with proven destinations |
| History decks | Frames stay at original XYZ (good) | Layout rule differs | Invocation ids, caller ids | New layout engine, same append-only principle |

### 4.5 Semantic zoom (`src/world/spatialPresentation.ts`, `navigation.ts#detailLevelAtDistance`)
| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Far: clusters/topology; medium: related objects; close: details (R6-8, B3) | macro/meso/micro with hysteresis (macro > 20 u, micro < 10 u), strict budgets per level, clusters with real member counts, quiet instanced volumes | Mechanism exists; presentation weak (tiny labels, empty-looking macro) | Real membership | Keep planner contract; redesign cluster/LOD visuals and tie thresholds to projected size, not absolute distance |

### 4.6 Camera (`src/navigation/*`)
| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Three-quarter hero, ~36° FOV, pitch ≈ −13° | 41° FOV, home pose `[5.2,4.9,11.6]`, fit to bounds | Different pose/feel | Anchors | New camera rig tokens; keep "user input wins" logic |
| Modes Explore/Focus/Trace/Home (+Follow) | `CameraMode` HOME, GUIDED_FOLLOW, FREE_EXPLORE, FOCUS_ENTITY, TRACE_PATH, THEATER | THEATER obsolete; Guided toggle separate | — | Collapse to Explore (with Follow sub-state), Focus, Trace, Home |

### 4.7 Focus
| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Fly to object, object fills ~30% W, neighbors kept, others recede, compact inspector (R2) | `navigationActions.focus` → isolated selection, 18° side view, ≤2 neighbors, floor hidden; Inspector card + "Return to world" | Behavior close; presentation and context quieting weak | One-hop graph context | Rebuild as a first-class state with dimming/defocus, preserved timeline, Escape returns to prior pose |

### 4.8 Home
| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Useful topology framing for any program | Fits occupied corners and group representatives; terminal Home avoids microscopic strip | Works generically; composition differs | Bounds of represented geometry | Re-target to hero tokens/safe frame; keep representative-based fitting |

### 4.9 Trace
| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Trace button in header; emphasizes relationships | Trace = `tracePath(referenceId)` camera path; separate "Relevant/Current/All flow" select | Two unrelated concepts | ExecutionGraph flows | Trace mode = relationship emphasis with Relevant/Current/All segmented control; camera path optional |

### 4.10 Source/editor integration (`EditableJavaEditor.tsx`, `ui/SourceEditor.tsx`, `ide/sourceBindings.ts`)
| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Floating translucent source panel, current-line bar | Monaco in a hard split pane; executing line + paused line decorations; recorded-source fallback view | Presentation only | Source bindings, hashes, executing location | Keep Monaco + bindings; new floating panel with state-driven size and a reference-matched theme |

### 4.11 Explorer (`ProjectExplorer.tsx`, `ide/contextMenus.ts`)
| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Not visible (contextual) | Persistent project panel (13–28% W) with tree, context menu, import/new project | Takes space | Filesystem ops, rename journal, drafts | Revealable drawer anchored to the source panel; all operations unchanged |

### 4.12 Tabs
| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Single tab row in the source panel with dirty dot | `ide-tabs` with context menu (`tabMenuCommands`), close buttons | Styling | Dirty drafts, close plans | Restyle inside the source panel; keep commands |

### 4.13 Timeline (`src/ui/timeline/*`, `playback/*`)
| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Floating glass dock: big round play, steps, "n / N Executing: …", labelled event nodes, `t =`, speed, gear | Thin bar: square buttons, LIVE/HISTORY badge, slider, ≤ N colored micro-markers without labels, speed select | Presentation | Cursor, lens, live head, partial status | Rebuild with labelled semantic milestones (bounded), keep every control and lens semantics |

### 4.14 Console (`IdeWorkspace` bottom panel, `ui/ConsolePane.tsx`)
| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Not shown in heroes; brief: dock beneath timeline, surfaces on input | Bottom panel tab; auto-opens on WAITING_FOR_INPUT; full process output in `<details>`; archive download | Placement | Console truth, recorder vs pipe ordering, truncation archive | Dock drawer above the timeline; identical content rules |

### 4.15 Inspector (`ui/Inspector.tsx`)
| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Compact card: identity, fields, inbound/outbound refs (R2, R5-2) | Right column card (fields, inbound "last recorded binding" entries, ownership, Focus/Return buttons) | Verbose, utilitarian | RuntimeState, graph | Rebuild card to reference structure; exact values remain |

### 4.16 Debugger (`debugger/*`, `server/debug-manager.mjs`)
| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Same world, compact controls on pause | Debug button in header; Debugger tab in bottom panel; paused line decoration; Step commands via commands/F-keys | Controls buried in bottom tab | Debug semantics, history-cursor separation | Floating compact debug bar when paused; keep commands/shortcuts |

### 4.17 Error Explorer (`debugger/ErrorExplorer.tsx`, `debugger/causality.ts`)
| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Red exception panel in world + red propagation arrows (R6-5) | Error Explorer bottom tab; frames tagged origin/unwound/caught | No forensic world state | Exception facts | Forensic world presentation + Error Explorer drawer for exact text |

### 4.18 I/O UX (`world/ioSummary.ts`, `SemanticFlow.tsx#IoEndpoint`)
| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Not explicit; brief: restrained semantic endpoints | ≤ 3 bounded endpoints anchored at first fact; GraphIO-based | Presentation | GraphIO, consumed-input facts | Keep facts; redesign endpoints as small glass ports at the world edge |

### 4.19 Responsive behavior
| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Designs are 16:9 desktop | Media queries at 1500/1300/1100/900/760/680 px, source moves below on narrow | Recomposition exists but for the old shell | None | New responsive composition per breakpoint class (wide, standard, compact, narrow-tall, short) |

### 4.20 Material/lighting architecture (`theme/tokens.ts`, `DESIGN_TOKENS.json`)
| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| PBR acrylic, rim/edge light, reflections, AO, restrained bloom | Tokens v3: muted body colors, no environment map, no post-processing; `renderQuality` high/balanced/low controls DPR/shadows only | Fundamental | None | Tokens v4 + quality tiers INTERACTIVE/CINEMATIC; three/examples passes (no new dependency needed: EffectComposer, UnrealBloomPass, GTAOPass, SMAAPass, OutputPass ship with three 0.186; drei provides Environment, ContactShadows, MeshReflectorMaterial) |

### 4.21 Performance
Phase 5.5 (`docs/checkpoints/v12-p5_5/PERFORMANCE.md`): scrub p50/p95 50.45/101.24 ms; Focus 75.67/110.97 ms; Home 86.50/138.49 ms; WebGL submission CPU 0.60/3.70 ms; async GPU 0.716/1.388 ms; 125–134 draw calls, ~27.5k triangles; rich semantic retention 354.56 MiB; dense cold load 4,816 ms; main JS 1,617.67 kB (450.91 kB gzip), Monaco chunk 3,280.69 kB. Incremental I/O projection, memoized connector geometry, bounded routing obstacles (≤ 48).

| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Cinematic finish while interactive | Cheap renderer, good bounds | Material/post cost unmeasured | — | Budget per tier; CINEMATIC never default during scrubbing; measure all Phase 5.5 metrics again |

### 4.22 Accessibility
Phase 5.5 retains keyboard tools, visible focus, `prefers-reduced-motion` (NavigationController, presentationMotion), dialog focus traps, aria labels on timeline/camera controls.

| Reference | Current | Gap | Semantic dependency | Consequence |
| --- | --- | --- | --- | --- |
| Cinematic visuals | Accessible but plain | New glass UI risks contrast loss | None | Contrast tokens (≥ 4.5:1 text), focus rings, non-color state markers (icons/text), reduced motion = instant transitions |

### 4.23 Obsolete Phase 5 structures (remove once replaced)
- `src/classic/*` (Classic 2D runtime and its tests) and the Classic/Spatial view selector.
- Theater presentation (`layout.theater`, `presentation: 'theater'`, `CameraMode 'THEATER'`, `representation-bar`).
- `App.tsx` stand-alone shell (topbar, example picker, source column, readouts `call-status`/`array-status`, `world-controls`, `world-access` selects, `world-hint`, Guided toggle, `event-chip`s) — superseded by the rebuilt shell and in-world presentation.
- IDE chrome: `ide-activity-rail`, persistent `ide-project-panel`, `ide-bottom-panel` tabs layout, `ide-status-line`, `ide-runtime-ready`, RUNTIME/SOURCE headings, divider-based split layout.
- Matte primitives `SolidBody`/`SolidFace`, `IdentitySolid`, `WorldOverviewLabels`, `ConnectorCaptions` (replaced by the new primitive set), `styles.css`/`ide.css`/`Timeline.css`/`ConsolePane.css`/`TraceInspector.css`/`debugger.css` visual rules.
- Layout kinds `standard`/`deepStack`/`array`/`scoped` once curated fixtures render through the single engine (`examples/curatedLayout.ts`, `examples/scopedLayout.ts`, `layout.ts` legacy helpers). Presentation goldens tied to them are regenerated deliberately; semantic goldens stay byte-identical.

## 5. Preserved substrate inventory

| Contract | Location |
| --- | --- |
| ExecutionSession, phases, lens types | `src/execution/contracts.ts`, `server/execution-manager.mjs`, `server/execution-transport.mjs` |
| Real JVM execution, launch, build | `server/launch.mjs`, `server/runner.mjs`, `server/build-service.mjs`, `server/build/{plain,maven,gradle}.mjs`, `server/compiler.mjs`, `server/jdk.mjs` |
| Instrumentation | `instrumentation/java/visualjava/*`, `server/instrumentation-provider.mjs`, `server/instrumentation-sources.mjs` |
| Incremental transport + ingest | `server/execution-transport.mjs`, `src/execution/ingest.ts`, `src/ide/client.ts` |
| Normalized trace + incremental normalization/validation | `src/instrumentation/normalize.ts`, `src/runtime/trace.ts`, `src/runtime/valueValidation.ts`, `src/runtime/executionFactValidation.ts` |
| RuntimeState reducer, identities, statics, arrays, collections | `src/contracts/runtime.ts`, `src/runtime/state.ts`, `src/runtime/engine.ts`, `src/runtime/storage.ts` |
| ExecutionGraph + provenance | `src/contracts/executionGraph.ts`, `src/runtime/executionGraph.ts`, `src/instrumentation/provenance.ts`, `src/motion/semanticTransition.ts` (evidence → transition derivation) |
| History/checkpoints, seek, LIVE/HISTORY, Return to Live | `src/runtime/history.ts`, `src/runtime/seek.ts`, `src/playback/*`, `TimelineLens` |
| Partial recording | `RecordingStatus`, `CAPTURE_STOP`, `server/raw-trace-archive.mjs` |
| Debug semantics | `server/debug-manager.mjs`, `instrumentation/java/visualjava/DebugControl.java`, `src/debugger/{contracts,causality,exceptionCursor}.ts` |
| JDT language intelligence | `server/language-service.mjs`, `server/language/*`, `src/language/*` |
| Filesystem/projects/rename journal/drafts | `server/projects.mjs`, `server/project-paths.mjs`, `src/ide/{bridge,pathChanges,sourceBindings}.ts` |
| Commands + shortcuts | `src/ide/commands.ts`, `src/ide/shortcuts.ts`, `src/ide/contextMenus.ts`, `src/ide/fuzzy.ts` |
| Console truth / output archive | `server/output-archive.mjs`, `ExecutionSession.stdout/stderr`, `RuntimeState.console` |
| Exceptions | `server/exceptions.mjs`, `RuntimeExceptionFact` |

## 6. Replaceable presentation inventory

| Area | Location |
| --- | --- |
| Shell + layout | `src/ide/IdeWorkspace.tsx` (presentation parts), `src/ide/ide.css`, `src/app/App.tsx`, `src/app/styles.css`, `src/main.tsx` routing |
| World layout | `src/world/spatialLayout.ts`, `src/world/layout.ts`, `src/app/layoutForTrace.ts`, `src/examples/{curatedLayout,scopedLayout}.ts` |
| Presentation planner | `src/world/spatialPresentation.ts`, `src/world/{callStructure,connectorRouting,arrayGeometry,runtimeHeadings}.ts` |
| Renderer + primitives | `src/scene/**` |
| Navigation | `src/navigation/**` |
| Motion | `src/motion/flowPresentation.ts`, `src/scene/primitives/presentationMotion.ts` |
| UI panels | `src/ui/**`, `src/debugger/{DebugPanel,ErrorExplorer}.tsx`, `src/ide/{ProjectExplorer,WorkspacePicker,WorkspaceMenu,SymbolSearch,LaunchDialog,ProblemsPanel,TraceInspector}.tsx` |
| Tokens | `docs/visual-java-spec/DESIGN_TOKENS.json`, `src/theme/*` |

## 7. Largest gaps (priority order)
1. Shell composition: pane-based IDE versus full-bleed world with floating source, header mode bar and floating timeline.
2. Material/lighting/post: matte boxes versus luminous acrylic with reflections, rim light and restrained bloom.
3. Entity design: frame/object faces, chips, ports, typography scale (current text is roughly half the reference scale at hero framing).
4. Camera: pose/FOV/composition tokens and Focus presentation.
5. Stack geography: Phase 5 sibling X-columns versus the reference tower with a history deck.
6. Timeline: thin slider versus labelled glass time dock.
7. Forensic exception, return propagation and array-operation visuals.
8. Parallel products: Classic, Theater, `/examples` shell.

## 8. Risks
- Transmission/transparency overdraw on dense worlds: mitigated by tiered materials (emulated acrylic in INTERACTIVE), bounded detailed faces, instanced quiet volumes.
- Text legibility through glass: faces keep an opaque-tinted inner panel; text is never rendered behind transmission.
- Monaco under 3D transforms breaks hit-testing: the source panel stays a flat DOM overlay (documented deviation from the implied tilt).
- Golden/presentation tests tied to old layouts: regenerate presentation goldens deliberately; semantic goldens, graph digests and JVM facts must stay byte-identical.
- IdeWorkspace refactor risk: behavior covered by 27 Playwright specs and command/unit tests; refactor behind unchanged command host/operations contracts.
