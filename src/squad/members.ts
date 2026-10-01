// The lobby's cast: the owner plus the friends in site.squad.members, joined with what scripts/roblox/squad.mjs built for them
// (src/squad/squad.generated.json). A member whose assets were not built still gets a roster row and a plate, just no poster.
import { site } from '../config/site';
import generated from './squad.generated.json';
import { FRIEND_SLOTS, ME_SLOT } from './layout';

export interface GenImage { w: number; h: number; avif: string; webp: string }
interface GenMember {
  id: string;
  packs: { desktop: string; phone: string };
  /** Avatar height in studs (bounds.max.y): sizes the poster against the 7-stud reference. */
  height: number;
  wave: boolean;
  poster?: { x1: GenImage; x2: GenImage };
  headshot?: { size: number; avif: string; webp: string };
  loadout?: GenImage;
}
const GEN = (generated as unknown as { members: GenMember[] }).members;

export interface Member {
  key: string;
  slot: number;
  name: string;
  role: string | null;
  me: boolean;
  profileUrl: string;
  /** CSS colour for plate, roster dot and poster ring. */
  css: string;
  /** Same colour as sRGB 0..1 for the floor ring. */
  rgb: [number, number, number];
  gen: GenMember | null;
}

/** Friends rotate through these (teal, violet, blue, coral); the owner is amber. A config `accent` wins. */
const ROTATION = ['#3ee0d0', '#a78bfa', '#60a5fa', '#ff8f80'];
const OWNER_ACCENT = '#ffc247';

function hexToRgb(css: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(css);
  if (!m) return [1, 0.76, 0.28];
  const n = parseInt(m[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Public URL of a generated asset (paths in the JSON are relative to public/roblox/). */
export const robloxAsset = (path: string): string => `${import.meta.env.BASE_URL}roblox/${path}`;

export function buildMembers(): Member[] {
  const me: Member = {
    key: 'me', slot: ME_SLOT, name: site.displayName, role: null, me: true, profileUrl: site.roblox.profileUrl,
    css: OWNER_ACCENT, rgb: hexToRgb(OWNER_ACCENT), gen: GEN.find((g) => g.id === 'me') ?? null,
  };
  const friends = site.squad.members.slice(0, FRIEND_SLOTS.length).map((f, i): Member => {
    const css = f.accent ?? ROTATION[i % ROTATION.length];
    return {
      key: String(f.robloxUserId), slot: FRIEND_SLOTS[i], name: f.displayName, role: f.role, me: false,
      profileUrl: `https://www.roblox.com/users/${f.robloxUserId}/profile`, css, rgb: hexToRgb(css), gen: GEN.find((g) => g.id === String(f.robloxUserId)) ?? null,
    };
  });
  return [me, ...friends];
}
