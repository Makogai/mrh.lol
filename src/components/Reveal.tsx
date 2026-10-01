import { createElement, useCallback, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

let io: IntersectionObserver | null = null;
const pending = new Set<Element>();

function reveal(el: Element) {
  (el as HTMLElement).dataset.revealed = '';
  pending.delete(el);
  io?.unobserve(el);
}

function observer(): IntersectionObserver | null {
  if (io || typeof IntersectionObserver === 'undefined') return io;
  document.documentElement.classList.add('reveal-ready'); // disables the CSS failsafe in global.css
  io = new IntersectionObserver(
    (entries) => { for (const e of entries) if (e.isIntersecting) reveal(e.target); },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  // Trap #4: IO callbacks are suspended while the tab is hidden — re-check by hand when it comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    for (const el of [...pending]) {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) reveal(el);
    }
  });
  return io;
}

/** Ref callback: reveals the element once when it scrolls into view. Never re-hides. */
export function useReveal<T extends Element>() {
  return useCallback((el: T | null) => {
    if (!el) return;
    const obs = observer();
    if (!obs) { reveal(el); return; }
    pending.add(el);
    obs.observe(el);
    return () => { pending.delete(el); obs.unobserve(el); };
  }, []);
}

type RevealTag = 'div' | 'li' | 'article' | 'section' | 'header' | 'figure' | 'p' | 'span';
export interface RevealProps extends HTMLAttributes<HTMLElement> { as?: RevealTag; index?: number; children?: ReactNode }

/** <Reveal index={i}> staggers by --stagger × min(i, 6). */
export function Reveal({ as = 'div', index = 0, style, ...rest }: RevealProps) {
  const ref = useReveal<HTMLElement>();
  return createElement(as, { ...rest, ref, 'data-reveal': '', style: { ...style, '--reveal-i': Math.min(index, 6) } as CSSProperties });
}
