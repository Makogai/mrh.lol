// Subsets the two self-hosted variable fonts to what the site actually renders (LCP: the h1 is set in Mona Sans, and the
// font file is on the critical path). Run locally with `npm run gen:fonts`; the outputs under src/assets/fonts/ are
// committed, so the Docker build never needs subset-font.
//
// Why a custom subset on top of fontsource's "latin" cut (98 KB for Mona Sans):
//   • axes: the CSS only ever asks for weights 400–850 and widths 100–125 % (grep `font-\[`, `font-stretch`), so the
//     rest of the design space (wght 200–399, 851–900, wdth 75–99) is dead weight. HarfBuzz re-bases the axes.
//   • glyphs: printable ASCII plus the handful of typographic marks the copy uses. Anything else (an accented name in a
//     future project title, say) falls through per-glyph to the metric-matched system fallback — never a missing box.
//     Keep UNICODE_RANGE in global.css in step with CHARS below, otherwise the browser would download the file for text
//     it cannot draw.
//
//   public-facing result: mona-sans-site.woff2, martian-mono-site.woff2
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const subsetFont = require('subset-font');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'src/assets/fonts');
const fontFile = (pkg, file) => resolve(root, 'node_modules/@fontsource-variable', pkg, 'files', file);

// U+0020–007E, NBSP (the identity line uses one), and: — – ‘ ’ “ ” … • · × © ™ ↑ ↓ − . The fonts have no arrows ← → ↗ or U+2011
// (the site draws arrows as SVG icons), so those are not listed.
const EXTRA = String.fromCodePoint(0xa0,0xa9,0xb7,0xd7,0x2013,0x2014,0x2018,0x2019,0x201c,0x201d,0x2022,0x2026,0x2122,0x2191,0x2193,0x2212); // code points, not literals: an NBSP in source is invisible
let CHARS = '';
for (let c = 0x20; c <= 0x7e; c++) CHARS += String.fromCharCode(c);
CHARS += EXTRA;

const jobs = [
  {
    src: fontFile('mona-sans', 'mona-sans-latin-wdth-normal.woff2'),
    out: 'mona-sans-site.woff2',
    axes: { wght: { min: 400, max: 850 }, wdth: { min: 100, max: 125 } },
  },
  {
    // Mono is only used for labels and numerals: 400 body, 500 medium, a few bolds.
    src: fontFile('martian-mono', 'martian-mono-latin-wght-normal.woff2'),
    out: 'martian-mono-site.woff2',
    axes: { wght: { min: 400, max: 700 } },
  },
];

await mkdir(outDir, { recursive: true });
for (const job of jobs) {
  const input = await readFile(job.src);
  const output = await subsetFont(input, CHARS, { targetFormat: 'woff2', variationAxes: job.axes });
  await writeFile(resolve(outDir, job.out), output);
  console.log(`${job.out.padEnd(26)} ${(input.length / 1024).toFixed(1)} KB -> ${(output.length / 1024).toFixed(1)} KB`);
}

// Print the unicode-range for global.css so the two can't drift.
const ranges = [...CHARS].map((c) => c.codePointAt(0)).sort((a, b) => a - b);
const parts = [];
for (let i = 0; i < ranges.length; ) {
  let j = i;
  while (j + 1 < ranges.length && ranges[j + 1] === ranges[j] + 1) j++;
  const hex = (n) => n.toString(16).toUpperCase().padStart(4, '0');
  parts.push(i === j ? `U+${hex(ranges[i])}` : `U+${hex(ranges[i])}-${hex(ranges[j])}`);
  i = j + 1;
}
console.log(`unicode-range: ${parts.join(', ')};`);
