import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Reveal } from './Reveal';

export interface SectionProps {
  id: string;                         // in-page target (#about, #work, #contact)
  index: string;                      // '01' — decorative, aria-hidden
  title: string;                      // h2 text
  titleStyle?: 'display' | 'label';   // display = big h2 (default); label = small mono h2 (About)
  intro?: ReactNode;                  // optional paragraph under a display title
  className?: string;                 // extra classes on <section> (e.g. background blooms)
  children: ReactNode;
}

const LABEL = 'font-mono text-xs font-medium uppercase tracking-label';

/**
 * Shared section frame: index + hairline + h2, then content. One h2 per section (h3 inside), linked with
 * aria-labelledby so the region is announced by its title. The section is `relative` so packages can hang
 * background blooms off it; it never clips, so blooms may bleed (the page-level overflow-x: clip catches the rest).
 */
export function Section({ id, index, title, titleStyle = 'display', intro, className, children }: SectionProps) {
  const titleId = `${id}-title`;
  const isLabel = titleStyle === 'label';
  return (
    <section id={id} aria-labelledby={titleId} className={cx('relative section-y', className)}>
      <div className="site-container">
        <Reveal as="header">
          <div className="flex items-center gap-4">
            <span aria-hidden="true" className={cx(LABEL, 'text-ink-400')}>{index}</span>
            <span aria-hidden="true" className="h-px w-12 bg-ink-100/15" />
            {isLabel && <h2 id={titleId} className={cx(LABEL, 'text-ink-300')}>{title}</h2>}
          </div>
          {!isLabel && (
            <h2 id={titleId} className="mt-6 text-display font-[800] [font-stretch:112.5%] tracking-display">{title}</h2>
          )}
          {!isLabel && intro && <p className="mt-6 max-w-[52ch] text-lg text-ink-300 md:text-xl">{intro}</p>}
        </Reveal>
        <div className={isLabel ? 'mt-8' : 'mt-12 xl:mt-16'}>{children}</div>
      </div>
    </section>
  );
}
