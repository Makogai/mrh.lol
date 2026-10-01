// Integration audit run against the production preview (lead's final pass).
//   node scripts/qa/integration.mjs [--url http://localhost:4173]
// Covers what shots.mjs / fps.mjs do not: overflow sampled continuously at 390 px (including after a click and a tap),
// frame timing at 1440 px under 4x CPU throttle with p50/p95/dropped frames, one-h1, and a keyboard tab-through that
// checks every stop has a visible focus indicator. Exit 1 on any failure.
import { launch, sleep } from './lib/browser.mjs';

const args = process.argv.slice(2);
const i = args.indexOf('--url');
const base = i >= 0 ? args[i + 1] : 'http://localhost:4173';

const failures = [];
const check = (cond, msg) => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${msg}`);
  if (!cond) failures.push(msg);
};
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

const browser = await launch();
try {
  // ── 1. Overflow at 390, sampled during animation, after a click pulse and after a tap ──────────────────────────
  console.log('Overflow at 390x844 (sampled every 200 ms)');
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const samples = [];
    const sample = async (label) => {
      const s = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        bw: document.body.scrollWidth,
        iw: window.innerWidth,
      }));
      samples.push({ label, ...s });
    };
    await page.goto(`${base}/?fxdebug`, { waitUntil: 'domcontentloaded' });
    for (let t = 0; t < 30; t++) { await sample('load+animation'); await sleep(200); }
    await page.mouse.click(195, 300); // click pulse through the board (mouse path)
    for (let t = 0; t < 15; t++) { await sample('after click'); await sleep(200); }
    await page.touchscreen.tap(120, 200); // touch path
    for (let t = 0; t < 15; t++) { await sample('after tap'); await sleep(200); }
    await page.evaluate(() => window.__mrhFx?.flight?.());
    for (let t = 0; t < 15; t++) { await sample('during flight'); await sleep(200); }
    const worst = Math.max(...samples.map((s) => Math.max(s.sw, s.bw)));
    const bad = samples.filter((s) => s.sw > s.iw || s.bw > s.iw);
    console.log(`  ${samples.length} samples, max scrollWidth/bodyScrollWidth ${worst}, innerWidth ${samples[0].iw}`);
    check(bad.length === 0, `scrollWidth <= innerWidth in all ${samples.length} samples (${bad.length} violations)`);
    await page.close();
  }

  // ── 2. Frame timing at 1440, 4x CPU throttle ───────────────────────────────────────────────────────────────────
  console.log('Frame timing 1440x900@1, 4x CPU throttle, 3.5 s hero, pointer sweep + 1 click');
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await (await page.createCDPSession()).send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluateOnNewDocument(() => {
      window.__long = [];
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: 'longtask', buffered: true }); } catch { /* unsupported */ }
    });
    await page.goto(`${base}/?fxdebug`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__mrhFx && window.__mrhFx.nodes > 0, { timeout: 15000 }).catch(() => {});
    await sleep(1500); // let growth settle a little; the window below still covers steady-state animation + interaction
    await page.evaluate(() => {
      window.__iv = new Promise((res) => {
        const iv = []; let last = 0; const end = performance.now() + 3500;
        const tick = (t) => { if (last) iv.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); else res(iv); };
        requestAnimationFrame(tick);
      });
      window.__long.length = 0;
    });
    const t0 = Date.now(); let n = 0;
    while (Date.now() - t0 < 3500) {
      const a = (Date.now() - t0) / 600;
      await page.mouse.move(1440 * (0.5 + 0.35 * Math.cos(a)), 900 * (0.4 + 0.25 * Math.sin(a * 1.3)));
      if (n === 60) await page.mouse.click(900, 400);
      n++; await sleep(16);
    }
    const iv = await page.evaluate(() => window.__iv);
    const long = await page.evaluate(() => window.__long.slice());
    const fx = await page.evaluate(() => window.__mrhFx ?? null);
    const sorted = [...iv].sort((a, b) => a - b);
    const dropped = iv.filter((v) => v > 25).length; // > 1.5 vsync periods = at least one missed frame
    const severe = iv.filter((v) => v > 50).length;
    const f = (v) => v.toFixed(1);
    console.log(`  frames ${iv.length}, p50 ${f(pct(sorted, 0.5))} ms, p95 ${f(pct(sorted, 0.95))} ms, p99 ${f(pct(sorted, 0.99))} ms, max ${f(sorted[sorted.length - 1])} ms`);
    console.log(`  dropped (>25 ms) ${dropped} = ${(dropped / iv.length * 100).toFixed(1)} %, >50 ms ${severe}, long tasks ${long.length}${long.length ? ` (max ${f(Math.max(...long))} ms)` : ''}`);
    console.log(`  engine: avgFrameMs ${fx ? f(fx.avgFrameMs) : 'n/a'}, quality level ${fx?.quality}, dpr ${fx?.dpr}, nodes ${fx?.nodes}`);
    check(iv.length > 100, 'enough frames sampled');
    await page.close();
  }

  // ── 3. h1 count + keyboard tab-through ─────────────────────────────────────────────────────────────────────────
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    console.log(`Semantics + keyboard at ${vp.width}x${vp.height}`);
    const page = await browser.newPage();
    await page.setViewport({ ...vp, deviceScaleFactor: 1 });
    await page.goto(base, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await sleep(1200);
    const h1 = await page.evaluate(() => [...document.querySelectorAll('h1')].map((h) => { const c = h.cloneNode(true); c.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove()); return c.textContent; }));
    check(h1.length === 1, `exactly one h1 (found ${h1.length}: ${JSON.stringify(h1)})`);
    const h2 = await page.evaluate(() => document.querySelectorAll('h2').length);
    console.log(`  h2 count ${h2}`);

    const stops = [];
    for (let k = 0; k < 40; k++) {
      await page.keyboard.press('Tab');
      // html has scroll-behavior: smooth: wait for the scroll position to stop moving before judging visibility.
      let y = -1;
      for (let w = 0; w < 40; w++) { await sleep(50); const ny = await page.evaluate(() => Math.round(window.scrollY)); if (ny === y) break; y = ny; }
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        return {
          tag: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
          label,
          outlineStyle: cs.outlineStyle,
          outlineWidth: parseFloat(cs.outlineWidth),
          outlineColor: cs.outlineColor,
          boxShadow: cs.boxShadow,
          w: Math.round(r.width), h: Math.round(r.height),
          inViewport: r.bottom > 0 && r.top < window.innerHeight,
        };
      });
      if (!info) break;
      if (stops.length && stops[0].tag === info.tag && stops[0].label === info.label) break; // wrapped around
      stops.push(info);
    }
    for (const s of stops) {
      const ring = s.outlineStyle !== 'none' && s.outlineWidth >= 2;
      console.log(`  ${ring ? 'ok  ' : 'FAIL'}  ${s.tag.padEnd(14)} ${s.label.padEnd(42)} outline ${s.outlineStyle} ${s.outlineWidth}px ${s.outlineColor}  ${s.w}x${s.h}${s.inViewport ? '' : ' (OFFSCREEN)'}`);
      if (!ring) failures.push(`no visible focus ring on ${s.tag} "${s.label}" at ${vp.width}`);
      if (!s.inViewport) failures.push(`focused element not scrolled into view: ${s.tag} "${s.label}" at ${vp.width}`);
    }
    check(stops.length >= 5, `${stops.length} tab stops reached`);
    check(!stops.some((s) => /honeypot|website|company/i.test(s.label)), 'honeypot field is not a tab stop');
    await page.close();
  }
} finally {
  await browser.close();
}

if (failures.length) { console.log(`\nINTEGRATION RESULT: FAIL (${failures.length})`); process.exit(1); }
console.log('\nINTEGRATION RESULT: pass');
