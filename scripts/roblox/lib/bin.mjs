// avatar.<h8>.bin: encoder and decoder (SPEC 3.1). Little-endian, planar, unsigned-normalised attributes.
export const HEADER_BYTES = 48;
const MAGIC = [0x4d, 0x52, 0x48, 0x41]; // "MRHA"

export function octEncode(n) {
  let l = Math.hypot(n[0], n[1], n[2]);
  if (!(l > 1e-12)) return [128, 255]; // degenerate normal -> +Y
  const u = [n[0] / l, n[1] / l, n[2] / l];
  const l1 = Math.abs(u[0]) + Math.abs(u[1]) + Math.abs(u[2]);
  let x = u[0] / l1, y = u[1] / l1;
  if (u[2] < 0) { const ox = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1); y = (1 - Math.abs(x)) * (y >= 0 ? 1 : -1); x = ox; }
  return [Math.round((x * 0.5 + 0.5) * 255), Math.round((y * 0.5 + 0.5) * 255)];
}

export function octDecode(qx, qy) {
  const ex = qx / 255 * 2 - 1, ey = qy / 255 * 2 - 1;
  let x = ex, y = ey; const z = 1 - Math.abs(ex) - Math.abs(ey);
  const t = Math.max(-z, 0);
  x += x >= 0 ? -t : t; y += y >= 0 ? -t : t;
  const l = Math.hypot(x, y, z); return [x / l, y / l, z / l];
}

/**
 * @param mesh canonical mesh (P, N, UV per corner)
 * @param skin per-corner {bone,parent,weight,phase}
 * @param drawTris array (one per draw, in draw order) of arrays of [groupIndex, triIndex]
 */
