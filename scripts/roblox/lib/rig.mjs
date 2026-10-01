// Landmarks, group -> bone classification, sleeve weights and pivots (SPEC section 4).
// Everything works in canonical coordinates (mesh.canonicalize has run).
import { components } from './mesh.mjs';

export const BONE_NAMES = ['root', 'torso', 'head', 'armR', 'armL', 'wingR', 'wingL', 'tail'];
export const BONE_PARENT = [-1, 0, 1, 1, 1, 1, 1, 0];
const B = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i]));

const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const posKey = (P, c) => Math.round(P[3 * c] * 1e4) + ',' + Math.round(P[3 * c + 1] * 1e4) + ',' + Math.round(P[3 * c + 2] * 1e4);
// Any stable integer hash will do; this just decorrelates the per-component twinkle phases.
const hash32 = (i) => { let h = Math.imul(i + 1, 0x9e3779b1) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; return h >>> 0; };

export function classify(mesh, cfg, log) {
  const { P, groups } = mesh;
  const body = groups.filter((g) => g.isPlayer);
  if (!body.length) throw new Error('no Player* groups: cannot establish landmarks');

  // --- 4.1 landmarks ---
  let headPart = body.filter((g) => g.bb.sz.every((s) => s > 0.6 && s < 1.6)).sort((a, b) => b.bb.cen[1] - a.bb.cen[1])[0];
  if (!headPart) { headPart = [...body].sort((a, b) => b.bb.cen[1] - a.bb.cen[1])[0]; log.warn(`no Player* group has all bbox dims in [0.6,1.6]; using the highest (${headPart.name}) as head`); }
  const neckY = headPart.bb.mn[1], headTop = headPart.bb.mx[1];
  const feetY = Math.min(...body.map((g) => g.bb.mn[1]));
  const waistY = feetY + 0.42 * (headTop - feetY);
  const chestY = (waistY + neckY) / 2, shoulderY = neckY - 0.45;
  const lm = { headPart: headPart.name, neckY, headTop, feetY, waistY, chestY, shoulderY };

  const C = mesh.nCorners;
  const skin = { bone: new Uint8Array(C), parent: new Uint8Array(C), weight: new Uint8Array(C).fill(255), phase: new Uint8Array(C) };
  const setRigid = (corners, bone) => { for (const c of corners) { skin.bone[c] = bone; skin.parent[c] = bone; skin.weight[c] = 255; } };
  const triHalo = groups.map((g) => new Uint8Array(g.tris.length / 3));
  const info = []; const upper = [];

  for (const [gi, g] of groups.entries()) {
    const bb = g.bb; const forced = cfg.groups?.[g.name]?.bone;
    const rec = { group: g.name, mtl: g.mtl, tris: g.tris.length / 3, kind: g.isPlayer ? 'body' : 'acc', bone: '', rule: '' };
    info.push(rec);
    if (forced !== undefined) {
      if (!(forced in B)) throw new Error(`avatar.config.json: groups.${g.name}.bone "${forced}" is not one of ${BONE_NAMES.join(', ')}`);
      setRigid(g.corners, B[forced]); rec.bone = forced; rec.rule = 'config override'; continue;
    }
    if (cfg.groups?.[g.name]?.split === 'sides') {
      // Squad avatars (config only): one accessory that mixes shoulder wings, a crown and chest art. Split it per position-welded
      // component: far-left/right pieces flap as wings, pieces above the neck follow the head, the rest stays on the torso.
      const cnt = { wingR: 0, wingL: 0, head: 0, torso: 0 };
      for (const comp of components(mesh, g, true)) {
        const bone = comp.bb.cen[1] > neckY ? B.head : Math.abs(comp.bb.cen[0]) > (cfg.groups[g.name].sideX ?? 0.9) ? (comp.bb.cen[0] > 0 ? B.wingL : B.wingR) : B.torso;
        cnt[BONE_NAMES[bone]] += comp.tris.length; setRigid(comp.corners, bone);
      }
      rec.bone = 'sides'; rec.rule = 'config split ' + JSON.stringify(cnt); continue;
    }
    if (g.isPlayer) { // 4.2 body parts
      let bone, rule;
      if (g === headPart || bb.cen[1] > neckY) { bone = 'head'; rule = g === headPart ? 'head part' : 'above neck'; }
      else if (Math.abs(bb.cen[0]) > 0.9 && bb.cen[1] > waistY && bb.cen[1] < neckY) { bone = bb.cen[0] > 0 ? 'armL' : 'armR'; rule = 'body arm'; }
      else if (bb.cen[1] > waistY) { bone = 'torso'; rule = 'above waist'; }
      else { bone = 'root'; rule = 'below waist'; }
      setRigid(g.corners, B[bone]); rec.bone = bone; rec.rule = rule; continue;
    }
    // 4.2 accessories, first matching rule wins
    if (bb.mn[1] > neckY - 0.35) { setRigid(g.corners, B.head); rec.bone = 'head'; rec.rule = 'min y above neck-0.35'; continue; }
    if (bb.ctr[2] < -0.4 && bb.sz[0] < 0.6 && bb.cen[1] < waistY + 0.3) { setRigid(g.corners, B.tail); rec.bone = 'tail'; rec.rule = 'behind, narrow, low'; continue; }
    if (bb.ctr[2] < -0.4 && bb.sz[0] > 2.0) {
      // Back accessory: split per position-welded component because wings, spine ornament and halo share one group.
      const comps = components(mesh, g, true); const cnt = { wingR: 0, wingL: 0, torso: 0, halo: 0 };
      comps.forEach((comp, ci) => {
        // Both criteria matter: the spine ornament is only 0.0307 thick but has 324 tris; rays/sparkles are <=0.0219 and <=16 tris.
        const halo = Math.min(...comp.bb.sz) < 0.026 && comp.tris.length <= 64;
        let bone;
        if (halo) { bone = B.torso; for (const t of comp.tris) triHalo[gi][t] = 1; const ph = 1 + (hash32(ci) % 255); for (const c of comp.corners) skin.phase[c] = ph; cnt.halo += comp.tris.length; }
        else { bone = comp.bb.cen[0] > 0.15 ? B.wingL : comp.bb.cen[0] < -0.15 ? B.wingR : B.torso; cnt[BONE_NAMES[bone]] += comp.tris.length; }
        setRigid(comp.corners, bone);
      });
      rec.bone = 'wings'; rec.rule = `back accessory ${JSON.stringify(cnt)} in ${comps.length} components`; rec.split = cnt; continue;
    }
    let probe = 0;
    for (const c of g.corners) if (Math.abs(P[3 * c]) < 0.35 && Math.abs(P[3 * c + 1] - chestY) < 0.35 && P[3 * c + 2] > 0) probe++;
    if (probe >= 5) { setRigid(g.corners, B.torso); upper.push(g); rec.bone = 'torso+sleeves'; rec.rule = `chest probe ${probe}`; continue; }
    if (bb.cen[1] < waistY) { setRigid(g.corners, B.root); rec.bone = 'root'; rec.rule = 'below waist'; continue; }
    setRigid(g.corners, B.torso); rec.bone = 'torso'; rec.rule = 'default';
  }

  // --- 4.3 sleeves ---
  const sleeveVerts = { armR: new Set(), armL: new Set() }; const sleeveStats = {};
  for (const g of upper) {
    const r = sleeveWeights(mesh, g, skin, sleeveVerts, log);
    for (const [arm, s] of Object.entries(r)) {
      const t = (sleeveStats[arm] ||= { islands: [], rigid: 0, blended: 0, seam: 0 });
      t.islands.push(...s.islands); t.rigid += s.rigid; t.blended += s.blended; t.seam += s.seam;
    }
  }

  // --- 4.4 pivots (means over source corners, not welded vertices: that is what keeps them within 0.01 of the spec) ---
  const cornersOf = (bone) => { const o = []; for (let c = 0; c < C; c++) if (skin.bone[c] === bone) o.push(c); return o; };
  const mean = (cs) => [0, 1, 2].map((k) => cs.reduce((s, c) => s + P[3 * c + k], 0) / cs.length);
  const pivots = Array.from({ length: 8 }, () => [0, 0, 0]);
  pivots[B.torso] = [0, waistY, 0];
  pivots[B.head] = [headPart.bb.ctr[0], neckY, headPart.bb.ctr[2]]; // bbox centre: dense face detail drags the vertex centroid 0.28 forward
  for (const [arm, side] of [['armR', -1], ['armL', 1]]) {
    let sv = [...sleeveVerts[arm]];
    if (!sv.length) sv = cornersOf(B[arm]); // body arms (none in this avatar) or nothing at all
    if (sv.length) {
      const topY = Math.max(...sv.map((c) => P[3 * c + 1]));
      const m = mean(sv.filter((c) => P[3 * c + 1] > topY - 0.5));
      pivots[B[arm]] = [m[0], shoulderY, m[2]];
    } else pivots[B[arm]] = [side * 1.15, shoulderY, 0];
  }
  for (const [wing, side] of [['wingR', -1], ['wingL', 1]]) {
    const cs = cornersOf(B[wing]);
    if (!cs.length) { pivots[B[wing]] = [side * 0.43, chestY, -0.5]; continue; }
    const ax = cs.map((c) => Math.abs(P[3 * c])).sort((a, b) => a - b);
    const thr = ax[Math.floor(ax.length * 0.1)]; // 10th percentile of |x|: the wing's inner root is its hinge
    pivots[B[wing]] = mean(cs.filter((c) => Math.abs(P[3 * c]) <= thr));
  }
  {
    const cs = cornersOf(B.tail);
    if (!cs.length) pivots[B.tail] = [0, waistY, -0.25];
    else { const mz = Math.max(...cs.map((c) => P[3 * c + 2])); pivots[B.tail] = mean(cs.filter((c) => P[3 * c + 2] > mz - 0.15)); }
  }
  return { lm, skin, triHalo, info, pivots, sleeveStats };
}

