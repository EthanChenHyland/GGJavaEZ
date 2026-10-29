# Remaining older browser cases — 2026-10-26

Default inventory at f262899 discovers 294 cases in 81 files. Of these, 202 belong to the current reference/camera/playback suite; that classification is not a passing whole-suite claim. The two original command receipt cases now pass in the separate 17-case integration gate. Seventy-four older cases remain for individual migration/disposition. Formal 80-case reference matrix and opt-in suites remain separate.

| Original file | Cases | Status |
| --- | ---: | --- |
| `commands-v12-p4.spec.ts` | 2 | [Migrated; both preserved cases pass](command-receipts.md) |
| `coverage-v12-p4.spec.ts` | 8 | [Migrated; exact fixture outputs with explicit presentation dispositions](coverage-browser.md) |
| `debugger-errors.spec.ts` | 11 | OPEN |
| `ide-recording-handoff.spec.ts` | 1 | [Migrated with requirement 1.21 Console disposition and prior-label fix](recording-handoff.md) |
| `ide.spec.ts` | 10 | OPEN |
| `incremental-v12.spec.ts` | 2 | [Migrated; unchanged workload and transport proof; wider Console latency failure retained](incremental-browser.md) |
| `m11-persistence.spec.ts` | 2 | [Migrated; original Java, history/replay and editing preserved](persistence-browser.md) |
| `observer-saturation-v12.spec.ts` | 2 | [Migrated; exact saturation/thread corpus and captured prefix retained](observer-browser.md) |
| `product-audit-m11_5.spec.ts` | 4 | OPEN |
| `provenance-v12.spec.ts` | 1 | [Migrated; exact constructor proof retained](provenance-browser.md) |
| `real-visualize.spec.ts` | 5 | OPEN |
| `recursion.spec.ts` | 4 | OPEN |
| `spatial-io-v12-p5.spec.ts` | 1 | OPEN |
| `spatial-shell-v12-p5.spec.ts` | 6 | OPEN |
| `torture-details-v12-p5_5.spec.ts` | 4 | OPEN |
| `torture-lifecycle-v12-p5_5.spec.ts` | 5 | OPEN |
| `torture-motion-v12-p5_5.spec.ts` | 1 | OPEN |
| `torture-v12-p5_5.spec.ts` | 9 | OPEN |
| `unified-m10.spec.ts` | 9 | OPEN |
| `workspace-m8.spec.ts` | 5 | OPEN |

No original case is removed or marked skipped by this ledger. Saved discovery list and per-file counts are in the ignored QA evidence directory. Each later disposition must link its preserved assertions, exact source and actual executed result.
