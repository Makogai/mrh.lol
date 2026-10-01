import { site, type Cs2Config, type GameKey, type Lift, type WarThunderConfig } from '../config/site';
import { buildData } from '../data';
import type { AnimeData, AnimeEntry, GithubStats } from '../data/types';
import snapshot from './anime.snapshot.json';
import socials from '../data/socials.snapshot.json';

/** Everything the Loadout renders, resolved once so fixtures (src/loadout/__fixtures__) can swap any slot. */
export interface LoadoutData {
  stack: string[];
  motto: string | null;
  /** Main Steam profile, public counters only (scripts/gen-socials.mjs). null hides the link. */
  steam: { url: string; level: number; badges: number | null } | null;
  /** Newest build, for "Currently building →". null hides the line. */
  building: { title: string; status: string } | null;
  github: GithubStats | null;
  anime: {
    nowWatching: { title: string; url: string | null; cover: AnimeEntry['cover']; ep: number | null; episodes: number | null } | null;
    favourites: { title: string; cover: AnimeEntry['cover'] }[];
    stats: AnimeData['stats'];
  };
  training: { split: string | null; lifts: Lift[] };
  games: { order: GameKey[]; cs2: Cs2Config; warThunder: WarThunderConfig };
}

/**
 * AniList (build time, scripts/gen-anime.mjs, committed snapshot as the fallback) wins over the config slots, which only
 * exist for what AniList has nothing for. Never invents: an empty result renders the designed empty state.
 */
export function resolveLoadoutData(): LoadoutData {
  const anime = snapshot as Omit<AnimeData, 'source'>;
  const cfg = site.pillars.anime;
  const watching = anime.nowWatching[0];
  const forge = buildData.projects.find((p) => p.status === 'wip') ?? buildData.projects.find((p) => p.featured) ?? buildData.projects[0];
  return {
    stack: site.pillars.programming.stack,
    motto: site.pillars.programming.motto,
    steam: socials.steam ? { url: socials.steam.url, level: socials.steam.level, badges: socials.steam.badges } : null,
    building: forge ? { title: forge.title, status: forge.status } : null,
    github: buildData.github,
    anime: {
      nowWatching: watching
        ? { title: watching.title, url: watching.url, cover: watching.cover, ep: watching.progress, episodes: watching.episodes }
        : cfg.nowWatching
          ? { title: cfg.nowWatching.title, url: null, cover: null, ep: cfg.nowWatching.ep ?? null, episodes: null }
          : null,
      favourites: anime.favourites.length
        ? anime.favourites.map(({ title, cover }) => ({ title, cover }))
        : cfg.favourites.slice(0, 5).map((title) => ({ title, cover: null })),
      stats: anime.stats,
    },
    training: site.pillars.training,
    games: site.games,
  };
}
