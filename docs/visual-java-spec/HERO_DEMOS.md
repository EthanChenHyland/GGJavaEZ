# Hero Demos

## Demo 01 — Object Birth

```java
class Person {
    String name;
    int age;

    Person(String name) {
        this.name = name;
    }

    void setAge(int age) {
        this.age = age;
    }
}

public class Main {
    public static void main(String[] args) {
        int x = 5;
        int y = x * 2;
        Person p = new Person("Ethan");
        p.setAge(18);
    }
}
```

This is the flagship scene.

`main` forms first. `x` and `y` appear as local state. `new Person(...)` triggers object allocation in the heap. `p` becomes a visible reference from the stack to that object. The constructor creates a new frame with `this` visibly connected to the same heap object. `name` mutates. The constructor returns. `setAge` opens another frame, `this` connects again, and `age` changes from `0` to `18`. The frame resolves and collapses.

The entire execution remains scrub-able in both directions.

## Demo 02 — Loop Engine

```java
int total = 0;
for (int i = 0; i < 5; i++) {
    total += i;
}
```

The visual emphasis is rhythm and repetition. Each iteration becomes a distinct beat on the timeline. `i` and `total` animate in-place. Repeated execution should feel like a machine cycling, not like a table updating.

## Demo 03 — Recursion Descent

```java
static int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}
```

Each invocation adds spatial depth. The camera reveals a descending chain of frames. When the base case is reached, return values propagate back through the chain and frames resolve in reverse order.

The user should be able to freeze the scene midway and inspect every `n` value simultaneously.

## Demo 04 — Array Theater

Use a simple sorting algorithm. The array becomes a physical sequence of elements in a dedicated scene mode. Comparisons, swaps, and index movement are visible. The source line and runtime event remain synchronized.

The visualization must still be trace-driven. It is not a separate animation pretending to execute the code.

## Demo 05 — Exception Shockwave

```java
String s = null;
System.out.println(s.length());
```

The null reference should already be visible before the crash. When dereferenced, the failed connection is emphasized. The exception originates at the exact source event and propagates through active frames. If unhandled, the scene freezes into a diagnostic state with the failing path isolated.
