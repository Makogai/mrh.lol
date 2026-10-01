// Lighthouse, mobile (default config) and desktop (--preset=desktop), against the Docker container by default —
// `vite preview` does not gzip, which skews the performance numbers (BUILD_PLAN §13.2).
//   node scripts/qa/lighthouse.mjs [url] [--out <dir>]      default url: http://localhost:8080
// Exits 1 when the MOBILE run is below Performance 95 / Accessibility 100 / Best Practices 100 / SEO 100.
// Lighthouse launches its own headless Chrome with a throwaway profile (chrome-launcher) — never the user's browser.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const url = args.find((a, i) => !a.startsWith('--') && i !== outFlag + 1) ?? 'http://localhost:8080';
const outDir = resolve(outFlag >= 0 ? args[outFlag + 1] : `.qa/${process.env.MRH_PKG ?? 'lead'}/lighthouse`);
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync(outDir, { recursive: true });

const LIGHTHOUSE = 'lighthouse@13.5.0';
const THRESHOLDS = { performance: 95, accessibility: 100, 'best-practices': 100, seo: 100 };

function run(mode) {
  const file = resolve(outDir, `lighthouse-${mode}.json`);
  // One command string with explicit quoting: with `shell: true` Node joins argv with plain spaces, and the Chrome
  // path contains one.
  const cmd = [
    'npx -y', LIGHTHOUSE, `"${url}"`,
    `--chrome-path="${chrome}"`, '--chrome-flags="--headless=new --no-first-run"',
    '--output=json', `--output-path="${file}"`, '--quiet',
    '--only-categories=performance,accessibility,best-practices,seo',
    ...(mode === 'desktop' ? ['--preset=desktop'] : []),
  ].join(' ');
  console.log(`> ${mode}: lighthouse ${url}`);
  const res = spawnSync(cmd, { shell: true, stdio: ['ignore', 'inherit', 'inherit'], timeout: 5 * 60_000 });
  if (res.status !== 0) throw new Error(`lighthouse (${mode}) exited with ${res.status ?? res.signal}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

const fmtMs = (v) => (v == null ? 'n/a' : `${Math.round(v)} ms`);
const kb = (b) => `${(b / 1024).toFixed(1)} KB`;

function summarise(mode, lhr) {
  const score = (id) => Math.round((lhr.categories[id]?.score ?? 0) * 100);
  const audit = (id) => lhr.audits[id];
  const scripts = audit('resource-summary')?.details?.items?.find((i) => i.resourceType === 'script');
  const row = {
    mode,
    performance: score('performance'),
    accessibility: score('accessibility'),
    'best-practices': score('best-practices'),
    seo: score('seo'),
    LCP: fmtMs(audit('largest-contentful-paint')?.numericValue),
    TBT: fmtMs(audit('total-blocking-time')?.numericValue),
    CLS: (audit('cumulative-layout-shift')?.numericValue ?? NaN).toFixed(3),
    FCP: fmtMs(audit('first-contentful-paint')?.numericValue),
    'JS transferred': scripts ? kb(scripts.transferSize) : 'n/a',
  };

  // Anything not scoring 100 in the three "must be perfect" categories, so a miss is actionable straight away.
  const misses = [];
  for (const cat of ['accessibility', 'best-practices', 'seo']) {
    for (const ref of lhr.categories[cat].auditRefs) {
      const a = lhr.audits[ref.id];
      if (a.score !== null && a.score < 1 && a.scoreDisplayMode !== 'informative') misses.push(`${cat}: ${a.title}`);
    }
  }
  return { row, misses };
}

const runs = {};
for (const mode of ['mobile', 'desktop']) runs[mode] = summarise(mode, run(mode));

console.log('');
console.table(Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, Object.fromEntries(Object.entries(v.row).filter(([c]) => c !== 'mode'))])));
for (const [mode, { misses }] of Object.entries(runs)) {
  if (misses.length) console.log(`${mode} audits below 100:\n  - ${misses.join('\n  - ')}`);
}
console.log(`Full reports: ${outDir}`);

const mobile = runs.mobile.row;
const failures = Object.entries(THRESHOLDS).filter(([cat, min]) => mobile[cat] < min).map(([cat, min]) => `${cat} ${mobile[cat]} < ${min}`);
if (failures.length) {
  console.error(`\nFAIL (mobile): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nOK: mobile meets 95 / 100 / 100 / 100.');
