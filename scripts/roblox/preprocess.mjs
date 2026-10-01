// npm run roblox:build  -  assets-src/roblox -> public/roblox (SPEC sections 2-4).
// Usage: node scripts/roblox/preprocess.mjs [--src assets-src/roblox] [--out public/roblox]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import sharp from 'sharp';
import { ROOT, h8, sha256, writeAtomic, kb, round, fmt3, readJson, timer } from './lib/util.mjs';
import { parseMtl, parseObj } from './lib/parse.mjs';
import { buildMesh, canonicalize, bboxOf } from './lib/mesh.mjs';
import { classify, BONE_NAMES, BONE_PARENT } from './lib/rig.mjs';
import { resolveTexture, processTexture, meanGreen, meanAbsDiff } from './lib/textures.mjs';
import { encodeBin, decodeBin } from './lib/bin.mjs';
import { writeRigDebug } from './lib/raster.mjs';
import { EXPECT } from './lib/expect.mjs';

const arg = (name, def) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; };
const SRC = path.resolve(ROOT, arg('--src', 'assets-src/roblox'));
const OUT = path.resolve(ROOT, arg('--out', 'public/roblox'));
const CONFIG = path.resolve(ROOT, arg('--config', 'scripts/roblox/avatar.config.json'));
const DBG = path.join(ROOT, arg('--debug', 'scripts/roblox/out'));
const warnings = [];
const log = { warn: (m) => { warnings.push(m); console.warn('WARN ' + m); } };
const T = timer();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

