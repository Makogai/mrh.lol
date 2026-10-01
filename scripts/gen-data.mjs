// Build-time data: live Prospecting Atlas numbers + published projects from Supabase → src/data/generated.json.
// Contract (BUILD_PLAN §6.2 / §9.2): ALWAYS writes a valid GeneratedData and ALWAYS exits 0. A failed fetch degrades to
// the fallbacks in src/config/site.ts — it must never fail a build or a deploy.
//   node scripts/gen-data.mjs               fetch and overwrite
//   node scripts/gen-data.mjs --if-missing  exit early if the file exists (`npm run dev`)
//   node scripts/gen-data.mjs --offline     skip the network (also GEN_DATA_OFFLINE=1) and write nulls
// Plain JS on purpose: it must run on Node 22 in Docker, where importing .ts is not available.
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'src/data/generated.json');

const argv = process.argv.slice(2);
const OFFLINE = argv.includes('--offline') || process.env.GEN_DATA_OFFLINE === '1';

const SKIP = argv.includes('--if-missing') && existsSync(OUT);

const ATLAS = 'https://prospecting.mrh.lol';
const UA = 'mrh.lol-build (+https://mrh.lol)';
const warn = (msg) => console.warn(`gen-data: warning — ${msg}`);

/** Inclusive integer ranges. A scrape that changes shape must not publish nonsense (e.g. "3 minerals"). */
const RANGES = {
  minerals: [50, 2000],
  digSites: [10, 500],
  locations: [5, 500],
  quests: [20, 5000],
  npcs: [20, 5000],
  craftables: [10, 2000],
  museumDisplays: [5, 200],
  pages: [50, 20000],
};

async function fetchText(url, init = {}, timeoutMs = 6000) {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': UA, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
    // Atlas /quests 301s to an absolute http:// URL behind TLS; we request trailing-slash URLs, so any redirect is
    // surprising — following is still fine, it just stays on the same host in practice.
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const decodeEntities = (s) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'");

const toInt = (s) => Number(String(s).replace(/,/g, ''));

function metaDescription(html) {
  // Attribute order varies between generators, so look for the tag first and the attributes second.
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/\bname\s*=\s*["']description["']/i.test(tag)) continue;
    const m = /\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i.exec(tag);
    if (m) return decodeEntities(m[1] ?? m[2] ?? '');
  }
  return '';
}
const titleOf = (html) => decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? '');

/** Runs one Atlas request; failure is logged and becomes null so the others still count. */
async function atlasGet(path) {
  try {
    return { ok: true, body: await fetchText(`${ATLAS}${path}`) };
  } catch (err) {
    warn(`atlas ${path} failed (${err?.name === 'TimeoutError' ? 'timeout' : (err?.message ?? err)})`);
    return { ok: false, body: '' };
  }
}

