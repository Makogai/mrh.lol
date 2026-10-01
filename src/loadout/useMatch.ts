import { useEffect, useMemo, useState } from 'react';
import { site, type GameKey } from '../config/site';
import { useLiveGame, useStatus } from '../status';

/** Session timer text: 23:14, or 1:02:33 past the hour. */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Live tie-in (V2_DESIGN §2): which of the three game tiles he is in right now, and for how long.
 * `game` comes from the shared status hook (Discord activity names matched by site.status.gameMatchers, Roblox presence);
 * the timer needs a Discord `startedAt`, so it is null (badge without a clock) when only Roblox presence says so.
 * The 1 Hz interval runs only while `ticking` (panel selected) AND the tab is visible, and the first value is set in an
 * effect so SSR and hydration agree (nothing live ever renders on the server).
 */
export function useMatch(ticking: boolean): { game: GameKey | null; elapsed: string | null } {
  const live = useLiveGame();
  const game: GameKey | null = live && live !== 'code' ? live : null;
  const { snapshot } = useStatus();
  const startedAt = useMemo(() => {
    if (!game || !snapshot?.discord) return null;
    const hit = snapshot.discord.activities.find((a) => site.status.gameMatchers[game].test(a.name));
    const t = hit?.startedAt ? Date.parse(hit.startedAt) : NaN;
    return Number.isNaN(t) ? null : t;
  }, [game, snapshot]);

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!ticking || startedAt === null) return;
    const tick = () => { if (document.visibilityState === 'visible') setNow(Date.now()); };
    tick();
    const id = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [ticking, startedAt]);

  return { game, elapsed: startedAt !== null && now !== null ? formatElapsed(now - startedAt) : null };
}
