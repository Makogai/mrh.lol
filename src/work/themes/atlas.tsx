import { site } from '../../config/site';
import { buildData } from '../../data';
import type { ThemeDef } from './types';

// "Lantern cavern": three rock strata and 18 faceted ores in a dark umber field. A lantern (mask under the pointer,
// a slow drift on touch) reveals a full-saturation copy of the ore layer. Pure CSS + inline SVG (SSR-painted).

const ORE = ['#3ee0d0', '#ffc247', '#a78bfa', '#ff8f80'];

function rng(seed: number) {
  let s = seed;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 4294967296);
}

// Built once at module load. Integer maths only so the server and the client print identical attributes.
const ores = (() => {
  const r = rng(7);
  return Array.from({ length: 18 }, (_, i) => {
    const cx = 20 + Math.round(r() * 560);
    const cy = 110 + Math.round(r() * 170);
    const rad = 7 + Math.round(r() * 12);
    const pts = Array.from({ length: 5 }, (_, k) => {
      const a = (k / 5) * Math.PI * 2 + r();
      const rr = rad * (0.65 + r() * 0.5);
      return `${cx + Math.round(Math.cos(a) * rr)},${cy + Math.round(Math.sin(a) * rr)}`;
    }).join(' ');
    return { pts, fill: ORE[i % 4], i };
  });
})();

function Ores({ bright }: { bright?: boolean }) {
  return (
    <svg className={bright ? 'atlas-ores atlas-ores-lit' : 'atlas-ores'} viewBox="0 0 600 300" preserveAspectRatio="xMidYMid slice" focusable="false">
      {ores.map((o) => <polygon key={o.i} points={o.pts} fill={o.fill} />)}
    </svg>
  );
}

const SHOT_SIZES = '576px'; // only ever shown (and fetched) at 1440-class widths

function Shot({ alt }: { alt: string }) {
  const s = site.atlas.screenshot;
  const set = (ext: string) => s.widths.map((w) => `${s.pattern.replace('{w}', String(w)).replace('{ext}', ext)} ${w}w`).join(', ');
  return (
    // display:none below 64rem (themes.css) → the lazy <img> never requests there. Field-journal inset: tilted.
    <figure className="atlas-shot">
      <picture>
        <source type="image/avif" srcSet={set('avif')} sizes={SHOT_SIZES} />
        <source type="image/webp" srcSet={set('webp')} sizes={SHOT_SIZES} />
        <img src={s.fallback} width={s.width} height={s.height} alt={alt} loading="lazy" decoding="async" />
      </picture>
    </figure>
  );
}

export const atlas: ThemeDef = {
  id: 'atlas',
  label: 'Lantern cavern',
  vars: { accent: '#ffc247', accentInk: '#06080e', surface0: '#0c0a07', surface1: '#1b140b', glow: 'rgb(255 194 71 / 0.5)' },
  motif: 'strata',
  readout: 'ore',
  Art: ({ project }) => (
    <div className="art art-atlas">
      <svg className="atlas-strata" viewBox="0 0 600 300" preserveAspectRatio="xMidYMid slice" focusable="false">
        <path d="M0 120C90 96 170 140 270 118S470 92 600 124V300H0Z" fill="#17110a" />
        <path d="M0 176C110 150 190 196 300 170S480 150 600 182V300H0Z" fill="#20170d" />
        <path d="M0 236C100 214 210 250 320 228S500 210 600 240V300H0Z" fill="#2a1d10" />
        <path d="M0 120C90 96 170 140 270 118S470 92 600 124M0 176C110 150 190 196 300 170S480 150 600 182M0 236C100 214 210 250 320 228S500 210 600 240" fill="none" stroke="rgb(255 194 71 / .12)" />
      </svg>
      <Ores />
      {/* The lit copy sits under the same mask as the glow, so ores glint only inside the lantern. */}
      <div className="atlas-lit"><Ores bright /><span className="atlas-glow" /></div>
      {project.featured && <Shot alt={project.image?.alt ?? site.atlas.screenshot.alt} />}
    </div>
  ),
};

/** Ore-tally readouts from live build stats (config fallback when the build-time fetch failed). */
export function atlasReadouts() {
  const s = buildData.atlas.stats;
  return [
    { value: String(s.minerals), label: 'Minerals' },
    { value: String(s.digSites), label: 'Dig sites' },
    { value: String(s.pages), label: 'Pages' },
  ];
}
