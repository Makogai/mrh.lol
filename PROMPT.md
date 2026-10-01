# Build `mrh.lol` — the MrHarold hub

You are building a personal landing site at the apex domain **mrh.lol**. It is three things
and nothing else: **who I am**, **what I've built**, **how to reach me**.

It has to look extraordinary. Not "clean modern portfolio" — the bar is that someone lands
on it, stops, and scrolls back up to watch the hero again. Gaming and programming are the
two poles of the identity; the site should feel like both at once without resorting to
"hacker green on black" clichés.

Read this whole file before writing anything.

---

## 0. Fill this in first

I have deliberately not invented any of this. **Ask me for anything still blank before you
start building** — do not guess, do not use placeholder lorem names, and do not put a
real-looking email on a public page unless I gave it to you here.

```
Display name:        MrHarold
Real name:           (ask — or leave it off entirely if I say so)
One-line identity:   (ask — e.g. "I build tools for games nobody else bothers to build")
Longer bio:          (ask — 2–4 sentences, first person)
Location / timezone: (ask — optional)

GitHub:              https://github.com/Makogai
Discord:             (ask — handle, and/or a server invite)
X / Twitter:         (ask)
YouTube / Twitch:    (ask)
Email for contact:   (ask — I may want a form or an alias instead of a raw address)
Anything else:       (ask)

Other tools/projects to feature beyond Prospecting Atlas: (ask)
```

If I'm not around, build everything else and leave those slots clearly marked `TODO(me)`
in one single config file — never scattered through components.

---

## 1. The one thing that makes people stare

Pick **one** signature idea and execute it to a ridiculous standard. Five competing effects
read as noise; one perfect one reads as craft.

**My suggested direction — a living vein network.** A dark field of thin branching lines,
somewhere between an ore vein and a PCB trace, that grows and pulses slowly. The cursor
drags light along the nearest traces; a click sends a bright pulse racing outward through
the network. It's the exact intersection of mining and programming, and it is *mine* rather
than a generic particle field you've seen on fifty sites.

Make it in **2D canvas**, not WebGL, unless you have a concrete reason — it's cheaper, it
degrades gracefully, and it will hold 60fps on a laptop GPU while a shader field won't.

You may propose something better. If you do, tell me the idea in one sentence and why it
beats this before you build it. What I will reject: generic floating particles, a starfield,
a matrix rain, a blob gradient, anything that looks like a template.

**Non-negotiables for whatever you pick:**
- 60fps on a mid-range laptop. Profile it. If it drops frames, make it simpler, not prettier.
- Pauses completely when the tab is hidden (`visibilitychange`) and when scrolled past.
- Honours `prefers-reduced-motion`: renders one beautiful static frame instead.
- Never blocks first paint. Content and type land first; the effect fades in behind.
- Degrades to a static gradient if canvas fails.

---

## 2. Stack

- **Vite + React + TypeScript + Tailwind v4.** Same family as my other site, so I can
  maintain both without context-switching.
- **No UI kit.** No shadcn, no Material, no Bootstrap. Every component is yours. A component
  library is how sites end up looking like every other site.
- **Animation**: CSS first. Reach for a library only where CSS genuinely can't do it, and if
  you do, say which and why.
- **Fonts**: self-host, `font-display: swap`, subset to Latin. Google Fonts' CDN is a
  render-blocking third party for one stylesheet.
- No analytics, no trackers, no cookie banner. If I want analytics later I'll add something
  self-hosted.

---

## 3. Visual language

My other site, **prospecting.mrh.lol**, already has a palette. This is a sibling, not a
clone: share the DNA, don't copy the skin. That site is a dark cavern; this one should feel
like the forge.

```
Base      #06080e → #161b28   near-black, cool, slightly blue
Signature #ffc247             lantern amber — the primary accent
Secondary #3ee0d0             mineral teal — for contrast and highlights
Support   #a78bfa  #60a5fa    violet and blue, sparingly
Text      #eef2fb → #5a6379   four steps of ink
```

