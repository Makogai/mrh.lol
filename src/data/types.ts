// Contracts for build-time data. Producer: scripts/gen-data.mjs. Consumer: src/data/index.ts.
export type AtlasStatKey =
  | 'minerals' | 'digSites' | 'locations' | 'quests' | 'npcs' | 'craftables' | 'museumDisplays' | 'pages' | 'discordCommands';
export type AtlasStats = Record<AtlasStatKey, number>;

export type ProjectStatus = 'live' | 'beta' | 'wip' | 'archived';
export type Accent = 'amber' | 'teal' | 'violet' | 'blue';

export interface ProjectImage { src: string; width: number; height: number; alt: string }
export interface Project {
  slug: string;
  title: string;
  tagline: string;
  description: string | null;
  url: string | null; // https only
  repoUrl: string | null; // https only
  status: ProjectStatus;
  tags: string[];
  accent: Accent;
  image: ProjectImage | null;
}

/** Exact shape of src/data/generated.json. Bump `schema` (and src/data/index.ts) on any breaking change. */
export interface GeneratedData {
  schema: 1;
  /** ISO-8601 UTC time of the gen-data run. The footer year comes from here so SSR and client agree. */
  builtAt: string;
  atlas: {
    /** ISO time of a successful Atlas fetch; null when every Atlas request failed. */
    fetchedAt: string | null;
    /** Only stats that were fetched AND passed the plausibility check. `discordCommands` is never live. */
    stats: Partial<AtlasStats>;
    /** 'YYYY-MM-DD' — newest <lastmod> in the Atlas sitemap. */
    syncedOn: string | null;
  };
  /** Published projects from Supabase, already sorted. null = not fetched (env missing / request failed). */
  projects: Project[] | null;
}

/** What components consume. */
export interface BuildData {
  builtAt: string;
  buildYear: number;
  atlas: { stats: AtlasStats; live: Record<AtlasStatKey, boolean>; syncedOn: string; isLive: boolean };
  projects: Project[];
  projectsSource: 'supabase' | 'fallback';
}
