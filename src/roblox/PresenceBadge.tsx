import { cx } from '../lib/cx';
import { site, type PresenceMode } from '../config/site';
import type { Presence } from './presence';
import './player.css'; // .pl-fade / .pl-breathe: PlayerSection used to load this; the Contact tile still needs it until the status package replaces this badge

const TEXT = 'font-mono text-xs tracking-label uppercase';

function Dot({ kind }: { kind: Presence['kind'] }) {
  if (kind === 'offline') return <span aria-hidden="true" className="size-2 shrink-0 rounded-full border-[1.5px] border-ink-400" />;
  const colour = kind === 'studio' ? 'bg-violet-400 shadow-[0_0_8px_var(--color-violet-400)]' : 'bg-teal-400 shadow-[0_0_8px_var(--color-teal-400)]';
  // Breathing is the flagship "Live" dot's idiom; player.css switches it off for reduced motion.
  return <span aria-hidden="true" className={cx('size-2 shrink-0 rounded-full', colour, kind === 'game' && 'pl-breathe')} />;
}

const WORD: Record<Exclude<Presence['kind'], 'unknown'>, { text: string; tone: string }> = {
  online: { text: 'Online', tone: 'text-teal-400' },
  game: { text: 'In game', tone: 'text-teal-400' },
  studio: { text: 'In Studio', tone: 'text-violet-400' },
  offline: { text: 'Offline', tone: 'text-ink-400' },
};

interface Props {
  presence: Presence;
  mode?: PresenceMode;
  /** What to show when there is no real data. `null` (the Contact tile) shows nothing instead. */
  neutral: string | null;
  className?: string;
}

/**
 * The only place presence turns into pixels. Real data or nothing misleading: loading, failure, `off` and any unknown
 * type all land on the neutral label. Fixed h-4 slot, so a state change can never move the layout. No aria-live on
 * purpose: a 60 s refresh must not chatter at screen-reader users.
 */
export function PresenceBadge({ presence, mode = site.roblox.presence, neutral, className }: Props) {
  const { kind } = presence;
  const named = mode === 'game' && kind === 'game' && presence.game;
  return (
    <p className={cx('flex h-4 min-w-0 items-center gap-2 leading-4', TEXT, className)}>
      <span className="sr-only">Roblox status: </span>
      {kind === 'unknown' ? (
        neutral && <span className="pl-fade truncate text-ink-400">{neutral}</span>
      ) : (
        // Keyed so a change remounts the span and replays the short cross-fade.
        <span key={`${kind}|${presence.game ?? ''}`} className="pl-fade flex min-w-0 items-center gap-2">
          <Dot kind={kind} />
          <span className={cx('shrink-0', WORD[kind].tone)}>
            {WORD[kind].text}
            {named ? <span className="text-ink-100"> ·</span> : null}
          </span>
          {named && <span className="max-w-[22ch] truncate normal-case text-ink-100">{presence.game}</span>}
        </span>
      )}
    </p>
  );
}
