// npm run roblox:check  -  validates public/roblox against SPEC 3 (hard) and SPEC 3.2/4 expectations (when the
// source fingerprint matches this avatar; warnings otherwise). Exit code 1 on any hard failure.
// Usage: node scripts/roblox/validate.mjs [--out public/roblox]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import sharp from 'sharp';
import { ROOT, sha256, kb, readJson, fmt3 } from './lib/util.mjs';
import { decodeBin, HEADER_BYTES } from './lib/bin.mjs';
import { parseObj } from './lib/parse.mjs';
import { BONE_NAMES, BONE_PARENT } from './lib/rig.mjs';
import { EXPECT } from './lib/expect.mjs';

const i = process.argv.indexOf('--out');
const OUT = path.resolve(ROOT, i >= 0 ? process.argv[i + 1] : 'public/roblox');
const SRC = path.join(ROOT, 'assets-src/roblox');
const ci = process.argv.indexOf('--config');
const CONFIG = path.resolve(ROOT, ci >= 0 ? process.argv[ci + 1] : 'scripts/roblox/avatar.config.json');
let failures = 0, warnings = 0, passed = 0;
const fail = (name, detail = '') => { failures++; console.log(`  FAIL  ${name}${detail ? ' :: ' + detail : ''}`); };
const warn = (name, detail = '') => { warnings++; console.log(`  warn  ${name}${detail ? ' :: ' + detail : ''}`); };
const ok = () => { passed++; };
const check = (name, cond, detail) => (cond ? ok() : fail(name, detail));
let strict = false; // SPEC 3.2 expectations: hard only when the fingerprint matches
const expectThat = (name, cond, detail) => (cond ? ok() : strict ? fail('SPEC ' + name, detail) : warn('SPEC ' + name + ' (outfit differs)', detail));
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const nearV = (a, b, tol) => a.length === b.length && a.every((v, k) => near(v, b[k], tol));
const isPot = (n) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
const readOrNull = (f) => (fs.existsSync(f) ? fs.readFileSync(f) : null);

