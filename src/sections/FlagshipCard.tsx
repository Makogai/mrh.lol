import { ButtonLink } from '../components/Button';
import { Reveal } from '../components/Reveal';
import { site } from '../config/site';
import { buildData } from '../data';
import { fillTemplate, formatDayUTC } from '../lib/format';
import { StatStrip } from './StatStrip';

const SHOT_SIZES = '(min-width:1280px) 760px, (min-width:768px) 90vw, 100vw';

function shotSrcSet(ext: 'avif' | 'webp'): string {
  const { widths, pattern } = site.flagship.screenshot;
  return widths.map((w) => `${pattern.replace('{w}', String(w)).replace('{ext}', ext)} ${w}w`).join(', ');
}

/** "https://prospecting.mrh.lol" → "prospecting.mrh.lol" (config is the single source; nothing hard-coded here). */
const flagshipHost = new URL(site.flagship.url).host;

/**
 * Prospecting Atlas feature card (BUILD_PLAN §8.3). One CSS grid, two layouts: stacked (kicker, title, summary,
 * screenshot, highlights, CTA) up to xl, then copy in cols 1–5 and the screenshot in cols 6–12 with the stats below.
 */
export function FlagshipCard() {
  const f = site.flagship;
  const shot = f.screenshot;
  const { atlas } = buildData;

  return (
    <Reveal
      as="article"
      aria-labelledby="flagship-title"
      className="sec-flagship overflow-clip rounded-card bg-iron-900 p-6 shadow-hairline md:p-10 xl:p-14"
    >
      <div className="grid gap-y-8 xl:grid-cols-12 xl:grid-rows-[auto_1fr] xl:gap-x-8">
        <div className="xl:col-span-5 xl:col-start-1 xl:row-start-1">
          <p className="flex items-center gap-3 font-mono text-xs font-medium tracking-label uppercase">
            <span className="text-amber-400">{f.kicker}</span>
            <span aria-hidden="true" className="h-3 w-px bg-ink-100/15" />
            <span className="flex items-center gap-2 text-teal-400">
              <span aria-hidden="true" className="sec-dot sec-dot-live" />
              Live
            </span>
          </p>
          <h3 id="flagship-title" className="mt-6 text-title font-[800] [font-stretch:112.5%] tracking-display">
            {f.title}
          </h3>
          <p className="mt-6 max-w-[52ch] text-lg text-ink-300">{f.summary}</p>
        </div>

        <figure className="sec-shot xl:col-span-7 xl:col-start-6 xl:row-span-2 xl:row-start-1 xl:self-center">
          <picture>
            <source type="image/avif" srcSet={shotSrcSet('avif')} sizes={SHOT_SIZES} />
            <source type="image/webp" srcSet={shotSrcSet('webp')} sizes={SHOT_SIZES} />
            <img src={shot.fallback} width={shot.width} height={shot.height} alt={shot.alt} loading="lazy" decoding="async" />
          </picture>
        </figure>

        <div className="xl:col-span-5 xl:col-start-1 xl:row-start-2 xl:self-end">
          <ul className="flex flex-col gap-3">
            {f.highlights.map((h) => (
              <li key={h} className="flex items-baseline gap-4 text-base text-ink-300">
                {/* An SMD pad: a small amber square, aligned to the first line's x-height. */}
                <span aria-hidden="true" className="h-2 w-2 shrink-0 translate-y-px rounded-[2px] bg-amber-400" />
                <span>{fillTemplate(h, atlas.stats)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <ButtonLink href={f.url} external size="lg">
              {f.cta}
            </ButtonLink>
          </div>
        </div>
      </div>

      <div className="mt-10 xl:mt-14">
        <StatStrip />
        <p className="mt-6 flex items-center gap-2 font-mono text-xs text-ink-400">
          {atlas.isLive && <span aria-hidden="true" className="sec-dot" />}
          <span>
            {atlas.isLive ? `Live from ${flagshipHost} · synced ${formatDayUTC(atlas.syncedOn)}` : `Snapshot · ${formatDayUTC(atlas.syncedOn)}`}
          </span>
        </p>
      </div>
    </Reveal>
  );
}
