// Roblox presence: ONE module-level store shared by the player card and the Contact tile, so there is exactly one
// network loop however many consumers exist. Nothing here runs on the server or before a consumer is on screen.
//
// Policy (docs/PLAYER_INTEGRATION.md §4):
//  - first fetch when a watched element first becomes visible; then every 60 s while one is visible AND the tab is visible;
//  - coming back to the tab fetches at once if the last attempt is older than 60 s;
//  - 5 s timeout per request; leaving the screen (or unmounting) aborts the request in flight;
//  - after a failure the last good value is kept for up to 180 s, then everything falls back to "unknown" (neutral label);
//  - presence: 'off' never fetches (watch() is a no-op).
import { site } from '../config/site';

export type PresenceKind = 'unknown' | 'online' | 'game' | 'studio' | 'offline';
export interface Presence {
  kind: PresenceKind;
  /** Only ever set in `presence: 'game'` mode and while in a game; 'status' mode drops it at parse time. */
  game: string | null;
  placeId: number | null;
  /** Bumps on a known -> different known transition (not on the first load); drives the teal trace pulse. */
  rev: number;
}

const REFRESH_MS = 60_000;
const TIMEOUT_MS = 5_000;
const STALE_MS = 180_000;

const cfg = site.roblox;
/** The SSR snapshot and the initial client snapshot: the same object, so hydration is trivially identical. */
export const NEUTRAL: Presence = { kind: 'unknown', game: null, placeId: null, rev: 0 };

let state: Presence = NEUTRAL;
let lastGoodAt = 0; // 0 = never had a good value
let lastAttemptAt = 0;
let timer: number | undefined;
let ctl: AbortController | null = null;
let io: IntersectionObserver | null = null;
const watched = new Set<Element>();
const inView = new Set<Element>();
const listeners = new Set<() => void>();

export const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};
export const getSnapshot = (): Presence => state;
export const getServerSnapshot = (): Presence => NEUTRAL;

function publish(next: Omit<Presence, 'rev'>): void {
  if (next.kind === state.kind && next.game === state.game && next.placeId === state.placeId) return;
  const changed = state.kind !== 'unknown' && next.kind !== 'unknown' && next.kind !== state.kind;
  state = { ...next, rev: state.rev + (changed ? 1 : 0) };
  for (const l of listeners) l();
}

/** Defensive: Roblox owns this payload. Anything unexpected throws, which counts as a failed refresh. */
function parse(json: unknown): Omit<Presence, 'rev'> {
  const p = (json as { userPresences?: unknown[] } | null)?.userPresences?.[0] as
    | { userPresenceType?: unknown; lastLocation?: unknown; placeId?: unknown }
    | undefined;
  const t = p?.userPresenceType;
  if (typeof t !== 'number' || !Number.isInteger(t) || t < 0 || t > 4) throw new Error('unexpected presence payload');
  const kind: PresenceKind = t === 1 ? 'online' : t === 2 ? 'game' : t === 3 ? 'studio' : 'offline'; // 0 and 4 (invisible) = offline
  // 'status' mode never keeps the game name or id around, so no component can leak it by accident.
  const wantGame = cfg.presence === 'game' && kind === 'game';
  const name = wantGame && typeof p?.lastLocation === 'string' ? p.lastLocation.trim() : '';
  const place = wantGame && typeof p?.placeId === 'number' && Number.isSafeInteger(p.placeId) && p.placeId > 0 ? p.placeId : null;
  return { kind, game: name || null, placeId: place };
}

const active = (): boolean => inView.size > 0 && document.visibilityState === 'visible';

function sync(): void {
  if (!active()) {
    window.clearTimeout(timer);
    timer = undefined;
    ctl?.abort();
    ctl = null;
    return;
  }
  if (ctl || timer !== undefined) return; // loop already running or scheduled
  const wait = lastAttemptAt ? Math.max(0, lastAttemptAt + REFRESH_MS - Date.now()) : 0;
  timer = window.setTimeout(() => void tick(), wait);
}

async function tick(): Promise<void> {
  timer = undefined;
  if (!active()) return;
  const mine = (ctl = new AbortController());
  const prevAttempt = lastAttemptAt;
  lastAttemptAt = Date.now();
  const timeout = window.setTimeout(() => mine.abort(), TIMEOUT_MS);
  let next: Omit<Presence, 'rev'> | null = null;
  try {
    const res = await fetch(cfg.presenceEndpoint, { signal: mine.signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) throw new Error(`presence ${res.status}`);
    next = parse(await res.json());
  } catch { /* handled below */ }
  window.clearTimeout(timeout);
  if (ctl !== mine) { lastAttemptAt = prevAttempt; return; } // aborted because nothing is on screen: not an attempt
  ctl = null;
  const now = Date.now();
  if (next) {
    lastGoodAt = now;
    publish(next);
  } else if (!lastGoodAt || now - lastGoodAt > STALE_MS) {
    publish({ kind: 'unknown', game: null, placeId: null });
  } // else: keep the last good value a little longer
  sync();
}

/** Registers an element whose visibility drives the fetch loop. Returns the cleanup. */
export function watch(el: Element): () => void {
  if (cfg.presence === 'off' || typeof IntersectionObserver === 'undefined') return () => {};
  if (watched.size === 0) {
    io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) inView.add(e.target);
        else inView.delete(e.target);
      }
      sync();
    });
    document.addEventListener('visibilitychange', sync);
  }
  watched.add(el);
  io?.observe(el);
  return () => {
    watched.delete(el);
    inView.delete(el);
    io?.unobserve(el);
    if (watched.size === 0) {
      io?.disconnect();
      io = null;
      document.removeEventListener('visibilitychange', sync);
    }
    sync();
  };
}
