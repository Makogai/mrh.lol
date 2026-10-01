// Discord presence for the watched accounts, via the gateway (GUILD_PRESENCES + GUILD_MEMBERS privileged intents).
// Two accounts are merged into one "discord" object: an online account beats an offline one; activities are the union.
// Without DISCORD_TOKEN this is a no-op and discord stays null (PARTIAL on the site), never a faked "offline".
import { ActivityType, Client, GatewayIntentBits } from 'discord.js';

const KIND = { [ActivityType.Playing]: 'playing', [ActivityType.Streaming]: 'streaming', [ActivityType.Watching]: 'watching', [ActivityType.Competing]: 'competing' };
const RANK = { online: 3, dnd: 2, idle: 1, offline: 0 };
const iso = (d) => (d ? new Date(d).toISOString() : null);
const clip = (s, n) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, n) : null);

export function startDiscord({ env, show, set }) {
  const token = env.DISCORD_TOKEN?.trim();
  if (!token || !show.discord) return;
  const watch = (env.DISCORD_WATCH ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!watch.length) return console.warn('discord: DISCORD_WATCH is empty, skipping');

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildMembers] });
  const ids = new Set(); // user ids stay in memory, never emitted
  let guild = null;

  function view(presence) {
    const status = presence?.status === 'invisible' ? 'offline' : (presence?.status ?? 'offline');
    let custom = null;
    const activities = [];
    let spotify = null;
    for (const a of presence?.activities ?? []) {
      if (a.type === ActivityType.Custom) {
        const text = clip(a.state, 80);
        if (show.custom && text) custom = { emoji: a.emoji?.name && !a.emoji.id ? a.emoji.name : null, text };
      } else if (a.type === ActivityType.Listening && a.name === 'Spotify') {
        if (show.spotify && a.timestamps?.start && a.timestamps?.end)
          spotify = { track: clip(a.details, 100) ?? '', artist: clip(a.state, 100) ?? '', startedAt: iso(a.timestamps.start), endsAt: iso(a.timestamps.end) };
      } else if (show.activity && KIND[a.type]) {
        activities.push({ kind: KIND[a.type], name: clip(a.name, 80) ?? '', details: clip(a.details, 100), state: clip(a.state, 100), startedAt: iso(a.timestamps?.start) });
      }
    }
    return { status, custom, activities, spotify };
  }

  function publish() {
    if (!guild || !ids.size) return;
    const views = [...ids].map((id) => view(guild.presences.cache.get(id)));
    // Best account first: most-present status, then the one with something to show.
    views.sort((a, b) => RANK[b.status] - RANK[a.status] || b.activities.length - a.activities.length);
    const top = views[0];
    const seen = new Set();
    const activities = views.flatMap((v) => v.activities).filter((a) => !seen.has(a.name) && seen.add(a.name));
    set({
      status: top.status,
      custom: views.find((v) => v.custom && v.status !== 'offline')?.custom ?? null,
      activities: top.status === 'offline' ? [] : activities,
      spotify: views.find((v) => v.spotify && v.status !== 'offline')?.spotify ?? null,
    });
  }

  async function resolve() {
    const gid = env.DISCORD_GUILD_ID?.trim();
    guild = gid ? await client.guilds.fetch(gid) : client.guilds.cache.size === 1 ? client.guilds.cache.first() : null;
    if (!guild) return console.warn('discord: set DISCORD_GUILD_ID (the bot is in zero or several servers)');
    ids.clear();
    for (const name of watch) {
      const found = await guild.members.search({ query: name, limit: 10 });
      const hit = [...found.values()].find((m) => m.user.username.toLowerCase() === name);
      if (hit) ids.add(hit.id);
      else console.warn(`discord: "${name}" is not a member of the server`);
    }
    // Fills the presence cache (the gateway only streams *changes* after the initial GUILD_CREATE payload).
    await guild.members.fetch({ user: [...ids], withPresences: true }).catch(() => {});
    publish();
  }

  client.once('clientReady', () => resolve().catch((e) => console.warn('discord resolve failed:', e.message)));
  client.on('presenceUpdate', (_old, p) => { if (ids.has(p.userId)) publish(); });
  client.on('error', (e) => console.warn('discord error:', e.message));
  client.login(token).catch((e) => console.warn('discord login failed:', e.message));
}
