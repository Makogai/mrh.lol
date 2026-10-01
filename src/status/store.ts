// Live-status store (V2_DESIGN §6): ONE module-level store behind useSyncExternalStore. Nothing runs on the server or before
// a surface subscribes; SSR and the first client render both see LOADING (trap §7.6: live classes only after hydration).
//
// Network: GET once at idle, then SSE while the tab is visible. SSE failures back off 2s -> 60s; after 3 failures a 30s poll
// takes over until the stream recovers. Whenever the relay is unreachable the Roblox row stays live from the same-origin
// nginx proxy. The snapshot is filtered by site.status.show (the relay's allowlist is authoritative, this is the mirror).
import { useSyncExternalStore } from 'react';
import { site, type LiveGameKey } from '../config/site';
import type { GlyphKind, StatusSnapshot, StatusState, StatusView } from './types';

const STALE_S = 90;
const FAIL_S = 180;
const POLL_MS = 30_000;
const TICK_MS = 15_000; // age labels ("last seen 4m ago") refresh at this pace, only while someone is subscribed and visible

const env = (import.meta as unknown as { env: { VITE_STATUS_URL?: string; DEV?: boolean } }).env;
const BASE = (env.VITE_STATUS_URL || (env.DEV ? site.status.devEndpoint : site.status.endpoint)).replace(/\/$/, '');

const LOADING: StatusView = { state: 'loading', snapshot: null, ageSec: null };

interface Raw {
  snapshot: StatusSnapshot | null;
  at: number; // when the last snapshot arrived (ms); 0 = never
  streaming: boolean; // SSE open: the relay pings every 25 s, so an open stream counts as fresh
  gaveUp: boolean; // every attempt so far failed and nothing is cached
}
let raw: Raw = { snapshot: null, at: 0, streaming: false, gaveUp: false };
let view: StatusView = LOADING;
const listeners = new Set<() => void>();

// ---------- snapshot parsing / filtering --------------------------------------------------------------------------------

type Discord = NonNullable<StatusSnapshot['discord']>;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Trust nothing from the network: unknown shapes become null (unavailable) instead of throwing into React. */
function sanitize(j: unknown): StatusSnapshot | null {
  if (!isObj(j) || j.v !== 1) return null;
  const sh = site.status.show;
  const d = isObj(j.discord) ? j.discord : null;
  const statuses = ['online', 'idle', 'dnd', 'offline'];
  const discord: StatusSnapshot['discord'] =
    d && sh.discord && typeof d.status === 'string' && statuses.includes(d.status)
      ? {
          status: d.status as 'online',
          custom: sh.custom && isObj(d.custom) && typeof d.custom.text === 'string' ? { emoji: typeof d.custom.emoji === 'string' ? d.custom.emoji : null, text: d.custom.text } : null,
          activities: sh.activity && Array.isArray(d.activities) ? (d.activities as Discord['activities']).filter((a) => isObj(a) && typeof a.name === 'string') : [],
          spotify: sh.spotify && isObj(d.spotify) ? (d.spotify as unknown as Discord['spotify']) : null,
        }
      : null;
  const r = isObj(j.roblox) ? j.roblox : null;
  const rStates = ['offline', 'online', 'in-game', 'studio'];
  const mode = site.roblox.presence;
  const roblox: StatusSnapshot['roblox'] =
    r && mode !== 'off' && typeof r.state === 'string' && rStates.includes(r.state)
      ? {
          state: r.state as 'online',
          // 'status' mode never keeps the game name around, so no component can leak it by accident.
          game: mode === 'game' && sh.robloxGame && isObj(r.game) && typeof r.game.name === 'string' && typeof r.game.url === 'string' ? { name: r.game.name, url: r.game.url } : null,
        }
      : null;
  const steam = Array.isArray(j.steam)
    ? (j.steam as unknown[]).filter((s): s is NonNullable<StatusSnapshot['steam']>[number] => isObj(s) && (s.key === 'main' || s.key === 'cs') && typeof s.state === 'string')
    : null;
  return { v: 1, updatedAt: typeof j.updatedAt === 'string' ? j.updatedAt : new Date().toISOString(), discord, roblox, steam: steam?.length ? steam : null };
}

