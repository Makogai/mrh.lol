import { Section } from '../components/Section';
import { site } from '../config/site';
import { FlagshipCard } from './FlagshipCard';
import { ProjectGrid } from './ProjectGrid';
import { useProjects } from './qa';
import './sections.css';

/** What I've built (BUILD_PLAN §8.3): the flagship feature card, then the grid of further tools. */
export function Work() {
  const s = site.sections.work;
  const projects = useProjects();
  return (
    <Section id={s.id} index={s.index} title={s.title} className="sec-work">
      <FlagshipCard />
      <ProjectGrid projects={projects} />
    </Section>
  );
}
