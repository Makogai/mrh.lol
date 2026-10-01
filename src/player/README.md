# Player: integration notes (SPEC section numbers in comments refer to docs/PLAYER_SPEC.md)

Framework-free TypeScript, raw WebGL, zero runtime dependencies. One lazy chunk of about 10 KB gzip. It owns one
`<canvas>` and nothing else: no DOM is created, no global state is kept.

```ts
import type { PlayerHandle } from './player';            // types only: costs nothing in the main bundle
const { mountPlayer } = await import('./player');        // the 3D code lives in its own chunk
const handle = mountPlayer(canvas, { baseUrl, reducedMotion, onReady, onError, onStats? });
handle.wave(); handle.setActive(false); handle.destroy();
```

- `baseUrl` ends with `/` and points at the folder with `avatar.json`, e.g. `` `${import.meta.env.BASE_URL}roblox/` ``.
- `onReady` / `onError` fire once, never synchronously inside `mountPlayer`. After `onError` the module has already
  released everything (it behaves as if `destroy()` was called). Errors are `Error`s with `name === 'PlayerError'`
  and a `code`: `webgl-unavailable | shader | network | format | decode | context-lost`.
- The canvas is decorative: give it `aria-hidden="true"`. The keyboard path to the wave is your own "Say hi" button.
- `destroy()` is idempotent. It also calls `WEBGL_lose_context.loseContext()`, and **a canvas whose context was
  lost cannot get a new one**. So mount on a fresh `<canvas>` every time (see `key` below). React StrictMode's
  mount, unmount, mount sequence needs exactly this.

## 1. Lazy import + IntersectionObserver

Do not load the chunk or the ~560 KB of assets until the card is near the viewport. The player runs its own
observer too (it pauses when the canvas is offscreen), but that only controls the animation loop.

```ts
const io = new IntersectionObserver(([e]) => {
  if (!e.isIntersecting) return;
  io.disconnect();
  setMount(true);                                         // start the dynamic import + mountPlayer
}, { rootMargin: '600px 0px' });
```

## 2. Wrapper component sketch

```tsx
import { useEffect, useRef, useState } from 'react';

export function PlayerCard() {
  const hostRef = useRef<HTMLDivElement>(null);
  const handle = useRef<PlayerHandle | null>(null);
  const [near, setNear] = useState(false);
  const [state, setState] = useState<'spawning' | 'online' | 'fallback'>('spawning');
  // reducedMotion is read once per mount; changing the OS setting remounts (section 3)
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const skip3d = (navigator as any).connection?.saveData === true;   // section 6

  useEffect(() => {                                       // near-viewport trigger
    const el = hostRef.current!;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setNear(true), io.disconnect()), { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    if (!near || skip3d) { if (skip3d) setState('fallback'); return; }
    const host = hostRef.current!;
    const canvas = document.createElement('canvas');      // fresh canvas per mount: a lost context cannot be reused
    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'player-canvas';                   // position:absolute; inset:0; width/height:100%; opacity:0
    host.prepend(canvas);
    let cancelled = false;
    setState('spawning');
    import('./player').then(({ mountPlayer }) => {
      if (cancelled) return;
      handle.current = mountPlayer(canvas, {
        baseUrl: `${import.meta.env.BASE_URL}roblox/`,
        reducedMotion: reduced,
        onReady: () => { canvas.classList.add('is-ready'); setState('online'); },   // CSS: opacity .5s var(--ease)
        onError: () => setState('fallback'),
      });
    }).catch(() => setState('fallback'));                 // the chunk itself failed to load
    return () => { cancelled = true; handle.current?.destroy(); handle.current = null; canvas.remove(); };
  }, [near, reduced, skip3d]);                            // reduced changes => remount

  return (
    <article ref={hostRef} className={`card ${state === 'fallback' ? 'is-fallback' : ''}`} style={{ aspectRatio: '4 / 5' }}>
      {/* canvas is inserted here by the effect */}
      <Fallback />                                        {/* section 4 */}
      <button type="button" onClick={() => handle.current?.wave()}>Say hi</button>
    </article>
  );
}
```

Notes:

- The entrance (1.6 s) waits until 60 % of the card is on screen, so it is seen even when the card scrolls in from below; the host must not fade the canvas in slowly over it. `wave()` before the entrance has finished is queued and plays right after it. After `destroy()` it is a no-op.
- `setActive(false)` is for host overrides (a modal, a route transition). The player already pauses by itself when
  offscreen or when the tab is hidden, so most hosts never call it. `hostActive` defaults to `true`.
- Hover-wave belongs to the host: only on `(hover: hover) and (pointer: fine)`, at most every 8 s, never while the
  pointer is down. See `src/demo/main.ts`.
