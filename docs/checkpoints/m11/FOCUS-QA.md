# Front-face Focus polish

The selected runtime body's actual front-face anchor is now the camera pivot in reserved worlds. Focus fits the solid and its face labels in the clear portion of the viewport above the inspector shelf, with tighter padding than the general contextual camera fit. This changes only camera framing; it does not move runtime anchors or change trace semantics. Home, Return to world, free orbit/pan/dolly, and user-input cancellation keep their existing contracts.

The paired 1440 × 900 captures use the same real `Person` JVM trace and IDE layout: [before](person-before-focus-1440x900.png), [after](person-focus-1440x900.png). The selected `Person` front face grows from roughly 70 px to 200 px wide; `name` and `age` remain visible above the inspector. The completed-world captures at 1728 × 1117, 1440 × 900, 1280 × 800, and 760 × 900 were reviewed for exposed cuboid depth, visible fields, attached references, and spacing.

Validation after this change: 535 unit tests across 56 files, 19 affected browser tests, production build, TypeScript check, lint, and `git diff --check` passed. The browser set covers camera controls, Person, arrays, recursion, and editing/saving/running a nested-package Java project. Vite still reports the existing Monaco/troika large-chunk warning; it does not fail the build.
