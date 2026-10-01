import { describe, expect, test } from 'vitest';
import { invocationTree, recordProgram } from './recorderHarness.mjs';

/**
 * CHARACTERIZATION — audit §4 "Constructors" (reproduced on JDK 25).
 *
 * OfflineTransformer injects a constructor's `enter` *after* its super(...)/this(...) call.
 * As a result, a project superclass or delegated constructor is recorded as a sibling of the
 * subclass constructor. It is entered before the subclass constructor and has the same caller;
 * it should be the subclass constructor's callee.
 *
 * "CURRENT" pins that behaviour. "DESIRED (Phase 3, tasks 3.1/3.5, R5.5)" is `test.fails`.
 */
const source = `public class Main {
  static class Base {
    int a;
    Base(int a) { this.a = a; }
  }
  static class Derived extends Base {
    int b;
    Derived(int x) { super(x + 1); this.b = x; }
  }
  static class Delegating {
    int v;
    Delegating() { this(7); }
    Delegating(int v) { this.v = v; }
  }
  public static void main(String[] args) {
    Derived d = new Derived(4);
    Delegating g = new Delegating();
    System.out.println("DONE " + d.a + d.b + g.v);
  }
}`;
let recording;
const recorded = () => (recording ??= recordProgram({ 'Main.java': source }));

describe('superclass and this(...) constructor nesting', () => {
  test('the program itself completes normally (no budget involved)', async () => {
    const result = await recorded();
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('DONE 547\n');
  }, 120000);

  test('CURRENT (bug, fixed in Phase 3): superclass constructor is recorded as a preceding sibling under main', async () => {
    const tree = invocationTree((await recorded()).trace);
    const base = tree.find((frame) => frame.method === 'Main$Base.<init>');
    const derived = tree.find((frame) => frame.method === 'Main$Derived.<init>');
    expect(base.caller).toBe('Main.main');
    expect(derived.caller).toBe('Main.main');
    expect(base.seq).toBeLessThan(derived.seq);
  }, 120000);

  test('CURRENT (bug, fixed in Phase 3): this(...) delegation is recorded as a preceding sibling under main', async () => {
    const tree = invocationTree((await recorded()).trace).filter((frame) => frame.method === 'Main$Delegating.<init>');
    expect(tree).toHaveLength(2);
    expect(tree.map((frame) => frame.caller)).toEqual(['Main.main', 'Main.main']);
  }, 120000);

  test('CURRENT: the raw Recorder stream shows the same caller for both constructors', async () => {
    const enters = (await recorded()).rawEvents.filter((event) => event.type === 'enter');
    const main = enters.find((event) => event.methodName === 'main');
    const base = enters.find((event) => event.className === 'Main$Base');
    const derived = enters.find((event) => event.className === 'Main$Derived');
    expect(base.callerFrameId).toBe(main.frameId);
    expect(derived.callerFrameId).toBe(main.frameId);
  }, 120000);

  test.fails('DESIRED (Phase 3, R5.5): Base.<init> is nested under Derived.<init>', async () => {
    const tree = invocationTree((await recorded()).trace);
    const base = tree.find((frame) => frame.method === 'Main$Base.<init>');
    const derived = tree.find((frame) => frame.method === 'Main$Derived.<init>');
    expect(base.caller).toBe('Main$Derived.<init>');
    expect(derived.seq).toBeLessThan(base.seq);
  }, 120000);

  test.fails('DESIRED (Phase 3, R5.5): the delegated Delegating(int) constructor is nested under Delegating()', async () => {
    const [outer, inner] = invocationTree((await recorded()).trace).filter((frame) => frame.method === 'Main$Delegating.<init>');
    expect(outer.caller).toBe('Main.main');
    expect(inner.caller).toBe('Main$Delegating.<init>');
  }, 120000);
});
