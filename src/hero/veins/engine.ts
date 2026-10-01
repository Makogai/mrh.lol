// The Forge Board engine (BUILD_PLAN §7.5–7.9). Loaded only via dynamic import from HeroCanvas, so it is its own chunk
// and can never delay first paint. Two canvases: STATIC (the board, drawn only on (re)generation and growth) and
// DYNAMIC (light, pulses, sparks — cleared every frame). The browser composites them; we never re-blit the board.
import { generateNetwork, VEIN_SEED } from './generate';
import { Dijkstra, buildGrid, nearestEdge } from './graph';
import type { EdgeGrid, Hit } from './graph';
import { AMBER_200, AMBER_300, AMBER_400, AMBER_500, BLUE_400, CONTRAIL, FLIGHT, TEAL_300, TEAL_400, TEAL_500, makeSprites, mix, rgba } from './palette';
import type { RGB, Sprites } from './palette';
import { Board } from './render';
import type { Network, Rect } from './types';

export interface Measure {
  width: number;
  height: number;
  chip: Rect;
  avoid: Rect[];
}
export interface EngineOptions {
  hero: HTMLElement;
  host: HTMLElement;
  staticCanvas: HTMLCanvasElement;
  dynamicCanvas: HTMLCanvasElement;
  measure: () => Measure;
  onReady?: () => void;
  onIgnite?: () => void;
  onFail?: () => void;
  debug?: boolean;
}
export interface Engine {
  destroy(): void;
  pulseAt(x: number, y: number): void;
  setReducedMotion(v: boolean): void;
}

interface Pulse {
  on: boolean;
  t: number;
  seq: number;
  speed: number;
  tail: number;
  /** radius at which the wave has fully faded */
  end: number;
  fadeFrom: number;
  i0: number;
  decay: number;
  teal: boolean;
  click: boolean;
  dist: Float32Array;
}

const smooth = (a: number, b: number, x: number) => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};
const css = (c: RGB) => rgba(c, 1);
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const MAX_PIXELS = 4.2e6;

