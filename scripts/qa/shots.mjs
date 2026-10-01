// Screenshots + overflow/console audit at the four design widths (BUILD_PLAN §13.1).
//   node scripts/qa/shots.mjs [--url http://localhost:4173] [--port 4173] [--out .qa/<pkg>/shots] [--reduced]
// Without --url it starts `vite preview` on --port itself (honours MRH_PKG) and stops it afterwards.
// Exit 1 on horizontal overflow, console errors, page errors or failed requests.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launch, sleep, startPreview } from './lib/browser.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const reduced = flag('reduced');
const port = Number(opt('port', '4173'));
const outDir = resolve(opt('out', `.qa/${process.env.MRH_PKG || 'lead'}/shots`));
const suffix = reduced ? '-reduced' : '';

const VIEWPORTS = [
  { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { width: 768, height: 1024, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
  { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { width: 2560, height: 1440, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];
// Chrome cannot rasterise a bitmap taller than ~16 k px; a 390 px DPR 3 full page can exceed that.
const MAX_BITMAP = 16000;

/** Runs in the page. Returns overflow facts for the current scroll position. */
function measure() {
  const vw = window.innerWidth;
  const doc = document.documentElement;
  const contained = (el) => {
    // An ancestor box that deliberately clips (Trap #2: animate inside a pinned, clipped box) and itself fits the
    // viewport makes the child's overshoot harmless. html/body clipping does NOT count — that is the very thing hiding a bug.
    for (let p = el.parentElement; p && p !== document.body && p !== doc; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(hidden|clip|auto|scroll)/.test(cs.overflowX) && p.getBoundingClientRect().right <= vw + 0.5) return true;
    }
    return false;
  };
  const offenders = [];
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.right <= vw + 0.5) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (cs.position === 'absolute' && r.width <= 1 && r.height <= 1) continue; // .sr-only
    if (contained(el)) continue;
    offenders.push({
      el: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}` : ''}`,
      right: Math.round(r.right * 10) / 10,
      over: Math.round((r.right - vw) * 10) / 10,
    });
  }
  return {
    innerWidth: vw,
    scrollWidth: doc.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    scrollY: Math.round(window.scrollY),
    docHeight: doc.scrollHeight,
    offenders: offenders.slice(0, 15),
    offenderCount: offenders.length,
  };
}

const isFavicon = (url = '') => /\/favicon\.ico(\?|$)/.test(url);

