# Player integration: the 3D Roblox avatar on mrh.lol

Art direction for porting `D:\code\mrh-player` into the site. Port the player as is; this file decides where it
lives and how it fits in. Tokens are the site's own (BUILD_PLAN §5). Do not use the sandbox's `--ease`/`--spring`.

## 1. Where: a dedicated beat, "02 · In game", between Who I am and What I've built

The page tells the story in this order: who I am (gamer + programmer), then what I built, which is a tool for a
Roblox game. The avatar connects the two: it proves the "gamer" line live in 3D, and its readout points straight
into Prospecting Atlas. Putting it inside About would push the avatar and the bezel portrait into one column. Putting
it in Contact would bury the page's most striking object 4,000 px down. So it gets its own stage.

Sections renumber: `about 01`, `player 02` (new), `work 03`, `contact 04`.

## 2. Composition

`<section id="player">` via `Section` with `titleStyle="label"`, title "In game". It mirrors About: About puts the
copy left and the portrait right; this beat puts the **card left** and the **copy right**.

| tier | grid | card (always 4:5) | copy |
|---|---|---|---|
| base 390 | 1 col, card first | `w-full` = 358 × 447.5 | below, `mt-10` |
| md 768 | 6 cols | cols 1–4, `max-w-[25rem]` (400 × 500) | cols 5–6, bottom-aligned |
| xl 1440 | 12 cols | cols 1–5, `max-w-[28.75rem]` (460 × 575) | cols 7–12, vertically centred |
| 3xl 2560 | 12 cols | cols 1–5, `max-w-[32.5rem]` (520 × 650; 4 × 0.338 MP = the player's 1.35 MP cap) | cols 7–12 |

These widths are the sizes SPEC §7 validated. Don't invent new aspects.

**Card surface.** `iron-900`, `shadow-hairline`, `rounded-card`, `overflow: clip`, `isolation: isolate`. Inner pedestal
pool: `radial-gradient(120% 70% at 50% 100%, rgb(255 194 71 / .10), transparent 60%)`. Hover (100 ms):
`shadow-hairline-strong`. Scrims (`::after`, z 1): a top band of iron-900 at 0.92 → 0 over 80 px, and a bottom band
at 0.7 → 0 over 84 px. Layers: canvas < scrim < label/badge (2) < actions (3).

**How the pedestal ties into the page.** The pedestal's 18 teal/amber traces are the same "vein" language as the
hero board. Carry them outside the card:
- Section bloom `.pl-bloom`: `radial-gradient(28% 22% at <card centre x> 82%, rgb(255 194 71 / .07), transparent 70%)`,
  set at xl as `22% 82%` and at base as `50% 62%`. The pedestal light should look like it spills onto the page.
- Feed trace `PlayerTrace.tsx`: an inline SVG (`aria-hidden`, ~1 KB, iron-600 base stroke 1.5 px, two 45° bends,
  pads at both ends, Contact's `Trace` idiom). At xl it runs horizontally from the card's right edge, at pedestal
  height (bottom 14 %), across the column gap into the copy's "Plays as" row. At base/md it runs vertically for 48 px
  from the card's bottom centre into the readout. It must stay inside the grid box, never past the container
  (trap #2).
- Pulse: on `wave()` (Say hi or a hover wave), an amber `stroke-dashoffset` pulse runs card → readout in 900 ms
  `--ease-out`, reusing `ct-pulse` keyframes. It starts as the player's own pedestal ring fires. On a presence change,
  the same pulse runs in teal at 60 % opacity. Motion-safe only. Under reduced motion only the pad colour changes.

**Label row** (top-left, 16 px inset base / 24 px md+, mono xs `tracking-label`):
`PLAYER 1` (uppercase, amber-400) `·` `MrHarold0011` (ink-300, **no uppercase transform**, it is a username).

**Presence badge** sits 8 px below the label, in a fixed `h-4` slot so state changes never move layout. Starts with
`<span class="sr-only">Roblox status: </span>`. No `aria-live`, because a 60 s refresh must not chatter.

| state | dot (8 px) | text |
|---|---|---|
| SSR / loading / error / `presence: 'off'` / unknown type | none | `MAIN · ROBLOX`, ink-400 (neutral, never a guess) |
| 1 online (website) | teal-400 fill, `0 0 8px` glow | `ONLINE`, teal-400 |
| 2 in game, `'status'` | teal-400, breathing 0.5↔1 over 2.4 s (flagship "Live" dot) | `IN GAME`, teal-400 |
| 2 in game, `'game'` | same | `IN GAME ·` + `lastLocation` in ink-100, normal case, `truncate max-w-[22ch]`. Empty name → plain `IN GAME` |
| 3 Studio | violet-400 fill (the one violet accent: the programmer pole) | `IN STUDIO`, violet-400 |
| 0 offline, 4 invisible | 1.5 px ink-400 ring, hollow | `OFFLINE`, ink-400 |

Text swaps cross-fade opacity over `--dur-fast`. Reduced motion: no breathing.

**Actions** (bottom, 16/24 px inset, z 3): left, **Say hi** = site `Button` primary `size="lg"` (48 px) → `wave()`;
right, **View on Roblox ↗** = `TextLink external`, `min-h-12`, ink-100 with a `0 0 12px iron-950` text-shadow over
the pedestal glow, amber-400 on hover. In `'game'` mode, when in game and `placeId` is set, this slot becomes
**View game ↗** → `https://www.roblox.com/games/<placeId>`. It is the same slot, so there is no CLS. The profile stays
reachable from the readout and from Contact. **hi! bubble**: mono xs, iron-950 on amber-400, `rounded-pad`, at top 22 % /
left 9 %, opacity (+ spring translate if motion-safe) for 1.5 s per wave. Hover-wave: only on
`(hover:hover) and (pointer:fine)`, at most once every 8 s, never while the pointer is down, only in `live`.

**Copy column** (EDITABLE in config): display line `Same me. More horns.` (`text-title`, 800, ink-100), then
`Drag me around — I wave back.` (`text-lg` ink-300). Then a mono `sm` readout `<dl>` (About's pattern):
`Plays as` → `MrHarold0011` (TextLink to profile, external), and `Built for` → `Prospecting! → Prospecting Atlas`
(TextLink `#work`). That second row is the handoff into the next section.

## 3. Mount strategy (`src/roblox/PlayerCard.tsx`)

- `data-state`: `poster` (SSR + first client render, identical, so hydration is clean: trap #6) → `spawning` →
  `live` | `fallback`. Every change goes through React state after hydration.
- **Poster** = the 2D fallback `<picture>` (avif → webp → png, 150w/300w srcset, `width=300 height=440`,
  `loading="lazy" decoding="async"`, SPEC §9 alt). Absolutely positioned, bottom 64 px, height 84 %, centred, so the
  card's `aspect-ratio: 4/5` reserves all space and CLS is 0. `sizes="(min-width:1920px) 372px, (min-width:1280px) 330px, (min-width:768px) 286px, 256px"`.
  On `onReady` the poster fades out (`--dur-base`) and the canvas snaps in (120 ms linear, so the materialise scan is
  not hidden under a fade). On `fallback` the poster stays and Say hi is removed. `<noscript>`: hide Say hi.
- **Near-viewport trigger**: one `IntersectionObserver`, `rootMargin: '100% 0px'` (~1 viewport). It fires once:
  `import('../player')` (its own chunk, ~10 KB gz), then `mountPlayer` on a **fresh `<canvas>` created in the
  effect** (a lost context cannot be reused; this also covers StrictMode). Cleanup: `destroy()` + `canvas.remove()`.
  A click on Say hi before the handle exists sets a pending flag that is replayed on mount (the player queues it
  through the entrance).
- **Skip 3D** (go straight to `fallback`, no chunk, no assets): `navigator.connection?.saveData`, or
  `hardwareConcurrency <= 2 && deviceMemory <= 2`.
- **reducedMotion**: read in an effect via `matchMedia('(prefers-reduced-motion: reduce)')` (never in a `useState`
  initializer: SSR). A `change` listener stores it in state, and it is in the mount effect's deps, so a change remounts.
- **setActive**: the player already gates its rAF on its own IO plus `visibilitychange` (SPEC §6.8). The host does
  not duplicate that. `setActive(false)` is reserved for future overlays.
- Lighthouse check: on load at 390×844 and 1440×900, no `/roblox/*` and no player chunk may be requested (card top ≈
  1,830 px vs. trigger line 1,688 px at 390).

## 4. Presence (`src/roblox/presence.ts`, `usePresence.ts`)

- One module-level store, shared by the card and the Contact tile, so there is only one network loop.
- Starts on first card visibility (IO threshold 0), never before. Then it refreshes every 60 s while the card
  intersects **and** `visibilityState === 'visible'`. On becoming visible again, it fetches at once if the last
  fetch is older than 60 s (trap #4). `fetch('/api/roblox-presence', { signal: AbortSignal.any([unmount, AbortSignal.timeout(5000)]) })`.
- Parse defensively: `userPresences[0].userPresenceType ∈ {0..4}`, else neutral. On failure, keep the last good value
  for ≤ 180 s, then show neutral. `presence: 'off'` → no fetch at all.

## 5. Server + dev proxy

`nginx.conf` (included inside `http {}`):

```nginx
proxy_cache_path /var/cache/nginx/roblox levels=1 keys_zone=roblox:1m max_size=1m inactive=10m use_temp_path=off;
# map additions (exact entries win over regexes):
#   /roblox/avatar.json   "no-cache";
#   /api/roblox-presence  "no-store";
#   ~^/roblox/(avatar\.[0-9a-f]{8}\.bin|tex/.+\.[0-9a-f]{8}\.webp)$  "public, max-age=31536000, immutable";
# gzip_types += application/octet-stream   (avatar.bin 464 KB → 277 KB)
location = /api/roblox-presence {
    limit_except GET { deny all; }
    resolver 127.0.0.11 1.1.1.1 ipv6=off valid=300s;   # Docker DNS first; a variable upstream = nginx boots w/o DNS
    resolver_timeout 2s;
    set $roblox_presence https://presence.roblox.com/v1/presence/users;
    proxy_pass $roblox_presence;
    proxy_ssl_server_name on;
    proxy_method POST;
    proxy_pass_request_headers off;                    # no client cookies/headers reach Roblox
    proxy_pass_request_body off;                       # client body ignored: not an open proxy
    proxy_set_header Content-Type application/json;
    proxy_set_header Accept application/json;
    proxy_set_body '{"userIds":[1113999731]}';         # keep in sync with site.roblox.userId
    proxy_cache roblox; proxy_cache_key roblox-presence; proxy_cache_lock on;
    proxy_cache_valid 200 45s; proxy_cache_valid any 10s;
    proxy_cache_use_stale error timeout updating http_429 http_500 http_502 http_503 http_504;
    proxy_cache_background_update on;
    proxy_ignore_headers Cache-Control Expires Set-Cookie;
    proxy_hide_header Cache-Control; proxy_hide_header Set-Cookie;   # the server-level map sets Cache-Control
    proxy_connect_timeout 3s; proxy_send_timeout 3s; proxy_read_timeout 4s;
}
```

No `add_header` in this location: one would drop every inherited header (see the comment above the map).
`vite.config.ts`: a `robloxPresenceDev()` plugin (`configureServer` + `configurePreviewServer`) answers
`GET /api/roblox-presence` with a server-side `fetch` POST using `site.roblox.userId`, a 45 s in-memory cache and
`Cache-Control: no-store`. Also port the sandbox's `glslMinify()` plugin (the player imports `*.glsl?raw`).

## 6. Config (`src/config/site.ts`)

```ts
roblox: {
  username: 'MrHarold0011', userId: 1113999731,
  profileUrl: 'https://www.roblox.com/users/1113999731/profile',
  presence: 'status',              // 'game' | 'status' | 'off' — TODO(me): owner hasn't chosen; 'status' never names the game
  presenceEndpoint: '/api/roblox-presence',
  assetsBase: '/roblox/',
  card: { kicker: 'Player 1', neutralBadge: 'Main · Roblox', sayHi: 'Say hi', viewProfile: 'View on Roblox', viewGame: 'View game',
          posterAlt: "MrHarold's Roblox avatar: curved black horns, messy black hair, skull-teeth mask, black skull-print sweater, one white and one black wing with violet lightning" },
  copy: { line: 'Same me. More horns.', sub: 'Drag me around — I wave back.', builtFor: 'Prospecting! → Prospecting Atlas' }, // EDITABLE
},
sections.player = { id: 'player', index: '02', title: 'In game' }   // work → '03', contact → '04'
contact.roblox = { label: 'Roblox', handle: 'MrHarold0011', href: <roblox.profileUrl> }   // built from the block above
contact.discord.altHandle = 'mrharold01'   // a second Discord account, NOT Roblox
```

## 7. Contact

- **Roblox tile** in `ChannelList` (order GitHub, Email, Roblox; `md:col-span-2`, so the 2-col md grid is not
  ragged). It shows IconRoblox, the label `Roblox`, handle `MrHarold0011`, and on the right the shared presence dot +
  word (same states as §2, neutral = nothing). It links to the profile.
- **Discord card**: change the alt line from "also mrharold01" to a labelled row, `Second account` (mono xs ink-400)
  + `mrharold01` (mono sm ink-300, `select-all`) + a 48 px ghost icon `CopyButton` (aria-label "Copy second Discord
  handle mrharold01"). The label tells visitors this is Discord, so no one confuses it with the similar Roblox name.
