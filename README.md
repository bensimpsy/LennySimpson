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