function sleeveWeights(mesh, g, skin, sleeveVerts, log) {
  const { P } = mesh;
  const islands = components(mesh, g, false); // UV islands: connectivity over shared source vertex ids
  const sleeves = { armR: [], armL: [] };
  for (const I of islands) {
    if (I.bb.mn[0] > 0.1 && I.bb.cen[0] > 0.45) sleeves.armL.push(I);
    else if (I.bb.mx[0] < -0.1 && I.bb.cen[0] < -0.45) sleeves.armR.push(I);
  }
  // Weld by position over the whole garment to get one connected surface for geodesic distances.
  const wmap = new Map(); const wOf = new Map(); const wpos = [];
  for (const c of g.corners) {
    const k = posKey(P, c); let w = wmap.get(k);
    if (w === undefined) { w = wmap.size; wmap.set(k, w); wpos.push([P[3 * c], P[3 * c + 1], P[3 * c + 2]]); }
    wOf.set(c, w);
  }
  const n = wmap.size;
  const adj = Array.from({ length: n }, () => new Map());
  for (let t = 0; t < g.tris.length; t += 3) {
    const w3 = [wOf.get(g.tris[t]), wOf.get(g.tris[t + 1]), wOf.get(g.tris[t + 2])];
    for (let e = 0; e < 3; e++) {
      const a = w3[e], b = w3[(e + 1) % 3]; if (a === b) continue;
      const d = Math.hypot(wpos[a][0] - wpos[b][0], wpos[a][1] - wpos[b][1], wpos[a][2] - wpos[b][2]);
      adj[a].set(b, d); adj[b].set(a, d);
    }
  }
  const out = {};
  for (const arm of ['armR', 'armL']) {
    if (!sleeves[arm].length) continue;
    const inS = new Uint8Array(n), inT = new Uint8Array(n);
    const own = new Set();
    for (const I of sleeves[arm]) for (const c of I.corners) { own.add(c); sleeveVerts[arm].add(c); }
    for (const c of g.corners) { if (own.has(c)) inS[wOf.get(c)] = 1; else inT[wOf.get(c)] = 1; }
    // Dijkstra from the seam (welded vertices that touch both the sleeve and the rest of the garment).
    const dist = new Float64Array(n).fill(Infinity); const heap = [];
    const push = (d, v) => { heap.push([d, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last; let i = 0;
        for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; }
      }
      return top;
    };
    let seam = 0;
    for (let i = 0; i < n; i++) if (inS[i] && inT[i]) { dist[i] = 0; push(0, i); seam++; }
    if (!seam) { log.warn(`${g.name}/${arm}: sleeve has no seam with the garment; skipping sleeve weights`); continue; }
    while (heap.length) { const [d, v] = pop(); if (d > dist[v]) continue; for (const [u, l] of adj[v]) if (d + l < dist[u]) { dist[u] = d + l; push(d + l, u); } }
    const side = arm === 'armR' ? -1 : 1;
    let wf = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const s = inS[i] && !inT[i] ? dist[i] : inS[i] && inT[i] ? 0 : -dist[i];
      // The torso panels have side walls at |x| 0.8-1.0 that sit under the sleeves; the side restriction keeps
      // the far half of the garment from ever getting arm weight.
      wf[i] = wpos[i][0] * side < -0.05 ? 0 : smoothstep(-0.60, 0.30, s);
    }
    for (let it = 0; it < 2; it++) { // Jacobi smoothing of the transition band; the pure sleeve tube stays pinned at 1
      const nw = Float64Array.from(wf);
      for (let i = 0; i < n; i++) {
        if (wf[i] <= 0 || (inS[i] && !inT[i] && wf[i] >= 1)) continue;
        let acc = wf[i]; for (const j of adj[i].keys()) acc += wf[j];
        nw[i] = acc / (1 + adj[i].size);
      }
      wf = nw;
    }
    let rigid = 0, blended = 0; const bone = arm === 'armR' ? B.armR : B.armL;
    for (const c of g.corners) {
      const wt = wf[wOf.get(c)];
      if (wt <= 0.002) continue;
      skin.bone[c] = bone;
      if (wt >= 0.998) { skin.parent[c] = bone; skin.weight[c] = 255; rigid++; }
      else { skin.parent[c] = B.torso; skin.weight[c] = Math.min(254, Math.max(1, Math.round(wt * 255))); blended++; }
    }
    out[arm] = { islands: sleeves[arm].map((I) => I.tris.length), rigid, blended, seam };
  }
  return out;
}
