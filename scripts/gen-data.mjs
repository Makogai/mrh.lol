// Build-time data (schema 2): live Prospecting Atlas numbers, projects (Supabase merged over site.projects by slug) and
// public GitHub readouts → src/data/generated.json. AniList is a separate script (scripts/gen-anime.mjs).
// Contract (BUILD_PLAN §6.2 / §9.2): ALWAYS writes a valid GeneratedData and ALWAYS exits 0. A failed fetch degrades to
// the fallbacks in src/config/site.ts — it must never fail a build or a deploy.
//   node scripts/gen-data.mjs               fetch and overwrite
//   node scripts/gen-data.mjs --if-missing  exit early if the file exists (`npm run dev`)
//   node scripts/gen-data.mjs --offline     skip the network (also GEN_DATA_OFFLINE=1) and write nulls
// Plain JS on purpose: it must run on Node 22 in Docker, where importing .ts is not available.
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, loadEnv } from 'vite';

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

// ── Projects: site.projects (config) + Supabase rows, merged by slug ─────────────────────────────────────────
const STATUSES = new Set(['live', 'beta', 'wip', 'archived']);
const ACCENTS = new Set(['amber', 'teal', 'violet', 'blue']);
const PLATFORMS = new Set(['roblox', 'discord', 'web', 'cli']);
const isStr = (v) => typeof v === 'string';
const httpsOrNull = (v) => (isStr(v) && /^https:\/\/\S+$/.test(v) ? v : null);
const posInt = (v) => Number.isInteger(v) && v > 0;
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Maps one PostgREST row to an OVERLAY: only the fields the row actually sets (nullable v2 columns that are null are "unset"
 * and leave the config value alone). Returns null, with a warning, if the row can't be shown safely.
 */
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

  const o = { slug: row.slug, title: row.title.trim(), tagline: row.tagline.trim(), status: row.status, accent: row.accent };
  if (isStr(row.description) && row.description.trim()) o.description = row.description.trim();
  if (row.url) o.url = row.url;
  if (row.repo_url) o.repoUrl = row.repo_url;

  // The image is all-or-nothing: a partly-filled one would break the reserved aspect ratio (CLS) or lack alt text.
  if (row.image_url) {
    if (httpsOrNull(row.image_url) && posInt(row.image_width) && posInt(row.image_height) && isStr(row.image_alt) && row.image_alt.trim()) {
      o.image = { src: row.image_url, width: row.image_width, height: row.image_height, alt: row.image_alt.trim() };
    } else warn(`project "${slug}": image ignored (needs https url, width, height and alt text)`);
  }

  // v2 columns (migration 0003) — all nullable, null = unset. An unknown theme is kept: the registry falls back to 'forge'.
  if (isStr(row.theme) && /^[a-z0-9-]{1,32}$/.test(row.theme)) o.theme = row.theme;
  if (typeof row.featured === 'boolean') o.featured = row.featured;
  if (Array.isArray(row.platform)) o.platform = [...new Set(row.platform.filter((p) => PLATFORMS.has(p)))];
  // sort_order defaults to 100 in 0001, so 100 means "never set": the config order stays.
  if (Number.isInteger(row.sort_order) && row.sort_order !== 100) o.sort = row.sort_order;
  if (Array.isArray(row.stats)) {
    const stats = row.stats
      .filter((x) => isObj(x) && isStr(x.label) && x.label.trim() && isStr(x.value) && x.value.trim())
      .slice(0, 3)
      .map((x) => ({ label: x.label.trim().slice(0, 32), value: x.value.trim().slice(0, 16) }));
    o.stats = stats.length ? stats : null;
  }
  if (isObj(row.theme_config)) o.themeConfig = row.theme_config;
  return { overlay: o, sortOrder: Number.isInteger(row.sort_order) ? row.sort_order : 100 };
}

const DEFAULTS = { description: null, url: null, repoUrl: null, platform: ['web'], image: null, theme: null, featured: false, stats: null, themeConfig: null };

/** Config projects first, Supabase wins on every field it sets; Supabase-only slugs are appended with defaults. */
function mergeProjects(configProjects, mapped) {
  const bySlug = new Map(configProjects.map((p, i) => [p.slug, { ...p, sort: p.sort ?? i }]));
  for (const { overlay, sortOrder } of mapped) {
    const prev = bySlug.get(overlay.slug);
    bySlug.set(overlay.slug, prev ? { ...prev, ...overlay } : { ...DEFAULTS, sort: sortOrder, ...overlay });
  }
  // Array.prototype.sort is stable: ties keep insertion order (config first).
  return [...bySlug.values()].sort((a, b) => a.sort - b.sort).slice(0, 12);
}

