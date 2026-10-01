import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ButtonLink } from '../components/Button';
import { site } from '../config/site';
import { HeroCanvas } from './HeroCanvas';
import { ScrollHint } from './ScrollHint';
import type { Measure } from './veins/engine';
import './hero.css';

// Mona Sans Expanded 850 "MrHarold" measures 4.832 em (0.604 em/char); 0.62 leaves ~3 % of safety so the fallback font
// or a rounding error can never push the name past the container. See hero.css for the fit-to-container clamp.
const NAME_EM = site.displayName.length * 0.62;

const PAD_DESKTOP = 24;
const PAD_PHONE = 16;
const HINT_PAD = 12;

export function Hero() {
  const headerRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const identityRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLAnchorElement>(null);

  // The sheen is a second copy of the name, so it must not exist in the prerendered HTML (crawlers, hydration): it is
  // mounted by an effect, i.e. strictly after hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /**
   * The chip = union of the name, identity and CTA rects (relative to the hero), padded. Traces never enter it, so text
   * never sits on canvas pixels — that is what guarantees the contrast numbers in BUILD_PLAN §5.1.
   */
  const measure = useCallback((): Measure => {
    const header = headerRef.current!;
    const hr = header.getBoundingClientRect();
    const els = [titleRef.current, identityRef.current, ctaRef.current];
    let l = Infinity;
    let t = Infinity;
    let r = -Infinity;
    let b = -Infinity;
    for (const el of els) {
      if (!el) continue;
      const q = el.getBoundingClientRect();
      l = Math.min(l, q.left - hr.left);
      t = Math.min(t, q.top - hr.top);
      r = Math.max(r, q.right - hr.left);
      b = Math.max(b, q.bottom - hr.top);
    }
    const pad = hr.width < 768 ? PAD_PHONE : PAD_DESKTOP;
    const avoid: Measure['avoid'] = [];
    if (hintRef.current) {
      const q = hintRef.current.getBoundingClientRect();
      avoid.push({ x: q.left - hr.left - HINT_PAD, y: q.top - hr.top - HINT_PAD, w: q.width + 2 * HINT_PAD, h: q.height + 2 * HINT_PAD });
    }
    return {
      width: hr.width,
      height: hr.height,
      chip: { x: l - pad, y: t - pad, w: r - l + 2 * pad, h: b - t + 2 * pad },
      avoid,
    };
  }, []);

  return (
    <header ref={headerRef} id="top" aria-labelledby="hero-title" className="hero">
      <HeroCanvas heroRef={headerRef} measure={measure} />
      <div className="hero-content site-container">
        <h1 ref={titleRef} id="hero-title" className="hero-title" style={{ '--name-em': NAME_EM } as CSSProperties}>
          {site.displayName}
          {mounted && (
            <span className="hero-sheen" aria-hidden="true">
              {site.displayName}
            </span>
          )}
        </h1>
        <p ref={identityRef} className="hero-identity">
          {site.identity}
        </p>
        <div ref={ctaRef} className="hero-cta">
          <ButtonLink href={site.hero.primaryCta.href} size="lg" magnetic className="max-[30rem]:grow max-[30rem]:px-5! max-[30rem]:text-base!">
            {site.hero.primaryCta.label}
          </ButtonLink>
          <ButtonLink href={site.hero.secondaryCta.href} size="lg" variant="ghost" magnetic className="max-[30rem]:grow max-[30rem]:px-5! max-[30rem]:text-base!">
            {site.hero.secondaryCta.label}
          </ButtonLink>
        </div>
      </div>
      <ScrollHint ref={hintRef} />
    </header>
  );
}
