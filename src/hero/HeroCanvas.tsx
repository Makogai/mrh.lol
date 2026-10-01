import { useEffect, useRef, type RefObject } from 'react';
import type { Engine, Measure } from './veins/engine'; // type-only: the engine itself must stay out of the entry bundle

interface HeroCanvasProps {
  /** The <header>: the engine listens for pointer events on it and observes its size/visibility. */
  heroRef: RefObject<HTMLElement | null>;
  measure: () => Measure;
}

/**
 * SSR renders only the empty wrapper and two canvases, so the prerendered HTML is identical to the hydrated markup.
 * Everything else happens after hydration, once the browser is idle: load the engine as its own chunk, hand it the
 * canvases, and tear it down cleanly (StrictMode mounts effects twice in dev).
 */
export function HeroCanvas({ heroRef, measure }: HeroCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const staticRef = useRef<HTMLCanvasElement>(null);
  const dynamicRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const hero = heroRef.current;
    const staticCanvas = staticRef.current;
    const dynamicCanvas = dynamicRef.current;
    if (!host || !hero || !staticCanvas || !dynamicCanvas) return;
    // No canvas support → the CSS gradient on the hero is the whole effect.
    if (typeof HTMLCanvasElement === 'undefined' || typeof HTMLCanvasElement.prototype.getContext !== 'function') return;

    let cancelled = false;
    let engine: Engine | null = null;
    const off = () => {
      host.removeAttribute('data-ready');
      hero.dataset.fx = 'off';
    };
    const start = () => {
      import('./veins/engine')
        .then(({ createEngine }) => {
          if (cancelled) return;
          try {
            engine = createEngine({
              hero,
              host,
              staticCanvas,
              dynamicCanvas,
              measure,
              onIgnite: () => hero.setAttribute('data-ignite', ''),
              debug: new URLSearchParams(window.location.search).has('fxdebug'),
            });
          } catch {
            off();
          }
        })
        .catch(off);
    };

    // The effect never competes with first paint or LCP: wait for idle (800 ms at most), or 120 ms where rIC is missing.
    const idle = typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(start, { timeout: 800 }) : window.setTimeout(start, 120);
    return () => {
      cancelled = true;
      if (typeof window.requestIdleCallback === 'function') window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      engine?.destroy();
      engine = null;
    };
  }, [heroRef, measure]);

  return (
    <div ref={hostRef} className="hero-fx" aria-hidden="true">
      <canvas ref={staticRef} />
      <canvas ref={dynamicRef} />
    </div>
  );
}
