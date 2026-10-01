// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE single source of truth for everything personal on mrh.lol (v2 schema, docs/V2_DESIGN.md §7).
// • Components read from here — never hard-code a name, handle, URL or bio anywhere else.
// • TODO(me)  = the owner hasn't supplied it yet. It stays null/empty; every such slot has a designed empty state.
// • EDITABLE  = copy the owner delegated — change freely.
// • Keep this file free of runtime imports: scripts/gen-assets.mjs and vite.config.ts import it directly with Node.
//
// TODO(me) CHECKLIST — fill these in and the matching UI appears; leave them and the empty state shows:
//   [ ] avatar                      new mascot art (assets-src/avatar-v2.png → `npm run gen:avatar`, then check `alt`)
//   [ ] pillars.programming.stack   e.g. ['TypeScript', 'React', …]      empty → "This site: Vite · React · TypeScript · raw WebGL"
//   [ ] pillars.anime.nowWatching   {title, ep?} (AniList fills it at build time when it has one)  empty → "One more episode. Always."
//   [ ] pillars.anime.favourites    ≤5 titles (AniList favourites are used first)
//   [ ] pillars.training            {split, lifts[≤4]} — owner wants no stats: leave empty            empty → "Consistency over noise."
//   [ ] games.cs2                   Premier rating (`rank`), hours, role, map                         empty → "FAVOURITE · #1"
//   [ ] games.warThunder            nation, topBR, mainVehicle                                        empty → "FAVOURITE"
//   [ ] squad[].role / .accent      optional tag + accent per friend
//   [ ] projects['prospecting-bot'].themeConfig   commands[] (11 slash-command names + descriptions), exampleEmbed, inviteUrl
//   [ ] contact.discord.serverInvite              e.g. 'https://discord.gg/xxxx' → "Join the server" appears
//   [ ] contact.twitter / youtube / twitch        channels not provided yet
//   [ ] roblox.headshot             set by the squad asset build (P4): 80px AVIF of the owner's headshot; null → monogram
// ─────────────────────────────────────────────────────────────────────────────────────────────
import type { AtlasStatKey, AtlasStats, Project } from '../data/types.ts'; // with extension: vite.config.ts loads this file natively (Node ESM)

export interface ImageSet { avif: string; webp: string; png: string }
export interface AvatarConfig {
  /** 352×352 renditions for phones (176 CSS px bezel at 2x); optional. Kept small because the avatar loads at startup there. */
  srcSm?: ImageSet;
  /** 512×512 renditions — the 1x source on every layout. */
  src: ImageSet;
  /** 1024×1024 renditions for 2x screens; null if not exported. */
  src2x: ImageSet | null;
  /** Intrinsic size of `src`; reserves the layout before the image loads. */
  width: number;
  height: number;
  alt: string;
}
export interface Channel { label: string; handle: string; href: string }
/** What the site says about the owner's live Roblox status. 'status' never names the game; 'off' never fetches. */
export type PresenceMode = 'game' | 'status' | 'off';

export type PillarId = 'programming' | 'games' | 'anime' | 'training';
export type SectionKey = 'loadout' | 'work' | 'squad' | 'contact';
export type LiveGameKey = 'cs2' | 'warThunder' | 'roblox' | 'code';
/** The three game tiles of the Loadout (LiveGameKey minus the editor). */
export type GameKey = Exclude<LiveGameKey, 'code'>;

export interface PillarMeta {
  /** Game-UI label (wide 800, uppercase in CSS). */
  label: string;
  /** Plain-English name for screen readers and tooltips. */
  plain: string;
  /** One line under the label in the Loadout slot. */
  blurb: string;
  /** Local accent hex (`--accent` while this pillar is selected). */
  accent: string;
}
export interface RobloxConfig {
  username: string;
  /** Mirrored by hand in nginx.conf (fixed POST body): change both together. vite.config.ts reads this one. */
  userId: number;
  profileUrl: string;
  presence: PresenceMode;
  /** Same-origin nginx/Vite proxy: the fallback Roblox source when status.mrh.lol is unreachable. */
  presenceEndpoint: string;
  /** Folder with avatar.json, the hashed .bin/textures and fallback/ images. Ends with '/'. */
  assetsBase: string;
  /** Build-time 40px headshot (80px file) for the hero / system-bar chips. TODO(me) → set by the squad asset build. */
  headshot: string | null;
}
export interface SquadMember {
  robloxUserId: number;
  /** Roblox username: also the folder name in assets-src/roblox-friends/<username>/. */
  username: string;
  displayName: string;
  /** Optional mono tag on the plate, e.g. 'DUO'. TODO(me) */
  role: string | null;
  /** CSS colour for the floor ring and plate; null → the rotating default (teal, violet, blue, coral). */
  accent: string | null;
}
export interface StatTile {
  key: AtlasStatKey;
  /** Text after the number. `{statKey}` placeholders are replaced with formatted numbers, e.g. '{npcs}'. */
  label: string;
}
export interface Cs2Config {
  /** Queue the owner plays; shown on the scoreboard row. */
  mode: string | null;
  /** Premier rating, or a rank name. */
  rank: string | null;
  /** Season peak Premier rating. */
  peak: string | null;
  /** FACEIT Elo. */
  faceit: string | null;
  hours: string | null;
  role: string | null;
  map: string | null;
  /** Where rank/peak/faceit came from. Plain text, no link: the source page shows the CS account's persona name. */
  source: { label: string; asOf: string } | null;
}
export interface WarThunderConfig { nation: string | null; /** Battle rating, e.g. '11.7'. */ topBR: string | null; mainVehicle: string | null }
export interface Lift { name: string; value: string; unit: string }

