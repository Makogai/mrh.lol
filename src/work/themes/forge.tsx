import type { ThemeDef } from './types';

/** Tiny deterministic PRNG: SSR and the client must draw the identical trace (no Math.random). */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822519) ^ Math.imul(h ^ (h >>> 13), 3266489917)), ((h >>> 0) % 1000) / 1000);
}

/**
 * A PCB/vein-style trace: orthogonal runs with 45° bends fanning out of the top-right corner (same look as the hero veins,
 * drawn at module cost instead of shipping the generator). Integer coordinates keep the markup byte-stable.
 */
function trace(seed: string): { d: string; pads: [number, number][] } {
  const r = rng(seed);
  let d = '';
  const pads: [number, number][] = [];
  for (let k = 0; k < 6; k++) {
    let x = 300 - Math.round(r() * 40);
    let y = 6 + k * 26 + Math.round(r() * 10);
    d += `M${x} ${y}`;
    for (let s = 0; s < 3 + Math.round(r() * 2); s++) {
      x -= 24 + Math.round(r() * 56);
      d += `H${x}`;
      const dy = (r() > 0.5 ? 1 : -1) * (14 + Math.round(r() * 26));
      x -= Math.abs(dy);
      y += dy;
      d += `L${x} ${y}`;
    }
    pads.push([x, y]);
  }
  return { d, pads };
}

function ForgeArt({ project }: { project: import('../../data/types').Project }) {
  const { d, pads } = trace(project.slug);
  return (
    <div className="art art-forge">
      <div className="forge-ember" />
      <svg className="forge-trace" viewBox="0 0 300 170" preserveAspectRatio="xMaxYMin slice" focusable="false">
        <path d={d} />
        {pads.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3" />)}
      </svg>
      {project.image && (
        // Hairline bezel; the Supabase row guarantees width/height/alt together (gen-data drops partial images).
        <figure className="forge-bezel">
          <img src={project.image.src} width={project.image.width} height={project.image.height} alt={project.image.alt} loading="lazy" decoding="async" />
        </figure>
      )}
    </div>
  );
}

export const forge: ThemeDef = {
  id: 'forge',
  label: 'Forge',
  vars: { accent: '#ffc247', accentInk: '#06080e', surface0: '#0a0d16', surface1: '#10141f', glow: 'rgb(255 194 71 / 0.5)' },
  motif: 'trace',
  Art: ({ project }) => <ForgeArt project={project} />,
  readout: 'plain',
};
