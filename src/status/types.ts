// Live-status contract (V2_DESIGN §6). STUB landed by the shell package so the app compiles; the status package owns this
// folder from here on and replaces everything except the shape of the exports consumed elsewhere (see index.ts).
// Mirrored by services/status (the relay) — change both together and bump `v`.
export interface StatusSnapshot {
  v: 1;
  updatedAt: string;
  discord: {
    status: 'online' | 'idle' | 'dnd' | 'offline';
    custom: { emoji: string | null; text: string } | null;
    activities: {
      kind: 'playing' | 'streaming' | 'watching' | 'competing';
      name: string;
      details: string | null;
      state: string | null;
      startedAt: string | null;
    }[];
    spotify: { track: string; artist: string; startedAt: string; endsAt: string } | null;
  } | null;
  roblox: { state: 'offline' | 'online' | 'in-game' | 'studio'; game: { name: string; url: string } | null } | null;
  /** Additive extension (still v: 1; absent = null). Neutral keys only, never persona names. */
  steam?: { key: 'main' | 'cs'; state: 'offline' | 'online' | 'in-game'; game: string | null }[] | null;
} // a null source = unavailable

/** LOADING → LIVE | PARTIAL | HIDDEN; no event for 90 s → STALE; 180 s → FAILURE (V2_DESIGN §6 "States"). */
export type StatusState = 'loading' | 'live' | 'partial' | 'hidden' | 'stale' | 'failure';

/** Glyph kinds: shape + colour, always with a text label next to them. */
export type GlyphKind = 'online' | 'idle' | 'dnd' | 'offline' | 'streaming' | 'unknown';

export interface StatusView {
  state: StatusState;
  snapshot: StatusSnapshot | null;
  /** Seconds since the last event; null while nothing has arrived. */
  ageSec: number | null;
}
