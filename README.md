# LennySimpson — Hobby Page + Three.js Game (Astro × Cloudflare Pages)

Lenny's hobby corner: playable **Star Collector** game (Three.js), build log (Astro content collections), hosted on **Cloudflare Pages**.

Includes:
- `/` landing, `/game` playable 3D game, `/blog` + `/about`, `/rss.xml`
- Game code in `src/game/star-collector.ts` (extend together!)
- Static output to `dist/` — no server needed

## Quick Start

```pwsh
npm install
npm run dev
```
Then visit http://localhost:4321. Play at http://localhost:4321/game.

## Scripts
- Mini Golf: `/mini-golf` — a traditional 3D three-hole, hole-in-one challenge. Aim with Left/Right, hold Space to cycle power, and release to putt. Misses reset the current hole while attempts keep counting; touch controls, precise rolling physics, cup lip-outs, golfer animation, sound effects, and gentle music are included.
- Courses progress from a straight putt to a diagonal bank rail and flower bed, then a hill with staggered planters and an arched garden gate. Soft putts drop across the visible cup opening; faster edge shots can lip out, and the flag is decorative.
- `node tests/mini-golf.test.mjs` — physics checks for soft cup approaches from every side, fair rim misses, fast overshoots/lip-outs, angled rails and round bumpers, three hole-in-one routes with aim/power tolerance, full-round scoring, retries, pause, and cancelled charges.
- Pumpkin Rider: `/pumpkin-rider` — Endless Halloween 2D motorbike course with streamed ramps, loops, randomized obstacles, candy and 20-second boosts. Speed and obstacle frequency rise gradually with distance; protected landing zones account for maximum boosted speed. Crashes end the run. Score combines distance, candy and loop bonuses; endless best scores use separate browser storage. Controls: Space/Up to jump, Left/Right to tilt, Down to brake, P to pause; touch controls are included. Best score stays in local browser storage.
- `node tests/pumpkin-rider.test.mjs` — Physics regression checks (Node 22.18+): 20 long rides across 20 sections, progressive difficulty, bounded memory, boost lifecycle, collisions and 240 landing scenarios across difficulty levels.
- `npm run dev` – Start local dev server
- `npm run build` – Production build to `dist/`
- `npm run preview` – Preview the built site locally
- `npm run check` – Type & Astro diagnostics

## Content
Posts live in `src/content/blog`. Each needs frontmatter:
```md
---
title: "My Post"
date: 2025-11-08
tags: ["astro", "intro"]
description: "Short description for listings and SEO."
---
```

## Deployment — Cloudflare Pages

`wrangler` is intentionally **not** in `package.json` (workerd has no win32-arm64 build — `npm install` would fail). Use `npx wrangler` which fetches a working binary on demand.

1. `npx wrangler login`
2. Option A — dashboard (recommended): connect repo → Framework preset `Astro` → Build command `npm run build` → Output `dist`.
3. Option B — CLI: `npm run build` then `npx wrangler pages deploy ./dist --project-name=lenny-simpson`
4. Set `site` in `astro.config.mjs` to the real `*.pages.dev` URL (or custom domain) for correct RSS links.

Config: `wrangler.jsonc` serves `dist/` as static assets (`npx wrangler deploy` after `npm run build`). Headers: `public/_headers`.

## TODO
- Add pagination if post count grows
- Add social sharing cards
- Configure site URL in `astro.config.mjs`

## License
MIT (replace if needed)