async function auditViewport(browser, base, vp) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

  const consoleMsgs = [];
  const pageErrors = [];
  const failed = [];
  page.on('console', (m) => {
    if (['error', 'warn', 'warning'].includes(m.type())) {
      consoleMsgs.push({ type: m.type() === 'warn' ? 'warning' : m.type(), text: m.text(), url: m.location()?.url ?? '' });
    }
  });
  page.on('pageerror', (e) => pageErrors.push(String(e?.stack || e)));
  page.on('requestfailed', (r) => failed.push({ url: r.url(), reason: r.failure()?.errorText ?? 'failed' }));
  page.on('response', (r) => { if (r.status() >= 400) failed.push({ url: r.url(), reason: `HTTP ${r.status()}` }); });

  await page.goto(base, { waitUntil: 'load', timeout: 60000 });
  const t0 = Date.now();
  const at = async (ms) => { const wait = t0 + ms - Date.now(); if (wait > 0) await sleep(wait); };

  const checks = [];
  const check = async (label) => checks.push({ label, ...(await page.evaluate(measure)) });

  await at(300); await check('0.3s');
  await at(1500); await check('1.5s');
  await page.evaluate(() => document.fonts.ready);
  await at(1800); // let the hero grow before the money shot
  await page.screenshot({ path: resolve(outDir, `hero-${vp.width}${suffix}.png`) });
  await at(3000); await check('3s');

  // Walk down in viewport steps so every IntersectionObserver reveal fires (a full-page shot would otherwise show
  // unrevealed, opacity-0 sections), then check the bottom.
  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < docHeight; y += Math.round(vp.height * 0.8)) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
    await sleep(140);
  }
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await sleep(700);
  await check('bottom');

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await sleep(500);
  const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const dpr = Math.min(vp.deviceScaleFactor, MAX_BITMAP / fullHeight);
  if (dpr < vp.deviceScaleFactor) await page.setViewport({ ...vp, deviceScaleFactor: dpr });
  await page.screenshot({ path: resolve(outDir, `full-${vp.width}${suffix}.png`), fullPage: true });

  const hasIcon = await page.evaluate(() => Boolean(document.querySelector('link[rel~="icon"]')));
  await page.close();

  // Chrome asks for /favicon.ico on its own. Until the head declares an icon that 404 is expected noise → warning.
  const warnings = [];
  const keep = (list, test) => list.filter((e) => {
    if (!hasIcon && test(e)) { warnings.push(`no <link rel="icon">: ignored favicon.ico request (${e.reason ?? e.text})`); return false; }
    return true;
  });
  const failedRequests = keep(failed, (e) => isFavicon(e.url));
  const consoleIssues = keep(consoleMsgs, (e) => isFavicon(e.url));

  const overflow = checks.filter((c) => c.scrollWidth > c.innerWidth || c.bodyScrollWidth > c.innerWidth || c.offenderCount > 0);
  const errors = consoleIssues.filter((m) => m.type === 'error');
  return {
    viewport: `${vp.width}x${vp.height}@${vp.deviceScaleFactor}`,
    checks,
    overflow: overflow.map((c) => c.label),
    consoleErrors: errors,
    consoleWarnings: consoleIssues.filter((m) => m.type === 'warning'),
    pageErrors,
    failedRequests,
    warnings: [...new Set(warnings)],
    fullPageDocHeight: fullHeight,
    pass: overflow.length === 0 && errors.length === 0 && pageErrors.length === 0 && failedRequests.length === 0,
  };
}

await mkdir(outDir, { recursive: true });

let preview = null;
let base = opt('url', null);
if (!base) {
  preview = await startPreview(port);
  base = preview.url;
}

const browser = await launch();
const results = [];
try {
  for (const vp of VIEWPORTS) results.push(await auditViewport(browser, base, vp));
} finally {
  await browser.close();
  await preview?.stop();
}

const summary = { url: base, reduced, outDir, pass: results.every((r) => r.pass), results };
await writeFile(resolve(outDir, `summary${suffix}.json`), JSON.stringify(summary, null, 2));

for (const r of results) {
  console.log(`\n${r.pass ? 'PASS' : 'FAIL'}  ${r.viewport}${reduced ? '  (reduced motion)' : ''}`);
  for (const c of r.checks) {
    const bad = c.scrollWidth > c.innerWidth || c.bodyScrollWidth > c.innerWidth || c.offenderCount > 0;
    console.log(`  ${bad ? '!!' : 'ok'} ${c.label.padEnd(6)} scrollWidth ${c.scrollWidth}/${c.innerWidth}  y=${c.scrollY}`);
    for (const o of c.offenders) console.log(`       overflow ${o.over}px: ${o.el}`);
  }
  for (const e of r.consoleErrors) console.log(`  console error: ${e.text}`);
  for (const e of r.consoleWarnings) console.log(`  console warning: ${e.text}`);
  for (const e of r.pageErrors) console.log(`  page error: ${e.split('\n')[0]}`);
  for (const e of r.failedRequests) console.log(`  failed request: ${e.url} (${e.reason})`);
  for (const w of r.warnings) console.log(`  warning: ${w}`);
}
console.log(`\nScreenshots + summary${suffix}.json: ${outDir}`);
console.log(summary.pass ? 'RESULT: pass' : 'RESULT: FAIL');
process.exit(summary.pass ? 0 : 1);
