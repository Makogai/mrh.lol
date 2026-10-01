# mrh.lol — Build Plan

**Source of truth for every implementer.** Read `PROMPT.md` (intent, quality bar, traps §7, deploy §8) and this
file end to end before writing a line. On *what* to build, PROMPT.md wins; on *how*, this file wins. Personal facts
come only from §0.1. Anything not given stays `null` + `TODO(me)` in `src/config/site.ts`, never scattered.

Everything marked **validated** below was proven on 2026-10-01 in a throwaway prototype (same versions, same
Windows/Node 24 machine): SSR prerender, font preload injection, JSON glob fallback, TS 7 typecheck, Tailwind v4
token resets, per-package build isolation, clean hydration, the OG text pipeline, and the vein-network generator
(rendered and art-directed at 1440×900 and 390×844).

---

## 0. Ground truth

### 0.1 Owner answers (PROMPT §0) — use exactly these

| Field | Value | Notes |
|---|---|---|
| Display name | `MrHarold` | |
| Real name | not published; spoken form `Mr Harold` | JSON-LD `alternateName` only |
| One-line identity | `Code, games, and a habit of looking up.` | owner: "you decide something cool" → **EDITABLE** in config |
| Bio | "I'm MrHarold — a programmer who never really stopped being a gamer. I build the tools I wish existed for the games I play, like Prospecting Atlas, and I sweat the details nobody asked for. When I'm not shipping code, I'm probably in a flight sim or watching planes go over." | owner: "gamer, programmer, something along those lines" → **EDITABLE** |
| Interests | gaming, programming, aviation | owner said "planes/aviation" |
| Location | "the Cloud" → rendered **"Based in the Cloud"** | owner literally said "say location Cloud" |
| GitHub | https://github.com/Makogai | |
| Discord | `makogai` (primary), `mrharold01` (alt). No server invite → `null` TODO(me) | Profile URLs need numeric IDs → primary action is **copy handle** |
| Roblox | wanted, no username → `null` TODO(me) | card hidden while null |
| X / YouTube / Twitch | `null` TODO(me) | hidden |
| Email | `contact@mrh.lol` | owner: "for now use contact@mrh.lol" — may be shown |
| Contact form | yes, real backend: Supabase RPC | §10 |
| Primary contact | Discord | |
| Other projects | none yet → one intentional "More in the forge" card | §8.3 |
| Avatar | will arrive later in `public/avatar/` → `null` now | design must be great without it |
| Source repo | not created yet → `null` | footer link appears only when set |
| Analytics | none | no trackers of any kind |

### 0.2 Validated toolchain

| Package | Version | Notes |
|---|---|---|
| Node | 22 (Docker `node:22-alpine`), 24 locally | Vite 8 needs ≥ 22.12; local scripts that import `.ts` need ≥ 22.18 (type stripping) |
| vite | 8.3.2 | Rolldown-based. `isSsrBuild` in config works. CSS `url("@fontsource…")` bare specifiers resolve. |
| @vitejs/plugin-react | 6.1.1 | no Babel needed |
| react / react-dom | 19.3.0 | baseline client bundle with a trivial app = **68.85 KB gzip** → ~80 KB left for us |
| tailwindcss + @tailwindcss/vite | 4.3.3 | `--color-*: initial` etc. scope exactly as expected (§5.6) |
| typescript | 7.0.2 (native) | `erasableSyntaxOnly` enforced; `tsc -p` works |
| @fontsource-variable/mona-sans | 5.3.0 | latin `wdth` file (wght 200–900 × wdth 75–125) = 98.1 KB |
| @fontsource-variable/martian-mono | 5.3.0 | latin `wght` file = 23.6 KB |
| @resvg/resvg-js 2.6.2, subset-font 2.9.0, fontkit 2.0.4 | | OG pipeline (resvg can't read WOFF2 → HarfBuzz instancing + fontkit outlines, §11.3) |
| sharp 0.35.5, puppeteer-core 25.12.0 | | screenshots + image encoding (local scripts only) |
| lighthouse | 13.5.0 via `npx -y` | not a dependency |
| nginx | `nginx:1.30-alpine` (current stable, tag verified) | |

---

## 1. Direction

### 1.1 The forge, in one paragraph

prospecting.mrh.lol is a dark cavern; mrh.lol is **the forge** where that ore gets worked. Cool blue-black iron,
lantern-amber heat, mineral-teal cooling. The page is carried by **enormous, tight Mona Sans** — expanded width for
display, normal width for reading — and **Martian Mono** for every number and handle (its wide, square figures read
like avionics readouts; a quiet aviation nod). Depth comes from **light**: blooms, inner glows, 1px hairlines at 8–16%
— never heavy borders or drop shadows. One effect, the Forge Board, carries all the motion; everything else is crisp,
fast UI feedback on two curves.

### 1.2 Signature: the Forge Board (refined vein network — verdict: keep PROMPT §1's idea, sharpen it)

**The name is the chip.** The hero content block is treated as an IC die: copper PCB traces leave pins along its edges
in tidy 45° buses, and — the further they run from the chip — they **cool into organic ore veins** (copper-amber →
steel → mineral teal). So the hero literally draws the line from *programming* (the chip, the traces) to *mining /
gaming* (the veins). The cursor is a lantern that drags light along the nearest traces; a click strikes a pulse that
races through the graph; pads and vias flash as the wave passes. The aviation nod is one rare, quiet variant of the
same pulse: every ~20 s a pale blue-white **flight** crosses the board along a real path, trailing a fading contrail,
and sometimes "lands" on a chip pin. One idea, one graph, one rendering system — no competing effects.

Validated: the prototype at 1440×900 produced 1,637 nodes / 1,617 edges in 17–25 ms (unoptimised JS); buses,
miter-correct 45° bends, PCB→vein transitions and the connected refill all read correctly. 2D canvas, no WebGL.

---

## 2. Rules for parallel implementers (all packages)

1. **Ownership is disjoint** (§4). Edit only files you own. Scaffold's stubs for your files are yours to replace.
   If you need something in a file you don't own (a token, a dependency, a primitive prop): don't edit it — solve it
   locally in your own files and list it under *Requests for the lead* in your report.
2. **No installs.** Never run `npm install`/`npm i`, never touch `package.json` or `package-lock.json` (scaffold
   installs everything in §3.1).
3. **Secrets.** Never read `.env*` files. Never print env values or the anon key in logs, screenshots or reports.
4. **No commits** and no state-changing git commands.
5. **Build isolation (one shared checkout).** Prefix every dev/build/preview/QA command with `MRH_PKG=<your key>`:
   outputs go to `dist-<key>/`, `dist-<key>-ssr/` and `node_modules/.vite-<key>`. Ports: dev `5173+n`,
   preview `4173+n` with n = scaffold 0, hero 1, sections 2, contact 3, seo_deploy 4. Example (Git Bash):
   `MRH_PKG=hero npm run dev -- --port 5174 --strictPort`. QA output goes to `.qa/<key>/` (gitignored).
6. **Typecheck discipline.** Iterate with `npm run build:nocheck` (another package's WIP must not block you). Run
   `npm run typecheck` before finishing: zero errors in *your* files; list errors you saw in others' files.
7. **SSR / hydration (trap #6).** The page is prerendered and hydrated. Render functions must produce identical markup
   on server and client: in render, never read `window`, `document`, `navigator`, `matchMedia`, storage,
   `Date.now()`, `new Date()`, `Math.random()`. Browser facts (reduced motion, pointer type, clipboard, sizes) are
   applied in `useEffect`/ref callbacks — as state updates or `data-*` attributes **after** hydration, never as a
   first-render className difference. Use `useId()` for ids. Build-time constants (`site`, `buildData`,
   `import.meta.env.*`) are identical in both builds and are fine in render.
8. **Motion.** Only the two curves and the duration tokens in §5.3. CSS first. No animation libraries.
9. **Traps.** No `position: fixed` anywhere except the grain (`body::after`); any future overlay goes through
   `createPortal(…, document.body)` (trap #1). Never transform a box past its parent's bounds; animate
   `background-position` inside a clipped box instead (trap #2). `overflow-x: clip`, never `hidden` (trap #3).
   Anything that must be correct after a hidden tab returns re-checks on `visibilitychange` (trap #4).
10. **Accessibility.** One `h1` (hero). One `h2` per section, `h3` inside. Real `<a>`/`<button>`. Visible focus
    (global ring, §5.5). Contrast per §5.1 — never `ink-500` for text. Tap targets ≥ 48 px. Icon-only controls get
    `aria-label`. Decorative SVG/canvas is `aria-hidden="true"`.
11. **Copy.** Generic UI strings may live in components. Anything personal (names, handles, URLs, bio, claims)
    comes from `site` config. No lorem, no invented facts.
12. **Comments** explain *why* a value is what it is, not what a line does.
13. **Final report**: files created/changed; how you verified (commands + results); screenshot paths; known issues;
    requests for the lead.

---

## 3. Toolchain, dependencies, scripts

### 3.1 Install (scaffold only, once)

```bash
npm install react@^19.3.0 react-dom@^19.3.0 @fontsource-variable/mona-sans@^5.3.0 @fontsource-variable/martian-mono@^5.3.0
npm install -D vite@^8.3.2 @vitejs/plugin-react@^6.1.1 tailwindcss@^4.3.3 @tailwindcss/vite@^4.3.3 typescript@^7.0.2 \
  @types/react@^19.3.0 @types/react-dom@^19.3.0 @types/node@^22.20.4 \
  @resvg/resvg-js@^2.6.2 subset-font@^2.9.0 fontkit@^2.0.4 sharp@^0.35.5 puppeteer-core@^25.12.0
```

Image/OG tooling lives in devDependencies and is only used by local scripts whose outputs are committed under
`public/`; the Docker build never runs them (puppeteer-core downloads no browser; sharp/resvg ship musl binaries).

### 3.2 `package.json` (scripts verbatim)

```json
{
  "name": "mrh-lol",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "engines": { "node": ">=22.12" },
  "scripts": {
    "dev": "node scripts/gen-data.mjs --if-missing && vite",
    "gen:data": "node scripts/gen-data.mjs",
    "typecheck": "tsc -p tsconfig.json && tsc -p tsconfig.node.json",
    "bundle": "vite build && vite build --ssr src/entry-server.tsx && node scripts/prerender.mjs && node scripts/qa/budget.mjs",
    "build": "node scripts/gen-data.mjs && npm run typecheck && npm run bundle",
    "build:nocheck": "node scripts/gen-data.mjs && npm run bundle",
    "preview": "vite preview --strictPort",
    "gen:assets": "node scripts/gen-assets.mjs",
    "gen:shots": "node scripts/shoot-atlas.mjs",
    "gen:avatar": "node scripts/gen-avatar.mjs",
    "qa:shots": "node scripts/qa/shots.mjs",
    "qa:fps": "node scripts/qa/fps.mjs",
    "qa:lighthouse": "node scripts/qa/lighthouse.mjs",
    "qa:docker": "node scripts/qa/docker-smoke.mjs"
  }
}
```

`build` is what Docker runs: fetch build-time data → typecheck → client build → SSR build → prerender
`index.html` + `404.html` → enforce the JS budget (fails the build above 150 KB gzip — PROMPT §6 is a hard requirement).

### 3.3 `vite.config.ts` (verbatim)

```ts
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// MRH_PKG=<package> isolates parallel implementers sharing one checkout (own outDir + own dep-optimizer cache).
// Unset in Docker / for the lead → plain dist/.
const pkg = process.env.MRH_PKG;
const outDir = pkg ? `dist-${pkg}` : 'dist';

// The hero name (LCP) is set in Mona Sans' width axis. Preloading the hashed file means the swap from the
// metric-matched fallback usually happens before first paint. Vite never preloads fonts on its own.
function preloadDisplayFont(): Plugin {
  return {
    name: 'mrh:preload-display-font',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const file = Object.keys(ctx.bundle ?? {}).find((f) => /mona-sans-latin-wdth-normal-[\w-]+\.woff2$/.test(f));
        if (!file) return [];
        return [{ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${file}`, crossorigin: '' }, injectTo: 'head' }];
      },
    },
  };
}

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), tailwindcss(), preloadDisplayFont()],
  cacheDir: pkg ? `node_modules/.vite-${pkg}` : 'node_modules/.vite',
  build: { outDir: isSsrBuild ? `${outDir}-ssr` : outDir, sourcemap: false },
}));
```

### 3.4 TypeScript

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "resolveJsonModule": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["ES2023"], "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true, "isolatedModules": true, "verbatimModuleSyntax": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts"]
}
```

`erasableSyntaxOnly` is deliberate: no `enum`, `namespace`, parameter properties or `<T>x` casts anywhere, so Node can
import `src/config/site.ts` and `src/hero/veins/generate.ts` directly for the OG image (§11.3). `noUncheckedIndexedAccess`
is deliberately **off** (the canvas engine indexes typed arrays in hot loops).

### 3.5 `.gitignore` and `.env.example`

```gitignore
node_modules
dist
dist-*
.env
.env.*
!.env.example
src/data/generated.json
.qa
*.log
.DS_Store
```

```dotenv
# Supabase — used at BUILD time (Vite inlines VITE_*; scripts/gen-data.mjs reads them to fetch projects).
# The anon / publishable key is designed to be public; RLS and the RPC do the guarding.
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxxxxxx
```

---

## 4. Layout and ownership

```
/
├─ PROMPT.md                         lead
├─ docs/BUILD_PLAN.md                lead
├─ package.json, package-lock.json   scaffold
├─ vite.config.ts, tsconfig*.json    scaffold
├─ .gitignore, .env.example          scaffold
├─ index.html                        seo_deploy (scaffold bootstraps it, §6.5)
├─ Dockerfile, .dockerignore, nginx.conf, DEPLOY.md, README.md   seo_deploy
├─ supabase/migrations/0001_init.sql contact
├─ assets-src/**                     owner/lead source art (avatar.png, Roblox avatar export) — read-only, never shipped
├─ public/
│  ├─ projects/**                    sections (Atlas screenshots, generated)
│  ├─ avatar/**                      sections (generated from assets-src/avatar.png by scripts/gen-avatar.mjs)
│  └─ everything else                seo_deploy (og.png, favicons, manifest, robots, sitemap)
├─ scripts/
│  ├─ prerender.mjs                  scaffold
│  ├─ qa/lib/browser.mjs             scaffold (shared puppeteer + preview helpers)
│  ├─ qa/shots.mjs, qa/budget.mjs    scaffold
│  ├─ qa/fps.mjs                     hero
│  ├─ shoot-atlas.mjs, gen-avatar.mjs   sections
│  ├─ gen-data.mjs                   contact (scaffold bootstraps a stub)
│  ├─ gen-assets.mjs                 seo_deploy
│  └─ qa/lighthouse.mjs, qa/docker-smoke.mjs   seo_deploy
└─ src/
   ├─ entry-client.tsx, entry-server.tsx, App.tsx, vite-env.d.ts   scaffold
   ├─ styles/global.css              scaffold
   ├─ config/site.ts                 scaffold (content edits later: lead/owner)
   ├─ data/types.ts, data/index.ts   scaffold      (data/generated.json: written by gen-data, gitignored)
   ├─ lib/**                         scaffold
   ├─ components/**                  scaffold
   ├─ hero/**                        hero          (scaffold bootstraps stubs, incl. veins/types.ts verbatim)
   ├─ sections/**                    sections      (stubs)
   ├─ contact/**                     contact       (stubs)
   └─ seo/**                         seo_deploy    (stubs)
```

`App.tsx` (scaffold, final — packages never edit it):

```tsx
import { Hero } from './hero/Hero';
import { About } from './sections/About';
import { Work } from './sections/Work';
import { Contact } from './contact/Contact';
import { Footer } from './sections/Footer';

// Landmarks: the hero is the page <header> (banner), sections live in <main>, then <footer>.
export function App() {
  return (
    <>
      <Hero />
      <main id="main">
        <About />
        <Work />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
```

