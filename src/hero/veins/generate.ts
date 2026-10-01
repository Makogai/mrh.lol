// The Forge Board generator (BUILD_PLAN §7.2). Pure, seeded, deterministic — the hero, the OG image (scripts/gen-assets.mjs
// imports this file straight into Node) and QA all see the same network for the same inputs.
// So: `import type` only (Node cannot resolve extensionless runtime imports), erasable TS only, no DOM, no Math.random.
import type { GenerateOptions, Network, NetworkProfile } from './types';

/** "MrHa" as a uint32 — the one fixed seed. */
export const VEIN_SEED = 0x4d724861;

export const NodeKind = { Bend: 0, Pad: 1, Via: 2, Pin: 3, Nodule: 4, Junction: 5 } as const;
const { Bend, Pad, Via, Pin, Nodule, Junction } = NodeKind;

interface Profile {
  pitch: number;
  /** Target node count as a function of field area. */
  nodes: (w: number, h: number) => number;
  roots: number;
  /** Distance from the chip at which copper has fully cooled into ore. */
  far: number;
  maxHeads: number;
}
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const PROFILES: Record<NetworkProfile, Profile> = {
  desktop: { pitch: 12, nodes: (w, h) => clamp(Math.round((w * h) / 760), 900, 3600), roots: 10, far: 460, maxHeads: 400 },
  phone: { pitch: 10, nodes: (w, h) => clamp(Math.round((w * h) / 640), 380, 640), roots: 5, far: 260, maxHeads: 160 },
  og: { pitch: 12, nodes: () => 1100, roots: 8, far: 380, maxHeads: 300 },
};

// Direction i points at i × 45° (canvas coordinates, y down): 0 = right, 2 = down, 4 = left, 6 = up.
// Exact tables rather than Math.cos/sin so PCB geometry never picks up 1e-16 wobble.
const R2 = Math.SQRT1_2;
const COS8 = [1, R2, 0, -R2, -1, -R2, 0, R2];
const SIN8 = [0, R2, 1, R2, 0, -R2, -1, -R2];
const TAN_22_5 = Math.tan(Math.PI / 8);

const CELL = 16; // generation grid: cells are 16 px over [−80, W+80] × [−80, H+80]
const MARGIN = 80;
const CHIP_CLEAR = 3; // the chip rect already carries the 24 px text padding; this only keeps traces off the silkscreen
const AVOID_PAD = 14;
const BOUND = 60;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function ptSegD2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  const x = ax + t * dx - px;
  const y = ay + t * dy - py;
  return x * x + y * y;
}

