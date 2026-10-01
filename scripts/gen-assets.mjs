// Generates the share image and the icon set (BUILD_PLAN §11.3). Run locally with `npm run gen:assets`; the outputs
// under public/ are committed, so the Docker build never needs resvg/sharp/fontkit.
//
//   public/og.png                 1200×630 share card: the name as a chip on a board whose traces cool into ore veins
//   public/favicon.ico            32 px PNG inside a minimal ICO container
//   public/apple-touch-icon.png   180, full-bleed
//   public/icon-192.png, icon-512.png, icon-maskable-512.png
//   public/site.webmanifest       regenerated from site config so name/description/colours can never drift
//
// Why the text pipeline looks the way it does (all validated, BUILD_PLAN §11.3):
//   • resvg-js cannot read WOFF2, and fontkit's own variation instancing breaks on WOFF2;
//   • so HarfBuzz (subset-font) pins the variable axes and re-emits a static TrueType per text style,
//   • fontkit lays that out and hands back glyph outlines, which go into the SVG as <path>s.
// The result is independent of installed fonts (resvg runs with loadSystemFonts: false) and of the OS.
//
// Needs Node >= 22.18: it imports src/config/site.ts and src/hero/veins/generate.ts directly (type stripping).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const subsetFont = require('subset-font');
const fontkit = require('fontkit');
const { Resvg } = require('@resvg/resvg-js');
const sharp = require('sharp');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, 'public');
const fontFile = (pkg, file) => resolve(root, 'node_modules/@fontsource-variable', pkg, 'files', file);

const { site } = await import(pathToFileURL(resolve(root, 'src/config/site.ts')).href);

// ── Palette (BUILD_PLAN §5.1) — kept as literals because this script cannot import the CSS tokens ──────────────
const C = {
  iron950: '#06080e', iron900: '#0a0d16', iron800: '#161b28',
  amber200: '#ffe9bd', amber300: '#ffd98a', amber400: '#ffc247',
  teal400: '#3ee0d0', violet400: '#a78bfa', blue400: '#60a5fa',
  ink100: '#eef2fb', ink300: '#aab3c7', ink400: '#7d879e',
};
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const n1 = (v) => Math.round(v * 10) / 10;

// ── Text → glyph outlines ───────────────────────────────────────────────────────────────────────────────────────
const fontCache = new Map();
const readCached = async (file) => {
  if (!fontCache.has(file)) fontCache.set(file, readFile(file));
  return fontCache.get(file);
};
const MONA = fontFile('mona-sans', 'mona-sans-latin-wdth-normal.woff2');
const MARTIAN = fontFile('martian-mono', 'martian-mono-latin-wght-normal.woff2');

/**
 * Lays out `text` and returns `{ d, box, advance }`: one SVG path string plus the tight ink box of the glyphs.
 * `tracking` is in em (CSS letter-spacing); the trailing gap after the last glyph is not counted, so right-aligned
 * text lands exactly on its anchor. `anchor: 'end'` right-aligns to x.
 */
async function shape({ file, text, axes, size, tracking = 0, x, baseline, anchor = 'start' }) {
  const ttf = await subsetFont(await readCached(file), text, { targetFormat: 'truetype', variationAxes: axes });
  const font = fontkit.create(ttf);
  const run = font.layout(text);
  const s = size / font.unitsPerEm;
  const track = tracking * size;

  let total = 0;
  run.positions.forEach((p, i) => { total += p.xAdvance * s + (i < run.positions.length - 1 ? track : 0); });
  let pen = anchor === 'end' ? x - total : x;

  let d = '';
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  run.glyphs.forEach((g, i) => {
    const p = run.positions[i];
    const path = g.path.scale(s, -s).translate(pen + p.xOffset * s, baseline - p.yOffset * s);
    const svg = path.toSVG();
    if (svg) {
      // Two decimals is far below a pixel at 1200 px wide, and keeps the SVG string small.
      d += svg.replace(/-?\d+\.\d+/g, (m) => String(Math.round(parseFloat(m) * 100) / 100));
      const b = path.bbox;
      if (Number.isFinite(b.minX)) {
        minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
        maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
      }
    }
    pen += p.xAdvance * s + track;
  });
  return { d, box: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }, advance: total };
}

const unionBox = (...boxes) => {
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};
const pad = (b, p) => ({ x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p });