async function fetchAtlas() {
  const empty = { fetchedAt: null, stats: {}, syncedOn: null };
  if (OFFLINE) return { atlas: empty, attempted: 0, live: 0 };

  const [sitemap, home, quests, museum] = await Promise.all([
    atlasGet('/sitemap.xml'),
    atlasGet('/'),
    atlasGet('/quests/'), // trailing slash: the slashless URL 301s to http://
    atlasGet('/museum/'),
  ]);

  const raw = {};
  let syncedOn = null;

  if (sitemap.ok) {
    const locs = [...sitemap.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => {
      try { return new URL(decodeEntities(m[1])).pathname; } catch { return ''; }
    }).filter(Boolean);
    raw.pages = locs.length;
    raw.minerals = locs.filter((p) => /^\/minerals\/[^/]+\/?$/.test(p)).length;
    raw.digSites = locs.filter((p) => /^\/sites\/[^/]+\/?$/.test(p)).length;
    raw.locations = locs.filter((p) => /^\/locations\/[^/]+\/?$/.test(p)).length;
    // YYYY-MM-DD strings sort lexicographically, so a plain string max is the newest day.
    const days = [...sitemap.body.matchAll(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/gi)]
      .map((m) => m[1].slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (days.length) syncedOn = days.reduce((a, b) => (b > a ? b : a));
  }

  if (home.ok) {
    const desc = metaDescription(home.body);
    const q = /(\d[\d,]*)\s+quests\b/i.exec(desc);
    const c = /(\d[\d,]*)\s+craftables\b/i.exec(desc);
    if (q) raw.quests = toInt(q[1]);
    if (c) raw.craftables = toInt(c[1]);
  }

  if (quests.ok) {
    const m = /(\d+)\s+quests\s+and\s+(\d+)\s+NPCs/i.exec(titleOf(quests.body));
    if (m) {
      raw.npcs = toInt(m[2]);
      raw.quests ??= toInt(m[1]); // cross-check only: the homepage meta wins when it parsed
    }
  }

  if (museum.ok) {
    const m = /all\s+(\d+)\s+displays/i.exec(titleOf(museum.body));
    if (m) raw.museumDisplays = toInt(m[1]);
  }

  const stats = {};
  for (const [key, value] of Object.entries(raw)) {
    const [lo, hi] = RANGES[key];
    if (Number.isInteger(value) && value >= lo && value <= hi) stats[key] = value;
    else warn(`atlas ${key}=${value} is outside the plausible range ${lo}–${hi} — using the config fallback`);
  }
  const missing = Object.keys(RANGES).filter((k) => !(k in stats));
  if (missing.length && [sitemap, home, quests, museum].every((r) => r.ok)) {
    warn(`atlas pages loaded but could not read: ${missing.join(', ')} (page format changed?)`);
  }

  const attempted = 4;
  const anyOk = [sitemap, home, quests, museum].some((r) => r.ok);
  return {
    atlas: { fetchedAt: anyOk ? new Date().toISOString() : null, stats, syncedOn: syncedOn && /^\d{4}-\d{2}-\d{2}$/.test(syncedOn) ? syncedOn : null },
    attempted,
    live: Object.keys(stats).length,
  };
}

// ── Supabase projects ────────────────────────────────────────────────────────────────────────────────────────
const STATUSES = new Set(['live', 'beta', 'wip', 'archived']);
const ACCENTS = new Set(['amber', 'teal', 'violet', 'blue']);
const isStr = (v) => typeof v === 'string';
const httpsOrNull = (v) => (isStr(v) && /^https:\/\/\S+$/.test(v) ? v : null);
const posInt = (v) => Number.isInteger(v) && v > 0;

/** Maps one PostgREST row to a Project, or returns null (with a warning) if it can't be shown safely. */
function mapProject(row) {
  const slug = isStr(row?.slug) ? row.slug : '?';
  if (!isStr(row?.slug) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(row.slug) || row.slug.length > 64) return (warn(`project "${slug}" dropped: bad slug`), null);
  if (!isStr(row.title) || !row.title.trim()) return (warn(`project "${slug}" dropped: missing title`), null);
  if (!isStr(row.tagline) || !row.tagline.trim()) return (warn(`project "${slug}" dropped: missing tagline`), null);
  if (!STATUSES.has(row.status)) return (warn(`project "${slug}" dropped: unknown status`), null);
  if (!ACCENTS.has(row.accent)) return (warn(`project "${slug}" dropped: unknown accent`), null);

  // A non-https url is a data error, not something to quietly "fix" — drop the whole row so it gets noticed.
  if (row.url != null && !httpsOrNull(row.url)) return (warn(`project "${slug}" dropped: url is not https`), null);
  if (row.repo_url != null && !httpsOrNull(row.repo_url)) return (warn(`project "${slug}" dropped: repo_url is not https`), null);

  // The image is all-or-nothing: a partly-filled one would break the reserved aspect ratio (CLS) or lack alt text.
  const img = httpsOrNull(row.image_url) && posInt(row.image_width) && posInt(row.image_height) && isStr(row.image_alt) && row.image_alt.trim()
    ? { src: row.image_url, width: row.image_width, height: row.image_height, alt: row.image_alt.trim() }
    : null;
  if (row.image_url && !img) warn(`project "${slug}": image ignored (needs https url, width, height and alt text)`);

  return {
    slug: row.slug,
    title: row.title.trim(),
    tagline: row.tagline.trim(),
    description: isStr(row.description) && row.description.trim() ? row.description.trim() : null,
    url: row.url ?? null,
    repoUrl: row.repo_url ?? null,
    status: row.status,
    tags: Array.isArray(row.tags) ? row.tags.filter((t) => isStr(t) && t.trim()).map((t) => t.trim()).slice(0, 6) : [],
    accent: row.accent,
    image: img,
  };
}

async function fetchProjects(env) {
  const url = (env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const key = (env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  console.log(`gen-data: supabase ${url && key ? 'configured' : 'not configured'}`);
  if (OFFLINE || !url || !key) return null;

  const select = 'slug,title,tagline,description,url,repo_url,status,tags,accent,image_url,image_width,image_height,image_alt';
  const endpoint = `${url}/rest/v1/projects?select=${select}&published=eq.true&order=sort_order.asc,created_at.asc`;
  // Same rule as src/lib/env.ts: new sb_publishable_ keys go on `apikey` only; legacy JWT anon keys also want Bearer.
  const headers = { apikey: key, Accept: 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;

  try {
    const body = await fetchText(endpoint, { headers }, 8000);
    const rows = JSON.parse(body);
    if (!Array.isArray(rows)) throw new Error('response is not an array');
    const projects = rows.map(mapProject).filter(Boolean).slice(0, 12);
    if (rows.length > 12) warn(`${rows.length} published projects — only the first 12 are used`);
    return projects;
  } catch (err) {
    // Loud on purpose: a silent fallback here would ship a site that quietly lost its projects.
    console.warn('gen-data: WARNING — could not fetch projects from Supabase; the build will use the config fallback.');
    warn(`supabase projects failed (${err?.name === 'TimeoutError' ? 'timeout' : (err?.message ?? err)})`);
    return null;
  }
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────────────────────
function write(data) {
  // tmp + rename: several packages may build at once, and a reader must never see a half-written file.
  mkdirSync(dirname(OUT), { recursive: true });
  const tmp = `${OUT}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
    renameSync(tmp, OUT);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

async function main() {
  const data = {
    schema: 1,
    builtAt: new Date().toISOString(),
    atlas: { fetchedAt: null, stats: {}, syncedOn: null },
    projects: null,
  };
  let summary = '';
  try {
    // loadEnv gives real env vars precedence over .env files, exactly as Vite does at build time. Values are never logged.
    const env = loadEnv('production', process.cwd(), 'VITE_');
    const [atlasResult, projects] = await Promise.all([
      fetchAtlas().catch((err) => { warn(`atlas step crashed: ${err?.message ?? err}`); return null; }),
      fetchProjects(env).catch((err) => { warn(`projects step crashed: ${err?.message ?? err}`); return null; }),
    ]);
    if (atlasResult) {
      data.atlas = atlasResult.atlas;
      const total = Object.keys(RANGES).length;
      summary = OFFLINE
        ? 'atlas offline'
        : `atlas ${atlasResult.live}/${total} live${data.atlas.syncedOn ? ` (synced ${data.atlas.syncedOn})` : ''}`;
    } else {
      summary = 'atlas 0/8 live';
    }
    data.projects = projects;
    summary += ` · projects: ${projects ? `${projects.length} from Supabase` : 'fallback'}`;
  } catch (err) {
    warn(`unexpected error, writing fallbacks: ${err?.message ?? err}`);
    summary = 'degraded to fallbacks';
  }
  write(data);
  console.log(`gen-data: ${summary}`);
}

// No process.exit() after the fetches: on Windows + Node 24 it can race undici's closing sockets and abort with a libuv
// assertion (non-zero exit → a failed build). Setting exitCode and letting the loop drain is both safe and portable.
if (SKIP) {
  console.log('gen-data: src/data/generated.json present — skipped');
} else main().catch((err) => {
  // Last resort: even a failed write must not fail the build — src/data/index.ts falls back to site.ts without the file.
  console.warn(`gen-data: could not write generated.json (${err?.message ?? err})`);
}).finally(() => { process.exitCode = 0; });
