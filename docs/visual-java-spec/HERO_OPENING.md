# Visual Java — Hero Opening Experience

This file defines the opening rhythm, not a pixel-perfect storyboard. Codex may improve the exact choreography while preserving the emotional arc.

## Objective

Within the first 10–15 seconds, a new viewer should understand three things without explanation:

1. this is real Java code;
2. the code is driving a living 3D runtime world;
3. time can be navigated and inspected;
4. the runtime is a persistent place the user can freely explore.

The opening should feel controlled and cinematic, not like a splash screen.

## Starting composition

Desktop-first hero workspace:

- **Left 32–38%:** Java source/editor.
- **Right 62–68%:** 3D runtime world.
- **Bottom spanning both:** execution timeline, visually quiet until playback begins.
- **Inspector:** hidden initially; appears contextually after selection.

The 3D world must feel larger than the editor, even if the editor remains highly usable.

## First-run sequence

### Beat 0 — Ready state

The scene is already alive enough to feel spatial, but nearly still.

Visible:
- Java source;
- empty or dormant `main` stack region;
- distant heap region;
- timeline at event zero;
- clear Run control.

No giant marketing copy over the workspace.

### Beat 1 — Run

On Run:
- editor focus tightens around `main`;
- timeline wakes;
- first event marker activates;
- `main()` frame forms in the stack architecture.

The scene establishes the visual grammar before anything spectacular happens.

### Beat 2 — Primitive state

`x = 5` and `y = x * 2` appear as local state.

The viewer should see that values exist *inside a frame* and are not free-floating decorations.

### Beat 3 — Allocation reveal

On `new Person("Ethan")`:
- heap region becomes the focus;
- a persistent object identity materializes;
- constructor frame enters;
- `this` points to the new object;
- `name` becomes `"Ethan"`;
- constructor exits;
- `p` becomes the stable reference from `main` to the same object.

This is the first "wow" moment.

### Beat 4 — Method call

On `p.setAge(18)`:
- causal attention travels along `p`;
- `setAge` frame forms from caller context;
- `this` resolves to the same Person object;
- `age` visibly mutates `0 -> 18`;
- frame returns cleanly.

This is where the user should understand that the world is not decorative: it is showing actual execution relationships.

### Beat 5 — Time reveal

After execution completes:
- camera settles to a stable overview;
- timeline remains fully visible;
- a subtle cue invites scrubbing;
- dragging backward reconstructs prior semantic states rather than playing the movie backward.

The user realizes the runtime is navigable, not merely animated.

### Beat 6 — Hand control to the user

After the first guided run, the interface makes spatial control obvious without a tutorial wall:
- a subtle “Explore” / orbit affordance appears;
- the user can drag to orbit and zoom through the same world;
- double-clicking `Person #1` focuses it;
- clicking the `p` reference highlights its full source-to-target path;
- Home returns to the same overview;
- Guided Follow remains available as a toggle rather than a forced camera mode.

This beat proves the scene is a place, not a rendered cutscene.

## Camera behavior

The camera should have a stable home composition.

Automatic motion may:
- reframe stack vs heap;
- dolly closer for object birth;
- track a reference pulse briefly;
- return to overview after a completed event cluster.

Do not create constant camera motion. Stillness makes important movement feel important.

Automatic motion must be interruptible. The instant the user deliberately manipulates the camera, enter Free Explore and do not snap back. `CAMERA_AND_NAVIGATION.md` governs the full behavior.

## Creative freedom

Codex may invent:
- a better starting camera angle;
- a more compelling allocation materialization;
- a more elegant timeline awakening;
- a better visual handoff between constructor and persistent reference;
- a tasteful first-run atmospheric cue;
- a stronger way to make the first scrub interaction obvious.

Do not change the semantic story just to make the animation prettier.
