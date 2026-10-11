# Acrylic edge hierarchy — 2026-10-10

The shared Interactive acrylic shader restricts Fresnel ink to a 0.10–0.35
world-unit band near cuboid edges. The second-nearest surface plane supplies
that band; the rounded-box vertex expansion supplies physical instance
dimensions and positions. Broad grazing-angle surfaces retain lit/reflected
interiors instead of receiving the full emissive rim contribution. The program
cache identity changes with the shader. No extra draw batch or per-body material
is introduced.

The body remains transparent at 0.78 with depth writes, roughness 0.22 and
emissive intensity 0.10. Frozen light/environment values, opaque Basic face and
chip plates, canonical dimensions, bevel/pick envelopes and Cinematic physical
transmission remain unchanged. The geometry patch composes before the vertex
surface captures; bloom mask variants retain the same shader hook.

Build and lint passed. Eight existing material, rounded geometry, mask and
cinematic tests passed across four files in 954 ms. All six hardware/graphics
browser checks passed in 17.0 seconds, including actual context recovery, demand
rendering and tier compilation/retained forensic dimensions. Five real-JVM
diagnostic states (Hero, object inspection, array operation, Debug and Exception)
passed in 41.0 seconds, each at 1728×1117 plus its native reference size.

All five native captures were inspected at original size against the unchanged
reference family. Broad caps are more restrained and depth is visible. Bright
cyan route crossings, label/neighbor overlap, tray stacking occlusion and overall
reference fidelity remain open. Ten diagnostic captures are not a complete
96-capture convergence run or an approval. The first diagnostic command's
anchored title filter matched no tests; the corrected filter ran the five stated
cases. No skipped/missing test is counted as a passing case.
