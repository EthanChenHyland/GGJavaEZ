# Visual Java — Camera & Navigation Contract

The camera is both an explanatory tool and a user-controlled instrument. It must never become a cinematic trap.

## 1. Camera state is a first-class system

Do not scatter camera `lerp` calls across scene components.

Implement a dedicated camera/navigation controller with explicit modes and transitions:

```text
HOME
GUIDED_FOLLOW
FREE_EXPLORE
FOCUS_ENTITY
TRACE_PATH
THEATER
```

Runtime components request camera intents; they do not directly own the camera.

## 2. User ownership wins

Any intentional camera input immediately overrides nonessential automatic motion.

If the user starts orbiting, panning, or zooming:
- cancel or gracefully blend out current auto-motion;
- enter Free Explore;
- keep execution running if it was running;
- never snap back automatically.

A visible “Follow execution” control lets the user re-enable Guided Follow.

## 3. Required pointer / trackpad interactions

Inside the runtime canvas only:

- **single click / tap**: select entity;
- **double click / double tap**: focus selected entity;
- **drag**: orbit around current pivot;
- **modified drag or secondary drag**: pan;
- **wheel / pinch**: semantic zoom;
- **click empty space**: clear transient hover, preserve useful selection until intentionally cleared;
- **Home action**: return to runtime overview;
- **Focus action**: frame selected entity;
- **Follow execution toggle**: guided camera on/off.

Exact bindings may be adapted for platform conventions, but every primary action must also be available through visible controls and keyboard-accessible UI.

## 4. Pivot behavior

Orbit around semantic focus, not the origin forever.

- Home pivots around the whole runtime composition.
- Selected entity may become the pivot after Focus.
- Trace Path uses a controlled moving pivot.
- Exiting focus returns to the previous meaningful pivot instead of `(0,0,0)` by default.

## 5. Camera composition

Prefer readable three-quarter views with controlled perspective.

Avoid:
- extreme fisheye FOV;
- constant roll;
- upside-down orbit;
- rapid rotations;
- camera paths through geometry;
- forced cinematic motion during user inspection.

The default view should make stack, reference field, and heap legible simultaneously.

## 6. Cinematic moves

Guided moves are short explanatory transitions, not cutscenes.

Recommended timing classes:
- micro reframe: ~180–300 ms;
- semantic focus: ~350–650 ms;
- major world transition / theater entry: ~650–1100 ms.

Exact values belong in shared motion tokens.

Every guided move must have:
- start and destination semantic targets;
- cancellability;
- easing from the shared motion system;
- a stable resting composition;
- reduced-motion behavior.

## 7. Semantic zoom

Zoom should alter information density, not merely camera distance.

At thresholds:
- labels aggregate/disaggregate;
- field detail appears/disappears;
- minor references simplify;
- cluster summaries appear at macro scale;
- selected entity details remain readable longer than unrelated detail.

Use hysteresis around thresholds so content does not flicker as the user hovers near a zoom boundary.

## 8. Guided Follow behavior

Guided Follow should prioritize event importance.

Not every line gets a camera move.

Camera-worthy events include:
- first frame entry;
- object allocation;
- cross-region dereference;
- call into a meaningful new frame;
- major mutation;
- exception propagation;
- special-theater transition.

Primitive assignments can often be explained through local emphasis without moving the camera.

## 9. Off-screen execution awareness

In Free Explore, execution may happen elsewhere.

Communicate that without stealing the camera:
- subtle edge beacon toward active event;
- breadcrumb/status text;
- optional faint causal pulse visible at distance;
- “Return to execution” action.

Do not flash the whole screen.

## 10. Navigation memory

Maintain useful transient navigation state:
- last Home pose;
- current semantic pivot;
- selected entity;
- prior pose before Focus;
- prior pose before Theater.

This makes enter/exit transitions spatially coherent.

## 11. Accessibility and reduced motion

Reduced-motion mode keeps spatial meaning while minimizing travel:
- snap or short fade between meaningful viewpoints;
- no long fly-throughs;
- no unnecessary parallax;
- clear selection and relationship emphasis remain.

Keyboard-accessible alternatives must exist for Home, Focus, Follow, selection traversal, timeline stepping, and inspector access.
