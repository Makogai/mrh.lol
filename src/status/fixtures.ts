// Status fixtures for qa:shots and visual work: every designed state as a StatusView. Pass one as the `view` prop of
// StatusChip / PlayerChip / PartyPanel to render it without a network. Dev/QA only: nothing in the app imports this.
import type { StatusSnapshot, StatusView } from './types';

const now = () => new Date().toISOString();
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const base = (over: Partial<StatusSnapshot> = {}): StatusSnapshot => ({
  v: 1,
  updatedAt: now(),
  discord: { status: 'online', custom: null, activities: [], spotify: null },
  roblox: { state: 'offline', game: null },
  steam: [{ key: 'main', state: 'offline', game: null }, { key: 'cs', state: 'offline', game: null }],
  ...over,
});

const live = (snapshot: StatusSnapshot): StatusView => ({ state: 'live', snapshot, ageSec: 0 });

export const statusFixtures: Record<string, StatusView> = {
  loading: { state: 'loading', snapshot: null, ageSec: null },
  online: live(base({ discord: { status: 'online', custom: { emoji: null, text: 'shipping things' }, activities: [], spotify: null } })),
  cs2: live(base({
    discord: { status: 'online', custom: null, activities: [{ kind: 'playing', name: 'Counter-Strike 2', details: 'Competitive', state: 'Premier', startedAt: ago(23) }], spotify: null },
  })),
  spotify: live(base({
    discord: { status: 'idle', custom: null, activities: [], spotify: { track: 'Example Track', artist: 'Example Artist', startedAt: ago(1), endsAt: new Date(Date.now() + 120_000).toISOString() } },
  })),
  roblox: live(base({ roblox: { state: 'in-game', game: { name: 'Prospecting!', url: 'https://www.roblox.com/games/129827112113663' } } })),
  partial: { state: 'partial', snapshot: base({ discord: null }), ageSec: 0 },
  hidden: { state: 'hidden', snapshot: base({ discord: null, roblox: null, steam: null }), ageSec: 0 },
  stale: { state: 'stale', snapshot: base({ updatedAt: ago(4) }), ageSec: 240 - 60 },
  failure: { state: 'failure', snapshot: null, ageSec: null },
};
