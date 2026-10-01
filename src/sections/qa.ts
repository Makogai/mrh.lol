// Dev-only QA hooks (BUILD_PLAN §13.4). Dev has no SSR and the hash is read in an effect, so hydration is unaffected.
// Everything interesting sits behind `import.meta.env.DEV`, which Vite replaces with `false` in production builds; the
// dynamic imports of the fixtures are then unreachable and are dropped from the bundle.
//   #qa-projects=0|1|2|3   → Work renders that many fixture projects
//   #qa-avatar             → About renders a mocked avatar (inline SVG);  #qa-avatar=real → the generated renditions
import { useEffect, useState } from 'react';
import { site, type AvatarConfig } from '../config/site';
import { buildData } from '../data';
import type { Project } from '../data/types';

export function useProjects(): Project[] {
  const [qa, setQa] = useState<Project[] | null>(null);
  useEffect(() => {
    if (import.meta.env.DEV) {
      const apply = () => {
        const m = /qa-projects=(\d+)/.exec(window.location.hash);
        if (!m) { setQa(null); return; }
        const count = Number(m[1]);
        void import('./__fixtures__/projects').then((f) => setQa(f.qaProjects.slice(0, count)));
      };
      apply();
      window.addEventListener('hashchange', apply);
      return () => window.removeEventListener('hashchange', apply);
    }
  }, []);
  return qa ?? buildData.projects;
}

export function useAvatar(): AvatarConfig | null {
  const [qa, setQa] = useState<AvatarConfig | null>(null);
  useEffect(() => {
    if (import.meta.env.DEV) {
      const apply = () => {
        const hash = window.location.hash;
        if (!hash.includes('qa-avatar')) { setQa(null); return; }
        void import('./__fixtures__/avatar').then((f) => setQa(hash.includes('qa-avatar=real') ? f.realAvatar : f.mockAvatar));
      };
      apply();
      window.addEventListener('hashchange', apply);
      return () => window.removeEventListener('hashchange', apply);
    }
  }, []);
  return qa ?? site.avatar;
}
