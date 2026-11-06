# Existing browser lifecycle workflows

The five original lifecycle scenarios exercise the current Shell, timeline, selection and Workspace status controls. Each opens the imported project and waits for its matching Monaco model. Cleanup only stops a live JVM owned by one of this suite's imported projects.

| Scenario | Evidence retained |
| --- | --- |
| Debug | Actual 35-second JVM pause, the six original step operations and methods, a history seek independent of the live pause, exact resumed stdout and a full recording from the same execution. |
| Scanner | Two one-second input waits, the blank first line, the exact Unicode second line, two recorded reads and exact captured stdout. |
| Java language service | A second project displaces the first. Retry through Workspace status recovers the first project, preserves the unsaved draft and disk bytes, and publishes the draft diagnostic. |
| Quick Open | Keyboard navigation selects the exact late path among 1,000 duplicate basenames. The source footer and Monaco content identify the selected file. |
| Repeated Run | Five saved edits produce distinct completed executions, exact stdout and captured field values. Native World selection and Focus show the field. The failed build has no raw events or executing-line highlight and labels the previous recording. Actual renderer counters and post-GC frontend heap samples accompany each run. |

The first launch stopped at browser page creation because the local Playwright video recorder dependency was missing. That run is archived under `.ggjavaez/qa/reference-exact/torture-lifecycle-successor/native-ffmpeg-missing/`. The subsequent run uses Playwright FFmpeg v1011 and retains video recording.

Exact source `a0aa04672c39fcbe30bb3eb53402ec13ecb3bd835e36eb21d3db3f335c4bdce9` passes all five cases in 134.803 seconds with zero failures, skips or flakes. Seven distinct completed JVM executions are identified in the evidence alongside the separate failed-build assertion. The archive under `.ggjavaez/qa/reference-exact/torture-lifecycle-successor/native/` contains the source inventory, browser report, five original PNGs, the Debug video and exact outcome JSONs. Root reviewed the JDT draft, the selected Quick Open path and the repaired world at original resolution.

The candidate and standard reference TypeScript checks pass. Default browser discovery lists 320 cases in 87 files. The renderer reports 89 calls, 33 geometries and 31 textures on all five Focus samples. Whole-frontend heap after explicit CDP GC rises from 89,752,156 B to 95,091,296 B. These are lifecycle observations. The independent Dense latency and isolated retention gates remain open.
