import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { SectionHeader } from './SectionHeader';

export interface SectionProps {
  id: string;                         // in-page target (#about, #work, #squad, #contact)
  index: string;                      // '01' — decorative, aria-hidden
  title: string;                      // h2 text (the lexicon word)
  kicker?: string;                    // mono tag after the hairline; defaults to the title
  subtitle?: string;                  // sr-only plain-English subtitle
  readout?: ReactNode;                // right side of the kicker — real data only
  intro?: ReactNode;                  // optional visible paragraph under the title
  className?: string;                 // extra classes on <section> (e.g. background blooms)
  attrs?: Record<`data-${string}`, string | undefined>; // data attributes on <section>, e.g. { 'data-pillar': 'programming' }
  children: ReactNode;
}

/**
 * Shared section frame: SectionHeader, then content. One h2 per section (h3 inside), linked with aria-labelledby so the
 * region is announced by its title. The section is `relative` so packages can hang background blooms off it; it never
 * clips, so blooms may bleed (the page-level overflow-x: clip catches the rest).
 *
 * `attrs` puts data attributes on the <section> itself (the Loadout sets data-pillar there so the whole section re-skins).
 */
export function Section({ id, index, title, kicker, subtitle, readout, intro, className, attrs, children }: SectionProps) {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className={cx('relative section-y', className)} {...attrs}>
      <div className="site-container">
        <SectionHeader titleId={titleId} index={index} kicker={kicker ?? title.toUpperCase()} title={title} subtitle={subtitle} readout={readout} intro={intro} />
        <div className="mt-12 xl:mt-16">{children}</div>
      </div>
    </section>
  );
}
