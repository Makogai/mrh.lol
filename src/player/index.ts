// mrh-player: the 3D avatar card. Public entry, lazily imported by the host. See src/player/README.md.
import type { AvatarManifest } from './manifest';
import { load, type TexSource } from './load';
import { createRenderer, type GL, type Renderer } from './gl';
import { perr } from './err';
import { D2R, clamp, ease, makeSprings } from './motion';
import { euler, local, mul } from './rig';
import { makeCam, frame as frameCam, groundAngle } from './camera';
import { attachInput } from './input';

export interface PlayerOptions {
  baseUrl: string;                 // ends with '/', e.g. `${import.meta.env.BASE_URL}roblox/`
  reducedMotion: boolean;          // host passes matchMedia('(prefers-reduced-motion: reduce)').matches; remount to change
  onReady?(): void;                // once: resources uploaded and the first frame drawn without error
  onError?(e: unknown): void;      // once: Error with name 'PlayerError' and a code; host shows the 2D fallback
  onStats?(s: PlayerStats): void;  // optional, ~1 Hz, for debug overlays and tests
}
export interface PlayerHandle { destroy(): void; wave(): void; setActive(active: boolean): void }
export interface PlayerStats {
  fps: number; cpuMs: number; cpuMsMax: number; dpr: number; width: number; height: number;
  draws: number; triangles: number; gl: 1 | 2; running: boolean;
  frames: number;                  // total frames drawn since mount (additive: lets tests prove "no frames")
}
export type PlayerErrorCode = 'webgl-unavailable' | 'shader' | 'network' | 'format' | 'decode' | 'context-lost' | 'perf';

const TAU = Math.PI * 2;
// spring slots
const TY = 0, HY = 1, HP = 2, HR = 3, AR = 4, DR = 5, CI = 6;
// Entrance timeline, seconds since the card was armed. The scan gets its own readable stretch (smoothstep, ~9 studs/s
// through the body) instead of the expo-out EASE, whose front climbed feet-to-head in 0.2 s and then crawled in empty air.
const ENT_END = 1.6, PEDESTAL_FADE = 0.6, SCAN_T0 = 0.35, SCAN_DUR = 1.25, PULSE_DUR = 1.1;
type Loaded = Awaited<ReturnType<typeof load>>;

