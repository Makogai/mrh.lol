import type { CSSProperties } from 'react';
import { ButtonLink } from '../components/Button';
import { Reveal } from '../components/Reveal';
import { IconGitHub } from '../components/icons';
import type { Accent, Project, ProjectStatus } from '../data/types';

const ACCENT: Record<Accent, string> = {
  amber: 'var(--color-amber-400)',
  teal: 'var(--color-teal-400)',
  violet: 'var(--color-violet-400)',
  blue: 'var(--color-blue-400)',
};

// Status = text AND colour (never colour alone). All four clear 4.5:1 on iron-900.
const STATUS: Record<ProjectStatus, { label: string; color: string }> = {
  live: { label: 'Live', color: 'text-teal-400' },
  beta: { label: 'Beta', color: 'text-amber-400' },
  wip: { label: 'In progress', color: 'text-violet-400' },
  archived: { label: 'Archived', color: 'text-ink-400' },
};

const MAX_TAGS = 4;

/** One tool in the "More tools" grid. The <li> reveals; the inner article carries the hover glow (see sections.css). */
export function ProjectCard({ project, index }: { project: Project; index: number }) {
  const { title, tagline, url, repoUrl, status, tags, accent, image } = project;
  const st = STATUS[status];
  const shownTags = tags.slice(0, MAX_TAGS);

  return (
    <Reveal as="li" index={index}>
      <article className="sec-card flex h-full flex-col rounded-card p-6 md:p-8" style={{ '--accent': ACCENT[accent] } as CSSProperties}>
        <div className="flex items-center gap-4">
          <div aria-hidden="true" className="flex flex-1 items-center gap-2">
            <span className="sec-pad-dot" />
            <span className="sec-pad-dot" />
            <span className="sec-pad-dot" />
            <span className="sec-pad-line ml-2" />
          </div>
          <span className={`inline-flex h-8 items-center rounded-full px-3 font-mono text-xs font-medium tracking-label uppercase shadow-hairline ${st.color}`}>
            {st.label}
          </span>
        </div>

        {image && (
          <div className="mt-6 aspect-[16/10] overflow-clip rounded-pad shadow-hairline">
            <img src={image.src} width={image.width} height={image.height} alt={image.alt} loading="lazy" decoding="async" className="block h-full w-full object-cover" />
          </div>
        )}

        <h3 className="mt-6 text-2xl font-bold [font-stretch:112.5%] tracking-snug">{title}</h3>
        <p className="mt-3 max-w-[52ch] text-base text-ink-300">{tagline}</p>

        {shownTags.length > 0 && (
          <ul aria-label="Tags" className="mt-6 flex flex-wrap gap-2">
            {shownTags.map((tag) => (
              <li key={tag} className="inline-flex h-8 items-center rounded-full px-3 font-mono text-xs text-ink-400 shadow-hairline">
                {tag}
              </li>
            ))}
          </ul>
        )}

        {(url || repoUrl) && (
          // mt-auto pins the buttons to the card bottom so a row of unequal cards still lines its actions up.
          <div className="mt-auto flex flex-wrap gap-3 pt-8">
            {url && (
              <ButtonLink href={url} external variant="ghost">
                Open<span className="sr-only"> {title}</span>
              </ButtonLink>
            )}
            {repoUrl && (
              <ButtonLink href={repoUrl} external variant="ghost" icon={<IconGitHub size={20} />}>
                Source<span className="sr-only"> of {title}</span>
              </ButtonLink>
            )}
          </div>
        )}
      </article>
    </Reveal>
  );
}