/** Same-origin nginx proxy (Roblox's own payload) -> the snapshot's roblox row. */
function parseRobloxProxy(j: unknown): StatusSnapshot['roblox'] {
  const p = isObj(j) && Array.isArray(j.userPresences) ? j.userPresences[0] : null;
  const t = isObj(p) ? p.userPresenceType : null;
  if (typeof t !== 'number' || !Number.isInteger(t) || t < 0 || t > 4) return null;
  const state = t === 1 ? 'online' : t === 2 ? 'in-game' : t === 3 ? 'studio' : 'offline';
  const name = isObj(p) && typeof p.lastLocation === 'string' ? p.lastLocation.trim() : '';
  const place = isObj(p) && typeof p.placeId === 'number' && p.placeId > 0 ? p.placeId : 0;
  return { state, game: state === 'in-game' && name && place ? { name, url: `https://www.roblox.com/games/${place}` } : null };
}

// ---------- view derivation ---------------------------------------------------------------------------------------------

function derive(): StatusView {
  const { snapshot, at, streaming, gaveUp } = raw;
  if (!snapshot) return gaveUp ? { state: 'failure', snapshot: null, ageSec: null } : LOADING;
  const ageSec = streaming ? 0 : Math.max(0, Math.round((Date.now() - at) / 1000));
  let state: StatusState;
  if (ageSec > FAIL_S) state = 'failure';
  else if (ageSec > STALE_S) state = 'stale';
  else if (!snapshot.discord && !snapshot.roblox && !snapshot.steam) state = 'hidden'; // relay is up, nothing of him is visible
  else if (!snapshot.discord || !snapshot.roblox) state = 'partial'; // a null source hides its row
  else state = 'live';
  return { state, snapshot: state === 'failure' ? null : snapshot, ageSec };
}

function emit(): void {
  const next = derive();
  if (next.state === view.state && next.snapshot === view.snapshot && next.ageSec === view.ageSec) return;
  view = next;
  for (const l of listeners) l();
}

function accept(snap: StatusSnapshot): void {
  raw = { ...raw, snapshot: snap, at: Date.now(), gaveUp: false };
  emit();
}

// ---------- network loop ------------------------------------------------------------------------------------------------

let started = false;
let es: EventSource | null = null;
let failures = 0;
let backoff = 2000;
let reconnectT: number | undefined;
let pollT: number | undefined;
let tickT: number | undefined;
let attempted = false; // at least one source attempt finished (so "nothing cached" can mean failure)

const visible = (): boolean => document.visibilityState === 'visible';

async function getJson(url: string, ms = 5000): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/** The relay is unreachable: keep the Roblox row live from the same-origin proxy, everything else greys out and ages. */
async function fallback(): Promise<void> {
  attempted = true;
  if (site.roblox.presence === 'off') {
    raw = { ...raw, gaveUp: !raw.snapshot };
    return emit();
  }
  try {
    const roblox = parseRobloxProxy(await getJson(site.roblox.presenceEndpoint));
    if (!roblox) throw new Error('shape');
    const base = raw.snapshot;
    // Only Roblox is fresh here; without a relay snapshot the other rows are simply unavailable (PARTIAL).
    raw = { ...raw, snapshot: { v: 1, updatedAt: new Date().toISOString(), discord: base?.discord ?? null, roblox, steam: base?.steam ?? null }, at: Date.now(), gaveUp: false };
  } catch {
    raw = { ...raw, gaveUp: !raw.snapshot };
  }
  emit();
}

/** true = the relay answered. */
async function fetchOnce(): Promise<boolean> {
  try {
    const snap = sanitize(await getJson(`${BASE}/v1/status`));
    if (!snap) throw new Error('shape');
    attempted = true;
    accept(snap);
    return true;
  } catch {
    await fallback();
    return false;
  }
}

/** Open the stream only if the relay answered; otherwise retry later (a cold failure makes one console error, not four). */
function connect(ok: boolean): void {
  if (ok) return openStream();
  failures += 1;
  window.clearTimeout(reconnectT);
  reconnectT = window.setTimeout(() => void fetchOnce().then(connect), 15_000);
  if (failures >= 3) startPoll();
}

