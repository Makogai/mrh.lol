import './status.css';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { site, type LiveGameKey } from '../config/site';
import { cx } from '../lib/cx';
import { StatusGlyph } from './StatusGlyph';
import { activeGames, ageLabel, glyphOf, lineFor, retryStatus, sessionOf, STATUS_WORD, useStatus } from './store';
import type { StatusSnapshot, StatusView } from './types';
import { useElapsed } from './useElapsed';

// Favourite-game accents (V2_DESIGN §4). Local to the ACTIVITY row: it borrows the game's colour, nothing else does.
const GAME_ACCENT: Record<LiveGameKey, string> = { cs2: '#d9b26a', warThunder: '#b7e07a', roblox: '#ff8f80', code: '#3ee0d0' };

const ROW = 'flex min-h-12 items-center gap-3 border-t border-ink-100/[0.06] py-2 first:border-t-0';
const LABEL = 'w-20 shrink-0 font-mono text-[10px] uppercase tracking-label text-ink-500';

function Row({ label, children, style }: { label: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className={ROW} style={style}>
      <span className={LABEL}>{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  );
}

/** Own component so only this subtree re-renders every second. */
function Timer({ startedAt }: { startedAt: string | null }) {
  const t = useElapsed(startedAt);
  return t ? <span className="shrink-0 font-mono text-xs tabular-nums text-ink-300">IN MATCH {t}</span> : null;
}

/** aria-live summary: one polite announcement at most every 30 s, only for the headline state (never timers or Spotify). */
function useAnnouncement(text: string): string {
  const [said, setSaid] = useState('');
  const last = useRef(0);
  useEffect(() => {
    const wait = Math.max(0, last.current + 30_000 - Date.now());
    const id = window.setTimeout(() => { last.current = Date.now(); setSaid(text); }, wait);
    return () => window.clearTimeout(id);
  }, [text]);
  return said;
}

function headline(s: StatusSnapshot): string {
  const d = s.discord ? `Discord ${STATUS_WORD[s.discord.status].toLowerCase()}` : '';
  const g = activeGames(s)[0];
  return [d, g ? `playing ${g.name}` : s.roblox?.state === 'in-game' ? 'in a Roblox game' : ''].filter(Boolean).join(', ');
}

/**
 * The lobby's full status view (V2_DESIGN §6): DISCORD, ACTIVITY, SPOTIFY, ROBLOX and STEAM rows at fixed heights, plus every
 * designed state (loading, live, partial, hidden, stale, failure). `view` overrides the live store (fixtures).
 */
export function PartyPanel({ className, view }: { className?: string; view?: StatusView }) {
  const live = useStatus();
  const v = view ?? live;
  const { text, state } = lineFor(v);
  const s = v.snapshot;
  const announce = useAnnouncement(s && (state === 'live' || state === 'partial') ? headline(s) : '');

  const frame = cx('slot slot-card p-6', className);

  if (state === 'loading') {
    return (
      <div data-static data-status="loading" className={frame}>
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-label text-ink-500">
          <StatusGlyph kind="unknown" className="st-breathe" />
          Connecting…
        </p>
        <div aria-hidden="true" className="mt-4 grid gap-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-pad bg-ink-100/[0.04]" />)}
        </div>
      </div>
    );
  }

  if (state === 'failure' || !s) {
    return (
      <div data-static data-status="failure" className={frame}>
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-label text-ink-500">
          <StatusGlyph kind="unknown" />
          Status offline
        </p>
        <p className="mt-4 text-ink-300">Can't reach the status relay right now.</p>
        <button
          type="button"
          onClick={retryStatus}
          className="mt-4 inline-flex h-11 items-center rounded-pad bg-ink-100/[0.06] px-5 font-mono text-xs uppercase tracking-label text-ink-100 shadow-hairline hover:bg-ink-100/[0.1]"
        >
          Retry
        </button>
      </div>
    );
  }

  const stale = state === 'stale';
  const games = activeGames(s);
  const game = games[0];
  const session = sessionOf(s);
  const accent = session ? GAME_ACCENT[session.game] : null;
  const unavailable = [!s.discord && 'Discord', !s.roblox && 'Roblox'].filter(Boolean) as string[];
  const updatedSec = Math.max(0, Math.round((Date.now() - Date.parse(s.updatedAt)) / 1000));
  const steam = site.status.steam
    .map((p) => ({ label: p.label, row: s.steam?.find((r) => r.key === p.key) }))
    .filter((p) => p.row);

  return (
    <div data-static data-status={state} className={frame}>
      <p className="sr-only" aria-live="polite">{announce}</p>

      {state === 'hidden' ? (
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-label text-ink-500">
          <StatusGlyph kind="unknown" />
          Status hidden
        </p>
      ) : (
        <div className={cx(stale && 'st-stale')}>
          {s.discord && (
            <Row label="Discord">
              <StatusGlyph kind={glyphOf({ ...s, roblox: null, steam: null })} />
              <span className="shrink-0 text-ink-100">{STATUS_WORD[s.discord.status]}</span>
              {s.discord.custom && (
                <span className="truncate text-ink-300">
                  {s.discord.custom.emoji ? `${s.discord.custom.emoji} ` : ''}
                  {s.discord.custom.text}
                </span>
              )}
            </Row>
          )}

          {game && (
            <Row label="Activity" style={accent ? ({ boxShadow: `inset 2px 0 0 ${accent}` } as CSSProperties) : undefined}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-sans text-base font-bold leading-5 text-ink-100" style={accent ? { color: accent } : undefined}>{game.name}</span>
                {(game.details || game.state) && <span className="truncate text-xs leading-4 text-ink-300">{[game.details, game.state].filter(Boolean).join(' · ')}</span>}
              </span>
              {!stale && <Timer startedAt={game.startedAt} />}
            </Row>
          )}

          {s.discord?.spotify && !stale && (
            <Row label="Spotify">
              <span className="relative flex min-w-0 flex-1 flex-col">
                <span className="truncate text-ink-100">♪ {s.discord.spotify.track}</span>
                <span className="truncate text-xs text-ink-300">{s.discord.spotify.artist}</span>
                <SpotifyBar start={s.discord.spotify.startedAt} end={s.discord.spotify.endsAt} />
              </span>
            </Row>
          )}

          {s.roblox && (
            <Row label="Roblox">
              <span className="min-w-0 truncate text-ink-100">
                {s.roblox.state === 'in-game' && (s.roblox.game ? `In game · ${s.roblox.game.name}` : 'In a game')}
                {s.roblox.state === 'studio' && 'Building in Studio'}
                {s.roblox.state === 'online' && 'Online'}
                {s.roblox.state === 'offline' && 'Offline'}
              </span>
              {s.roblox.game && (
                <a href={s.roblox.game.url} target="_blank" rel="noopener noreferrer" className="ml-auto shrink-0 font-mono text-xs text-teal-400">
                  View game ↗<span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </Row>
          )}

          {steam.map(({ label, row }) => (
            <Row key={label} label={label.replace('Steam · ', 'Steam ')}>
              <span className="min-w-0 truncate text-ink-100">
                {row!.state === 'in-game' ? (row!.game ? `In game · ${row!.game}` : 'In a game') : row!.state === 'online' ? 'Online' : 'Offline'}
              </span>
            </Row>
          ))}
        </div>
      )}

      {unavailable.map((n) => (
        <p key={n} className="mt-2 font-mono text-xs text-ink-500">{n} status unavailable</p>
      ))}

      <p className="mt-4 font-mono text-[10px] tracking-wide text-ink-500">
        {stale ? text.toLowerCase() : `live · updated ${ageLabel(updatedSec)}`}
      </p>
    </div>
  );
}

/** 2 px CSS-only progress: duration = endsAt - startedAt, a negative delay fast-forwards to the current position. */
function SpotifyBar({ start, end }: { start: string; end: string }) {
  const [elapsed, setElapsed] = useState<number | null>(null);
  useEffect(() => setElapsed(Math.max(0, (Date.now() - Date.parse(start)) / 1000)), [start]);
  const total = Math.max(1, (Date.parse(end) - Date.parse(start)) / 1000);
  if (elapsed === null) return null;
  return (
    <span aria-hidden="true" className="mt-1 block h-0.5 w-full overflow-hidden rounded bg-ink-100/10">
      <span className="st-progress block h-full w-full bg-teal-400" style={{ animationDuration: `${total}s`, animationDelay: `-${elapsed}s` }} />
    </span>
  );
}