- The wrapper must give the canvas a size (`position: absolute; inset: 0`, 100 % width and height) **in CSS**. The
  player reads the CSS box with a `ResizeObserver` and sizes the drawing buffer itself (DPR <= 2, <= 1.35 MP, and it
  steps down by itself when frames are slow). Do not set `canvas.width` or `canvas.height`.

## 3. Reduced motion

`reducedMotion` is a mount-time option. It gives a single, still, lit frame: no rAF loop at all. `wave()` swaps to a
raised-arm pose for 1.6 s and back (two frames, no animation). To follow a live OS change, listen to the media query
and remount, as in the sketch (`reduced` is in the effect's dependency list).

## 4. The `<picture>` fallback

Shown on `onError` (no WebGL, software GL, network or decode failure, lost context) and, with `<noscript>`, without JS.
Use explicit dimensions so there is no layout shift:

```html
<picture class="fallback">
  <source type="image/avif" srcset="/roblox/fallback/avatar-150x220.avif 150w, /roblox/fallback/avatar-300x440.avif 300w" sizes="(max-width: 520px) 70vw, 300px">
  <source type="image/webp" srcset="/roblox/fallback/avatar-150x220.webp 150w, /roblox/fallback/avatar-300x440.webp 300w" sizes="(max-width: 520px) 70vw, 300px">
  <img src="/roblox/fallback/avatar-300x440.png" width="300" height="440" decoding="async" alt="MrHarold's Roblox avatar: ...">
</picture>
```

```css
.fallback { display: none; position: absolute; left: 50%; bottom: 64px; height: 84%; transform: translateX(-50%); }
.card.is-fallback .fallback { display: block; }
.card.is-fallback canvas { display: none; }
.player-canvas { opacity: 0; transition: opacity 500ms var(--ease); }   /* the onReady fade-in */
.player-canvas.is-ready { opacity: 1; }
```

The fallback images are stable file names (`public/roblox/fallback/`) so static HTML can reference them.

## 5. Hosting

| file | headers |
|---|---|
| `roblox/avatar.json` | `Cache-Control: no-cache` (revalidate; it is the only unhashed name) |
| `roblox/avatar.<hash>.bin`, `roblox/tex/*.<hash>.webp` | `Cache-Control: public, max-age=31536000, immutable` |
| `roblox/fallback/*` | long cache is fine (stable names, rarely change), or a day |
| `.bin` | **compress it**: nginx `gzip_types application/octet-stream;`, or brotli. 464 KB raw, 277 KB gzip, 205 KB brotli |
| JS chunks | hashed by the bundler, immutable |

The 3D view downloads about 560 KB raw, about 370 KB gzip. The player fetches `avatar.json` with `cache: 'no-cache'`
and everything else in parallel, then validates the binary header against the manifest (`format` error otherwise).

After a refresh of the avatar (`npm run fetch:avatar && npm run build:avatar`), the new hashed files and the new
`avatar.json` ship together; old visitors keep working because their cached `avatar.json` still names old files that
remain in their HTTP cache, and a revalidated manifest names the new ones.

## 6. Optional: skip the 3D view on Save-Data

```ts
const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
if (saveData) setState('fallback');   // never import the chunk, never fetch the avatar
```

Also reasonable: skip when `navigator.hardwareConcurrency <= 2` and `deviceMemory <= 2`. The player itself already
refuses software GL (`failIfMajorPerformanceCaveat`) and reports `webgl-unavailable`, which lands on the same fallback.

## 7. Debugging

`onStats(s)` fires about once a second with `fps, cpuMs, cpuMsMax, dpr, width, height, draws, triangles, gl, running,
frames`. `cpuMs` is JS time per frame (target <= 1 ms desktop, <= 4 ms at 4x CPU throttle). `running` is false when
the player is paused (offscreen, hidden tab, `setActive(false)`, context lost, reduced motion), and `frames` then
stops moving. The demo's `?debug=1` overlay and `window.__player` are built on this.

## 8. File map

| file | job |
|---|---|
| `index.ts` | public API, lifecycle, run state, motion and pose, frame loop |
| `gl.ts` | the one GL program, buffers, textures, draw passes; `init()` is re-runnable for context restore |
| `shaders/*.glsl` | GLSL ES 1.00, same source for WebGL1 and WebGL2 (minified by a tiny Vite plugin) |
| `load.ts` | manifest + bin + textures, header validation |
| `rig.ts` | quaternion and 4x4 maths on preallocated Float32Arrays |
| `motion.ts` | the spring (closed form) and the ease |
| `input.ts` | cursor tracking, drag, inertia, tap |
| `camera.ts` | yaw-invariant framing, cursor-to-pedestal ray |
| `manifest.ts` | the SPEC 3.2 contract types |
