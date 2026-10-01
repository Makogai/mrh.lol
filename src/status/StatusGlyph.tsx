import { cx } from '../lib/cx';
import type { GlyphKind } from './types';

// Shape AND colour (never colour alone), always next to a text label — so the glyph itself is aria-hidden.
//   online filled teal dot · idle amber crescent · dnd coral dot with a bar cut out · offline 2px ink-500 ring
//   streaming violet dot · unknown ink-500 ring with a "?"
export function StatusGlyph({ kind, size = 12, className }: { kind: GlyphKind; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" width={size} height={size} aria-hidden="true" focusable="false" className={cx('shrink-0', className)}>
      {kind === 'online' && <circle cx="6" cy="6" r="4.5" fill="var(--color-teal-400)" />}
      {kind === 'streaming' && <circle cx="6" cy="6" r="4.5" fill="var(--color-violet-400)" />}
      {kind === 'idle' && <path d="M8.6 1.6A4.8 4.8 0 1 0 10.4 8 3.8 3.8 0 0 1 8.6 1.6Z" fill="var(--color-amber-400)" />}
      {kind === 'dnd' && (
        <>
          <circle cx="6" cy="6" r="4.5" fill="var(--color-coral-400)" />
          <rect x="3.5" y="5.2" width="5" height="1.6" rx=".8" fill="var(--surface-0)" />
        </>
      )}
      {kind === 'offline' && <circle cx="6" cy="6" r="4" fill="none" stroke="var(--color-ink-500)" strokeWidth="2" />}
      {kind === 'unknown' && (
        <>
          <circle cx="6" cy="6" r="4.6" fill="none" stroke="var(--color-ink-500)" strokeWidth="1.2" />
          <path d="M4.9 4.8a1.2 1.2 0 1 1 1.7 1.1c-.4.2-.6.4-.6.8M6 8.3v.1" fill="none" stroke="var(--color-ink-400)" strokeWidth="1" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
