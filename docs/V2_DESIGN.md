# mrh.lol v2 — FRONT END (final design spec)

Status: **final**. Supersedes the v1 page structure in PROMPT.md §4. PROMPT.md §1–3 and §5–8 still apply (palette, motion, perf, a11y, traps). Owner feedback this answers: shorter copy, no aviation, four identity pillars (Programming main · Games · Anime · Working out), CS2 / Roblox / War Thunder, live Discord + Roblox status, a multi-app showcase where each app has its own theme, and a Roblox squad lobby.

## 0. Verdict

| Concept | Wow | Coherence | Feasibility | Perf risk | Theme scalability | Notes |
|---|---|---|---|---|---|---|
| **FRONT END** (game front-end) | 8 | **9** | **8** | medium | **9** | One slot primitive, one `--accent` variable, four sigils. Fixed-camera lobby keeps plates out of the render loop. Bento layouts defined for every count from 1 to 8. |
| VEINWORKS (rooms + trunk vein) | **9** | 7 | 5 | high | 7 | The best metaphor, but 7 rooms make a long phone scroll. Spine, doorways and the fixed room-light layer are a lot of extra moving parts. ~500 KB per avatar is too heavy. |
| ISSUE 02 (editorial × HUD) | 7 | 6 | 6 | medium | 7 | It needs a third font (+18 KB). wdth 75 isn't in our subset (it covers 100–125). Full-bleed 900px posters don't scale to 8 apps. Editorial + HUD reads as two systems. |

**Winner: FRONT END.** Grafted from the others:
- From VEINWORKS: hero pulse tinted by live game (`setPulseTint`). A live "he is here" dot on the matching system-bar tick. Contact copy keyed to status. 2D posters are a first-class state, painted by SSR before the 3D loads.
- From ISSUE 02: server-side privacy allowlist plus a `v` field on the status contract. The bot embed is labelled "Example output". No third-party album art. Per-theme contrast fixtures. Old player/flagship code is deleted to pay for the new code. Lighthouse runs with the status service both up and down.

Changes to FRONT END itself:
- Builds moves before Lobby. It is the reason people stay, and pushing the heavy 3D further down helps LCP and TBT.
- Open squad slots are DOM silhouettes, not a GL mannequin.
- Reduced motion uses the 2D posters instead of a 3D still.
- System bar is `position: fixed`, not sticky.

## 1. Page order and global frame

```
SystemBar (fixed, 48px)           src/shell/
00 MAIN MENU   <header> #top      src/hero/          only h1
01 LOADOUT     #about             src/loadout/
02 BUILDS      #work              src/work/
03 LOBBY       #squad             src/squad/  (+ PartyPanel from src/status/)
04 COMMS       #contact           src/contact/
Footer                            src/shell/Footer.tsx
```
The ids `#about`, `#work` and `#contact` are kept so existing links still work.

**Grid.** 390: 1 column, 16px gutter. 768: 8 columns, 32px. 1440: 12 columns, 64px gutter, 90rem max. 8px rhythm throughout. Section padding-block is 96px at 390 and 160px at 1440. `html { overflow-x: clip }`.

**Type.** Mona Sans and Martian Mono only. No new font bytes.

| Use | Setting |
|---|---|
| Game-UI labels (menus, slot names, section titles, app titles) | Mona `font-stretch:125%`, weight 800, uppercase, tracking -0.02em |
| Copy | wdth 100, weight 400–500 |
| Numbers, timers, versions, HUD text | Martian Mono |

**Tokens.** `--ease-out: cubic-bezier(.22,1,.36,1)` and `--ease-spring` (the existing one). Durations are 160/240ms for interface feedback and 400–560ms for entrances. Every themed surface reads exactly five variables:
- `--accent`
- `--accent-ink`: text on the accent, ≥4.5:1
- `--surface-0`
- `--surface-1`
- `--glow`

**`<SectionHeader>`** (shared).
- Kicker: mono 11px, tracking .12em, ink-400. Format is `02 ─── BUILDS`. The hairline grows from 0 to 48px on reveal.
- Right side of the kicker: a real readout, e.g. `2 SHIPPED · 1 IN THE FORGE` or `3/5 READY`.
- Title: wide 800, `clamp(2rem, 1.3rem + 2.8vw, 3.75rem)`.
- An sr-only plain-English subtitle follows the title ("What I've built").

**`.slot` frame** (the only framing primitive).
- Radius 12px (pad) or 20px (card). Background is an iron-900→850 gradient with an inset 1px hairline at 8% white.
- Four 8px L-shaped corner ticks in `--accent` at 60%, drawn with background-image only, so no extra DOM.
- Hover / focus-within: the ticks move out 3px and the glow `0 0 0 1px accent/35%, 0 12px 48px -12px accent/50%` fades in over 160ms.

**Sigils.** Four 24-grid SVGs, 1.5px stroke, currentColor, ~300 B each:

| Pillar | Sigil |
|---|---|
| Programming | caret in brackets |
| Games | crosshair with a centre gap |
| Anime | 3 speed lines into a 4-point spark |
| Training | plate ring with a bar through it |