// ── Network (the hero's generator; empty or failing → still produce an image, with a warning) ──────────────────
async function loadNetwork(chip, avoid, W, H) {
  try {
    // GEN_ASSETS_GENERATOR is a test hook (point it at an alternative generator module); normal runs use the hero's.
    const gen = await import(pathToFileURL(resolve(root, process.env.GEN_ASSETS_GENERATOR ?? 'src/hero/veins/generate.ts')).href);
    const net = gen.generateNetwork({ width: W, height: H, chip, avoid, seed: gen.VEIN_SEED, profile: 'og' });
    if (!net.nodeCount) console.warn('[gen-assets] WARNING: generateNetwork returned an empty network (hero stub?). OG image has no traces — re-run `npm run gen:assets` after the hero lands.');
    return { net, NodeKind: gen.NodeKind };
  } catch (err) {
    console.warn(`[gen-assets] WARNING: could not load the vein generator (${err.message}). OG image has no traces — re-run after the hero lands.`);
    return { net: null, NodeKind: null };
  }
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const { k, v } = this;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const { k, v } = this;
    const topK = k[0], topV = v[0];
    const lastK = k.pop(), lastV = v.pop();
    if (k.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= k.length) break;
        if (c + 1 < k.length && k[c + 1] < k[c]) c++;
        if (k[c] >= lastK) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lastK; v[i] = lastV;
    }
    return [topK, topV];
  }
}

/** Multi-source shortest path length (along edges) from every node in `sources`. */
function distancesFrom(net, sources) {
  const dist = new Float64Array(net.nodeCount).fill(Infinity);
  const heap = new MinHeap();
  for (const s of sources) { dist[s] = 0; heap.push(0, s); }
  while (heap.size) {
    const [d, n] = heap.pop();
    if (d > dist[n]) continue;
    for (let j = net.adjStart[n]; j < net.adjStart[n + 1]; j++) {
      const e = net.adjEdge[j];
      const m = net.ea[e] === n ? net.eb[e] : net.ea[e];
      const nd = d + net.elen[e];
      if (nd < dist[m]) { dist[m] = nd; heap.push(nd, m); }
    }
  }
  return dist;
}

