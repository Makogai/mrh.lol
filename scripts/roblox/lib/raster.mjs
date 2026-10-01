// Software rasteriser for scripts/roblox/out/rig-debug.png. It renders from the DECODED .bin (not from the OBJ), so the
// picture doubles as an end-to-end test of the binary format, the skin block and the SPEC 5.2 angle-weighted math.
import sharp from 'sharp';

export const BONE_COL = [[90, 90, 110], [70, 120, 200], [200, 200, 200], [255, 194, 71], [62, 224, 208], [200, 120, 60], [60, 160, 150], [167, 139, 250]];

const qAxis = (ax, ang) => { const s = Math.sin(ang / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)]; };
const qrot = (q, v) => {
  const [x, y, z, w] = q; const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
  return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
};
// SPEC 5.2: a blended vertex turns by nlerp(identity, q, w) about the bone pivot, so it keeps its distance from the pivot.
const nlerp = (q, w) => { const r = [q[0] * w, q[1] * w, q[2] * w, 1 - w + q[3] * w]; const l = Math.hypot(...r); return r.map((x) => x / l); };

/** Raise armR by `deg` (SPEC 2: armR abduction is R_z(-a) about the armR pivot). */
export function poseArmR(dec, bones, deg) {
  const N = dec.bone.length; const P = Float64Array.from(dec.pos), Nr = Float64Array.from(dec.nrm);
  if (!deg) return { P, N: Nr };
  const q = qAxis([0, 0, 1], -deg * Math.PI / 180); const pv = bones[3].pivot;
  for (let i = 0; i < N; i++) {
    if (dec.bone[i] !== 3) continue;
    const w = dec.weight[i] / 255; const qq = dec.weight[i] === 255 ? q : nlerp(q, w);
    const r = qrot(qq, [P[3 * i] - pv[0], P[3 * i + 1] - pv[1], P[3 * i + 2] - pv[2]]);
    P[3 * i] = r[0] + pv[0]; P[3 * i + 1] = r[1] + pv[1]; P[3 * i + 2] = r[2] + pv[2];
    const n = qrot(qq, [Nr[3 * i], Nr[3 * i + 1], Nr[3 * i + 2]]); Nr[3 * i] = n[0]; Nr[3 * i + 1] = n[1]; Nr[3 * i + 2] = n[2];
  }
  return { P, N: Nr };
}

export function makeFramebuffer(W, H, bg = [244, 246, 250]) {
  const img = Buffer.alloc(W * H * 4); for (let i = 0; i < W * H; i++) { img[4 * i] = bg[0]; img[4 * i + 1] = bg[1]; img[4 * i + 2] = bg[2]; img[4 * i + 3] = 255; }
  return { W, H, img, zb: new Float32Array(W * H).fill(-1e9) };
}

/**
 * Draw one view into rect {x0,y0,w,h}. view 'front' looks down -Z from +Z (avatar's left is screen-right);
 * view 'side' looks along +X from -X, so the avatar faces screen-right and its right (amber) arm is nearest.
 */
