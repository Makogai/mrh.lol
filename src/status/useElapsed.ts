import { useEffect, useState } from 'react';

/** 00:23:14 (or 23:14 under an hour is NOT used: the spec shows a fixed HH:MM:SS so the width never jumps). */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/**
 * Elapsed time since `startedAt` (ISO) as a ticking string, or null when there is no start. Ticks at 1 Hz ONLY while the tab
 * is visible, and renders null on the server and on the first client render (hydration-safe).
 */
export function useElapsed(startedAt: string | null): string | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!startedAt) return;
    let id: number | undefined;
    const run = () => {
      setNow(Date.now());
      window.clearInterval(id);
      if (document.visibilityState === 'visible') id = window.setInterval(() => setNow(Date.now()), 1000);
    };
    run();
    document.addEventListener('visibilitychange', run);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', run);
    };
  }, [startedAt]);
  const t = startedAt ? Date.parse(startedAt) : NaN;
  return now !== null && Number.isFinite(t) ? formatElapsed(now - t) : null;
}
