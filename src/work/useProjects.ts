import { useEffect, useState } from 'react';
import { buildData } from '../data';
import type { Project } from '../data/types';

/**
 * Published projects, featured first (stable, so Supabase `sort` order is kept inside each group).
 * Dev only: `#qa-builds=N` swaps in N fixture projects (1..8) so every bento layout can be eyeballed. Production strips the
 * whole branch (import.meta.env.DEV is a literal false), and the fixture chunk with it. The hash is read in an effect, so
 * hydration is unaffected.
 */
export function useProjects(): Project[] {
  const [qa, setQa] = useState<Project[] | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const apply = () => {
      const m = /qa-builds=(\d+)/.exec(window.location.hash);
      if (!m) return setQa(null);
      void import('./__fixtures__/projects').then((f) => setQa(f.qaProjects.slice(0, Number(m[1]))));
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);
  return order(qa ?? buildData.projects);
}

const order = (list: Project[]) => [...list].sort((a, b) => Number(b.featured) - Number(a.featured));
