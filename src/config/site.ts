// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE single source of truth for everything personal on mrh.lol.
// • Components read from here — never hard-code a name, handle, URL or bio anywhere else.
// • TODO(me)  = the owner hasn't supplied it yet. It stays null; the UI hides whatever is null.
// • EDITABLE  = copy the owner delegated ("you decide", "along those lines") — change freely.
// • Keep this file free of runtime imports: scripts/gen-assets.mjs imports it directly with Node.
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
/** What the Roblox card says about the owner's live status. 'status' never names the game; 'off' never fetches. */
export type PresenceMode = 'game' | 'status' | 'off';
export interface RobloxConfig {
  username: string;
  /** Mirrored by hand in nginx.conf (fixed POST body): change both together. vite.config.ts reads this one. */
  userId: number;
  profileUrl: string;
  presence: PresenceMode;
  presenceEndpoint: string;
  /** Folder with avatar.json, the hashed .bin/textures and fallback/ images. Ends with '/'. */
  assetsBase: string;
  card: {
    kicker: string;
    /** Shown whenever there is no real presence data (loading, error, 'off'). Never a guess. */
    neutralBadge: string;
    sayHi: string;
    viewProfile: string;
    viewGame: string;
    posterAlt: string;
  };
  copy: { line: string; sub: string; builtFor: string };
}
export interface StatTile {
  key: AtlasStatKey;
  /** Text after the number. `{statKey}` placeholders are replaced with formatted numbers, e.g. '{npcs}'. */
  label: string;
}
export interface SiteConfig {
  origin: string;
  displayName: string;
  spokenName: string;
  identity: string;
  bio: string;
  interests: string[];
  location: { label: string; flourish: string | null };
  avatar: AvatarConfig | null;
  hero: {
    primaryCta: { label: string; href: string };
    secondaryCta: { label: string; href: string };
    scrollHint: string;
  };
  sections: Record<'about' | 'player' | 'work' | 'contact', { id: string; index: string; title: string }>;
  roblox: RobloxConfig;
  flagship: {
    slug: string;
    title: string;
    url: string;
    kicker: string;
    summary: string;
    cta: string;
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
    stats: StatTile[];
    highlights: string[];
    statsFallback: AtlasStats;
    syncedOnFallback: string;
  };
  projectsFallback: Project[];
  forgeCard: { title: string; body: string; linkLabel: string; href: string };
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
  // EDITABLE — owner: "you decide something cool". The "looking up" is the planes nod.
  // \u00a0 between "a" and "habit": `text-wrap: balance` otherwise leaves the article dangling at the end of line 1.
  identity: 'Code, games, and a\u00a0habit of looking up.',
  // EDITABLE — owner: "gamer, programmer, something along those lines". **…** renders as amber emphasis.
  bio: "I'm MrHarold — a programmer who never really stopped being a gamer. I build the tools I wish existed for the games I play, like **Prospecting Atlas**, and I sweat the details nobody asked for. When I'm not shipping code, I'm probably in a flight sim or watching planes go over.",
  interests: ['gaming', 'programming', 'aviation'], // owner: gaming, programming, planes/aviation
  // Owner: "say location Cloud". `flourish` is a designer's joke (flight level 350 ≈ 35,000 ft cruise) — null drops it.
  location: { label: 'the Cloud', flourish: 'FL350' },

  // Generated from assets-src/avatar.png by scripts/gen-avatar.mjs. EDITABLE: swap the art or the alt text any time.
  avatar: {
    srcSm: { avif: '/avatar/avatar-352.avif', webp: '/avatar/avatar-352.webp', png: '/avatar/avatar-352.png' },
    src: { avif: '/avatar/avatar-512.avif', webp: '/avatar/avatar-512.webp', png: '/avatar/avatar-512.png' },
    src2x: { avif: '/avatar/avatar-1024.avif', webp: '/avatar/avatar-1024.webp', png: '/avatar/avatar-1024.png' },
    width: 512,
    height: 512,
    alt: 'Illustrated portrait of MrHarold in aviator goggles and a gaming headset, with glowing circuit traces and a plane behind him.',
  },

  hero: {
    primaryCta: { label: "See what I've built", href: '#work' },
    secondaryCta: { label: 'Get in touch', href: '#contact' },
    scrollHint: 'Scroll',
  },