async function main() {
  const cfg = readJson(CONFIG);
  const meta = fs.existsSync(path.join(SRC, 'meta.json')) ? readJson(path.join(SRC, 'meta.json')) : {};
  const mtls = parseMtl(fs.readFileSync(path.join(SRC, 'avatar.mtl'), 'utf8'));
  const mesh = buildMesh(parseObj(fs.readFileSync(path.join(SRC, 'avatar.obj'), 'utf8')));
  canonicalize(mesh);
  T.lap('parse');

  // ---------- fingerprint ----------
  const totalTris = mesh.groups.reduce((s, g) => s + g.tris.length / 3, 0);
  const fpMatch = totalTris === cfg.fingerprint?.triangles && mesh.groups.length === cfg.fingerprint?.groups;
  console.log(`source: ${totalTris} tris, ${mesh.groups.length} groups, ${mesh.nCorners} source vertices; fingerprint ${fpMatch ? 'MATCHES' : 'DIFFERS'} (${cfg.fingerprint?.triangles}/${cfg.fingerprint?.groups})`);
  if (!fpMatch) log.warn('source fingerprint differs from avatar.config.json: a refreshed outfit. Config entries whose expectTris no longer match are ignored; SPEC 4.5 defaults apply.');

  // ---------- rig ----------
  const rig = classify(mesh, cfg, log);
  const { skin, lm, pivots } = rig;
  T.lap('classify');

  // ---------- materials ----------
  const mtlTris = new Map(); for (const g of mesh.groups) mtlTris.set(g.mtl, (mtlTris.get(g.mtl) || 0) + g.tris.length / 3);
  const cands = []; // one per OBJ material (in order of first use)
  for (const [mtlName, tris] of mtlTris) {
    const m = mtls.get(mtlName);
    if (!m) { log.warn(`OBJ uses material ${mtlName} which is not in the MTL; using flat grey`); }
    const entry = cfg.materials?.[mtlName];
    const entryOk = !!entry && entry.expectTris === tris;
    if (entry && !entryOk) log.warn(`${mtlName}: config expects ${entry.expectTris} tris, found ${tris}; ignoring its config entry (defaults apply)`);
    const mm = m || { name: mtlName, kd: [0.5, 0.5, 0.5] };
    const isBody = mesh.groups.some((g) => g.isPlayer && g.mtl === mtlName);
    const flatten = isBody || mm.alphaMode === 'overlay';
    const pbr = !!(mm.mapNs || mm.mapBump);
    const file = resolveTexture(SRC, mm.mapKd);
    if (mm.mapKd && !file) log.warn(`${mtlName}: texture ${mm.mapKd} not found in ${rel(SRC)}; using flat Kd`);
    if (mm.mapD && mm.mapKd && mm.mapD !== mm.mapKd) log.warn(`${mtlName}: map_d differs from map_Kd; alpha is taken from map_Kd only`);
    let gloss;
    if (entryOk && entry.gloss !== undefined) gloss = entry.gloss;
    else if (pbr && mm.mapNs && resolveTexture(SRC, mm.mapNs)) gloss = clamp((1 - (await meanGreen(resolveTexture(SRC, mm.mapNs))) / 255) * 0.85, 0.05, 0.9);
    else gloss = 0.3;
    const tex = file
      ? await processTexture(file, { flatten, kd: mm.kd, size: entryOk ? entry.size : undefined, encode: entryOk ? entry.encode : undefined })
      : { solid: mm.kd, srcSize: [0, 0], hasAlpha: false };
    cands.push({
      mtl: mtlName, name: (entryOk && entry.name) || mtlName.replace(/Mtl$/, '').toLowerCase(), tris, tex, flatten, file: file && path.basename(file),
      params: { cull: (entryOk && entry.cull) || 'back', gloss, spec: entryOk && entry.spec !== undefined ? entry.spec : 0.35, emissive: entryOk && entry.emissive !== undefined ? entry.emissive : 0 },
    });
  }
  const candOf = new Map(cands.map((c) => [c.mtl, c]));
  T.lap('textures');

  // Triangles per logical material. Handle7Mtl splits into wings + halo by face class (triHalo).
  const logical = []; // {key, name, kind:'lit'|'halo', cand, tris:[[gi,t]...]}
  const findOrAdd = (key, make) => { let l = logical.find((x) => x.key === key); if (!l) { l = make(); logical.push(l); } return l; };
  mesh.groups.forEach((g, gi) => {
    const c = candOf.get(g.mtl);
    for (let t = 0; t < g.tris.length / 3; t++) {
      const halo = rig.triHalo[gi][t] === 1;
      const key = c.mtl + (halo ? '#halo' : '');
      findOrAdd(key, () => ({ key, kind: halo ? 'halo' : 'lit', cand: c, tris: [] })).tris.push([gi, t]);
    }
  });

  // Merge materials with identical params and (near-)identical texture. The two shoe textures are the same image
  // with a mean abs diff of 0.42 (different encodes on Roblox's side), so byte equality would never fire; compare
  // the resized pixels instead and keep the first file.
  const finals = [];
  for (const l of logical) {
    if (l.kind === 'halo') { finals.push({ ...l, parts: [l] }); continue; }
    const p = l.cand.params, t = l.cand.tex;
    const twin = finals.find((f) => f.kind === 'lit' && sameMaterial(f.cand, l.cand));
    if (twin) { twin.tris.push(...l.tris); twin.parts.push(l); continue; }
    finals.push({ ...l, parts: [l] });
  }
  function sameMaterial(a, b) {
    const pa = a.params, pb = b.params;
    if (pa.cull !== pb.cull || pa.gloss !== pb.gloss || pa.spec !== pb.spec || pa.emissive !== pb.emissive) return false;
    const ta = a.tex, tb = b.tex;
    if (!!ta.solid !== !!tb.solid) return false;
    if (ta.solid) return ta.solid.every((v, i) => Math.abs(v - tb.solid[i]) <= 1 / 255);
    if (ta.hasAlpha !== tb.hasAlpha || ta.width !== tb.width || ta.height !== tb.height) return false;
    return ta.sha === tb.sha || meanAbsDiff(ta.pix, tb.pix) <= 1.0;
  }

  // Names must be unique (halo of a second parent, or two differently-tuned materials with the same name).
  const used = new Map();
  for (const f of finals) {
    let name = f.kind === 'halo' ? 'halo' : f.cand.name;
    const n = (used.get(name) || 0) + 1; used.set(name, n); if (n > 1) name += '-' + n;
    f.name = name;
  }

  // Draw order: opaque front-to-back (bbox-centre z descending, early-z), then additive. Stable on ties.
  for (const f of finals) { const cs = new Set(); for (const [gi, t] of f.tris) for (let k = 0; k < 3; k++) cs.add(mesh.groups[gi].tris[3 * t + k]); f.zc = bboxOf(mesh.P, [...cs]).ctr[2]; }
  const ordered = finals.map((f, i) => ({ f, i })).sort((a, b) => (a.f.kind === 'halo') - (b.f.kind === 'halo') || b.f.zc - a.f.zc || a.i - b.i).map((x) => x.f);

  // ---------- texture files (content-hashed, deduped by encoded bytes) ----------
  const texFiles = new Map(); // sha -> {name, bytes, w, h}
  const materials = ordered.map((f) => {
    const t = f.cand.tex; // a merged twin reuses the first part's file; halo reuses its parent's
    const lit = f.kind === 'lit';
    let ref = null;
    if (!t.solid) {
      const src = t;
      let e = texFiles.get(src.sha);
      if (!e) { e = { url: `tex/${f.name}.${src.sha.slice(0, 8)}.webp`, bytes: src.bytes, w: src.width, h: src.height }; texFiles.set(src.sha, e); }
      ref = { url: e.url, width: e.w, height: e.h, hasAlpha: !!src.hasAlpha };
    }
    return {
      name: f.name, texture: ref, color: t.solid ? t.solid.map((v) => round(v, 4)) : [1, 1, 1],
      shading: lit ? 'lit' : 'halo', pass: lit ? 'opaque' : 'additive', cull: lit ? f.cand.params.cull : 'none',
      alphaMode: ref && ref.hasAlpha ? 'mask' : 'opaque',
      gloss: lit ? f.cand.params.gloss : 0, spec: lit ? f.cand.params.spec : 0, emissive: lit ? f.cand.params.emissive : 0,
    };
  });
  const textureBytes = [...texFiles.values()].reduce((s, e) => s + e.bytes.length, 0);

  // ---------- geometry ----------
  const bin = encodeBin(mesh, skin, ordered.map((f) => f.tris));
  const binName = `avatar.${h8(bin.buf)}.bin`;
  T.lap('geometry');
  if (bin.dropped) console.log(`dropped ${bin.dropped} triangles that collapsed after quantise+weld`);

  // ---------- 2D fallback ----------
  const renderFile = path.join(SRC, 'render-720.png');
  if (!fs.existsSync(renderFile)) throw new Error(`${rel(renderFile)} is missing (run npm run roblox:fetch)`);
  const trimmed = await sharp(renderFile).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  console.log(`fallback: trimmed render ${trimmed.info.width}x${trimmed.info.height}`);
  const fallbackFiles = new Map(); const fallback = [];
  for (const [w, h] of [[150, 220], [300, 440]]) {
    const base = await sharp(trimmed.data).resize(w, h, { fit: 'contain', position: 'bottom', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
    const entry = { width: w, height: h };
    for (const [ext, fn] of [['avif', (s) => s.avif({ quality: 60 })], ['webp', (s) => s.webp({ quality: 82, alphaQuality: 90 })], ['png', (s) => s.png({ palette: true, quality: 90 })]]) {
      const name = `fallback/avatar-${w}x${h}.${ext}`;
      fallbackFiles.set(name, await fn(sharp(base)).toBuffer()); entry[ext] = name;
    }
    fallback.push(entry);
  }
  T.lap('fallback');

  // ---------- manifest ----------
  const boneDefs = BONE_NAMES.map((name, i) => ({ name, parent: BONE_PARENT[i], pivot: pivots[i].map((v) => round(v, 4)), vertexCount: bin.boneCounts[i] }));
  const binGz = zlib.gzipSync(bin.buf, { level: 9 });
  const binBr = zlib.brotliCompressSync(bin.buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: bin.buf.length } });
  const manifest = {
    format: 'mrh-avatar', version: 1, generatedAt: new Date().toISOString(),
    source: { userId: cfg.userId, objHash: meta.obj || '', mtlHash: meta.mtl || '' },
    space: 'canonical-v1',
    bounds: { min: bin.bounds.min.map((v) => round(v, 4)), max: bin.bounds.max.map((v) => round(v, 4)) },
    radiusXZ: round(bin.radiusXZ, 4),
    bin: { url: binName, byteLength: bin.buf.length, vertexCount: bin.N, indexCount: bin.I, indexType: bin.indexType },
    quant: bin.quant,
    bones: boneDefs, materials,
    draws: bin.draws.map((d, i) => ({ material: i, first: d.first, count: d.count })),
    fallback,
    stats: {
      vertexCount: bin.N, triangleCount: bin.I / 3, binBytes: bin.buf.length, binGzipBytes: binGz.length, binBrotliBytes: binBr.length,
      textureBytes, totalBytes: bin.buf.length + textureBytes, totalGzipBytes: binGz.length + textureBytes,
    },
  };

  // ---------- write: assets first (hashed names never collide), manifest LAST, then sweep stale files ----------
  for (const e of texFiles.values()) writeAtomic(path.join(OUT, e.url), e.bytes);
  writeAtomic(path.join(OUT, binName), bin.buf);
  for (const [name, bytes] of fallbackFiles) writeAtomic(path.join(OUT, name), bytes);
  writeAtomic(path.join(OUT, 'avatar.json'), JSON.stringify(manifest) + '\n');
  const keep = new Set(['avatar.json', binName, ...[...texFiles.values()].map((e) => e.url), ...fallbackFiles.keys()]);
  const removed = sweepStale(OUT, keep);
  T.lap('write');

  // ---------- debug: decode the file we just wrote and rasterise it ----------
  fs.mkdirSync(DBG, { recursive: true });
  const written = fs.readFileSync(path.join(OUT, binName));
  const dec = decodeBin(written, manifest.quant);
  await writeRigDebug(path.join(DBG, 'rig-debug.png'), dec, manifest);
  T.lap('debug');

  report({ mesh, rig, lm, cands, ordered, materials, manifest, bin, texFiles, fallbackFiles, binGz, binBr, fpMatch, removed, written: written.length });
}

