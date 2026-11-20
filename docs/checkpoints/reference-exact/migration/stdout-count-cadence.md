# World stdout count cadence

The 3D stdout port limits count publications to one every 100 ms while the timeline moves. The projected scene still carries the exact line count at each cursor. When the cursor settles, the label publishes the latest count. Recording changes reset the label and cancel outstanding work.

The native comparison uses two fresh JVM sessions, each with the same 64 numbered output lines and actual timeline pointer input. Both runs observe all 64 projected counts. The baseline publishes 63 visible changes after the first observation, with a 33.2 ms minimum sampled gap. The candidate publishes 20, and its final label reaches 64 within 83.4 ms of the final scene observation. Display-frame sampling reports a 99.9 ms minimum interval. A separate instrumented run records 20 count commits at least 100.7 ms apart. An earlier fixture failed to establish a visible label for measurement. Its trace and the raw measurements are retained under `.ggjavaez/qa/reference-exact/stdout-publication-prototype/`.

Source `1859444dea60bf4bb93619d6481ed6ccaa74fa8c3d676d22bec32006dfaadf9d` passes all eight source checks in 305.656 seconds, with 2,281 default unit passes and 70 opt-in skips. The main production entry measures 71,732 B gzip. The visible stdout and stdin preview requirements remain open.
