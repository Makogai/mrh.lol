// Quadric-error edge-collapse decimation for the squad LOD (V2_DESIGN section 5: <= 7k tris per avatar).
//
// Runs on the canonical mesh BEFORE classification, over every group at once with one global queue, so the triangle budget
// goes to wherever it costs the least error (hair clumps and cloth fold detail go first, flat plates and silhouettes stay).
// A "corner" (one v/vt/vn tuple of one group) is the vertex: edges never cross groups, and the corner mesh's open borders are
// exactly the UV seams, which a boundary penalty keeps from sliding off their line. Collapses only try
// {u, v, midpoint}: no optimal-position solve, so UVs and normals never need re-deriving.
//
// protect(c) >= 1 multiplies the cost of every edge touching corner c: the head is protected so faces survive.
// canCollapse(u, v) vetoes an edge (the caller keeps skinning boundaries intact). Corner ids are stable: a collapse keeps u's id.
import { bboxOf } from './mesh.mjs';

const BOUNDARY_WEIGHT = 4;      // x |edge|^2, same units as the area-weighted face quadrics
const MID_PENALTY = 1.08;       // prefer an existing vertex (keeps UVs and normals untouched)
const FLIP_DOT = 0.15;          // reject a collapse that turns a neighbouring face by more than ~80 degrees

