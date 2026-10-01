// Contrast fixture (V2_DESIGN §4): every accent/surface pair the v2 front end renders as text, checked against WCAG 2.x.
// Exits 1 if any `text` pair falls below 4.5:1. Decorative pairs (index numerals, ticks, rings) are listed for the record only.
// Add a pair here whenever a package introduces a new themed surface; the hexes mirror src/styles/global.css and frame.css.
//   node scripts/qa/contrast.mjs

const C = {
  iron950: '#06080e', iron900: '#0a0d16', iron850: '#10141f', iron800: '#161b28',
  ink100: '#eef2fb', ink300: '#aab3c7', ink400: '#7d879e', ink500: '#5a6379',
  amber: '#ffc247', teal: '#3ee0d0', violet: '#a78bfa', blue: '#60a5fa',
  tan: '#d9b26a', phosphor: '#b7e07a', coral: '#ff8f80', blurple: '#5865f2', white: '#ffffff',
  umber950: '#0c0a07', umber900: '#1b140b', discord900: '#1e1f22', discord800: '#2b2d31',
};

const lum = (hex) => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** [label, foreground, background, isText] */
const pairs = [];
// Body and UI text on the page surfaces
for (const bg of ['iron950', 'iron900', 'iron850']) {
  for (const fg of ['ink100', 'ink300', 'ink400']) pairs.push([`${fg} on ${bg}`, C[fg], C[bg], true]);
}
// Local accents used as text (readouts, kickers, links) on the slot surfaces
for (const a of ['amber', 'teal', 'violet', 'blue', 'tan', 'phosphor', 'coral']) {
  pairs.push([`${a} text on iron900`, C[a], C.iron900, true]);
  pairs.push([`${a} text on iron850`, C[a], C.iron850, true]);
}
// Text on an accent fill (primary buttons, pills, selected slots): iron-950 ink, white on blurple
for (const a of ['amber', 'teal', 'violet', 'blue', 'tan', 'phosphor', 'coral']) pairs.push([`iron950 ink on ${a} fill`, C.iron950, C[a], true]);
pairs.push(['white on blurple fill', C.white, C.blurple, true]);
// Themed app surfaces
pairs.push(['amber on atlas umber900', C.amber, C.umber900, true]);
pairs.push(['ink100 on atlas umber900', C.ink100, C.umber900, true]);
pairs.push(['ink300 on atlas umber900', C.ink300, C.umber900, true]);
pairs.push(['ink100 on bot discord800', C.ink100, C.discord800, true]);
pairs.push(['ink300 on bot discord800', C.ink300, C.discord800, true]);
pairs.push(['ink300 on bot discord900', C.ink300, C.discord900, true]);
pairs.push(['amber on bot discord800', C.amber, C.discord800, true]);
// Decorative only (aria-hidden numerals, ticks, rings) — informational
pairs.push(['ink500 on iron900 (decorative index)', C.ink500, C.iron900, false]);
pairs.push(['blurple on discord800 (colour only, never small text)', C.blurple, C.discord800, false]);

let failed = 0;
for (const [label, fg, bg, isText] of pairs) {
  const r = ratio(fg, bg);
  const ok = !isText || r >= 4.5;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2).padStart(6)}:1  ${isText ? 'text' : 'deco'}  ${label}`);
}
if (failed) {
  console.error(`\n${failed} text pair(s) below 4.5:1`);
  process.exit(1);
}
console.log(`\nOK: ${pairs.filter((p) => p[3]).length} text pairs at or above 4.5:1`);