Agreed exports (named, no default exports): `Hero` (`src/hero/Hero.tsx`, renders `<header id="top">`), `About`,
`Work`, `Footer` (`src/sections/*.tsx`; Footer renders `<footer>`), `Contact` (`src/contact/Contact.tsx`),
`renderHead`, `renderNotFoundHead` (`src/seo/head.ts`), `NotFound` (`src/seo/NotFound.tsx`),
`generateNetwork`, `NodeKind`, `VEIN_SEED` (`src/hero/veins/generate.ts`).

Refinement vs. the task split: the **scroll hint lives in the hero package** (it sits inside the hero viewport, is a
keep-out for the network, and shares the hero's reduced-motion handling).

---

## 5. Design system

### 5.1 Palette and contrast rules

Base `#06080e → #161b28`, amber `#ffc247` signature, teal `#3ee0d0` secondary, violet/blue sparingly, four inks.
Dark only (`color-scheme: dark`).

| Token | Hex | Use |
|---|---|---|
| `iron-950` | `#06080e` | page base |
| `iron-900` | `#0a0d16` | card base |
| `iron-850` | `#10141f` | raised card / inputs |
| `iron-800` | `#161b28` | top of base gradient; never under `ink-400` text |
| `iron-700` | `#222838` | hover surfaces; borders at most; no `ink-400` text on it |
| `iron-600` | `#333b4f` | strong hairline, scrollbar, disabled |
| `amber-200/300/400/500/600` | `#ffe9bd #ffd98a #ffc247 #f5a623 #d4820b` | 400 = signature; 300 hover; 200 spark core |
| `teal-300/400/500` | `#8ef0e6 #3ee0d0 #12b5aa` | live/status, highlights, vein glow |
| `violet-400` | `#a78bfa` | sparingly (nodules, one accent) |
| `blue-400` | `#60a5fa` | sparingly (flight contrail, one accent) |
| `ink-100` | `#eef2fb` | headings, primary text |
| `ink-300` | `#aab3c7` | body text |
| `ink-400` | `#7d879e` | meta text — **only** on `iron-950/900/850` |
| `ink-500` | `#5a6379` | **never text** — hairlines, ticks, decoration |
| `coral-400` | `#ff8f80` | form errors only (always with icon + text) |

Computed contrast (WCAG): ink-100 on iron-950 ≈ 17:1; ink-300 on iron-950 ≈ 9.9:1, on iron-800 ≈ 8:1;
ink-400 on iron-950 5.56:1, iron-850 5.10:1, iron-800 4.77:1 (too thin once grain is added → banned), iron-700
4.08:1 (fails); ink-500 on iron-950 3.33:1 (fails body text → never text); amber-400 on iron-950 12.4:1 (and
iron-950 text on amber-400 buttons 12.4:1); teal-400 12.2:1; violet-400 7.4:1; blue-400 7.9:1; coral-400 ≈ 8:1.
Text over the hero never sits on canvas pixels (the chip keep-out, §7.2), so these hold "over the gradients and the
grain" as PROMPT §6 requires. QA re-checks with Lighthouse on the real page.

### 5.2 Type

- **Mona Sans Variable** (GitHub's grotesque — programming DNA, superb at huge sizes) is the one sans. Display uses
  the width axis; reading text uses `wdth 100`. Hubot Sans was rejected after rendering: its slab-serifed capital "I"
  is distracting in running first-person text ("I build the tools I wish…").
- **Martian Mono Variable** for anything numeric or code-flavoured: stats, handles, labels, indices, dates, the char
  counter. Wide, square figures → instrument-panel feel.
- Self-hosted from `@fontsource-variable/*` **latin files only** via our own `@font-face` (no fontsource CSS
  imports, so latin-ext/vietnamese/cyrillic never ship). `font-display: swap`. Mona Sans is preloaded (§3.3).
- **Fallback metrics (validated, measured in Chrome against the real files):** Mona 400 is 2.88 % wider than Arial,
  Mona 500 4.67 %, Mona 700 vs Arial Bold 0.86 %; Martian Mono 400 is 16.65 % wider than Courier New. Mona's ascent
  1.090 / descent 0.320 / gap 0 (UPM 1000); Martian 1.000 / 0.200. The `@font-face` fallbacks in §5.6 encode these,
  so lines wrap the same before and after the swap → no CLS.
- **Hero name:** `font-weight: 850; font-stretch: 125%; letter-spacing: -0.045em; line-height: 0.88; white-space: nowrap`.
  Measured advance at that setting: **4.832 em for "MrHarold" (0.604 em/char)**. Size is *fit-to-container,
  hard-stopped*: `font-size: clamp(3rem, calc(100cqi / var(--name-em)), 11rem)` on a `container-type: inline-size`
  wrapper, with `--name-em = displayName.length × 0.62` set inline from config (≈ 3 % safety). That is PROMPT's
  `clamp(3rem, 12vw, 11rem)` intent made exact: on a 390 phone the name spans the full 358 px content width (~72 px
  type) instead of a timid 48 px; it caps at 11rem (176 px) from ~1000 px up, and at **14rem** from 1920 px (`3xl`),
  where 11rem looks under-scaled. If the font fails, Arial Bold is narrower (4.65 em) and still fits.
- **Scale** (Tailwind `--text-*`, defaults wiped): `xs 12/16`, `sm 14/20`, `base 16/24`, `lg 18/28`, `xl 20/28`,
  `2xl 24/32`, `lead clamp(1.5rem, 1.05rem + 1.9vw, 3rem)/1.22` (bio), `title clamp(2rem, 1.3rem + 2.8vw, 3.75rem)/1`
  (flagship & card titles), `display clamp(2.5rem, 1.4rem + 4.4vw, 5.5rem)/0.95` (section h2). Minimum text size 12 px.
- Tracking tokens: `hero -0.045em`, `display -0.035em`, `snug -0.015em`, `label 0.12em` (mono uppercase labels).
- Display headings: `font-weight 800`, `font-stretch 112.5%`, `tracking-display`, `ink-100`, `text-wrap: balance`.
  Body: 400, `ink-300`, `text-wrap: pretty`, measure ≤ 68ch. UI labels/buttons: 600, `font-stretch 105%`.
  Mono labels: 500, 12 px, uppercase, `tracking-label`, `ink-400`.

### 5.3 Motion — one spring, one ease

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | every fade, entrance, color/glow transition |
| `--ease-spring` | `linear(0, 0.024 2%, 0.087 4%, 0.176 6%, 0.281 8%, 0.392 10%, 0.558 13%, 0.709 16%, 0.835 19%, 0.933 22%, 1.003 25%, 1.049 28%, 1.074 31%, 1.084 35%, 1.072 40%, 1.05 45%, 1.028 50%, 1.008 56%, 0.996 63%, 0.993 72%, 0.997 84%, 1)` | press, magnetic return, hover lift. Damped spring ζ=0.62: reaches target at 25 % of its duration, 8.4 % overshoot at 35 %, settles by ~60 % |
| `--dur-fast` | 160 ms | color/opacity feedback |
| `--dur-base` | 240 ms | glow/hairline transitions |
| `--dur-spring` | 480 ms | spring transitions (lands in ~120 ms — inside PROMPT's 150–250 ms feel) |
| `--dur-enter` | 560 ms | scroll reveals |
| `--stagger` | 70 ms | reveal stagger step (cap index at 6) |

- Hover/press acknowledge immediately (no delays on feedback). Press = `scale(0.97)` with the spring (motion-safe);
  hover = light (glow/hairline), not lift.
- **Reveal:** `IntersectionObserver` once, `opacity 0 → 1` + `translateY(16px) → none`, `--dur-enter` `--ease-out`,
  stagger by index. Never re-animate. Reduced motion: opacity only.
- **Magnetic:** only the two hero CTAs. Fine pointer + hover-capable + no reduced motion only.
- Reduced motion keeps opacity fades and color transitions; drops transforms, the sheen, the scroll-hint drift, the
  live-dot pulse and all canvas animation (one static frame).
- CSS `scroll-behavior: smooth` only under `prefers-reduced-motion: no-preference`.

### 5.4 Space, grid, container, breakpoints

- **8 px rhythm.** Tailwind's default 4 px unit stays, but only even steps are allowed (`2,4,6,8,10,12,14,16,20,24,
  28,32,40,48` → 8–192 px). Odd steps (`p-1`, `gap-3`, `h-11`…) are banned except `0.5`/`px` hairline nudges.
  Tap targets are **48 px** (`h-12`), not 44.
- Design tiers: **base** (designed at 390), **md ≥ 768**, **lg ≥ 1024** (structural), **xl ≥ 1280** (designed at
  1440), **3xl ≥ 1920** (designed at 2560). Don't use `sm`/`2xl`.
- `--gutter`: 16 px base, 32 px md, 64 px lg, 96 px 3xl. `site-container` utility: `max-width: calc(90rem + 2 ×
  gutter)` (content caps at 1440 px), centered, safe-area aware.
- `section-y` utility: block padding 96 / 128 (md) / 160 (xl) / 192 (3xl) px.
- Layout grid from lg: 12 columns, `gap-x-8` (32 px); md: 6 columns `gap-x-6`; base: single column.

### 5.5 Surfaces, grain, focus

- **Light, not borders.** Cards: `iron-900` fill + `shadow-hairline` (inset 1 px at 8 %) + an optional radial bloom
  (amber or teal at 5–8 %) placed off-center. Hover: `shadow-hairline-strong` + glow. Never `border-2`, never dark
  drop shadows.
- Radii: `rounded-pad` 12 px (buttons, inputs, tiles — an SMD pad), `rounded-card` 24 px, `rounded-full` for dots.
- **Grain:** `body::after`, fixed, full viewport, `pointer-events: none`, z 60, tiled 160 px SVG `feTurbulence` data
  URI at **3 % opacity**. It dithers the dark gradients (kills banding) and adds texture. It's the only fixed element.
- **Focus:** global `:focus-visible { outline: 2px solid amber-400; outline-offset: 3px }` (outlines follow
  border-radius). Never `outline: none` without a replacement.
- Selection: amber at 28 %, white text. Scrollbar: `iron-600` on `iron-950`.

### 5.6 `src/styles/global.css` (verbatim core — scaffold may add base rules, never remove these)

```css
/* Owned by scaffold. Design tokens + base layer. Packages consume tokens; they never edit this file. */
@import "tailwindcss" source("../");

/* ── Fonts: self-hosted, Latin subset only, swap. Vite fingerprints the files; vite.config preloads Mona Sans. ── */
@font-face {
  font-family: "Mona Sans";
  src: url("@fontsource-variable/mona-sans/files/mona-sans-latin-wdth-normal.woff2") format("woff2-variations");
  font-weight: 200 900;
  font-stretch: 75% 125%;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: "Martian Mono";
  src: url("@fontsource-variable/martian-mono/files/martian-mono-latin-wght-normal.woff2") format("woff2-variations");
  font-weight: 100 800;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
/* Metric-matched local fallbacks — measured in Chrome against the real files (BUILD_PLAN §5.2).
   size-adjust matches average advance width so lines wrap identically before/after the swap (no CLS);
   ascent/descent = Mona's 1.090/0.320 divided by size-adjust. */
@font-face { font-family: "Mona Sans Fallback"; src: local("Arial"), local("ArialMT"); font-weight: 100 450; size-adjust: 102.9%; ascent-override: 105.9%; descent-override: 31.1%; line-gap-override: 0%; }
@font-face { font-family: "Mona Sans Fallback"; src: local("Arial"), local("ArialMT"); font-weight: 451 599; size-adjust: 104.7%; ascent-override: 104.1%; descent-override: 30.6%; line-gap-override: 0%; }
@font-face { font-family: "Mona Sans Fallback"; src: local("Arial Bold"), local("Arial-BoldMT"); font-weight: 600 1000; size-adjust: 100.9%; ascent-override: 108%; descent-override: 31.7%; line-gap-override: 0%; }
@font-face { font-family: "Martian Mono Fallback"; src: local("Courier New"), local("CourierNewPSMT"); size-adjust: 116.6%; ascent-override: 85.8%; descent-override: 17.2%; line-gap-override: 0%; }

@theme {
  /* Wipe Tailwind defaults so only forge tokens exist (validated: font weights and text-shadows survive these resets). */
  --color-*: initial;
  --ease-*: initial;
  --text-*: initial;

  --color-white: #ffffff;
  --color-black: #000000;
  --color-iron-950: #06080e;
  --color-iron-900: #0a0d16;
  --color-iron-850: #10141f;
  --color-iron-800: #161b28;
  --color-iron-700: #222838;
  --color-iron-600: #333b4f;
  --color-amber-200: #ffe9bd;
  --color-amber-300: #ffd98a;
  --color-amber-400: #ffc247;
  --color-amber-500: #f5a623;
  --color-amber-600: #d4820b;
  --color-teal-300: #8ef0e6;
  --color-teal-400: #3ee0d0;
  --color-teal-500: #12b5aa;
  --color-violet-400: #a78bfa;
  --color-blue-400: #60a5fa;
  --color-ink-100: #eef2fb;
  --color-ink-300: #aab3c7;
  --color-ink-400: #7d879e;
  --color-ink-500: #5a6379;
  --color-coral-400: #ff8f80;

  --font-sans: "Mona Sans", "Mona Sans Fallback", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Martian Mono", "Martian Mono Fallback", ui-monospace, monospace;
  --font-serif: var(--font-sans);

  --text-xs: 0.75rem;    --text-xs--line-height: 1rem;
  --text-sm: 0.875rem;   --text-sm--line-height: 1.25rem;
  --text-base: 1rem;     --text-base--line-height: 1.5rem;
  --text-lg: 1.125rem;   --text-lg--line-height: 1.75rem;
  --text-xl: 1.25rem;    --text-xl--line-height: 1.75rem;
  --text-2xl: 1.5rem;    --text-2xl--line-height: 2rem;
  --text-lead: clamp(1.5rem, 1.05rem + 1.9vw, 3rem);      --text-lead--line-height: 1.22;
  --text-title: clamp(2rem, 1.3rem + 2.8vw, 3.75rem);     --text-title--line-height: 1;
  --text-display: clamp(2.5rem, 1.4rem + 4.4vw, 5.5rem);  --text-display--line-height: 0.95;

  --tracking-hero: -0.045em;
  --tracking-display: -0.035em;
  --tracking-snug: -0.015em;
  --tracking-label: 0.12em;

  --radius-pad: 12px;
  --radius-card: 24px;

  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-spring: linear(0, 0.024 2%, 0.087 4%, 0.176 6%, 0.281 8%, 0.392 10%, 0.558 13%, 0.709 16%, 0.835 19%, 0.933 22%, 1.003 25%, 1.049 28%, 1.074 31%, 1.084 35%, 1.072 40%, 1.05 45%, 1.028 50%, 1.008 56%, 0.996 63%, 0.993 72%, 0.997 84%, 1);

  --shadow-hairline: inset 0 0 0 1px rgb(238 242 251 / 0.08);
  --shadow-hairline-strong: inset 0 0 0 1px rgb(238 242 251 / 0.16);
  --shadow-glow-amber: 0 0 0 1px rgb(255 194 71 / 0.35), 0 8px 40px -8px rgb(255 194 71 / 0.55);
  --shadow-glow-teal: 0 0 0 1px rgb(62 224 208 / 0.3), 0 8px 40px -8px rgb(62 224 208 / 0.45);

  --breakpoint-3xl: 120rem;
}

:root {
  --dur-fast: 160ms;
  --dur-base: 240ms;
  --dur-spring: 480ms;
  --dur-enter: 560ms;
  --stagger: 70ms;
  --gutter: 16px;
  /* 160px fractal-noise tile; white specks whose alpha is the noise. Rendered once by the browser, then tiled. */
  --grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.9 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
@media (width >= 48rem) { :root { --gutter: 32px; } }
@media (width >= 64rem) { :root { --gutter: 64px; } }
@media (width >= 120rem) { :root { --gutter: 96px; } }

@utility site-container {
  width: 100%;
  max-width: calc(90rem + 2 * var(--gutter));
  margin-inline: auto;
  padding-inline: max(var(--gutter), env(safe-area-inset-left));
}
@utility section-y {
  padding-block: 96px;
  @media (width >= 48rem) { padding-block: 128px; }
  @media (width >= 80rem) { padding-block: 160px; }
  @media (width >= 120rem) { padding-block: 192px; }
}

@layer base {
  html {
    color-scheme: dark;
    background-color: var(--color-iron-950);
    overflow-x: clip; /* trap #3: never `hidden` — that makes <html> a scroll container and breaks position: sticky */
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
    scrollbar-color: var(--color-iron-600) var(--color-iron-950);
  }
  @media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
  body {
    margin: 0;
    min-height: 100svh;
    overflow-x: clip;
    background-color: var(--color-iron-950);
    color: var(--color-ink-300);
    font-family: var(--font-sans);
    font-size: var(--text-base);
    line-height: var(--text-base--line-height);
    font-synthesis: none;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  /* The ONLY fixed element on the site. body is never transformed, so this stays viewport-anchored (trap #1). */
  body::after {
    content: "";
    position: fixed;
    inset: 0;
    z-index: 60;
    pointer-events: none;
    background-image: var(--grain);
    background-size: 160px 160px;
    opacity: 0.03;
  }
  :focus-visible { outline: 2px solid var(--color-amber-400); outline-offset: 3px; }
  ::selection { background-color: rgb(255 194 71 / 0.28); color: var(--color-white); }
  h1, h2, h3 { color: var(--color-ink-100); text-wrap: balance; }
  p { text-wrap: pretty; }
}

@layer components {
  /* Scroll reveal (src/components/Reveal.tsx). Hidden only when JS runs (.js is set by an inline script in index.html). */
  .js [data-reveal] {
    opacity: 0;
    transform: translate3d(0, 16px, 0);
    transition: opacity var(--dur-enter) var(--ease-out), transform var(--dur-enter) var(--ease-out);
    transition-delay: calc(var(--reveal-i, 0) * var(--stagger));
  }
  .js [data-reveal][data-revealed] { opacity: 1; transform: none; }
  /* Failsafe: if hydration never happens, show everything after 4s. Reveal.tsx adds .reveal-ready on first use. */
  .js:not(.reveal-ready) [data-reveal] { animation: mrh-reveal-failsafe 1ms linear 4s forwards; }
  @keyframes mrh-reveal-failsafe { to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) {
    .js [data-reveal] { transform: none; transition: opacity var(--dur-enter) var(--ease-out); }
  }
}
```

---

## 6. Contracts

### 6.1 `src/config/site.ts` (verbatim — the single config file)

Must stay importable by Node directly (OG script): **no runtime imports** (only `import type`), erasable syntax only.

```ts
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE single source of truth for everything personal on mrh.lol.
// • Components read from here — never hard-code a name, handle, URL or bio anywhere else.
// • TODO(me)  = the owner hasn't supplied it yet. It stays null; the UI hides whatever is null.
// • EDITABLE  = copy the owner delegated ("you decide", "along those lines") — change freely.
// • Keep this file free of runtime imports: scripts/gen-assets.mjs imports it directly with Node.
// ─────────────────────────────────────────────────────────────────────────────────────────────
import type { AtlasStatKey, AtlasStats, Project } from '../data/types';

export interface ImageSet { avif: string; webp: string; png: string }
export interface AvatarConfig {
  /** 512×512 renditions — the 1x source on every layout. */
  src: ImageSet;
  /** 1024×1024 renditions for 2x screens; null if not exported. */
  src2x: ImageSet | null;
  /** Intrinsic size of `src`; reserves the layout before the image loads. */
  width: number;
  height: number;
  alt: string;
}
export interface Channel { label: string; handle: string; href: string }
export interface StatTile {
  key: AtlasStatKey;
  /** Text after the number. `{statKey}` placeholders are replaced with formatted numbers, e.g. '{npcs}'. */
  label: string;
}
export interface SiteConfig {
  origin: string;
  displayName: string;
  spokenName: string;
  identity: string;
  bio: string;
  interests: string[];
  location: { label: string; flourish: string | null };
  avatar: AvatarConfig | null;
  hero: {
    primaryCta: { label: string; href: string };
    secondaryCta: { label: string; href: string };
    scrollHint: string;
  };
  sections: Record<'about' | 'work' | 'contact', { id: string; index: string; title: string }>;
  flagship: {
    slug: string;
    title: string;
    url: string;
    kicker: string;
    summary: string;
    cta: string;
    screenshot: { widths: number[]; pattern: string; fallback: string; width: number; height: number; alt: string };
    stats: StatTile[];
    highlights: string[];
    statsFallback: AtlasStats;
    syncedOnFallback: string;
  };
  projectsFallback: Project[];
  forgeCard: { title: string; body: string; linkLabel: string; href: string };
  contact: {
    primary: 'discord' | 'email';
    intro: string;
    discord: { handle: string; altHandle: string | null; serverInvite: string | null };
    email: string | null;
    github: Channel;
    roblox: Channel | null;
    twitter: Channel | null;
    youtube: Channel | null;
    twitch: Channel | null;
    form: { enabled: boolean; title: string; note: string; success: string };
  };
  sourceUrl: string | null;
  seo: {
    title: string;
    description: string;
    ogImage: { src: string; width: number; height: number; alt: string };
    themeColor: string;
  };
}

export const site: SiteConfig = {
  origin: 'https://mrh.lol', // canonical origin, no trailing slash

  displayName: 'MrHarold',
  // Owner's answer to "real name". Used only as JSON-LD alternateName; no real name is published.
  spokenName: 'Mr Harold',
  // EDITABLE — owner: "you decide something cool". The "looking up" is the planes nod.
  identity: 'Code, games, and a habit of looking up.',
  // EDITABLE — owner: "gamer, programmer, something along those lines". **…** renders as amber emphasis.
  bio: "I'm MrHarold — a programmer who never really stopped being a gamer. I build the tools I wish existed for the games I play, like **Prospecting Atlas**, and I sweat the details nobody asked for. When I'm not shipping code, I'm probably in a flight sim or watching planes go over.",
  interests: ['gaming', 'programming', 'aviation'], // owner: gaming, programming, planes/aviation
  // Owner: "say location Cloud". `flourish` is a designer's joke (flight level 350 ≈ 35,000 ft cruise) — null drops it.
  location: { label: 'the Cloud', flourish: 'FL350' },

  avatar: null,
  // TODO(me): when public/avatar/ has the files, replace `null` above with:
  // {
  //   src:   { avif: '/avatar/avatar-512.avif',  webp: '/avatar/avatar-512.webp',  png: '/avatar/avatar-512.png' },
  //   src2x: { avif: '/avatar/avatar-1024.avif', webp: '/avatar/avatar-1024.webp', png: '/avatar/avatar-1024.png' },
  //   width: 512,
  //   height: 512,
  //   alt: 'TODO(me): describe the avatar, e.g. "Illustrated avatar of MrHarold"',
  // },

  hero: {
    primaryCta: { label: "See what I've built", href: '#work' },
    secondaryCta: { label: 'Get in touch', href: '#contact' },
    scrollHint: 'Scroll',
  },

  sections: {
    about: { id: 'about', index: '01', title: 'Who I am' },
    work: { id: 'work', index: '02', title: "What I've built" },
    contact: { id: 'contact', index: '03', title: 'Get in touch' },
  },

  flagship: {
    slug: 'prospecting-atlas',
    title: 'Prospecting Atlas',
    url: 'https://prospecting.mrh.lol',
    kicker: 'Flagship',
    // PROMPT.md §4
    summary: 'A fan database and toolset for the Roblox game Prospecting! — scraped from the official wiki, rebuilt around the questions players actually ask.',
    cta: 'Open Prospecting Atlas',
    screenshot: {
      // Written by `npm run gen:shots` (scripts/shoot-atlas.mjs) from the live site. Intrinsic 1440×900 (16:10).
      widths: [720, 1440],
      pattern: '/projects/prospecting-atlas-{w}.{ext}', // ext ∈ avif | webp
      fallback: '/projects/prospecting-atlas-1440.jpg',
      width: 1440,
      height: 900,
      alt: 'The Prospecting Atlas home page: search bar, mineral and dig-site counts, and the most valuable minerals.',
    },
    stats: [
      { key: 'minerals', label: 'minerals, every drop rate' },
      { key: 'digSites', label: 'dig sites with full loot tables' },
      { key: 'quests', label: 'quests · {npcs} NPCs' },
      { key: 'craftables', label: 'craftables' },
      { key: 'pages', label: 'pages, all prerendered' },
      { key: 'discordCommands', label: 'Discord bot slash commands' },
    ],
    highlights: ['A museum planner over {museumDisplays} displays', 'A luck model that re-prices every drop rate'],
    // Used when the build-time fetch fails. Snapshot taken 2026-10-01 from https://prospecting.mrh.lol:
    //   sitemap.xml → pages (194 <loc>), minerals (/minerals/* = 113), digSites (/sites/* = 33),
    //                 locations (/locations/* = 28), syncedOn (newest <lastmod> = 2026-09-30)
    //   /  meta description → quests (107), craftables (67)
    //   /quests/ <title> → npcs (120)      /museum/ <title> → museumDisplays (18)
    //   discordCommands (11) is not published on the site — from PROMPT.md §4; update by hand.
    statsFallback: { minerals: 113, digSites: 33, locations: 28, quests: 107, npcs: 120, craftables: 67, museumDisplays: 18, pages: 194, discordCommands: 11 },
    syncedOnFallback: '2026-09-30',
  },

  // Projects normally come from Supabase at build time (scripts/gen-data.mjs). This is used only when that fetch
  // is unavailable. Owner: "none for now".
  projectsFallback: [],
  forgeCard: {
    title: 'More in the forge',
    body: 'New tools land here as they ship.',
    linkLabel: 'Follow along on GitHub',
    href: 'https://github.com/Makogai',
  },

  contact: {
    primary: 'discord',
    intro: 'Discord is the fastest way to reach me.', // EDITABLE — owner made Discord the primary route
    discord: {
      handle: 'makogai',
      altHandle: 'mrharold01',
      // Discord profile URLs need numeric IDs, so the primary action is "copy handle".
      serverInvite: null, // TODO(me): e.g. 'https://discord.gg/xxxx' — shows "Join the server" when set
    },
    email: 'contact@mrh.lol', // owner: "for now use contact@mrh.lol"
    github: { label: 'GitHub', handle: 'Makogai', href: 'https://github.com/Makogai' },
    roblox: null, // TODO(me): { label: 'Roblox', handle: '<username>', href: 'https://www.roblox.com/users/<id>/profile' }
    twitter: null, // TODO(me): not provided
    youtube: null, // TODO(me): not provided
    twitch: null, // TODO(me): not provided
    form: {
      // Needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY at build time; production hides the form without them.
      enabled: true,
      title: 'Leave a message',
      note: 'Goes straight to my inbox. No newsletter, no tracking.', // EDITABLE
      success: "Got it — I'll reply at {replyTo}.", // EDITABLE
    },
  },

  sourceUrl: null, // TODO(me): public repo URL once it exists — the footer shows "Source" only when set

  seo: {
    title: 'MrHarold — code, games, and a habit of looking up', // EDITABLE
    description: "I'm MrHarold — a programmer who never really stopped being a gamer. I build tools for the games I play, like Prospecting Atlas.", // EDITABLE
    ogImage: { src: '/og.png', width: 1200, height: 630, alt: 'MrHarold — the name as a glowing chip on a circuit board whose traces turn into ore veins.' },
    themeColor: '#06080e',
  },
};
```

### 6.2 Build-time data (`src/data/*`) — decision: prebuild script → gitignored JSON + glob import

Chosen over a Vite virtual module because the client and SSR builds are two separate Vite runs: a plugin would fetch
twice and could get different answers → hydration mismatch. One prebuild run writes one file both builds read.
`import.meta.glob` (validated) means a fresh clone without the file still compiles and renders the config fallback.

`src/data/types.ts` (verbatim):

```ts
// Contracts for build-time data. Producer: scripts/gen-data.mjs. Consumer: src/data/index.ts.
export type AtlasStatKey =
  | 'minerals' | 'digSites' | 'locations' | 'quests' | 'npcs' | 'craftables' | 'museumDisplays' | 'pages' | 'discordCommands';
export type AtlasStats = Record<AtlasStatKey, number>;

export type ProjectStatus = 'live' | 'beta' | 'wip' | 'archived';
export type Accent = 'amber' | 'teal' | 'violet' | 'blue';

export interface ProjectImage { src: string; width: number; height: number; alt: string }
export interface Project {
  slug: string;
  title: string;
  tagline: string;
  description: string | null;
  url: string | null; // https only
  repoUrl: string | null; // https only
  status: ProjectStatus;
  tags: string[];
  accent: Accent;
  image: ProjectImage | null;
}

/** Exact shape of src/data/generated.json. Bump `schema` (and src/data/index.ts) on any breaking change. */
export interface GeneratedData {
  schema: 1;
  /** ISO-8601 UTC time of the gen-data run. The footer year comes from here so SSR and client agree. */
  builtAt: string;
  atlas: {
    /** ISO time of a successful Atlas fetch; null when every Atlas request failed. */
    fetchedAt: string | null;
    /** Only stats that were fetched AND passed the plausibility check. `discordCommands` is never live. */
    stats: Partial<AtlasStats>;
    /** 'YYYY-MM-DD' — newest <lastmod> in the Atlas sitemap. */
    syncedOn: string | null;
  };
  /** Published projects from Supabase, already sorted. null = not fetched (env missing / request failed). */
  projects: Project[] | null;
}

/** What components consume. */
export interface BuildData {
  builtAt: string;
  buildYear: number;
  atlas: { stats: AtlasStats; live: Record<AtlasStatKey, boolean>; syncedOn: string; isLive: boolean };
  projects: Project[];
  projectsSource: 'supabase' | 'fallback';
}
```

`src/data/index.ts` (verbatim):

```ts
import { site } from '../config/site';
import type { AtlasStatKey, AtlasStats, BuildData, GeneratedData } from './types';

// generated.json is written by scripts/gen-data.mjs before every build and is gitignored. A glob instead of a static
// import keeps a fresh clone compiling: when the file is missing the glob is empty and everything falls back to site.ts.
const files = import.meta.glob<GeneratedData>('./generated.json', { eager: true, import: 'default' });
const gen: GeneratedData | undefined = files['./generated.json'];

const fallback = site.flagship.statsFallback;
const stats: AtlasStats = { ...fallback };
const live = {} as Record<AtlasStatKey, boolean>;
for (const key of Object.keys(fallback) as AtlasStatKey[]) {
  const v = gen?.atlas.stats[key];
  live[key] = typeof v === 'number';
  if (typeof v === 'number') stats[key] = v;
}

// Dev-only path: production builds always have generated.json (gen-data runs first and always writes).
const builtAt = gen?.builtAt ?? new Date().toISOString();

export const buildData: BuildData = {
  builtAt,
  buildYear: Number(builtAt.slice(0, 4)),
  atlas: {
    stats,
    live,
    syncedOn: gen?.atlas.syncedOn ?? site.flagship.syncedOnFallback,
    isLive: Boolean(gen?.atlas.fetchedAt),
  },
  projects: gen?.projects ?? site.projectsFallback,
  projectsSource: gen?.projects ? 'supabase' : 'fallback',
};
```

Example `generated.json`:

```json
{
  "schema": 1,
  "builtAt": "2026-10-01T15:20:00.000Z",
  "atlas": {
    "fetchedAt": "2026-10-01T15:20:01.412Z",
    "stats": { "pages": 194, "minerals": 113, "digSites": 33, "locations": 28, "quests": 107, "craftables": 67, "npcs": 120, "museumDisplays": 18 },
    "syncedOn": "2026-09-30"
  },
  "projects": []
}
```

### 6.3 Environment

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
```

`src/lib/env.ts` (scaffold):

```ts
// Build-time constants (Vite inlines VITE_*). The anon/publishable key is meant to be public.
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const env = { supabaseUrl: url || null, supabaseAnonKey: key || null } as const;
export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

/** New `sb_publishable_…` keys belong on `apikey` only (Supabase docs); legacy anon keys are JWTs and also want Bearer. */
export function supabaseHeaders(anonKey: string): Record<string, string> {
  const h: Record<string, string> = { apikey: anonKey, 'Content-Type': 'application/json', Accept: 'application/json' };
  if (anonKey.startsWith('eyJ')) h.Authorization = `Bearer ${anonKey}`;
  return h;
}
```

`scripts/gen-data.mjs` implements the same header rule in plain JS (it cannot import TS on Node 22).

### 6.4 Shared primitives and helpers (scaffold builds; everyone uses)

`src/lib/cx.ts` — `cx(...parts: Array<string | false | null | undefined>): string`.

`src/lib/format.ts` (locale-independent so SSR and browser print the same thing):
- `formatNumber(n: number): string` → `1,234` (manual grouping).
- `formatDayUTC(isoDay: string): string` → `'2026-09-30'` → `30 Sep 2026` (month table, no `toLocaleDateString`).
- `fillTemplate(text: string, values: Record<string, number | string>): string` → replaces `{key}`; numbers via `formatNumber`.

`src/lib/inline.tsx` — `renderEmphasis(text: string, className?: string): ReactNode[]`: splits on `**…**` and wraps
those segments in `<strong className={className ?? 'font-[inherit] text-amber-400'}>` with stable keys. The only
markup config copy may use.

`src/lib/media.ts`:
- `useMediaQuery(query: string, initial = false): boolean` — returns `initial` on the server and first client render,
  subscribes in `useEffect` (SSR-safe; a change after hydration is a normal state update).
- `usePrefersReducedMotion(): boolean` → `useMediaQuery('(prefers-reduced-motion: reduce)')`.
- `prefersReducedMotion(): boolean` — imperative, client-only (for effects/engine).

`src/components/Reveal.tsx` (verbatim core; scaffold may add typings):

```tsx
import { createElement, useCallback, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

let io: IntersectionObserver | null = null;
const pending = new Set<Element>();

function reveal(el: Element) {
  (el as HTMLElement).dataset.revealed = '';
  pending.delete(el);
  io?.unobserve(el);
}

function observer(): IntersectionObserver | null {
  if (io || typeof IntersectionObserver === 'undefined') return io;
  document.documentElement.classList.add('reveal-ready'); // disables the CSS failsafe in global.css
  io = new IntersectionObserver(
    (entries) => { for (const e of entries) if (e.isIntersecting) reveal(e.target); },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  // Trap #4: IO callbacks are suspended while the tab is hidden — re-check by hand when it comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    for (const el of [...pending]) {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) reveal(el);
    }
  });
  return io;
}

/** Ref callback: reveals the element once when it scrolls into view. Never re-hides. */
export function useReveal<T extends Element>() {
  return useCallback((el: T | null) => {
    if (!el) return;
    const obs = observer();
    if (!obs) { reveal(el); return; }
    pending.add(el);
    obs.observe(el);
    return () => { pending.delete(el); obs.unobserve(el); };
  }, []);
}

type RevealTag = 'div' | 'li' | 'article' | 'section' | 'header' | 'figure' | 'p' | 'span';
export interface RevealProps extends HTMLAttributes<HTMLElement> { as?: RevealTag; index?: number; children?: ReactNode }

/** <Reveal index={i}> staggers by --stagger × min(i, 6). */
export function Reveal({ as = 'div', index = 0, style, ...rest }: RevealProps) {
  const ref = useReveal<HTMLElement>();
  return createElement(as, { ...rest, ref, 'data-reveal': '', style: { ...style, '--reveal-i': Math.min(index, 6) } as CSSProperties });
}
```

`src/components/Button.tsx`:
- `Button` (`<button>`, default `type="button"`) and `ButtonLink` (`<a>`), sharing `buttonClasses({ variant, size })`.
- Props: `variant: 'primary' | 'ghost'` (default primary), `size: 'md' | 'lg'` (48 / 56 px tall, `px-5`/`px-7`),
  `magnetic?: boolean`, `icon?: ReactNode`, `iconPosition?: 'start' | 'end'`, and for `ButtonLink` `external?: boolean`
  (adds `target="_blank" rel="noopener noreferrer"`, an up-right arrow icon and
  `<span className="sr-only"> (opens in a new tab)</span>`). All native attributes pass through; refs forwarded.
- Primary: `bg-amber-400 text-iron-950`, weight 650; hover `bg-amber-300 shadow-glow-amber`. Ghost: `text-ink-100
  bg-ink-100/[0.03] shadow-hairline-strong`; hover `bg-ink-100/[0.07]` + `shadow-glow-teal` at reduced strength.
  `rounded-pad`. Transitions: colors/shadows `--dur-base --ease-out`; transform `--dur-spring --ease-spring`
  (motion-safe only). Press: `--press: 0.97` on `:active`.
- Transform is `translate3d(var(--mx,0px), var(--my,0px), 0) scale(var(--press,1))`; the inner label span gets
  `translate3d(calc(var(--mx,0px) * 0.5), calc(var(--my,0px) * 0.5), 0)` for a slight parallax.

`src/components/useMagnetic.ts` — `useMagnetic<T extends HTMLElement>(enabled: boolean, opts?: { strength?: number; max?: number })`
returns a ref callback. Activates only if `enabled` and `matchMedia('(hover: hover) and (pointer: fine)')` and not
reduced motion. `pointermove` (rAF-batched) sets `--mx/--my` = offset from center × strength (0.28), clamped to ±max
(8 px); `pointerleave` resets to 0 (the spring transition carries it home). Only the two hero CTAs pass `magnetic`.

`src/components/Section.tsx`:

```ts
export interface SectionProps {
  id: string;                         // in-page target (#about, #work, #contact)
  index: string;                      // '01' — decorative, aria-hidden
  title: string;                      // h2 text
  titleStyle?: 'display' | 'label';   // display = big h2 (default); label = small mono h2 (About)
  intro?: ReactNode;                  // optional paragraph under a display title
  className?: string;                 // extra classes on <section> (e.g. background blooms)
  children: ReactNode;
}
```

Renders `<section id={id} aria-labelledby={`${id}-title`} className="relative section-y …">` →
`<div className="site-container">` → header row: mono `xs` `ink-400` `tracking-label` uppercase index (`aria-hidden`)
+ a 48×1 px `ink-100/15` hairline; then:
- `display`: `<h2 id=… className="mt-6 text-display font-[800] [font-stretch:112.5%] tracking-display">` (+ intro
  `mt-6 text-lg md:text-xl text-ink-300 max-w-[52ch]`), content starts `mt-12 xl:mt-16`.
- `label`: the h2 sits *in* the header row in the mono label style (`text-xs uppercase tracking-label text-ink-300`),
  content starts `mt-8`.
Header and title are wrapped in `Reveal`.

`src/components/TextLink.tsx` — inline link: `text-ink-100 underline decoration-ink-100/30 underline-offset-4
hover:text-amber-300 hover:decoration-amber-400 transition-colors duration-(--dur-fast)`; `external` like ButtonLink.

`src/components/icons.tsx` — named exports, 24×24 viewBox, `currentColor`, `aria-hidden="true"` and
`focusable="false"` by default, `size` prop (default 20): `IconArrowRight`, `IconArrowUpRight`, `IconArrowDown`,
`IconArrowUp`, `IconCopy`, `IconCheck`, `IconMail`, `IconAlert`, `IconSpinner` (motion-safe spin), `IconGitHub`,
`IconDiscord`, `IconRoblox`, `IconX`, `IconYouTube`, `IconTwitch`. Brand paths copied from simple-icons (CC0) —
fetch e.g. `https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/discord.svg` and inline the `d`; UI glyphs from
Lucide (ISC) inlined. Credit both in a header comment. No icon packages as dependencies.

### 6.5 HTML shell, SSR entry, prerender

`index.html` (scaffold creates exactly this; seo_deploy owns it afterwards and may only change things inside `<head>`
— never the markers, the `.js` script, `#root` or the module script):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="dark" />
    <!-- scripts/prerender.mjs replaces everything between the seo-head markers with renderHead() (src/seo/head.ts). -->
    <!--seo-head--><title>MrHarold</title><!--/seo-head-->
    <!-- Lets CSS hide reveal targets only when JS will reveal them; no-JS visitors see everything. -->
    <script>document.documentElement.classList.add('js')</script>
  </head>
  <body>
    <div id="root"><!--app-html--></div>
    <script type="module" src="/src/entry-client.tsx"></script>
  </body>
</html>
```

`src/entry-client.tsx`:

```tsx
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root')!;
const app = <StrictMode><App /></StrictMode>;
// Dev serves the raw template (only the <!--app-html--> comment) — nothing to hydrate there.
if (root.firstElementChild) hydrateRoot(root, app);
else createRoot(root).render(app);
```

`src/entry-server.tsx`:

```tsx
import { StrictMode } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { App } from './App';
import { NotFound } from './seo/NotFound';
export { renderHead, renderNotFoundHead } from './seo/head';

export function render(): string {
  return renderToString(<StrictMode><App /></StrictMode>);
}
// The 404 page ships without JS: static markup, same CSS and fonts.
export function renderNotFound(): string {
  return renderToStaticMarkup(<NotFound />);
}
```

`scripts/prerender.mjs` (scaffold): resolve `outDir` exactly like vite.config (`MRH_PKG` → `dist-<pkg>`, else
`dist`); import `${outDir}-ssr/entry-server.js` via `pathToFileURL`; read `${outDir}/index.html`; **throw** if
either marker (`<!--seo-head-->…<!--/seo-head-->`, `<!--app-html-->`) is missing; write:
1. `index.html` = template with the seo region replaced by `renderHead()` and `<!--app-html-->` by `render()`.
2. `404.html` = template with the seo region replaced by `renderNotFoundHead()`, `<!--app-html-->` by
   `renderNotFound()`, and every `<script type="module" …></script>` and `<link rel="modulepreload" …>` removed
   (no hydration on the 404). The stylesheet and font preload stay.
Then delete `${outDir}-ssr`. Log one line per file with byte size.

`scripts/qa/budget.mjs` (scaffold): gzip (level 9) every `${outDir}/assets/*.js`, print a table (file, raw, gzip),
the total, and the share of the lazy hero chunk; **exit 1** if total gzip > 153,600 bytes (150 KB). Also print CSS and
font sizes for information.

Stubs scaffold must create so the app compiles from the start (each owned by the named package afterwards):
`src/hero/Hero.tsx` (`<header id="top"><h1>{site.displayName}</h1></header>`), `src/hero/veins/types.ts`
(**verbatim §6.6**), `src/hero/veins/generate.ts` (exports `VEIN_SEED`, `NodeKind`, and a `generateNetwork` that
returns a valid empty `Network`), `src/sections/About.tsx`, `src/sections/Work.tsx`, `src/sections/Footer.tsx`,
`src/contact/Contact.tsx` (each a minimal `<section id=…><h2>…</h2></section>` / `<footer>` from config),
`src/seo/head.ts` (`renderHead()` → `<title>…</title><meta name="description" …>` from config,
`renderNotFoundHead()` → `<title>404 — mrh.lol</title><meta name="robots" content="noindex">`),
`src/seo/NotFound.tsx` (`<main><h1>404</h1></main>`), `scripts/gen-data.mjs` (writes the §6.2 shape with
`fetchedAt: null, stats: {}, syncedOn: null, projects: null`, honours `--if-missing`).

### 6.6 Network contract (`src/hero/veins/types.ts`, verbatim — shared by the hero engine and the OG script)

Types only: Node strips `import type` but cannot resolve extensionless runtime imports, so runtime constants live in
`generate.ts`, and `generate.ts` has **no runtime imports**.

```ts
export interface Rect { x: number; y: number; w: number; h: number }
export type NetworkProfile = 'desktop' | 'phone' | 'og';

export interface GenerateOptions {
  width: number;          // field width, CSS px
  height: number;         // field height, CSS px
  chip: Rect;             // the hero content block, padded. Traces never enter it; pins sit on its top/right edges.
  avoid?: Rect[];         // extra keep-outs without pins (e.g. the scroll hint)
  seed: number;           // uint32 — same inputs ⇒ identical network
  profile: NetworkProfile;
}

/** 0 Bend · 1 Pad · 2 Via · 3 Pin · 4 Nodule · 5 Junction. Runtime constants: `NodeKind` in generate.ts. */
export type NodeKindValue = 0 | 1 | 2 | 3 | 4 | 5;

export interface Network {
  width: number;
  height: number;
  nodeCount: number;
  edgeCount: number;
  nx: Float32Array;       // node x, CSS px
  ny: Float32Array;       // node y, CSS px
  nkind: Uint8Array;      // NodeKindValue
  nbirth: Float32Array;   // growth distance at which the node appears
  ea: Uint32Array;        // edge start (the end nearer its root)
  eb: Uint32Array;        // edge end
  elen: Float32Array;     // edge length, CSS px
  ebirth: Float32Array;   // growth distance at the far end (eb) — reveal order
  efar: Float32Array;     // 0 at the chip … 1 in the far field (smoothstep of distance to the chip)
  epcb: Uint8Array;       // 1 = 45°-snapped PCB trace, 0 = organic vein
  ewidth: Float32Array;   // stroke width, CSS px
  adjStart: Uint32Array;  // CSR adjacency: edges touching node i are adjEdge[adjStart[i] .. adjStart[i+1]-1]
  adjEdge: Uint32Array;
  pins: Uint32Array;      // chip pin node ids, in order along the chip edges
  maxBirth: number;
  chip: Rect;             // echo of the input (silkscreen drawing)
}
```

`generate.ts` exports: `export const VEIN_SEED = 0x4d724861;` ("MrHa"), `export const NodeKind = { Bend: 0, Pad: 1,
Via: 2, Pin: 3, Nodule: 4, Junction: 5 } as const;`, `export function generateNetwork(opts: GenerateOptions): Network`.

### 6.7 Contact RPC contract

- `POST {VITE_SUPABASE_URL}/rest/v1/rpc/submit_contact` with headers from `supabaseHeaders()` and body
  `{ "p_name": string, "p_reply_to": string, "p_message": string, "p_website": string, "p_elapsed_ms": number }`.
- Success: HTTP 200, body `{"ok": true}` (honeypot/too-fast submissions also get this — bots learn nothing).
- Errors (PostgREST maps `RAISE sqlstate 'PTxxx'` to HTTP xxx; body `{ code, message, details, hint }`):
  `400 invalid_name` · `400 invalid_reply_to` · `400 invalid_message` · `429 rate_limited` (per IP hash) ·
  `429 busy` (global daily cap) · anything else → generic server error. A thrown `fetch` → network error.
- Validation (client mirrors server exactly): name trimmed 1–80 chars, no control characters; reply-to trimmed
  2–254 chars, either an email `^[^@\s]+@[^@\s]+\.[^@\s]+$` or a Discord username `^@?[a-z0-9_.]{2,32}$`
  (case-insensitive) without `..`; message trimmed 10–4000 chars.

### 6.8 CSS conventions

- Prefer Tailwind utilities in TSX. A package may own **one** CSS file imported by its top component
  (`src/hero/hero.css`, `src/sections/sections.css`, `src/contact/contact.css`) for keyframes and selectors
  utilities can't express. Wrap rules in `@layer components { … }` so utilities still win. If you use `@apply` or
  theme functions, start the file with `@reference "../styles/global.css";` (validated). Use `var(--color-…)`,
  `var(--ease-…)`, `var(--dur-…)` — never raw hex/ms that duplicates a token.
- Prefix custom classes with the package (`hero-…`, `sec-…`, `ct-…`) to avoid collisions.
- `src/seo/NotFound.tsx` uses utilities only (it is never in the client graph, so a CSS import there would not ship;
  Tailwind still scans the file — validated).

---

## 7. Signature effect — the Forge Board (hero package)

### 7.1 Composition

- The hero is a full-viewport `<header id="top">` with a static CSS background (also the canvas-failure fallback):
  `radial-gradient(60% 50% at 28% 80%, rgb(255 194 71 / 0.065), transparent 70%)` (forge ember behind the name),
  `radial-gradient(50% 40% at 85% 8%, rgb(96 165 250 / 0.05), transparent 70%)` (cool high haze),
  `linear-gradient(180deg, #161b28 0%, #0a0d16 55%, #06080e 100%)`. On < 768 px the ember moves to `50% 88%`.
- Two stacked canvases inside `.hero-fx` (absolute, inset 0, `aria-hidden`, `pointer-events: none`): **static**
  (the board, redrawn only on (re)generation and growth) and **dynamic** (light, pulses, sparks; cleared every
  frame). The browser composites them; we never re-blit the board per frame.
- The **chip** = union of the h1, identity line and CTA row rects relative to the hero, padded 24 px (16 px on
  phones). Traces never enter it → text never sits on canvas pixels (contrast guaranteed). Pins (3×6 px copper
  leads) sit on its top edge, and on its right edge when ≥ 180 px of field remains there. Silkscreen detail: 16 px
  corner brackets at the chip corners (1 px, ink-300 @ 0.18) and a pin-1 dot (r 2, amber @ 0.5) outside the top-left
  corner. No text in the canvas.
- A 160 px bottom fade (`::after`, transparent → iron-950) blends the board into the page.

### 7.2 Generation (`generate.ts`, pure, seeded, validated in prototype)

PRNG: mulberry32(seed). Directions: `DIR8[i] = i × 45°` (index 6 = up, 0 = right). `far(x,y) = smoothstep(70,
FAR, distance from (x,y) to the chip rect)`.

| Constant | desktop | phone | og |
|---|---|---|---|
| `PITCH` (pin & bus spacing) | 12 | 10 | 12 |
| target nodes | clamp(round(W·H / 760), 900, 3600) | clamp(round(W·H / 640), 380, 640) | 1100 |
| edge roots | 10 | 5 | 8 |
| `FAR` (organic distance) | 460 | 260 | 380 |
| max active heads | 400 | 160 | 300 |

1. **Pins & buses.** Along the chip's top edge (y = chip.y − 2), from chip.x + 2·PITCH to chip.right − 2·PITCH:
   buses of n = 2…6 consecutive pins, then a gap of 1…4 pitches. Each pin is a `Pin` node and a PCB head
   `{dir: 6 (up), energy: 420 + r·760, width: 1.25}`. A bus shares `turnAt = 24 + 12·randint(0,5)`,
   `turn = ±1` (one 45° step) and `leg2 = 36 + 12·randint(0,7)`. Same along the right edge (dir 0) when there is
   room (never on phones).
2. **Bus legs stay parallel through the bend (miter):** lane = busIndex − (n−1)/2; leg 0 length =
   `turnAt + turn · lane · PITCH · tan(22.5°) · (dir === up ? −1 : 1)`; then `dir += turn`, leg 1 length = `leg2`.
   After two legs each trace is free.
3. **Edge roots:** vein heads entering from the top/left/right edges (never the bottom), 20 px outside the field,
   aimed at (0.6W, 0.45H) ± 0.45 rad, `energy 500…1200`, `width 1.6`. Side roots pick y ∈ [0, min(0.8H, chip.y − 40)].
4. **Growth loop** until nodes ≥ target: pick head `floor(r · min(heads, 24))` (near-breadth-first so buses grow
   evenly).
   - **PCB → vein:** after ≥ 3 steps, with probability `far × 0.22` per step the head becomes a vein (angle =
     its current direction). Copper cools into ore.
   - **PCB step:** p 0.34 turn ±45°, p 0.06 turn ±90°; length = 12 · randint(2,6).
   - **Vein step:** `ang += (r − 0.5)·0.55 + sin(x·0.004 + y·0.003 + seed)·0.06`; length 7…16.
   - **Reject** if outside [−60, W+60]×[−60, H+60] (end head), or inside the chip/avoid rects padded 14 px, or (PCB)
     closer than 5.5 px to any edge not touching the head's node. PCB retries ≤ 3 times rotating ±45°; then
     **T-junction**: with p 0.5 connect to the nearest node within 16 px (outside the chip) and mark it `Via`;
     else end with `Pad` (55 %) / `Via` (45 %). Vein: closer than 3.2 px → with p 0.7 **merge** into the nearest
     node within 10 px (anastomosis → loops, so pulses interfere), else end (`Nodule` 35 %).
   - **Accept:** new node + edge (`epcb`, `efar`, width, `ebirth = head.birth + len`, `nbirth` of the new node =
     that). Width: PCB ×0.995 (min 1.0), vein ×0.982 (min 0.5). `energy −= len`.
   - **Branch** (steps > 2, heads < max): PCB p 0.09 → child turns ±90°, node becomes `Junction`; vein p 0.075 →
     child angle ± (0.45…0.95) rad. Child energy ×0.62, width ×0.8, inherits birth.
   - **Energy ≤ 0:** PCB → `Pad` 55 % / `Via` 45 %; vein → `Nodule` 40 % / `Bend`.
5. **Connected refill** (when no heads remain): probe 48 random points outside the chip (+40 px); take the emptiest
   by edge count in its 7×7-cell neighbourhood; if that count > 6 the field is full → stop. Else sprout a vein head
   from the nearest existing node (not within 20 px of the chip) aimed at the probe, `energy 160 + d + r·240`,
   `width 0.9`, **birth = that node's `nbirth`** (it grows after its parent). Sprouting from the graph — not new
   roots — keeps the board one connected component, so a click pulse can reach everywhere. (Validated: 971 → 1,637
   nodes and full coverage at 1440×900.)
6. **Pack** into the typed arrays of §6.6; CSR adjacency; `maxBirth`.

Generation grid: 16 px cells over [−80, W+80]×[−80, H+80] storing edge ids (Int32 CSR rebuilt at the end, or a
chunked list during growth). Budget: ≤ 12 ms desktop / ≤ 6 ms phone on a mid laptop (prototype: 17–25 ms with JS
Maps; typed arrays + an integer grid get under 12).

### 7.3 Runtime data structures (engine-internal)

- **Edge grid** for cursor lookup: 48 px cells, CSR (`cellStart: Uint32Array(cols·rows+1)`, `cellEdges: Uint32Array`);
  an edge is listed in every cell its bbox touches. Nearest edge = scan 3×3 cells (then 5×5 if empty) with
  point-to-segment distance.
- **Dijkstra** on typed arrays with a binary heap (`Float32Array` keys, `Uint32Array` node ids, capacity 2E);
  multi-source; optional `maxDist` cut-off; optional predecessor `Int32Array` (flights).
- **Pulse pool:** fixed 7 slots (4 click, 2 ambient/boot, 1 flight) each with a pre-allocated `Float32Array(V)` of
  arrival distances. Reuse; never allocate per frame. Colour strings precomputed (16 alpha steps per hue). Sprites
  (radial glows) pre-rendered once into small offscreen canvases: amber spark 32 px (white-hot core `#fff6e0`),
  teal spark 24 px, contrail head 24 px (`#e8f1ff` → `#60a5fa`).

### 7.4 Rendering

Static layer (DPR-scaled once per (re)generation):
- **Bloom pass** (`'lighter'`): PCB edges with `efar < 0.5`, width 5 px, same hue @ 0.05.
- **Core pass:** PCB hue = lerp(copper `rgb(255,194,71)` → steel `rgb(150,162,188)`, min(1, efar·1.4)), alpha
  `0.36 − 0.12·efar`. Vein hue = lerp(warm steel `rgb(170,166,160)` → teal `rgb(62,224,208)`, min(1, 0.25 + efar)),
  alpha `0.22 − 0.06·efar`. Width = `ewidth`. Round caps.
- **Nodes:** Pad = filled r 2.3 amber @ 0.42; Via = ring r 3 (1 px, ink-300 @ 0.38) + hole dot r 0.9 @ 0.5;
  Pin = 3×6 rect amber @ 0.55 (6×3 on the right edge); Junction = dot r 1.6 amber @ 0.35; Nodule = dot r 1.5 in
  teal (50 %), violet (25 %), blue (25 %) by a hash of its position, @ 0.75.
- **Batching:** bucket edges by (pcb, round(efar·7), width bucket) → ≤ 48 `stroke()` calls for the whole board.

Dynamic layer (cleared each frame, `globalCompositeOperation = 'lighter'`):
- Partial-edge drawing: a lit sub-segment [s0, s1] along an edge is a `lerp` between its endpoints.
- Pulses draw in 3 bands (head 12 px @ 1.0, mid @ 0.55, tail @ 0.22 × intensity), batched into 3 paths per pulse.
- Sprites via `drawImage` (cap 48 head sprites per pulse per frame).

### 7.5 Behaviours

- **Growth (entrance):** over 1600 ms (1200 phone), ease-out cubic, the front moves to the 88th-percentile
  `ebirth`. Edges with `ebirth ≤ front` are appended to the **static** canvas incrementally (only new edges each
  frame; node decorations once `nbirth ≤ front`); edges straddling the front draw their partial length on the
  dynamic layer with an amber spark at the tip — molten copper running out of the pins while veins creep in from
  the edges. At the end: redraw the static layer cleanly once, call `onIgnite`, launch the **boot pulse**.
- **Creep ("grows slowly"):** the remaining 12 % of edges reveal linearly over the next 40 s with dim teal tip
  sparks, then growth stops for good.
- **Boot pulse:** multi-source from all pins, amber, 700 px/s, max radius 900 px, intensity 0.9.
- **Ambient breathing:** every 2.6–4.2 s a weak teal pulse from a random pin or pad: 380 px/s, max 420 px,
  tail 90 px, intensity 0.5.
- **Click / tap pulse:** origin = nearest node within 120 px of the point (else nearest overall). Dijkstra from it.
  950 px/s, tail 160 px, intensity `exp(−r/900)`, white-hot head sprites; for every edge the wave enters from *each*
  end that it reaches (`d_a`, `d_b`), so waves meeting from two sides overlap and glow brighter under `'lighter'`.
  Pads/vias with |dist − r| < 8 px flash (small glow). Max 4 concurrent; recycle the oldest.
- **Cursor light (the lantern):** light position L eases toward the pointer, `L += (P − L)·(1 − e^(−10·dt))`
  (~100 ms lag — the light is *dragged*). Find the nearest edge to L (≤ 200 px) and the projection Q; bounded
  Dijkstra from Q's edge endpoints (seeded with their distances to Q) out to R = 240 px (180 phone). Each reached
  edge glows amber-300 at `0.85 · (1 − g/R)² · (1 − smoothstep(40, 220, |L − Q|))`, width + 0.5; a 36 px hot-spot
  sprite at Q. Recompute only when L moved > 0.5 px.
- **Wander:** coarse pointers always, and fine pointers after 4 s idle or when the pointer leaves the hero: the
  target follows a slow Lissajous around (0.5W, 0.35H) with radii (0.32W, 0.18H) and periods 23 s / 17 s.
- **Flight (aviation nod, rare):** every 16–28 s (skip if a click pulse is running): start node near the left or top
  edge, end near the right edge (path ≥ 0.6W; 1 in 3 flights end on a random chip pin = "landing"). Dijkstra with
  predecessors → polyline. The head travels at 360 px/s: a crisp 2 px `#e8f1ff` dot with a 24 px blue halo; a
  280 px contrail behind it fades from 0.55 → 0 in 6 bands (`#cfe3ff` → `blue-400`); passed edges linger at 0.18 and
  dissipate over 2.5 s. On landing: a ring expanding 0 → 14 px over 600 ms and the pin flashes amber. Never more
  than one flight. Not on reduced motion.
- **Events:** `pointermove` on `window` (passive) for the light; `pointerdown` on the hero when
  `pointerType === 'mouse'`; `click` on the hero when the last pointer type wasn't mouse and `event.detail > 0`
  (taps, not keyboard activation, not scroll gestures). Never `preventDefault`. Clicking a CTA may pulse too.

### 7.6 Lifecycle and scheduling

1. `Hero.tsx` renders the chip content and `HeroCanvas` (SSR: the `.hero-fx` wrapper + two empty canvases).
2. `HeroCanvas` `useEffect`: if `HTMLCanvasElement.prototype.getContext` is missing → stop (gradient stays). Else
   wait for idle (`requestIdleCallback` with `timeout: 800`, fallback `setTimeout(…, 120)`) then
   `import('./veins/engine')` → its own lazy chunk, never in the entry bundle, so it cannot block LCP.
3. Engine start: await `document.fonts.ready` (max 1200 ms) so the chip is measured with the real font → measure →
   **task 1:** `generateNetwork` → `requestAnimationFrame` → **task 2:** size canvases, draw the first static frame →
   set `data-ready` on `.hero-fx` (opacity 0 → 1 over 900 ms `--ease-out`) → start the rAF loop (unless reduced
   motion). If fonts finish later and the chip moved > 12 px, regenerate with a quick 200 ms fade-out / 400 ms fade-in.
4. **Pause completely** when hidden or scrolled past: `running = visible && inView && !reducedMotion && !failed`.
   `inView` from an `IntersectionObserver` on the hero (threshold 0). On `visibilitychange`: hidden → cancel the
   rAF; visible → **re-check `inView` with `getBoundingClientRect()`** (IO callbacks were suspended — trap #4), then
   resume. Simulation time advances only while running; clamp `dt ≤ 1/30 s` on resume so nothing jumps.
5. **Resize:** `ResizeObserver` on the hero, 160 ms debounce; regenerate (same seed, no growth animation, drop
   pulses) only if width changed or |Δheight| > 120 px — the hero uses `min-height: 100svh`, so mobile URL-bar
   show/hide doesn't thrash it. Canvases are sized by CSS (absolute, 100 %); backing stores =
   round(css × dpr). Setting `width` clears a canvas → redraw in the same frame (no flicker). No layout shift possible.
6. **DPR:** desktop `min(devicePixelRatio, 2)`, phone `min(devicePixelRatio, 1.5)`, then cap each canvas at
   4.2 MP: `dpr = min(dpr, sqrt(4.2e6 / (w·h)))`. Re-setup on a `matchMedia('(resolution: Xdppx)')` change.
7. Handle `contextlost`/`contextrestored` on both canvases (redraw static on restore).
8. `destroy()` cancels rAF, disconnects observers, removes listeners (StrictMode mounts twice in dev).
9. **Debug:** with `?fxdebug` in the URL, expose `window.__mrhFx = { frames, running, quality, dpr, nodes, edges,
   genMs, staticMs, avgFrameMs }` (no UI, nothing otherwise).

Suggested engine module split (hero-internal, adjust freely): `veins/graph.ts` (grid, nearest edge, Dijkstra,
heap), `veins/palette.ts` (colour tables, sprites), `veins/render.ts` (static drawing, batching), `veins/engine.ts`
(`createEngine(opts): { destroy(), pulseAt(x, y), setReducedMotion(v) }` with
`opts = { host, staticCanvas, dynamicCanvas, measure: () => ({ width, height, chip, avoid }), reducedMotion, onReady,
onIgnite, debug }`).

### 7.7 Reduced motion and failure

- **Reduced motion = one beautiful static frame:** full board + a frozen boot pulse at r = 0.35·maxBirth from all
  pins (intensity 0.8) + a lantern hot spot at the trace nearest (0.78W, 0.3H). No loop, no growth, no sheen, no
  flights. Canvases still fade in (opacity is allowed). Redraw on resize. Respond to a live `matchMedia` change.
- **Failure:** any exception in the engine → `destroy()`, remove `data-ready` (canvas fades out), set
  `data-fx="off"` on the hero; the CSS gradient carries the hero. `getContext('2d')` returning null → same.

### 7.8 Phone variant

`profile = width < 768 || matchMedia('(pointer: coarse)').matches ? 'phone' : 'desktop'`. Fewer nodes (≤ 640),
no bloom pass, DPR ≤ 1.5, pins on the chip's top edge only — the PCB buses rise from the name like a skyline with
veins coming in from the top and sides. Touch: tap = pulse, plus the always-on gentle wander light. It must look as
deliberate as desktop — check it on the 390 screenshot, not just the 1440 one.

### 7.9 Performance budget and watchdog

- Per frame on a mid laptop at 1440×900 / DPR ≤ 2: ≤ 3 ms JS + cheap raster (light ≈ 40 edges, 1–2 pulses ≈ 150
  edges, ≤ 60 sprites). Static redraw ≤ 8 ms. Generation ≤ 12 ms. Engine chunk ≤ 12 KB gzip.
- Watchdog: EMA of rAF intervals; if > 20 ms for 1.5 s, step down one level (2 s cooldown, never step back up):
  L1 DPR → 1 · L2 drop bloom + sprites · L3 max 2 pulses, light radius ×0.5, no flights. "Simpler, not prettier."
- Prove it: Chrome DevTools Performance (6× CPU throttle shows headroom) and `npm run qa:fps` (§13.2).

---

## 8. Sections (390 → 768 → 1440 → 2560)

All sections: `Section` primitive, content in `site-container`, reveals staggered. h2 per section, h3 inside.

### 8.1 Hero (hero package) — `<header id="top" aria-labelledby="hero-title">`

- `min-height: 100svh`; `overflow: clip`; `isolation: isolate`; background §7.1; content block bottom-aligned:
  `.hero-content` = `site-container`, `container-type: inline-size`, padding-top 128 px, padding-bottom 80 px (base)
  / 96 px (xl) / 128 px (3xl).
- `h1#hero-title` = `site.displayName`, style §5.2, `ink-100`, `position: relative`. Inside it, after the text, an
  `aria-hidden` **sheen** span with the same text absolutely over it — rendered **only after mount** (a
  `useState(false)` flipped in `useEffect`), so the prerendered h1 text stays clean for crawlers and hydration is
  unaffected: `background: linear-gradient(100deg,
  transparent 35%, rgb(255 217 138 / .9) 48%, rgb(255 194 71 / .95) 50%, transparent 65%) 100% 0 / 260% 100%
  no-repeat; background-clip: text; color: transparent`. When the engine calls `onIgnite`, set `data-ignite` on
  the header; CSS runs one `background-position` sweep 100 % → 0 over 1400 ms `--ease-out` (motion-safe only). The
  h1 itself is painted immediately at full opacity — no entrance animation on the LCP element.
- Identity `<p>`: `mt-6 xl:mt-8`, `font-size: clamp(1.125rem, 0.95rem + 0.9vw, 1.75rem)`, line-height 1.35,
  weight 500, `ink-300`, `max-width: 30ch`, `text-wrap: balance`.
- CTA row: `mt-10 xl:mt-12`, `flex flex-wrap gap-4`: `ButtonLink` primary `size="lg" magnetic` →
  `site.hero.primaryCta`; ghost `size="lg" magnetic` → `site.hero.secondaryCta`. (At ≤ 360 px they wrap to full
  width.) No nav bar. Nothing else.
- **Scroll hint** (`ScrollHint.tsx`): `<a href="#about">` absolutely at bottom 24 px, right = gutter, ≥ 48 px tap
  area, `aria-label="Scroll to Who I am"`. Mono `xs` uppercase `tracking-label` `ink-400` label from
  `site.hero.scrollHint` over a 1 × 48 px `ink-100/15` track whose 6 px amber segment drifts down by animating
  `background-position` (2.4 s loop, motion-safe) — the box never moves (trap #2). It is an `avoid` rect for the
  network.
- 390: name ≈ 72 px spanning the content width; identity on 2 lines; CTAs side by side (48–56 px tall); the board
  fills the top ~60 %. 768: name ≈ 143 px. 1440: name 176 px (≈ 850 px wide) bottom-left, board above and to the
  right. 2560: name 224 px, content aligned with the 1440-px content column of the sections below.

### 8.2 Who I am (sections package) — `About`

- `Section` with `titleStyle="label"` (the bio is the display element here).
- **Bio** (`renderEmphasis(site.bio)`): `text-lead`, weight 500, `tracking-snug`, first sentence `ink-100`, the rest
  `ink-300` (split at the first `. `), emphasis amber-400. The grid column sets the measure (≈ 30ch at xl, where
  the type is ~44 px — it reads like a pull quote); full width below md.
- **Readout** `<dl>` in mono `sm` under the bio (`mt-10`): `Based in` → `the Cloud` + an `FL350` chip
  (`location.flourish`, mono `xs`, `shadow-hairline`, rounded-full, hidden when null); `Into` →
  `gaming · programming · aviation`. Labels `ink-400`, values `ink-100`. Dt/dd pairs in a 2-col grid.
- **Avatar in an instrument bezel** (`Bezel.tsx`, aviation nod): a square, aspect-ratio 1, sized 176 px (base) /
  240 (md) / 320 (xl) / 400 (3xl). SVG ring (`aria-hidden`): outer circle `ink-100/10`; 72 ticks every 5°, every 6th
  longer, `ink-500`; a small amber heading bug at 12 o'clock. Inside, inset 12 %:
  - `site.avatar` set → `<picture>` (avif → webp → png `<img>`), `srcSet` 512w/1024w,
    `sizes="(min-width:1920px) 400px, (min-width:1280px) 320px, (min-width:768px) 240px, 176px"`, explicit
    width/height, `loading="lazy" decoding="async"`, circular crop, 1 px `ink-100/10` inner ring.
  - `null` (ships now) → a **typographic composition**: the monogram (the uppercase letters of `displayName` →
    "MH") in Mona Sans 850 / wdth 125 at ~38 % of the bezel diameter, `ink-100`, centred over a faint amber→teal
    radial glow inside the ring. Monogram only — no extra text. It must look intentional at every size.
- Layout: base — label, bezel (left-aligned), bio, readout. md — 6 cols: bio cols 1–4, bezel cols 5–6 (top-aligned).
  xl/3xl — 12 cols: bio + readout cols 1–7, bezel cols 9–12 vertically centered.
- No skills cloud, no progress bars, no logos wall.

### 8.3 What I've built (sections package) — `Work`

- `Section` `titleStyle="display"`, title from config. Background bloom: `radial-gradient(40% 30% at 72% 22%,
  rgb(255 194 71 / 0.06), transparent 70%)` on the section.
- **Flagship card** `<article aria-labelledby="flagship-title">`: `iron-900`, `shadow-hairline`, `rounded-card`,
  `overflow: clip`, padding 24 (base) / 40 (md) / 56 (xl) px, a top-left amber bloom inside.
  - Kicker row: mono `xs` uppercase `tracking-label`: `site.flagship.kicker` in amber-400 + a 6 px teal dot +
    "Live" in teal-400 (the dot breathes opacity 0.5 ↔ 1 over 2.4 s, motion-safe).
  - `h3#flagship-title` (`text-title`, 800, wdth 112.5, `tracking-display`), summary (`text-lg`, `ink-300`,
    max 52ch), highlights (`fillTemplate` with stats; small amber pad bullets, `ink-300`), CTA `ButtonLink` primary
    `external` → `site.flagship.url`, label `site.flagship.cta`.
  - **Screenshot** `<figure>`: `<picture>` with `<source type="image/avif">` and `<source type="image/webp">`
    (`srcSet` from `pattern`/`widths`, `sizes="(min-width:1280px) 760px, (min-width:768px) 90vw, 100vw"`) and
    `<img src={fallback} width={1440} height={900} alt loading="lazy" decoding="async">`; `rounded-pad`,
    1 px `ink-100/10` ring, a soft amber bloom underneath (`0 40px 120px -40px rgb(255 194 71 / .25)`). Flat — no
    tilt, no fake browser chrome.
  - **Stat strip** `<ul>`: each `<li>` = number (Martian Mono 500, amber-400, 32 px base → 48 px xl, tabular) +
    label (`fillTemplate(label, stats)`, `text-sm`, `ink-300`), reading naturally ("113 minerals, every drop rate").
    Hairline grid: the `ul` uses `gap: 1px` over an `ink-100/8` background with `iron-900` cells. 2 cols (base) →
    3 (md) → 6 in one row (xl+). No count-up animations — numbers reveal with the stagger only.
  - Freshness line (mono `xs`, `ink-400`): live → `Live from prospecting.mrh.lol · synced 30 Sep 2026` with a teal
    dot; fallback → `Snapshot · 30 Sep 2026`. (`formatDayUTC(buildData.atlas.syncedOn)`.)
  - Layout: base/md — kicker, title, summary, screenshot, highlights, CTA, stats. xl+ — 12 cols: copy cols 1–5,
    screenshot cols 6–12; stats full width below.
- **Further tools grid** (from `buildData.projects`), `mt-16 xl:mt-24` below the flagship: a decorative mono label
  row "More tools" (`aria-hidden`), then `<ul aria-label="More tools">`, 1 col → 2 cols (md+). Card titles are
  `h3`, siblings of the flagship's `h3` — no extra heading level, so heading order never skips.
  - `ProjectCard`: `iron-900`, `shadow-hairline`, `rounded-card`, padding 24/32; accent hairline + 3-dot "pad"
    motif top-left in the project's accent; status chip (`live` teal, `beta` amber, `wip` violet, `archived` ink-400
    — text + colour); `h3` title (`text-2xl`, 700, wdth 112.5); tagline; up to 4 tags (mono `xs` chips); links
    (`url` → "Open", `repoUrl` → "Source", both external). Optional image (explicit width/height, lazy, 16:10).
    Whole card hover: `shadow-hairline-strong` + accent glow, within 100 ms.
  - **Forge card** (`site.forgeCard`): shown when `projects.length` is 0 or odd, so the grid is never ragged; spans
    both columns when there are 0 projects (horizontal layout: copy left, art right). Art = a small hand-authored
    static inline SVG (~1 KB): three parallel traces with a 45° bend ending in pads, one continuing as a vein, iron-600 /
    amber @ low alpha, `aria-hidden`. Copy: title (h3), body, `TextLink external` to `forgeCard.href`.
- Sections package also owns `scripts/shoot-atlas.mjs` + `public/projects/*` (§9.3) and `scripts/gen-avatar.mjs` +
  `public/avatar/*` (§9.4).

### 8.4 Get in touch (contact package) — `Contact`

- `Section` `titleStyle="display"`, `intro={site.contact.intro}`. Bloom: teal @ 0.05 at 20 % 70 %.
- **Discord primary card** (largest target on the page): `iron-900`, `shadow-glow-teal` at rest (subtle),
  `rounded-card`, padding 24/40. Discord icon (`ink-100`) + an `h3` "Discord" styled as the mono `xs` label (the
  form card's title is the other `h3` in this section); the handle `makogai` huge in
  Martian Mono 500 (`clamp(1.75rem, 1.2rem + 2.6vw, 3rem)`, `ink-100`, `select-all`); alt line "also
  `mrharold01`" (mono `sm`, `ink-400`, `select-all`). **Copy handle** `Button` (ghost, lg, `IconCopy`): uses
  `navigator.clipboard.writeText`; fallback = select the handle text via the Selection API +
  `document.execCommand('copy')`; if both fail, keep the handle selected and show "Press Ctrl+C / ⌘C". On success
  the label becomes "Copied" with `IconCheck` in amber for 2.4 s, and a visually hidden `aria-live="polite"` region
  says "Discord handle makogai copied". If `serverInvite` is set: `ButtonLink` ghost external "Join the server".
- **Secondary channels** `<ul>`: one full-tile `<a>` per non-null channel — GitHub (`github.href`, handle
  `Makogai`), Email (`mailto:contact@mrh.lol`, shows the address), Roblox / X / YouTube / Twitch only when set.
  Tile: min-height 64 px, icon, label (`text-sm` `ink-400`), handle (mono `sm` `ink-100`), trailing arrow; hover =
  hairline brightens + icon turns amber within 100 ms; external links marked for screen readers.
- **Form card** (`h3` = `site.contact.form.title`), §6.7 contract:
  - Fields (visible `<label>`s, `useId` ids): Name (`autoComplete="name"`, maxLength 80), "Where can I reply?"
    with hint "Email or Discord username" (`autoComplete="email"`, `inputMode="email"`, maxLength 254), Message
    (`<textarea rows={6}>`, maxLength 4000, live mono counter `0 / 4000` linked via `aria-describedby`).
    Inputs: 48 px min height, `iron-850`, `shadow-hairline`, `rounded-pad`, focus ring + `shadow-hairline-strong`.
  - Honeypot: a wrapper `aria-hidden="true"` positioned off-screen (`position: absolute; left: -10000px`, never
    `display: none` — some bots skip hidden fields) containing `<label>Website</label><input name="website"
    tabIndex={-1} autoComplete="off">`.
  - `elapsedMs` = time since the form mounted (captured in an effect).
  - States: **idle**; **sending** (button `aria-disabled`, `IconSpinner`, "Sending…", fields stay editable, double
    submits ignored); **sent** (the form is replaced by a panel whose `h3` "Message sent" receives focus
    (`tabIndex={-1}`), text `fillTemplate(form.success, { replyTo })`, a ghost "Send another" button that resets);
    **error** (a `role="alert"` banner above the submit button with `IconAlert` + copy, and the Discord handle as the
    fallback route).
  - Client validation on submit, then on blur/input for touched fields: messages under fields (`coral-400` + icon),
    `aria-invalid`, `aria-describedby`, focus the first invalid field. Server 400 codes map to the same field errors.
    Copy: name "Tell me what to call you (up to 80 characters)." · reply "Enter an email address or a Discord
    username." · message "Write at least 10 characters (up to 4000)." · `rate_limited` "That's a few messages in a
    row — try again in a few minutes, or ping me on Discord." · `busy` "The inbox is flooded right now — Discord
    works: makogai." (handle from config) · network "Couldn't reach the server. Check your connection and try
    again." · server "Something broke on my end. Try again, or reach me on Discord."
  - Note line (mono `xs`, `ink-400`): `site.contact.form.note`.
  - **Not configured** (`!isSupabaseConfigured || !form.enabled`): production omits the form card entirely and the
    channels column spans the layout; in dev (`import.meta.env.DEV`) render the form with an inline notice "Form
    backend not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local" and submit shows that
    notice instead of sending.
- Layout: base — Discord card, channels, form (stacked). md — Discord full width; channels 2 cols; form full.
  xl+ — 12 cols: Discord + channels cols 1–5, form cols 7–12 (top-aligned).

### 8.5 Footer (sections package) — `<footer>`

`site-container`, top hairline `ink-100/8`, padding-block 48 px. Left: `site.displayName` (600) + mono `xs` `ink-400`
`© {buildData.buildYear}` (build-time, so SSR and client agree). Right: `Source` (`TextLink external`, only when
`site.sourceUrl`), `Back to top ↑` (`href="#top"`). Base: stacked, md+: one row. Nothing else.

### 8.6 404 (seo_deploy) — `NotFound`

Prerendered, no JS (§6.5). Full-viewport dark page with the hero gradient: "404" huge (Mona 850 / wdth 125,
`clamp(6rem, 30vw, 18rem)`, ink-100), line "This trace leads nowhere." (`text-xl`, `ink-300`), `ButtonLink`
primary "Back to mrh.lol" → `/`, and a small static inline SVG of a trace ending in an open (unconnected) pad.
Utilities only.

---

## 9. Live stats (investigated 2026-10-01) and `scripts/gen-data.mjs` (contact package)

### 9.1 Findings at https://prospecting.mrh.lol

- No JSON endpoints: the data is baked into a 1.18 MB JS bundle. But prerendered HTML and the sitemap expose
  everything we need, cheaply (≈ 300 KB total):
  - `sitemap.xml` (24 KB, 194 `<loc>`): **pages = 194** ✓ (PROMPT says 194), `/minerals/<slug>` = **113** ✓,
    `/sites/<slug>` = **33** ✓, `/locations/<slug>` = 28; every `<lastmod>` = `2026-09-30`.
  - `/` meta description: "…113 minerals with real drop rates, 33 dig sites with full loot tables, **107 quests,
    67 craftables**, codes,…" ✓.
  - `/quests/` `<title>`: "**107 quests and 120 NPCs** — who gives what | Prospecting Atlas" ✓.
  - `/museum/` `<title>`: "Museum planner — best ore for **all 18 displays**" ✓.
  - "A Discord bot with 11 slash commands" appears nowhere on the site → hard-coded (fallback only, comment says so).
  - Gotcha: `/quests` 301-redirects to `http://…/quests/` (absolute http redirect behind TLS). Request the
    trailing-slash URLs directly. Our nginx sets `absolute_redirect off` so we never do the same (§12.2).
- robots.txt allows all.

### 9.2 `scripts/gen-data.mjs` spec

Plain Node ESM (runs on Node 22 in Docker; no TS imports). Never throws, always writes a valid `GeneratedData`
(§6.2), exit code 0.

- Flags: `--if-missing` (exit early if `src/data/generated.json` exists — used by `npm run dev`), `--offline` or
  `GEN_DATA_OFFLINE=1` (skip network, write nulls).
- Env: `import { loadEnv } from 'vite'` → `loadEnv('production', process.cwd(), 'VITE_')` (same precedence as Vite:
  real env vars — Docker build ARGs — beat `.env*` files). Never log values; log only "configured"/"not configured".
- Atlas (parallel, `AbortSignal.timeout(6000)` each, `User-Agent: mrh.lol-build (+https://mrh.lol)`):
  - `https://prospecting.mrh.lol/sitemap.xml` → `<loc>` list: `pages` = count; `minerals` = paths matching
    `^/minerals/[^/]+/?$`; `digSites` `^/sites/[^/]+/?$`; `locations` `^/locations/[^/]+/?$`; `syncedOn` = max
    `<lastmod>` (first 10 chars, must match `YYYY-MM-DD`).
  - `https://prospecting.mrh.lol/` → `<meta name="description" content="…">` → `/(\d[\d,]*)\s+quests\b/i`,
    `/(\d[\d,]*)\s+craftables\b/i`.
  - `https://prospecting.mrh.lol/quests/` → `<title>` → `/(\d+)\s+quests\s+and\s+(\d+)\s+NPCs/i` (npcs; quests as
    cross-check if the meta failed).
  - `https://prospecting.mrh.lol/museum/` → `<title>` → `/all\s+(\d+)\s+displays/i`.
  - Plausibility (integer, inclusive): minerals 50–2000, digSites 10–500, locations 5–500, quests 20–5000,
    npcs 20–5000, craftables 10–2000, museumDisplays 5–200, pages 50–20000. Out of range → drop (warn).
  - `fetchedAt` = now if at least one Atlas request succeeded, else null.
- Projects (only when both env vars are set): `GET {url}/rest/v1/projects?select=slug,title,tagline,description,url,
  repo_url,status,tags,accent,image_url,image_width,image_height,image_alt&published=eq.true&order=sort_order.asc,
  created_at.asc` with `apikey` (+ `Authorization: Bearer` only for `eyJ…` keys), timeout 8 s. Map rows → `Project`
  (camelCase; `image` only when url is https and width/height are positive ints and alt is non-empty); drop rows
  that fail validation (warn with the slug); cap 12. HTTP/network failure → `projects: null` + loud warning.
  Missing env → `projects: null` + one info line.
- Write atomically: write `generated.json.tmp`, then `rename` (several implementers may build at once).
- Log one summary line, e.g. `gen-data: atlas 8/8 live (synced 2026-09-30) · projects: 0 from Supabase`.

### 9.3 Atlas screenshot (`scripts/shoot-atlas.mjs`, sections package)

- puppeteer-core with `CHROME_PATH` or `C:/Program Files/Google/Chrome/Application/chrome.exe`, headless, a fresh
  temp `userDataDir` (never the user's profile). Viewport 1440×900, DPR 1.
- `goto('https://prospecting.mrh.lol/', { waitUntil: 'networkidle0' })`, `document.fonts.ready`, inject
  `*{animation:none!important;transition:none!important;caret-color:transparent!important}` and hide scrollbars,
  wait 600 ms, assert the title contains "Prospecting Atlas", screenshot the viewport (PNG buffer).
- sharp: widths 720 and 1440 → `public/projects/prospecting-atlas-{w}.avif` (quality 52, effort 6) and `.webp`
  (quality 80); `prospecting-atlas-1440.jpg` (quality 82, mozjpeg). Print sizes; target AVIF ≤ 120 KB, WebP ≤ 180 KB.
- Outputs are committed (by the lead); the Docker build never runs this.

### 9.4 Avatar renditions (`scripts/gen-avatar.mjs`, sections package)

- Input `assets-src/avatar.png` (owner source art; never modify it). If missing, print a notice and exit 0.
- sharp: centre-crop to a square (`fit: 'cover'`, `position: 'attention'`), then 512 and 1024 px →
  `public/avatar/avatar-{512,1024}.avif` (quality 55, effort 6), `.webp` (quality 82), `.png` (palette off,
  compressionLevel 9). Print sizes; target the 512 AVIF ≤ 40 KB.
- It only produces files. `site.avatar` stays `null` until the lead reviews the renditions and pastes the object
  from the comment in `src/config/site.ts` (alt text from the owner) — the About section must look right both ways.

---

## 10. Supabase

### 10.1 `supabase/migrations/0001_init.sql` (contact package — verbatim baseline; improve only with comments)

Idempotent: the lead pastes it into the dashboard SQL editor and may run it twice.

```sql
-- mrh.lol — contact inbox + projects grid. Idempotent: safe to re-run in the Supabase SQL editor.
begin;

-- Async HTTP for the optional Discord ping. Requests are only sent after the transaction commits.
create extension if not exists pg_net with schema extensions;

-- ── Private schema: never exposed through the Data API ─────────────────────────────────────────────
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
revoke all on private.settings from public, anon, authenticated;

-- Seed. `on conflict do nothing` keeps your edits when re-running.
insert into private.settings (key, value) values
  ('ip_salt', encode(sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex')),
  ('rate_window_minutes', '10'),
  ('rate_max_per_window', '3'),
  ('rate_max_per_day', '10'),
  ('global_max_per_day', '200')
on conflict (key) do nothing;
-- Discord notifications stay OFF until you add a webhook URL:
--   insert into private.settings (key, value) values ('discord_webhook_url', 'https://discord.com/api/webhooks/…')
--   on conflict (key) do update set value = excluded.value, updated_at = now();

-- ── Messages: the contact-form inbox (read it in Table Editor → public.messages) ───────────────────
create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name       text not null,
  reply_to   text not null,
  message    text not null,
  ip_hash    text not null,   -- salted SHA-256; raw IPs are never stored
  user_agent text,
  is_read    boolean not null default false
);
create index if not exists messages_ip_hash_created_at_idx on public.messages (ip_hash, created_at desc);
create index if not exists messages_created_at_idx on public.messages (created_at desc);

alter table public.messages enable row level security;
-- No policies on purpose: RLS on + zero policies = anon/authenticated can neither read nor write.
revoke all on public.messages from anon, authenticated;

-- ── Projects: drives the "What I've built" grid. Read at BUILD time with the anon key. ─────────────
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 64),
  title        text not null check (char_length(title) between 1 and 60),
  tagline      text not null check (char_length(tagline) between 1 and 140),
  description  text check (description is null or char_length(description) <= 600),
  url          text check (url is null or url ~ '^https://'),
  repo_url     text check (repo_url is null or repo_url ~ '^https://'),
  status       text not null default 'live' check (status in ('live', 'beta', 'wip', 'archived')),
  tags         text[] not null default '{}' check (cardinality(tags) <= 6),
  accent       text not null default 'teal' check (accent in ('amber', 'teal', 'violet', 'blue')),
  image_url    text check (image_url is null or image_url ~ '^https://'),
  image_width  int check (image_width is null or image_width > 0),
  image_height int check (image_height is null or image_height > 0),
  image_alt    text,
  sort_order   int not null default 100,
  published    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.projects enable row level security;
drop policy if exists "Published projects are public" on public.projects;
create policy "Published projects are public" on public.projects
  for select to anon, authenticated using (published = true);
revoke insert, update, delete, truncate on public.projects from anon, authenticated;
grant select on public.projects to anon, authenticated;

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at before update on public.projects
  for each row execute function private.touch_updated_at();

-- ── RPC: the only way in for the contact form ─────────────────────────────────────────────────────
create or replace function public.submit_contact(
  p_name       text,
  p_reply_to   text,
  p_message    text,
  p_website    text default null,    -- honeypot: humans never fill it
  p_elapsed_ms integer default null  -- ms between form render and submit (client-reported)
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  v_name    text := btrim(coalesce(p_name, ''));
  v_reply   text := btrim(coalesce(p_reply_to, ''));
  v_msg     text := btrim(coalesce(p_message, ''));
  v_ip      text;
  v_hash    text;
  v_window  int;
  v_max_win int;
  v_max_day int;
  v_global  int;
begin
  -- Bots get a fake success so they learn nothing.
  if coalesce(p_website, '') <> '' or (p_elapsed_ms is not null and p_elapsed_ms < 2000) then
    return jsonb_build_object('ok', true);
  end if;

  -- Validation mirrors src/contact/validate.ts; the client maps these codes to field messages.
  if char_length(v_name) < 1 or char_length(v_name) > 80 or v_name ~ '[[:cntrl:]]' then
    raise sqlstate 'PT400' using message = 'invalid_name';
  end if;
  if char_length(v_reply) < 2 or char_length(v_reply) > 254 or not (
       v_reply ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or (v_reply ~* '^@?[a-z0-9_.]{2,32}$' and v_reply !~ '\.\.')
  ) then
    raise sqlstate 'PT400' using message = 'invalid_reply_to';
  end if;
  if char_length(v_msg) < 10 or char_length(v_msg) > 4000 then
    raise sqlstate 'PT400' using message = 'invalid_message';
  end if;

  -- Client IP → salted hash. The left-most X-Forwarded-For entry can be client-supplied, so prefer the
  -- proxy-set headers; the global daily cap below is the backstop against rotation.
  v_ip := coalesce(
    nullif(v_headers->>'cf-connecting-ip', ''),
    nullif(v_headers->>'x-real-ip', ''),
    nullif(btrim(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1)), ''),
    'unknown');
  select encode(sha256(convert_to(v_ip || ':' || s.value, 'UTF8')), 'hex') into v_hash
    from private.settings s where s.key = 'ip_salt';
  v_hash := coalesce(v_hash, encode(sha256(convert_to(v_ip, 'UTF8')), 'hex'));

  select coalesce(max(value) filter (where key = 'rate_window_minutes'), '10')::int,
         coalesce(max(value) filter (where key = 'rate_max_per_window'), '3')::int,
         coalesce(max(value) filter (where key = 'rate_max_per_day'), '10')::int,
         coalesce(max(value) filter (where key = 'global_max_per_day'), '200')::int
    into v_window, v_max_win, v_max_day, v_global
    from private.settings;

  -- Serialise concurrent submits from one IP so two parallel requests can't both slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended(v_hash, 0));

  if (select count(*) from public.messages m
        where m.ip_hash = v_hash and m.created_at > now() - make_interval(mins => v_window)) >= v_max_win
     or (select count(*) from public.messages m
        where m.ip_hash = v_hash and m.created_at > now() - interval '1 day') >= v_max_day then
    raise sqlstate 'PT429' using message = 'rate_limited';
  end if;
  if (select count(*) from public.messages m where m.created_at > now() - interval '1 day') >= v_global then
    raise sqlstate 'PT429' using message = 'busy';
  end if;

  insert into public.messages (name, reply_to, message, ip_hash, user_agent)
  values (v_name, v_reply, v_msg, v_hash, left(v_headers->>'user-agent', 300));

  return jsonb_build_object('ok', true);
end
$$;
revoke all on function public.submit_contact(text, text, text, text, integer) from public;
grant execute on function public.submit_contact(text, text, text, text, integer) to anon, authenticated;

-- ── Optional Discord ping on every new message (no-op unless a webhook URL is stored) ─────────────
create or replace function private.notify_discord() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
begin
  select s.value into v_url from private.settings s where s.key = 'discord_webhook_url';
  if v_url is null or v_url !~ '^https://((canary|ptb)\.)?(discord\.com|discordapp\.com)/api/webhooks/' then
    return new;
  end if;
  begin
    perform net.http_post(
      url  := v_url,
      body := jsonb_build_object(
        'username', 'mrh.lol',
        'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb), -- a message can never ping @everyone
        'embeds', jsonb_build_array(jsonb_build_object(
          'title', left('New message from ' || new.name, 256),
          'description', left(new.message, 4000),
          'color', 16761415, -- #ffc247 lantern amber
          'fields', jsonb_build_array(jsonb_build_object('name', 'Reply to', 'value', left(new.reply_to, 1024))),
          'timestamp', to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        ))
      )
    );
  exception when others then
    raise warning 'notify_discord skipped: %', sqlerrm; -- a webhook problem must never lose a message
  end;
  return new;
end $$;
revoke all on function private.notify_discord() from public;
drop trigger if exists messages_notify_discord on public.messages;
create trigger messages_notify_discord after insert on public.messages
  for each row execute function private.notify_discord();

-- ── Example project (uncomment, edit, run; then trigger a rebuild — DEPLOY.md) ─────────────────────
-- insert into public.projects (slug, title, tagline, url, status, tags, accent, sort_order, published)
-- values ('my-tool', 'My Tool', 'One line about what it does.', 'https://example.mrh.lol', 'beta', '{roblox,tools}', 'violet', 10, true);

commit;

notify pgrst, 'reload schema';
```

### 10.2 Client (`src/contact/submit.ts`, `src/contact/validate.ts`)

```ts
export type ContactField = 'name' | 'replyTo' | 'message';
export type ContactErrorCode = 'invalid_name' | 'invalid_reply_to' | 'invalid_message';
export type SubmitResult =
  | { ok: true }
  | { ok: false; reason: 'invalid'; field: ContactField }
  | { ok: false; reason: 'rate_limited' | 'busy' | 'network' | 'server' | 'not_configured' };

export async function submitContact(input: {
  name: string; replyTo: string; message: string; website: string; elapsedMs: number;
}): Promise<SubmitResult>;
```

POST per §6.7 with a 12 s `AbortSignal.timeout`. Map: 2xx → ok; 400 + `invalid_*` → `invalid` with field; 429 +
`busy` → busy, other 429 → rate_limited; other status → server; thrown → network; env missing → not_configured.
`validate.ts` exports `validateContact(input) → { ok: true; value } | { ok: false; errors: Partial<Record<ContactField,
ContactErrorCode>> }` with exactly the §6.7 rules (trimmed).

### 10.3 Dashboard usage (for DEPLOY.md)

Run the migration in SQL editor → messages appear in Table Editor → `public.messages` (toggle `is_read`). Add a
project in `public.projects` with `published = true` → trigger a rebuild (§12.4). Tune limits in
`private.settings`. Enable Discord pings by inserting `discord_webhook_url`.

---

## 11. SEO and share assets (seo_deploy)

### 11.1 `renderHead()` (`src/seo/head.ts`)

Returns one HTML string (escape attribute values; JSON-LD via `JSON.stringify` with `<` → `\u003c`), built from
`site`:
- `<title>` = `seo.title`; `<meta name="description">` = `seo.description`; `<link rel="canonical"
  href="https://mrh.lol/">`; `<meta name="theme-color" content="#06080e">`.
- Icons: `<link rel="icon" href="/favicon.ico" sizes="32x32">`, `<link rel="icon" href="/favicon.svg"
  type="image/svg+xml">`, `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`, `<link rel="manifest"
  href="/site.webmanifest">`. (Validated: without an icon link Chrome requests `/favicon.ico`, and the 404 lands in
  the console → Lighthouse Best Practices < 100. Ship `favicon.ico` too.)
- Open Graph: `og:type website`, `og:site_name mrh.lol`, `og:title`, `og:description`, `og:url https://mrh.lol/`,
  `og:image https://mrh.lol/og.png` (absolute), `og:image:type image/png`, `og:image:width 1200`,
  `og:image:height 630`, `og:image:alt`. Twitter: `twitter:card summary_large_image`, `twitter:title`,
  `twitter:description`, `twitter:image`, `twitter:image:alt` (no `twitter:site` — no handle).
- JSON-LD `@graph`: `WebSite` (`@id https://mrh.lol/#website`, url, name "mrh.lol", publisher → person);
  `ProfilePage` (`@id https://mrh.lol/#profile`, url, `mainEntity` → person); `Person` (`@id https://mrh.lol/#person`,
  `name` MrHarold, `alternateName` Mr Harold, `url`, `image` = avatar png absolute if `site.avatar` else
  `https://mrh.lol/icon-512.png`, `email` `mailto:contact@mrh.lol` when set, `knowsAbout` from interests
  ["Gaming", "Programming", "Aviation"], `sameAs` = every non-null channel URL (GitHub now; Roblox/X/YouTube/Twitch
  when set — Discord has no URL); and a `WebSite` node for the flagship that reuses the sibling's own id —
  `{ "@type": "WebSite", "@id": "https://prospecting.mrh.lol/#website", "name": "Prospecting Atlas", "url":
  "https://prospecting.mrh.lol", "creator": { "@id": "https://mrh.lol/#person" } }` — so the two sites' graphs link.
- `renderNotFoundHead()`: title "404 — mrh.lol", the same icons/theme-color, `<meta name="robots" content="noindex">`.

### 11.2 Static files in `public/`

- `robots.txt`: `User-agent: *` / `Allow: /` / blank / `Sitemap: https://mrh.lol/sitemap.xml`.
- `sitemap.xml`: one `<url><loc>https://mrh.lol/</loc></url>` (no `lastmod` — a static date would go stale).
- `site.webmanifest`: name/short_name "MrHarold", description = `seo.description`, `start_url "/"`, `scope "/"`,
  `display "standalone"`, `background_color` and `theme_color` `#06080e`, icons: 192 & 512 (`purpose: any`),
  512 maskable (`purpose: maskable`).

### 11.3 `scripts/gen-assets.mjs` — OG image + favicon set (run locally, outputs committed)

Validated pipeline (resvg-js cannot load WOFF2; fontkit's variation instancing breaks on WOFF2):
1. `subset-font(woff2Buffer, text, { targetFormat: 'truetype', variationAxes: { wdth: 125, wght: 850 } })` →
   static TrueType instance (HarfBuzz) per text style.
2. `fontkit.create(ttf).layout(text)` → glyph paths (`path.scale(s, -s).translate(x, baseline).toSVG()`), advancing
   by `positions[i].xAdvance` + tracking·UPM.
3. Compose an SVG with text as `<path>`s → `new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng()`.

Import `site` from `../src/config/site.ts` and `generateNetwork`, `VEIN_SEED`, `NodeKind` from
`../src/hero/veins/generate.ts` (Node ≥ 22.18 strips the types; validated with Node 24). If the generator returns
an empty network (stub) or throws, still produce the image (no traces) and print a warning — the lead re-runs
`npm run gen:assets` after the hero lands.

**OG image `public/og.png` (1200×630):** hero gradient + ember (§7.1) at OG proportions. Text first (it defines
the chip): mono `MRH.LOL` (Martian 500, 22 px, tracking 0.14 em, amber-400) at (72, 84); top-right mono
`GAMING · PROGRAMMING · AVIATION` (from `site.interests`, Martian 500, 16 px, ink-400) right-aligned to x = 1128;
`MrHarold` (Mona 850 / wdth 125, 150 px, tracking −0.045 em, ink-100) baseline 500 at x = 72 (≈ 731 px wide;
measured 4.877 em in this pipeline); identity (Mona 500 / wdth 100, 34 px, ink-300) baseline 556. Then the network:
`generateNetwork({ width: 1200, height: 630, chip, avoid, seed: VEIN_SEED, profile: 'og' })` where `chip` = the
union of the name and identity glyph boxes (from the fontkit run) padded 24 px, and `avoid` = the two mono labels
padded 12 px. Draw it with the §7.4 colours/widths/nodes plus a frozen boot pulse (Dijkstra from all pins; edges
whose distance falls in [R − 160, R] with R = 0.45·maxBirth, in amber-300, spark circles at the heads) and the chip
silkscreen brackets. Text paths go on top; a grain overlay (`feTurbulence`, 4 %) last. Keep the PNG < 600 KB.

**Favicon mark:** the letter M drawn as a PCB trace — path `M8 24 V10 L16 18 L24 10 V24`, amber-400 stroke 3 (round
caps/joins), pads (r 2.5) at both feet, on a 32×32 iron-950 rounded square (r 7). Outputs:
`favicon.svg` (hand-written, crisp), `favicon.ico` (32 px PNG inside an ICO container: 6-byte header + one 16-byte
directory entry pointing at the PNG bytes), `apple-touch-icon.png` (180, full-bleed iron-950 + soft ember, mark at
~60 %), `icon-192.png`, `icon-512.png` (rounded square), `icon-maskable-512.png` (full-bleed, mark within the
central 60 % safe zone).

---

## 12. Deploy (seo_deploy)

### 12.1 `Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
# Build-time only: Vite inlines VITE_* into the bundle and scripts/gen-data.mjs uses them to fetch projects.
# The anon/publishable key is public by design. In Coolify, mark both as "Build Variable".
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.30-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
```

Do not use `npm ci --omit=optional`: native bindings for Rolldown/Tailwind/lightningcss are optional deps.

### 12.2 `nginx.conf` (mounted as `conf.d/default.conf`, i.e. inside the stock `http {}` block)

```nginx
# One Cache-Control per response class, set at server level only: an add_header inside a location would
# silently drop every inherited add_header (nginx inheritance rule), including the security headers.
map $uri $mrh_cache_control {
    ~^/assets/   "public, max-age=31536000, immutable";  # Vite fingerprints everything in /assets/
    ~\.html$     "no-cache";                             # index.html, 404.html: always revalidate
    /            "no-cache";
    /healthz     "no-store";
    default      "public, max-age=86400";                # og.png, icons, manifest, avatar, screenshots
}

server {
    listen 80 default_server;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    server_tokens off;
    # TLS terminates at Coolify's proxy; absolute redirects would point clients at http:// (the sibling site does
    # exactly that on /quests → http://…/quests/).
    absolute_redirect off;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 512;
    gzip_types text/plain text/css text/xml application/xml application/javascript text/javascript application/json application/manifest+json image/svg+xml;

    add_header Cache-Control $mrh_cache_control always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options "DENY" always;
    # Only features Chrome recognises: an unknown token (e.g. interest-cohort) logs a console error → Lighthouse BP < 100.
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    location = /healthz {
        access_log off;
        default_type text/plain;
        return 200 "ok\n";
    }

    location = /site.webmanifest { default_type application/manifest+json; }

    location / {
        try_files $uri $uri/ =404;
    }

    error_page 404 /404.html;
    location = /404.html { internal; }
}
```

IPv4 `listen` only (some Docker hosts have no IPv6 and nginx would refuse to start).

### 12.3 `.dockerignore`

```
node_modules
dist
dist-*
.git
.env
.env.*
!.env.example
src/data/generated.json
.qa
docs
assets-src
*.log
```

### 12.4 `DEPLOY.md` (short, must cover)

- Coolify: Build Pack **Dockerfile**, Dockerfile location `/Dockerfile`, **Ports Exposes 80**, domain
  `https://mrh.lol` (optionally `www.mrh.lol` redirecting to the apex), Health check path `/healthz` port 80 (or rely
  on the image `HEALTHCHECK`).
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` with **"Build Variable" checked** (they're needed at build,
  not runtime). Without them the site still builds; the form is hidden and projects use the config fallback.
- Supabase setup: run `supabase/migrations/0001_init.sql` in the SQL editor; read messages in Table Editor;
  optional Discord webhook row; tune limits in `private.settings`.
- **Rebuild webhook** (projects live in the bundle): Coolify → the resource → Webhooks → Deploy Webhook URL
  (`https://<coolify>/api/v1/deploy?uuid=<resource-uuid>&force=…`) + an API token with the **deploy** permission:
  `curl -fsS "https://<coolify>/api/v1/deploy?uuid=<uuid>&force=true" -H "Authorization: Bearer $COOLIFY_TOKEN"`.
  **Use `force=true` for data refreshes**: with layer caching, an unchanged repo can reuse the cached `npm run build`
  layer and skip the Supabase fetch. Optional automation: Supabase → Database → Webhooks → table `public.projects`,
  events insert/update/delete, HTTP GET to that URL with the Authorization header.
- Verify a deploy: `curl -sI https://mrh.lol/` (200, `cache-control: no-cache`), `curl -s https://mrh.lol/healthz`
  (`ok`), `curl -sI https://mrh.lol/nope` (404 + the branded page), one `/assets/*.js` (`immutable`,
  `content-encoding: gzip` with `-H 'Accept-Encoding: gzip'`), `og:image` present in the HTML, the OG card in a share
  debugger, Lighthouse mobile on the live URL.
- Local: `docker build -t mrh-lol . && docker run --rm -p 8080:80 mrh-lol` or `npm run qa:docker`.

### 12.5 `README.md` (short)

What it is; stack; `npm run dev / build / preview`; **where to edit content** (`src/config/site.ts`, TODO(me) list);
adding a project (Supabase row + rebuild); regenerating assets (`gen:assets` after name/identity/palette changes,
`gen:shots` for the Atlas screenshot, `gen:avatar` after replacing `assets-src/avatar.png`, then set `site.avatar`)
and the Node ≥ 22.18 note; QA scripts; link to DEPLOY.md and docs/BUILD_PLAN.md.

---

## 13. QA, budgets, definition of done

### 13.1 Shared harness (scaffold): `scripts/qa/lib/browser.mjs`, `scripts/qa/shots.mjs`

- `browser.mjs`: `launch()` → puppeteer-core with `CHROME_PATH` or `C:/Program Files/Google/Chrome/Application/chrome.exe`,
  headless, fresh `fs.mkdtemp` profile in the OS temp dir (never the user's Chrome); `startPreview(port)` → spawns
  `npx vite preview --port <port> --strictPort` (inherits `MRH_PKG`), waits until it answers, returns `stop()`.
  Never use the claude-in-chrome tools.
- `shots.mjs [--url <base>] [--reduced] [--out .qa/<pkg>/shots]`: viewports 390×844 (DPR 3, mobile + touch),
  768×1024 (DPR 2), 1440×900 (DPR 1), 2560×1440 (DPR 1). For each: load, wait for fonts + 1.8 s (growth), save the
  viewport (`hero-<w>.png`) and full page (`full-<w>.png`); check `scrollWidth <= innerWidth` at 0.3 s, 1.5 s, 3 s
  (mid-animation) and after scrolling to the bottom; list elements whose right edge exceeds the viewport (clipped
  overflow is still a bug); collect console errors/warnings, page errors and failed requests. Exit 1 on horizontal
  overflow, console errors, page errors or failed requests. `--reduced` emulates `prefers-reduced-motion: reduce`.
  One exception while packages run in parallel: a 404 for `/favicon.ico` (and its console line) is only a **warning**
  when the document has no `link[rel~="icon"]` — Chrome requests it implicitly until seo_deploy's head lands. Once
  icons are declared, any icon 404 is a real failure.

### 13.2 Package QA scripts

- `scripts/qa/fps.mjs` (hero): opens `?fxdebug`. Desktop 1440×900 DPR 2 for 6 s: average FPS, p95/p99 frame
  interval from an in-page rAF probe, `__mrhFx.avgFrameMs`, long tasks. Phone 390×844 DPR 3 + 4× CPU throttle.
  Pause checks: scroll to `#work` → `running === false` within 500 ms → back to top → `true`. Hidden tab:
  headless Chrome keeps background pages "visible", so simulate it in-page — redefine `document.visibilityState`/
  `document.hidden` (`Object.defineProperty`, configurable) as hidden, dispatch `visibilitychange` → `running`
  false and `frames` stops increasing; restore + dispatch → `running` true. Reduced motion → `frames` stays 0 after
  the static frame. Exit 1 on any failure or desktop p95 > 18 ms.
- `scripts/qa/lighthouse.mjs` (seo_deploy): `npx -y lighthouse@13.5.0 <url> --chrome-path=… --chrome-flags="--headless=new"
  --output=json` for mobile (default config) and desktop (`--preset=desktop`); print the four scores + LCP, TBT, CLS,
  total JS; exit 1 below Performance 95 / Accessibility 100 / Best Practices 100 / SEO 100 (mobile). Default target
  is the Docker container (`vite preview` doesn't gzip, which skews performance).
- `scripts/qa/docker-smoke.mjs` (seo_deploy): `docker build -t mrh-lol:qa .`, run on 8080, assert `/healthz` → 200
  `ok`, `/` → 200 + `cache-control: no-cache` + the prerendered h1 present in the HTML, a `/assets/*.js` →
  `immutable` + gzip, `/nope` → 404 with the branded body, `/og.png` → 200 `image/png`; stop the container (`--keep`
  leaves it running for Lighthouse).

### 13.3 Hard budgets (from PROMPT §6)

Lighthouse mobile ≥ 95 / 100 / 100 (and SEO 100). LCP < 1.5 s (simulated 4G). Total JS < 150 KB gzip (enforced by
`budget.mjs`; expected ≈ 69 KB React + ≈ 25 KB app + ≈ 10 KB lazy engine). CLS 0 (reserved hero, explicit image
dims, metric-matched fallbacks). No horizontal scroll at 390, including mid-animation. Tap targets ≥ 48 px.

### 13.4 Definition of done per package

- **scaffold:** `npm run build` passes from a clean tree (with stubs); `npm run dev` renders the stub page with
  tokens/fonts/grain applied; budget prints; `qa:shots` runs; every contract in §6 exists exactly; deps installed.
- **hero:** §7 implemented; screenshots `.qa/hero/hero-390.png`, `hero-1440.png`, `hero-1440-reduced.png` (the
  "show me the hero first" checkpoint for the lead); `qa:fps` passes; no overflow at 390 mid-growth; engine is a
  separate chunk ≤ 12 KB gzip; reduced motion and failure paths verified (force a throw once).
- **sections:** About/Work/Footer per §8 at 390/768/1440/2560; Atlas screenshots and avatar renditions generated
  (`gen:shots`, `gen:avatar`); no overflow; contrast holds. Variants are exercised through **dev-only hash hooks** (dev has no SSR, and production strips the code
  because it sits behind `import.meta.env.DEV`): `#qa-projects=0|1|2|3` makes `Work` render that many fixtures from
  `src/sections/__fixtures__/projects.ts` (clearly labelled fixtures, never imported outside the DEV branch);
  `#qa-avatar` makes `About` render a mocked `AvatarConfig` pointing at an inline SVG data URI. Read the hash in an
  effect. Verify with `npm run build:nocheck` that no fixture text ends up in `dist-sections/`.
- **contact:** Contact per §8.4; SQL per §10; gen-data per §9 (run it: prints 8/8 live). Form states via the same
  kind of dev-only hook: `#qa-form=ok|invalid_name|invalid_reply_to|invalid_message|rate_limited|busy|server|network|slow`
  short-circuits `submitContact` (inside `if (import.meta.env.DEV)`) with that result after 600 ms (`slow` = 4 s, to
  see the sending state). Copy-handle verified with and without the Clipboard API (delete `navigator.clipboard` in
  devtools). Verify no `qa-form` string ships in `dist-contact/`.
- **seo_deploy:** head/JSON-LD/OG/icons/manifest/robots/sitemap/404 per §11; Dockerfile + nginx + .dockerignore;
  `qa:docker` passes; Lighthouse run against the container with results reported; DEPLOY.md + README.md written.

### 13.5 Integration (the lead, after all packages)

1. `npm run typecheck && npm run build` (no `MRH_PKG`). 2. `npm run gen:assets` (OG with the real network) and
check `public/og.png` visually. 3. `npm run qa:shots` and `--reduced`; look at 390 and 1440 yourself and say so.
4. `npm run qa:fps`. 5. `npm run qa:docker -- --keep` then `npm run qa:lighthouse`. 6. Show the owner the hero
screenshots. 7. Commit in meaningful chunks only when told.
