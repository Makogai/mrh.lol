// Contracts for build-time data. Producer: scripts/gen-data.mjs. Consumer: src/data/index.ts. Schema 2 (v2 front end).
export type AtlasStatKey =
  | 'minerals' | 'digSites' | 'locations' | 'quests' | 'npcs' | 'craftables' | 'museumDisplays' | 'pages' | 'discordCommands';
export type AtlasStats = Record<AtlasStatKey, number>;

export type ProjectStatus = 'live' | 'beta' | 'wip' | 'archived';
export type Accent = 'amber' | 'teal' | 'violet' | 'blue';
/** Where a build runs. Drives the platform sigils on its item card. */
export type Platform = 'roblox' | 'discord' | 'web' | 'cli';

export interface ProjectImage { src: string; width: number; height: number; alt: string }
/** One mono readout on an item card. `value` is preformatted and must be real data (never a placeholder). */
export interface ProjectStat { label: string; value: string }

export interface Project {
  slug: string;
  title: string;
  tagline: string;
  description: string | null;
  url: string | null; // https only
  repoUrl: string | null; // https only
  status: ProjectStatus;
  platform: Platform[];
  accent: Accent;
  image: ProjectImage | null;
  /** Theme registry key (src/work/themes). null or unknown → 'forge'. */
  theme: string | null;
  featured: boolean;
  /** Ascending. Ties keep input order. */
  sort: number;
  /** ≤3 readouts. null = the theme decides (atlas fills its own from live build stats). */
  stats: ProjectStat[] | null;
  /** Theme-specific payload; each theme validates its own (ThemeDef.parseConfig). */
  themeConfig: Record<string, unknown> | null;
}

// ── AniList (public GraphQL, fetched at BUILD time by gen-data; src/config/site.ts → pillars.anime.anilistUsername) ──
export interface AnimeEntry {
  id: number;
  title: string;
  /** Page on anilist.co (https). */
  url: string;
  /** Cover downloaded at build time into public/anime/ (webp, explicit dims). null = no cover → the panel draws a halftone frame. */
  cover: { src: string; width: number; height: number } | null;
}
export interface AnimeWatching extends AnimeEntry { progress: number | null; episodes: number | null }
export interface AnimeData {
  username: string;
  /** ISO time of the AniList fetch, or of the committed fallback snapshot when the fetch failed. */
  fetchedAt: string;
  /** Where the numbers came from: a successful build-time fetch, or the committed snapshot. */
  source: 'anilist' | 'fallback';
  nowWatching: AnimeWatching[];
  favourites: AnimeEntry[];
  stats: { count: number; episodesWatched: number; daysWatched: number; meanScore: number | null } | null;
}

/** Public-API readouts for the Loadout PRIMARY slot (GitHub). Hidden by the UI when the fetch failed. */
export interface GithubStats { publicRepos: number; /** ISO time of the newest push. */ lastPushAt: string | null }

/** Exact shape of src/data/generated.json. Bump `schema` (and src/data/index.ts) on any breaking change. */
export interface GeneratedData {
  schema: 2;
  /** ISO-8601 UTC time of the gen-data run. The footer year and the `v2 · build` stamp come from here so SSR and client agree. */
  builtAt: string;
  atlas: {
    /** ISO time of a successful Atlas fetch; null when every Atlas request failed. */
    fetchedAt: string | null;
    /** Only stats that were fetched AND passed the plausibility check. `discordCommands` is never live. */
    stats: Partial<AtlasStats>;
    /** 'YYYY-MM-DD' — newest <lastmod> in the Atlas sitemap. */
    syncedOn: string | null;
  };
  /** Published projects (Supabase merged over site.projects by slug, already sorted). null = not merged → site.projects as is. */
  projects: Project[] | null;
  github?: GithubStats | null;
  anime?: AnimeData | null;
}

/** What components consume. */
export interface BuildData {
  builtAt: string;
  /** 'YYYY.MM.DD' from `builtAt` — the `v2 · build …` stamp in the hero chip and the footer. */
  buildStamp: string;
  buildYear: number;
  atlas: { stats: AtlasStats; live: Record<AtlasStatKey, boolean>; syncedOn: string; isLive: boolean };
  projects: Project[];
  projectsSource: 'supabase' | 'fallback';
  github: GithubStats | null;
  anime: AnimeData | null;
}
