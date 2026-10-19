# Native Java project workflows — 2026-10-19

All five original `e2e/java-project-m9.spec.ts` cases move to `e2e/reference/java-project-workflows.spec.ts`. The real bridge, fixture imports (including wrapper binaries), JDT requests, compiler/build outputs, JVM execution, source manifests/raw traces and breakpoints remain authoritative. Serial mode and180-second case limits remain unchanged. No case is retired or skipped.

| Original case | Preserved current-Shell successor |
| --- | --- |
| Plain Java | Plain project model, successful one-step build, actual captured Run and entry-paused Debug with Source highlighting. |
| Maven people | Source roots; completion/member completion/hover/signature/definition/references/organize imports; real F12 and field rename affecting two files; Save All exact server contents; cross-package output/manifest/raw events; historical Person source; actual other-package breakpoint and Step Out. |
| Gradle | Imported wrapper, actual Gradle model/source roots, Gson semantic completion, successful wrapper build, Run and nonempty capture. |
| Multiple mains | Actual discovered target, saved selection and exact M9_TARGET_ARG execution payload; matching session/main/output/exit/captured class. |
| Broken POM | Actual malformed XML, failed build with useful Maven/XML output and visible Problems. |

UI access changes use Quick Open rather than an assumed open Explorer, current World/TimeDock selectors and the current route. Reopening the actual Launch dialog proves the saved main selection; the old persistent main-class combobox is gone. Source URI observation verifies the requested file after Quick Open. Page errors are additionally rejected; passed sessions carry actual response IDs in reporter annotations. No direct application state setter replaces an interaction.

**5/5 pass, zero failed/skipped/flaky,60.82seconds**, with **six distinct actual JVM session IDs** (`browser-java-project-workflows.json/log`, `java-project-workflows-evidence.json`). Strict browser typecheck passes. Production src/server/scripts/dependencies/fixtures and all unit files compare unchanged with pushedbd30ecd; its2103passed/70opt-in-skip full suite and build remain the production baseline, not a newly rerun full suite. One fresh actual selected-main Launch screenshot is archived with its hash and root original-resolution review in `java-project-workflows-captures/`. No full127-case, formal80-session, populated World visual or performance approval is inferred. Whole A–G acceptance remains open.