async function main() {
  console.log(`validating ${path.relative(ROOT, OUT).replace(/\\/g, '/')}`);
  const mf = path.join(OUT, 'avatar.json');
  if (!fs.existsSync(mf)) { fail('avatar.json exists'); return; }
  const m = readJson(mf);

  console.log('\n[manifest]');
  check('format/version/space', m.format === 'mrh-avatar' && m.version === 1 && m.space === 'canonical-v1');
  check('bones: exactly 8 in BONE_NAMES order', Array.isArray(m.bones) && m.bones.length === 8 && m.bones.every((b, k) => b.name === BONE_NAMES[k]));
  check('bones: fixed parents', m.bones.every((b, k) => b.parent === BONE_PARENT[k]), m.bones.map((b) => b.parent).join());
  check('bones: pivots finite', m.bones.every((b) => b.pivot.length === 3 && b.pivot.every(Number.isFinite)));
  check('materials: names unique', new Set(m.materials.map((x) => x.name)).size === m.materials.length);
  check('fallback ascending width', m.fallback.every((f, k) => k === 0 || f.width > m.fallback[k - 1].width));

  console.log('\n[bin]');
  const binFile = path.join(OUT, m.bin.url);
  const buf = readOrNull(binFile);
  if (!buf) { fail('bin file exists', m.bin.url); return; }
  const h = sha256(buf).slice(0, 8);
  check('bin name is avatar.<sha256[0:8]>.bin', m.bin.url === `avatar.${h}.bin`, `${m.bin.url} vs ${h}`);
  const dec = decodeBin(buf, m.quant);
  const H = dec.hdr; const failuresBefore = failures; const u32 = (H.flags & 1) === 1; const isz = u32 ? 4 : 2;
  check('header: magic MRHA, version 1, only flag bit0', H.magic === 'MRHA' && H.version === 1 && (H.flags & ~1) === 0, JSON.stringify(H));
  check('header: N, I match manifest', H.N === m.bin.vertexCount && H.I === m.bin.indexCount, `${H.N}/${H.I} vs ${m.bin.vertexCount}/${m.bin.indexCount}`);
  check('header: indexType matches flag', m.bin.indexType === (u32 ? 'u32' : 'u16'));
  check('header: u32 only when N >= 65536', u32 === (H.N >= 65536));
  check('header: I multiple of 3', H.I % 3 === 0);
  check('header: offsets', H.posOffset === 48 && H.nrmOffset === 48 + 6 * H.N && H.uvOffset === 48 + 8 * H.N && H.skinOffset === 48 + 12 * H.N && H.indexOffset === 48 + 16 * H.N);
  const wantLen = (H.indexOffset + H.I * isz + 3) & ~3;
  check('header: byteLength == file size == manifest == formula', H.byteLength === buf.length && m.bin.byteLength === buf.length && wantLen === buf.length, `${H.byteLength}/${buf.length}/${m.bin.byteLength}/${wantLen}`);
  check('header: reserved words zero, padding zero', H.reserved0 === 0 && H.reserved1 === 0 && buf.subarray(H.indexOffset + H.I * isz).every((b) => b === 0));
  if (failures > failuresBefore) { console.log('\nheader is broken; stopping before decode-dependent checks'); return; }

  let maxIdx = 0, badTri = 0; const refd = new Uint8Array(H.N);
  for (let k = 0; k < H.I; k++) { const v = dec.idx[k]; if (v > maxIdx) maxIdx = v; if (v < H.N) refd[v] = 1; }
  for (let t = 0; t < H.I; t += 3) if (dec.idx[t] === dec.idx[t + 1] || dec.idx[t + 1] === dec.idx[t + 2] || dec.idx[t] === dec.idx[t + 2]) badTri++;
  check('indices < N', maxIdx < H.N, `max ${maxIdx}`);
  check('no degenerate triangles', badTri === 0, `${badTri}`);
  const unref = refd.reduce((s, x) => s + (1 - x), 0);
  check('every vertex referenced', unref === 0, `${unref} unreferenced`);

  // skin
  let badBone = 0, badParent = 0, badRigid = 0, blended = 0;
  const boneCount = new Array(8).fill(0);
  for (let v = 0; v < H.N; v++) {
    const b = dec.bone[v], p = dec.parent[v], w = dec.weight[v];
    if (b > 7) { badBone++; continue; }
    boneCount[b]++;
    if (w === 255) { if (p !== b) badRigid++; } else if (w === 0) badRigid++; else { blended++; if (p !== m.bones[b].parent) badParent++; }
  }
  check('skin: bone ids 0..7', badBone === 0, `${badBone}`);
  check('skin: rigid parent == bone, weight != 0', badRigid === 0, `${badRigid}`);
  check('skin: blended parent == bones[bone].parent', badParent === 0, `${badParent}`);
  check('bones[].vertexCount == decoded counts', m.bones.every((b, k) => b.vertexCount === boneCount[k]), `${boneCount.join()} vs ${m.bones.map((b) => b.vertexCount).join()}`);

  // draws
  console.log('\n[draws / materials]');
  let cursor = 0, tileOk = true; const matUse = new Array(m.materials.length).fill(0);
  for (const d of m.draws) { if (d.first !== cursor || d.count % 3 !== 0 || d.count <= 0 || !m.materials[d.material]) tileOk = false; matUse[d.material]++; cursor = d.first + d.count; }
  check('draws tile [0, I) exactly', tileOk && cursor === H.I, `end ${cursor} vs ${H.I}`);
  check('each material has exactly one draw', matUse.every((n) => n === 1), matUse.join());
  let seenAdd = false, orderOk = true;
  for (const d of m.draws) { const add = m.materials[d.material].pass === 'additive'; if (seenAdd && !add) orderOk = false; if (add) seenAdd = true; }
  check('draw order: opaque first, additive last', orderOk);
  check('material flags consistent', m.materials.every((x) => (x.shading === 'halo') === (x.pass === 'additive') && ['back', 'none'].includes(x.cull) && ['opaque', 'mask'].includes(x.alphaMode) && x.gloss >= 0 && x.gloss <= 1 && x.spec >= 0 && x.spec <= 1 && x.emissive >= 0 && x.color.length === 3));

  // phase only on halo draws; halo vertices on torso
  const haloV = new Uint8Array(H.N), otherV = new Uint8Array(H.N);
  for (const d of m.draws) { const halo = m.materials[d.material].shading === 'halo'; for (let k = d.first; k < d.first + d.count; k++) (halo ? haloV : otherV)[dec.idx[k]] = 1; }
  let sharedHalo = 0, phaseBad = 0;
  for (let v = 0; v < H.N; v++) { if (haloV[v] && otherV[v]) sharedHalo++; if (haloV[v] ? dec.phase[v] === 0 : dec.phase[v] !== 0) phaseBad++; }
  check('halo vertices are not shared with lit draws', sharedHalo === 0, `${sharedHalo}`);
  check('phase: 1..255 on halo vertices, 0 elsewhere', phaseBad === 0, `${phaseBad}`);

  // textures
  const seenTex = new Map();
  for (const mt of m.materials) {
    if (!mt.texture) continue;
    const t = mt.texture; const f = path.join(OUT, t.url); const b = readOrNull(f);
    if (!b) { fail(`texture exists: ${t.url}`); continue; }
    ok();
    const hh = sha256(b).slice(0, 8);
    check(`texture name hash: ${t.url}`, new RegExp(`\\.${hh}\\.webp$`).test(t.url));
    const meta = await sharp(b).metadata();
    check(`texture ${mt.name}: webp, ${t.width}x${t.height}, POT`, meta.format === 'webp' && meta.width === t.width && meta.height === t.height && isPot(t.width) && isPot(t.height), `${meta.format} ${meta.width}x${meta.height}`);
    check(`texture ${mt.name}: alpha only for mask`, (mt.alphaMode === 'mask') === (t.hasAlpha && !!meta.hasAlpha), `alphaMode ${mt.alphaMode} hasAlpha ${t.hasAlpha}/${meta.hasAlpha}`);
    seenTex.set(t.url, b.length);
  }
  const texBytes = [...seenTex.values()].reduce((s, n) => s + n, 0);
  const onDisk = fs.existsSync(path.join(OUT, 'tex')) ? fs.readdirSync(path.join(OUT, 'tex')) : [];
  check('tex/ contains exactly the referenced files', onDisk.length === seenTex.size && onDisk.every((f) => seenTex.has('tex/' + f)), `${onDisk.length} on disk, ${seenTex.size} referenced`);

  // fallback
  for (const f of m.fallback) for (const ext of ['avif', 'webp', 'png']) {
    const b = readOrNull(path.join(OUT, f[ext]));
    if (!b) { fail(`fallback exists: ${f[ext]}`); continue; }
    const meta = await sharp(b).metadata();
    check(`fallback ${f[ext]} is ${f.width}x${f.height} ${ext === 'avif' ? 'heif' : ext}`, meta.width === f.width && meta.height === f.height && meta.format === (ext === 'avif' ? 'heif' : ext), `${meta.format} ${meta.width}x${meta.height}`);
  }

  // geometry sanity: bounds, radius, normals, winding
  console.log('\n[geometry]');
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; let rad = 0, badN = 0;
  for (let v = 0; v < H.N; v++) {
    for (let a = 0; a < 3; a++) { const x = dec.pos[3 * v + a]; if (x < mn[a]) mn[a] = x; if (x > mx[a]) mx[a] = x; }
    rad = Math.max(rad, Math.hypot(dec.pos[3 * v], dec.pos[3 * v + 2]));
    if (Math.abs(Math.hypot(dec.nrm[3 * v], dec.nrm[3 * v + 1], dec.nrm[3 * v + 2]) - 1) > 0.01) badN++;
  }
  check('decoded bounds == manifest bounds (1e-3)', nearV(mn, m.bounds.min, 1e-3) && nearV(mx, m.bounds.max, 1e-3), `${fmt3(mn)} ${fmt3(mx)} vs ${fmt3(m.bounds.min)} ${fmt3(m.bounds.max)}`);
  check('radiusXZ == decoded (1e-3)', near(rad, m.radiusXZ, 1e-3), `${rad} vs ${m.radiusXZ}`);
  check('decoded normals are unit length', badN === 0, `${badN}`);
  check('feet on y=0', near(mn[1], 0, 1e-3));
  // CCW-front convention: geometric normal should agree with the vertex normal almost everywhere
  let agree = 0;
  for (let t = 0; t < H.I; t += 3) {
    const [a, b, c] = [dec.idx[t], dec.idx[t + 1], dec.idx[t + 2]]; const P = dec.pos;
    const e1 = [0, 1, 2].map((k) => P[3 * b + k] - P[3 * a + k]), e2 = [0, 1, 2].map((k) => P[3 * c + k] - P[3 * a + k]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const vn = [0, 1, 2].map((k) => dec.nrm[3 * a + k] + dec.nrm[3 * b + k] + dec.nrm[3 * c + k]);
    if (n[0] * vn[0] + n[1] * vn[1] + n[2] * vn[2] > 0) agree++;
  }
  const agreeFrac = agree / (H.I / 3);
  check('winding: >= 90 % of triangles are CCW w.r.t. their normals', agreeFrac >= 0.9, `${(agreeFrac * 100).toFixed(1)} %`);
  console.log(`  info: CCW agreement ${(agreeFrac * 100).toFixed(1)} %`);

  // stats
  console.log('\n[stats]');
  const gz = zlib.gzipSync(buf, { level: 9 }).length;
  const br = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }).length;
  const s = m.stats;
  check('stats: counts', s.vertexCount === H.N && s.triangleCount === H.I / 3 && s.binBytes === buf.length);
  check('stats: gzip/brotli reproduce', s.binGzipBytes === gz && s.binBrotliBytes === br, `${s.binGzipBytes}/${s.binBrotliBytes} vs ${gz}/${br}`);
  check('stats: texture and total bytes', s.textureBytes === texBytes && s.totalBytes === buf.length + texBytes && s.totalGzipBytes === gz + texBytes);
  check('payload <= ~600 KB raw', s.totalBytes <= 600 * 1024, kb(s.totalBytes));

  // ---------- SPEC expectations ----------
  console.log('\n[SPEC 3.2 / 4 expectations]');
  strict = detectFingerprint(m);
  console.log(`  source fingerprint ${strict ? 'MATCHES: expectations are hard' : 'differs: expectations are warnings'}`);
  const tris = Object.fromEntries(m.draws.map((d) => [m.materials[d.material].name, d.count / 3]));
  for (const [name, n] of Object.entries(EXPECT.tris)) expectThat(`tris ${name} == ${n}`, tris[name] === n, `got ${tris[name]}`);
  expectThat('11 materials, 11 draws', m.materials.length === EXPECT.materialCount && m.draws.length === EXPECT.drawCount, `${m.materials.length}/${m.draws.length}`);
  for (const [name, e] of Object.entries(EXPECT.materials)) {
    const mt = m.materials.find((x) => x.name === name); if (!mt) { expectThat(`material ${name} exists`, false); continue; }
    expectThat(`${name}: cull ${e.cull}`, mt.cull === e.cull, mt.cull);
    if ('texture' in e) expectThat(`${name}: no texture`, mt.texture === null);
    if (e.texW) expectThat(`${name}: texture ${e.texW}x${e.texH}`, mt.texture && mt.texture.width === e.texW && mt.texture.height === e.texH, mt.texture ? `${mt.texture.width}x${mt.texture.height}` : 'null');
    if (e.shading) expectThat(`${name}: ${e.shading}/${e.pass}`, mt.shading === e.shading && mt.pass === e.pass);
  }
  const shoes = m.materials.find((x) => x.name === 'shoes'), wings = m.materials.find((x) => x.name === 'wings'), halo = m.materials.find((x) => x.name === 'halo');
  expectThat('halo shares the wings texture file', !!(wings && halo && wings.texture && halo.texture && wings.texture.url === halo.texture.url));
  expectThat('shoes: one shared file (single material)', !!shoes);
  for (const b of m.bones) expectThat(`pivot ${b.name} ${fmt3(EXPECT.pivots[b.name])} +-${EXPECT.pivotTol}`, nearV(b.pivot, EXPECT.pivots[b.name], EXPECT.pivotTol), fmt3(b.pivot));
  expectThat('bounds min', nearV(m.bounds.min, EXPECT.bounds.min, EXPECT.boundsTol), fmt3(m.bounds.min));
  expectThat('bounds max', nearV(m.bounds.max, EXPECT.bounds.max, EXPECT.boundsTol), fmt3(m.bounds.max));
  expectThat('radiusXZ ~ 2.952', near(m.radiusXZ, EXPECT.radiusXZ, EXPECT.radiusTol), String(m.radiusXZ));
  expectThat(`N ~ ${EXPECT.vertexCount} (+-2%), u16`, near(H.N, EXPECT.vertexCount, EXPECT.vertexCount * EXPECT.countTol) && m.bin.indexType === 'u16', String(H.N));
  expectThat(`I ~ ${EXPECT.indexCount} (+-2%)`, near(H.I, EXPECT.indexCount, EXPECT.indexCount * EXPECT.countTol), String(H.I));
  // classification: which bones may each draw touch (derived from the output alone)
  const allow = { body: ['root', 'torso', 'head'], shoes: ['root'], pants: ['root'], hair: ['head'], horns: ['head'], mask: ['head'], tail: ['tail'], sweater: ['torso', 'armR', 'armL'], bolts: ['torso'], wings: ['wingR', 'wingL', 'torso'], halo: ['torso'] };
  for (const d of m.draws) {
    const name = m.materials[d.material].name; if (!allow[name]) continue;
    const used = new Set(); for (let k = d.first; k < d.first + d.count; k++) used.add(BONE_NAMES[dec.bone[dec.idx[k]]]);
    expectThat(`classification ${name}: bones ${[...used].join('/')}`, [...used].every((b) => allow[name].includes(b)));
    if (name === 'wings') expectThat('wings: both wingR and wingL used', used.has('wingR') && used.has('wingL'));
    if (name === 'sweater') expectThat('sweater: both arms used', used.has('armR') && used.has('armL'));
  }
  const rp = path.join(ROOT, 'scripts/roblox/out/report.json'); // (sleeve counts; absent after a fresh checkout)
  if (fs.existsSync(rp)) {
    const r = readJson(rp);
    for (const arm of ['armR', 'armL']) {
      const e = EXPECT.sleeves[arm], g = r.sleeves?.[arm];
      expectThat(`sleeve ${arm} rigid ~ ${e.rigid} (+-10%)`, !!g && near(g.rigid, e.rigid, e.rigid * EXPECT.sleeveTol), g ? String(g.rigid) : 'missing');
      expectThat(`sleeve ${arm} blended ~ ${e.blended} (+-10%)`, !!g && near(g.blended, e.blended, e.blended * EXPECT.sleeveTol), g ? String(g.blended) : 'missing');
    }
  } else console.log('  (scripts/roblox/out/report.json not found: sleeve counts not asserted)');

  console.log('\n== summary ==');
  console.log(`  ${m.materials.length} materials, ${m.draws.length} draws, N=${H.N}, I=${H.I}, ${m.bin.indexType}`);
  for (const b of m.bones) console.log(`  bone ${b.name.padEnd(6)} verts ${String(b.vertexCount).padStart(5)} pivot ${fmt3(b.pivot)}`);
  console.log(`  payload: bin ${kb(buf.length)} raw / ${kb(gz)} gzip / ${kb(br)} brotli, textures ${kb(texBytes)}, total ${kb(s.totalBytes)} raw / ${kb(s.totalGzipBytes)} gzip`);
  console.log(`  ${passed} passed, ${warnings} warning(s), ${failures} FAILED`);
}

/** Does the source this output came from look like the avatar the SPEC numbers describe? Prefer the real OBJ. */
function detectFingerprint(m) {
  const cfg = readJson(CONFIG); const fp = cfg.fingerprint;
  const obj = path.join(SRC, 'avatar.obj');
  if (fs.existsSync(obj)) {
    const o = parseObj(fs.readFileSync(obj, 'utf8'));
    const tris = o.groups.reduce((s, g) => s + g.faces.reduce((t, f) => t + Math.max(0, f.length - 2), 0), 0);
    return tris === fp.triangles && o.groups.length === fp.groups;
  }
  // Sources are not committed: fall back on the output itself (all expected materials present, no triangle lost).
  const names = new Set(m.materials.map((x) => x.name));
  return Object.keys(EXPECT.tris).every((n) => names.has(n)) && m.stats.triangleCount === fp.triangles && m.source.userId === cfg.userId;
}

main().then(() => { process.exit(failures ? 1 : 0); }).catch((e) => { console.error(e); process.exit(1); });
