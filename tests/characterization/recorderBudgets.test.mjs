import { describe, expect, test } from 'vitest';
import { recordProgram } from './recorderHarness.mjs';

/**
 * CHARACTERIZATION — audit X1/X2 (Recorder budgets terminate the user's JVM).
 *
 * Each "CURRENT" test pins today's behaviour: on any capture budget the Recorder calls
 * Runtime.halt(86), so the program never reaches its own final output.
 * Each "DESIRED (Phase 1, task 1.1)" test is `test.fails`: it asserts the behaviour required
 * by R1.1/R1.2/INV-2 (program completes; capture saturates). It is expected to fail today.
 * When Phase 1 lands, the DESIRED tests will start passing, so vitest will report them as
 * unexpected passes. At that point, convert them to ordinary tests and delete the CURRENT tests.
 * Limits are the unmodified production defaults returned by prepareInstrumented.
 */
const programs = {
  objects: `public class Main {
  static class Item { int id; Item(int id) { this.id = id; } }
  public static void main(String[] args) {
    int total = 0;
    for (int i = 0; i < 300; i++) { Item item = new Item(i); total = total + item.id; }
    System.out.println("DONE " + total);
  }
}`,
  events: `public class Main {
  public static void main(String[] args) {
    long sum = 0;
    for (int i = 0; i < 20000; i++) { int square = i * i; sum = sum + square; }
    System.out.println("DONE " + sum);
  }
}`,
  frames: `public class Main {
  static int descend(int depth) { if (depth == 0) return 0; return 1 + descend(depth - 1); }
  public static void main(String[] args) {
    System.out.println("DONE " + descend(200));
  }
}`,
  bytes: `public class Main {
  public static void main(String[] args) {
    String block = "x".repeat(100_000);
    for (int i = 0; i < 100; i++) System.out.print(block);
    System.out.println();
    System.out.println("DONE");
  }
}`,
};
const reasons = { objects: 'objects', events: 'events', frames: 'live frames', bytes: 'bytes' };
const runs = new Map();
const run = (name) => {
  if (!runs.has(name)) runs.set(name, recordProgram({ 'Main.java': programs[name] }));
  return runs.get(name);
};

describe.each(Object.keys(programs))('Recorder %s budget', (name) => {
  test(`CURRENT (bug X1/X2, fixed in Phase 1): the ${name} budget halts the JVM with exit 86 before the program finishes`, async () => {
    const result = await run(name);
    expect(result.limits).toEqual({ rawEventLimit: 20000, rawByteLimit: 8 * 1024 * 1024 });
    expect(result.code).toBe(86);
    expect(result.stderr).toContain(`[VisualJava] trace limit exceeded: ${reasons[name]}`);
    expect(result.stdout).not.toContain('DONE');
    expect(result.status).toBe('limit_exceeded');
    // The recorded prefix is still a valid, replayable aborted world.
    expect(result.trace.events.at(-1)).toMatchObject({ type: 'PROGRAM_ABORT', reason: 'limit_exceeded' });
  }, 120000);

  test.fails(`DESIRED (Phase 1, task 1.1 / R1.1–1.2 / INV-2): the ${name} budget saturates capture and the program completes`, async () => {
    const result = await run(name);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('DONE');
    expect(result.rawEvents.some((event) => event.type === 'capture_saturated' || event.t === 'saturated')).toBe(true);
  }, 120000);
});
