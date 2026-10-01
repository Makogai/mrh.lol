// Texture resolution, flattening, resizing and WebP encoding (SPEC 3.3).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { sha256 } from './util.mjs';

/** Texture refs in the MTL are bare hashes: try <hash>.png, <hash>.jpg, then the bare name. */
export function resolveTexture(dir, ref) {
  if (!ref) return null;
  for (const cand of [ref + '.png', ref + '.jpg', ref + '.jpeg', ref]) {
    const f = path.join(dir, cand);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

const nearestPot = (n, cap) => { let p = 1; while (p * 2 <= Math.min(n, cap) * 1.4142) p *= 2; return Math.min(p, cap); };

/** Default output size when config has none: nearest power of two of the source, capped at 512 (SPEC 4.5). */
export function defaultSize(w, h) { return [nearestPot(w, 512), nearestPot(h, 512)]; }

const isPot = (n) => n > 0 && (n & (n - 1)) === 0;

/**
 * @param {string} file source image
 * @param {{flatten: boolean, kd: number[], size?: number[], encode?: 'lossless'|number}} o
 * @returns decoded+encoded result. `solid` is set (and `bytes` null) when every texel is one colour.
 */
export async function processTexture(file, o) {
  const src = sharp(file);
  const meta = await src.metadata();
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let low = 0; const n = info.width * info.height;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) low++;
  const realAlpha = low / n > 0.005;
  // Roblox semantics: the colour map blends over the part colour (Kd). That is what overlay materials mean, and
  // it is also how the body composite's empty (alpha 0) texels turn into skin colour. Only a non-overlay material
  // with real transparency keeps its alpha (-> alphaMode 'mask').
  const mask = !o.flatten && realAlpha;
  const kd = o.kd.map((c) => Math.round(c * 255));
  let rgb;
  if (mask) rgb = data;
  else {
    rgb = Buffer.alloc(n * 3);
    for (let i = 0; i < n; i++) {
      const a = data[4 * i + 3] / 255;
      for (let k = 0; k < 3; k++) rgb[3 * i + k] = Math.round(data[4 * i + k] * a + kd[k] * (1 - a));
    }
  }
  const ch = mask ? 4 : 3;
  // Solid colour (+-2 on every channel) -> no texture at all, just a colour uniform.
  if (!mask) {
    const mn = [255, 255, 255], mx = [0, 0, 0], sum = [0, 0, 0];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = rgb[3 * i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; sum[k] += v; }
    if ([0, 1, 2].every((k) => mx[k] - mn[k] <= 2)) {
      return { solid: [0, 1, 2].map((k) => Math.round(sum[k] / n) / 255), srcSize: [info.width, info.height], hasAlpha: false, realAlpha, srcFormat: meta.format };
    }
  }
  let [w, h] = o.size || defaultSize(info.width, info.height);
  if (o.cap) { w = Math.min(w, o.cap); h = Math.min(h, o.cap); } // squad LOD: phone packs cap textures at 128
  if (!isPot(w) || !isPot(h)) throw new Error(`${path.basename(file)}: output size ${w}x${h} is not a power of two`);
  // fit 'fill': UVs are normalised, so a non-uniform resize of a non-square atlas is exactly right.
  let pix = rgb, pw = info.width, ph = info.height;
  if (w !== pw || h !== ph) {
    pix = await sharp(rgb, { raw: { width: pw, height: ph, channels: ch } }).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer();
    pw = w; ph = h;
  }
  const enc = o.encode === undefined ? 85 : o.encode;
  const webp = enc === 'lossless' ? { lossless: true, effort: 6 } : { quality: enc, smartSubsample: true, effort: 6, alphaQuality: 100 };
  const bytes = await sharp(pix, { raw: { width: pw, height: ph, channels: ch } }).webp(webp).toBuffer();
  return { solid: null, bytes, sha: sha256(bytes), pix, width: pw, height: ph, channels: ch, hasAlpha: mask, realAlpha, srcSize: [info.width, info.height], srcFormat: meta.format, enc };
}

/** Mean of a PBR map's G channel (packed R = metalness, G = roughness). Used only for default gloss. */
export async function meanGreen(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let s = 0; const n = info.width * info.height;
  for (let i = 0; i < n; i++) s += data[3 * i + 1];
  return s / n;
}

/** Mean absolute difference between two same-sized raw buffers (0..255). */
export function meanAbsDiff(a, b) {
  if (a.length !== b.length) return Infinity;
  let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}
