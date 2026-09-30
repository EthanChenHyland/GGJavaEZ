# Product audit v11.5 Java corpus

Three fresh, independent Java 17 projects. They have no shared Java sources and require no Visual Java contract or UI changes. Gson `2.13.2` is the dependency version already present in the local Maven and Gradle caches. Outputs below assume the specified input and are independent of locale, wall clock, and map iteration order.

| Requirement | Fixture source | Evidence / expected behavior |
| --- | --- | --- |
| A — Maven project | `banking-maven/pom.xml` | Standard Maven Java 17 layout. |
| B — banking across classes | `banking-maven/src/main/java/audit/bank/{Main,Account,LedgerService,Receipt}.java` | Main calls service, account mutates, receipt records result. |
| C — stdin | `banking-maven/.../Main.java` | Reads one UTF-8 line: `Mira 25 7`. |
| D — deterministic stdout | `banking-maven/.../Main.java` | `BALANCE 118`, then the JSON line shown below. |
| E — cached Gson | Both build files and both `Main.java` files | `com.google.code.gson:gson:2.13.2` serializes ordered maps/lists. |
| F — Gradle project | `dispatch-gradle/{settings.gradle,build.gradle}` | Java 17 application with `audit.dispatch.Main`. |
| G — multiple packages | `dispatch-gradle/src/main/java/audit/dispatch/{model,service}` | Model and service packages consumed by main. |
| H — interface and inheritance | `dispatch-gradle/.../model/{Delivery,AbstractDelivery,ParcelDelivery,ExpressDelivery}.java` | Concrete deliveries extend a base class implementing an interface. |
| I — dynamic dispatch and collection | `dispatch-gradle/.../{Main.java,service/DispatchService.java}` | `List<Delivery>` invokes overridden `charge()` and `kind()`; total is 28. |
| J — plain Java project | `graph-stress-plain/*.java` | No build file, package, or third-party library. |
| K — large graph and collection shapes | `graph-stress-plain/{GraphBuilder,Graph,Node}.java` | 128 linked nodes, `Node[]`, `HashMap`, and `ArrayList`; each node has `next` and `skip` edges. |
| L — deep calls and non-factorial recursion | `graph-stress-plain/{StageOne,StageTwo,StageThree,StageFour,StageFive,GraphMetrics}.java` | Five distinct class frames per iteration; 16 linked-node recursive steps sum to 120. |
| M — caught cross-frame exception and bounded event load | `graph-stress-plain/{Main,StageOne,StageFive}.java` | StageFive throws once through four caller classes; StageOne catches it. Exactly 320 loop iterations, intended to produce several thousand trace events without an unbounded run. |

## Run instructions for the lead QA pass

`banking-maven`: from this corpus directory, build with Maven, then run `audit.bank.Main` with the Maven output classes and cached Gson jar on the classpath. Feed `Mira 25 7\n` on stdin:

```sh
mvn -o -q -f banking-maven/pom.xml compile
printf 'Mira 25 7\n' | java -cp "banking-maven/target/classes:$HOME/.m2/repository/com/google/code/gson/gson/2.13.2/gson-2.13.2.jar" audit.bank.Main
```

Expected stdout:

```text
BALANCE 118
{"owner":"Mira","opening":100,"deposit":25,"withdrawal":7,"closing":118}
```

`dispatch-gradle`: run `gradle --offline -p dispatch-gradle run` with a Gradle executable available (a distribution and Gson artifact are cached locally). Expected application stdout, excluding Gradle's own task lines:

```text
TOTAL 28
[{"kind":"parcel","charge":11},{"kind":"express","charge":17}]
```

`graph-stress-plain`: compile all `*.java` into a separate output directory and run `Main`:

```sh
mkdir -p graph-stress-plain/out
javac -d graph-stress-plain/out graph-stress-plain/*.java
java -cp graph-stress-plain/out Main
```

Expected stdout:

```text
GRAPH nodes=128 map=128 list=128
RECURSIVE_SUM 120
CHECKSUM 69089
CAUGHT 1
```

The stress fixture's event count depends on the tracer's granularity; its source bounds work to 128 allocations, 128 edge-link iterations, 16 recursive calls, and 320 five-class dispatches. The exception is handled, so it should not print a stack trace. The lead imported and executed all three projects through the actual UI, including Maven stdin/Debug/failure and retained graph inspection. See [final validation](../../docs/checkpoints/product-audit-v11_5/VALIDATION.md) and the checkpoint session JSON for measured outcomes and observation limits. These shell commands are reproduction helpers; acceptance uses the application's real project path.

## Bounded Focus shape probe

`focus-shapes-plain/Main.java` is an additional UI QA probe: a project object with
13 observed fields, a zero-field object, and a 12-cell `int[]`. Expected output
is `FIELDS 78 ARRAY 11`. It covers Focus geometry/readability extremes without
changing runtime contracts or rerunning the graph workload.
