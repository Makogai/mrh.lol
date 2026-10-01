// Build-time social profile snapshot: Steam (public profile HTML, no API key) + Discord (bot API, local runs only).
// Writes src/data/socials.snapshot.json and avatar renditions under public/socials/. Every source is optional: a failed
// fetch keeps the committed snapshot, so offline/CI builds stay deterministic.
//
// Steam: level and public counters from the main profile. Persona names are NEVER read or stored (see site.status.steam).
// Discord: display name + avatar per watched account. Needs DISCORD_TOKEN, which only exists in services/status/.env on
// the owner's machine, so this half refreshes on `npm run gen:socials` locally and is skipped in Docker builds.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAP = join(root, 'src/data/socials.snapshot.json');
const OUT = join(root, 'public/socials');
const STEAM_MAIN = 'mrharold0011';

const snap = existsSync(SNAP) ? JSON.parse(readFileSync(SNAP, 'utf8')) : { steam: null, discord: [] };
mkdirSync(OUT, { recursive: true });

async function avatar(url, name) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // 128px webp covers a 64px circle at 2x; the content hash in the name makes it safe to cache forever.
  const img = await sharp(buf).resize(128, 128, { fit: 'cover' }).webp({ quality: 82 }).toBuffer();
  const hash = (await import('node:crypto')).createHash('sha1').update(img).digest('hex').slice(0, 8);
  const file = `${name}.${hash}.webp`;
  writeFileSync(join(OUT, file), img);
  return { src: `/socials/${file}`, width: 64, height: 64 };
}

async function steam() {
  const url = `https://steamcommunity.com/id/${STEAM_MAIN}/`;
  const html = await (await fetch(url, { signal: AbortSignal.timeout(10_000) })).text();
  const level = Number(html.match(/friendPlayerLevelNum">(\d+)/)?.[1]);
  if (!level) throw new Error('steam: level not found (profile private or markup changed)');
  const counts = {};
  for (const m of html.matchAll(/count_link_label">([^<]+)<\/span>[\s\S]{0,200}?profile_count_link_total">\s*([\d,]+)/g)) {
    counts[m[1].trim().toLowerCase()] = Number(m[2].replace(/,/g, ''));
  }
  const av = html.match(/playerAvatarAutoSizeInner">[\s\S]*?<img src="([^"]+)"/)?.[1];
  return {
    url,
    level,
    badges: counts.badges ?? null,
    friends: counts.friends ?? null,
    awards: counts['profile awards'] ?? null,
    avatar: av ? await avatar(av, 'steam-main') : (snap.steam?.avatar ?? null),
  };
}

async function discord() {
  const envFile = join(root, 'services/status/.env');
  if (!process.env.DISCORD_TOKEN && existsSync(envFile)) process.loadEnvFile(envFile);
  const { DISCORD_TOKEN: token, DISCORD_GUILD_ID: guild, DISCORD_WATCH: watch } = process.env;
  if (!token || !guild || !watch) return null; // Docker/CI: keep the committed snapshot
  const h = { Authorization: `Bot ${token}` };
  const out = [];
  for (const username of watch.split(',').map((s) => s.trim()).filter(Boolean)) {
    const found = await (await fetch(`https://discord.com/api/v10/guilds/${guild}/members/search?query=${encodeURIComponent(username)}&limit=10`, { headers: h })).json();
    const member = Array.isArray(found) && found.find((m) => m.user.username.toLowerCase() === username.toLowerCase());
    if (!member) { console.warn(`gen-socials: discord "${username}" not in the server`); continue; }
    const u = member.user;
    // The CDN URL contains the user id; downloading it keeps ids out of the shipped HTML (relay rule: never emit ids).
    const av = u.avatar ? await avatar(`https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256`, `discord-${username}`) : null;
    out.push({ username, displayName: u.global_name ?? username, avatar: av });
  }
  return out;
}

for (const [key, fn] of [['steam', steam], ['discord', discord]]) {
  try {
    const v = await fn();
    if (v !== null) snap[key] = v;
    console.log(`gen-socials: ${key} ${v === null ? 'skipped (no token) — kept snapshot' : 'ok'}`);
  } catch (e) {
    console.warn(`gen-socials: ${key} failed (${e.message}) — kept snapshot`);
  }
}
snap.fetchedAt = new Date().toISOString().slice(0, 10);
writeFileSync(SNAP, JSON.stringify(snap, null, 2) + '\n');
