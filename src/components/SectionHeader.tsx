import type { ReactNode } from 'react';
import { Reveal } from './Reveal';

export interface SectionHeaderProps {
  /** Id of the h2; the <section> points at it with aria-labelledby. */
  titleId: string;
  /** '02' — decorative. */
  index: string;
  /** Mono kicker tag after the hairline, e.g. 'ITEM LIST'. */
  kicker: string;
  /** The h2: the lexicon word ('Builds'). Uppercased in CSS, so the DOM keeps normal case. */
  title: string;
  /** sr-only plain-English subtitle that follows the title ("What I've built"). */
  subtitle?: string;
  /** Right side of the kicker. Real data only (`2 SHIPPED · 1 IN THE FORGE`, `3/5 READY`) — omit it rather than invent one. */
  readout?: ReactNode;
  /** Optional visible paragraph under the title (Comms uses it). */
  intro?: ReactNode;
}

/**
 * Shared section header (V2_DESIGN §1): `NN ─── KICKER   readout`, the wide title, an sr-only subtitle. The whole header
 * is one <Reveal>, which is what grows the hairline from 0 to 48 px (frame.css).
 */
export function SectionHeader({ titleId, index, kicker, title, subtitle, readout, intro }: SectionHeaderProps) {
  return (
    <Reveal as="header">
      <div className="sh-kicker">
        <span aria-hidden="true">{index}</span>
        <span aria-hidden="true" className="sh-rule" />
        <span className="sh-label">{kicker}</span>
        {readout != null && readout !== '' && <span className="sh-readout">{readout}</span>}
      </div>
      <h2 id={titleId} className="sh-title">
        {title}
      </h2>
      {subtitle && <p className="sr-only">{subtitle}</p>}
      {intro && <p className="sh-intro">{intro}</p>}
    </Reveal>
  );
}