  sections: {
    about: { id: 'about', index: '01', title: 'Who I am' },
    player: { id: 'player', index: '02', title: 'In game' },
    work: { id: 'work', index: '03', title: "What I've built" },
    contact: { id: 'contact', index: '04', title: 'Get in touch' },
  },

  // The live 3D avatar beat (src/roblox/, docs/PLAYER_INTEGRATION.md). Assets are built by `npm run roblox:build`.
  roblox: {
    username: 'MrHarold0011',
    userId: 1113999731,
    profileUrl: 'https://www.roblox.com/users/1113999731/profile',
    // TODO(me): how much of your Roblox status should the site show?
    //   'status' = online / in game / offline, never the game name (current default)
    //   'game'   = also the game name and a "View game" link while you are in a game
    //   'off'    = no presence at all (the badge stays neutral and nothing is fetched)
    presence: 'status',
    presenceEndpoint: '/api/roblox-presence', // proxied same-origin by nginx.conf and vite.config.ts (Roblox sends no CORS)
    assetsBase: '/roblox/',
    card: {
      kicker: 'Player 1',
      neutralBadge: 'Main · Roblox',
      sayHi: 'Say hi',
      viewProfile: 'View on Roblox',
      viewGame: 'View game',
      posterAlt: "MrHarold's Roblox avatar: curved black horns, messy black hair, a skull-teeth mask, a black skull-print sweater, one white and one black wing with violet lightning.",
    },
    // EDITABLE: placeholder copy. `builtFor` is "<game> → <project>"; the project half links to the Work section.
    copy: { line: 'Same me. More horns.', sub: 'Drag me around — I wave back.', builtFor: 'Prospecting! → Prospecting Atlas' },
  },

  flagship: {
    slug: 'prospecting-atlas',
    title: 'Prospecting Atlas',
    url: 'https://prospecting.mrh.lol',
    kicker: 'Flagship',
    // PROMPT.md §4
    summary: 'A fan database and toolset for the Roblox game Prospecting! — scraped from the official wiki, rebuilt around the questions players actually ask.',
    cta: 'Open Prospecting Atlas',
    screenshot: {
      // Written by `npm run gen:shots` (scripts/shoot-atlas.mjs) from the live site. Desktop frame is cropped to 1440×744
      // so its bottom edge ends above the Atlas "Jump straight in" icon cards instead of slicing through them.
      widths: [720, 1440],
      pattern: '/projects/prospecting-atlas-{w}.{ext}', // ext ∈ avif | webp
      fallback: '/projects/prospecting-atlas-1440.jpg',
      width: 1440,
      height: 744,
      // Phone capture: 390×550 CSS at 2x, so the Atlas UI text is legible at ~1:1 instead of ~3 px tall.
      mobile: { media: '(max-width: 47.99rem)', widths: [780], pattern: '/projects/prospecting-atlas-m-{w}.{ext}', width: 780, height: 1100 },
      alt: 'The Prospecting Atlas home page: search bar, mineral and dig-site counts, and quick links into each section.',
    },
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
    //   discordCommands (11) is not published on the site — from PROMPT.md §4; update by hand.
    statsFallback: { minerals: 113, digSites: 33, locations: 28, quests: 107, npcs: 120, craftables: 67, museumDisplays: 18, pages: 194, discordCommands: 11 },
    syncedOnFallback: '2026-09-30',
  },

  // Projects normally come from Supabase at build time (scripts/gen-data.mjs). This is used only when that fetch
  // is unavailable. Owner: "none for now".
  projectsFallback: [],
  forgeCard: {
    title: 'More in the forge',
    body: 'New tools land here as they ship.',
    linkLabel: 'Follow along on GitHub',
    href: 'https://github.com/Makogai',
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

  sourceUrl: 'https://github.com/Makogai/mrh.lol',

  seo: {
    title: 'MrHarold — code, games, and a habit of looking up', // EDITABLE
    description: "I'm MrHarold — a programmer who never really stopped being a gamer. I build tools for the games I play, like Prospecting Atlas.", // EDITABLE
    ogImage: { src: '/og.png', width: 1200, height: 630, alt: 'MrHarold — the name as a glowing chip on a circuit board whose traces turn into ore veins.' },
    themeColor: '#06080e',
  },
};
