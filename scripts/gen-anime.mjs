// Build-time AniList fetch for the Loadout ANIME panel (favourites, currently watching, stats).
//   node scripts/gen-anime.mjs            fetch, download covers to public/anime/*.webp, rewrite the snapshot
//   node scripts/gen-anime.mjs --offline  keep the committed snapshot untouched (also GEN_DATA_OFFLINE=1)
// Contract: never fails a build. On any failure the committed snapshot (src/loadout/anime.snapshot.json) stays as it is and
// is flagged source:'fallback' at read time. The snapshot is overwritten on every successful fetch: commit the result.
// Username comes from site.ts (`anilistUsername`); plain regex because Docker's Node 22 cannot import .ts.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = resolve(root, 'src/loadout/anime.snapshot.json');
const COVERS = resolve(root, 'public/anime');
const OFFLINE = process.argv.includes('--offline') || process.env.GEN_DATA_OFFLINE === '1';
const warn = (m) => console.warn(`gen-anime: ${m}`);

const username = /anilistUsername:\s*'([^']+)'/.exec(readFileSync(resolve(root, 'src/config/site.ts'), 'utf8'))?.[1] ?? null;

const QUERY = `query ($name: String) {
  User(name: $name) {
    favourites { anime(perPage: 5) { nodes { id siteUrl title { romaji english } coverImage { large } } } }
    statistics { anime { count episodesWatched minutesWatched meanScore } }
  }
  MediaListCollection(userName: $name, type: ANIME, status: CURRENT) {
    lists { entries { progress media { id siteUrl episodes title { romaji english } coverImage { large } } } }
  }
}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** POST with retry/backoff: AniList rate-limits at 30-90 req/min and answers 429 with Retry-After. */
async function anilist() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { name: username } }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 429 || res.status >= 500) {
      const wait = Math.min(Number(res.headers.get('retry-after')) * 1000 || 2 ** attempt * 1000, 30000);
      warn(`HTTP ${res.status}, retrying in ${wait}ms`);
      await sleep(wait);
      continue;
    }
    const json = await res.json();
    if (!res.ok || json.errors) throw new Error(json.errors?.[0]?.message ?? `HTTP ${res.status}`);
    return json.data;
  }
  throw new Error('gave up after 5 attempts');
}

async function cover(media) {
  const url = media.coverImage?.large;
  if (!url) return null;
  const file = `${media.id}.webp`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize({ width: 230, withoutEnlargement: true })
      .webp({ quality: 72, effort: 5 })
      .toBuffer({ resolveWithObject: true });
    writeFileSync(resolve(COVERS, file), data);
    return { src: `/anime/${file}`, width: info.width, height: info.height };
  } catch (e) {
    warn(`cover ${media.id}: ${e.message}`);
    // Keep an earlier download if there is one; read its size from the file.
    const old = resolve(COVERS, file);
    if (!existsSync(old)) return null;
    const m = await sharp(old).metadata();
    return { src: `/anime/${file}`, width: m.width, height: m.height };
  }
}

const entry = async (m) => ({ id: m.id, title: m.title.english || m.title.romaji, url: m.siteUrl, cover: await cover(m) });

async function main() {
  if (OFFLINE || !username) return warn(OFFLINE ? 'offline, snapshot kept' : 'no anilistUsername, snapshot kept');
  const d = await anilist();
  await mkdir(COVERS, { recursive: true });
  const entries = (d.MediaListCollection?.lists ?? []).flatMap((l) => l.entries);
  const s = d.User?.statistics?.anime;
  const data = {
    username,
    fetchedAt: new Date().toISOString(),
    nowWatching: await Promise.all(
      entries.slice(0, 3).map(async (e) => ({ ...(await entry(e.media)), progress: e.progress ?? null, episodes: e.media.episodes ?? null })),
    ),
    favourites: await Promise.all((d.User?.favourites?.anime?.nodes ?? []).slice(0, 5).map(entry)),
    stats: s ? { count: s.count, episodesWatched: s.episodesWatched, daysWatched: Math.round((s.minutesWatched / 1440) * 10) / 10, meanScore: s.meanScore || null } : null,
  };
  writeFileSync(SNAPSHOT, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`gen-anime: ${data.nowWatching.length} watching, ${data.favourites.length} favourites`);
}

main().catch((e) => warn(`${e.message} — committed snapshot kept`));