export interface SiteConfig {
  origin: string;
  displayName: string;
  spokenName: string;
  /** Hero tagline. */
  identity: string;
  /** Loadout kicker line (alternate tagline). */
  loadoutLine: string;
  bio: string;
  interests: string[];
  /** The mascot slot (spec: `portrait`). A square, flat illustration on a dark ground. null → the Roblox render is used. */
  avatar: AvatarConfig | null;
  hero: {
    /** Main-menu rows in order; label/href come from `sections`. The first is the primary row. */
    menu: SectionKey[];
    scrollHint: string;
  };
  sections: Record<SectionKey, {
    id: string;
    /** '01'…'04' — the kicker number and the main-menu index of the page order (menu rows use their own order). */
    index: string;
    /** Lexicon word: system-bar tick, menu row, h2. */
    title: string;
    /** Mono kicker tag after the hairline: `02 ─── ITEM LIST`. */
    kicker: string;
    /** sr-only plain-English subtitle after the h2. */
    subtitle: string;
  }>;
  pillars: {
    programming: { stack: string[]; motto: string | null };
    anime: {
      /** AniList username used by gen-data at build time (favourites, currently watching, stats). null → no fetch. */
      anilistUsername: string | null;
      nowWatching: { title: string; ep?: number } | null;
      favourites: string[];
    };
    training: { split: string | null; lifts: Lift[] };
  };
  pillarMeta: Record<PillarId, PillarMeta>;
  games: {
    /** Favourite order, first is the big tile. */
    order: GameKey[];
    cs2: Cs2Config;
    warThunder: WarThunderConfig;
  };
  roblox: RobloxConfig;
  squad: {
    /** ≤4 friends (the owner is the fifth slot). Friends' consent first; avatars + names only, never live status. */
    members: SquadMember[];
    copy: { sub: string; openSlot: string; waiting: string; ready: string };
  };
  /** Live-status service (src/status/ + services/status/). */
  status: {
    /** Production relay. Dev override: `devEndpoint`; build override: VITE_STATUS_URL (resolved in src/status, not here). */
    endpoint: string;
    devEndpoint: string;
    /** Server-side allowlist is authoritative; this mirrors what the UI may render. */
    show: { discord: boolean; activity: boolean; custom: boolean; spotify: boolean; robloxGame: boolean };
    /** Activity-name matchers → LiveGameKey (hero pulse tint, Loadout IN MATCH, system-bar live tick). */
    gameMatchers: Record<LiveGameKey, RegExp>;
    /**
     * Steam profiles the relay watches. UI shows only these neutral labels, NEVER persona names. Vanity URLs / steamID64s
     * live in services/status env (STATUS_STEAM_*), not in this client-bundled file.
     */
    steam: { key: 'main' | 'cs'; label: string }[];
  };
  /** Atlas build data: live-stat fallbacks, the screenshot set and the readout tiles. */
  atlas: {
    url: string;
    stats: StatTile[];
    highlights: string[];
    statsFallback: AtlasStats;
    syncedOnFallback: string;
    screenshot: {
      widths: number[];
      pattern: string;
      fallback: string;
      width: number;
      height: number;
      alt: string;
      /** Phone-only crop shown below `media`; its own width/height keep the layout stable (CLS 0) while a different aspect loads. */
      mobile: { media: string; widths: number[]; pattern: string; width: number; height: number };
    };
  };
  /** Builds. Merged with Supabase rows by slug at build time (Supabase wins on any field it sets). */
  projects: Project[];
  work: {
    forgeSlot: { title: string; body: string; linkLabel: string; href: string };
  };
  contact: {
    primary: 'discord' | 'email';
    intro: string;
    discord: { handle: string; altHandle: string | null; serverInvite: string | null };
    email: string | null;
    github: Channel;
    roblox: Channel | null;
    twitter: Channel | null;
    youtube: Channel | null;
    twitch: Channel | null;
    form: { enabled: boolean; title: string; note: string; success: string };
  };
  footer: { back: string };
  sourceUrl: string | null;
  seo: {
    title: string;
    description: string;
    ogImage: { src: string; width: number; height: number; alt: string };
    themeColor: string;
  };
}

