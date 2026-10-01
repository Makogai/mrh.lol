export interface Pulse { kind: 'wave' | 'presence'; n: number }

// Pads are zero-length round-capped paths with a non-scaling stroke: the wide SVG is stretched (preserveAspectRatio
// "none") to whatever gap the grid leaves, and a <circle> would turn into an ellipse. Strokes and pads live in player.css.
const WIDE = 'M6 12H70L94 36H206';
const TALL = 'M24 0V40';

/**
 * The card's pedestal "vein" carried onto the page: it leaves the card at pedestal height and runs into the copy's
 * "Plays as" row (sideways from md up, a 48 px drop on phones). Decorative only. The pulse reuses contact.css's
 * `ct-pulse` keyframes; a new `pulse.n` remounts the path, which restarts the animation.
 */
export function PlayerTrace({ pulse }: { pulse: Pulse | null }) {
  const common = { 'aria-hidden': true, focusable: false, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <div aria-hidden="true" className="pl-trace" data-pulse={pulse?.kind}>
      <svg {...common} className="pl-trace-wide" viewBox="0 0 212 48" preserveAspectRatio="none">
        <path className="pl-base" d={WIDE} />
        {pulse && <path key={pulse.n} className="pl-pulse" pathLength={1} d={WIDE} />}
        <path className="pl-pad-ring" d="M6 12h.01M206 36h.01" />
        <path className="pl-pad-fill" d="M6 12h.01M206 36h.01" />
      </svg>
      <svg {...common} className="pl-trace-tall" viewBox="0 0 48 48">
        <path className="pl-base" d={TALL} />
        {pulse && <path key={pulse.n} className="pl-pulse" pathLength={1} d={TALL} />}
        <path className="pl-pad-ring" d="M24 44h.01" />
        <path className="pl-pad-fill" d="M24 44h.01" />
      </svg>
    </div>
  );
}
