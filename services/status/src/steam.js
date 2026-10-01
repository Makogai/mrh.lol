// Steam presence from the public profile XML (no API key). Persona names are NEVER read or emitted: only the neutral key,
// the online state and the in-game title. A private profile or a failed fetch simply drops that profile from the list.
const POLL_MS = 60_000;
const STALE_MS = 240_000;

const pick = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
  return m ? m[1].trim() : null;
};

export function startSteam({ env, show, set }) {
  if (!show.steam) return set(null);
  const profiles = [
    { key: 'main', id: env.STATUS_STEAM_MAIN || '76561198259591769' },
    { key: 'cs', id: env.STATUS_STEAM_CS || '76561198127541580' },
  ].filter((p) => /^\d{17}$/.test(p.id ?? ''));
  if (!profiles.length) return set(null);
  const last = new Map(); // key -> { at, value }

  async function one(p) {
    try {
      const res = await fetch(`https://steamcommunity.com/profiles/${p.id}/?xml=1`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`steam ${res.status}`);
      const xml = await res.text();
      const s = pick(xml, 'onlineState');
      if (s !== 'online' && s !== 'offline' && s !== 'in-game') throw new Error('private or unexpected');
      const title = s === 'in-game' ? pick(xml, 'gameName') : null;
      last.set(p.key, { at: Date.now(), value: { key: p.key, state: s, game: title || null } });
    } catch { /* keep the previous value until STALE_MS */ }
    const l = last.get(p.key);
    return l && Date.now() - l.at < STALE_MS ? l.value : null;
  }

  async function tick() {
    const rows = (await Promise.all(profiles.map(one))).filter(Boolean);
    set(rows.length ? rows : null);
  }
  tick();
  setInterval(tick, POLL_MS).unref?.();
}
