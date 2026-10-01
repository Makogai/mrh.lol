// Small shared helpers for the avatar pipeline (no deps beyond node core).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
export const h8 = (b) => sha256(b).slice(0, 8);

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Write to a temp file in the same directory, then rename over the target. A reader (the vite dev server, the
 * renderer's tests) therefore never sees a half-written file. Windows can answer EPERM/EBUSY for a moment when
 * a scanner or server still holds the old file open, hence the retry.
 */
export function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data);
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, file); return; }
    catch (e) {
      if (i >= 40 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { try { fs.unlinkSync(tmp); } catch {} throw e; }
      sleep(50);
    }
  }
}

export const kb = (n) => (n / 1024).toFixed(1) + ' KB';
export const round = (x, d = 4) => { const m = 10 ** d; return Math.round(x * m) / m; };
export const fmt3 = (a) => '(' + a.map((x) => x.toFixed(3)).join(', ') + ')';
export const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

export function timer() {
  const t0 = performance.now(); let last = t0; const laps = {};
  return { lap(name) { const n = performance.now(); laps[name] = Math.round(n - last); last = n; },
    total: () => Math.round(performance.now() - t0), laps };
}
