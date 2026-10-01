// Engine-side graph tools (BUILD_PLAN §7.3): a 48 px CSR edge grid for the cursor, and a typed-array Dijkstra.
// Nothing here allocates after construction — Dijkstra runs on every click and every lantern move.
import type { Network } from './types';

const CELL = 48;

export interface EdgeGrid {
  cols: number;
  rows: number;
  start: Uint32Array;
  list: Uint32Array;
}

/** An edge is listed in every cell its bounding box touches, so a 3×3 scan around a point is always enough for ≤ 48 px. */
export function buildGrid(net: Network): EdgeGrid {
  const cols = Math.ceil(net.width / CELL) + 1;
  const rows = Math.ceil(net.height / CELL) + 1;
  const counts = new Uint32Array(cols * rows + 1);
  const span = (e: number, cb: (ci: number) => void) => {
    const ax = net.nx[net.ea[e]];
    const ay = net.ny[net.ea[e]];
    const bx = net.nx[net.eb[e]];
    const by = net.ny[net.eb[e]];
    const c0 = Math.max(0, Math.min(cols - 1, Math.floor(Math.min(ax, bx) / CELL)));
    const c1 = Math.max(0, Math.min(cols - 1, Math.floor(Math.max(ax, bx) / CELL)));
    const r0 = Math.max(0, Math.min(rows - 1, Math.floor(Math.min(ay, by) / CELL)));
    const r1 = Math.max(0, Math.min(rows - 1, Math.floor(Math.max(ay, by) / CELL)));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cb(r * cols + c);
  };
  for (let e = 0; e < net.edgeCount; e++) span(e, (ci) => counts[ci + 1]++);
  for (let i = 0; i < cols * rows; i++) counts[i + 1] += counts[i];
  const fill = counts.slice(0, cols * rows);
  const list = new Uint32Array(counts[cols * rows]);
  for (let e = 0; e < net.edgeCount; e++) span(e, (ci) => (list[fill[ci]++] = e));
  return { cols, rows, start: counts, list };
}

export interface Hit {
  edge: number;
  /** 0 at ea … 1 at eb */
  t: number;
  x: number;
  y: number;
  d: number;
}

/** Nearest edge to (x, y) within maxD: scan 3×3 cells, widen to 5×5 when empty. Returns false when nothing is in range. */
export function nearestEdge(net: Network, g: EdgeGrid, x: number, y: number, maxD: number, out: Hit): boolean {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  let best = maxD * maxD;
  let found = false;
  for (let reach = 1; reach <= 2 && !found; reach++) {
    for (let r = cy - reach; r <= cy + reach; r++) {
      if (r < 0 || r >= g.rows) continue;
      for (let c = cx - reach; c <= cx + reach; c++) {
        if (c < 0 || c >= g.cols) continue;
        const ci = r * g.cols + c;
        for (let k = g.start[ci]; k < g.start[ci + 1]; k++) {
          const e = g.list[k];
          const ax = net.nx[net.ea[e]];
          const ay = net.ny[net.ea[e]];
          const dx = net.nx[net.eb[e]] - ax;
          const dy = net.ny[net.eb[e]] - ay;
          const l2 = dx * dx + dy * dy;
          let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = ax + dx * t;
          const qy = ay + dy * t;
          const d2 = (qx - x) * (qx - x) + (qy - y) * (qy - y);
          if (d2 < best) {
            best = d2;
            out.edge = e;
            out.t = t;
            out.x = qx;
            out.y = qy;
            out.d = Math.sqrt(d2);
            found = true;
          }
        }
      }
    }
  }
  return found;
}

/**
 * Multi-source Dijkstra with a binary min-heap (lazy deletion) on typed arrays.
 * `portal`: pins are wired together *through the die* — the first pin the wave reaches re-emits it from every other
 * pin PORTAL_COST px later. That is what lets a click anywhere light the whole chip's bus fan-out, and it is why the
 * board behaves as one connected thing even though each bus is its own copper tree.
 */
const PORTAL_COST = 90;

export class Dijkstra {
  private net: Network;
  private hk: Float32Array;
  private hv: Uint32Array;
  private n = 0;

  constructor(net: Network) {
    this.net = net;
    const cap = net.edgeCount * 2 + net.nodeCount + net.pins.length + 8;
    this.hk = new Float32Array(cap);
    this.hv = new Uint32Array(cap);
  }

  private push(k: number, v: number) {
    const hk = this.hk;
    const hv = this.hv;
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p] <= k) break;
      hk[i] = hk[p];
      hv[i] = hv[p];
      i = p;
    }
    hk[i] = k;
    hv[i] = v;
  }

  /** Pops the minimum into this.topK / this.topV. */
  private topK = 0;
  private topV = 0;
  private pop() {
    const hk = this.hk;
    const hv = this.hv;
    this.topK = hk[0];
    this.topV = hv[0];
    const n = --this.n;
    if (n === 0) return;
    const k = hk[n];
    const v = hv[n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && hk[c + 1] < hk[c]) c++;
      if (hk[c] >= k) break;
      hk[i] = hk[c];
      hv[i] = hv[c];
      i = c;
    }
    hk[i] = k;
    hv[i] = v;
  }

  /** Clears `dist` (and `pred`) and empties the heap; call before `seed`. */
  begin(dist: Float32Array, pred: Int32Array | null) {
    dist.fill(Infinity);
    if (pred) pred.fill(-1);
    this.n = 0;
  }

  seed(dist: Float32Array, node: number, d: number) {
    if (d < dist[node]) {
      dist[node] = d;
      this.push(d, node);
    }
  }

  run(dist: Float32Array, maxDist: number, pred: Int32Array | null, portal: boolean) {
    const net = this.net;
    const { ea, eb, elen, adjStart, adjEdge, nkind, pins } = net;
    let portalFired = !portal;
    while (this.n > 0) {
      this.pop();
      const d = this.topK;
      const u = this.topV;
      if (d > dist[u]) continue;
      if (d > maxDist) break;
      if (!portalFired && nkind[u] === 3) {
        portalFired = true;
        for (let i = 0; i < pins.length; i++) {
          if (d + PORTAL_COST < dist[pins[i]]) {
            dist[pins[i]] = d + PORTAL_COST;
            this.push(d + PORTAL_COST, pins[i]);
          }
        }
      }
      for (let k = adjStart[u]; k < adjStart[u + 1]; k++) {
        const e = adjEdge[k];
        const v = ea[e] === u ? eb[e] : ea[e];
        const nd = d + elen[e];
        if (nd < dist[v]) {
          dist[v] = nd;
          if (pred) pred[v] = u;
          this.push(nd, v);
        }
      }
    }
  }
}