- **Dark only.** A light mode on a site like this is a compromise nobody asked for.
- **Type carries the page.** Huge, tight, confident display type. One sans for everything,
  one mono for anything numeric or code-flavoured. Hero name should be *enormous* — think
  `clamp(3rem, 12vw, 11rem)`, tracking tightened, hard-stopped at the viewport edge.
- **Depth through light, not borders.** Blooms, inner glow, 1px hairlines at low opacity.
  Avoid heavy card borders and drop shadows — they read as 2016.
- **Grain.** A very subtle noise overlay over the whole page kills banding in the dark
  gradients and adds texture. ~2-3% opacity, tiled PNG or SVG filter.
- Everything on an 8px rhythm. Generous whitespace — crowding is what makes a site feel cheap.

---

## 4. Structure

One page, scroll-driven. No routing unless a section genuinely outgrows it.

**1 — Hero.** Full viewport. The signature effect. Name, the one-line identity, two actions
(`See what I've built`, `Get in touch`). A quiet scroll hint. Nothing else — resist the urge
to put a nav bar full of links here.

**2 — Who I am.** Short. First person. 2–4 sentences from the fill-in block, set large. A
portrait or an avatar if I give you one; a strong typographic composition if I don't. Do not
pad this with a skills cloud or a progress-bar "React 90%" chart — those are instant
credibility killers.

**3 — What I've built.** The heart of the page, and the reason anyone stays.