export function mountPlayer(canvas: HTMLCanvasElement, opts: PlayerOptions): PlayerHandle {
  const rm = !!opts.reducedMotion;
  const ac = new AbortController();
  const sp = makeSprings(7);
  const cam = makeCam();
  const L = new Float32Array(16);                       // scratch for one local bone matrix
  const st: PlayerStats = { fps: 0, cpuMs: 0, cpuMsMax: 0, dpr: 1, width: 0, height: 0, draws: 0, triangles: 0, gl: 1, running: false, frames: 0 };

  let dead = false, ready = false, lost = false, active = true, inView = false, armed = false;
  let vis = document.visibilityState === 'visible';
  const pivots = new Float32Array(24);
  let man: AvatarManifest, R: Renderer, srcs: Map<string, TexSource> | undefined, par: number[] = [];
  let pending: Loaded | undefined;                       // assets that arrived while the context was lost
  let inp: ReturnType<typeof attachInput> | undefined;
  let raf = 0, last = -1, statTimer = 0, lostTimer = 0, rmTimer = 0;

  // size / resolution
  let cssW = 0, cssH = 0, rdpr = devicePixelRatio || 1, dyn = 1, ema = 16.7, slow = 0;

  // animation state; t only advances while running, so pausing never causes a time jump
  let t = 0, td = 0, ent = -1, waveT = -1, waveQ = false, pt = -1, boost = 0, phW = 0, a0 = 0, rmWave = false;
  let scan = -0.5, gI = 0, pulseR = 0, pulseI = 0;
  // stats window
  let fN = 0, cSum = 0, cMax = 0, tStat = 0;


  // ---- context ---------------------------------------------------------------------------------------------
  const A: WebGLContextAttributes = {
    alpha: true, premultipliedAlpha: true, antialias: true, depth: true, stencil: false,
    preserveDrawingBuffer: false, powerPreference: 'low-power',
    // Software GL would burn the battery on 23k skinned triangles: those machines get the 2D fallback.
    failIfMajorPerformanceCaveat: true,
  };
  const gl2 = canvas.getContext('webgl2', A);
  const gl: GL | null = gl2 || canvas.getContext('webgl', A);
  st.gl = gl2 ? 2 : 1;

  function kill(): void {
    if (dead) return;
    dead = true; ready = false;
    ac.abort();
    cancelAnimationFrame(raf); raf = 0;
    clearInterval(statTimer); clearTimeout(lostTimer); clearTimeout(rmTimer);
    io.disconnect(); ro.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    inp?.detach();
    R?.release();
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    srcs?.forEach((b) => (b as ImageBitmap).close?.());
    pending?.tex.forEach((b) => (b as ImageBitmap).close?.());
    canvas.style.cursor = canvas.style.touchAction = '';
  }
  /** onError's contract is a PlayerError: anything else thrown on the way (TypeError from a dead context) is wrapped. */
  function wrap(e: unknown, code: PlayerErrorCode): unknown {
    return e && (e as Error).name === 'PlayerError' ? e : perr(code, String((e && (e as Error).message) || e), e);
  }
  function fail(e: unknown): void {
    if (dead) return;
    kill();
    // Never synchronous: the host may still be wiring things up right after mountPlayer() returns.
    queueMicrotask(() => opts.onError?.(e));
  }

  // ---- run state (SPEC 6.8) ----------------------------------------------------------------------------------
  function sync(): void {
    const go = ready && active && inView && vis && !lost && !rm && !dead;
    if (go && !raf) { last = -1; raf = requestAnimationFrame(tick); }
    else if (!go && raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  const onVis = () => { vis = document.visibilityState === 'visible'; sync(); };
  // The entrance must be seen, so it waits until 60 % of the card is on screen: with a bare threshold 0 it started
  // when only the horn tips peeked in and was over before the feet (where the scan starts) scrolled into view.
  // A card taller than the viewport can never reach 60 %, so covering most of the viewport arms it too.
  const io = new IntersectionObserver((es) => {
    const e = es[es.length - 1];
    inView = e.isIntersecting;
    if (!armed && e.isIntersecting && (e.intersectionRatio >= 0.6 || (!!e.rootBounds && e.intersectionRect.height >= 0.9 * e.rootBounds.height))) armed = true;
    sync();
  }, { threshold: [0, 0.6] });
  const ro = new ResizeObserver((es) => {
    const e = es[es.length - 1];
    cssW = e.contentRect.width; cssH = e.contentRect.height;
    rdpr = devicePixelRatio || 1;
    if (ready && !lost) { resize(); renderNow(); }
  });
  // A DPR change without a CSS-size change (window dragged to another monitor, zoom against a clamp bound) does not
  // fire the ResizeObserver, so the resolution media query is the trigger. It is one-shot because the query embeds the DPR.
  const watchDpr = (): void => matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => {
    rdpr = devicePixelRatio || 1;
    if (ready && !lost) { resize(); renderNow(); }
    watchDpr();
  }, { once: true, signal: ac.signal });
  function onLost(e: Event): void {
    e.preventDefault();                                 // without this the browser never fires 'restored'
    if (dead || lost) return;
    lost = true; sync();
    lostTimer = window.setTimeout(() => fail(perr('context-lost', 'not restored in 3 s')), 3000);
  }
  function onRestored(): void {
    if (dead || !lost) return;
    clearTimeout(lostTimer);
    if (!R) {
      // Lost before boot() ever ran (assets were still downloading, or arrived while lost): nothing to rebuild yet.
      lost = false;
      if (pending) { const p = pending; pending = undefined; try { boot(p); } catch (e) { fail(wrap(e, 'shader')); } }
      return;
    }
    try { R.init(); } catch (e) { fail(wrap(e, 'shader')); return; }    // everything is rebuilt from the retained buffer and bitmaps
    lost = false; resize(); renderNow(); sync();
  }

  if (!gl) {
    fail(perr('webgl-unavailable', 'no WebGL context'));
  } else {
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    document.addEventListener('visibilitychange', onVis);
    io.observe(canvas);
    // Plain content-box + devicePixelRatio: devicePixelContentBoxSize is reported in CSS px under DevTools/CDP DPR
    // emulation (verified in headless Chrome), and the buffer is DPR-capped and rounded here anyway.
    ro.observe(canvas);
    watchDpr();
    load(opts.baseUrl, ac.signal).then(boot).catch((e) => { if (!ac.signal.aborted) fail(wrap(e, 'decode')); });
  }

  // ---- boot ----------------------------------------------------------------------------------------------
  function boot(l: Loaded): void {
    if (dead) { l.tex.forEach((b) => (b as ImageBitmap).close?.()); return; }
    // createShader on a lost context returns null and the TypeError would end the player for good, even if the browser
    // is about to restore the context. Park the assets; onRestored() boots with them.
    if (lost || gl!.isContextLost()) { pending = l; return; }
    man = l.man; srcs = l.tex;
    par = man.bones.map((b) => b.parent);
    man.bones.forEach((b, i) => pivots.set(b.pivot, i * 3));
    R = createRenderer(gl!, man, l.bin, l.tex);
    R.init();
    st.draws = man.draws.length + 1; st.triangles = man.bin.indexCount / 3;
    if (!cssW) { cssW = canvas.clientWidth || 300; cssH = canvas.clientHeight || 375; }
    inp = attachInput(canvas, {
      tap: () => wave(),
      grab: () => { if (inp!.s.mode === 4) inp!.s.yaw = sp.v[DR]; },
      release: springBack,
    }, rm);
    if (rm) {
      // A still frame: looks at you, arms down, wings at rest, pedestal fully lit.
      sp.v[HY] = 10 * D2R; sp.v[HP] = 2 * D2R; sp.v[AR] = 2 * D2R;
      scan = 999; gI = 1;
    }
    resize(); renderNow();
    const ge = gl!.getError();
    if (ge && !gl!.isContextLost()) throw perr('shader', 'GL error 0x' + ge.toString(16));
    ready = true;
    opts.onReady && queueMicrotask(() => !dead && opts.onReady!());
    if (opts.onStats) statTimer = window.setInterval(stats, 1000);
    tStat = performance.now();
    if (rm && waveQ) { waveQ = false; wave(); }
    sync();
  }

  // ---- size ---------------------------------------------------------------------------------------------
  function resize(): void {
    const dprMax = Math.min(rdpr, 2);
    // dynScale only ever steps down, and never below an effective DPR of 1 (or the real DPR if that is lower).
    let d = Math.max(Math.min(rdpr, 1), dprMax * dyn);
    const mp = cssW * cssH * d * d;
    if (mp > 1.35e6) d *= Math.sqrt(1.35e6 / mp);       // fill-rate cap: ~1.35 megapixels
    const w = Math.max(1, Math.round(cssW * d)), h = Math.max(1, Math.round(cssH * d));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    st.dpr = d; st.width = w; st.height = h;
    frameCam(cam, man, cssW / Math.max(cssH, 1), h);
    R.vp.set(cam.vp); R.eye.set(cam.eye); R.view();
  }

  // ---- motion --------------------------------------------------------------------------------------------
  const s = () => inp!.s;
  const rootYaw = (): number => {
    const i = s();
    return (rm ? -16 * D2R : 25 * D2R * Math.sin((TAU * td) / 16)) + (i.mode === 4 ? sp.v[DR] : i.yaw);
  };

  function springBack(v: number): void {
    const i = s();
    if (rm) { i.mode = 0; i.yaw = 0; return; }
    // Wrap to (-pi, pi] first, so after a full spin it returns the short way round.
    let y = i.yaw % TAU;
    if (y > Math.PI) y -= TAU; else if (y <= -Math.PI) y += TAU;
    sp.v[DR] = y; sp.d[DR] = v; sp.t[DR] = 0; i.mode = 4;
  }

  function startWave(): void { waveT = 0; waveQ = false; a0 = sp.v[AR]; pt = 0; }

  function wave(): void {
    if (dead) return;
    if (rm) {
      if (!ready) { waveQ = true; return; }
      if (rmWave) return;
      // reduced motion: a state change, not an animation (one frame now, one frame back to rest)
      rmWave = true; sp.v[AR] = 140 * D2R; sp.v[HR] = 6 * D2R; renderNow();
      rmTimer = window.setTimeout(() => { rmWave = false; sp.v[AR] = 2 * D2R; sp.v[HR] = 0; renderNow(); }, 1600);
    } else if (waveT < 0 || waveT >= 1.22) {
      // before the entrance ends the wave is queued; after it, only a running player can play it
      if (ent < ENT_END) waveQ = true; else if (raf) startWave();
    }
  }

  function update(dt: number, now: number): void {
    const i = s();
    t += dt;
    if (i.mode === 0) td += dt;                           // the turntable pauses while you hold, fling or release it
    // Until the card is armed the entrance clock holds at -1: the buffer stays empty (scan front below the feet, pedestal off).
    if (ent < 0) { if (armed) { ent = 0; pt = 0; } } else if (ent < ENT_END) ent = Math.min(ENT_END, ent + dt);
    const entDone = ent >= ENT_END;
    if (waveQ && entDone) startWave();
    if (pt >= 0 && pt < PULSE_DUR) pt += dt;
    const bth = Math.sin((TAU * t) / 3.6);

    // entrance (SPEC 6.5)
    // The pedestal's 8 % breath fades in over the last 0.6 s, so it does not pop in when the entrance ends.
    gI = ease(ent / PEDESTAL_FADE) * (1 + 0.08 * bth * clamp((ent - (ENT_END - 0.6)) / 0.6, 0, 1));
    const su = clamp((ent - SCAN_T0) / SCAN_DUR, 0, 1);
    scan = entDone ? 999 : -0.15 + (man.bounds.max[1] + 0.6) * su * su * (3 - 2 * su);
    const pe = ease(pt / PULSE_DUR);
    pulseR = 0.25 + 1.15 * pe; pulseI = pt >= 0 && pt < PULSE_DUR ? (1 - pe) * 1.2 : 0;

    // cursor + head tracking (SPEC 6.3), only once the entrance is over
    let tT = 0, hT = 0, pT = 0, ci = 0;
    if (entDone) {
      const has = i.has && !(i.touch && now - i.at > 2500);   // a touch only counts for 2.5 s
      const ry = rootYaw();
      const total = has ? 32 * D2R * i.nx - ry : -0.5 * ry;   // no pointer: keep half-watching you
      tT = clamp(0.3 * total, -12 * D2R, 12 * D2R);
      hT = clamp(total - tT, -35 * D2R, 35 * D2R);
      pT = has ? clamp(-14 * D2R * i.ny, -10 * D2R, 12 * D2R) : 0;
      ci = has && i.over ? 1 : 0;
      if (ci > 0.5 || sp.v[CI] > 0.02) R.gr[3] = groundAngle(cam, i.gx, i.gy, ry);
    }
    sp.t[TY] = tT; sp.t[HY] = hT; sp.t[HP] = pT; sp.t[CI] = ci;
    sp.t[HR] = waveT >= 0 && waveT < 1.4 ? 6 * D2R : 0;
    sp.t[AR] = 2 * D2R + 0.8 * D2R * bth;
    sp.step(dt);

    // wave (SPEC 6.6): scripted until 1.22 s, then the spring carries position and velocity on
    if (waveT >= 0) {
      waveT += dt;
      if (waveT < 0.32) { sp.v[AR] = a0 + (140 * D2R - a0) * ease(waveT / 0.32); sp.d[AR] = 0; }
      else if (waveT < 1.22) {
        const ph = (TAU * (waveT - 0.32)) / 0.3;
        sp.v[AR] = 140 * D2R + 14 * D2R * Math.sin(ph); sp.d[AR] = 14 * D2R * (TAU / 0.3) * Math.cos(ph);
      } else if (waveT - dt < 1.22) {
        // the oscillator ends at phase 0 with peak velocity; hand exactly that to the spring
        sp.v[AR] = 140 * D2R; sp.d[AR] = 14 * D2R * (TAU / 0.3);
      }
      if (waveT >= 1.4) waveT = -1;
    }
    boost = waveT >= 0 && waveT < 1.2 ? 1 : boost * Math.exp(-3 * dt);
    phW += (TAU * dt * (1 + 0.6 * boost)) / 2.6;          // integrated phase: a changing frequency never jumps

    // drag inertia, then the spring-back once it has slowed down
    if (i.mode === 2) {
      i.yaw += i.vel * dt; i.vel *= Math.exp(-4.5 * dt);
      if (Math.abs(i.vel) < 25 * D2R) springBack(i.vel);
    } else if (i.mode === 4 && Math.abs(sp.v[DR]) < 0.002 && Math.abs(sp.d[DR]) < 0.02) {
      i.mode = 0; i.yaw = 0; sp.v[DR] = sp.d[DR] = 0;
    }
  }

  /** Writes bone matrices + shader inputs from the current state. Pure: calling it twice changes nothing. */
  function pose(): void {
    const amp = rm ? 0 : 1;                               // idle oscillators are off in reduced motion
    const bth = amp * Math.sin((TAU * t) / 3.6);
    const roll = amp * D2R * Math.sin((TAU * t) / 7.2);
    const swing = amp * 1.5 * D2R * Math.sin((TAU * t) / 3.6);
    const abdL = 2 * D2R + 0.8 * D2R * bth;
    const wa = amp * 4 * D2R * (1 + 1.5 * boost), lift = wa * Math.sin(phW), fold = 0.75 * wa * Math.sin(phW + 0.6);
    const jq = R.jq;
    euler(jq, 0, 0, rootYaw(), 0);
    euler(jq, 4, -0.5 * D2R * bth, sp.v[TY], roll);
    euler(jq, 8, -(sp.v[HP] + amp * 0.6 * D2R * Math.sin((TAU * t) / 3.6 - 0.8)), sp.v[HY], sp.v[HR] - 0.6 * roll);
    euler(jq, 12, -swing, 0, -sp.v[AR]);                  // armR abducts about -z
    euler(jq, 16, swing, 0, abdL);                        // armL swings in antiphase
    euler(jq, 20, 0, -fold, -lift);
    euler(jq, 24, 0, fold, lift);
    euler(jq, 28, -amp * 2 * D2R * Math.sin((TAU * t) / 3.1), amp * (7 * D2R * Math.sin((TAU * t) / 4.2) + 2.5 * D2R * Math.sin((TAU * t) / 1.7 + 1)), 0);
    // Levitation: the whole avatar floats above the pedestal (a readable idle cue; the 0.035-stud breath alone is ~2 px).
    // The root pivot is the origin, so this is a pure translation; the vertex shader keeps the pedestal on the ground.
    const lev = rm ? 0.10 : 0.10 + 0.05 * Math.sin((TAU * t) / 4.8);
    for (let b = 0; b < 8; b++) {
      local(L, jq, b * 4, pivots, b * 3, 0, (b === 0 ? lev : 0) + (b === 1 ? 0.035 * bth : 0), 0);
      if (par[b] < 0) for (let k = 0; k < 16; k++) R.bones[b * 16 + k] = L[k];
      else mul(R.bones, b * 16, R.bones, par[b] * 16, L, 0);
    }
    const f = R.fx;
    f[0] = amp * t; f[1] = scan; f[2] = gI; f[3] = cam.px;
    R.gr[1] = pulseR; R.gr[2] = pulseI;
    R.ci = sp.v[CI];
  }
  function renderNow(): void {
    if (dead || lost) return;
    pose();
    R.draw(gl!.drawingBufferWidth, gl!.drawingBufferHeight);
    st.frames++;
  }

  // ---- frame loop ----------------------------------------------------------------------------------------
  function tick(now: number): void {
    raf = requestAnimationFrame(tick);
    const c0 = performance.now();
    const raw = last < 0 ? 0 : now - last;
    last = now;
    update(Math.min(raw, 50) / 1000, c0);
    renderNow();
    const c = performance.now() - c0;
    fN++; cSum += c; if (c > cMax) cMax = c;
    if (raw > 0) {
      // Dynamic resolution: a sustained slow rAF interval steps the buffer down by 0.25 DPR. Never back up.
      ema += 0.1 * (raw - ema);
      slow = ema > 24 ? slow + 1 : 0;
      if (slow >= 90) {
        slow = 0; ema = 16.7;
        if (Math.min(rdpr, 2) * dyn - 0.25 >= 1) { dyn -= 0.25 / Math.min(rdpr, 2); resize(); renderNow(); }   // resizing clears the buffer: redraw in the same task
      }
    }
  }

  function stats(): void {
    const now = performance.now(), dt = (now - tStat) / 1000;
    st.fps = raf && dt > 0 ? fN / dt : 0;
    st.cpuMs = fN ? cSum / fN : 0; st.cpuMsMax = cMax; st.running = !!raf;
    fN = 0; cSum = 0; cMax = 0; tStat = now;
    opts.onStats!(st);
  }

  return {
    destroy: kill,
    wave,
    setActive(a: boolean) { if (!dead) { active = !!a; sync(); } },
  };
}