export const site: SiteConfig = {
  origin: 'https://mrh.lol', // canonical origin, no trailing slash

  displayName: 'MrHarold',
  // Owner's answer to "real name". Used only as JSON-LD alternateName; no real name is published.
  spokenName: 'Mr Harold',
  // Final copy (V2_DESIGN §8). Owner: no aviation anywhere.
  identity: 'Programmer by trade. Gamer by default.',
  loadoutLine: 'Main class: programmer. Side quests: everything else.',
  // **…** renders as amber emphasis.
  bio: "I'm MrHarold — a programmer who builds tools for the games I play, like **Prospecting Atlas**. Off the keyboard it's CS2, anime and the gym.",
  // Owner's four pillars. Used by JSON-LD (knowsAbout) and the OG image.
  interests: ['programming', 'games', 'anime', 'working out'],

  // Mascot slot. Until the new flat mascot lands (assets-src/avatar-v2.png → `npm run gen:avatar`) this points at the current
  // renditions, which are the retired v1 portrait: replace them, do not ship them. The Loadout falls back to the Roblox render
  // when this is null.
  avatar: {
    srcSm: { avif: '/avatar/avatar-352.avif', webp: '/avatar/avatar-352.webp', png: '/avatar/avatar-352.png' },
    src: { avif: '/avatar/avatar-512.avif', webp: '/avatar/avatar-512.webp', png: '/avatar/avatar-512.png' },
    src2x: { avif: '/avatar/avatar-1024.avif', webp: '/avatar/avatar-1024.webp', png: '/avatar/avatar-1024.png' },
    width: 512,
    height: 512,
    alt: 'MrHarold’s mascot: a chunky amber robot with a CRT-screen face, a controller and a dumbbell',
  },

  hero: {
    // BUILDS is the primary row (2px amber bar); the rest follow page order.
    menu: ['work', 'loadout', 'squad', 'contact'],
    scrollHint: 'Scroll',
  },

  // The ids #about / #work / #contact are kept so old links still work; #squad is new.
  sections: {
    loadout: { id: 'about', index: '01', title: 'Loadout', kicker: 'CHARACTER SHEET', subtitle: 'Who I am' },
    work: { id: 'work', index: '02', title: 'Builds', kicker: 'ITEM LIST', subtitle: "What I've built" },
    squad: { id: 'squad', index: '03', title: 'Lobby', kicker: 'PARTY', subtitle: 'Who I play with, and what I’m up to right now' },
    contact: { id: 'contact', index: '04', title: 'Comms', kicker: 'CHANNELS', subtitle: 'How to reach me' },
  },

  pillars: {
    // From the owner's ChatGPT memory (2026-10-01), ordered by use. `motto` renders as a code comment in the editor panel.
    programming: {
      stack: ['TypeScript', 'Angular', 'Laravel · PHP', 'Node.js', 'Python · FastAPI', 'Vue', 'Flutter', 'Java · Spring'],
      motto: "I'll spend 30 minutes automating something that takes five — and call it a win.",
    },
    anime: {
      anilistUsername: 'makogai', // public profile; gen-data fetches favourites / watching / stats at build time
      nowWatching: null, // TODO(me): only needed if AniList has nothing "Watching"; {title: '…', ep: 12}
      favourites: [], // TODO(me): ≤5 titles; AniList favourites win when the build-time fetch works
    },
    // Owner: "just mention it" — no stats, PRs or apps. Leave both empty; the panel is theming + one line of copy.
    training: { split: null, lifts: [] },
  },

  pillarMeta: {
    programming: { label: 'Programming', plain: 'Programming', blurb: 'Main class', accent: '#3ee0d0' },
    games: { label: 'Games', plain: 'Games', blurb: 'CS2 first', accent: '#ffc247' },
    anime: { label: 'Anime', plain: 'Anime', blurb: 'One more episode', accent: '#a78bfa' },
    training: { label: 'Training', plain: 'Working out', blurb: 'Consistency', accent: '#60a5fa' },
  },

  games: {
    // Owner: CS2 is the favourite; also Roblox and War Thunder. Game names appear as plain text only — no logos or art.
    order: ['cs2', 'roblox', 'warThunder'],
    // Premier / peak / FACEIT: snapshot of csrep.gg for the CS account, 1 Oct 2026. csrep's API is request-only, so this is
    // refreshed by hand; `source` keeps the date visible so it never reads as live.
    cs2: {
      mode: 'Premier', rank: '3,297', peak: '3,306', faceit: '721', hours: '540', role: null, map: 'de_mirage',
      source: { label: 'csrep.gg', asOf: '1 Oct 2026' },
    },
    warThunder: { nation: 'USA', topBR: '12.0', mainVehicle: 'M1A1 HC' },
  },

  // Owner's own Roblox account (live avatar pipeline: scripts/roblox/, assets under public/roblox/).
  roblox: {
    username: 'MrHarold0011',
    userId: 1113999731,
    profileUrl: 'https://www.roblox.com/users/1113999731/profile',
    presence: 'game', // owner: show the game name while in a game
    presenceEndpoint: '/api/roblox-presence', // proxied same-origin by nginx.conf and vite.config.ts (Roblox sends no CORS)
    assetsBase: '/roblox/',
    headshot: '/roblox/squad/me/headshot-80.85e9b06b.avif',
  },

  squad: {
    // Owner supplied both friends. Avatars + names only: no live status for friends (consent not given for that).
    members: [
      { robloxUserId: 7862008029, username: 'ChaInFilip', displayName: 'ChaInFilip', role: null, accent: null },
      { robloxUserId: 1197478178, username: 'fairytail6729', displayName: 'fairytail6729', role: null, accent: null },
    ],
    copy: {
      sub: 'My Roblox party. Tap someone to say hi.',
      openSlot: 'OPEN SLOT',
      waiting: 'WAITING FOR SQUAD',
      ready: 'READY',
    },
  },

  status: {
    endpoint: 'https://status.mrh.lol',
    devEndpoint: 'http://localhost:3000',
    // Spotify is OFF by default (privacy); everything else the owner has not objected to.
    show: { discord: true, activity: true, custom: true, spotify: false, robloxGame: true },
    gameMatchers: {
      cs2: /counter-strike/i,
      warThunder: /war thunder/i,
      roblox: /^roblox$/i,
      code: /^(visual studio code|cursor|jetbrains.*|neovim|zed)$/i,
    },
    steam: [
      { key: 'main', label: 'Steam · main' },
      { key: 'cs', label: 'Steam · CS' },
    ],
  },

  atlas: {
    url: 'https://prospecting.mrh.lol',
    stats: [
      { key: 'minerals', label: 'minerals, every drop rate' },
      { key: 'digSites', label: 'dig sites with full loot tables' },
      { key: 'quests', label: 'quests · {npcs} NPCs' },
      { key: 'craftables', label: 'craftables' },
      { key: 'pages', label: 'pages, all prerendered' },
      { key: 'discordCommands', label: 'Discord bot slash commands' },
    ],
    highlights: ['A museum planner over {museumDisplays} displays', 'A luck model that re-prices every drop rate'],
    // Used when the build-time fetch fails. Snapshot taken 2026-10-01 from https://prospecting.mrh.lol:
    //   sitemap.xml → pages (194 <loc>), minerals (/minerals/* = 113), digSites (/sites/* = 33),
    //                 locations (/locations/* = 28), syncedOn (newest <lastmod> = 2026-09-30)
    //   /  meta description → quests (107), craftables (67)
    //   /quests/ <title> → npcs (120)      /museum/ <title> → museumDisplays (18)
    //   discordCommands (11) is not published on the site — owner-confirmed count; update by hand.
    statsFallback: { minerals: 113, digSites: 33, locations: 28, quests: 107, npcs: 120, craftables: 67, museumDisplays: 18, pages: 194, discordCommands: 11 },
    syncedOnFallback: '2026-09-30',
    screenshot: {
      // Written by `npm run gen:shots` (scripts/shoot-atlas.mjs) from the live site. Desktop frame is cropped to 1440×744.
      widths: [720, 1440],
      pattern: '/projects/prospecting-atlas-{w}.{ext}', // ext ∈ avif | webp
      fallback: '/projects/prospecting-atlas-1440.jpg',
      width: 1440,
      height: 744,
      // Phone capture: 390×550 CSS at 2x, so the Atlas UI text is legible at ~1:1.
      mobile: { media: '(max-width: 47.99rem)', widths: [780], pattern: '/projects/prospecting-atlas-m-{w}.{ext}', width: 780, height: 1100 },
      alt: 'The Prospecting Atlas home page: search bar, mineral and dig-site counts, and quick links into each section.',
    },
  },

  // Normally merged with Supabase rows by slug (scripts/gen-data.mjs). These two are the shipped builds. `stats: null` →
  // the theme fills its readouts from live build data (atlas stats).
  projects: [
    {
      slug: 'prospecting-atlas',
      title: 'Prospecting Atlas',
      tagline: 'Every mineral, drop rate and dig site in Prospecting!, in one searchable atlas.',
      description: 'A fan database and toolset for the Roblox game Prospecting! — scraped from the official wiki, rebuilt around the questions players actually ask.',
      url: 'https://prospecting.mrh.lol',
      repoUrl: null, // TODO(me): public repo URL, if any
      status: 'live',
      platform: ['web', 'roblox'],
      accent: 'amber',
      image: null,
      theme: 'atlas',
      featured: true,
      sort: 0,
      stats: null,
      themeConfig: null,
    },
    {
      slug: 'prospecting-bot',
      title: 'Prospecting Atlas bot',
      tagline: 'Where to find every mineral in Prospecting!, as Discord cards.',
      // The bot's own description (owner-supplied). The discord-bot theme shows it in the embed until `exampleEmbed` is filled.
      description:
        'Where to find every mineral in Prospecting! Ranked drop rates, full dig-site loot tables, a farm planner and gear comparisons — rendered as cards. Unofficial fan project; data from the Official Prospecting! Wiki.',
      url: 'https://discord.com/oauth2/authorize?client_id=1554465933152755722',
      repoUrl: null,
      status: 'live',
      platform: ['discord'],
      accent: 'blue',
      image: null,
      theme: 'discord-bot',
      featured: false,
      sort: 1,
      stats: null,
      themeConfig: {
        // TODO(me): the 11 slash commands — [{ name: 'minerals', description: '…' }, …]. Empty → "/11" skeleton.
        commands: [],
        // TODO(me): paste real bot output — { title: '…', fields: [{ name: '…', value: '…' }] }. null → hidden.
        exampleEmbed: null,
        inviteUrl: 'https://discord.com/oauth2/authorize?client_id=1554465933152755722',
      },
    },
  ],
  work: {
    forgeSlot: {
      title: 'In the forge',
      body: 'Next build loading. New tools land here as they ship.',
      linkLabel: 'Follow along on GitHub',
      href: 'https://github.com/Makogai',
    },
  },

  contact: {
    primary: 'discord',
    intro: 'Discord is the fastest way to reach me.', // EDITABLE — owner made Discord the primary route
    discord: {
      handle: 'makogai',
      altHandle: 'mrharold01', // a SECOND DISCORD account, not Roblox (the Roblox name is MrHarold0011): keep the two apart
      // Discord profile URLs need numeric IDs, so the primary action is "copy handle".
      serverInvite: null, // TODO(me): e.g. 'https://discord.gg/xxxx' — shows "Join the server" when set
    },
    email: 'contact@mrh.lol', // owner: "for now use contact@mrh.lol"
    github: { label: 'GitHub', handle: 'Makogai', href: 'https://github.com/Makogai' },
    roblox: { label: 'Roblox', handle: 'MrHarold0011', href: 'https://www.roblox.com/users/1113999731/profile' }, // mirrors `roblox` above
    twitter: null, // TODO(me): not provided
    youtube: null, // TODO(me): not provided
    twitch: null, // TODO(me): not provided
    form: {
      // Needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY at build time; production hides the form without them.
      enabled: true,
      title: 'Leave a message',
      note: 'Goes straight to my inbox. No newsletter, no tracking.', // EDITABLE
      success: "Got it — I'll reply at {replyTo}.", // EDITABLE
    },
  },

  footer: { back: 'Back to main menu' },

  sourceUrl: 'https://github.com/Makogai/mrh.lol',

  seo: {
    title: 'MrHarold — programmer by trade, gamer by default',
    description: 'MrHarold: programmer and gamer. I build tools for the games I play, like Prospecting Atlas and its Discord bot.',
    // Regenerated by `npm run gen:assets`: the name over the vein field with the four sigils.
    ogImage: { src: '/og.png', width: 1200, height: 630, alt: 'MrHarold — the name over a field of glowing veins, with four small sigils for programming, games, anime and training.' },
    themeColor: '#06080e',
  },
};