**Prospecting Atlas** (https://prospecting.mrh.lol) is the flagship. It's a fan database and
toolset for the Roblox game *Prospecting!* — scraped from the official wiki, rebuilt around
the questions players actually ask. Real numbers you can quote on the card:

```
113 minerals, every drop rate      33 dig sites with full loot tables
107 quests · 120 NPCs              67 craftables
A museum planner over 18 displays  A luck model that re-prices every drop rate
194 pages, all prerendered         A Discord bot with 11 slash commands
```

Give it a large feature treatment — a live screenshot or an embedded preview, the numbers as
a stat strip, and a clear link. Then room for further tools in a grid as I add them.

If you can do it cheaply, pull a couple of those numbers **live** from
`https://prospecting.mrh.lol` at build time rather than hard-coding them, so the card can't
go stale. If that needs a fetch at runtime, don't — hard-code with a comment saying where
they came from.

**4 — Contact.** Make this genuinely easy. Big, tappable targets for each channel I gave
you. One primary route (probably Discord or email) and the rest secondary. If I asked for a
form, it needs a real backend — ask me where it should send to rather than wiring up a
service I haven't agreed to.

**5 — Footer.** Minimal. Name, year, a link to the source if I want one public.

---

## 5. Motion

Motion is what separates this from a nice-looking static page. It is also the fastest way to
make a site feel cheap. Rules:

- **Everything responds.** Buttons, cards and links acknowledge hover and press within 100ms.
- **Entrances are earned, not automatic.** Reveal on scroll with `IntersectionObserver`,
  once, with a small stagger. Never re-animate on scroll back up — that's nausea, not polish.
- **One spring, one ease.** Define two curves as tokens and use them everywhere. Mixed easing
  across a page is the single most common reason motion feels amateur.
- **Fast.** 150–250ms for interface feedback, 400–600ms for entrances. Anything slower is the
  site wasting my visitor's time.
- **Magnetic cursor effects** on the two primary buttons only, if at all. Not on everything.
- `prefers-reduced-motion: reduce` must leave a site that is still beautiful and fully
  usable — not a broken one. Keep opacity fades, drop transforms and the canvas animation.

---

## 6. Hard requirements

**Performance budget** — measure, don't assume:
- Lighthouse ≥ 95 performance on mobile, 100 on accessibility and best practices.
- LCP < 1.5s on a simulated 4G connection.
- Total JS under 150KB gzipped. The canvas effect is not an excuse.
- No layout shift. Reserve space for every image and the hero type.
- Images: AVIF/WebP with fallbacks, explicit `width`/`height`, lazy below the fold.

**Responsive** — this is not optional and it is where "amazing" sites usually fall apart:
- Design at 390px first, then 768, then 1440, then 2560. The hero must be as striking on a
  phone as on a monitor. If the signature effect can't be, give phones a simpler variant
  that still looks deliberate.
- Test at 390px and confirm there is **no horizontal scroll** — including mid-animation.
  (Use `overflow-x: clip` on `html`, never `hidden`, which silently breaks `position: sticky`.)
- Tap targets ≥ 44px. Hover-only interactions must have a touch equivalent.

**Accessibility:**
- Semantic HTML. One `h1`. Real `<button>` and `<a>`, never a div with an onClick.
- Visible focus rings everywhere — style them, don't remove them.
- Text contrast ≥ 4.5:1 against its actual background, checked over the gradients and the
  grain, not against a flat swatch.
- The canvas is decorative: `aria-hidden`, and nothing in it may be the only way to get
  information.
- Keyboard-navigable start to finish.

**SEO and sharing:**
- Real `<title>` and meta description, canonical URL, `lang="en"`.
- Open Graph and Twitter card tags with a **custom OG image** — design one, 1200×630, that
  looks as good as the site. This is the thumbnail every shared link shows.
- JSON-LD `Person` schema linking the social profiles I gave you.
- `sitemap.xml` and `robots.txt`.
- A favicon set: SVG, 180px apple-touch, 512px, and a web manifest.

---

## 7. Traps I have already hit on the sibling site

These cost me real time. Don't repeat them:

1. **A CSS animation that touches `transform` leaves a transform on the element afterwards
   with `fill-mode: both`** — and a transformed ancestor becomes the containing block for
   `position: fixed` children. Any fixed overlay inside an animated wrapper will position
   against the wrapper, not the viewport. Render overlays through a portal to `document.body`.
2. **An effect that slides past its parent's bounds widens the document** and throws up a
   horizontal scrollbar for as long as it runs. Animate `background-position` inside a pinned
   box rather than transforming the box itself.
3. **`overflow-x: hidden` on `html` makes it a scroll container and breaks every
   `position: sticky` on the page.** Use `clip`.
4. **`IntersectionObserver` callbacks are suspended while a tab is hidden.** If something
   must still be correct when the user comes back, use a scroll listener or re-check on
   `visibilitychange`.
5. **Scroll-into-view races the router's scroll-to-top.** If you add deep links, make the
   reset stand aside when the URL points at something.
6. If you prerender: **React does not patch a className-only mismatch during hydration.**
   Anything that differs between server and client markup must be applied from an effect,
   not rendered into a class.

---

## 8. Deploy

Target is **Coolify**, same as prospecting.mrh.lol:
- A `Dockerfile` that builds with Node 22 and serves the result from nginx.
- An `nginx.conf` with gzip, long cache headers on fingerprinted assets, `no-cache` on HTML,
  a real 404, and `GET /healthz → 200`.
- Container listens on **80**.
- Write a short `DEPLOY.md`: the Coolify settings that matter and how to verify a deploy.

---

## 9. How to work

- **Ask me the questions in §0 first.** A bio you invented is worse than no bio.
- **Show me the hero before building the rest.** Get the signature effect and the type
  landing right, let me look at it, then continue. Don't build five sections against a
  direction I haven't seen.
- Run it in a browser and actually look at it. Screenshot it at 390px and at 1440px. If you
  cannot see it, say so rather than telling me it looks great.
- Commit in meaningful chunks with real messages.
- Comment the non-obvious: why a value is what it is, not what the line does.

**Definition of done:**
- [ ] Every §0 blank filled with something I actually gave you
- [ ] Hero holds 60fps; pauses hidden; reduced-motion renders a static frame
- [ ] No horizontal scroll at 390px, including mid-animation
- [ ] Lighthouse ≥ 95 / 100 / 100 on mobile
- [ ] Keyboard-navigable with visible focus throughout
- [ ] Custom OG image, favicon set, sitemap, robots, JSON-LD
- [ ] `docker build` runs and the container serves on 80 with `/healthz` answering
- [ ] You have looked at it on a phone-width viewport and a desktop one, and said so

---

Make something I want to show people.