/** The board, drawn the way BUILD_PLAN §7.4 draws the static canvas layer, plus a frozen boot pulse (§7.7). */
function networkSvg(net, NodeKind, chip) {
  const copper = rgb(C.amber400), steel = [150, 162, 188];
  const warmSteel = [170, 166, 160], teal = rgb(C.teal400);
  const out = [];

  // Bucket edges by (kind, quantised distance-from-chip, width) — the same batching the canvas uses, so the SVG is a
  // few dozen <path>s rather than one element per edge.
  const buckets = new Map();
  const bloom = new Map();
  for (let e = 0; e < net.edgeCount; e++) {
    const pcb = net.epcb[e] === 1;
    const fb = Math.round(net.efar[e] * 7);
    const wb = Math.round(net.ewidth[e] * 4);
    const key = `${pcb ? 1 : 0}|${fb}|${wb}`;
    let b = buckets.get(key);
    if (!b) {
      const ef = fb / 7;
      const col = pcb ? mix(copper, steel, Math.min(1, ef * 1.4)) : mix(warmSteel, teal, Math.min(1, 0.25 + ef));
      const alpha = pcb ? 0.36 - 0.12 * ef : 0.22 - 0.06 * ef;
      b = { col, alpha, width: wb / 4, d: '', pcb, ef };
      buckets.set(key, b);
    }
    const a = net.ea[e], z = net.eb[e];
    const seg = `M${n1(net.nx[a])} ${n1(net.ny[a])}L${n1(net.nx[z])} ${n1(net.ny[z])}`;
    b.d += seg;
    if (pcb && net.efar[e] < 0.5) {
      let g = bloom.get(fb);
      if (!g) { g = { col: b.col, d: '' }; bloom.set(fb, g); }
      g.d += seg;
    }
  }

  const stroke = (d, col, alpha, width) =>
    `<path d="${d}" fill="none" stroke="${css(col)}" stroke-opacity="${alpha.toFixed(3)}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

  // Bloom first (wide, faint) so the cores sit in it: light, not borders.
  for (const g of bloom.values()) out.push(stroke(g.d, g.col, 0.05, 5));
  for (const b of buckets.values()) out.push(stroke(b.d, b.col, b.alpha, b.width));

  // Frozen boot pulse: Dijkstra from every pin, then light the edge stretches whose distance falls just behind the
  // wavefront R. Three bands (head / mid / tail) fade like the live pulse's tail.
  if (net.pins.length && net.maxBirth > 0) {
    const dist = distancesFrom(net, net.pins);
    const R = 0.45 * net.maxBirth;
    const bands = [
      { lo: R - 12, hi: R, col: rgb(C.amber200), alpha: 0.9 * 0.95, extra: 0.9, d: '' },
      { lo: R - 60, hi: R - 12, col: rgb(C.amber300), alpha: 0.8 * 0.55, extra: 0.5, d: '' },
      { lo: R - 160, hi: R - 60, col: rgb(C.amber300), alpha: 0.8 * 0.22, extra: 0.3, d: '' },
    ];
    const heads = [];
    for (let e = 0; e < net.edgeCount; e++) {
      const len = net.elen[e];
      for (const fromA of [true, false]) {
        const from = fromA ? net.ea[e] : net.eb[e];
        const to = fromA ? net.eb[e] : net.ea[e];
        const d0 = dist[from];
        if (!(d0 < Infinity)) continue;
        const fx = net.nx[from], fy = net.ny[from];
        const ux = (net.nx[to] - fx) / len, uy = (net.ny[to] - fy) / len;
        for (const band of bands) {
          const s0 = Math.max(0, band.lo - d0), s1 = Math.min(len, band.hi - d0);
          if (s1 > s0) band.d += `M${n1(fx + ux * s0)} ${n1(fy + uy * s0)}L${n1(fx + ux * s1)} ${n1(fy + uy * s1)}`;
        }
        const sh = R - d0;
        if (sh >= 0 && sh <= len) heads.push([fx + ux * sh, fy + uy * sh]);
      }
    }
    // Bands widest-first so the white-hot head stays on top.
    for (const band of [...bands].reverse()) if (band.d) out.push(stroke(band.d, band.col, band.alpha, 1.3 + band.extra));
    // Sparks at the heads; thinned to a constant budget so a dense wavefront doesn't blow out into a solid line.
    const stride = Math.max(1, Math.ceil(heads.length / 56));
    heads.forEach(([x, y], i) => { if (i % stride === 0) out.push(`<circle cx="${n1(x)}" cy="${n1(y)}" r="11" fill="url(#spark)"/>`); });
  }

  // Nodes (BUILD_PLAN §7.4). Nodule colour comes from a hash of its position, like the canvas does.
  const hash = (x, y) => (Math.imul(Math.round(x * 7), 73856093) ^ Math.imul(Math.round(y * 13), 19349663)) >>> 0;
  const nodule = [C.teal400, C.teal400, C.violet400, C.blue400];
  const nodes = [];
  for (let i = 0; i < net.nodeCount; i++) {
    const x = n1(net.nx[i]), y = n1(net.ny[i]);
    switch (net.nkind[i]) {
      case NodeKind.Pad: nodes.push(`<circle cx="${x}" cy="${y}" r="2.3" fill="${C.amber400}" fill-opacity="0.42"/>`); break;
      case NodeKind.Via:
        nodes.push(`<circle cx="${x}" cy="${y}" r="3" fill="none" stroke="${C.ink300}" stroke-opacity="0.38"/>`);
        nodes.push(`<circle cx="${x}" cy="${y}" r="0.9" fill="${C.ink300}" fill-opacity="0.5"/>`);
        break;
      case NodeKind.Pin: {
        // Pins on the chip's top edge are 3 wide × 6 tall; on its right edge the same lead lies on its side.
        const top = Math.abs(net.ny[i] - (chip.y - 2)) < 2;
        const [w, h] = top ? [3, 6] : [6, 3];
        nodes.push(`<rect x="${n1(x - w / 2)}" y="${n1(y - h / 2)}" width="${w}" height="${h}" fill="${C.amber400}" fill-opacity="0.55"/>`);
        break;
      }
      case NodeKind.Junction: nodes.push(`<circle cx="${x}" cy="${y}" r="1.6" fill="${C.amber400}" fill-opacity="0.35"/>`); break;
      case NodeKind.Nodule:
        nodes.push(`<circle cx="${x}" cy="${y}" r="1.5" fill="${nodule[hash(net.nx[i], net.ny[i]) % 4]}" fill-opacity="0.75"/>`);
        break;
      default: break;
    }
  }
  return out.join('') + nodes.join('');
}

/** Silkscreen: 16 px corner brackets around the chip and the pin-1 dot (BUILD_PLAN §7.1). */
function silkscreenSvg(chip) {
  const L = 16, { x, y } = chip, r = chip.x + chip.w, b = chip.y + chip.h;
  const d =
    `M${x} ${y + L}V${y}H${x + L}M${r - L} ${y}H${r}V${y + L}M${r} ${b - L}V${b}H${r - L}M${x + L} ${b}H${x}V${b - L}`;
  return `<path d="${d}" fill="none" stroke="${C.ink300}" stroke-opacity="0.18" stroke-width="1"/>` +
    `<circle cx="${n1(x - 10)}" cy="${n1(y - 10)}" r="2" fill="${C.amber400}" fill-opacity="0.5"/>`;
}

// ── OG image ────────────────────────────────────────────────────────────────────────────────────────────────────
async function buildOg() {
  const W = 1200, H = 630;
  const hostLabel = new URL(site.origin).hostname.toUpperCase();
  const interests = site.interests.join(' · ').toUpperCase();

  // Text first: its glyph boxes define the chip (the keep-out the network must respect), exactly like the live hero.
  const brand = await shape({ file: MARTIAN, text: hostLabel, axes: { wght: 500 }, size: 22, tracking: 0.14, x: 72, baseline: 84 });
  const tags = await shape({ file: MARTIAN, text: interests, axes: { wght: 500 }, size: 16, tracking: 0.08, x: 1128, baseline: 84, anchor: 'end' });
  const name = await shape({ file: MONA, text: site.displayName, axes: { wdth: 125, wght: 850 }, size: 150, tracking: -0.045, x: 72, baseline: 500 });
  // The identity may hold an NBSP (a DOM line-break hint); the outline pipeline wants a plain space.
  const ident = await shape({ file: MONA, text: site.identity.replace(/\u00a0/g, ' '), axes: { wdth: 100, wght: 500 }, size: 34, x: 72, baseline: 556 });

  const chip = pad(unionBox(name.box, ident.box), 24);
  const avoid = [pad(brand.box, 12), pad(tags.box, 12)];
  const { net, NodeKind } = await loadNetwork(chip, avoid, W, H);

  // (No XML comments inside the template: `--` is illegal in them and resvg is strict.)
  // Gradients: CSS radial-gradient(60% 50% at 28% 80%, … transparent 70%) re-expressed as a transformed unit circle.
  // Grain: the page's own feTurbulence tile (global.css --grain), slightly stronger because a 1200 px card is shown small.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${C.iron800}"/><stop offset="0.55" stop-color="${C.iron900}"/><stop offset="1" stop-color="${C.iron950}"/>
  </linearGradient>
  <radialGradient id="ember" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(${0.28 * W} ${0.8 * H}) scale(${0.6 * W} ${0.5 * H})">
    <stop offset="0" stop-color="${C.amber400}" stop-opacity="0.085"/><stop offset="0.7" stop-color="${C.amber400}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="haze" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(${0.85 * W} ${0.08 * H}) scale(${0.5 * W} ${0.4 * H})">
    <stop offset="0" stop-color="${C.blue400}" stop-opacity="0.06"/><stop offset="0.7" stop-color="${C.blue400}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="spark">
    <stop offset="0" stop-color="#fff6e0" stop-opacity="0.95"/><stop offset="0.25" stop-color="${C.amber300}" stop-opacity="0.5"/>
    <stop offset="1" stop-color="${C.amber400}" stop-opacity="0"/>
  </radialGradient>
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
    <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.9 0"/>
  </filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#base)"/>
<rect width="${W}" height="${H}" fill="url(#haze)"/>
<rect width="${W}" height="${H}" fill="url(#ember)"/>
${net && net.nodeCount ? networkSvg(net, NodeKind, chip) : ''}
${silkscreenSvg(chip)}
<path d="${brand.d}" fill="${C.amber400}"/>
<path d="${tags.d}" fill="${C.ink400}"/>
<path d="${name.d}" fill="${C.ink100}"/>
<path d="${ident.d}" fill="${C.ink300}"/>
<rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.04"/>
</svg>`;

  const png = new Resvg(svg, { font: { loadSystemFonts: false }, fitTo: { mode: 'original' } }).render().asPng();
  // The grain makes the raw PNG large; a palette PNG is visually identical on this dark, low-chroma image and several
  // times smaller. Falls back to the lossless encoding if the palette version would not be smaller.
  const lossless = await sharp(png).png({ compressionLevel: 9, effort: 10 }).toBuffer();
  const palette = await sharp(png).png({ palette: true, quality: 92, colours: 256, dither: 0.6, compressionLevel: 9, effort: 10 }).toBuffer();
  const best = lossless.length <= 560 * 1024 ? lossless : palette;
  const out = resolve(publicDir, 'og.png');
  await writeFile(out, best);
  const kb = (best.length / 1024).toFixed(0);
  console.log(`[gen-assets] og.png ${W}x${H} ${kb} KB (${best === lossless ? 'lossless' : 'palette'}; lossless would be ${(lossless.length / 1024).toFixed(0)} KB)` +
    `${net ? ` · ${net.nodeCount} nodes / ${net.edgeCount} edges` : ' · no network'}`);
  if (best.length > 600 * 1024) throw new Error(`og.png is ${kb} KB, over the 600 KB budget`);
}