/** Delete only OUR generated patterns that are no longer part of the set. */
function sweepStale(out, keep) {
  const removed = [];
  const list = (d) => (fs.existsSync(d) ? fs.readdirSync(d).map((f) => path.posix.join(path.relative(out, d).replace(/\\/g, '/'), f).replace(/^\//, '')) : []);
  const candidates = [...list(out).filter((f) => /^avatar\.[0-9a-f]{8}\.bin$/.test(f) || /\.tmp-\d+$/.test(f)), ...list(path.join(out, 'tex')), ...list(path.join(out, 'fallback'))];
  for (const f of candidates) if (!keep.has(f) && fs.statSync(path.join(out, f)).isFile()) { fs.unlinkSync(path.join(out, f)); removed.push(f); }
  return removed;
}

function report(r) {
  const { manifest: m, ordered, materials, rig } = r;
  const N = m.bin.vertexCount;
  console.log('\n== classification ==');
  for (const i of rig.info) console.log(`  ${i.group.padEnd(8)} ${String(i.tris).padStart(5)} tris  ${(i.mtl || '').padEnd(11)} -> ${i.bone.padEnd(14)} (${i.rule})`);
  console.log(`  landmarks: head=${rig.lm.headPart} neckY=${rig.lm.neckY.toFixed(3)} waistY=${rig.lm.waistY.toFixed(3)} chestY=${rig.lm.chestY.toFixed(3)} shoulderY=${rig.lm.shoulderY.toFixed(3)} feetY=${rig.lm.feetY.toFixed(3)}`);
  for (const [arm, s] of Object.entries(rig.sleeveStats)) console.log(`  ${arm}: islands ${JSON.stringify(s.islands)} seam ${s.seam} -> ${s.rigid} rigid + ${s.blended} blended source vertices`);

  console.log('\n== materials (draw order) ==');
  // vertex counts per draw come from the decoded index buffer
  const dec = decodeBin(fs.readFileSync(path.join(OUT, m.bin.url)), m.quant);
  const rows = [];
  materials.forEach((mt, i) => {
    const d = m.draws[i]; const set = new Set(); for (let k = d.first; k < d.first + d.count; k++) set.add(dec.idx[k]);
    const texBytes = mt.texture ? [...r.texFiles.values()].find((e) => e.url === mt.texture.url).bytes.length : 0;
    rows.push({ name: mt.name, tris: d.count / 3, verts: set.size, tex: mt.texture ? `${mt.texture.width}x${mt.texture.height}` : `flat ${mt.color.join(',')}`, bytes: texBytes, cull: mt.cull, pass: mt.pass, gloss: mt.gloss, spec: mt.spec, emissive: mt.emissive, file: mt.texture?.url });
    const exp = EXPECT.tris[mt.name];
    console.log(`  ${String(i).padStart(2)} ${mt.name.padEnd(8)} ${String(d.count / 3).padStart(5)} tris ${String(set.size).padStart(5)} verts  ${(mt.texture ? `${mt.texture.width}x${mt.texture.height}` : 'flat color').padEnd(10)} ${String(texBytes).padStart(6)} B  ${mt.cull.padEnd(4)} ${mt.pass}${exp !== undefined ? (exp === d.count / 3 ? '  [= SPEC]' : `  [SPEC ${exp}]`) : ''}`);
  });
  console.log(`  ${materials.length} materials, ${m.draws.length} draws, ${r.texFiles.size} unique texture files`);

  console.log('\n== bones ==');
  m.bones.forEach((b, i) => {
    const e = EXPECT.pivots[b.name]; const dmax = Math.max(...b.pivot.map((v, k) => Math.abs(v - e[k])));
    console.log(`  ${String(i)} ${b.name.padEnd(6)} parent ${String(b.parent).padStart(2)}  verts ${String(b.vertexCount).padStart(5)}  pivot ${fmt3(b.pivot)}  SPEC ${fmt3(e)}  d=${dmax.toFixed(4)} ${dmax <= EXPECT.pivotTol ? 'ok' : 'OUT OF TOLERANCE'}`);
  });

  console.log('\n== geometry ==');
  console.log(`  N=${N} I=${m.bin.indexCount} (${m.bin.indexCount / 3} tris) ${m.bin.indexType}; SPEC N~${EXPECT.vertexCount} I~${EXPECT.indexCount}`);
  console.log(`  bounds ${fmt3(m.bounds.min)} .. ${fmt3(m.bounds.max)}  radiusXZ ${m.radiusXZ}  (SPEC ${fmt3(EXPECT.bounds.min)} .. ${fmt3(EXPECT.bounds.max)}, ${EXPECT.radiusXZ})`);
  const s = m.stats;
  console.log('\n== payload ==');
  console.log(`  bin ${kb(s.binBytes)} raw / ${kb(s.binGzipBytes)} gzip / ${kb(s.binBrotliBytes)} brotli`);
  console.log(`  textures ${kb(s.textureBytes)}   total ${kb(s.totalBytes)} raw / ${kb(s.totalGzipBytes)} with gzip bin   manifest ${kb(fs.statSync(path.join(OUT, 'avatar.json')).size)}`);
  for (const [name, b] of r.fallbackFiles) console.log(`  ${name} ${kb(b.length)}`);
  if (r.removed.length) console.log(`  removed stale: ${r.removed.join(', ')}`);
  console.log(`\n== timings (ms) == ${JSON.stringify(T.laps)} total ${T.total()}`);
  if (warnings.length) console.log(`\n${warnings.length} warning(s)`);

  fs.writeFileSync(path.join(DBG, 'report.json'), JSON.stringify({
    generatedAt: m.generatedAt, fingerprintMatch: r.fpMatch, landmarks: rig.lm, groups: rig.info, sleeves: rig.sleeveStats,
    materials: rows, bones: m.bones, bounds: m.bounds, radiusXZ: m.radiusXZ, N, I: m.bin.indexCount, payload: m.stats, timingsMs: { ...T.laps, total: T.total() }, warnings,
  }, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
