import { site } from '../config/site';
import type { AtlasStatKey, AtlasStats, BuildData, GeneratedData } from './types';

// generated.json is written by scripts/gen-data.mjs before every build and is gitignored. A glob instead of a static
// import keeps a fresh clone compiling: when the file is missing the glob is empty and everything falls back to site.ts.
const files = import.meta.glob<GeneratedData>('./generated.json', { eager: true, import: 'default' });
const gen: GeneratedData | undefined = files['./generated.json'];

const fallback = site.flagship.statsFallback;
const stats: AtlasStats = { ...fallback };
const live = {} as Record<AtlasStatKey, boolean>;
for (const key of Object.keys(fallback) as AtlasStatKey[]) {
  const v = gen?.atlas.stats[key];
  live[key] = typeof v === 'number';
  if (typeof v === 'number') stats[key] = v;
}

// Dev-only path: production builds always have generated.json (gen-data runs first and always writes).
const builtAt = gen?.builtAt ?? new Date().toISOString();

export const buildData: BuildData = {
  builtAt,
  buildYear: Number(builtAt.slice(0, 4)),
  atlas: {
    stats,
    live,
    syncedOn: gen?.atlas.syncedOn ?? site.flagship.syncedOnFallback,
    isLive: Boolean(gen?.atlas.fetchedAt),
  },
  projects: gen?.projects ?? site.projectsFallback,
  projectsSource: gen?.projects ? 'supabase' : 'fallback',
};
