# mrh.lol

The personal hub for **MrHarold**: who I am, what I've built, how to reach me. One page, prerendered, no trackers.

The hero is the **Forge Board**: the name sits on a chip, PCB traces run out of its pins and cool into ore veins, the
cursor drags light along them and a click sends a pulse through the whole network (2D canvas, paused when hidden or
scrolled past, one static frame under `prefers-reduced-motion`). Design intent and every contract are in
[`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md); the original brief is [`PROMPT.md`](PROMPT.md).

## Stack

Vite 8 · React 19 · TypeScript 7 · Tailwind v4 · self-hosted Mona Sans and Martian Mono. No UI kit, no animation
library, no analytics. Prerendered at build time (`index.html` and a JS-free `404.html`), then hydrated. Contact form and
extra projects use Supabase over plain `fetch` (no SDK). Served by nginx in Docker.

## Develop

Needs Node >= 22.12 (and >= 22.18 for the asset scripts, which import `.ts` files directly).

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # fetch data, typecheck, client + SSR build, prerender, JS budget gate (150 KB gzip)
npm run preview      # serve dist/ (no gzip: use qa:docker for performance numbers)
```

Copy `.env.example` to `.env.local` and fill in the Supabase URL and publishable key to enable the contact form and
the project grid. Both are optional: without them the form is hidden and the config fallback is used.

## Where to edit content

**Everything personal lives in [`src/config/site.ts`](src/config/site.ts)**: name, identity line, bio, interests, links,
Discord handles, e-mail, SEO title and description. Anything the owner has not supplied yet is `null` with a
`TODO(me)` comment, and the UI hides it until it is set:

- Discord server invite, Roblox, X, YouTube, Twitch
- the public source repo URL (`sourceUrl`; the footer link appears when set)
- the avatar (see below)

JSON-LD, Open Graph tags and the web manifest are all derived from that file.

### Adding a project

Projects come from Supabase **at build time**. Insert a row in `public.projects` with `published = true`, then trigger
a rebuild with `force=true` ([DEPLOY.md](DEPLOY.md#3-rebuilding-when-data-changes)). The Prospecting Atlas flagship
stays in `site.ts`; its stats are refreshed from the live site on every build.

## Generated assets

Outputs are committed, so the Docker build never runs these.

| Command | Regenerate when | Writes |
|---|---|---|
| `npm run gen:assets` | name, identity, interests, palette or the vein generator changed | `public/og.png`, `favicon.ico`, `apple-touch-icon.png`, `icon-*.png`, `site.webmanifest` |
| `npm run gen:fonts` | you use new characters in the copy, or change the weights/widths the CSS asks for | `src/assets/fonts/*-site.woff2`. Keep `unicode-range` in `global.css` in step (the script prints it) |
| `npm run gen:shots` | the Atlas site changed visibly | `public/projects/*` |
| `npm run gen:avatar` | you replaced `assets-src/avatar.png` | `public/avatar/*`. Then set `site.avatar` in `site.ts` |

`gen:assets` draws the OG text from the real font files (HarfBuzz instancing, glyph outlines, resvg), so it does not
depend on installed fonts. `public/favicon.svg`, `robots.txt` and `sitemap.xml` are hand-written.

## QA

```bash
npm run qa:shots        # 390 / 768 / 1440 / 2560 screenshots + horizontal-overflow and console checks (--reduced too)
npm run qa:fps          # hero frame times, pause on hidden / scrolled past
npm run qa:docker       # build the image, run it, assert headers, caching, gzip, 404, healthz (-- --keep to keep it up)
npm run qa:lighthouse   # mobile + desktop against the container on :8080; fails below 95 / 100 / 100 / 100 (mobile)
                        # add `-- --runs 5` to repeat mobile and gate on the worst run; GPU is off unless `--gpu`
```

Screenshots and reports land in `.qa/` (git-ignored). The QA scripts launch their own throwaway headless Chrome; set
`CHROME_PATH` if Chrome is not in the default Windows location.

## Deploy

Coolify with the Dockerfile build pack, container port 80. See [DEPLOY.md](DEPLOY.md).
