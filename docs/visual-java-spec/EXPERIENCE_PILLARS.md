# Experience Pillars

## The Runtime Is the Hero

The center of gravity is a large 3D runtime scene. The editor remains visible and synchronized, but it should never dominate the composition. When a line executes, the source and world respond together.

The user should feel that the code is causing physical events in the scene.


## The Runtime Is a Place

The runtime world must remain coherent when the automatic camera stops. Users can freely orbit, pan, zoom, focus entities, follow relationships, and return to a stable Home view.

The same stack frame, heap object, and reference should preserve recognizable spatial identity across neighboring events. Scrubbing time changes semantic state without arbitrary re-layout.

Guided camera movement is an explanation layer on top of a persistent world, not the world itself. Read `SPATIAL_WORLD.md` and `CAMERA_AND_NAVIGATION.md` as hard contracts.

## Stack as Architecture

Each method invocation creates a distinct spatial frame. Frames should have depth and hierarchy rather than appearing as ordinary cards.

The active frame is visually dominant. Parent frames recede but remain legible. Locals inhabit their frame. `this` and parameters connect outward to heap entities when they reference objects.

Entering a method should feel like opening or descending into another layer of the machine. Returning should collapse or resolve that layer while transferring the return value upward.

## Heap as a Living Object World

Heap entities persist across calls. Every object has a stable visual identity. Fields can be inspected in-place. References between objects are rendered as spatial links.

Allocation should feel like emergence: a new object forms in the heap and receives its stable identity. Mutation should visibly alter the existing object rather than replacing it with a new visual unless the runtime identity actually changes.

Unreachable objects may dim or visually detach, but garbage collection should only be shown when supported by the trace or explicitly simulated as an educational mode.

## References as Causality Lines

Reference links should be expressive but controlled. A link can pulse when dereferenced, brighten when selected, and dim when unrelated to the current event.

Null should be visible as absence: a broken anchor, disconnected port, or terminated link. A null dereference should make the missing connection immediately obvious.

## Time as a Navigable Dimension

The timeline is not a media player stuck under the scene. It is a map of execution.

Events should be grouped by type and importance: method entry, allocation, mutation, branch, loop iteration, return, exception, and breakpoint.

The user can drag through time, step event-by-event, replay a selected interval, and follow one object or variable through its entire life.

## Camera as Explanation

Camera movement should communicate causality. It should not orbit constantly or behave like a game demo reel.

Examples:
- a method call gently shifts focus toward the new frame;
- object allocation pulls attention toward the new heap entity;
- a dereference draws the camera along a reference path;
- recursion reveals depth with controlled vertical or spatial descent;
- an exception reverses attention up the stack.

Every cinematic move needs a semantic reason.