/** @returns {{from:number,to:number}} triangle counts. Mutates mesh.P/UV/N (kept corners) and every group's tris/corners/bb. */
export function decimate(mesh, target, { protect = () => 1, canCollapse = () => true } = {}) {
  const { P, UV, N, groups, nCorners: C } = mesh;
  // ---- flat triangle list over all groups ----
  const tg = [], tv = [];
  groups.forEach((g, gi) => { for (let t = 0; t < g.tris.length; t += 3) { tg.push(gi); tv.push(g.tris[t], g.tris[t + 1], g.tris[t + 2]); } });
  const T = tg.length;
  const alive = new Uint8Array(T).fill(1);
  const vt = Array.from({ length: C }, () => []); // corner -> live triangles
  for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) vt[tv[3 * t + k]].push(t);
  let live = T;
  // A group never loses more than 88 % of its triangles (and keeps at least 40): fine overlay meshes such as a face decal or eyelashes have
  // almost no error per triangle, so a global queue would delete them outright while the faces that matter most are what the eye reads.
  const cg = new Int32Array(C); groups.forEach((g, gi) => { for (const c of g.corners) cg[c] = gi; });
  const gLive = groups.map((g) => g.tris.length / 3), gMin = gLive.map((n) => Math.min(n, Math.max(40, Math.ceil(n * 0.12))));
  if (live <= target) return { from: T, to: T };

  // ---- quadrics: area-weighted face planes + boundary planes ----
  const Q = new Float64Array(10 * C);
  const addPlane = (c, a, b, cc, d, w) => {
    const o = 10 * c;
    Q[o] += w * a * a; Q[o + 1] += w * a * b; Q[o + 2] += w * a * cc; Q[o + 3] += w * a * d;
    Q[o + 4] += w * b * b; Q[o + 5] += w * b * cc; Q[o + 6] += w * b * d;
    Q[o + 7] += w * cc * cc; Q[o + 8] += w * cc * d; Q[o + 9] += w * d * d;
  };
  const faceN = (t, out) => {
    const a = tv[3 * t], b = tv[3 * t + 1], c = tv[3 * t + 2];
    const ux = P[3 * b] - P[3 * a], uy = P[3 * b + 1] - P[3 * a + 1], uz = P[3 * b + 2] - P[3 * a + 2];
    const vx = P[3 * c] - P[3 * a], vy = P[3 * c + 1] - P[3 * a + 1], vz = P[3 * c + 2] - P[3 * a + 2];
    out[0] = uy * vz - uz * vy; out[1] = uz * vx - ux * vz; out[2] = ux * vy - uy * vx; // length = 2 * area
  };
  const n3 = [0, 0, 0];
  const edgeUse = new Map(); const ek = (a, b) => (a < b ? a * C + b : b * C + a);
  for (let t = 0; t < T; t++) {
    faceN(t, n3); const len = Math.hypot(n3[0], n3[1], n3[2]);
    if (len > 1e-14) {
      const nx = n3[0] / len, ny = n3[1] / len, nz = n3[2] / len;
      for (let k = 0; k < 3; k++) { const c = tv[3 * t + k]; addPlane(c, nx, ny, nz, -(nx * P[3 * c] + ny * P[3 * c + 1] + nz * P[3 * c + 2]), len / 2); }
    }
    for (let k = 0; k < 3; k++) { const key = ek(tv[3 * t + k], tv[3 * t + (k + 1) % 3]); edgeUse.set(key, (edgeUse.get(key) || 0) + 1); }
  }
  for (let t = 0; t < T; t++) {
    faceN(t, n3); const len = Math.hypot(n3[0], n3[1], n3[2]); if (len < 1e-14) continue;
    for (let k = 0; k < 3; k++) {
      const a = tv[3 * t + k], b = tv[3 * t + (k + 1) % 3];
      if (edgeUse.get(ek(a, b)) !== 1) continue;
      const ex = P[3 * b] - P[3 * a], ey = P[3 * b + 1] - P[3 * a + 1], ez = P[3 * b + 2] - P[3 * a + 2];
      let mx = ey * n3[2] - ez * n3[1], my = ez * n3[0] - ex * n3[2], mz = ex * n3[1] - ey * n3[0];
      const ml = Math.hypot(mx, my, mz); if (ml < 1e-14) continue;
      mx /= ml; my /= ml; mz /= ml;
      const w = BOUNDARY_WEIGHT * (ex * ex + ey * ey + ez * ez), d = -(mx * P[3 * a] + my * P[3 * a + 1] + mz * P[3 * a + 2]);
      addPlane(a, mx, my, mz, d, w); addPlane(b, mx, my, mz, d, w);
    }
  }
  const W = new Float64Array(C); for (let c = 0; c < C; c++) W[c] = protect(c);

  const err = (a, b, x, y, z) => {
    const oa = 10 * a, ob = 10 * b, q = (i) => Q[oa + i] + Q[ob + i];
    return q(0) * x * x + 2 * q(1) * x * y + 2 * q(2) * x * z + 2 * q(3) * x + q(4) * y * y + 2 * q(5) * y * z + 2 * q(6) * y + q(7) * z * z + 2 * q(8) * z + q(9);
  };
  // Would moving corner `m` to (x,y,z) fold or collapse a face that survives the collapse of (m, other)?
  const nA = [0, 0, 0];
  const flips = (m, other, x, y, z) => {
    for (const t of vt[m]) {
      if (!alive[t]) continue;
      const i0 = tv[3 * t], i1 = tv[3 * t + 1], i2 = tv[3 * t + 2];
      if (i0 === other || i1 === other || i2 === other) continue;
      faceN(t, nA); const l0 = Math.hypot(nA[0], nA[1], nA[2]);
      const sx = P[3 * m], sy = P[3 * m + 1], sz = P[3 * m + 2];
      P[3 * m] = x; P[3 * m + 1] = y; P[3 * m + 2] = z;
      faceN(t, n3);
      P[3 * m] = sx; P[3 * m + 1] = sy; P[3 * m + 2] = sz;
      const l1 = Math.hypot(n3[0], n3[1], n3[2]);
      if (l1 < 1e-12 * Math.max(1, l0) && l0 > 1e-12) return true;
      if (l0 > 1e-12 && l1 > 1e-12 && (nA[0] * n3[0] + nA[1] * n3[1] + nA[2] * n3[2]) / (l0 * l1) < FLIP_DOT) return true;
    }
    return false;
  };

  // ---- priority queue (binary heap, lazy invalidation by per-corner version) ----
  const ver = new Uint32Array(C);
  const heap = [];
  const less = (i, j) => heap[i].c < heap[j].c;
  const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!less(i, p)) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && less(l, m)) m = l; if (r < heap.length && less(r, m)) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } }
    return top;
  };
  const evalEdge = (u, v) => {
    const px = P[3 * u], py = P[3 * u + 1], pz = P[3 * u + 2], qx = P[3 * v], qy = P[3 * v + 1], qz = P[3 * v + 2];
    const cu = err(u, v, px, py, pz), cv = err(u, v, qx, qy, qz);
    const mx = (px + qx) / 2, my = (py + qy) / 2, mz = (pz + qz) / 2, cm = err(u, v, mx, my, mz) * MID_PENALTY;
    let mode = 0, c = cu; if (cv < c) { mode = 1; c = cv; } if (cm < c) { mode = 2; c = cm; }
    return { c: Math.max(c, 0) * Math.max(W[u], W[v]) + 1e-12 * Math.hypot(qx - px, qy - py, qz - pz), u, v, mode, su: ver[u], sv: ver[v] };
  };
  const neighbours = (c) => { const s = new Set(); for (const t of vt[c]) if (alive[t]) for (let k = 0; k < 3; k++) { const o = tv[3 * t + k]; if (o !== c) s.add(o); } return s; };
  for (let c = 0; c < C; c++) for (const o of neighbours(c)) if (c < o) push(evalEdge(c, o));

  // ---- collapse until the budget is met ----
  while (live > target && heap.length) {
    const e = pop();
    if (e.su !== ver[e.u] || e.sv !== ver[e.v]) continue;
    if (!canCollapse(e.u, e.v)) continue;
    const { u, v, mode } = e;
    const x = mode === 0 ? P[3 * u] : mode === 1 ? P[3 * v] : (P[3 * u] + P[3 * v]) / 2;
    const y = mode === 0 ? P[3 * u + 1] : mode === 1 ? P[3 * v + 1] : (P[3 * u + 1] + P[3 * v + 1]) / 2;
    const z = mode === 0 ? P[3 * u + 2] : mode === 1 ? P[3 * v + 2] : (P[3 * u + 2] + P[3 * v + 2]) / 2;
    if (flips(u, v, x, y, z) || flips(v, u, x, y, z)) continue;
    let killed = 0;
    for (const t of vt[v]) if (alive[t] && (tv[3 * t] === u || tv[3 * t + 1] === u || tv[3 * t + 2] === u)) killed++;
    if (gLive[cg[u]] - killed < gMin[cg[u]]) continue;
    gLive[cg[u]] -= killed;
    // merge v into u
    P[3 * u] = x; P[3 * u + 1] = y; P[3 * u + 2] = z;
    if (mode === 1) { UV[2 * u] = UV[2 * v]; UV[2 * u + 1] = UV[2 * v + 1]; N[3 * u] = N[3 * v]; N[3 * u + 1] = N[3 * v + 1]; N[3 * u + 2] = N[3 * v + 2]; }
    else if (mode === 2) {
      UV[2 * u] = (UV[2 * u] + UV[2 * v]) / 2; UV[2 * u + 1] = (UV[2 * u + 1] + UV[2 * v + 1]) / 2;
      const nx = N[3 * u] + N[3 * v], ny = N[3 * u + 1] + N[3 * v + 1], nz = N[3 * u + 2] + N[3 * v + 2], l = Math.hypot(nx, ny, nz) || 1;
      N[3 * u] = nx / l; N[3 * u + 1] = ny / l; N[3 * u + 2] = nz / l;
    }
    for (let i = 0; i < 10; i++) Q[10 * u + i] += Q[10 * v + i];
    W[u] = Math.max(W[u], W[v]);
    for (const t of vt[v]) {
      if (!alive[t]) continue;
      const has = tv[3 * t] === u || tv[3 * t + 1] === u || tv[3 * t + 2] === u;
      if (has) { alive[t] = 0; live--; continue; }
      for (let k = 0; k < 3; k++) if (tv[3 * t + k] === v) tv[3 * t + k] = u;
      vt[u].push(t);
    }
    vt[v] = []; ver[v]++; ver[u]++;
    vt[u] = vt[u].filter((t) => alive[t]);
    for (const o of neighbours(u)) push(evalEdge(Math.min(u, o), Math.max(u, o)));
  }

  // ---- write back per group ----
  const per = groups.map(() => []);
  for (let t = 0; t < T; t++) if (alive[t]) per[tg[t]].push(tv[3 * t], tv[3 * t + 1], tv[3 * t + 2]);
  groups.forEach((g, gi) => {
    g.tris = Int32Array.from(per[gi]);
    g.corners = Int32Array.from(new Set(per[gi]));
    if (g.corners.length) g.bb = bboxOf(P, g.corners);
  });
  return { from: T, to: live };
}