They are the only identity marks. They appear in the system bar, the Loadout, Builds platform tags and the footer sign-off.

**UI lexicon.** MAIN MENU, LOADOUT, BUILDS, LOBBY, COMMS, READY, OPEN SLOT, IN MATCH, IN THE FORGE, SIGNED IN AS.

**Banned:** XP bars, levels, rarity tiers, skill percentages, and any readout that isn't real data.

## 2. Sections

### System bar (`src/shell/SystemBar.tsx`)

Fixed 48px. Rendered as the first child of the App root, never inside an animated wrapper (trap §7.1). Background is iron-950 at 72% with `backdrop-filter: blur(12px)`, plus a bottom hairline.

- **390:** hidden over the hero. Past the hero it shows on scroll-up and hides on scroll-down (translateY on the bar itself). Layout: `MRH` monogram on the left, status chip on the right (max 220px, ellipsis).
- **1440:** fades in once the hero is 60% scrolled past, then stays.
  - Centre: ticks `LOADOUT · BUILDS · LOBBY · COMMS` as anchors. The current one gets a 2px amber underline, driven by a scroll listener plus a `visibilitychange` re-check (trap §7.4).
  - A 6px live dot marks the tick that matches what he's doing: CS2/War Thunder → Loadout, Roblox → Lobby, editor → Builds.
  - Chip max-width is 360px.

### 00 MAIN MENU (hero, `src/hero/`)

Keep the vein canvas, its phone variant, the h1 sizing and the LCP behaviour from v1. The h1 never animates.

**Remove:** the flight pulse, `CONTRAIL` palette entries, the tagline "a habit of looking up", FL350 and "the Cloud" line.

**390:**
- h1 `MrHarold` (v1 size).
- Tagline: 18px ink-300, max 28ch.
- MENU: 4 full-width rows, 56px each, in this order:
  - `01 BUILDS ›`: primary, with a 2px amber left bar
  - `02 LOADOUT ›`
  - `03 LOBBY ›`
  - `04 COMMS ›`
- Each row: mono index in ink-500, label in wide 800 at 20px. Rows are `<a href="#…">`.
- Under the menu, the **SIGNED IN AS** chip (64px row):
  - Roblox headshot, 40px circle
  - status glyph on the headshot's ring
  - `MrHarold`
  - status line (§6)
  - on the right, mono 10px `v2 · build 2026.10.01` from `data.builtAt`

**1440:**
- h1 on the left at v1 size.
- Menu under it: 520px wide, 64px rows, 32px labels.
- Player chip bottom-right: 320px, in a `.slot`.
- `SCROLL ↓` mono hint, bottom-centre.

**Wow.** Hovering or focusing a menu row:
- the label slides 8px with the spring
- a hairline draws from the label to the canvas edge
- the row calls `engine.pulseAt(rowRight, rowMidY)`, so the vein network lights toward the row

On touch the pulse fires on press. When status says he's in a favourite game, the ambient pulses take that game's accent via a new `engine.setPulseTint(rgb | null)`.

**Motion.** Menu rows stagger 70ms (opacity + 12px y, 560ms), then the canvas fades in over 600ms. Reduced motion: static frame, opacity only, no pulses.

### 01 LOADOUT — who I am (`src/loadout/`)

A character sheet. Programming is the MAIN class. The base site palette (amber + teal) *is* the Programming theme.

**1440 (12 columns):**
- **Columns 1–5, CHARACTER:**
  - Roblox avatar poster (600×880 AVIF, built by P4) standing on a lit disc: CSS radial gradient plus two 1px ellipse rings in `--accent`.
  - Under it, mono `CLASS PROGRAMMER` with an amber `MAIN` pill.
- **Columns 6–12:**
  - Bio at `--text-lead` (`**x**` renders amber).
  - SLOT GRID:
    - **PRIMARY:** full width, 200px. 32px sigil, `PROGRAMMING` in wide 800 at 32px, mono `MAIN CLASS`. On the right, a faint teal PCB trace (a still exported once from the vein generator at build time) and up to 2 build-time GitHub readouts (`PUBLIC REPOS`, `LAST PUSH 3D AGO`). The readouts are hidden if the fetch failed.
    - **Secondary row:** 3 slots, 200px tall: `GAMES`, `ANIME`, `TRAINING`.
  - DETAIL PANEL below the grid, min-height 240px.

**390:**
- Kicker.
- A row with a 72px avatar head crop and `MrHarold / CLASS PROGRAMMER · MAIN`.
- Bio at 22px.
- PRIMARY slot, full width, 120px.
- The three secondary slots as a 3-up row (~114×112: sigil + 12px label, ≥44px targets).
- Detail panel, min-height 280px.

**Mechanics.**
- The slots are a real ARIA tablist: roving tabindex, arrow keys, Home/End.
- Selecting a slot sets `data-pillar` on the section. `--accent` and `--glow` transition over 240ms, so the disc rings, corner ticks and background bloom all re-skin.
- The panel crossfades over 160ms. Default selection is Programming.
- **SSR renders all four panels.** The inactive ones are `hidden`, so no content depends on JS.

