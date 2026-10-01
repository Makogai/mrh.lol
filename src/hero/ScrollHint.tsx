import type { Ref } from 'react';
import { site } from '../config/site';

/**
 * Quiet scroll cue. The amber segment drifts by animating `background-position` inside a fixed 1×48 px track — the box
 * itself never moves, so nothing can widen the document (trap #2).
 */
export function ScrollHint({ ref }: { ref?: Ref<HTMLAnchorElement> }) {
  return (
    <a ref={ref} href={`#${site.sections.about.id}`} className="hero-hint" aria-label={`Scroll to ${site.sections.about.title}`}>
      <span className="hero-hint-label">{site.hero.scrollHint}</span>
      <span className="hero-hint-track" aria-hidden="true" />
    </a>
  );
}
