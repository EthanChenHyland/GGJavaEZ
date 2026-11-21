# Reference Convergence Pass 3

Pass 3 starts at the published Pass 2 commit `bae53e1534b2209e3cb6aaf49e26efdf0fb83595`. The shared renderer consumes the same presentation cut and canonical anchors. The original audit retains its 37/100 full-suite score. [Pass 2 hierarchy](PASS-2-HIERARCHY.md) · [Original references](AUDIT.md#reference-inventory)

## Acrylic and lighting

- The rounded body shader locates the bevel in local world units and widens its transition within a bounded screen-derivative window. Its face-normal, height and grazing-angle terms give top surfaces, sides, and corners distinct responses. Passive edges come from the surface. Current, selected, focused and changed bodies retain a restrained semantic edge. The older unwind frames keep their structural material.
- The information face retains an opaque, dark base at full presentation opacity, with a quiet top-to-bottom wash. Chips sit on the same geometry and use a quieter rim. The SDF glyphs remain at their existing depth offset and read independently of the physical body material. All forward, reverse and selection paths use the same face and port positions.
- Both body tiers use zero metalness. Interactive uses a standard material at .36 roughness and .87 body opacity before presentation dimming. Cinematic uses .29 roughness and adds .30 transmission, .85 thickness and 1.47 IOR to substantial bodies. Dimmed context omits transmission. Reflection copies also omit transmission. All styles share the same rounded geometry and use bounded material bands. Neutral instance colors carry active, resting, quiet and historical emphasis within each band.
- A cached studio environment provides broad rectangular highlights. The cool key gives the top and exposed side shape. Hemisphere fill protects the dark side, with dim violet rim and lower bounce. The dark indigo field and existing world-space haze provide separation at distance. Grounding comes from the floor response and contact silhouettes.

## Floor and effects

- A procedural world-space floor mixes a neutral grid and a soft pool of studio light. Fine lines fade first, with a faint coarse grid at a greater distance. The grid fades at grazing angles and moves with perspective. The stage sits just below represented geometry and limits extra clearance from distant reserved positions. Both tiers use a single instanced draw for up to 40 soft footprints derived from actual supported bodies and cells. Height attenuates contact, and near-foot sheen carries weak semantic color. The stage and contacts require zero Interactive floor targets.
- Cinematic adds one 384×384 planar color capture with depth. The reflected camera draws opted-in body batches. Glyphs, connectors, chips, overlays and floor passes are excluded. Height attenuation and a nine-tap filter keep the reflection close, faint and soft. The pass restores the shared camera/render state and removes its target and cached optical variants on retirement.
- Bloom follows the existing emitter roles, with narrowed halo taps, coverage-aware protection and no persistent passive outline input. Cinematic adds half-resolution GTAO. It darkens contact neighborhoods with a capped correction and reuses the full-resolution glyph protection mask. A linear-space SMAA resolve precedes color-space conversion and selective tone mapping. Source, Inspector and timeline remain DOM surfaces.
- The shared composer can use byte attachments with SMAA when float color attachments are unavailable. The directional and hemisphere rig still lights those bodies when the float environment capture is unavailable. Cinematic requires the existing GPU capability gate. A failed Cinematic effect retires its pass and retries through Interactive. A failing composer can render directly, and a failed floor capture leaves the procedural floor intact. Context loss retires the per-context pass owners and restores the scene in the existing canvas.

## Evidence and measurements

Generated local evidence is under `test-results/reference-pass3/`. The driver used actual Java recordings on JDK 26 with a UTF-8 locale and Chrome on the same Apple Silicon machine. `pass2-quality/` replays the same programs and paired quality changes from the published Pass 2 source. `final-polish/` contains the final Pass 3 images and JSON. `comparisons/` contains matched full-resolution strips with Pass 2 on the left. The native Person triptych starts with the supplied 1672×941 reference. The eight quality strips compare Interactive and Cinematic on their respective revisions with identical camera, cursor and selection within each pair.

| State | Capture stems | Observed result |
| --- | --- | --- |
| Hero | `person-home-1672x941`, `person-home-760x900`, `person-home-quality-*` | Top and side surfaces separate from the face. The current `this` binding and age `18` survive, and the 760 px Source rail retains the mapped site. |
| Object Focus | `person-focus`, `person-focus-quality-*` | The selected surface retains legible fields and a polished edge. The nearly frontal pose limits depth compared with the reference close-up. |
| Recursion and return | `series-deepest-follow`, `series-proven-return` | Top planes separate the frames in the existing lineage. The exact return `0` remains prominent beside the quieter heading. |
| Array | `array-write`, `array-write-quality-*` | The five values and indices are legible. The grounded row still highlights the real write to index 1. Cinematic's reflected tray carries body silhouettes. |
| Exception and I/O | `exception-propagation`, `exception-unwind`, `io-input`, `io-stdout`, `io-stderr` | The throw and propagated states retain their evidence. Context recedes around the failing frame, and terminal surfaces share the same material family. Long paths and abbreviated endpoint text remain. |
| Completed and class state | `person-completed`, `class-state-home` | Returned frames remain spatial and quieter than final values. The class shelf and its data stay in place. |
| Zoom and Dense Home | `dense-*-from-home`, `dense-home`, `dense-home-quality-*` | Quieter bodies and the restrained floor improve separation. Peripheral clips and sparse distant silhouettes still limit navigation context. |

The desaturated Hero, array and return pairs keep the dimensional top planes and primary event legible. In the native face-color check, the four unobstructed frame and object face/chip samples matched exactly between tiers. The evidence is from on-screen color and projection, with no timed viewer study. [Affected-state scores](VISUAL-SCORECARD.md#pass-3-rescore)

### Performance sample

These are settled development-browser samples at DPR 1, comparing the identical programs and paired commands. Draw calls and triangle counts include auxiliary passes. Native ANGLE Metal GPU timer medians use the available samples from the last eight observations for the active tier. The sample gives the direction of change on this machine.

| State and tier | Draw calls | GPU time, ms | Textures | Geometries |
| --- | ---: | ---: | ---: | ---: |
| Hero Interactive | 93 → 56 | 2.97 → 1.49 | 30 → 18 | 33 → 31 |
| Hero Cinematic | 135 → 68 | 11.47 → 4.93 | 44 → 26 | 35 → 31 |
| Focus Interactive | 107 → 63 | 2.70 → 1.53 | 35 → 20 | 34 → 31 |
| Focus Cinematic | 154 → 76 | 16.81 → 6.42 | 46 → 27 | 36 → 31 |
| Array Interactive | 76 → 47 | 2.99 → 1.64 | 30 → 18 | 32 → 31 |
| Array Cinematic | 111 → 58 | 10.75 → 4.40 | 44 → 26 | 34 → 31 |
| Dense Home Interactive | 97 → 56 | 3.96 → 2.04 | 30 → 18 | 33 → 29 |
| Dense Home Cinematic | 144 → 71 | 10.26 → 5.46 | 44 → 26 | 35 → 29 |

Across ten Person Home commands, median first composition moved **114.6 → 97.0 ms** and settle **1,037 → 1,026 ms**. The one Focus command was **166.2 → 114.7 ms** to first composition and **1,000 → 999 ms** to settle. The first Hero Cinematic change settled **546.5 → 576.1 ms**, the later Focus Cinematic change **260.0 → 271.9 ms**, and the Dense Home Cinematic change **528.0 → 268.1 ms**. Settled draw counts were identical on the earlier Pass 3 take, where Person Home took 158.2 ms median to first composition and one Focus Cinematic switch took 559.6 ms to settle. Browser command times vary across runs. Sustained latency and its causes require dedicated qualification.

The composer plus floor owns **8** targets in HDR Interactive and **12** in Cinematic, compared with **18** and **27**, respectively, from the Pass 2 allocation paths. These counts exclude the existing Focus silhouette, environment capture and Three-owned transmission. A return to Interactive retires the Cinematic AO and floor targets. Hero textures after the transition were **19**, compared with **39** after the same Pass 2 transition. The byte-buffer fallback owns five composer targets. The floor batches and their attachment textures are currently scoped to one renderer, with shader programs cached according to existing Three lifetimes.

The rendered scene used **21 → 19** unique visible materials in Hero, **24 → 21** in Focus, **17 → 16** in the array and **22 → 18** in Dense Home, at both tiers. Pass 2 material counts came from a second replay with the same read-only material counter added to the archived QA observer. The timing and draw measurements use the unmodified Pass 2 build. The material count excludes internal masks and effect materials. Their disposal is covered by the post and floor lifetime tests.

### Qualification

- Application typecheck, reference typecheck, ESLint and the production build passed. The build keeps its existing large-chunk advisory. The presentation and golden suite passed 1,958 tests with seven skips.
- All 22 selected actual-JVM reference cases passed at 1440×900 and 760×900. The 18 browser regressions include manual camera takeover at all five sizes, exact forward and reverse array values, array picking, Focus context, connector hover, the environment lifecycle, and tier gating. The eight final capture scenarios and both FAR reference cases passed again after the last floor polish.
- Fifteen graphics and readability cases passed, including actual WebGL context recovery on the same canvas, operation without WebGL, palette continuity on hardware, demand rendering and exception ink at all five viewports. The byte-buffer fallback retest verifies that the app reaches readiness without the float environment. Four native same-state quality pairs retained the recording, cursor, selection and camera through both switches.

## Remaining work and execution boundary

The supplied close-up gives object sides and contact more screen area than the matched default Focus pose. Dense edges clip the inherited composition, its smallest FAR proxies can be hard to find, and long forensic routes still cross unrelated world context. Pass 4 should develop Focus, semantic zoom and forensic motion using the same recorded states and preserve the face and depth contrast. Sustained frame times, multiple GPUs and repeated lifecycle memory measurements remain separate qualification work.

The renderer consumes the same normalized events through the scene and presentation model. Java execution remains local and unsandboxed. A future hosted provider can keep this boundary by owning isolation and emitting the same normalized event contract.