/** Loads src/config/site.ts through Vite (works on any Node; the config is TypeScript). Failure → null → no merge. */
async function loadSite() {
  let server;
  try {
    server = await createServer({ root, configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
    return (await server.ssrLoadModule('/src/config/site.ts')).site ?? null;
  } catch (err) {
    warn(`could not load src/config/site.ts (${err?.message ?? err}) — projects are not merged`);
    return null;
  } finally {
    await server?.close();
  }
}

const SELECT_V1 = 'slug,title,tagline,description,url,repo_url,status,accent,image_url,image_width,image_height,image_alt,sort_order';
const SELECT_V2 = `${SELECT_V1},theme,featured,platform,stats,theme_config`;

async function fetchProjectRows(env) {
  const url = (env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const key = (env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  console.log(`gen-data: supabase ${url && key ? 'configured' : 'not configured'}`);
  if (OFFLINE || !url || !key) return null;

  // Same rule as src/lib/env.ts: new sb_publishable_ keys go on `apikey` only; legacy JWT anon keys also want Bearer.
  const headers = { apikey: key, Accept: 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const get = (select) => fetchText(`${url}/rest/v1/projects?select=${select}&published=eq.true&order=sort_order.asc,created_at.asc`, { headers }, 8000);

  try {
    let body;
    try {
      body = await get(SELECT_V2);
    } catch (err) {
      // 400 = migration 0003 not applied yet (unknown columns). Degrade to the v1 columns instead of losing every project.
      if (!String(err?.message).includes('400')) throw err;
      warn('projects: v2 columns missing (run supabase/migrations/0003_projects_v2.sql) — using v1 columns');
      body = await get(SELECT_V1);
    }
    const rows = JSON.parse(body);
    if (!Array.isArray(rows)) throw new Error('response is not an array');
    return rows.map(mapProject).filter(Boolean);
  } catch (err) {
    // Loud on purpose: a silent fallback here would ship a site that quietly lost its Supabase edits.
    console.warn('gen-data: WARNING — could not fetch projects from Supabase; the build will use the config projects only.');
    warn(`supabase projects failed (${err?.name === 'TimeoutError' ? 'timeout' : (err?.message ?? err)})`);
    return null;
  }
}

// ── GitHub (public API, no token needed; GITHUB_TOKEN raises the rate limit if set, never logged) ───────────
async function fetchGithub(user) {
  if (OFFLINE || !user) return null;
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const [profile, repos] = await Promise.all([
      fetchText(`https://api.github.com/users/${user}`, { headers }).then(JSON.parse),
      fetchText(`https://api.github.com/users/${user}/repos?sort=pushed&per_page=1&type=owner`, { headers }).then(JSON.parse),
    ]);
    if (!Number.isInteger(profile.public_repos) || profile.public_repos < 0) throw new Error('no public_repos');
    const pushed = repos?.[0]?.pushed_at;
    return { publicRepos: profile.public_repos, lastPushAt: isStr(pushed) && !Number.isNaN(Date.parse(pushed)) ? new Date(pushed).toISOString() : null };
  } catch (err) {
    warn(`github failed (${err?.name === 'TimeoutError' ? 'timeout' : (err?.message ?? err)}) — the PUBLIC REPOS readout stays hidden`);
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
    schema: 2,
    builtAt: new Date().toISOString(),
    atlas: { fetchedAt: null, stats: {}, syncedOn: null },
    projects: null,
    github: null,
  };
  let summary = '';
  try {
    // loadEnv gives real env vars precedence over .env files, exactly as Vite does at build time. Values are never logged.
    const env = loadEnv('production', process.cwd(), 'VITE_');
    const siteConfig = await loadSite();
    const ghUser = /github\.com\/([^/?#]+)/.exec(siteConfig?.contact?.github?.href ?? '')?.[1] ?? null;
    const [atlasResult, rows, github] = await Promise.all([
      fetchAtlas().catch((err) => { warn(`atlas step crashed: ${err?.message ?? err}`); return null; }),
      fetchProjectRows(env).catch((err) => { warn(`projects step crashed: ${err?.message ?? err}`); return null; }),
      fetchGithub(ghUser).catch(() => null),
    ]);
    data.github = github;
    // No config (load failed) → null: src/data/index.ts then falls back to site.projects as is.
    const projects = siteConfig ? mergeProjects(siteConfig.projects ?? [], rows ?? []) : null;
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
    summary += ` · projects: ${projects ? `${projects.length} (${rows ? `${rows.length} Supabase rows merged` : 'config only'})` : 'not merged'} · github: ${github ? 'ok' : 'none'}`;
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
