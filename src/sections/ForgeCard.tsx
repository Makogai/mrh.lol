import { Reveal } from '../components/Reveal';
import { TextLink } from '../components/TextLink';
import { site } from '../config/site';
import { cx } from '../lib/cx';

/**
 * Hand-authored art, ~1 KB: three parallel PCB traces leave the left edge, take one miter-correct 45° bend (lower lanes
 * bend 6.6 units earlier so the bus stays evenly spaced through the turn), and end in pads — except the lowest, which
 * cools into an organic vein ending in a teal nodule. The hero's whole idea (copper → ore) in miniature.
 */
function ForgeArt() {
  return (
    <svg viewBox="0 0 320 160" className="h-auto w-full" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="sec-vein-grad" x1="150" y1="0" x2="306" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--color-iron-600)" />
          <stop offset="1" stopColor="var(--color-teal-400)" stopOpacity="0.75" />
        </linearGradient>
      </defs>
      <path className="sec-forge-trace" d="M0 40H80L120 80H236" />
      <path className="sec-forge-trace" d="M0 56H73.4L113.4 96H236" />
      <path className="sec-forge-trace" d="M0 72H66.8L106.8 112H150" />
      <path className="sec-forge-vein" stroke="url(#sec-vein-grad)" d="M150 112C184 112 196 134 232 132S292 126 306 98" />
      <circle className="sec-forge-pad" cx="240" cy="80" r="5" />
      <circle className="sec-forge-core" cx="240" cy="80" r="1.5" />
      <circle className="sec-forge-pad" cx="240" cy="96" r="5" />
      <circle className="sec-forge-core" cx="240" cy="96" r="1.5" />
      <circle className="sec-forge-nodule" cx="306" cy="98" r="3.5" />
      <circle className="sec-forge-nodule" cx="262" cy="130" r="2" fillOpacity="0.4" />
    </svg>
  );
}

/**
 * "More in the forge" — the intentional placeholder (and the filler that keeps an odd project count from leaving a hole).
 * With no projects it spans both columns and goes horizontal: copy left, art right.
 */
export function ForgeCard({ index, wide }: { index: number; wide: boolean }) {
  const c = site.forgeCard;
  return (
    <Reveal as="li" index={index} className={cx(wide && 'md:col-span-2')}>
      <div
        className={cx(
          'sec-card flex h-full flex-col justify-between gap-8 rounded-card p-6 md:p-8',
          wide && 'md:flex-row md:items-center md:gap-12 xl:p-10',
        )}
      >
        <div className="max-w-[44ch]">
          <h3 className="text-2xl font-bold [font-stretch:112.5%] tracking-snug">{c.title}</h3>
          <p className="mt-3 text-base text-ink-300">{c.body}</p>
          <p className="mt-6">
            <TextLink href={c.href} external className="inline-flex min-h-12 items-center">
              {c.linkLabel}
            </TextLink>
          </p>
        </div>
        <div className={cx('w-full max-w-80 self-end', wide && 'md:max-w-96 md:self-center')}>
          <ForgeArt />
        </div>
      </div>
    </Reveal>
  );
}
