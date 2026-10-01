import { useEffect, useState } from 'react';

/**
 * Returns `initial` on the server AND on the first client render, then the real answer after mount. That keeps the
 * hydrated markup identical to the prerendered markup (BUILD_PLAN §2 rule 7); a change after hydration is just a
 * normal state update.
 */
export function useMediaQuery(query: string, initial = false): boolean {
  const [matches, setMatches] = useState(initial);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);
  return matches;
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/** Imperative, client-only — for effects and the canvas engine, never for render. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