export function encodeBin(mesh, skin, drawTris) {
  const { P, N, UV, groups } = mesh;
  // --- quantisation ranges over every referenced corner (halo included) ---
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const uvMn = [Infinity, Infinity], uvMx = [-Infinity, -Infinity];
  for (const list of drawTris) for (const [gi, t] of list) for (let k = 0; k < 3; k++) {
    const c = groups[gi].tris[3 * t + k];
    for (let a = 0; a < 3; a++) { const v = P[3 * c + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
    for (let a = 0; a < 2; a++) { const v = UV[2 * c + a]; if (v < uvMn[a]) uvMn[a] = v; if (v > uvMx[a]) uvMx[a] = v; }
  }
  const posMin = mn, posRange = mx.map((x, i) => (x - mn[i] < 1e-6 ? 1 : x - mn[i]));
  const uvMin = uvMn, uvRange = uvMx.map((x, i) => (x - uvMn[i] < 1e-6 ? 1 : x - uvMn[i]));
  const q16 = (v) => Math.max(0, Math.min(65535, Math.round(v * 65535)));

  // Per-corner quantised tuple, cached. The weld key covers all 16 bytes: POS 6 + NRM 2 + UV 4 + SKIN 4.
  // (The SPEC text says "12-byte tuples"; its own field list adds up to 16, and welding on fewer would be wrong.)
  const cache = new Map();
  const tuple = (c) => {
    let r = cache.get(c); if (r) return r;
    const pos = [0, 1, 2].map((a) => q16((P[3 * c + a] - posMin[a]) / posRange[a]));
    const nrm = octEncode([N[3 * c], N[3 * c + 1], N[3 * c + 2]]);
    const uv = [0, 1].map((a) => q16((UV[2 * c + a] - uvMin[a]) / uvRange[a]));
    const sk = [skin.bone[c], skin.parent[c], skin.weight[c], skin.phase[c]];
    r = { pos, nrm, uv, sk, key: pos.join() + '|' + nrm.join() + '|' + uv.join() + '|' + sk.join() };
    cache.set(c, r); return r;
  };

  // Pass 1: drop triangles that collapse after welding (identical keys => identical welded index).
  const kept = drawTris.map((list) => list.filter(([gi, t]) => {
    const g = groups[gi]; const k = [0, 1, 2].map((i) => tuple(g.tris[3 * t + i]).key);
    return k[0] !== k[1] && k[1] !== k[2] && k[0] !== k[2];
  }));
  const dropped = drawTris.reduce((s, l, i) => s + l.length - kept[i].length, 0);

  // Pass 2: vertex order = first reference while walking draws in order, so each draw's vertices stay near-contiguous.
  const vid = new Map(); const verts = []; const idx = []; const draws = [];
  for (const list of kept) {
    const first = idx.length;
    for (const [gi, t] of list) for (let i = 0; i < 3; i++) {
      const tp = tuple(groups[gi].tris[3 * t + i]);
      let id = vid.get(tp.key);
      if (id === undefined) { id = verts.length; vid.set(tp.key, id); verts.push(tp); }
      idx.push(id);
    }
    draws.push({ first, count: idx.length - first });
  }
  const Nv = verts.length, I = idx.length, u32 = Nv >= 65536;
  const posOffset = HEADER_BYTES, nrmOffset = posOffset + 6 * Nv, uvOffset = posOffset + 8 * Nv, skinOffset = posOffset + 12 * Nv, indexOffset = posOffset + 16 * Nv;
  const byteLength = (indexOffset + I * (u32 ? 4 : 2) + 3) & ~3;
  const buf = new ArrayBuffer(byteLength); const dv = new DataView(buf); const u8 = new Uint8Array(buf);
  MAGIC.forEach((b, i) => u8[i] = b);
  dv.setUint16(4, 1, true); dv.setUint16(6, u32 ? 1 : 0, true);
  dv.setUint32(8, Nv, true); dv.setUint32(12, I, true);
  dv.setUint32(16, posOffset, true); dv.setUint32(20, nrmOffset, true); dv.setUint32(24, uvOffset, true);
  dv.setUint32(28, skinOffset, true); dv.setUint32(32, indexOffset, true); dv.setUint32(36, byteLength, true);
  verts.forEach((v, i) => {
    for (let a = 0; a < 3; a++) dv.setUint16(posOffset + 6 * i + 2 * a, v.pos[a], true);
    u8[nrmOffset + 2 * i] = v.nrm[0]; u8[nrmOffset + 2 * i + 1] = v.nrm[1];
    dv.setUint16(uvOffset + 4 * i, v.uv[0], true); dv.setUint16(uvOffset + 4 * i + 2, v.uv[1], true);
    for (let a = 0; a < 4; a++) u8[skinOffset + 4 * i + a] = v.sk[a];
  });
  idx.forEach((v, i) => { if (u32) dv.setUint32(indexOffset + 4 * i, v, true); else dv.setUint16(indexOffset + 2 * i, v, true); });

  // Bounds and radius from what the GPU will actually see (dequantised), so decode == manifest by construction.
  const bmn = [Infinity, Infinity, Infinity], bmx = [-Infinity, -Infinity, -Infinity]; let radiusXZ = 0;
  for (const v of verts) {
    const p = v.pos.map((q, a) => posMin[a] + q / 65535 * posRange[a]);
    for (let a = 0; a < 3; a++) { if (p[a] < bmn[a]) bmn[a] = p[a]; if (p[a] > bmx[a]) bmx[a] = p[a]; }
    radiusXZ = Math.max(radiusXZ, Math.hypot(p[0], p[2]));
  }
  const boneCounts = new Array(8).fill(0); for (const v of verts) boneCounts[v.sk[0]]++;
  return { buf: Buffer.from(buf), N: Nv, I, indexType: u32 ? 'u32' : 'u16', draws, dropped, boneCounts, bounds: { min: bmn, max: bmx }, radiusXZ, quant: { posMin, posRange, uvMin, uvRange } };
}

/** Decode a .bin the way the renderer will (used by validate and the debug raster, so they test the real format). */
export function decodeBin(buf, quant) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const dv = new DataView(ab); const u8 = new Uint8Array(ab);
  const hdr = {
    magic: String.fromCharCode(u8[0], u8[1], u8[2], u8[3]), version: dv.getUint16(4, true), flags: dv.getUint16(6, true),
    N: dv.getUint32(8, true), I: dv.getUint32(12, true), posOffset: dv.getUint32(16, true), nrmOffset: dv.getUint32(20, true),
    uvOffset: dv.getUint32(24, true), skinOffset: dv.getUint32(28, true), indexOffset: dv.getUint32(32, true),
    byteLength: dv.getUint32(36, true), reserved0: dv.getUint32(40, true), reserved1: dv.getUint32(44, true),
  };
  const out = { hdr };
  if (hdr.magic !== 'MRHA' || hdr.N * 16 + 48 > ab.byteLength) return out; // validate reports the details
  const { N, I } = hdr; const u32 = (hdr.flags & 1) === 1;
  out.pos = new Float64Array(3 * N); out.nrm = new Float64Array(3 * N); out.uv = new Float64Array(2 * N);
  out.bone = new Uint8Array(N); out.parent = new Uint8Array(N); out.weight = new Uint8Array(N); out.phase = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    for (let a = 0; a < 3; a++) out.pos[3 * i + a] = quant.posMin[a] + dv.getUint16(hdr.posOffset + 6 * i + 2 * a, true) / 65535 * quant.posRange[a];
    const n = octDecode(u8[hdr.nrmOffset + 2 * i], u8[hdr.nrmOffset + 2 * i + 1]); out.nrm[3 * i] = n[0]; out.nrm[3 * i + 1] = n[1]; out.nrm[3 * i + 2] = n[2];
    for (let a = 0; a < 2; a++) out.uv[2 * i + a] = quant.uvMin[a] + dv.getUint16(hdr.uvOffset + 4 * i + 2 * a, true) / 65535 * quant.uvRange[a];
    out.bone[i] = u8[hdr.skinOffset + 4 * i]; out.parent[i] = u8[hdr.skinOffset + 4 * i + 1]; out.weight[i] = u8[hdr.skinOffset + 4 * i + 2]; out.phase[i] = u8[hdr.skinOffset + 4 * i + 3];
  }
  out.idx = new Uint32Array(I);
  if (hdr.indexOffset + I * (u32 ? 4 : 2) <= ab.byteLength) for (let i = 0; i < I; i++) out.idx[i] = u32 ? dv.getUint32(hdr.indexOffset + 4 * i, true) : dv.getUint16(hdr.indexOffset + 2 * i, true);
  return out;
}