**Detail panels.** Each uses one accent and one motif; all are built from `.slot`.

- **Programming** (teal):
  - Code-editor panel: a 1px line-number gutter and mono text.
  - Content is `pillars.programming.stack[]`. If empty, it shows `This site: Vite · React · TypeScript · raw WebGL`, which is true.
  - Plus `Currently building → {newest project}`.

- **Games** (amber): three tiles in favourite order. The CS2 tile is biggest: 2 rows at 1440, full width at 390.
  - **CS2** (tan `#d9b26a`):
    - Buy-menu language: a 3×2 hairline cell grid with mono 1–6 (decorative) and a gapped CSS crosshair that eases toward the pointer inside the clipped tile (spring, fine pointers only).
    - Optional `games.cs2 {rank, hours, role, map}` shown as a scoreboard row.
    - Empty: `FAVOURITE · #1` and the crosshair.
  - **War Thunder** (phosphor `#b7e07a` at low intensity):
    - Pitch-ladder SVG, plus a compass tape that animates `background-position` inside a pinned box.
    - Optional `games.warThunder {nation, topBR, mainVehicle}`, with BR as a big mono readout (e.g. `11.7`).
    - Empty: ladder + `FAVOURITE`.
  - **Roblox** (coral `#ff8f80`):
    - 8px stud texture (radial-gradient tile with a 2px highlight).
    - Links `Meet the squad ↓` (#squad) and `Built for it: Prospecting Atlas` (#work).
  - **Live tie-in:** if status matches a tile, it shows `IN MATCH · 23:14` (session timer, 1 Hz, only while visible) and its ticks pulse once every 4s. Nothing is shown otherwise.

- **Anime** (violet `#a78bfa`):
  - Manga-panel language: 3 angled `clip-path` frames with a 3px halftone texture, and speed lines on hover.
  - `pillars.anime {nowWatching:{title,ep?}|null, favourites:string[≤5]}`. Filled: `NOW WATCHING` with the title in wide 800, favourites as numbered panel captions.
  - Empty: the frames plus "One more episode. Always."

- **Training** (blue `#60a5fa`):
  - Concentric plate rings, and a 4-tick tempo bar on a 3s loop (paused offscreen and under reduced motion).
  - `pillars.training {split, lifts:[{name,value,unit}]≤4}`, with lifts as big mono readouts like `BENCH  100 KG`.
  - Empty: rings plus "Consistency over noise."

### 02 BUILDS — what I've built (`src/work/`)

- Header readout: `{shipped} SHIPPED · 1 IN THE FORGE`.
- Every project is an **ITEM CARD** (`.slot`, radius 24), top to bottom:
  - HUD strip, mono 11px: `B-01`, a status pill (LIVE teal / BETA amber / WIP violet / ARCHIVED ink), platform sigils.
  - THEME LAYER: `aria-hidden`, box reserved with `aspect-ratio`.
  - Title in wide 800: 28px at 390, 40px at 1440, 48px when featured.
  - One-line tagline, ink-300.
  - Up to 3 mono readouts (28–40px numbers).
  - CTAs: `Open ↗` (accent-filled, 48px) and `Source` (ghost).

**Bento by count.**

At **1440 (12 columns):**

| n | Layout |
|---|---|
| 1 | 7 + forge 5, 560px |
| 2 | 7 + 5, 600px, featured on the left |
| 3 | 7 (640px) + a 5-column stack of 2 × 312px |
| 4 | 7+5 / 5+7 zig-zag, 440px |
| 5–8 | First row 7+5 at 480px, then 4+4+4 rows at 380px |

The **IN THE FORGE** card fills any gap in the last row and is always present while n < 8. It has dashed ticks, a sigil, "Next build loading. New tools land here as they ship." and a GitHub link. Rows are never ragged.

At **768:** 2 columns, with the featured card spanning both.

At **390:**
- Single column. Featured is 520px, others 440px.
- When n ≥ 5, non-featured cards collapse to a 96px inventory row (art strip + title + Open).

**Motion.**
- Reveal: 70ms stagger.
- Hover / focus-within: `translateY(-4px)` with the spring (480ms), art parallax ±8px (rAF-throttled, fine pointers only), and the theme's micro-animation plays.

### 03 LOBBY — squad + party status (`src/squad/`)

**1440:**
- Header readout: `n/5 READY`.
- Sub-line: "My Roblox party. Tap someone to say hi."
- Canvas host spans 12 columns at 16:7 (~1280×560). A faint `LOBBY` word in wide 800 at 20vw, 3% opacity, sits behind it in the DOM.
- Below the canvas: the **PartyPanel** (columns 1–5) and the **Roster** list (columns 6–12).

**390:**
- Canvas at 4:5 (358×448) in a V formation.
- Then the Roster (the primary info at this width), then the PartyPanel.

**Plates.** A 32px pill per slot, positioned at the slot's feet from a static % table. Each plate is a `<button aria-label="Wave at {name}">` with the name and an optional mono role tag, plus a separate profile link.

**Roster.** The accessible source of truth: up to 5 rows, each with a 40px build-time headshot AVIF, name, role and profile link.

**Open slots** (fewer than 4 friends):
- A DOM silhouette SVG (ink-500 at 35%), a dashed floor ring, and a non-interactive `OPEN SLOT` plate.
- 0 friends: P1 solo with 4 open slots and `1/5 · WAITING FOR SQUAD`. This is deliberate.

**Wow: READY CHECK.** At 60% visible:
- avatars materialise left to right with a 180ms stagger (existing scan shader)
- the readout ticks `1/5 → n/5 READY` with an amber flash on each step
- all floor rings pulse together once

Runs once. Reduced motion: posters, everything shown at once.

### 04 COMMS (`src/contact/`)

Same structure as v1 and the same Supabase form.

**Discord card:**
- Bot-theme surface `#2b2d31` with a blurple local accent. Live glyph on the avatar ring.
- A status line under the handle:

| Status | Line |
|---|---|
| online | Online now — fastest reply. |
| idle | Away — I'll see it soon. |
| dnd | Heads down — I'll reply later. |
| offline | Offline — leave a message below. |
| unknown / failure | nothing (handle only) |

- `Copy handle` stays primary (48px, amber).

**Elsewhere:**
- Secondary channels become 56px "party invite" rows with sigils.
- Form inputs use slot frames with amber focus rings.

### Footer (`src/shell/Footer.tsx`)

`Back to main menu ↑` (wide 800, 20px) · `© MrHarold {buildYear}` · `Source` · mono `v2 · build {builtAt}` · the 4 sigils at 16px in ink-500.

## 3. App theme registry (`src/work/themes/`)

```ts
// src/data/types.ts (schema → 2)
export type Platform = 'roblox' | 'discord' | 'web' | 'cli';
export interface ProjectStat { label: string; value: string }       // value preformatted, real data only
export interface Project {
  slug: string; title: string; tagline: string; description: string | null;
  url: string | null; repoUrl: string | null; status: ProjectStatus;
  platform: Platform[]; accent: Accent; image: ProjectImage | null;
  theme: string | null;            // registry key; unknown/null → 'forge'
  featured: boolean; sort: number;
  stats: ProjectStat[] | null;     // ≤3; atlas overrides from live build data
  themeConfig: Record<string, unknown> | null; // theme-specific, validated by the theme
}

// src/work/themes/types.ts
export interface ThemeArtProps<C = unknown> { project: Project; config: C; active: boolean; reduced: boolean }
export interface ThemeDef<C = unknown> {
  id: string;
  label: string;
  vars: { accent: string; accentInk: string; surface0: string; surface1: string; glow: string };
  motif: 'strata' | 'chat' | 'trace' | 'grid' | 'scanline' | 'ladder';  // rule of one texture
  Art: (p: ThemeArtProps<C>) => JSX.Element;   // SSR-safe, CSS + inline SVG only, no canvas
  parseConfig?: (raw: unknown) => C | null;    // invalid → null → Art renders its empty state
  readout: 'ore' | 'discord' | 'plain';
}
export const themes: Record<string, ThemeDef<any>>;   // index.ts
export const resolveTheme = (id: string | null) => themes[id ?? ''] ?? themes.forge;
```

**Rules.**
- `.theme-{id}` sets the five variables on the card root. Theme CSS goes in `themes.css`, at most 150 lines per theme, scoped by the `.theme-{id}` selector.
- Art animates only while `data-active` is set. Active means ≥60% in view on touch devices, or hover/focus on pointer devices. Animation also pauses on hidden tabs and under reduced motion.
- Each theme may add 1 accent and 1 texture. Typography never changes per theme.
- Budget: ≤2 KB gz each, shipped in the main chunk. They are SSR-rendered, so first paint is complete.
- **Data merge:** gen-data merges `site.projects` (config) with Supabase rows by slug, and **Supabase wins on any field it sets**. Supabase migration `0002_projects_v2.sql` adds `theme text`, `featured bool default false`, `sort int`, `stats jsonb`, `platform text[]` and `theme_config jsonb`.
- Adding app #3–#8 takes one Supabase row, plus a new theme file only if it wants a bespoke look.

**`atlas` — Prospecting Atlas, "lantern cavern."**
- **Surface:** warm umber `#0c0a07→#1b140b`, lantern amber.
- **Art:**
  - 3 stratified rock bands (layered SVG wave paths, iron/umber).
  - 18 faceted ore polygons in teal, amber, violet and coral.
- **Lantern:** a radial mask (220px, amber core at 22%) at `--mx/--my`, set from rAF-throttled pointermove on the card. A second, full-saturation copy of the ore layer sits under the same mask, so ore glints inside the light. On touch: a slow Lissajous drift (keyframed `background-position` in a pinned box) while active.
- **Readouts:** ore-tally style, `113 MINERALS · 33 DIG SITES · 194 PAGES`, from the existing live build stats with fallback.
- **Screenshot:** at 1440 when featured, a "field journal" inset of the existing desktop screenshot sits on the right 45%, tilted -2deg, lazy AVIF with explicit w/h. At 390 it is dropped and the cavern fills a 240px band.

**`discord-bot` — Prospecting bot, "slash palette."**
- **Surface:** `#1e1f22/#2b2d31` with blurple `#5865F2`, used as colour only. No logo.
- **Art sequence:** a composer row whose caret types `/`, then the command palette opens. The palette has up to 6 visible rows of `/name  description` (mono name, sans description), and the highlight steps down two rows.
- **Embed:** a 4px amber left bar, bold title, and a 2-column field grid, captioned `Example output`.
- **Timing:** the sequence plays once when active (1.8s), then only the caret loops.
- **themeConfig:** `{commands:{name,description}[], exampleEmbed:{title, fields:{name,value}[]}|null, inviteUrl:string|null}`.
- **Empty states:**
  - No commands: a large `/11` readout ("slash commands", count from `atlas.stats.discordCommands`) over hairline skeleton bars that are clearly not text.
  - No embed: hidden.
- **Readouts:** `11 COMMANDS` and `SAME DATA AS ATLAS`.
- **CTA:** `Add to server ↗` if `inviteUrl` is set, otherwise `Open Atlas ↗`.

**`forge` — fallback.**
- Iron surface; `--accent` from `project.accent`.
- Art: a vein-trace still SVG corner (exported at build time from the generator) plus a cooling-ember radial gradient that brightens when active. `project.image` is shown in a hairline bezel if present.
- Readouts: plain.
- An untouched Supabase row looks deliberate on day one.

Shortlisted next themes, not shipped: `terminal`, `blueprint`, `hud`.

## 4. Identity system

**Pillars and accents** (all accents are local):

| Pillar / item | Accent | Notes |
|---|---|---|
| Programming (main) | teal `#3ee0d0` on the amber/iron base | |
| Games | amber `#ffc247` | |
| Anime | violet `#a78bfa` | |
| Training | blue `#60a5fa` | |
| CS2 | tan `#d9b26a` | |
| War Thunder | phosphor `#b7e07a` | |
| Roblox | coral `#ff8f80` | |
| Atlas | amber on umber `#1b140b` | |
| Bot | blurple `#5865F2` on `#2b2d31` | white text on blurple fills (≥4.5:1); blurple never as small text |

Every accent/surface pair goes in the contrast fixture `scripts/qa/contrast.mjs`, and CI fails below 4.5:1 for text pairs.

**Games are evoked, never copied.** Game names appear as plain text only. No logos, screenshots, game fonts or trademarked icons.
- CS2: buy-menu cells, scoreboard rows, gapped crosshair
- War Thunder: pitch ladder, compass tape, BR readout
- Roblox: studs, block silhouettes

**Copy voice.** First person, short, dry, no aviation anywhere.

**Portrait.** The ChatGPT portrait (goggles + plane) is retired. `avatar` becomes `portrait: null`, an owner slot for a new illustration, and the Loadout uses the Roblox render.

**SEO.**
- Title: `MrHarold — programmer by trade, gamer by default`.
- The OG image is regenerated: MrHarold over the vein field with the 4 sigils, no plane.

## 5. Squad scene (`src/player/` refactor + `src/squad/`)

**Engine.** Split `mountPlayer` into:
- `createStage(canvas, opts)`: owns context, program, floor, camera, IO/visibility/resize/context-loss handling, the EMA governor and DPR caps. All of this is existing code.
- `stage.add(manifestUrl, slotIndex, accent) → Actor { wave(); setHighlight(on); destroy() }`.

`mountPlayer` stays a wrapper (stage + 1 actor). The new entry point is `mountSquad(canvas, { actors, layout:'line'|'v', onReady, onSpawn(i), onError })`. Each actor has its own VAO, buffers, textures and spring bank (7 slots), plus a random idle phase. All actors share one rAF. Draw order is floor first, then actors front to back, opaque before alpha. Budget is +4 KB gz on the 10 KB lazy chunk.

**Camera and layout.** The camera is fixed: no orbit, no pointer look-at.

| Layout | Slot x (studs) | Slot z | Camera |
|---|---|---|---|
| line (≥48rem) | 0, ±3.4, ±6.8 | 0, -1.5, -3 | FOV 28°, eye height 4.2 |
| V (phone) | 0, ±2.2, ±3.6 | 0, -2.4, -4.6 | raised |

Slot order is f2, f1, ME, f3, f4. `src/squad/layout.ts` exports both the shader slot constants and the plate % anchors, so plates never sync per frame. Tapping the canvas hit-tests against precomputed slot rects.

**Floor.** One quad shader (~40 lines GLSL):
- an 8-stud grid at teal 6%
- an amber pool under each slot
- a per-actor ring uniform `(accent, intensity)`, driven by highlight and the spawn pulse

Friend accents default to rotating teal, violet, blue and coral. P1 is amber.

**Animation.**
- Existing breathe and sway, phase-offset per actor.
- A glance at a neighbour every 6–10s (yaw spring ±20°). P1 occasionally shifts weight.
- Wave on plate hover/focus/click or canvas tap; the ring brightens while waving.
- Staggered 180ms spawn scan.

**Assets** (`npm run roblox:squad`, which runs `fetch-roblox --squad` and then `preprocess --lod squad`):
- Friends are fetched at build time by userId and committed as hashed files under `public/roblox/squad/<id>/`. There are no runtime Roblox calls.
- LOD: ≤7k tris per avatar, with decimation that protects head-bone vertices. Textures max 256px on desktop and 128px in a phone pack chosen by `matchMedia('(max-width:48rem)')`. Accessory alpha is kept.
- Size targets: ≤160 KB per avatar on desktop and ≤90 KB on phone (5 avatars ≈ 800 / 450 KB). P1 uses the same LOD.
- Also built per member: 2D posters (240×360 AVIF/WebP) and a 40px headshot AVIF. P1 additionally gets a 600×880 Loadout poster.
- Removing a userId and rebuilding deletes that member's assets.

**Gating and loading.**
- SSR always paints the 2D poster line-up into the slots: reserved size, CLS 0.
- 3D loads only if WebGL works, `!saveData`, `(deviceMemory ?? 4) ≥ 4` and motion is not reduced.
- The trigger is IO with a 600px rootMargin. P1 loads first, then friends one after another.
- Each slot crossfades from poster to 3D on `onSpawn`. The ready check starts once all actors are ready, or after a 2.5s timeout.
- Limits: ≤40k tris, ≤20 draw calls, DPR cap 1.5 on phones and 2 on desktop. If the EMA stays above 22ms for 60 frames, DPR drops to 1. If it is still slow, `onError('perf')` swaps the stage back to posters.
- Fully paused offscreen and on hidden tabs.
- The canvas is `aria-hidden`.

## 6. Live status (`src/status/` + `services/status/`)

**Service.** `services/status/`: Node 22, discord.js, about 250 lines, its own Dockerfile, deployed on Coolify as `status.mrh.lol`.
- A bot with the `GUILD_PRESENCES` privileged intent, in a server the owner shares with it, watches `STATUS_DISCORD_USER_ID`.
- A Roblox poller runs every 30s (presence API, server-side).
- The merged snapshot is kept in memory and served as:
  - `GET /v1/status`
  - `GET /v1/stream` (SSE: full snapshot on change, `: ping` every 25s, `X-Accel-Buffering: no`)
- CORS allows only `https://mrh.lol`.
- A **server-side allowlist** (env/config) drops fields the owner disabled. Spotify is off by default.
- On the site, nginx CSP `connect-src` adds `https://status.mrh.lol`. No album art, so `img-src` is unchanged.

**Contract** (`src/status/types.ts`, mirrored in the service):
```ts
export interface StatusSnapshot {
  v: 1; updatedAt: string;
  discord: { status: 'online'|'idle'|'dnd'|'offline';
             custom: { emoji: string | null; text: string } | null;
             activities: { kind: 'playing'|'streaming'|'watching'|'competing'; name: string;
                           details: string | null; state: string | null; startedAt: string | null }[];
             spotify: { track: string; artist: string; startedAt: string; endsAt: string } | null } | null;
  roblox: { state: 'offline'|'online'|'in-game'|'studio'; game: { name: string; url: string } | null } | null;
}  // a null source = unavailable
```

**Client store.** `useSyncExternalStore`, ~2.5 KB gz, in main. It replaces `src/roblox/presence.ts`.
- Startup: `GET` in `requestIdleCallback` after load (5s timeout).
- SSE: open only while a status surface is on screen and the tab is visible; close when hidden. Re-fetch on `visibilitychange`.
- Retries: reconnect backoff 2s → 60s. After 3 SSE failures, fall back to a 30s poll.
- Roblox fallback: if status.mrh.lol is down, the Roblox row stays live from the same-origin `/api/roblox-presence`.
- SSR uses the `LOADING` snapshot (`getServerSnapshot`). Live classes are applied in effects only (trap §7.6).

**Derived selectors:**
- `useStatusLine()`: priority is game activity ("Playing Counter-Strike 2") > Roblox in-game ("In Roblox · Prospecting!") > Spotify ("♪ Track — Artist") > custom status > status word.
- `useLiveGame()`: returns `'cs2'|'warThunder'|'roblox'|'code'|null`, matching activity names with `site.status.gameMatchers`.

**Glyphs.** Shape and colour, always with a text label:

| State | Glyph |
|---|---|
| online | filled teal dot |
| idle | amber crescent |
| dnd | coral dot with a bar cut out |
| offline | 2px ink-500 ring |
| streaming | violet dot |
| unknown | ink-500 `?` ring |

**Surfaces:**
- SystemBar chip: 32px. Tapping it scrolls to #squad.
- Hero SIGNED IN AS chip.
- Loadout `IN MATCH` badge.
- System-bar live tick.
- Hero pulse tint.
- Comms card.
- **PartyPanel**, the full detail view, as rows:
  - **DISCORD:** status word plus custom status.
  - **ACTIVITY:** game name in wide 700, details/state in ink-300, and an `IN MATCH 00:23:14` timer (1 Hz, only while visible). The row borrows the game's accent and motif when the game is a favourite.
  - **SPOTIFY:** ♪ track and artist, with a 2px CSS-only progress bar (duration = `endsAt − startedAt`, negative delay = elapsed).
  - **ROBLOX:** `In game · {name}` with `View game ↗`, `In a game` when the name is hidden, `Building in Studio`, `Online` or `Offline`.
  - **Footer:** mono 10px, `live · updated 12s ago`.

**States (designed, never faked):**

| State | What the surfaces show |
|---|---|
| LOADING | Hairline ring breathing at 1.2s (static under reduced motion). "Connecting…" in ink-500. Skeleton bars at final row heights. |
| LIVE | Text crossfades over 160ms. A single `aria-live="polite"` summary in the PartyPanel, at most one announcement per 30s, never for timers or Spotify. |
| PARTIAL | A null source hides its row and shows "Roblox status unavailable" in ink-500. |
| HIDDEN | Service OK but the user isn't visible to the bot: `?` ring and "Status hidden". |
| STALE | No event for more than 90s: last values greyed with `last seen 4m ago`. After 180s, falls to FAILURE. |
| FAILURE | Chip: "Status offline". Panel: "Can't reach the status relay right now." plus a 44px `Retry`. Comms card shows the handle only. Never an invented "Online". |

## 7. Config slots (`src/config/site.ts`, the single owner file)

The file header gets a checklist of every `TODO(me)` slot. Every null slot has a designed empty state (above).

| Slot | Type | Empty state |
|---|---|---|
| `identity` (tagline), `bio` | string | final copy set (§8) |
| `portrait` | `ImageSet \| null` | Roblox render |
| `pillars.programming.stack` | `string[]` | "This site: Vite · React · TypeScript · raw WebGL" |
| `pillars.anime` | `{nowWatching:{title,ep?}\|null, favourites:string[≤5]}` | frames + "One more episode. Always." |
| `pillars.training` | `{split:string\|null, lifts:{name,value,unit}[≤4]}` | rings + "Consistency over noise." |
| `games.cs2` | `{rank,hours,role,map}` all `string\|null` | `FAVOURITE · #1` |
| `games.warThunder` | `{nation,topBR,mainVehicle}` | ladder + `FAVOURITE` |
| `squad` | `{robloxUserId, displayName, role:string\|null, accent:string\|null}[≤4]` (**friends' consent first**) | open slots |
| `projects` | `Project[]` (Atlas + bot shipped) | — |
| `projects['prospecting-bot'].themeConfig` | `commands`, `exampleEmbed` (paste real bot output), `inviteUrl` | `/11` skeleton |
| `status` | `{endpoint:'https://status.mrh.lol', show:{discord,activity,custom,spotify:false,robloxGame}, gameMatchers:{cs2:/counter-strike/i, warThunder:/war thunder/i, roblox:/^roblox$/i, code:/^(visual studio code\|cursor\|jetbrains.*\|neovim\|zed)$/i}}` | — |
| `contact.discord.serverInvite` | `string \|null` | hidden |

**Removed:**
- `interests` becomes `['programming','games','anime','working out']`.
- `location.flourish`, `flagship`, `roblox.card` and `forgeCard` are replaced by `work.forgeSlot`.
- `avatar` is replaced by `portrait`.

## 8. Copy (final)

**Tagline (hero, final):** **"Programmer by trade. Gamer by default."**
- Alternate 1: "Main class: programmer. Side quests: everything else." (also used as the Loadout kicker line)
- Alternate 2: "Code by day. Clutches by night."

**Bio (final):** "I'm MrHarold — a programmer who builds tools for the games I play, like **Prospecting Atlas**. Off the keyboard it's CS2, anime and the gym."
- Alternate 1: "Programmer first, gamer always. I build the tools I wish my games had, then queue CS, catch an episode, or lift something heavy."
- Alternate 2: "I build the tools I wish my games had. The rest of the time I'm in a match, an episode, or the gym."

**Fixed micro-copy:**
- Lobby: "My Roblox party. Tap someone to say hi."
- `OPEN SLOT` · `WAITING FOR SQUAD`
- Forge: "Next build loading. New tools land here as they ship."
- Status failure: "Can't reach the status relay right now."
- Footer: "Back to main menu ↑"
- SEO description: "MrHarold: programmer and gamer. I build tools for the games I play, like Prospecting Atlas and its Discord bot."

## 9. Perf and lazy plan

**Baseline:** main 87.3 KB gz, vein 12.2 KB lazy, player 10.1 KB lazy.

**New code (gz):**

| Item | Size | Chunk |
|---|---|---|
| Shell, SectionHeader, slot, sigils | 1.5 KB | main |
| Status store + chip + PartyPanel | 3.5 KB | main |
| Loadout tablist + 4 panels | 4 KB | main |
| Registry + atlas/bot/forge themes | 5 KB | main |
| Squad stage | +4 KB | player chunk, lazy |

**Offsets:** delete PlayerSection, PlayerCard, PlayerTrace, presence, FlagshipCard, StatStrip, ProjectGrid, About and Bezel (≈ −5 KB).

**Projected:** main ≈ 96 KB, total ≈ 123 KB.

**Enforced in `scripts/qa/budget.mjs`** (CI fails above these):
- main ≤ 105 KB
- every lazy chunk ≤ 16 KB
- total ≤ 140 KB

**Load order:**
1. h1 + Mona preload (LCP unchanged).
2. Hydrate.
3. Vein fade-in.
4. Idle: status GET.
5. IO 600px near #squad: player chunk + LOD pack (450 KB phone / 800 KB desktop; never on saveData).
6. Atlas inset AVIF: lazy, 1440 only.

**Runtime:**
- Exactly one 2D canvas (hero) and one WebGL context (squad). Both pause offscreen and on hidden tabs.
- Theme loops are CSS gated by `[data-active]`.
- Lantern: rAF-throttled, writes 2 CSS variables.
- Spotify bar: CSS only.
- Timers: 1 Hz only while visible.
- Animations use transform and opacity only, plus `background-position` inside pinned boxes (trap §7.2).

**CLS:**
- `aspect-ratio` on every art box and the canvas host.
- Loadout panel min-heights.
- Status rows at fixed height with ellipsis.
- Chip min-width reserved at SSR.

**QA additions:**
- `qa:shots` at 390 and 1440 for:
  - Builds with n = 1, 2, 3, 5, 8 (fixtures)
  - Lobby with 0, 2, 4 friends, in both 3D and poster modes
  - Status fixtures: loading, online, CS2 in match, Spotify, hidden, stale, failure
  - All-empty and all-filled config
- Horizontal-scroll check mid-animation.
- Contrast fixture.
- Lighthouse mobile ≥95/100/100/100 with status.mrh.lol both **up and down**.

## 10. Implementation packages (disjoint files)

**Day 0 (P1, one commit, before the others start):**
- the `SiteConfig` v2 types and all slots in `site.ts`
- `src/data/types.ts` schema 2
- tokens in `global.css`
- the `.slot`, `SectionHeader` and `Sigil` exports

P5 lands stub exports for `src/status/index.ts` on day 0, returning LOADING only. After day 0, `site.ts` and `types.ts` change only via P1.

| Pkg | Owns (exclusively) | Delivers |
|---|---|---|
| **P1 Shell + Hero + QA** | `src/App.tsx`, `src/config/site.ts`, `src/data/types.ts`, `src/data/index.ts`, `src/styles/**`, `src/components/**`, `src/shell/**` (SystemBar, Footer), `src/hero/**` (incl. `veins/*`: remove flight, add `setPulseTint`), `src/seo/**`, `src/sections/Footer.tsx`→moved, `src/sections/sections.css`, `src/sections/qa.ts`, `scripts/gen-assets.mjs` (OG), `scripts/qa/**`, `public/og.png`, `index.html` | Frame, menu + pulse wow, chip placement, final copy, budget/contrast/shots gates, final integration and deletion of dead CSS |
| **P2 Loadout** | `src/loadout/**`, deletes `src/sections/About.tsx`, `Bezel.tsx`, `public/avatar/**` | Character sheet, tablist, 4 panels, 3 game tiles, IN MATCH tie-in via `useLiveGame()`, fixtures (`src/loadout/__fixtures__`) |
| **P3 Builds** | `src/work/**` (registry, themes, ItemCard, Bento, ForgeSlot), `scripts/gen-data.mjs` (merge + GitHub readouts + vein-trace still export), `supabase/migrations/0002_projects_v2.sql`, deletes `src/sections/{Work,FlagshipCard,StatStrip,ProjectGrid,ProjectCard,ForgeCard}.tsx`, `src/sections/__fixtures__/projects.ts`, `scripts/shoot-atlas.mjs`, `public/projects/**` | atlas / discord-bot / forge themes, bento 1–8, fixtures n=1..8 |
| **P4 Squad** | `src/player/**` (stage refactor, keep tests green first), `src/squad/**` (Lobby, Roster, Plates, Posters, layout.ts), `scripts/roblox/**` (`--squad`, `--lod squad`, posters, headshots, 600×880 loadout poster), `public/roblox/**`, deletes `src/roblox/**`, `src/sections/__fixtures__/avatar.ts` | Lobby section, ready check, gating, poster fallback (build fallback first), `npm run roblox:squad` |
| **P5 Status** | `services/status/**` (bot, poller, SSE, Dockerfile, README), `src/status/**` (types, store, glyphs, StatusChip, PlayerChip, PartyPanel, selectors, fixtures), `src/contact/**`, `nginx.conf`, `DEPLOY.md` | Service on Coolify, store + all states, Comms re-skin, CSP update |

**Merge order:** P1 day 0 → P5 stub → P2, P3, P4 and P5 in parallel → P1 integration pass (App wiring, budgets, shots, Lighthouse).

**Owner prerequisites:**
- Create the Discord application/bot with GUILD_PRESENCES and share a server with it.
- Get friends' consent and their userIds.
- Fill in the §7 slots.
- Regenerate the portrait (optional).
