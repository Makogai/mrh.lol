import type { CSSProperties } from 'react';
import { useReveal } from '../components/Reveal';
import { site } from '../config/site';
import { buildData } from '../data';
import { fillTemplate, formatNumber } from '../lib/format';

/**
 * The six numbers. Hairline grid = 1 px gaps over an ink-100/8 background with iron-900 tiles; 2 / 3 / 6 columns, so
 * 6 tiles always fill complete rows (no gap showing the hairline colour). No count-up: the strip reveals as one frame
 * and the figures fade in on the stagger (see sections.css for why the tiles themselves aren't staggered).
 */
export function StatStrip() {
  const stats = buildData.atlas.stats;
  const ref = useReveal<HTMLUListElement>();
  return (
    <ul
      ref={ref}
      data-reveal=""
      className="sec-stats grid grid-cols-2 gap-px overflow-clip rounded-pad bg-ink-100/8 p-px md:grid-cols-3 xl:grid-cols-6"
    >
      {site.flagship.stats.map((tile, i) => (
        <li key={tile.key} className="sec-stat flex flex-col gap-3 bg-iron-900 p-4 md:p-6" style={{ '--i': Math.min(i, 6) } as CSSProperties}>
          <span className="font-mono text-[2rem] leading-none font-medium text-amber-400 tabular-nums xl:text-5xl">
            {formatNumber(stats[tile.key])}
          </span>
          <span className="text-sm text-ink-300">{fillTemplate(tile.label, stats)}</span>
        </li>
      ))}
    </ul>
  );
}
