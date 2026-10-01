// Shared QA plumbing: a throwaway headless Chrome and a `vite preview` server. Used by every qa:* script.
// Never attaches to the user's own Chrome — each launch gets a fresh profile directory that is deleted on close.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

export const CHROME_PATH = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/** Launches headless Chrome with a fresh temp profile; `browser.close()` also removes the profile. */
export async function launch(extra = {}) {
  const userDataDir = await mkdtemp(join(tmpdir(), 'mrh-qa-chrome-'));
  const { args = [], ...rest } = extra;
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    userDataDir,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions', ...args],
    ...rest,
  });
  const close = browser.close.bind(browser);
  browser.close = async () => {
    try { await close(); } finally {
      // Chrome can hold file locks for a moment after exit on Windows; retry instead of leaking profiles.
      await rm(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
    }
  };
  return browser;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, child, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let exited = false;
  child.once('exit', () => { exited = true; });
  while (Date.now() < deadline) {
    if (exited) throw new Error(`vite preview exited before answering on ${url}`);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error(`vite preview did not answer on ${url} within ${timeoutMs / 1000}s`);
}

/**
 * Spawns `npx vite preview --port <port> --strictPort`, inheriting the environment (so MRH_PKG selects dist-<pkg>),
 * waits until it answers and returns `{ url, stop }`. `stop()` kills the whole process tree: with a shell in between
 * (needed for npx on Windows) a plain child.kill() would orphan the node process and keep the port busy.
 */
export async function startPreview(port = 4173) {
  const isWin = process.platform === 'win32';
  const child = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    env: process.env,
    shell: true,
    detached: !isWin, // own process group on POSIX so stop() can signal the group
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });

  const stop = async () => {
    if (child.exitCode !== null || !child.pid) return;
    if (isWin) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ } }
  };

  const url = `http://localhost:${port}`;
  try {
    await waitForServer(url, child);
  } catch (err) {
    await stop();
    throw new Error(`${err.message}\n--- vite preview output ---\n${log.trim()}`);
  }
  return { url, stop };
}
