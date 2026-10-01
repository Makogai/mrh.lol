import type { LoadoutData } from '../data';

/** Fixtures for `qa:shots` (all-empty vs all-filled config). Never imported by the app. Values are placeholders, not facts. */
export const emptyLoadout: LoadoutData = {
  stack: [],
  motto: null,
  steam: null,
  building: null,
  github: null,
  anime: { nowWatching: null, favourites: [], stats: null },
  training: { split: null, lifts: [] },
  games: { order: ['cs2', 'roblox', 'warThunder'], cs2: { mode: 'Premier', rank: null, peak: null, faceit: null, hours: null, role: null, map: null, source: null }, warThunder: { nation: null, topBR: null, mainVehicle: null } },
};

export const filledLoadout: LoadoutData = {
  stack: ['TypeScript', 'React', 'Node', 'WebGL'],
  motto: 'Sample motto line.',
  steam: { url: 'https://steamcommunity.com/', level: 10, badges: 5 },
  building: { title: 'Next build', status: 'wip' },
  github: { publicRepos: 24, lastPushAt: '2026-09-28T10:00:00Z' },
  anime: {
    nowWatching: { title: 'Sample Title', url: null, cover: null, ep: 7, episodes: 12 },
    favourites: ['One', 'Two', 'Three', 'Four', 'Five'].map((title) => ({ title, cover: null })),
    stats: { count: 120, episodesWatched: 1800, daysWatched: 31, meanScore: 7.9 },
  },
  training: { split: 'Push / Pull / Legs', lifts: [{ name: 'Bench', value: '100', unit: 'KG' }, { name: 'Squat', value: '140', unit: 'KG' }] },
  games: { order: ['cs2', 'roblox', 'warThunder'], cs2: { mode: 'Premier', rank: '15,000', peak: '16,000', faceit: '2,000', hours: '2,000', role: 'Entry', map: 'Mirage', source: { label: 'sample', asOf: '1 Jan 2026' } }, warThunder: { nation: 'Germany', topBR: '11.7', mainVehicle: 'Sample' } },
};
