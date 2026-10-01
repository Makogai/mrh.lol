import { useCallback, useEffect, useRef, useState, type CSSProperties, type FocusEvent as ReactFocusEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { site } from '../config/site';
import { PlayerChip, useLiveGame } from '../status';
import { HeroCanvas } from './HeroCanvas';
import { ScrollHint } from './ScrollHint';
import { GAME_TINT } from './tint';
import type { Engine, Measure } from './veins/engine';
import './hero.css';

// Mona Sans Expanded 850 "MrHarold" measures 4.832 em (0.604 em/char); 0.62 leaves ~3 % of safety so the fallback font
// or a rounding error can never push the name past the container. See hero.css for the fit-to-container clamp.
const NAME_EM = site.displayName.length * 0.62;

const PAD_DESKTOP = 24;
const PAD_PHONE = 16;
const HINT_PAD = 12;

function Chevron() {
  // An SVG, not a "›": the subset fonts have no such glyph and a fallback face would shift per platform.
  return (
    <svg className="hm-chev" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** 00 MAIN MENU: the h1, the tagline, four menu rows and the SIGNED IN AS chip over the vein field. */
export function Hero() {
  const headerRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const identityRef = useRef<HTMLParagraphElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLAnchorElement>(null);
  const engineRef = useRef<Engine | null>(null);

  // The sheen is a second copy of the name, so it must not exist in the prerendered HTML (crawlers, hydration): it is
  // mounted by an effect, i.e. strictly after hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const game = useLiveGame();
  const tint = game ? GAME_TINT[game] : null;

  /**
   * The keep-out chip = union of the name, tagline and menu rects (relative to the hero), padded. Traces never enter it, so
   * text never sits on canvas pixels — that is what guarantees the contrast numbers in BUILD_PLAN §5.1. On phones the player
   * chip is part of the flow and joins the union; on desktop it floats bottom-right and is a separate keep-out.
   */
  const measure = useCallback((): Measure => {
    const header = headerRef.current!;
    const hr = header.getBoundingClientRect();
    const pad = hr.width < 768 ? PAD_PHONE : PAD_DESKTOP;
    const chipEl = chipRef.current;
    const floating = chipEl ? getComputedStyle(chipEl).position === 'absolute' : false;
    const els = [titleRef.current, identityRef.current, menuRef.current, floating ? null : chipEl];
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
    const avoid: Measure['avoid'] = [];
    const keepOut = (el: HTMLElement | null, p: number) => {
      if (!el) return;
      const q = el.getBoundingClientRect();
      if (q.width === 0 || q.height === 0) return; // display: none at this width (scroll hint on phones)
      avoid.push({ x: q.left - hr.left - p, y: q.top - hr.top - p, w: q.width + 2 * p, h: q.height + 2 * p });
    };
    keepOut(hintRef.current, HINT_PAD);
    if (floating) keepOut(chipEl, pad);
    return {
      width: hr.width,
      height: hr.height,
      chip: { x: l - pad, y: t - pad, w: r - l + 2 * pad, h: b - t + 2 * pad },
      avoid,
    };
  }, []);

  /** The vein network lights toward the row: a pulse from the row's right edge, mid-height, in hero coordinates. */
  const pulseRow = (row: HTMLElement) => {
    const engine = engineRef.current;
    const header = headerRef.current;
    if (!engine || !header) return;
    const q = row.getBoundingClientRect();
    const hr = header.getBoundingClientRect();
    engine.pulseAt(q.right - hr.left, q.top + q.height / 2 - hr.top);
  };
  // Mouse hover and keyboard focus pulse; touch pulses on press (a touch also fires pointerenter just before pointerdown).
  const onEnter = (e: ReactPointerEvent<HTMLAnchorElement>) => {
    if (e.pointerType !== 'touch') pulseRow(e.currentTarget);
  };
  const onFocus = (e: ReactFocusEvent<HTMLAnchorElement>) => {
    if (e.currentTarget.matches(':focus-visible')) pulseRow(e.currentTarget);
  };
  const onPress = (e: ReactPointerEvent<HTMLAnchorElement>) => {
    if (e.pointerType === 'touch') pulseRow(e.currentTarget);
  };

  return (
    <header ref={headerRef} id="top" aria-labelledby="hero-title" className="hero">
      <HeroCanvas heroRef={headerRef} measure={measure} engineRef={engineRef} tint={tint} />
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
        <nav ref={menuRef} aria-label="Main menu" className="hero-menu">
          <ul>
            {site.hero.menu.map((key, i) => {
              const s = site.sections[key];
              return (
                <li key={key} style={{ '--i': i } as CSSProperties}>
                  <a
                    href={`#${s.id}`}
                    className="hm-row"
                    data-primary={i === 0 ? '' : undefined}
                    onPointerEnter={onEnter}
                    onPointerDown={onPress}
                    onFocus={onFocus}
                  >
                    <span className="hm-idx" aria-hidden="true">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="hm-label">{s.title}</span>
                    <Chevron />
                    <span className="hm-line" aria-hidden="true" />
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <div ref={chipRef} className="hero-chip" style={{ '--i': site.hero.menu.length } as CSSProperties}>
          <PlayerChip />
        </div>
      </div>
      <ScrollHint ref={hintRef} />
    </header>
  );
}
