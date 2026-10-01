import './status.css';
import { site } from '../config/site';
import { buildData } from '../data';
import { cx } from '../lib/cx';
import { StatusGlyph } from './StatusGlyph';
import { lineFor, useStatus } from './store';
import type { StatusView } from './types';

/**
 * The hero's SIGNED IN AS chip: headshot with the status glyph on its ring, name, status line and the build stamp. It draws
 * its own `.slot` frame; the hero only positions it. Fixed height (CLS 0). `view` overrides the live store (fixtures).
 */
export function PlayerChip({ className, view }: { className?: string; view?: StatusView }) {
  const live = useStatus();
  const { text, glyph, state } = lineFor(view ?? live);
  const headshot = site.roblox.headshot;
  return (
    <div data-static data-status={state} className={cx('slot flex min-h-16 items-center gap-3 px-3 py-2 lg:w-80', className)}>
      <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-iron-800 shadow-hairline-strong">
        {headshot ? (
          <img src={headshot} width={40} height={40} alt="" className="size-10 rounded-full" />
        ) : (
          <span aria-hidden="true" className="ui-label text-sm text-ink-100">
            M
          </span>
        )}
        <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-iron-900">
          <StatusGlyph kind={glyph} size={12} className={state === 'loading' ? 'st-breathe' : undefined} />
        </span>
      </span>
      <span className={cx('flex min-w-0 flex-1 flex-col', state === 'stale' && 'st-stale')}>
        <span className="whitespace-nowrap font-mono text-[10px] uppercase leading-3 tracking-label text-ink-400">Signed in as</span>
        <span className="truncate text-base font-semibold leading-5 text-ink-100">{site.displayName}</span>
        <span key={text} className="st-fade truncate font-mono text-xs leading-4 text-ink-400">{text}</span>
      </span>
      <span className="shrink-0 self-end font-mono text-[10px] leading-3 text-ink-400 lg:hidden">v2 · build {buildData.buildStamp}</span>
    </div>
  );
}
