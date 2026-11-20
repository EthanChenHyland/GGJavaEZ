# Recorded historical reference bindings

The production SceneModel now carries an immutable `historicalBindings` prefix
alongside current `references`. It is a presentation catalog, derived from
accepted normalized owner/slot facts. RuntimeState, ExecutionGraph, normalizer
schemas and Semantic_Goldens are unchanged. Opaque normalized identities and
ordinals remain authoritative; formatted labels and graph-value aliases are
not parsed into storage identities.

The append index records reference introductions and genuine endings. Repeated
observations of the same target coalesce; a captured write, including a write
of the same target, starts a new interval. Java null, unavailable capture and
actual slot retirement have distinct endings. Scope/method exit closes scoped
locals; retained unscoped historical frame locals keep their runtime lifetime.
Captured collection preview replacement updates only its actual canonical
positions, without inferring add/remove/put/poll operations. Mirrored
EXECUTION_FACT value/REFERENCE_BIND edges do not create duplicate slot bindings.

Cursor `c` includes only introductions/endings with normalized ordinal `< c`.
Old snapshots expose no future ending metadata and survive append and rewind.
An immutable array facade captures the closed prefix in logarithmic time,
without eagerly copying growing history on every SceneModel projection. Equal
closed prefixes reuse the facade and its derived reference catalog. Ordinary
array iteration/inspection works; mutation operations throw. Storage remains
linear in accepted identities and genuine intervals, with no history eviction.

Trace All presents overwritten and nulled bindings at at most .25 opacity,
including a selected binding, a Focus relationship and current-event evidence.
Current and historical individuals share the same connector budget. A selected
drawable historical binding reserves capacity; mandatory overflow admits no
optional individual beyond `max(B, M)`. Directed historical bundles have a
separate namespace and exact constituent IDs, so they cannot mix with current
references or graph-flow bundles. Retirement/unavailable endings remain
queryable with explicit lifetime accounting rather than pretending to be
overwritten/null bindings.

Endpoint resolution uses the actual presentation cut and visible semantic
geometry. A null-valued Map chip can still serve as the source of a proved
earlier binding through its own physical key/value chip port. Hidden/retired
slots, quiet faces and absent array-window cells remain unavailable. No ellipsis,
body substitute, deleted lifetime or future value creates a source port.

Actual curves/bundles are pickable, and Inspector lists their real constituents
and introduction/ending evidence. Historical selection leaves camera, Cursor,
Focus and canonical anchors unchanged. The complete historical catalog is
reachable through a lazily mounted virtual list; current reference accounting
remains separate. Provenance facts survive scope changes and unavailable
geometry.

Typed normalized tests cover prefix reconstruction, immutable snapshots,
same-target writes, nulling, retirement, mirrored evidence, independent linear
interval properties, shared budget overflow, Map key/value geometry and missing
source rows. The first new fixture incorrectly used scalar SET_FIELD for a
reference write; it was corrected to the accepted CREATE_REFERENCE contract,
without changing validation.

The ordinary BindingApp Java fixture executes through the production bridge
and native Run. Its final extended version emits 553 raw events and 755 normalized
events. At desktop and narrow Focus/Trace All poses, 78 historical bindings
partition into 76 drawable and two unavailable relationships: 58 individuals
and 18 constituents in two directed bundles. Native curve/bundle selection,
constituent Inspector interaction, rewind before ending, empty-prefix replay
and Trace Current/All preserve runtime/camera facts. A narrow missed curve click
can open the Inspector sheet over the next candidate; the native test closes
that sheet through its real control before another attempt and proves unchanged
camera pose. No routing tolerance or application-state setter bypass is used.

The complete default unit gate passes 1,944 tests with 70 opt-in skips across
198 files in 156.22 seconds. All 68 reconstruction browser cases pass in eight
minutes. Production build, lint and strict browser TypeScript pass; AppRoot is
349.78 kB gzip, with the existing large-chunk warning still visible.

These checks do not establish final reference approval or sustained performance.
The actual JVM captured only the final Map snapshot in this fixture; absent
earlier Map bindings are not invented. Map null-chip history is covered by
accepted normalized unit snapshots. Original-size captures still show strong
current-flow clutter and crossings over labels. Complete Flow provenance
partitioning, broad visual convergence and whole-world scaling remain open.
