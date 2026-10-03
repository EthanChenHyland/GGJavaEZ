import { describe, expect, test } from 'vitest';
import { invocationTree, recordProgram } from './recorderHarness.mjs';

/** Phase 3 regression: true constructor entry records superclass and this chains as callees.
 * The pre-Phase-3 sibling characterization is intentionally replaced by the required nesting.
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

  test('superclass constructor is entered beneath its derived constructor', async () => {
    const tree = invocationTree((await recorded()).trace);
    const base = tree.find((frame) => frame.method === 'Main$Base.<init>');
    const derived = tree.find((frame) => frame.method === 'Main$Derived.<init>');
    expect(base.caller).toBe('Main$Derived.<init>');
    expect(derived.caller).toBe('Main.main');
    expect(derived.seq).toBeLessThan(base.seq);
  }, 120000);

  test('this(...) delegation is nested beneath the calling constructor', async () => {
    const tree = invocationTree((await recorded()).trace).filter((frame) => frame.method === 'Main$Delegating.<init>');
    expect(tree).toHaveLength(2);
    expect(tree.map((frame) => frame.caller)).toEqual(['Main.main', 'Main$Delegating.<init>']);
  }, 120000);

  test('raw Recorder stream preserves actual constructor caller identities', async () => {
    const enters = (await recorded()).rawEvents.filter((event) => event.type === 'enter');
    const main = enters.find((event) => event.methodName === 'main');
    const base = enters.find((event) => event.className === 'Main$Base');
    const derived = enters.find((event) => event.className === 'Main$Derived');
    expect(base.callerFrameId).toBe(derived.frameId);
    expect(derived.callerFrameId).toBe(main.frameId);
  }, 120000);

  test('VERIFIED (Phase 3, R5.5): Base.<init> is nested under Derived.<init>', async () => {
    const tree = invocationTree((await recorded()).trace);
    const base = tree.find((frame) => frame.method === 'Main$Base.<init>');
    const derived = tree.find((frame) => frame.method === 'Main$Derived.<init>');
    expect(base.caller).toBe('Main$Derived.<init>');
    expect(derived.seq).toBeLessThan(base.seq);
  }, 120000);

  test('VERIFIED (Phase 3, R5.5): the delegated Delegating(int) constructor is nested under Delegating()', async () => {
    const [outer, inner] = invocationTree((await recorded()).trace).filter((frame) => frame.method === 'Main$Delegating.<init>');
    expect(outer.caller).toBe('Main.main');
    expect(inner.caller).toBe('Main$Delegating.<init>');
  }, 120000);
});
