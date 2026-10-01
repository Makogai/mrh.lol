// Lighthouse, mobile (default config) and desktop (--preset=desktop), against the Docker container by default —
// `vite preview` does not gzip, which skews the performance numbers (BUILD_PLAN §13.2).
//   node scripts/qa/lighthouse.mjs [url] [--out <dir>] [--runs N]      default url: http://localhost:8080, 1 mobile run
// --runs N repeats the MOBILE run N times (Lighthouse's simulated throttling still varies with host load) and gates on the
// WORST run's scores, so a lucky run can't hide a flaky one; the median of each metric is printed alongside.
// Exits 1 when any MOBILE run is below Performance 95 / Accessibility 100 / Best Practices 100 / SEO 100.
// Lighthouse launches its own headless Chrome with a throwaway profile (chrome-launcher) — never the user's browser.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const runsFlag = args.indexOf('--runs');
const RUNS = runsFlag >= 0 ? Math.max(1, Number(args[runsFlag + 1]) || 1) : 1;
const url = args.find((a, i) => !a.startsWith('--') && i !== outFlag + 1 && i !== runsFlag + 1) ?? 'http://localhost:8080';
const outDir = resolve(outFlag >= 0 ? args[outFlag + 1] : `.qa/${process.env.MRH_PKG ?? 'lead'}/lighthouse`);
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync(outDir, { recursive: true });

const LIGHTHOUSE = 'lighthouse@13.5.0';
const THRESHOLDS = { performance: 95, accessibility: 100, 'best-practices': 100, seo: 100 };

function run(mode, n = 0) {
  const file = resolve(outDir, n ? `lighthouse-${mode}-run${n}.json` : `lighthouse-${mode}.json`);
  // One command string with explicit quoting: with `shell: true` Node joins argv with plain spaces, and the Chrome
  // path contains one.
  const cmd = [
    'npx -y', LIGHTHOUSE, `"${url}"`,
    `--chrome-path="${chrome}"`, '--chrome-flags="--headless=new --no-first-run"',
    '--output=json', `--output-path="${file}"`, '--quiet',
    '--only-categories=performance,accessibility,best-practices,seo',
    ...(mode === 'desktop' ? ['--preset=desktop'] : []),
  ].join(' ');
  console.log(`> ${mode}${n ? ` run ${n}/${RUNS}` : ''}: lighthouse ${url}`);
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
    SI: fmtMs(audit('speed-index')?.numericValue),
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

const mobileRuns = [];
for (let n = 1; n <= RUNS; n++) mobileRuns.push(summarise('mobile', run('mobile', RUNS > 1 ? n : 0)));
const desktop = summarise('desktop', run('desktop'));

const strip = (row) => Object.fromEntries(Object.entries(row).filter(([c]) => c !== 'mode'));
console.log('');
const table = {};
mobileRuns.forEach((r, i) => (table[`mobile ${i + 1}`] = strip(r.row)));
table.desktop = strip(desktop.row);
console.table(table);

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const num = (v) => parseFloat(String(v));
if (RUNS > 1) {
  const med = { performance: median(mobileRuns.map((r) => r.row.performance)) };
  for (const k of ['LCP', 'SI', 'TBT', 'FCP']) med[k] = `${Math.round(median(mobileRuns.map((r) => num(r.row[k]))))} ms`;
  console.log('mobile median over', RUNS, 'runs:', med);
}
const labelled = [...mobileRuns.map((r, i) => ['mobile ' + (i + 1), r]), ['desktop', desktop]];
for (const [mode, { misses }] of labelled) {
  if (misses.length) console.log(`${mode} audits below 100:\n  - ${misses.join('\n  - ')}`);
}
console.log(`Full reports: ${outDir}`);

const failures = [];
for (const [cat, min] of Object.entries(THRESHOLDS)) {
  const worst = Math.min(...mobileRuns.map((r) => r.row[cat]));
  if (worst < min) failures.push(`${cat} ${worst} < ${min}`);
}
if (failures.length) {
  console.error(`\nFAIL (mobile, worst of ${RUNS}): ${failures.join(', ')}`);
  process.exit(1);
}
console.log(`\nOK: mobile meets 95 / 100 / 100 / 100 on every one of ${RUNS} run(s).`);
