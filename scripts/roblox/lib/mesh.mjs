// Mesh model used by the rest of the pipeline. A "corner" is one unique (v, vt, vn) tuple within one group
// (the OBJ's "source vertex"). Keeping corners per group means a vertex shared by two groups still gets
// independent skinning, and unreferenced vertices (Roblox's hidden-surface-removal leftovers) vanish for free.

export function buildMesh(obj) {
  const pos = [], uv = [], nrm = [];
  const groups = [];
  for (const g of obj.groups) {
    const map = new Map(); const corners = []; const tris = [];
    const corner = (t) => {
      const key = t[0] + '/' + t[1] + '/' + t[2];
      let id = map.get(key);
      if (id === undefined) {
        id = pos.length / 3; map.set(key, id); corners.push(id);
        pos.push(obj.v[3 * t[0]], obj.v[3 * t[0] + 1], obj.v[3 * t[0] + 2]);
        if (t[1] >= 0) uv.push(obj.vt[2 * t[1]], obj.vt[2 * t[1] + 1]); else uv.push(0, 0);
        if (t[2] >= 0) nrm.push(obj.vn[3 * t[2]], obj.vn[3 * t[2] + 1], obj.vn[3 * t[2] + 2]); else nrm.push(NaN, 0, 0);
      }
      return id;
    };
    for (const f of g.faces) for (let k = 1; k < f.length - 1; k++) tris.push(corner(f[0]), corner(f[k]), corner(f[k + 1])); // fan
    groups.push({ name: g.name, mtl: g.mtl, tris: Int32Array.from(tris), corners: Int32Array.from(corners) });
  }
  return { P: Float64Array.from(pos), UV: Float64Array.from(uv), N: Float64Array.from(nrm), nCorners: pos.length / 3, groups };
}

export function bboxOf(P, corners) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], cen = [0, 0, 0];
  for (const c of corners) for (let k = 0; k < 3; k++) { const x = P[3 * c + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; cen[k] += x; }
  const n = corners.length || 1;
  return { mn, mx, sz: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]], ctr: [0, 1, 2].map((k) => (mn[k] + mx[k]) / 2), cen: cen.map((x) => x / n) };
}

/**
 * SPEC 2: rotate 180 degrees about Y (det +1, so CCW winding survives), origin = Player* bbox centre in x/z and the
 * global min y, uv v flipped so the renderer never needs UNPACK_FLIP_Y. Mutates mesh in place.
 */
export function canonicalize(mesh) {
  const { P, N, UV, groups } = mesh;
  const isPlayer = (g) => g.name.startsWith('Player');
  const src = groups.some(isPlayer) ? groups.filter(isPlayer) : groups;
  const pb = bboxOf(P, src.flatMap((g) => [...g.corners]));
  const ox = (pb.mn[0] + pb.mx[0]) / 2, oz = (pb.mn[2] + pb.mx[2]) / 2;
  let oy = Infinity; for (let c = 0; c < mesh.nCorners; c++) oy = Math.min(oy, P[3 * c + 1]);
  for (let c = 0; c < mesh.nCorners; c++) {
    P[3 * c] = -(P[3 * c] - ox); P[3 * c + 1] -= oy; P[3 * c + 2] = -(P[3 * c + 2] - oz);
    UV[2 * c + 1] = 1 - UV[2 * c + 1];
  }
  const missing = [];
  for (let c = 0; c < mesh.nCorners; c++) {
    if (Number.isNaN(N[3 * c])) { missing.push(c); continue; }
    N[3 * c] = -N[3 * c]; N[3 * c + 2] = -N[3 * c + 2];
  }
  if (missing.length) fillNormals(mesh);
  mesh.origin = [ox, oy, oz];
  for (const g of groups) { g.bb = bboxOf(P, g.corners); g.isPlayer = isPlayer(g); }
}

// Fallback only (the Roblox export always has vn): area-weighted smooth normals, welded by position within a group.
function fillNormals(mesh) {
  const { P, N, groups } = mesh;
  for (const g of groups) {
    if (!g.corners.some((c) => Number.isNaN(N[3 * c]))) continue;
    const acc = new Map(); const key = (c) => Math.round(P[3 * c] * 1e4) + ',' + Math.round(P[3 * c + 1] * 1e4) + ',' + Math.round(P[3 * c + 2] * 1e4);
    for (let t = 0; t < g.tris.length; t += 3) {
      const [a, b, c] = [g.tris[t], g.tris[t + 1], g.tris[t + 2]];
      const e1 = [0, 1, 2].map((k) => P[3 * b + k] - P[3 * a + k]), e2 = [0, 1, 2].map((k) => P[3 * c + k] - P[3 * a + k]);
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      for (const v of [a, b, c]) { const k = key(v); const s = acc.get(k) || [0, 0, 0]; for (let i = 0; i < 3; i++) s[i] += n[i]; acc.set(k, s); }
    }
    for (const c of g.corners) if (Number.isNaN(N[3 * c])) { const s = acc.get(key(c)); const l = Math.hypot(...s) || 1; N[3 * c] = s[0] / l; N[3 * c + 1] = s[1] / l; N[3 * c + 2] = s[2] / l; }
  }
}

/**
 * Connected components of a group's triangles. `byPos` welds corners at 1e-4 studs first (wings: the OBJ splits
 * vertices at UV seams, so corner connectivity would shred them); otherwise connectivity is over shared corner ids
 * (= UV islands, which is what the sleeve rule wants). Components come out in order of their first triangle.
 */
export function components(mesh, g, byPos) {
  const { P } = mesh;
  const local = new Map(); const wid = [];
  const weldMap = new Map();
  g.corners.forEach((c, i) => {
    local.set(c, i);
    if (!byPos) { wid[i] = i; return; }
    const key = Math.round(P[3 * c] * 1e4) + ',' + Math.round(P[3 * c + 1] * 1e4) + ',' + Math.round(P[3 * c + 2] * 1e4);
    let w = weldMap.get(key); if (w === undefined) { w = weldMap.size; weldMap.set(key, w); } wid[i] = w;
  });
  const n = byPos ? weldMap.size : g.corners.length;
  const par = Int32Array.from({ length: n }, (_, i) => i);
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const nt = g.tris.length / 3; const W = (c) => wid[local.get(c)];
  for (let t = 0; t < nt; t++) {
    const a = find(W(g.tris[3 * t])), b = find(W(g.tris[3 * t + 1])), c = find(W(g.tris[3 * t + 2]));
    par[b] = a; par[find(c)] = find(a);
  }
  const out = new Map();
  for (let t = 0; t < nt; t++) {
    const r = find(W(g.tris[3 * t]));
    if (!out.has(r)) out.set(r, { tris: [], cornerSet: new Set() });
    const C = out.get(r); C.tris.push(t);
    for (let k = 0; k < 3; k++) C.cornerSet.add(g.tris[3 * t + k]);
  }
  return [...out.values()].map((C) => { const corners = [...C.cornerSet]; return { tris: C.tris, corners, bb: bboxOf(P, corners) }; });
}
