---
title: "How Star Collector works (for kids)"
date: 2026-09-06
description: "Scene, ship, stars, rocks, and the game loop — explained simply."
tags: ["threejs", "tutorial"]
---

A Three.js game is just 3 things repeating:

1. **Scene** — the world (lights, ground grid, camera).
2. **Things** — ship (cone + wings), stars (spinning octahedrons), rocks (red icosahedrons).
3. **Loop** — every frame: move ship, spin stars, check distances.

```ts
if (star.position.distanceTo(ship.position) < 1.1) {
  score += 10; // collect!
}
```

That's the whole trick! Distance checks = collisions. Next we'll learn about `requestAnimationFrame` and why we use `dt` (delta time) so the game runs the same speed on any computer.
