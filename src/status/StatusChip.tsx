import './status.css';
import { site } from '../config/site';
import { cx } from '../lib/cx';
import { StatusGlyph } from './StatusGlyph';
import { lineFor, useStatus } from './store';
import type { StatusView } from './types';

/**
 * The 32px chip in the system bar. Tapping it goes to the lobby. The system bar only sets its max-width (220px phone /
 * 360px desktop) from outside. `view` overrides the live store (fixtures, screenshots).
 */
export function StatusChip({ className, view }: { className?: string; view?: StatusView }) {
  const live = useStatus();
  const { text, glyph, state } = lineFor(view ?? live);
  return (
    <a
      href={`#${site.sections.squad.id}`}
      data-status={state}
      className={cx(
        'flex h-8 min-w-36 max-w-full items-center gap-2 rounded-full bg-ink-100/[0.04] px-3 font-mono text-[11px] tracking-[0.04em] text-ink-300 no-underline shadow-hairline hover:bg-ink-100/[0.08]',
        state === 'stale' && 'st-stale',
        className,
      )}
    >
      <StatusGlyph kind={glyph} className={state === 'loading' ? 'st-breathe' : undefined} />
      <span key={text} className="st-fade truncate">{text}</span>
    </a>
  );
}
