// npm run roblox:fetch -- "<imageUrl>" [--out assets-src/roblox] [--user 1113999731]
// npm run roblox:fetch -- --verify [--out assets-src/roblox]      (only checks the CDN host formula against meta.json)
//
// <imageUrl> is the value of "imageUrl" from
//   https://thumbnails.roblox.com/v1/users/avatar-3d?userId=<id>
// opened in a browser that is logged in to Roblox (that endpoint needs a session; the files it points to do not).
// This script never handles cookies or tokens. The CDN links expire after ~30 days, which is why the pipeline's
// OUTPUT is committed and the (13 MB) sources are not.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson } from './lib/util.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--out', '--user'].includes(args[i - 1])));
const OUT = path.resolve(ROOT, opt('--out', 'assets-src/roblox'));
const cfgUser = (() => { try { return readJson(path.join(ROOT, 'scripts/roblox/avatar.config.json')).userId; } catch { return 1113999731; } })();
const USER = opt('--user', String(cfgUser));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(45000), redirect: 'follow' });

/** Roblox's CDN shards by hash: t0..t7.rbxcdn.com, chosen with this tiny XOR fold of the hash characters. */
function cdnHost(hash) {
  let i = 31; for (const ch of hash) i ^= ch.charCodeAt(0);
  return 't' + (i % 8) + '.rbxcdn.com';
}

/** GET one CDN object. Tries the computed shard first, then t0..t7. Returns { bytes, host, formulaOk }. */
async function fetchCdn(hash) {
  const first = cdnHost(hash); const order = [first, ...Array.from({ length: 8 }, (_, k) => `t${k}.rbxcdn.com`).filter((h) => h !== first)];
  const errors = [];
  for (const host of order) {
    try {
      const res = await get(`https://${host}/${hash}`);
      if (res.ok) return { bytes: Buffer.from(await res.arrayBuffer()), host, formulaOk: host === first };
      errors.push(`${host}: HTTP ${res.status}`);
    } catch (e) { errors.push(`${host}: ${e.message}`); }
  }
  throw new Error(`could not download ${hash}\n  ${errors.join('\n  ')}`);
}

/** Does the computed shard answer for this hash? (HEAD; some CDNs reject HEAD, then a GET we abandon.) */
async function probe(hash) {
  const url = `https://${cdnHost(hash)}/${hash}`;
  try {
    let res = await get(url, { method: 'HEAD' });
    if (res.status === 405 || res.status === 403) { const ac = new AbortController(); res = await fetch(url, { signal: ac.signal }); ac.abort(); }
    return res.status;
  } catch (e) { return e.message; }
}

function sniff(bytes) {
  if (bytes.length > 3 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return '.png';
  if (bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return '.jpg';
  return '';
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { for (;;) { const i = next++; if (i >= items.length) return; out[i] = await fn(items[i], i); } }));
  return out;
}

async function verifyFormula() {
  const metaFile = path.join(OUT, 'meta.json');
  if (!fs.existsSync(metaFile)) throw new Error(`${metaFile} not found`);
  const m = readJson(metaFile);
  const hashes = [...new Set([m.obj, m.mtl, ...m.textures])];
  const res = await pool(hashes, 6, async (h) => ({ h, host: cdnHost(h), status: await probe(h) }));
  for (const r of res) console.log(`  ${r.h}  ${r.host}  -> ${r.status}`);
  const okN = res.filter((r) => r.status === 200).length;
  console.log(`host formula: ${okN}/${res.length} hashes answered 200 on their computed shard${okN === res.length ? ' (VERIFIED)' : ''}`);
  return okN === res.length;
}

async function render(url) {
  for (let i = 0; i < 10; i++) {
    const j = await (await get(url)).json();
    const d = j.data?.[0];
    if (d?.state === 'Completed' && d.imageUrl) { const r = await get(d.imageUrl); if (!r.ok) throw new Error(`render download HTTP ${r.status}`); return Buffer.from(await r.arrayBuffer()); }
    if (d && d.state !== 'Pending') throw new Error(`render state ${d.state} for ${url}`);
    await sleep(1500);
  }
  throw new Error(`render still Pending after 10 tries: ${url}`);
}

