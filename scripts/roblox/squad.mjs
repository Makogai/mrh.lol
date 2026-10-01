// npm run roblox:squad  -  builds the lobby assets (V2_DESIGN section 5) for the owner + every friend in site.ts `squad.members`.
//
//   assets-src/roblox[-friends/<username>]/  ->  public/roblox/squad/<id>/            desktop pack  (<= 7k tris, textures <= 256)
//                                                public/roblox/squad/<id>/phone/      phone pack    (<= 4k tris, textures <= 128)
//                                                public/roblox/squad/<id>/poster-*    trimmed render, 360 and 720 px tall, AVIF/WebP (the SSR line-up)
//                                                public/roblox/squad/<id>/headshot-*  80px AVIF/WebP (roster, chips)
//                                                public/roblox/squad/<id>/loadout-*   600x880 AVIF/WebP (owner only: the Loadout poster)
//                                                src/squad/squad.generated.json       what the site imports
//
// <id> is `me` for the owner and the Roblox userId for friends. Removing a member from site.ts and rebuilding deletes that
// member's folder. Sources are NOT fetched here: the Roblox 3D-thumbnail endpoint needs a logged-in browser session, so drop
// meta.json / avatar.obj / avatar.mtl / textures / render-720.png / headshot-420.png into assets-src/roblox-friends/<username>/
// by hand (see scripts/roblox/fetch-roblox.mjs for the owner flow). Per-member rig overrides: scripts/roblox/squad/<username>.config.json.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { ROOT, h8, readJson, writeAtomic, kb } from './lib/util.mjs';

const OUT = path.join(ROOT, 'public/roblox/squad');
const PACKS = [
  { key: 'desktop', dir: '', tris: 7000, texCap: 256 },
  { key: 'phone', dir: 'phone', tris: 4000, texCap: 128 },
];
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

