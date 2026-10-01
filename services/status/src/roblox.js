// Roblox presence for one user: public API, no cookie. Polled every 45s; the last good value survives 180s of failures.
const POLL_MS = 45_000;
const STALE_MS = 180_000;

export function startRoblox({ env, show, set }) {
  const userId = Number(env.STATUS_ROBLOX_USER_ID || 1113999731);
  let lastGood = 0;

  async function tick() {
    try {
      const res = await fetch('https://presence.roblox.com/v1/presence/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ userIds: [userId] }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`roblox ${res.status}`);
      const p = (await res.json())?.userPresences?.[0];
      const t = p?.userPresenceType;
      if (!Number.isInteger(t) || t < 0 || t > 4) throw new Error('unexpected payload');
      const state = t === 1 ? 'online' : t === 2 ? 'in-game' : t === 3 ? 'studio' : 'offline'; // 0 and 4 (invisible) = offline
      const name = typeof p.lastLocation === 'string' ? p.lastLocation.trim() : '';
      // The name is empty when the user hides it; then there is no game object and the UI says "In a game".
      const game =
        state === 'in-game' && show.robloxGame && name && Number.isSafeInteger(p.placeId) && p.placeId > 0
          ? { name, url: `https://www.roblox.com/games/${p.placeId}` }
          : null;
      lastGood = Date.now();
      set({ state, game });
    } catch {
      if (!lastGood || Date.now() - lastGood > STALE_MS) set(null);
    }
  }
  tick();
  setInterval(tick, POLL_MS).unref?.();
}