function startPoll(): void {
  if (pollT !== undefined || !visible()) return;
  pollT = window.setInterval(() => void fetchOnce(), POLL_MS);
}
function stopPoll(): void {
  window.clearInterval(pollT);
  pollT = undefined;
}

function closeStream(): void {
  es?.close();
  es = null;
  window.clearTimeout(reconnectT);
  reconnectT = undefined;
  if (raw.streaming) {
    raw = { ...raw, at: Date.now(), streaming: false }; // age counts from the moment the stream went away
  }
}

function openStream(): void {
  if (es || !visible() || typeof EventSource === 'undefined') return;
  const src = (es = new EventSource(`${BASE}/v1/stream`));
  src.onopen = () => {
    failures = 0;
    backoff = 2000;
    stopPoll();
    raw = { ...raw, streaming: true };
  };
  src.onmessage = (e) => {
    try {
      const snap = sanitize(JSON.parse(e.data));
      if (snap) {
        attempted = true;
        raw = { ...raw, streaming: true };
        accept(snap);
      }
    } catch { /* ignore a malformed frame */ }
  };
  src.onerror = () => {
    // We reconnect ourselves (EventSource's own retry has no backoff and never gives up).
    closeStream();
    failures += 1;
    emit();
    if (failures >= 3) {
      startPoll();
      if (!attempted || failures === 3) void fetchOnce();
    }
    reconnectT = window.setTimeout(openStream, backoff);
    backoff = Math.min(backoff * 2, 60_000);
  };
}

function onVisibility(): void {
  if (!listeners.size) return;
  if (visible()) {
    void fetchOnce(); // the tab may have slept for minutes
    openStream();
    if (failures >= 3) startPoll();
  } else {
    closeStream();
    stopPoll();
  }
  emit();
}