export function createEngine(o: EngineOptions): Engine {
  const { hero, host, staticCanvas: sc, dynamicCanvas: dc } = o;
  const sctx0 = sc.getContext('2d');
  const dctx0 = dc.getContext('2d');
  if (!sctx0 || !dctx0) throw new Error('2d context unavailable');
  const sctx: CanvasRenderingContext2D = sctx0;
  const dctx: CanvasRenderingContext2D = dctx0;
  const mq = matchMedia('(prefers-reduced-motion: reduce)');

  let destroyed = false;
  let failed = false;
  let ready = false;
  let visible = document.visibilityState === 'visible';
  let inView = true;
  let reduced = mq.matches;
  let raf = 0;
  let last = 0;
  let T = 0; // simulation time: advances only while running

  let net!: Network;
  let board!: Board;
  let grid!: EdgeGrid;
  let dij!: Dijkstra;
  let W = 0;
  let H = 0;
  let sx = 1;
  let sy = 1;
  let dpr = 1;
  let phone = false;
  let sprites!: Sprites;
  let bloom = true;
  let useSprites = true;
  let level = 0; // watchdog level 0‥3
  let genMs = 0;
  let staticMs = 0;
  let frames = 0;
  let avgFrameMs = 0;

  // growth state machine
  let phase: 'grow' | 'creep' | 'done' = 'done';
  let phaseT = 0;
  let p88 = 0;
  let ignited = false;
  let lightFade = 0;

  // graph-derived (per network)
  let pulses: Pulse[] = [];
  let seq = 0;
  let eligible!: Uint8Array;
  let ambientSrc: number[] = [];
  let flashNodes: number[] = [];
  let litE!: Uint32Array;
  let litA!: Float32Array;
  let litB!: Float32Array;
  let ldist!: Float32Array;
  let lightE!: Uint32Array;
  let lightLv!: Uint8Array;
  let lightN = 0;
  let lightGain = 0;
  let lqx = 0;
  let lqy = 0;
  let lcx = -1e9;
  let lcy = -1e9;
  let lx = 0;
  let ly = 0;
  let tipX = new Float32Array(1024);
  let tipY = new Float32Array(1024);
  const hit: Hit = { edge: 0, t: 0, x: 0, y: 0, d: 0 };

  // pointer
  let pointerSeen = false;
  let px = 0;
  let py = 0;
  let lastMove = -1e9;
  let lastType = 'mouse';

  let nextAmbient = 0;
  let nextFlight = 0;

  // flight
  const fl = { on: false, n: 0, pts: new Float32Array(0), cum: new Float32Array(0), len: 0, s: 0, landing: false, pin: -1, landT: 0 };
  let fdist!: Float32Array;
  let fpred!: Int32Array;
  let flightStarts: number[] = [];
  let flightEnds: number[] = [];

  // watchdog
  let ema = 16.7;
  let slow = 0;
  let cooldown = 0;

  const timers: number[] = [];
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.splice(timers.indexOf(id), 1);
      fn();
    }, ms);
    timers.push(id);
    return id;
  };

  // ── canvases ────────────────────────────────────────────────────────────────────────────────────────────────────
  function pickDpr(): number {
    let d = Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2);
    if (level >= 1) d = 1;
    return Math.min(d, Math.sqrt(MAX_PIXELS / (W * H)));
  }

  /** Resizing a canvas clears it (and resets its state), so callers redraw the static layer in the same task. */
  function setupCanvases() {
    dpr = pickDpr();
    const cw = Math.round(W * dpr);
    const ch = Math.round(H * dpr);
    for (const c of [sc, dc]) {
      if (c.width !== cw) c.width = cw;
      if (c.height !== ch) c.height = ch;
    }
    sx = cw / W;
    sy = ch / H;
    sctx.setTransform(sx, 0, 0, sy, 0, 0);
    dctx.setTransform(sx, 0, 0, sy, 0, 0);
    sprites = makeSprites(dpr);
  }

  let resMql: MediaQueryList | null = null;
  const onDprChange = () => {
    watchDpr();
    if (!net || failed) return;
    guard(() => {
      setupCanvases();
      redrawStatic();
      if (reduced) drawStaticFrame();
    });
  };
  function watchDpr() {
    resMql?.removeEventListener('change', onDprChange);
    resMql = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    resMql.addEventListener('change', onDprChange, { once: true });
  }

  function redrawStatic() {
    const t = performance.now();
    board.redraw(sctx, bloom);
    staticMs = performance.now() - t;
  }

  // ── pulses ──────────────────────────────────────────────────────────────────────────────────────────────────────
  function launch(slot: number, seeds: ArrayLike<number>, speed: number, tail: number, maxR: number, i0: number, decay: number, teal: boolean, click: boolean, portal: boolean) {
    const p = pulses[slot];
    dij.begin(p.dist, null);
    for (let i = 0; i < seeds.length; i++) dij.seed(p.dist, seeds[i], 0);
    dij.run(p.dist, maxR, null, portal);
    let reach = 0;
    for (let i = 0; i < p.dist.length; i++) {
      const d = p.dist[i];
      if (d !== Infinity && d > reach) reach = d;
    }
    p.on = true;
    p.t = 0;
    p.seq = ++seq;
    p.speed = speed;
    p.tail = tail;
    p.fadeFrom = reach * 0.55;
    p.end = reach + tail * 0.6;
    p.i0 = i0;
    p.decay = decay;
    p.teal = teal;
    p.click = click;
  }

  function nearestEligible(x: number, y: number): number {
    let best = -1;
    let bd = 1e18;
    for (let i = 0; i < net.nodeCount; i++) {
      if (!eligible[i]) continue;
      const dx = net.nx[i] - x;
      const dy = net.ny[i] - y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  function pulseAt(x: number, y: number) {
    if (!ready || failed || reduced || !ignited || !running()) return;
    const n = nearestEligible(x, y);
    if (n < 0) return;
    const cap = level >= 3 ? 2 : 4;
    let slot = -1;
    let oldest = 0;
    for (let i = 0; i < cap; i++) {
      if (!pulses[i].on) {
        slot = i;
        break;
      }
      if (pulses[oldest].seq > pulses[i].seq) oldest = i;
    }
    if (slot < 0) slot = oldest;
    // Intensity exp(−r/900): the wave dims as it travels, but a click still reaches the far corners.
    launch(slot, [n], 950, 160, Infinity, 1, 900, false, true, true);
  }

  function ambient() {
    for (let s = 4; s < 6; s++) {
      if (pulses[s].on) continue;
      if (!ambientSrc.length) return;
      launch(s, [ambientSrc[Math.floor(Math.random() * ambientSrc.length)]], 380, 90, 420, 0.5, 0, true, false, false);
      return;
    }
  }

  function bootPulse() {
    launch(5, net.pins, 700, 150, 900, 0.9, 0, false, false, false);
  }

  const COL = {
    amber: [css(AMBER_200), css(AMBER_300), css(AMBER_500)],
    teal: [css(TEAL_300), css(TEAL_400), css(TEAL_500)],
  };

  /** Three bands — head (12 px), mid, tail — each one path, one stroke. Under 'lighter' they stack into a gradient. */
  function drawPulse(p: Pulse, r: number, I: number) {
    const { ea, eb, elen, nx, ny } = net;
    const d = p.dist;
    const tail = p.tail;
    const E = net.edgeCount;
    let m = 0;
    for (let e = 0; e < E; e++) {
      const fa = r - d[ea[e]];
      const fb = r - d[eb[e]];
      const len = elen[e];
      const okA = fa > 0 && fa - tail < len;
      const okB = fb > 0 && fb - tail < len;
      if (okA || okB) {
        litE[m] = e;
        litA[m] = okA ? fa : -1;
        litB[m] = okB ? fb : -1;
        m++;
      }
    }
    if (!m) return;
    const cols = p.teal ? COL.teal : COL.amber;
    const bands = [
      [12, 1, 2.6, cols[0]],
      [tail * 0.38, 0.55, 2, cols[1]],
      [tail, 0.22, 1.5, cols[2]],
    ] as const;
    dctx.lineCap = 'round';
    for (let b = 2; b >= 0; b--) {
      const [L, a, w, col] = bands[b];
      dctx.beginPath();
      for (let i = 0; i < m; i++) {
        const e = litE[i];
        const len = elen[e];
        const x0 = nx[ea[e]];
        const y0 = ny[ea[e]];
        const kx = (nx[eb[e]] - x0) / len;
        const ky = (ny[eb[e]] - y0) / len;
        if (litA[i] > 0) {
          const s0 = Math.max(0, litA[i] - L);
          const s1 = Math.min(len, litA[i]);
          if (s1 > s0) {
            dctx.moveTo(x0 + kx * s0, y0 + ky * s0);
            dctx.lineTo(x0 + kx * s1, y0 + ky * s1);
          }
        }
        if (litB[i] > 0) {
          const s0 = len - Math.min(len, litB[i]);
          const s1 = len - Math.max(0, litB[i] - L);
          if (s1 > s0) {
            dctx.moveTo(x0 + kx * s0, y0 + ky * s0);
            dctx.lineTo(x0 + kx * s1, y0 + ky * s1);
          }
        }
      }
      dctx.globalAlpha = Math.min(1, a * I);
      dctx.strokeStyle = col;
      dctx.lineWidth = w;
      dctx.stroke();
    }
    if (!useSprites) return;
    // head sprites (capped), white-hot for click waves
    const spr = p.teal ? sprites.teal : sprites.amber;
    const sz = p.teal ? 24 : 32;
    let count = 0;
    dctx.globalAlpha = Math.min(1, I);
    for (let i = 0; i < m && count < 48; i++) {
      const e = litE[i];
      const len = elen[e];
      const x0 = nx[ea[e]];
      const y0 = ny[ea[e]];
      const kx = (nx[eb[e]] - x0) / len;
      const ky = (ny[eb[e]] - y0) / len;
      if (litA[i] > 0 && litA[i] < len) {
        dctx.drawImage(spr, x0 + kx * litA[i] - sz / 2, y0 + ky * litA[i] - sz / 2, sz, sz);
        count++;
      }
      if (litB[i] > 0 && litB[i] < len && count < 48) {
        const s = len - litB[i];
        dctx.drawImage(spr, x0 + kx * s - sz / 2, y0 + ky * s - sz / 2, sz, sz);
        count++;
      }
    }
    if (p.click) {
      // pads and vias flash as the wave passes
      for (let i = 0; i < flashNodes.length; i++) {
        const n = flashNodes[i];
        const df = Math.abs(d[n] - r);
        if (df < 8) {
          dctx.globalAlpha = Math.min(1, I * (1 - df / 8));
          dctx.drawImage(sprites.amber, net.nx[n] - 8, net.ny[n] - 8, 16, 16);
        }
      }
    }
  }

  function pulseIntensity(p: Pulse, r: number): number {
    return p.i0 * (p.decay ? Math.exp(-r / p.decay) : 1) * (1 - smooth(p.fadeFrom, p.end, r));
  }

  // ── lantern ─────────────────────────────────────────────────────────────────────────────────────────────────────
  function computeLight(x: number, y: number, snap: boolean) {
    lightN = 0;
    lcx = x;
    lcy = y;
    if (!nearestEdge(net, grid, x, y, 200, hit)) return;
    const R = (phone ? 180 : 240) * (level >= 3 ? 0.5 : 1);
    lightGain = snap ? 0.85 : 0.85 * (1 - smooth(40, 220, hit.d));
    lqx = hit.x;
    lqy = hit.y;
    const e0 = hit.edge;
    dij.begin(ldist, null);
    dij.seed(ldist, net.ea[e0], hit.t * net.elen[e0]);
    dij.seed(ldist, net.eb[e0], (1 - hit.t) * net.elen[e0]);
    dij.run(ldist, R, null, false);
    for (let e = 0; e < net.edgeCount; e++) {
      const g = e === e0 ? 0 : Math.min(ldist[net.ea[e]], ldist[net.eb[e]]);
      if (g >= R) continue;
      const q = (1 - g / R) * (1 - g / R);
      lightE[lightN] = e;
      lightLv[lightN++] = Math.max(1, Math.ceil(q * 6));
    }
  }

  function drawLight(fade: number) {
    if (!lightN || fade <= 0) return;
    const { ea, eb, nx, ny } = net;
    const g = lightGain * fade;
    for (let lv = 1; lv <= 6; lv++) {
      dctx.beginPath();
      let any = false;
      for (let i = 0; i < lightN; i++) {
        if (lightLv[i] !== lv) continue;
        const e = lightE[i];
        dctx.moveTo(nx[ea[e]], ny[ea[e]]);
        dctx.lineTo(nx[eb[e]], ny[eb[e]]);
        any = true;
      }
      if (!any) continue;
      dctx.lineCap = 'round';
      dctx.globalAlpha = g * (lv / 6) * 0.2;
      dctx.strokeStyle = css(AMBER_400);
      dctx.lineWidth = 5;
      dctx.stroke();
      dctx.globalAlpha = g * (lv / 6);
      dctx.strokeStyle = css(AMBER_300);
      dctx.lineWidth = 1.9;
      dctx.stroke();
    }
    if (useSprites) {
      dctx.globalAlpha = Math.min(1, g * 1.1);
      dctx.drawImage(sprites.hot, lqx - 18, lqy - 18, 36, 36);
    }
  }

  // ── growth ──────────────────────────────────────────────────────────────────────────────────────────────────────
  function drawTips(front: number, creep: boolean) {
    const { order } = board;
    const { ebirth, elen, ea, eb, nx, ny } = net;
    const lim = front + 130;
    let n = 0;
    dctx.beginPath();
    for (let k = board.drawnEdges; k < order.length; k++) {
      const e = order[k];
      if (ebirth[e] > lim) break;
      const start = ebirth[e] - elen[e];
      if (start >= front) continue;
      const f = (front - start) / elen[e];
      const x0 = nx[ea[e]];
      const y0 = ny[ea[e]];
      const x = x0 + (nx[eb[e]] - x0) * f;
      const y = y0 + (ny[eb[e]] - y0) * f;
      dctx.moveTo(x0, y0);
      dctx.lineTo(x, y);
      if (n < tipX.length) {
        tipX[n] = x;
        tipY[n++] = y;
      }
    }
    dctx.lineCap = 'round';
    dctx.globalAlpha = creep ? 0.5 : 0.9;
    dctx.strokeStyle = css(creep ? TEAL_400 : AMBER_300);
    dctx.lineWidth = creep ? 1.4 : 2;
    dctx.stroke();
    if (!useSprites || !n) return;
    const cap = creep ? 12 : 48;
    const stride = Math.max(1, Math.floor(n / cap));
    const spr = creep ? sprites.teal : sprites.amber;
    const sz = creep ? 18 : 28;
    dctx.globalAlpha = creep ? 0.6 : 1;
    for (let i = 0; i < n; i += stride) dctx.drawImage(spr, tipX[i] - sz / 2, tipY[i] - sz / 2, sz, sz);
  }

  function ignite() {
    if (ignited) return;
    ignited = true;
    o.onIgnite?.();
    bootPulse();
    nextAmbient = T + 1.2;
    nextFlight = T + 16 + Math.random() * 12;
  }

  // ── flight (the aviation nod) ───────────────────────────────────────────────────────────────────────────────────
  function launchFlight() {
    for (let attempt = 0; attempt < 4; attempt++) {
      if (!flightStarts.length) return;
      const start = flightStarts[Math.floor(Math.random() * flightStarts.length)];
      const landing = Math.random() < 1 / 3 && net.pins.length > 0;
      dij.begin(fdist, fpred);
      dij.seed(fdist, start, 0);
      dij.run(fdist, Infinity, fpred, false);
      const pool = landing ? Array.from(net.pins) : flightEnds;
      let end = -1;
      for (let i = 0; i < 10 && end < 0; i++) {
        const c = pool[Math.floor(Math.random() * pool.length)];
        if (fdist[c] !== Infinity && fdist[c] >= 0.6 * W) end = c;
      }
      if (end < 0) continue;
      let n = 0;
      for (let v = end; v >= 0; v = fpred[v]) n++;
      if (fl.pts.length < n * 2) {
        fl.pts = new Float32Array(net.nodeCount * 2);
        fl.cum = new Float32Array(net.nodeCount);
      }
      let i = n;
      for (let v = end; v >= 0; v = fpred[v]) {
        i--;
        fl.pts[i * 2] = net.nx[v];
        fl.pts[i * 2 + 1] = net.ny[v];
      }
      fl.cum[0] = 0;
      for (let k = 1; k < n; k++) fl.cum[k] = fl.cum[k - 1] + Math.hypot(fl.pts[k * 2] - fl.pts[k * 2 - 2], fl.pts[k * 2 + 1] - fl.pts[k * 2 - 1]);
      fl.n = n;
      fl.len = fl.cum[n - 1];
      fl.s = 0;
      fl.landing = landing && net.nkind[end] === 3;
      fl.pin = end;
      fl.landT = 0;
      fl.on = true;
      return;
    }
  }

  let tx0 = 0;
  let ty0 = 0;
  /** Point at arc-length s on segment k of the flight polyline → tx0/ty0 (no per-call allocation). */
  function flightAt(k: number, s: number) {
    const f = (s - fl.cum[k]) / Math.max(1e-6, fl.cum[k + 1] - fl.cum[k]);
    tx0 = fl.pts[k * 2] + (fl.pts[k * 2 + 2] - fl.pts[k * 2]) * f;
    ty0 = fl.pts[k * 2 + 1] + (fl.pts[k * 2 + 3] - fl.pts[k * 2 + 1]) * f;
  }

  /** Appends the polyline between arc-lengths s0‥s1 to the current path. */
  function trail(s0: number, s1: number) {
    s0 = Math.max(0, s0);
    s1 = Math.min(fl.len, s1);
    if (s1 <= s0) return;
    const { pts, cum, n } = fl;
    let i = 0;
    while (i < n - 2 && cum[i + 1] <= s0) i++;
    flightAt(i, s0);
    dctx.moveTo(tx0, ty0);
    let k = i + 1;
    for (; k < n && cum[k] < s1; k++) dctx.lineTo(pts[k * 2], pts[k * 2 + 1]);
    flightAt(k - 1, s1);
    dctx.lineTo(tx0, ty0);
  }

  const TRAIL_COLS = Array.from({ length: 6 }, (_, k) => css(mix(CONTRAIL, BLUE_400, k / 5)));
  function drawFlight() {
    const { s } = fl;
    dctx.lineCap = 'round';
    // contrail: 280 px, six bands fading 0.55 → 0
    for (let k = 0; k < 6; k++) {
      dctx.beginPath();
      trail(s - (280 / 6) * (k + 1), s - (280 / 6) * k);
      dctx.globalAlpha = 0.55 * (1 - (k + 0.5) / 6);
      dctx.strokeStyle = TRAIL_COLS[k];
      dctx.lineWidth = 2;
      dctx.stroke();
    }
    // edges the flight passed linger at 0.18 and dissipate over ~2.5 s
    for (let j = 0; j < 6; j++) {
      dctx.beginPath();
      trail(s - 280 - (j + 1) * 150, s - 280 - j * 150);
      dctx.globalAlpha = 0.18 * (1 - (j + 0.5) / 6);
      dctx.strokeStyle = css(BLUE_400);
      dctx.lineWidth = 1.5;
      dctx.stroke();
    }
    if (s <= fl.len) {
      // locate the head
      let i = 0;
      while (i < fl.n - 2 && fl.cum[i + 1] <= s) i++;
      flightAt(i, s);
      const x = tx0;
      const y = ty0;
      dctx.globalAlpha = 1;
      if (useSprites) dctx.drawImage(sprites.blue, x - 12, y - 12, 24, 24);
      dctx.fillStyle = css(FLIGHT);
      dctx.beginPath();
      dctx.arc(x, y, 1.6, 0, Math.PI * 2);
      dctx.fill();
    } else if (fl.landing && fl.landT < 0.6) {
      const t = fl.landT / 0.6;
      const x = fl.pts[(fl.n - 1) * 2];
      const y = fl.pts[(fl.n - 1) * 2 + 1];
      dctx.globalAlpha = (1 - t) * 0.9;
      dctx.strokeStyle = css(AMBER_300);
      dctx.lineWidth = 1;
      dctx.beginPath();
      dctx.arc(x, y, 14 * (1 - (1 - t) * (1 - t)), 0, Math.PI * 2);
      dctx.stroke();
      if (useSprites) {
        dctx.globalAlpha = 1 - t;
        dctx.drawImage(sprites.amber, x - 16, y - 16, 32, 32);
      }
    }
  }

  // ── reduced motion: one beautiful frame ─────────────────────────────────────────────────────────────────────────
  function drawStaticFrame() {
    dctx.clearRect(0, 0, W, H);
    dctx.globalCompositeOperation = 'lighter';
    launch(5, net.pins, 700, 150, Infinity, 1, 0, false, false, false);
    const p = pulses[5];
    p.on = false;
    // frozen boot pulse: the wave caught mid-flight at 0.35 of the growth distance, intensity 0.8
    drawPulse(p, 0.35 * net.maxBirth, 0.8);
    computeLight(0.78 * W, 0.3 * H, true);
    drawLight(1);
    dctx.globalAlpha = 1;
    dctx.globalCompositeOperation = 'source-over';
  }

  // ── network lifecycle ───────────────────────────────────────────────────────────────────────────────────────────
  function generate(m: Measure) {
    W = m.width;
    H = m.height;
    phone = W < 768 || matchMedia('(pointer: coarse)').matches;
    bloom = bloom && !phone; // no bloom pass on phones (§7.8); the watchdog may also have dropped it
    const t = performance.now();
    net = generateNetwork({ width: W, height: H, chip: m.chip, avoid: m.avoid, seed: VEIN_SEED, profile: phone ? 'phone' : 'desktop' });
    genMs = performance.now() - t;
  }

  function prepare(animate: boolean) {
    const V = net.nodeCount;
    const E = net.edgeCount;
    grid = buildGrid(net);
    dij = new Dijkstra(net);
    board = new Board(net);
    pulses = Array.from({ length: 6 }, () => ({ on: false, t: 0, seq: 0, speed: 0, tail: 0, end: 0, fadeFrom: 0, i0: 0, decay: 0, teal: false, click: false, dist: new Float32Array(V) }));
    litE = new Uint32Array(E);
    litA = new Float32Array(E);
    litB = new Float32Array(E);
    ldist = new Float32Array(V);
    lightE = new Uint32Array(E);
    lightLv = new Uint8Array(E);
    fdist = new Float32Array(V);
    fpred = new Int32Array(V);
    fl.on = false;
    lightN = 0;
    lcx = lcy = -1e9;

    // Union-find over edges plus the die (all pins are one component): pulses only start in the big component, so a
    // click can never light an isolated island that looks like a bug.
    const uf = new Int32Array(V);
    for (let i = 0; i < V; i++) uf[i] = i;
    const find = (a: number) => {
      while (uf[a] !== a) a = uf[a] = uf[uf[a]];
      return a;
    };
    for (let e = 0; e < E; e++) uf[find(net.ea[e])] = find(net.eb[e]);
    for (let i = 1; i < net.pins.length; i++) uf[find(net.pins[i])] = find(net.pins[0]);
    const size = new Uint32Array(V);
    for (let i = 0; i < V; i++) size[find(i)]++;
    eligible = new Uint8Array(V);
    ambientSrc = [];
    flashNodes = [];
    flightStarts = [];
    flightEnds = [];
    for (let i = 0; i < V; i++) {
      eligible[i] = size[find(i)] >= V * 0.1 ? 1 : 0;
      const k = net.nkind[i];
      if (k === 1 || k === 2) flashNodes.push(i);
      if (eligible[i] && (k === 1 || k === 3)) ambientSrc.push(i);
      if (net.nx[i] < 0.15 * W || net.ny[i] < 0.12 * H) flightStarts.push(i);
      if (net.nx[i] > 0.8 * W) flightEnds.push(i);
    }
    // p88: the growth front stops at the 88th-percentile birth; the last 12 % creeps in over 40 s.
    p88 = E ? net.ebirth[board.order[Math.min(E - 1, Math.floor(E * 0.88))]] : 0;

    setupCanvases();
    for (const p of pulses) p.on = false;
    dctx.clearRect(0, 0, W, H);
    sctx.clearRect(0, 0, W, H);
    if (animate && !reduced) {
      phase = 'grow';
      phaseT = 0;
      ignited = false;
      lightFade = 0;
      board.reset();
      board.advance(sctx, 0, bloom);
      board.silk(sctx);
    } else {
      phase = 'done';
      board.drawnEdges = E;
      board.drawnNodes = board.norder.length;
      redrawStatic();
      if (!ignited) o.onIgnite?.();
      ignited = true;
      lightFade = 1;
      if (reduced) drawStaticFrame();
      nextAmbient = T + 1;
      nextFlight = T + 16 + Math.random() * 12;
    }
  }

  // ── frame loop ──────────────────────────────────────────────────────────────────────────────────────────────────
  function running() {
    return visible && inView && !reduced && !failed && ready && !destroyed;
  }
  function sync() {
    if (running()) {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    if (o.debug && net) expose(); // __mrhFx.running must flip the moment we pause, not on the next (never-coming) frame
  }

  function target(): [number, number] {
    const rect = hero.getBoundingClientRect();
    const mx = px - rect.left;
    const my = py - rect.top;
    const active = pointerSeen && lastType !== 'touch' && mx >= 0 && mx <= W && my >= 0 && my <= H && performance.now() - lastMove < 4000;
    if (active) return [mx, my];
    // Lissajous wander around (0.5W, 0.35H): coarse pointers always, fine pointers when idle or outside the hero.
    return [0.5 * W + 0.32 * W * Math.sin((T * 2 * Math.PI) / 23), 0.35 * H + 0.18 * H * Math.sin((T * 2 * Math.PI) / 17 + 1.3)];
  }

  function frame(now: number) {
    raf = 0;
    if (!running()) return;
    raf = requestAnimationFrame(frame);
    const t0 = performance.now();
    const rawMs = Math.max(0.1, now - last);
    last = now;
    const dt = Math.min(rawMs / 1000, 1 / 30);
    try {
      T += dt;
      update(dt);
      draw();
    } catch (err) {
      fail(err);
      return;
    }
    frames++;
    avgFrameMs += (performance.now() - t0 - avgFrameMs) * 0.05;
    watchdog(rawMs);
    if (o.debug) expose();
  }

  function update(dt: number) {
    if (phase === 'grow') {
      phaseT += dt;
      const p = Math.min(1, phaseT / (phone ? 1.2 : 1.6));
      board.advance(sctx, p88 * (1 - (1 - p) ** 3), bloom);
      if (p >= 1) {
        phase = 'creep';
        phaseT = 0;
        redrawStatic(); // clean redraw: incremental strokes double-paint the joints, one batched pass does not
        ignite();
      }
    } else if (phase === 'creep') {
      phaseT += dt;
      const p = Math.min(1, phaseT / 40);
      board.advance(sctx, p88 + (net.maxBirth - p88) * p, bloom);
      if (p >= 1) {
        phase = 'done';
        redrawStatic();
      }
    }
    if (ignited) {
      lightFade = Math.min(1, lightFade + dt / 1.2);
      if (T >= nextAmbient) {
        ambient();
        nextAmbient = T + 2.6 + Math.random() * 1.6;
      }
      if (T >= nextFlight) {
        let clicking = false;
        for (let i = 0; i < 4; i++) clicking = clicking || pulses[i].on;
        if (!fl.on && !clicking && level < 3) launchFlight();
        nextFlight = T + 16 + Math.random() * 12;
      }
    }
    for (const p of pulses) {
      if (!p.on) continue;
      p.t += dt;
      if (p.speed * p.t >= p.end) p.on = false;
    }
    if (fl.on) {
      fl.s += 360 * dt;
      if (fl.s > fl.len) fl.landT += dt;
      // the contrail (280 px) and the lingering edges (~900 px of fade) both drain past the end before we stop
      if (fl.s > fl.len + 280 + 900) fl.on = false;
    }
    // the lantern: L chases the pointer with ~100 ms of lag, so the light is dragged along the traces
    const [tx, ty] = target();
    if (lcx < -1e8) {
      lx = tx;
      ly = ty;
    } else {
      const k = 1 - Math.exp(-10 * dt);
      lx += (tx - lx) * k;
      ly += (ty - ly) * k;
    }
    if (ignited && (Math.abs(lx - lcx) > 0.5 || Math.abs(ly - lcy) > 0.5)) computeLight(lx, ly, false);
  }

  function draw() {
    dctx.clearRect(0, 0, W, H);
    dctx.globalCompositeOperation = 'lighter';
    if (phase === 'grow') drawTips(p88 * (1 - (1 - Math.min(1, phaseT / (phone ? 1.2 : 1.6))) ** 3), false);
    else if (phase === 'creep') drawTips(p88 + (net.maxBirth - p88) * Math.min(1, phaseT / 40), true);
    drawLight(lightFade);
    for (const p of pulses) {
      if (!p.on) continue;
      const r = p.speed * p.t;
      drawPulse(p, r, pulseIntensity(p, r));
    }
    if (fl.on) drawFlight();
    dctx.globalAlpha = 1;
    dctx.globalCompositeOperation = 'source-over';
  }

  // Watchdog (§7.9): "simpler, not prettier". EMA of rAF intervals; > 20 ms for 1.5 s steps one level down, never back up.
  function watchdog(rawMs: number) {
    ema += (Math.min(rawMs, 100) - ema) * 0.1;
    cooldown -= rawMs;
    slow = ema > 20 ? slow + rawMs : 0;
    if (slow > 1500 && cooldown <= 0 && level < 3) {
      level++;
      slow = 0;
      cooldown = 2000;
      if (level === 1) {
        setupCanvases();
        redrawStatic();
      } else if (level === 2) {
        bloom = false;
        useSprites = false;
        redrawStatic();
      } else {
        lcx = -1e9;
      }
    }
  }

  function expose() {
    (window as unknown as { __mrhFx: unknown }).__mrhFx = {
      frames,
      running: !!raf,
      quality: level,
      dpr,
      nodes: net?.nodeCount ?? 0,
      edges: net?.edgeCount ?? 0,
      genMs,
      staticMs,
      avgFrameMs,
      reduced,
      // QA-only handles (this object exists only with ?fxdebug): fire a click pulse / a flight on demand
      click: pulseAt,
      flight: launchFlight,
    };
  }

  // ── events / observers ──────────────────────────────────────────────────────────────────────────────────────────
  const onMove = (e: PointerEvent) => {
    lastType = e.pointerType;
    if (e.pointerType === 'touch') return;
    px = e.clientX;
    py = e.clientY;
    pointerSeen = true;
    lastMove = performance.now();
  };
  const onLeave = () => {
    pointerSeen = false;
  };
  const heroPoint = (e: MouseEvent): [number, number] => {
    const r = hero.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  // Never preventDefault: scrolling, text selection and link activation are none of our business.
  const onDown = (e: PointerEvent) => {
    lastType = e.pointerType;
    if (e.pointerType === 'mouse' && e.button === 0) pulseAt(...heroPoint(e));
  };
  const onClick = (e: MouseEvent) => {
    // Taps only: `detail > 0` filters keyboard activation, and a scroll gesture never produces a click.
    if (lastType !== 'mouse' && e.detail > 0) pulseAt(...heroPoint(e));
  };
  const recheck = () => {
    visible = document.visibilityState === 'visible';
    if (visible) {
      // Trap #4: IntersectionObserver callbacks are suspended while the tab is hidden, so ask the layout directly.
      const r = hero.getBoundingClientRect();
      inView = r.bottom > 0 && r.top < window.innerHeight;
    }
    sync();
  };
  const io = new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1].isIntersecting;
    sync();
  });
  io.observe(hero);
  let resizeTimer = 0;
  const ro = new ResizeObserver(() => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(onResize, 160);
  });
  ro.observe(hero);

  function onResize() {
    if (destroyed || failed || !ready) return;
    guard(() => {
      const m = o.measure();
      // Regenerate only when it matters: the hero is min-height 100svh, so a mobile URL bar must not thrash the board.
      if (Math.abs(m.width - W) < 0.5 && Math.abs(m.height - H) <= 120) return;
      generate(m);
      prepare(false);
      sync();
    });
  }

  const onContextLost = (e: Event) => e.preventDefault();
  const onContextRestored = () =>
    guard(() => {
      setupCanvases();
      redrawStatic();
      if (reduced) drawStaticFrame();
    });
  sc.addEventListener('contextlost', onContextLost);
  dc.addEventListener('contextlost', onContextLost);
  sc.addEventListener('contextrestored', onContextRestored);
  dc.addEventListener('contextrestored', onContextRestored);
  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  hero.addEventListener('pointerdown', onDown, { passive: true });
  hero.addEventListener('click', onClick, { passive: true });
  document.addEventListener('visibilitychange', recheck);
  const onMq = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
  mq.addEventListener('change', onMq);
  watchDpr();

  function setReducedMotion(v: boolean) {
    if (v === reduced || !net || failed) {
      reduced = v;
      return;
    }
    guard(() => {
      reduced = v;
      for (const p of pulses) p.on = false;
      fl.on = false;
      if (v) {
        // finish whatever growth was in flight, then hold one frame
        phase = 'done';
        board.drawnEdges = net.edgeCount;
        board.drawnNodes = board.norder.length;
        redrawStatic();
        drawStaticFrame();
      } else {
        dctx.clearRect(0, 0, W, H);
        lcx = -1e9;
        nextAmbient = T + 1;
        nextFlight = T + 16 + Math.random() * 12;
      }
      sync();
    });
  }

  function guard(fn: () => void) {
    try {
      fn();
    } catch (err) {
      fail(err);
    }
  }

  function fail(err: unknown) {
    if (failed) return;
    failed = true;
    console.warn('[hero] fx off:', err);
    host.removeAttribute('data-ready');
    hero.dataset.fx = 'off';
    destroy();
    o.onFail?.();
  }

  function destroy() {
    destroyed = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    for (const t of timers) window.clearTimeout(t);
    window.clearTimeout(resizeTimer);
    io.disconnect();
    ro.disconnect();
    resMql?.removeEventListener('change', onDprChange);
    mq.removeEventListener('change', onMq);
    sc.removeEventListener('contextlost', onContextLost);
    dc.removeEventListener('contextlost', onContextLost);
    sc.removeEventListener('contextrestored', onContextRestored);
    dc.removeEventListener('contextrestored', onContextRestored);
    window.removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    hero.removeEventListener('pointerdown', onDown);
    hero.removeEventListener('click', onClick);
    document.removeEventListener('visibilitychange', recheck);
  }

  // ── boot: fonts → measure → [task 1] generate → rAF → [task 2] first static draw → fade in → loop ───────────────
  (async () => {
    try {
      await Promise.race([document.fonts.ready, new Promise((r) => later(() => r(null), 1200))]);
      if (destroyed) return;
      const fontsDone = document.fonts.status === 'loaded';
      const m = o.measure();
      generate(m); // task 1
      await nextFrame();
      if (destroyed) return;
      prepare(true); // task 2
      ready = true;
      host.dataset.ready = '';
      o.onReady?.();
      recheck();
      if (o.debug) expose();
      if (!fontsDone) {
        // The chip was measured with fallback metrics. If the real font moved it noticeably, quietly rebuild.
        document.fonts.ready.then(() => {
          if (destroyed || failed) return;
          const m2 = o.measure();
          const a = net.chip;
          const b = m2.chip;
          if (Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h)) <= 12) return;
          host.removeAttribute('data-ready');
          later(() => guard(() => {
            generate(m2);
            prepare(false);
            host.dataset.ready = '';
            sync();
          }), 220);
        });
      }
    } catch (err) {
      fail(err);
    }
  })();

  return { destroy, pulseAt, setReducedMotion };
}
