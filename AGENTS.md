# Lessons

- Use Bun 1.3.14 with Three.js 0.185.1, `@types/three` 0.185.1, TypeScript 7.0.2, and Vite 8.1.4; keep dependency versions exact.
- Treat world units as metres and +Z as south. World generation must remain deterministic for a given seed.
- Preserve the defining Badaguan anchors: a 3 × 7 network of named pass roads, low detached garden villas, corridor-specific tree species, and a legible hill-to-bay axis.
- Pointer-lock acquisition is asynchronous. Requesting it must not publish a control mode; publish mode only from terminal `pointerlockchange`, `pointerlockerror`, or request-rejection outcomes.
- Touch, drag, and pointer input channels must be independently suspendable so disabling one channel does not disable the others.
- Ready, paused, and otherwise still states must render on demand rather than continuously, preserving accessible reduced-motion and pause behavior.
- Keep garden-tree placement clear of the spawn area and building footprints; procedural decoration must never compromise navigation or collision clearance.
- Street-sign plaques need readable faces on both sides so their labels remain visible from either viewing direction.
- Do not add external assets or audio; keep the experience self-contained.
