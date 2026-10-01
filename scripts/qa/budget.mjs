// JS budget gate (V2_DESIGN §9; PROMPT §6 was 150 KB total). Exits 1 when, in gzip: the main (eagerly loaded) JS > 105 KB,
// any lazy chunk > 16 KB, or the total > 140 KB. Run by `npm run bundle`.
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const KB = 1024;
const LIMITS = { main: 105 * KB, lazyChunk: 16 * KB, total: 140 * KB };
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = process.env.MRH_PKG;
const outDir = resolve(root, pkg ? `dist-${pkg}` : 'dist');
const assets = resolve(outDir, 'assets');

const kb = (n) => `${(n / 1024).toFixed(2)} KB`;
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

const names = await readdir(assets).catch(() => {
  throw new Error(`budget: ${assets} not found — run the client build first`);
});

// Files the HTML loads eagerly: the entry script and modulepreloads. The entry is started by an inline loader that receives its
// URL as a string (vite.config.ts deferEntryUntilPaint), so match any /assets/*.js path in the HTML, not just src/href attributes.
// Everything else is a lazy chunk: the hero engine, the squad stage.
const html = await readFile(resolve(outDir, 'index.html'), 'utf8');
const eager = new Set([...html.matchAll(/\/assets\/([^"'\s)]+\.js)/g)].map((m) => m[1]));

const js = [];
for (const name of names.filter((n) => n.endsWith('.js'))) {
  const buf = await readFile(resolve(assets, name));
  js.push({ name, raw: buf.length, gz: gzipSync(buf, { level: 9 }).length, lazy: !eager.has(name) });
}
js.sort((a, b) => b.gz - a.gz);

const total = js.reduce((s, f) => s + f.gz, 0);
const lazyTotal = js.filter((f) => f.lazy).reduce((s, f) => s + f.gz, 0);
const mainTotal = total - lazyTotal;

const w = Math.max(...js.map((f) => f.name.length), 4);
console.log(`\nJS budget — ${pkg ? `dist-${pkg}` : 'dist'}/assets`);
console.log(`${pad('file', w)}  ${lpad('raw', 11)}  ${lpad('gzip', 11)}  kind`);
for (const f of js) {
  console.log(`${pad(f.name, w)}  ${lpad(kb(f.raw), 11)}  ${lpad(kb(f.gz), 11)}  ${f.lazy ? 'lazy' : 'eager'}`);
}
console.log(`${pad('TOTAL', w)}  ${lpad(kb(js.reduce((s, f) => s + f.raw, 0)), 11)}  ${lpad(kb(total), 11)}  limit ${kb(LIMITS.total)} (${((total / LIMITS.total) * 100).toFixed(1)} %)`);
console.log(`main (eager) JS: ${kb(mainTotal)} gzip, limit ${kb(LIMITS.main)}`);
console.log(`lazy chunk share: ${kb(lazyTotal)} gzip = ${total ? ((lazyTotal / total) * 100).toFixed(1) : '0.0'} % of total JS`);

// Informational only.
const others = names.filter((n) => /\.(css|woff2?)$/.test(n));
if (others.length) {
  console.log('\nOther assets (not budgeted)');
  for (const name of others.sort()) {
    const buf = await readFile(resolve(assets, name));
    const size = (await stat(resolve(assets, name))).size;
    const gz = name.endsWith('.css') ? `  gzip ${kb(gzipSync(buf, { level: 9 }).length)}` : '';
    console.log(`${pad(name, w)}  ${lpad(kb(size), 11)}${gz}`);
  }
}

const failures = [];
if (mainTotal > LIMITS.main) failures.push(`main JS ${kb(mainTotal)} gzip exceeds ${kb(LIMITS.main)}`);
for (const f of js.filter((x) => x.lazy && x.gz > LIMITS.lazyChunk)) failures.push(`lazy chunk ${f.name} ${kb(f.gz)} gzip exceeds ${kb(LIMITS.lazyChunk)}`);
if (total > LIMITS.total) failures.push(`total JS ${kb(total)} gzip exceeds ${kb(LIMITS.total)}`);
if (failures.length) {
  for (const f of failures) console.error(`\nFAIL: ${f}`);
  process.exit(1);
}
console.log('\nOK: within budget\n');
