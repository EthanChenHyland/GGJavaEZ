# Phase 5 hands-on product audit

Native Codex browser controls exercised a newly created, isolated managed project, **Spatial2 Hands-on Audit**, rather than changing a user project. One existing owned Vite/bridge pair stayed running. The audit used real Monaco saves, canonical commands, real application JVMs and actual process stdin. No synthetic runtime snapshot was substituted for these UI checks.

## Editing and project behavior

Created the project through Command Palette; Explorer created `audit/`, folder context menu created `Main.java` with correct `package audit;`. File context menu renamed it to `Program.java`; the real JDT public-class filename diagnostic appeared. Editor-tab context menu renamed it back; the seven tab actions were exposed. Quick Open's `mnjava` fuzzy query opened the actual Java file. Palette launched actual Debug. Native paste into the focused Monaco EditContext and Save produced the source below; a zero-height DOM editor target was not treated as a successful paste.

```java
package audit;
import java.util.*;
public class Main {
  static class Box {
    int value;
    Box(int n) { value = n; }
    int add(int n) { value += n; return value; }
  }
  static int dive(int n) { return n == 0 ? 1 : n * dive(n - 1); }
  public static void main(String[] args) {
    System.out.println("INPUT");
    int amount = new Scanner(System.in).nextInt();
    Box box = new Box(3);
    int[] values = {2, 1};
    int held = values[0]; values[0] = values[1]; values[1] = held;
    Box[] aliases = {box, box};
    ArrayList<Box> list = new ArrayList<>(); list.add(box);
    int result = box.add(amount);
    try { System.out.println(values[9]); }
    catch (ArrayIndexOutOfBoundsException ex) { System.out.println("CAUGHT"); }
    System.out.println("RESULT " + result + " RECURSION " + dive(3)
      + " ARRAY " + values[0] + "," + values[1]
      + " ALIAS " + (aliases[0] == aliases[1]));
    System.err.println("AUDIT STDERR");
    if (amount < 0) throw new IllegalArgumentException("audit negative input");
  }
}
```

This is formatted for the report; the actual saved compact source uses 20 lines, so debugger line numbers below refer to that saved file.

## Run, inspection and navigation

Actual stdin `4` completes with **223 normalized events**, exit success, stdout `INPUT`, `CAUGHT`, `RESULT 7 RECURSION 6 ARRAY 1,2 ALIAS true`, and stderr `AUDIT STDERR`. The selected actual `Box #6` shows `value int 7`; Inspector references include the caller `box`, constructor/add `this`, both reference-array cells and the collection entry.

Used selection, Focus, Trace, Home, orbit, dolly, zoom out/in and playback. Camera drag visibly leaves the camera in Free Explore while the timeline continues. Right-button pan has separate passing Playwright coverage; it is not claimed as a native left-drag action. Exact marker clicks verified 17 backward/forward time-travel states, recorded in `manual/sequence.json`; Return to Live restored 223/223. Scrub snaps without playing intervening transfer animations. Free Explore and selected reference stay intact through the sequence; these captures are time-travel/manual-override evidence, not a demonstration of scripted guided choreography.

## Debug and failure lifecycle

Set actual saved-source gutter breakpoint at line 9. Debug entry pauses at line 7; Step Over reaches 8. Queue `-1` in canonical Console, Continue reaches line 9, Step Into enters constructor line 4 at event 39, Step Out returns to caller line 10 at event 60. Continue encounters the caught array-bounds exception at line 14/event 128; Error Explorer identifies the real exception. Next Continue encounters uncaught `IllegalArgumentException` at line 17/event 229. Final Continue leaves **FAILED 238 events** with retained unwind history rather than deleting the world.

Adding `BROKEN` to line 20, Save, Run yields a real **BUILD FAILED** with compiler/JDT diagnostics and the prior 238-event world preserved. Restoring valid Java, Save, Run with stdin `4` returns to completed 223. Across the audit there were **four successful application launches** (three Run, one Debug) and one deliberately failed compile, not five launched application JVMs.

Actual partial-recording/process-continuation and dense-world behavior were separately exercised by the strict accepted browser/JVM suites; final originals and sampled motion were inspected. The audit did not secretly rerun another dense Java workload to obtain pixels.

## Friction and bounds

Focus geometry, whole first Inspector row, attached endpoints and completed-world persistence are verified by final screenshots and the focused suites. An existing single-current-project JDT limitation appeared after automated QA switched the backend workspace: Retry alone returned 409. Switching through another existing project and back reopened the audit language workspace without launching that other project's Java; a final audit Run produced the clean **COMPLETED / JDT ready** hero. Phase 5.5 should make this multi-workspace/retry recovery clearer. No backend language-service redesign was inserted into this presentation phase.

Final evidence: `manual/final-focus-1440x900.png`; breakpoint, constructor, caught/uncaught and failed-build screenshots; 17 exact sequence captures. Source remains in the isolated managed audit project, outside the Git specification/fixture trees.