/** Squared minimum distance between segments AB and CD (0 when they cross). */
function segD2(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  const d1x = bx - ax;
  const d1y = by - ay;
  const d2x = dx - cx;
  const d2y = dy - cy;
  const den = d1x * d2y - d1y * d2x;
  if (den !== 0) {
    const t = ((cx - ax) * d2y - (cy - ay) * d2x) / den;
    const u = ((cx - ax) * d1y - (cy - ay) * d1x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(ptSegD2(ax, ay, cx, cy, dx, dy), ptSegD2(bx, by, cx, cy, dx, dy), ptSegD2(cx, cy, ax, ay, bx, by), ptSegD2(dx, dy, ax, ay, bx, by));
}

/** Liang–Barsky: does segment AB touch the rectangle? */
function segHitsRect(ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    const p = i === 0 ? -dx : i === 1 ? dx : i === 2 ? -dy : dy;
    const q = i === 0 ? ax - x0 : i === 1 ? x1 - ax : i === 2 ? ay - y0 : y1 - ay;
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

interface Head {
  node: number;
  x: number;
  y: number;
  pcb: boolean;
  dir: number; // PCB heading, 0..7
  ang: number; // vein heading, radians
  energy: number;
  width: number;
  steps: number;
}

export function generateNetwork(opts: GenerateOptions): Network {
  const W = opts.width;
  const H = opts.height;
  const chip = opts.chip;
  const P = PROFILES[opts.profile];
  const rnd = mulberry32(opts.seed);
  const randint = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const phase = (opts.seed & 1023) / 163;
  const target = P.nodes(W, H);
  const PITCH = P.pitch;
  const FAR = P.far;

  // ── keep-outs: [x0, y0, x1, y1] per rect, chip first ────────────────────────────────────────────────────────────
  const rects: number[] = [chip.x - CHIP_CLEAR, chip.y - CHIP_CLEAR, chip.x + chip.w + CHIP_CLEAR, chip.y + chip.h + CHIP_CLEAR];
  for (const a of opts.avoid ?? []) rects.push(a.x - AVOID_PAD, a.y - AVOID_PAD, a.x + a.w + AVOID_PAD, a.y + a.h + AVOID_PAD);
  // Pins sit 2 px outside the chip, i.e. inside CHIP_CLEAR. That is fine: pins and their two bus legs are placed directly
  // (never tested against these rects); only free heads are.
  const nRects = rects.length >> 2;
  const blockedPt = (x: number, y: number) => {
    for (let i = 0; i < nRects; i++) {
      const o = i << 2;
      if (x > rects[o] && x < rects[o + 2] && y > rects[o + 1] && y < rects[o + 3]) return true;
    }
    return false;
  };
  const blockedSeg = (ax: number, ay: number, bx: number, by: number) => {
    for (let i = 0; i < nRects; i++) {
      const o = i << 2;
      if (segHitsRect(ax, ay, bx, by, rects[o], rects[o + 1], rects[o + 2], rects[o + 3])) return true;
    }
    return false;
  };
  const chipR = chip.x + chip.w;
  const chipB = chip.y + chip.h;
  const distToChip = (x: number, y: number) => {
    const dx = Math.max(chip.x - x, 0, x - chipR);
    const dy = Math.max(chip.y - y, 0, y - chipB);
    return Math.sqrt(dx * dx + dy * dy);
  };
  const far = (x: number, y: number) => smooth(70, FAR, distToChip(x, y));

  // ── graph storage (plain arrays: V8 keeps them packed, and growth is unbounded) ─────────────────────────────────
  const nxs: number[] = [];
  const nys: number[] = [];
  const kind: number[] = [];
  const nb: number[] = []; // node birth
  const par: number[] = []; // growth parent node (−1 for roots) — only used to avoid merging into one's own ancestry
  const nNext: number[] = [];
  const ea: number[] = [];
  const eb: number[] = [];
  const elen: number[] = [];
  const ebirth: number[] = [];
  const efar: number[] = [];
  const epcb: number[] = [];
  const ewidth: number[] = [];
  const seen: number[] = [];
  const entEdge: number[] = [];
  const entNext: number[] = [];

  const cols = Math.ceil((W + 2 * MARGIN) / CELL) + 1;
  const rows = Math.ceil((H + 2 * MARGIN) / CELL) + 1;
  const cellHead = new Int32Array(cols * rows).fill(-1);
  const nodeHead = new Int32Array(cols * rows).fill(-1);
  const cellN = new Uint16Array(cols * rows);
  const cc = (x: number) => clamp(Math.floor((x + MARGIN) / CELL), 0, cols - 1);
  const rr = (y: number) => clamp(Math.floor((y + MARGIN) / CELL), 0, rows - 1);
  let stamp = 0;

  const addNode = (x: number, y: number, k: number, birth: number, parent: number): number => {
    const id = nxs.length;
    nxs.push(x);
    nys.push(y);
    kind.push(k);
    nb.push(birth);
    par.push(parent);
    const ci = rr(y) * cols + cc(x);
    nNext.push(nodeHead[ci]);
    nodeHead[ci] = id;
    return id;
  };

  const addEdge = (a: number, b: number, pcb: boolean, width: number): number => {
    const e = ea.length;
    const dx = nxs[b] - nxs[a];
    const dy = nys[b] - nys[a];
    const len = Math.sqrt(dx * dx + dy * dy);
    ea.push(a);
    eb.push(b);
    elen.push(len);
    ebirth.push(nb[a] + len);
    efar.push(far((nxs[a] + nxs[b]) / 2, (nys[a] + nys[b]) / 2));
    epcb.push(pcb ? 1 : 0);
    ewidth.push(width);
    seen.push(0);
    cellN[rr((nys[a] + nys[b]) / 2) * cols + cc((nxs[a] + nxs[b]) / 2)]++; // density by midpoint: long PCB legs must not read as "crowded"
    const c0 = cc(Math.min(nxs[a], nxs[b]));
    const c1 = cc(Math.max(nxs[a], nxs[b]));
    const r0 = rr(Math.min(nys[a], nys[b]));
    const r1 = rr(Math.max(nys[a], nys[b]));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const ci = r * cols + c;
        entEdge.push(e);
        entNext.push(cellHead[ci]);
        cellHead[ci] = entEdge.length - 1;
      }
    }
    return e;
  };

  /** True when no edge other than those touching n1/n2 comes within `thr` px of segment AB. */
  const clear = (ax: number, ay: number, bx: number, by: number, n1: number, n2: number, thr: number): boolean => {
    const t2 = thr * thr;
    const minx = Math.min(ax, bx) - thr;
    const maxx = Math.max(ax, bx) + thr;
    const miny = Math.min(ay, by) - thr;
    const maxy = Math.max(ay, by) + thr;
    const c0 = cc(minx);
    const c1 = cc(maxx);
    const r0 = rr(miny);
    const r1 = rr(maxy);
    stamp++;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (let k = cellHead[r * cols + c]; k >= 0; k = entNext[k]) {
          const e = entEdge[k];
          if (seen[e] === stamp) continue;
          seen[e] = stamp;
          const a = ea[e];
          const b = eb[e];
          if (a === n1 || b === n1 || a === n2 || b === n2) continue;
          const px = nxs[a];
          const py = nys[a];
          const qx = nxs[b];
          const qy = nys[b];
          if ((px > qx ? px : qx) < minx || (px < qx ? px : qx) > maxx || (py > qy ? py : qy) < miny || (py < qy ? py : qy) > maxy) continue;
          if (segD2(ax, ay, bx, by, px, py, qx, qy) < t2) return false;
        }
      }
    }
    return true;
  };

  /** Nearest existing node to (x, y) within `r`, skipping `skipA`/`skipB`; `accept` validates a candidate. */
  const nearestNode = (x: number, y: number, r: number, skipA: number, skipB: number, accept: (n: number) => boolean): number => {
    const c0 = cc(x - r);
    const c1 = cc(x + r);
    const r0 = rr(y - r);
    const r1 = rr(y + r);
    let best = -1;
    let bd = r * r;
    for (let rw = r0; rw <= r1; rw++) {
      for (let c = c0; c <= c1; c++) {
        for (let n = nodeHead[rw * cols + c]; n >= 0; n = nNext[n]) {
          if (n === skipA || n === skipB) continue;
          const dx = nxs[n] - x;
          const dy = nys[n] - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bd && accept(n)) {
            bd = d2;
            best = n;
          }
        }
      }
    }
    return best;
  };

  const heads: Head[] = [];
  const pinIds: number[] = [];
  const inField = (x: number, y: number) => x >= -BOUND && x <= W + BOUND && y >= -BOUND && y <= H + BOUND;

  // ── 1–2. pins and buses ─────────────────────────────────────────────────────────────────────────────────────────
  // A bus is n parallel traces that leave the chip together, run `turnAt` px, bend 45° once, run `leg2`, then go free.
  // Lanes are kept exactly PITCH apart *perpendicular to travel* through the bend by lengthening the outer lanes'
  // first leg by lane·PITCH·tan(22.5°) (miter) — without it the bundle pinches at the corner.
  const makeBus = (sx: number, sy: number, tx: number, ty: number, dir: number, n: number, turn: number, turnAt: number, leg2: number) => {
    const dir2 = (dir + turn + 8) & 7;
    for (let i = 0; i < n; i++) {
      const px = sx + tx * i * PITCH;
      const py = sy + ty * i * PITCH;
      const energy = 420 + rnd() * 760;
      const pin = addNode(px, py, Pin, 0, -1);
      pinIds.push(pin);
      // "Inner" lanes (the side the bus turns toward) are shorter. lane·turn is that side's coordinate on both edges.
      const lane = i - (n - 1) / 2;
      const l0 = turnAt - turn * lane * PITCH * TAN_22_5;
      const bx = px + COS8[dir] * l0;
      const by = py + SIN8[dir] * l0;
      if (!inField(bx, by) || !clear(px, py, bx, by, pin, -1, 5.5)) continue;
      const bend = addNode(bx, by, Bend, l0, pin);
      addEdge(pin, bend, true, 1.25);
      let l2 = leg2;
      let ex = 0;
      let ey = 0;
      let ok = false;
      for (let tries = 0; tries < 2 && !ok; tries++, l2 *= 0.5) {
        ex = bx + COS8[dir2] * l2;
        ey = by + SIN8[dir2] * l2;
        ok = inField(ex, ey) && clear(bx, by, ex, ey, bend, -1, 5.5);
      }
      if (!ok) {
        kind[bend] = Via;
        continue;
      }
      const end = addNode(ex, ey, Bend, nb[bend] + l2, bend);
      addEdge(bend, end, true, 1.25);
      heads.push({ node: end, x: ex, y: ey, pcb: true, dir: dir2, ang: 0, energy: energy - l0 - l2, width: 1.25, steps: 2 });
    }
  };

  // Outward-leaning turns fan the buses apart like a skyline; the 35 % inward minority adds the irregularity that makes
  // it read as routed rather than generated, and the clearance test above resolves any collision.
  const pickTurn = (outward: number) => (rnd() < 0.65 ? outward : -outward);

  {
    // top edge
    const y = chip.y - 2;
    const x1 = chipR - 2 * PITCH;
    const mid = chip.x + chip.w / 2;
    for (let x = chip.x + 2 * PITCH; x <= x1; ) {
      let n = randint(2, 6);
      n = Math.min(n, Math.floor((x1 - x) / PITCH) + 1);
      const turn = pickTurn(x + ((n - 1) * PITCH) / 2 < mid ? -1 : 1);
      makeBus(x, y, 1, 0, 6, n, turn, 24 + 12 * randint(0, 5), 36 + 12 * randint(0, 7));
      x += (n - 1) * PITCH + (randint(1, 4) + 1) * PITCH;
    }
    // right edge — only when ≥ 180 px of field remains there, and never on phones (a skyline, not a fence)
    if (opts.profile !== 'phone' && W - chipR >= 180) {
      const x = chipR + 2;
      const y1 = chipB - 2 * PITCH;
      const midY = chip.y + chip.h / 2;
      for (let yy = chip.y + 2 * PITCH; yy <= y1; ) {
        let n = randint(2, 6);
        n = Math.min(n, Math.floor((y1 - yy) / PITCH) + 1);
        const turn = pickTurn(yy + ((n - 1) * PITCH) / 2 < midY ? -1 : 1);
        makeBus(x, yy, 0, 1, 0, n, turn, 24 + 12 * randint(0, 5), 36 + 12 * randint(0, 7));
        yy += (n - 1) * PITCH + (randint(1, 4) + 1) * PITCH;
      }
    }
  }

  // ── 3. edge roots: veins entering from the top / left / right (never the bottom, the page continues there) ──────
  {
    const sides: number[] = [];
    for (let i = 0; i < P.roots; i++) sides.push(i % 4 === 1 ? 1 : i % 4 === 3 ? 2 : 0); // 0 top, 1 right, 2 left
    const nTop = sides.filter((s) => s === 0).length;
    let kTop = 0;
    for (const side of sides) {
      let x: number;
      let y: number;
      if (side === 0) {
        x = (W * (kTop++ + 0.5)) / nTop + (rnd() - 0.5) * (W / nTop) * 0.6;
        y = -20;
      } else {
        x = side === 1 ? W + 20 : -20;
        y = rnd() * Math.max(0, Math.min(0.8 * H, chip.y - 40));
      }
      const ang = Math.atan2(0.45 * H - y, 0.6 * W - x) + (rnd() - 0.5) * 0.9;
      const node = addNode(x, y, Bend, 0, -1);
      heads.push({ node, x, y, pcb: false, dir: 0, ang, energy: 500 + rnd() * 700, width: 1.6, steps: 0 });
    }
  }

  // ── 4. growth ───────────────────────────────────────────────────────────────────────────────────────────────────
  const markEnd = (n: number, k: number) => {
    if (kind[n] === Bend) kind[n] = k;
  };
  const pcbEnd = (h: Head) => markEnd(h.node, rnd() < 0.55 ? Pad : Via);

  const stepPcb = (h: Head): boolean => {
    let dir = h.dir;
    const u = rnd();
    if (u < 0.34) dir += rnd() < 0.5 ? 1 : -1;
    else if (u < 0.4) dir += rnd() < 0.5 ? 2 : -2;
    dir = (dir + 8) & 7;
    const len = 12 * randint(2, 6);
    const first = rnd() < 0.5 ? 1 : -1;
    let ex = 0;
    let ey = 0;
    let d = dir;
    let ok = false;
    for (let k = 0; k < 4 && !ok; k++) {
      d = k === 0 ? dir : (dir + (k === 1 ? first : k === 2 ? -first : 2 * first) + 8) & 7;
      ex = h.x + COS8[d] * len;
      ey = h.y + SIN8[d] * len;
      ok = inField(ex, ey) && !blockedSeg(h.x, h.y, ex, ey) && clear(h.x, h.y, ex, ey, h.node, -1, 5.5);
    }
    if (!ok) {
      // T-junction: tie into a neighbouring trace (it becomes a via), if one lines up on the 45° grid; else terminate.
      if (rnd() < 0.5) {
        const t = nearestNode(h.x, h.y, 16, h.node, par[h.node], (n) => {
          const adx = Math.abs(nxs[n] - h.x);
          const ady = Math.abs(nys[n] - h.y);
          if (!(adx < 1.2 || ady < 1.2 || Math.abs(adx - ady) < 1.2)) return false;
          return !blockedPt(nxs[n], nys[n]) && !blockedSeg(h.x, h.y, nxs[n], nys[n]) && clear(h.x, h.y, nxs[n], nys[n], h.node, n, 2.2);
        });
        if (t >= 0) {
          addEdge(h.node, t, true, h.width);
          if (kind[t] !== Pin) kind[t] = Via;
          return false;
        }
      }
      pcbEnd(h);
      return false;
    }
    const node = addNode(ex, ey, Bend, nb[h.node] + len, h.node);
    addEdge(h.node, node, true, h.width);
    h.width = Math.max(1.0, h.width * 0.995);
    h.energy -= len;
    h.steps++;
    h.dir = d;
    h.node = node;
    h.x = ex;
    h.y = ey;
    if (h.energy <= 0) {
      pcbEnd(h);
      return false;
    }
    if (h.steps > 2 && heads.length < P.maxHeads && rnd() < 0.09) {
      kind[node] = Junction;
      heads.push({ node, x: ex, y: ey, pcb: true, dir: (d + (rnd() < 0.5 ? 2 : -2) + 8) & 7, ang: 0, energy: h.energy * 0.62, width: Math.max(1.0, h.width * 0.8), steps: 0 });
    }
    return true;
  };

  const stepVein = (h: Head): boolean => {
    h.ang += (rnd() - 0.5) * 0.55 + Math.sin(h.x * 0.004 + h.y * 0.003 + phase) * 0.06;
    const len = 7 + rnd() * 9;
    let ang = h.ang;
    let ex = 0;
    let ey = 0;
    let res = 2;
    let swing = 0;
    for (let k = 0; k < 4 && res === 2; k++) {
      if (k === 1) swing = rnd() < 0.5 ? 0.7 : -0.7;
      ang = h.ang + (k === 0 ? 0 : k === 1 ? swing : k === 2 ? -swing : swing * 2);
      ex = h.x + Math.cos(ang) * len;
      ey = h.y + Math.sin(ang) * len;
      if (!inField(ex, ey)) res = 1;
      else if (blockedSeg(h.x, h.y, ex, ey)) res = 2;
      else res = clear(h.x, h.y, ex, ey, h.node, -1, 3.2) ? 0 : 3;
    }
    if (res === 1 || res === 2) {
      if (res === 2 && rnd() < 0.35) markEnd(h.node, Nodule);
      return false;
    }
    if (res === 3) {
      // Anastomosis: fuse into a nearby node so the veins form loops and pulses can interfere. Otherwise just stop.
      if (rnd() < 0.7) {
        const m = nearestNode(ex, ey, 10, h.node, par[h.node], (n) => !blockedPt(nxs[n], nys[n]) && !blockedSeg(h.x, h.y, nxs[n], nys[n]) && clear(h.x, h.y, nxs[n], nys[n], h.node, n, 1.6));
        if (m >= 0) {
          addEdge(h.node, m, false, h.width);
          return false;
        }
      }
      if (rnd() < 0.35) markEnd(h.node, Nodule);
      return false;
    }
    const node = addNode(ex, ey, Bend, nb[h.node] + len, h.node);
    addEdge(h.node, node, false, h.width);
    h.width = Math.max(0.5, h.width * 0.982);
    h.energy -= len;
    h.steps++;
    h.ang = ang;
    h.node = node;
    h.x = ex;
    h.y = ey;
    if (h.energy <= 0) {
      if (rnd() < 0.4) kind[node] = Nodule;
      return false;
    }
    if (h.steps > 2 && heads.length < P.maxHeads && rnd() < 0.075) {
      const sign = rnd() < 0.5 ? 1 : -1;
      heads.push({ node, x: ex, y: ey, pcb: false, dir: 0, ang: ang + sign * (0.45 + rnd() * 0.5), energy: h.energy * 0.62, width: Math.max(0.5, h.width * 0.8), steps: 0 });
    }
    return true;
  };

  const step = (h: Head): boolean => {
    // Copper cools into ore: the further from the chip, the likelier a trace is to let go of the 45° grid.
    if (h.pcb && h.steps >= 3 && rnd() < far(h.x, h.y) * 0.22) {
      h.pcb = false;
      h.ang = h.dir * (Math.PI / 4);
    }
    return h.pcb ? stepPcb(h) : stepVein(h);
  };

  // ── 5. connected refill ─────────────────────────────────────────────────────────────────────────────────────────
  // Growth sprouts from the existing graph, never from fresh roots, so the board stays one connected component.
  const refill = (): boolean => {
    let bx = 0;
    let by = 0;
    let bc = 1e9;
    for (let k = 0; k < 48; k++) {
      let px = 0;
      let py = 0;
      let tries = 0;
      do {
        px = rnd() * W;
        py = rnd() * H;
      } while (distToChip(px, py) < 40 && ++tries < 8);
      if (tries >= 8) continue;
      // 7×7-cell window (112 px) around the probe, bounds hoisted out of the loops
      const c0 = Math.max(0, cc(px) - 3);
      const c1 = Math.min(cols - 1, cc(px) + 3);
      const r0 = Math.max(0, rr(py) - 3);
      const r1 = Math.min(rows - 1, rr(py) + 3);
      let count = 0;
      for (let r = r0; r <= r1 && count < bc; r++) for (let c = c0; c <= c1; c++) count += cellN[r * cols + c];
      if (count < bc) {
        bc = count;
        bx = px;
        by = py;
      }
    }
    if (bc > 10) return false;
    // nearest existing node outside the chip's 20 px halo, found by widening the grid search instead of scanning all nodes
    let best = -1;
    for (let rad = 24; rad <= 4096 && best < 0; rad *= 2) best = nearestNode(bx, by, rad, -1, -1, (n) => distToChip(nxs[n], nys[n]) >= 20);
    let bd = 0;
    if (best >= 0) bd = (nxs[best] - bx) ** 2 + (nys[best] - by) ** 2;
    if (best < 0) return false;
    const d = Math.sqrt(bd);
    heads.push({ node: best, x: nxs[best], y: nys[best], pcb: false, dir: 0, ang: Math.atan2(by - nys[best], bx - nxs[best]), energy: 160 + d + rnd() * 240, width: 0.9, steps: 0 });
    return true;
  };

  for (let iter = 0, maxIter = target * 30; nxs.length < target && iter < maxIter; iter++) {
    if (heads.length === 0) {
      if (!refill()) break;
      continue;
    }
    // Near-breadth-first: pick among the 24 oldest heads, then send the pick to the back of the queue, so every bus and
    // every vein advances at about the same rate and none of them starves its neighbours of space.
    const i = Math.floor(rnd() * Math.min(heads.length, 24));
    const h = heads[i];
    const alive = step(h);
    heads.splice(i, 1);
    if (alive) heads.push(h);
  }

  // ── 6. pack ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const V = nxs.length;
  const E = ea.length;
  const adjStart = new Uint32Array(V + 1);
  for (let e = 0; e < E; e++) {
    adjStart[ea[e] + 1]++;
    adjStart[eb[e] + 1]++;
  }
  for (let i = 0; i < V; i++) adjStart[i + 1] += adjStart[i];
  const fillAt = adjStart.slice(0, V);
  const adjEdge = new Uint32Array(E * 2);
  for (let e = 0; e < E; e++) {
    adjEdge[fillAt[ea[e]]++] = e;
    adjEdge[fillAt[eb[e]]++] = e;
  }
  let maxBirth = 0;
  for (let e = 0; e < E; e++) if (ebirth[e] > maxBirth) maxBirth = ebirth[e];

  return {
    width: W,
    height: H,
    nodeCount: V,
    edgeCount: E,
    nx: new Float32Array(nxs),
    ny: new Float32Array(nys),
    nkind: new Uint8Array(kind),
    nbirth: new Float32Array(nb),
    ea: new Uint32Array(ea),
    eb: new Uint32Array(eb),
    elen: new Float32Array(elen),
    ebirth: new Float32Array(ebirth),
    efar: new Float32Array(efar),
    epcb: new Uint8Array(epcb),
    ewidth: new Float32Array(ewidth),
    adjStart,
    adjEdge,
    pins: new Uint32Array(pinIds),
    maxBirth,
    chip,
  };
}
