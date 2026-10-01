import { type ImageSet, type AvatarConfig, site } from '../config/site';
import { cx } from '../lib/cx';

// Geometry is computed once at module load and rounded, so the server and the client print byte-identical attributes
// (Math.sin/cos last digits are not guaranteed identical across engines; rounding to 2 dp makes them so).
const r2 = (n: number) => Math.round(n * 100) / 100;
const TICKS = Array.from({ length: 72 }, (_, i) => {
  const a = (i * 5 * Math.PI) / 180;
  const long = i % 6 === 0;
  const outer = 96;
  const inner = outer - (long ? 8 : 4);
  return { i, long, x1: r2(100 + outer * Math.sin(a)), y1: r2(100 - outer * Math.cos(a)), x2: r2(100 + inner * Math.sin(a)), y2: r2(100 - inner * Math.cos(a)) };
});

/** Aviation nod: a heading-indicator ring. 72 ticks every 5°, every 6th (30°) longer, amber heading bug at 12 o'clock. */
function Ring() {
  return (
    <svg className="sec-bezel-ring" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <circle cx="100" cy="100" r="99.5" fill="none" stroke="var(--color-ink-100)" strokeOpacity="0.1" />
      <circle cx="100" cy="100" r="83" fill="none" stroke="var(--color-ink-100)" strokeOpacity="0.06" />
      {/* The bug takes the place of tick 0, so skip it. */}
      {TICKS.filter((t) => t.i !== 0).map((t) => (
        <line key={t.i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="var(--color-ink-500)" strokeWidth={t.long ? 1.5 : 1} strokeLinecap="round" />
      ))}
      <path className="sec-bezel-bug" d="M100 15 L95 3.5 H105 Z" fill="var(--color-amber-400)" strokeLinejoin="round" />
    </svg>
  );
}

/** "MrHarold" → "MH": the capitals of the display name, falling back to its first two letters. */
function monogram(name: string): string {
  const caps = name.match(/\p{Lu}/gu) ?? [];
  const letters = caps.length >= 2 ? caps.slice(0, 3) : [...name.replace(/\s+/g, '')].slice(0, 2);
  return letters.join('').toUpperCase();
}

// Size ladder follows the layout: at md the bezel lives in two of six columns (≈ 218 px), so it is 216 there, not 240.
const SIZES = '(min-width:1920px) 400px, (min-width:1280px) 320px, (min-width:1024px) 240px, (min-width:768px) 216px, 176px';

function srcSet(a: AvatarConfig, key: keyof ImageSet): string {
  const one = `${a.src[key]} ${a.width}w`;
  return a.src2x ? `${one}, ${a.src2x[key]} ${a.width * 2}w` : one;
}

export function Bezel({ avatar, className }: { avatar: AvatarConfig | null; className?: string }) {
  return (
    <div className={cx('sec-bezel w-44 md:w-54 lg:w-60 xl:w-80 3xl:w-100', className)}>
      <Ring />
      {avatar ? (
        <div className="sec-bezel-face">
          <picture>
            {/* A <source> without a URL is skipped (dev fixtures use that); real configs always have all three. */}
            {avatar.src.avif && <source type="image/avif" srcSet={srcSet(avatar, 'avif')} sizes={SIZES} />}
            {avatar.src.webp && <source type="image/webp" srcSet={srcSet(avatar, 'webp')} sizes={SIZES} />}
            <img
              src={avatar.src.png}
              srcSet={srcSet(avatar, 'png')}
              sizes={SIZES}
              width={avatar.width}
              height={avatar.height}
              alt={avatar.alt}
              loading="lazy"
              decoding="async"
            />
          </picture>
        </div>
      ) : (
        <div className="sec-bezel-face sec-monogram-face" aria-hidden="true">
          <p className="sec-monogram">{monogram(site.displayName)}</p>
        </div>
      )}
    </div>
  );
}
