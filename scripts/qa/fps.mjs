// Frame-rate + pause audit for the Forge Board (BUILD_PLAN §13.2).
//   node scripts/qa/fps.mjs [--url http://localhost:4174] [--port 4174] [--seconds 6]
// Without --url it starts `vite preview` on --port itself (honours MRH_PKG) and stops it afterwards.
// Exit 1 on any failed check or a desktop p95 frame interval above 18 ms.
import { launch, sleep, startPreview } from './lib/browser.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const SECONDS = Number(opt('seconds', '6'));
const P95_LIMIT = 18;

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.log(`  FAIL  ${msg}`);
};
const ok = (msg) => console.log(`  ok    ${msg}`);
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const fx = (page) => page.evaluate(() => window.__mrhFx ?? null);

async function open(browser, base, vp, { reduced = false, cpu = 1 } = {}) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (cpu > 1) await (await page.createCDPSession()).send('Emulation.setCPUThrottlingRate', { rate: cpu });
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  // A single in-page long-task log; read back after the measurement window.
  await page.evaluateOnNewDocument(() => {
    window.__long = [];
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: 'longtask', buffered: true });
    } catch { /* longtask unsupported */ }
  });
  await page.goto(`${base}/?fxdebug`, { waitUntil: 'load', timeout: 60000 });
  // the engine boots after idle + fonts; wait for it to be up
  await page.waitForFunction(() => window.__mrhFx && window.__mrhFx.nodes > 0, { timeout: 15000 }).catch(() => {});
  return page;
}

/** Records rAF intervals for `seconds` while the pointer sweeps the hero and clicks twice (lantern + pulses under load). */
async function measure(page, vp, seconds) {
  await page.evaluate((s) => {
    window.__iv = new Promise((res) => {
      const iv = [];
      let last = 0;
      const end = performance.now() + s * 1000;
      const tick = (t) => {
        if (last) iv.push(t - last);
        last = t;
        if (t < end) requestAnimationFrame(tick);
        else res(iv);
      };
      requestAnimationFrame(tick);
    });
    window.__long.length = 0;
  }, seconds);
  const t0 = Date.now();
  const w = vp.width;
  const h = vp.height;
  let n = 0;
  while (Date.now() - t0 < seconds * 1000) {
    const a = (Date.now() - t0) / 700;
    await page.mouse.move(w * (0.5 + 0.35 * Math.cos(a)), h * (0.4 + 0.25 * Math.sin(a * 1.3)));
    if (n === 40 || n === 110) await page.mouse.down().then(() => page.mouse.up());
    n++;
    await sleep(16);
  }
  const iv = await page.evaluate(() => window.__iv);
  const long = await page.evaluate(() => window.__long.slice());
  const sorted = [...iv].sort((a, b) => a - b);
  const avg = iv.reduce((s, v) => s + v, 0) / iv.length;
  return {
    frames: iv.length,
    fps: 1000 / avg,
    avg,
    p95: pct(sorted, 0.95),
    p99: pct(sorted, 0.99),
    max: sorted[sorted.length - 1],
    longTasks: long.length,
    longMax: long.length ? Math.max(...long) : 0,
    fx: await fx(page),
  };
}

const f1 = (v) => v.toFixed(1);
function report(label, r) {
  console.log(`  ${label}: ${r.frames} frames, ${f1(r.fps)} fps avg, interval avg ${f1(r.avg)} ms / p95 ${f1(r.p95)} ms / p99 ${f1(r.p99)} ms / max ${f1(r.max)} ms`);
  console.log(`  ${label}: long tasks ${r.longTasks}${r.longTasks ? ` (max ${f1(r.longMax)} ms)` : ''}; engine avgFrameMs ${r.fx ? f1(r.fx.avgFrameMs) : 'n/a'} ms, quality level ${r.fx?.quality}, dpr ${r.fx?.dpr}, nodes ${r.fx?.nodes}, genMs ${r.fx ? f1(r.fx.genMs) : 'n/a'}, staticMs ${r.fx ? f1(r.fx.staticMs) : 'n/a'}`);
}

async function pauseChecks(page) {
  console.log('Pause checks');
  const frames = async () => (await fx(page))?.frames ?? -1;
  const running = async () => (await fx(page))?.running;

  check((await running()) === true, 'running at the top of the page');

  // Scrolled past: IntersectionObserver flips inView, the loop must stop within 500 ms.
  await page.evaluate(() => window.scrollTo({ top: document.querySelector('#work').offsetTop, behavior: 'instant' }));
  await sleep(500);
  check((await running()) === false, 'running === false within 500 ms of scrolling to #work');
  const f0 = await frames();
  await sleep(400);
  check((await frames()) === f0, 'frames stop increasing while scrolled past');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await sleep(500);
  check((await running()) === true, 'running again after scrolling back to the top');
  const f1_ = await frames();
  await sleep(300);
  check((await frames()) > f1_, 'frames increase again after scrolling back');

  // Hidden tab. Headless Chrome keeps background pages "visible", so fake it the way a real tab would look to the page.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await sleep(400);
  check((await running()) === false, 'running === false when the tab is hidden');
  const h0 = await frames();
  await sleep(400);
  check((await frames()) === h0, 'frames stop increasing while hidden');
  await page.evaluate(() => {
    delete document.visibilityState;
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await sleep(400);
  check((await running()) === true, 'running again when the tab becomes visible');
}

async function reducedCheck(browser, base, vp) {
  console.log('Reduced motion');
  const page = await open(browser, base, vp, { reduced: true });
  await sleep(2500);
  const s = await fx(page);
  check(Boolean(s) && s.reduced === true, 'engine reports reduced motion');
  check(Boolean(s) && s.frames === 0 && s.running === false, `no animation frames (frames=${s?.frames}, running=${s?.running})`);
  const ready = await page.evaluate(() => document.querySelector('.hero-fx')?.hasAttribute('data-ready'));
  check(ready === true, 'static frame is shown (data-ready set)');
  await sleep(600);
  check((await fx(page))?.frames === 0, 'frames still 0 after 600 ms more');
  await page.close();
}

const preview = opt('url') ? null : await startPreview(Number(opt('port', '4174')));
const base = opt('url', preview?.url);
const browser = await launch();
try {
  const desktop = { width: 1440, height: 900, deviceScaleFactor: 2 };
  console.log(`Desktop ${desktop.width}x${desktop.height} @${desktop.deviceScaleFactor}, ${SECONDS} s`);
  const dPage = await open(browser, base, desktop);
  if (!(await fx(dPage))) fail('window.__mrhFx never appeared (engine did not start)');
  await sleep(500); // include growth + boot pulse in the window
  const d = await measure(dPage, desktop, SECONDS);
  report('desktop', d);
  check(d.p95 <= P95_LIMIT, `desktop p95 ${f1(d.p95)} ms <= ${P95_LIMIT} ms`);
  await pauseChecks(dPage);
  await dPage.close();

  const phone = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
  console.log(`Phone ${phone.width}x${phone.height} @${phone.deviceScaleFactor}, 4x CPU throttle, ${SECONDS} s`);
  const pPage = await open(browser, base, phone, { cpu: 4 });
  await sleep(500);
  const p = await measure(pPage, phone, SECONDS);
  report('phone (4x CPU)', p);
  await pPage.close();

  await reducedCheck(browser, base, desktop);
} finally {
  await browser.close();
  await preview?.stop();
}

if (failures.length) {
  console.log(`\nFPS RESULT: FAIL (${failures.length})`);
  process.exit(1);
}
console.log('\nFPS RESULT: pass');
