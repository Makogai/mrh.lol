// Screenshots the live Prospecting Atlas home page and writes the card renditions (BUILD_PLAN §9.3).
//   npm run gen:shots
// Local-only: outputs are committed under public/projects/, the Docker build never runs this.
// Headless Chrome with a throwaway profile — never the owner's browser.
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';

const URL_ = 'https://prospecting.mrh.lol/';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outDir = resolve(fileURLToPath(new URL('../public/projects/', import.meta.url)));

await mkdir(outDir, { recursive: true });
const userDataDir = await mkdtemp(join(tmpdir(), 'mrh-shoot-'));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir,
  args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars'],
});

let png;
try {
  const page = await browser.newPage();
  // DPR 1 on purpose: the card shows it at <= 760 CSS px, and 1440 px is already the 2x source for that.
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(URL_, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  // Animations/transitions off so entrance effects can't be caught half-way; caret hidden in case a search box autofocuses.
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}html{scrollbar-width:none!important}::-webkit-scrollbar{display:none!important}',
  });
  await new Promise((r) => setTimeout(r, 600));
  const title = await page.title();
  if (!/Prospecting Atlas/i.test(title)) throw new Error(`Unexpected page title "${title}" — is ${URL_} serving the Atlas?`);
  png = await page.screenshot({ type: 'png' });
} finally {
  await browser.close();
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}

const kb = async (file) => `${((await stat(file)).size / 1024).toFixed(1)} KB`;
const targets = { avif: 120, webp: 180 };

for (const w of [720, 1440]) {
  const base = sharp(png).resize({ width: w, height: Math.round((w * 900) / 1440) });
  for (const ext of ['avif', 'webp']) {
    const file = join(outDir, `prospecting-atlas-${w}.${ext}`);
    await base.clone()[ext](ext === 'avif' ? { quality: 52, effort: 6 } : { quality: 80 }).toFile(file);
    const size = (await stat(file)).size / 1024;
    console.log(`${file.split(/[\\/]/).pop().padEnd(32)} ${await kb(file)}${w === 1440 && size > targets[ext] ? `   (over the ${targets[ext]} KB target)` : ''}`);
  }
}
const jpg = join(outDir, 'prospecting-atlas-1440.jpg');
await sharp(png).jpeg({ quality: 82, mozjpeg: true }).toFile(jpg);
console.log(`${'prospecting-atlas-1440.jpg'.padEnd(32)} ${await kb(jpg)}`);
