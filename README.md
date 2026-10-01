# GGJavaEZ / Visual Java

A local Java IDE whose real program execution builds a persistent, navigable 3D runtime world. Stack invocations and heap data occupy genuine XYZ geometry; completed calls grey out in place, and the retained trace supports inspection and time travel. Classic is an optional 2D projection of the same runtime state.

## Prerequisites

- **Node.js 24 LTS and npm recommended** (readiness verified with Node 24.20.0 / npm 11.19.0). Use Node 24 for this documented setup; other versions must satisfy every locked tool’s engine requirements.
- A **complete JDK**, with matching `java` and `javac`, for Java Build/Run/Debug. JDK 21+ is recommended and required by the optional language service. Configure JDK in the IDE to select a home; discovery also checks `JAVA_HOME`, PATH, and the macOS JDK registry. Java 26 language-service coverage remains provisional.
- Maven or Gradle for projects using those build systems; plain Java needs neither. Build tools can come from PATH, explicit overrides, or the optional local provisioner below.
- Google Chrome for the optional Playwright browser suite. It is not required for build or unit tests.

## Install and launch

```sh
npm ci
npm run dev
```

Open [the IDE](http://127.0.0.1:5173/ide). Both `/` and `/ide` open the IDE; `/examples` contains curated regression examples. The dev command starts Vite on port 5173 and the loopback Java bridge on port 8787. No secret or `.env` file is required.

First use presents **Open Project**, **Import folder (copy)**, and **New Project**. Import copies supported project files into managed storage; it does not edit the original directory. The Explorer provides contextual creation, rename/delete, refresh, and active-file reveal. Monaco supports editable tabs, Save / Save All, diagnostics, and breakpoints.

**Run** saves/builds the project, starts the real JVM, and records supported execution into Spatial. **Debug** uses the same execution session with actual project-source checkpoints. Console provides stdin/stdout/stderr; Problems and Error Explorer show build/runtime failures. **Run without visualization** remains an advanced console-only option. Completed worlds remain inspectable, and replay uses the retained trace rather than rerunning Java. Recorder limits stop visualization while the same JVM continues; partial worlds end at the last recorded event, separately from Java completion. The active watchdog excludes wrapped stdin waits and Debug pauses; a ten-minute hard safety deadline still applies.

Orbit by dragging, pan with right-drag, and dolly with the wheel. Select a runtime entity for Inspector; **Focus** approaches its front face. **Return to world**, **Home**, and **Exit Focus** restore broader views. Camera input overrides scripted movement. Source, Console and Inspector remain revealable in expanded runtime.

## Optional Java tooling

Semantic completion/navigation requires the pinned Eclipse JDT LS distribution, which is downloaded into ignored local storage, not bundled in Git:

```sh
node scripts/setup-java-language.mjs --download
```

Offline setup accepts `--archive /path/to/the-pinned-archive.tar.gz`; the script verifies the pinned SHA-256. If overriding `GGJAVA_WORKSPACE`, also pass the same directory with the installer’s `--workspace` option. The service requires JDK 21+. The IDE remains usable when the service is unavailable and exposes its status/retry action.

If Maven/Gradle are unavailable, the provisioner downloads checksum-verified pinned distributions into `.ggjavaez/tools`:

```sh
node scripts/setup-build-tools.mjs
```

It provisions archives; it does not run a user project. Setup needs `tar` and `unzip`. Project dependency resolution can require network access or an existing Maven/Gradle dependency cache; the offline fixture commands assume those dependencies were resolved previously. The build-tool wrapper path is currently macOS/Linux-oriented; Windows batch wrappers are unsupported, and native Windows behavior has not been validated.

Optional process-environment overrides are documented in [.env.example](.env.example). The scripts **do not automatically load `.env`**; export overrides in your shell. Keep `GGJAVA_PORT=8787` for the default dev proxy unless you also adjust that proxy. Runtime files, imported projects, tool downloads, indexes, and build outputs belong in ignored `.ggjavaez/`.

## Production and validation

```sh
npm run build
npm start
```

Open [the bridge-served IDE](http://127.0.0.1:8787/ide). For checks:

```sh
npm run typecheck
npm run lint
npm test
npm run build
# Optional, with Chrome, a JDK and the project-specific build/language tools:
npm run test:e2e
```

The browser suite is serialized because the bridge owns one current JVM session. Capture scripts and browser checks can regenerate historical checkpoint images; review outputs before committing. New bulk checkpoint media and temporary browser outputs are ignored by default; deliberately retained evidence can be added explicitly.

## Execution and coverage boundary

**User Java is not sandboxed.** It runs with your local OS permissions and can access files or launch programs. Run only code you trust. The bridge listens on loopback, validates project-relative filesystem operations, and launches processes using structured arguments. Those protections do not sandbox Java code. Stop cleans up the inherited process group on macOS/Linux; deliberately detached processes and unverified Windows process-tree behavior remain limits.

Capture is bounded and project-focused (20,000 raw events, 8 MiB, 256 identities, 128 live frames). Limits and unsupported application threads stop observation rather than Java. Real console continues independently; beyond 32 MiB inline retention, normal Run/Debug offers complete output files while the bridge retains the session. Static fields, object/multidimensional arrays, library/collection internals, dynamic loading, and multithread worlds are unsupported or partial. Unknown values/origins are reported rather than invented. See the [current Phase 1 validation](docs/checkpoints/v12-p1/VALIDATION.md), [Java coverage matrix](JAVA-VISUALIZATION-COVERAGE.md), [Milestone 11.5 audit](docs/checkpoints/product-audit-v11_5/AUDIT.md), and [validation evidence](docs/checkpoints/product-audit-v11_5/VALIDATION.md).

## Architecture and notices

`ExecutionSession` owns execution truth. JVM observations pass through `src/instrumentation/` into the pure `src/runtime/` reducer, persistent `src/world/` layout, and shared Classic/Spatial renderers. `src/navigation/` and `src/playback/` own presentation. `src/ide/` provides project editing; `server/` owns storage, build providers, JDK discovery, language service and JVM lifecycle. `src/examples/` holds curated regression traces (`src/examples/demos/`), their loaders and curated-only presentation (scoped/curated layouts, control-flow captions); generic modules may not import it (lint-enforced), and only `src/app/` composes it. It is not the ordinary project workflow.

The product brief and design contracts live in [docs/visual-java-spec](docs/visual-java-spec/README.md). [AGENTS.md](AGENTS.md) contains contributor/agent instructions. [Third-party notices](THIRD_PARTY_NOTICES.md) cover bundled assets. No software license has been selected for GGJavaEZ itself; third-party licenses do not grant a license to the project's original code.