async function main() {
  if (flag('--verify')) { process.exit((await verifyFormula()) ? 0 : 1); }
  const imageUrl = positional[0];
  if (!imageUrl) {
    console.error('usage: npm run roblox:fetch -- "<imageUrl>" [--out assets-src/roblox] [--user <userId>]\n' +
      `       get <imageUrl> from https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${USER} in a logged-in browser (see README)`);
    process.exit(2);
  }
  const tmp = `${OUT}.tmp-${process.pid}`;
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  try {
    console.log(`metadata: ${imageUrl.replace(/\?.*$/, '?...')}`);
    const mres = await get(imageUrl);
    if (!mres.ok) throw new Error(`imageUrl returned HTTP ${mres.status}. The URL expires after ~30 days; fetch a fresh one (README, refresh procedure).`);
    const metaText = await mres.text();
    let meta; try { meta = JSON.parse(metaText); } catch { throw new Error('imageUrl did not return JSON (is it the avatar-3d imageUrl, not a render?)'); }
    if (!meta.obj || !meta.mtl || !Array.isArray(meta.textures)) throw new Error('metadata JSON lacks obj/mtl/textures');
    fs.writeFileSync(path.join(tmp, 'meta.json'), metaText);

    const hosts = { ok: 0, fallback: 0 };
    const track = (r) => { r.formulaOk ? hosts.ok++ : hosts.fallback++; return r; };
    const obj = track(await fetchCdn(meta.obj)); fs.writeFileSync(path.join(tmp, 'avatar.obj'), obj.bytes);
    const mtl = track(await fetchCdn(meta.mtl)); fs.writeFileSync(path.join(tmp, 'avatar.mtl'), mtl.bytes);
    console.log(`obj ${obj.bytes.length} B, mtl ${mtl.bytes.length} B`);

    // The MTL may reference textures that the metadata list omits; take the union.
    const refs = new Set(meta.textures);
    for (const line of mtl.bytes.toString('utf8').split(/\r?\n/)) { const t = line.trim().split(/\s+/); if (/^map_/.test(t[0]) || t[0] === 'bump') refs.add(t[t.length - 1]); }
    const hashes = [...refs];
    await pool(hashes, 6, async (h) => {
      const r = track(await fetchCdn(h)); const ext = sniff(r.bytes);
      if (!ext) console.warn(`WARN ${h}: neither PNG nor JPEG magic bytes; saved without extension`);
      fs.writeFileSync(path.join(tmp, h + ext), r.bytes);
    });
    console.log(`${hashes.length} textures downloaded; computed CDN shard correct for ${hosts.ok} of ${hosts.ok + hosts.fallback} downloads${hosts.fallback ? ` (${hosts.fallback} needed the t0..t7 fallback)` : ''}`);

    // Public 2D renders (no login). Keep the previous ones if the API is unhappy.
    const renders = [['render-720.png', `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER}&size=720x720&format=Png&isCircular=false`],
      ['headshot-420.png', `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${USER}&size=420x420&format=Png&isCircular=false`]];
    for (const [name, url] of renders) {
      try { const b = await render(url); fs.writeFileSync(path.join(tmp, name), b); console.log(`${name} ${b.length} B`); }
      catch (e) {
        const old = path.join(OUT, name);
        if (fs.existsSync(old)) { fs.copyFileSync(old, path.join(tmp, name)); console.warn(`WARN ${name}: ${e.message}; kept the previous file`); }
        else throw e;
      }
    }

    // Swap in only now that everything is present.
    const old = `${OUT}.old-${process.pid}`;
    if (fs.existsSync(OUT)) fs.renameSync(OUT, old);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.renameSync(tmp, OUT);
    fs.rmSync(old, { recursive: true, force: true });
    console.log(`done -> ${path.relative(ROOT, OUT).replace(/\\/g, '/')}  (next: npm run roblox:build && npm run roblox:check)`);
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    console.error('fetch failed, nothing was replaced: ' + e.message + (e.cause ? ' (' + (e.cause.code || e.cause.message) + ')' : ''));
    process.exit(1);
  }
}

main();