function start(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const go = () => {
    void fetchOnce().then(connect);
  };
  const ric = (window as { requestIdleCallback?: (cb: () => void, o: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(go, { timeout: 5000 });
  else window.setTimeout(go, 1);
  document.addEventListener('visibilitychange', onVisibility);
  tickT = window.setInterval(() => { if (visible() && listeners.size) emit(); }, TICK_MS);
}

/** Manual retry from the PartyPanel's FAILURE state. */
export function retryStatus(): void {
  failures = 0;
  backoff = 2000;
  raw = { ...raw, gaveUp: false };
  emit();
  closeStream();
  void fetchOnce().then(connect);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  start();
  return () => {
    listeners.delete(fn);
    if (!listeners.size && started) {
      // Last surface gone (route change in dev / tests): stop all network work; the next subscriber restarts it.
      closeStream();
      stopPoll();
      window.clearInterval(tickT);
      document.removeEventListener('visibilitychange', onVisibility);
      started = false;
    }
  };
}
const getSnapshot = (): StatusView => view;
const getServerSnapshot = (): StatusView => LOADING;

/** The raw view. Surfaces take an optional `view` prop so fixtures can render any state without a network. */
export function useStatus(): StatusView {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ---------- derived selectors (pure: used by hooks, fixtures and tests) -------------------------------------------------

export const STATUS_WORD: Record<'online' | 'idle' | 'dnd' | 'offline', string> = { online: 'Online', idle: 'Away', dnd: 'Do not disturb', offline: 'Offline' };

export interface GameActivity { name: string; details: string | null; state: string | null; startedAt: string | null; source: 'discord' | 'steam' }

/** Games he is in right now: Discord "playing" activities first (they carry a start time), then Steam in-game titles. */
export function activeGames(s: StatusSnapshot | null): GameActivity[] {
  const out: GameActivity[] = [];
  const seen = new Set<string>();
  const add = (g: GameActivity) => { const k = g.name.toLowerCase(); if (g.name && !seen.has(k)) { seen.add(k); out.push(g); } };
  for (const a of s?.discord?.activities ?? []) if (a.kind === 'playing' || a.kind === 'competing') add({ name: a.name, details: a.details, state: a.state, startedAt: a.startedAt, source: 'discord' });
  for (const p of s?.steam ?? []) if (p.state === 'in-game' && p.game) add({ name: p.game, details: null, state: null, startedAt: null, source: 'steam' });
  return out;
}

/** The single dominant glyph: Discord's word, lifted to "online" when Roblox or Steam shows him around. */
export function glyphOf(s: StatusSnapshot | null): GlyphKind {
  if (!s) return 'unknown';
  if (s.discord?.activities.some((a) => a.kind === 'streaming')) return 'streaming';
  const elsewhere = (s.roblox && s.roblox.state !== 'offline') || s.steam?.some((p) => p.state !== 'offline');
  const d = s.discord?.status;
  if (d && d !== 'offline') return d;
  if (elsewhere) return 'online';
  if (d === 'offline' || s.roblox || s.steam) return 'offline';
  return 'unknown';
}

export function lineOf(s: StatusSnapshot): string {
  const game = activeGames(s)[0];
  if (game) return `Playing ${game.name}`;
  const r = s.roblox;
  if (r?.state === 'in-game') return r.game ? `In Roblox · ${r.game.name}` : 'In a Roblox game';
  if (r?.state === 'studio') return 'Building in Roblox Studio';
  if (s.discord?.spotify) return `♪ ${s.discord.spotify.track} — ${s.discord.spotify.artist}`;
  if (s.discord?.custom) return `${s.discord.custom.emoji ? `${s.discord.custom.emoji} ` : ''}${s.discord.custom.text}`;
  const g = glyphOf(s);
  return g === 'unknown' ? 'Status hidden' : STATUS_WORD[g === 'streaming' ? 'online' : g];
}

export function ageLabel(sec: number): string {
  if (sec < 60) return `${Math.max(sec, 1)}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

export function lineFor(v: StatusView): { text: string; glyph: GlyphKind; state: StatusState } {
  const { state, snapshot } = v;
  if (state === 'loading') return { text: 'Connecting…', glyph: 'unknown', state };
  if (state === 'failure' || !snapshot) return { text: 'Status offline', glyph: 'unknown', state: 'failure' };
  if (state === 'hidden') return { text: 'Status hidden', glyph: 'unknown', state };
  if (state === 'stale') return { text: `Last seen ${ageLabel(v.ageSec ?? STALE_S)}`, glyph: glyphOf(snapshot), state };
  return { text: lineOf(snapshot), glyph: glyphOf(snapshot), state };
}

const MATCH_ORDER: LiveGameKey[] = ['cs2', 'warThunder', 'roblox', 'code'];

export interface LiveSession { game: LiveGameKey; name: string; startedAt: string | null }

export function sessionOf(s: StatusSnapshot | null): LiveSession | null {
  if (!s) return null;
  const m = site.status.gameMatchers;
  const names: GameActivity[] = [
    ...activeGames(s),
    ...(s.discord?.activities ?? []).filter((a) => a.kind !== 'playing' && a.kind !== 'competing').map((a) => ({ name: a.name, details: a.details, state: a.state, startedAt: a.startedAt, source: 'discord' as const })),
  ];
  for (const key of MATCH_ORDER) {
    if (key === 'roblox' && s.roblox?.state === 'in-game') {
      return { game: 'roblox', name: s.roblox.game?.name ?? 'Roblox', startedAt: names.find((n) => m.roblox.test(n.name))?.startedAt ?? null };
    }
    const hit = names.find((n) => m[key].test(n.name));
    if (hit) return { game: key, name: hit.name, startedAt: hit.startedAt };
  }
  return null;
}

// Hooks. They select primitives/stable objects so a 15 s age tick re-renders only what actually changed.
export function useStatusLine(): { text: string; glyph: GlyphKind; state: StatusState } {
  const v = useStatus();
  return lineFor(v);
}

/** Which tracked game he is in right now (matches activity names with site.status.gameMatchers), or null. */
export function useLiveGame(): LiveGameKey | null {
  return useLiveSession()?.game ?? null;
}

/** Like useLiveGame, plus the display name and start time (for the IN MATCH timer). */
export function useLiveSession(): LiveSession | null {
  const s = useStatus();
  return sessionOf(s.state === 'live' || s.state === 'partial' ? s.snapshot : null);
}