// Members come from the single config file so there is one list. A regex, not an import: site.ts is TypeScript.
const siteTs = fs.readFileSync(path.join(ROOT, 'src/config/site.ts'), 'utf8');
const block = siteTs.slice(siteTs.indexOf('squad: {', siteTs.indexOf('export const site')));
const friends = [...block.slice(0, block.indexOf('copy:')).matchAll(/robloxUserId:\s*(\d+),\s*username:\s*'([^']+)'/g)].map((m) => ({
  id: m[1], userId: +m[1], username: m[2], src: path.join(ROOT, 'assets-src/roblox-friends', m[2]), config: path.join(ROOT, 'scripts/roblox/squad', `${m[2]}.config.json`),
}));
const ownerCfg = path.join(ROOT, 'scripts/roblox/avatar.config.json');
const members = [{ id: 'me', userId: readJson(ownerCfg).userId, username: 'owner', src: path.join(ROOT, 'assets-src/roblox'), config: ownerCfg }, ...friends];

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const gen = [];
for (const m of members) {
  if (only && m.id !== only) continue;
  if (!fs.existsSync(path.join(m.src, 'avatar.obj'))) { console.warn(`SKIP ${m.username}: ${rel(m.src)}/avatar.obj is missing`); continue; }
  const dir = path.join(OUT, m.id);
  const info = { id: m.id, userId: m.userId, packs: {} };
  for (const p of PACKS) {
    const out = path.join(dir, p.dir);
    const r = spawnSync(process.execPath, [
      path.join(ROOT, 'scripts/roblox/preprocess.mjs'), '--src', m.src, '--out', out, '--config', m.config, '--user', String(m.userId),
      '--tris', String(p.tris), '--tex-cap', String(p.texCap), '--no-fallback', '--quiet', '--debug', `scripts/roblox/out/squad/${m.id}-${p.key}`,
    ], { encoding: 'utf8' });
    if (r.status !== 0) { console.error(r.stdout, r.stderr); throw new Error(`preprocess failed for ${m.username}/${p.key}`); }
    for (const w of (r.stderr || '').split('\n').filter((l) => /^WARN/.test(l) && !/config|fingerprint/.test(l))) console.warn(`  ${m.username}/${p.key}: ${w}`);
    const man = readJson(path.join(out, 'avatar.json'));
    info.packs[p.key] = `squad/${m.id}/${p.dir ? p.dir + '/' : ''}`;
    if (p.key === 'desktop') {
      Object.assign(info, {
        height: man.bounds.max[1], radius: man.radiusXZ, wave: man.bones[3].vertexCount > 0, // an arm bone with vertices: it can really wave
      });
    }
    console.log(`${m.username.padEnd(15)} ${p.key.padEnd(7)} ${String(man.stats.triangleCount).padStart(5)} tris  ${man.draws.length} draws  ${kb(man.stats.totalGzipBytes)} (bin gz + textures)`);
  }

  // ---- 2D: posters, headshot, loadout poster (all from the committed-never source renders) ----
  const render = path.join(m.src, 'render-720.png'), head = path.join(m.src, 'headshot-420.png');
  const keep = new Set();
  const emit = async (name, buf) => { const [base, ext] = name.split('.'); const f = `${base}.${h8(buf)}.${ext}`; // hashed: immutable caching
    keep.add(f); writeAtomic(path.join(dir, f), buf); return `squad/${m.id}/${f}`; };
  if (fs.existsSync(render)) {
    const trimmed = await sharp(render).trim({ threshold: 1 }).toBuffer();
    // Posters are the TRIMMED render at a fixed height (width follows): the lobby sizes them by the avatar's real height in studs, so a
    // short avatar must not be scaled up to fill a 2:3 box. The Loadout poster is the one fixed-size box (600x880, bottom-aligned).
    const tall = (h) => sharp(trimmed).resize({ height: h });
    const fixed = (w, h) => sharp(trimmed).resize(w, h, { fit: 'contain', position: 'bottom', background: { r: 0, g: 0, b: 0, alpha: 0 } });
    const both = async (name, mk) => {
      const avif = await mk().avif({ quality: 58, effort: 5 }).toBuffer(), webp = await mk().webp({ quality: 80, alphaQuality: 90 }).toBuffer();
      const { width, height } = await sharp(webp).metadata();
      return { w: width, h: height, avif: await emit(`${name}.avif`, avif), webp: await emit(`${name}.webp`, webp) };
    };
    info.poster = { x1: await both('poster-360', () => tall(360)), x2: await both('poster-720', () => tall(720)) };
    if (m.id === 'me') info.loadout = await both('loadout-600x880', () => fixed(600, 880));
  } else console.warn(`  ${m.username}: no render-720.png, posters skipped`);
  if (fs.existsSync(head)) {
    const sq = () => sharp(head).resize(80, 80, { fit: 'cover' });
    info.headshot = { size: 80, avif: await emit('headshot-80.avif', await sq().avif({ quality: 60, effort: 5 }).toBuffer()), webp: await emit('headshot-80.webp', await sq().webp({ quality: 82 }).toBuffer()) };
  }
  for (const f of fs.readdirSync(dir)) if (/^(poster|headshot|loadout)-/.test(f) && !keep.has(f)) fs.unlinkSync(path.join(dir, f)); // superseded hashes
  gen.push(info);
}

if (!only) {
  // Removing a member deletes their assets.
  const ids = new Set(members.map((m) => m.id));
  if (fs.existsSync(OUT)) for (const d of fs.readdirSync(OUT)) if (!ids.has(d)) { fs.rmSync(path.join(OUT, d), { recursive: true, force: true }); console.log(`removed squad/${d}`); }
  writeAtomic(path.join(ROOT, 'src/squad/squad.generated.json'), JSON.stringify({ v: 1, members: gen }, null, 1) + '\n');
  console.log(`wrote src/squad/squad.generated.json (${gen.length} members)`);
}
