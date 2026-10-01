import { SLOT_COUNT } from './layout';
import { robloxAsset, type Member } from './members';
import { OpenRow, ProfileLink } from './Slots';

/** The accessible source of truth for the lobby: up to five rows (owner first), each a 40px build-time headshot, name, role and profile link. */
export function Roster({ members, className }: { members: Member[]; className?: string }) {
  const open = Math.max(0, SLOT_COUNT - members.length);
  return (
    <ul className={className} aria-label="Party roster">
      {members.map((m) => (
        <li key={m.key} className="lb-row slot" data-static="" style={{ '--accent': m.css } as React.CSSProperties}>
          <span className="lb-row-shot">
            {m.gen?.headshot ? (
              <picture>
                <source type="image/avif" srcSet={robloxAsset(m.gen.headshot.avif)} />
                <img src={robloxAsset(m.gen.headshot.webp)} width={40} height={40} alt="" loading="lazy" decoding="async" />
              </picture>
            ) : (
              <span aria-hidden="true" className="lb-row-mono">{m.name.slice(0, 1)}</span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="lb-row-name">{m.name}</span>
            {m.role && <span className="lb-row-role">{m.role}</span>}
          </span>
          <ProfileLink member={m} className="lb-row-link" />
        </li>
      ))}
      {Array.from({ length: open }, (_, i) => <OpenRow key={i} />)}
    </ul>
  );
}
