# Milestone 7 real Java QA projects

Each directory is a separate editable project. Import its Java files into the IDE, save, then use normal **Run**, **Visualize**, or **Debug**. All use `Main` as the entry point. These are real Java source files, with no hand-authored runtime traces.

| Directory | Expected result | Useful source stop |
| --- | --- | --- |
| `null` | Uncaught `NullPointerException`; `name` is null | Main.java:4 |
| `bounds` | Uncaught `ArrayIndexOutOfBoundsException`; index 5, length 3 | Main.java:5 |
| `divide` | Uncaught `ArithmeticException`; x 10, y 0 | Main.java:5 |
| `explicit` | Uncaught `IllegalArgumentException`, message `bad value` | Main.java:9 |
| `caught` | Exit 0; stdout `recovered`, then `continued` | Main.java:5 |
| `finally` | Exit 0; exact stdout sequence below | Main.java:20 |
| `nested` | Uncaught `NullPointerException`; Java stack b → a → main | Main.java:12 |
| `stepping` | Exit 0; stdout `18`; inspect person, this, parameters, fields and int array | Main.java:5 |

`finally` stdout, in order:

```text
normal try
normal finally
failing try
exceptional finally
recovered
continued
```

The normal-path finally is ordinary observed line execution. The exceptional finally executes the compiler catch-all handler before `fail` unwinds; the original ArithmeticException reaches the matching catch in main. No second explicit source throw should be invented for the compiler rethrow.

## Multi-file stepping

Import all three files in `stepping` together. Set a breakpoint at Main.java:5, Step Into Worker.update, Step Into Person.setAge, inspect `this` and `age`, then Step Out to Worker. Step Over crosses the project call on Worker.java:4. Step Into Worker.read exposes the array and index. Continue completes with `18`. A breakpoint on a blank line, such as Person.java:3, must remain visibly unverified without silently moving to a different source line.

## Deterministic cause limits

`causeHistory(trace, target, cursor)` uses an applied-event count and returns latest observations first. Selecting a node can seek its cursor and select its runtime identity using the canonical Selection type. The module never changes camera state.

Earlier writes to the same slot are **history**, not dependencies. Proven dependencies are limited to explicit recorded return destinations, indexed-read destinations, array-write origins, and stable reference target identities. Parameter and `this` bindings prove the observed entry value, not its caller argument origin. Unknown return destinations, arbitrary expression operands, failed dereference operands, and library internals remain unknown. An observed allocation is the first safe identity observation, which may follow the actual allocation instruction.

For example, a nearby `RETURN_VALUE` with destination null followed by a null declaration does **not** prove that the declaration received that return. Null fixture history establishes `name = null`; the real JVM exception and source identify the subsequent failure separately.
