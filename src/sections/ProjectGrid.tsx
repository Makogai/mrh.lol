import type { Project } from '../data/types';
import { ForgeCard } from './ForgeCard';
import { ProjectCard } from './ProjectCard';

/**
 * "More tools". The label row is decorative (aria-hidden) — the list carries its own aria-label — and cards are h3s,
 * siblings of the flagship's h3, so heading order stays h2 → h3. The forge card is shown for 0 or an odd number of
 * projects so the two-column grid never ends on a hole.
 */
export function ProjectGrid({ projects }: { projects: Project[] }) {
  const showForge = projects.length === 0 || projects.length % 2 === 1;
  return (
    <div className="mt-16 xl:mt-24">
      <div aria-hidden="true" className="flex items-center gap-4 font-mono text-xs font-medium tracking-label text-ink-400 uppercase">
        <span>More tools</span>
        <span className="h-px flex-1 bg-ink-100/10" />
      </div>
      <ul aria-label="More tools" className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:gap-8">
        {projects.map((p, i) => (
          <ProjectCard key={p.slug} project={p} index={i} />
        ))}
        {showForge && <ForgeCard index={projects.length} wide={projects.length === 0} />}
      </ul>
    </div>
  );
}
