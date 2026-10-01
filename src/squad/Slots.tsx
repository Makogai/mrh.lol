import type { CSSProperties } from 'react';
import { IconArrowUpRight } from '../components/icons';
import { site } from '../config/site';
import { REF_HEIGHT, SLOT_BOXES } from './layout';
import { robloxAsset, type Member } from './members';

// Slot positions are CSS custom properties for BOTH layouts (--v-* phone, --w-* from 48rem), picked in squad.css: the server cannot
// know the viewport, and this way the prerendered poster line-up is already in the right place at every width (CLS 0).
const pct = (n: number) => `${n.toFixed(2)}%`;
export function slotVars(slot: number): CSSProperties {
  const v = SLOT_BOXES.v[slot], w = SLOT_BOXES.line[slot];
  return {
    '--v-l': pct(v.box.left), '--v-t': pct(v.box.top), '--v-w': pct(v.box.width), '--v-h': pct(v.box.height),
    '--w-l': pct(w.box.left), '--w-t': pct(w.box.top), '--w-w': pct(w.box.width), '--w-h': pct(w.box.height),
  } as CSSProperties;
}

/** The 2D poster: first-class state (SSR paints it, reduced motion / no WebGL / save-data keep it). Decorative: the roster is the text source. */
export function Poster({ member }: { member: Member }) {
  const p = member.gen?.poster;
  if (!p) return null;
  return (
    <picture className="lb-poster" style={{ '--k': (member.gen!.height / REF_HEIGHT).toFixed(4) } as CSSProperties}>
      <source type="image/avif" srcSet={`${robloxAsset(p.x1.avif)} 1x, ${robloxAsset(p.x2.avif)} 2x`} />
      <source type="image/webp" srcSet={`${robloxAsset(p.x1.webp)} 1x, ${robloxAsset(p.x2.webp)} 2x`} />
      <img src={robloxAsset(p.x1.webp)} width={p.x1.w} height={p.x1.h} alt="" loading="lazy" decoding="async" draggable={false} />
    </picture>
  );
}

/** Open slot: a DOM silhouette (no GL mannequin), a dashed floor ring and a non-interactive OPEN SLOT plate. */
export function OpenSlot({ slot }: { slot: number }) {
  return (
    <div className="lb-slot is-open" data-slot={slot} style={slotVars(slot)} aria-hidden="true">
      <svg className="lb-sil" viewBox="0 0 60 130" preserveAspectRatio="xMidYMax meet" focusable="false">
        <circle cx="30" cy="14" r="11" />
        <path d="M13 36c0-5 4-8 9-8h16c5 0 9 3 9 8l2 40c0 3-2 5-5 5h-3l-1 44c0 2-2 4-4 4h-2c-2 0-3-1-3-3V92h-2v30c0 2-1 3-3 3h-2c-2 0-4-2-4-4l-1-44h-3c-3 0-5-2-5-5z" />
      </svg>
      <span className="lb-ring" />
      <span className="lb-plate is-open">{site.squad.copy.openSlot}</span>
    </div>
  );
}

/** Roster row for a seat nobody has taken: same height as a member row so the list never jumps. */
export function OpenRow() {
  return (
    <li aria-hidden="true" className="lb-row is-open">
      <span className="lb-row-dot" />
      <span className="font-mono text-[11px] uppercase tracking-label">{site.squad.copy.openSlot}</span>
    </li>
  );
}

export function ProfileLink({ member, className }: { member: Member; className?: string }) {
  return (
    <a href={member.profileUrl} target="_blank" rel="noopener noreferrer" className={className} aria-label={`${member.name} on Roblox (opens in a new tab)`}>
      <IconArrowUpRight size={16} />
    </a>
  );
}

