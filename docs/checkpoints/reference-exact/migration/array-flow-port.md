# Reference array Flow endpoints

A captured reference cell now attaches supported Flows at its existing reference chip port. The same point serves its current reference connector and rendered marker. The cell's canonical anchor and center port still describe its geometry, and a captured scalar still uses the center port.

At desktop and narrow widths the `[6500]` baseline has three Flow markers on the caption and a fourth marker at the chip edge. The paired candidate keeps the same camera, cell, glyph bounds, cursor and four curve IDs. Its three Flow endpoints share the reference port, leaving one marker clear of the text by 36.7 px at 1440 × 900 and 30.1 px at 760 × 900. Root reviewed the narrow original at full size. Two baseline and two candidate native cases supply the paired observations.

Four exact attachment assertions fail before the resolver correction. All 50 focused tests then pass, including the linear recorded-cell traversal, unavailable values, reserved cell coordinates and shared reference chip geometry. The browser regression also checks the actual mounted port instances as well as the Flow points.

Source `94420b2079439dc064ca07e6434a8a7c4bd1ceffdb6a312dbea7d2efdf7a3294` passes all 12 integrated cases in 117.589 seconds with zero skips, failures or flakes. Ten cases exercise Focus on the virtualized cell across all five viewports and both motion settings. Two cases exercise native hover on static and array connectors. Paired observations, exact sources and captures are under `.ggjavaez/qa/reference-exact/array-flow-port-prototype/`.

The first default run identifies one old center-port assertion for a sparse reference cell at index 750,000. That assertion now checks the actual reference inset, while the adjacent sparse scalar case continues to require the center port. The final source `e492d14465ffb7a14946a94cc5c2141d465dc49355492c371b0ad7128a4c2cea` differs from the integrated browser source only in that unit test. It passes all eight source checks in 290.319 seconds with 2,281 default passes and 70 explicit opt-in skips. Main-entry gzip is 71,732 B. The 12 actual JVM IDs and 14 original integrated captures are indexed with hashes.
