// JS budget gate (PROMPT §6: total JS < 150 KB gzipped). Exits 1 above 153,600 bytes. Run by `npm run bundle`.
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const LIMIT = 150 * 1024;
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

// Files the HTML loads eagerly (entry script + modulepreloads). Everything else is a lazy chunk, i.e. the hero engine.
const html = await readFile(resolve(outDir, 'index.html'), 'utf8');
const eager = new Set([...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]));

const js = [];
for (const name of names.filter((n) => n.endsWith('.js'))) {
  const buf = await readFile(resolve(assets, name));
  js.push({ name, raw: buf.length, gz: gzipSync(buf, { level: 9 }).length, lazy: !eager.has(name) });
}
js.sort((a, b) => b.gz - a.gz);

const total = js.reduce((s, f) => s + f.gz, 0);
const lazyTotal = js.filter((f) => f.lazy).reduce((s, f) => s + f.gz, 0);

const w = Math.max(...js.map((f) => f.name.length), 4);
console.log(`\nJS budget — ${pkg ? `dist-${pkg}` : 'dist'}/assets`);
console.log(`${pad('file', w)}  ${lpad('raw', 11)}  ${lpad('gzip', 11)}  kind`);
for (const f of js) {
  console.log(`${pad(f.name, w)}  ${lpad(kb(f.raw), 11)}  ${lpad(kb(f.gz), 11)}  ${f.lazy ? 'lazy' : 'eager'}`);
}
console.log(`${pad('TOTAL', w)}  ${lpad(kb(js.reduce((s, f) => s + f.raw, 0)), 11)}  ${lpad(kb(total), 11)}  limit ${kb(LIMIT)} (${((total / LIMIT) * 100).toFixed(1)} %)`);
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

if (total > LIMIT) {
  console.error(`\nFAIL: total JS ${total} bytes gzip exceeds the ${LIMIT} byte budget`);
  process.exit(1);
}
console.log('\nOK: within budget\n');