export function drawView(fb, rect, dec, manifest, posed, view, scale) {
  const { P, N: Nr } = posed; const bones = manifest.bones;
  const haloVerts = new Uint8Array(dec.bone.length);
  const skip = new Uint8Array(dec.idx.length / 3);
  for (const d of manifest.draws) if (manifest.materials[d.material].shading === 'halo') for (let t = d.first / 3; t < (d.first + d.count) / 3; t++) skip[t] = 1;
  const b = manifest.bounds;
  const ox = rect.x0 + rect.w / 2, oy = rect.y0 + rect.h - 40;
  const zc = (b.min[2] + b.max[2]) / 2;
  const proj = (i) => view === 'front'
    ? [ox + P[3 * i] * scale, oy - P[3 * i + 1] * scale, P[3 * i + 2]]
    : [ox + (P[3 * i + 2] - zc) * scale, oy - P[3 * i + 1] * scale, -P[3 * i]];
  const nview = (i) => (view === 'front' ? Nr[3 * i + 2] : -Nr[3 * i]);
  const { W, H, img, zb } = fb;
  const cx0 = Math.max(0, rect.x0), cx1 = Math.min(W - 1, rect.x0 + rect.w - 1), cy0 = Math.max(0, rect.y0), cy1 = Math.min(H - 1, rect.y0 + rect.h - 1);
  for (let t = 0; t < dec.idx.length / 3; t++) {
    if (skip[t]) continue;
    const ia = dec.idx[3 * t], ib = dec.idx[3 * t + 1], ic = dec.idx[3 * t + 2];
    const p = [proj(ia), proj(ib), proj(ic)];
    const ar = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1]); if (Math.abs(ar) < 1e-9) continue;
    const x0 = Math.max(cx0, Math.floor(Math.min(p[0][0], p[1][0], p[2][0]))), x1 = Math.min(cx1, Math.ceil(Math.max(p[0][0], p[1][0], p[2][0])));
    const y0 = Math.max(cy0, Math.floor(Math.min(p[0][1], p[1][1], p[2][1]))), y1 = Math.min(cy1, Math.ceil(Math.max(p[0][1], p[1][1], p[2][1])));
    const bn = dec.bone[ia]; const base = BONE_COL[bn];
    const wa = dec.weight[ia] / 255, wb = dec.weight[ib] / 255, wc = dec.weight[ic] / 255;
    const na = nview(ia), nb = nview(ib), nc = nview(ic);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((p[1][0] - px) * (p[2][1] - py) - (p[2][0] - px) * (p[1][1] - py)) / ar;
      const w1 = ((p[2][0] - px) * (p[0][1] - py) - (p[0][0] - px) * (p[2][1] - py)) / ar, w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * p[0][2] + w1 * p[1][2] + w2 * p[2][2]; const k = y * W + x; if (z <= zb[k]) continue; zb[k] = z;
      const sh = 0.35 + 0.65 * Math.min(1, Math.abs(w0 * na + w1 * nb + w2 * nc));
      let c = base;
      const wv = w0 * wa + w1 * wb + w2 * wc;
      if (wv < 0.999 && (bn === 3 || bn === 4)) c = [255 * (1 - wv) + base[0] * wv, 40 * (1 - wv) + base[1] * wv, 40 * (1 - wv) + base[2] * wv]; // red = blended
      img[4 * k] = c[0] * sh; img[4 * k + 1] = c[1] * sh; img[4 * k + 2] = c[2] * sh; img[4 * k + 3] = 255;
    }
  }
  // pivots as dots: black ring, bone-coloured core
  bones.forEach((bone, bi) => {
    const pv = view === 'front' ? [ox + bone.pivot[0] * scale, oy - bone.pivot[1] * scale] : [ox + (bone.pivot[2] - zc) * scale, oy - bone.pivot[1] * scale];
    for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
      const d = Math.hypot(dx, dy); if (d > 7) continue;
      const x = Math.round(pv[0]) + dx, y = Math.round(pv[1]) + dy; if (x < cx0 || x > cx1 || y < cy0 || y > cy1) continue;
      const c = d > 5 ? [10, 10, 14] : BONE_COL[bi]; const k = y * W + x; img[4 * k] = c[0]; img[4 * k + 1] = c[1]; img[4 * k + 2] = c[2];
    }
  });
}

export async function writeRigDebug(file, dec, manifest) {
  const S = 100, PW = 640, PH = 820;
  const fb = makeFramebuffer(PW * 3, PH);
  const rest = poseArmR(dec, manifest.bones, 0), wave = poseArmR(dec, manifest.bones, 140);
  drawView(fb, { x0: 0, y0: 0, w: PW, h: PH }, dec, manifest, rest, 'front', S);
  drawView(fb, { x0: PW, y0: 0, w: PW, h: PH }, dec, manifest, rest, 'side', S);
  drawView(fb, { x0: 2 * PW, y0: 0, w: PW, h: PH }, dec, manifest, wave, 'front', S);
  const label = (x, t) => `<text x="${x + 16}" y="30" font-family="Arial, sans-serif" font-size="20" fill="#333">${t}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PW * 3}" height="${PH}">${label(0, 'front, rest (amber = armR, teal = armL, red = blended)')}${label(PW, 'side, rest (dots = bone pivots)')}${label(2 * PW, 'armR raised 140 deg (SPEC 5.2 angle-weighted)')}</svg>`;
  const base = await sharp(fb.img, { raw: { width: fb.W, height: fb.H, channels: 4 } }).composite([{ input: Buffer.from(svg) }]).png({ compressionLevel: 9 }).toBuffer();
  const fs = await import('node:fs'); fs.writeFileSync(file, base);
}
