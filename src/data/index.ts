import { site } from '../config/site';
import type { AtlasStatKey, AtlasStats, BuildData, GeneratedData, Project } from './types';

// generated.json is written by scripts/gen-data.mjs before every build and is gitignored. A glob instead of a static
// import keeps a fresh clone compiling: when the file is missing the glob is empty and everything falls back to site.ts.
const files = import.meta.glob<GeneratedData>('./generated.json', { eager: true, import: 'default' });
const gen: GeneratedData | undefined = files['./generated.json'];

const fallback = site.atlas.statsFallback;
const stats: AtlasStats = { ...fallback };
const live = {} as Record<AtlasStatKey, boolean>;
for (const key of Object.keys(fallback) as AtlasStatKey[]) {
  const v = gen?.atlas.stats[key];
  live[key] = typeof v === 'number';
  if (typeof v === 'number') stats[key] = v;
}

// Dev-only path: production builds always have generated.json (gen-data runs first and always writes).
const builtAt = gen?.builtAt ?? new Date().toISOString();

// A schema-1 generated.json (written before gen-data learned the v2 merge) carries v1 project rows and no config projects:
// ignore its list rather than render an empty Builds section. gen-data writes `schema: 2` once it merges site.projects itself.
const projectRows = gen?.schema === 2 ? gen.projects : null;

/**
 * Fills the v2 fields on a project that an older generated.json (schema 1: `tags`, no theme/platform/stats) or a sparse
 * Supabase row left out, so consumers can rely on the full shape. Remove once every producer writes schema 2.
 */
function complete(p: Partial<Project> & Pick<Project, 'slug' | 'title'>, i: number): Project {
  return {
    tagline: '',
    description: null,
    url: null,
    repoUrl: null,
    status: 'live',
    platform: [],
    accent: 'amber',
    image: null,
    theme: null,
    featured: false,
    sort: i,
    stats: null,
    themeConfig: null,
    ...p,
  };
}

export const buildData: BuildData = {
  builtAt,
  buildStamp: builtAt.slice(0, 10).replaceAll('-', '.'),
  buildYear: Number(builtAt.slice(0, 4)),
  atlas: {
    stats,
    live,
    syncedOn: gen?.atlas.syncedOn ?? site.atlas.syncedOnFallback,
    isLive: Boolean(gen?.atlas.fetchedAt),
  },
  projects: (projectRows ?? site.projects).map(complete).sort((a, b) => a.sort - b.sort),
  projectsSource: projectRows ? 'supabase' : 'fallback',
  github: gen?.github ?? null,
  anime: gen?.anime ?? null,
};