// ── Icons ───────────────────────────────────────────────────────────────────────────────────────────────────────
const MARK_D = 'M8 24V10L16 18L24 10V24'; // the letter M as a PCB trace — same path as public/favicon.svg
// Mark bounds in the 32-unit space: x 5.5…26.5 (stroke + pads), y 8.5…26.5 → centre (16, 17.5), width 21.
const markGroup = (size, widthShare) => {
  const s = (widthShare * size) / 21;
  return `<g transform="translate(${size / 2} ${size / 2}) scale(${s}) translate(-16 -17.5)">` +
    `<path d="${MARK_D}" fill="none" stroke="${C.amber400}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="8" cy="24" r="2.5" fill="${C.amber400}"/><circle cx="24" cy="24" r="2.5" fill="${C.amber400}"/></g>`;
};

/** Full-bleed tile (apple-touch, maskable): iron-950 with a soft ember behind the mark. */
const bleedIconSvg = (size, widthShare) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs><radialGradient id="e" cx="0.5" cy="0.62" r="0.62"><stop offset="0" stop-color="${C.amber400}" stop-opacity="0.16"/><stop offset="1" stop-color="${C.amber400}" stop-opacity="0"/></radialGradient></defs>
<rect width="${size}" height="${size}" fill="${C.iron950}"/><rect width="${size}" height="${size}" fill="url(#e)"/>${markGroup(size, widthShare)}</svg>`;

const renderPng = (svg, width) =>
  new Resvg(svg, { font: { loadSystemFonts: false }, fitTo: { mode: 'width', value: width } }).render().asPng();

/** One 32×32 PNG in an ICO container: 6-byte header + one 16-byte directory entry pointing at the PNG bytes. */
function icoFromPng(png) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count
  header.writeUInt8(32, 6); // width
  header.writeUInt8(32, 7); // height
  header.writeUInt8(0, 8); // palette size (none)
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14); // bytes in resource
  header.writeUInt32LE(22, 18); // offset of the image data
  return Buffer.concat([header, png]);
}

async function buildIcons() {
  // The hand-written favicon.svg is the source of truth for the rounded-square marks, so every size matches it exactly.
  const faviconSvg = await readFile(resolve(publicDir, 'favicon.svg'), 'utf8');
  const files = {
    'favicon.ico': icoFromPng(renderPng(faviconSvg, 32)),
    'apple-touch-icon.png': renderPng(bleedIconSvg(180, 0.6), 180),
    'icon-192.png': renderPng(faviconSvg, 192),
    'icon-512.png': renderPng(faviconSvg, 512),
    // Maskable: launchers crop to a circle of radius 40 % of the side, so the mark stays inside the central 60 %.
    'icon-maskable-512.png': renderPng(bleedIconSvg(512, 0.6), 512),
  };
  for (const [name, buf] of Object.entries(files)) {
    await writeFile(resolve(publicDir, name), buf);
    console.log(`[gen-assets] ${name} ${(buf.length / 1024).toFixed(1)} KB`);
  }
}

// ── Manifest (derived from config so it cannot drift) ───────────────────────────────────────────────────────────
async function buildManifest() {
  const manifest = {
    name: site.displayName,
    short_name: site.displayName,
    description: site.seo.description,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: site.seo.themeColor,
    theme_color: site.seo.themeColor,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  await writeFile(resolve(publicDir, 'site.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('[gen-assets] site.webmanifest');
}

await mkdir(publicDir, { recursive: true });
await buildOg();
await buildIcons();
await buildManifest();
