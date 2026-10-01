import type { CSSProperties } from 'react';
import { Section } from '../components/Section';
import { site } from '../config/site';
import { Cell, ItemCard } from './ItemCard';
import { ForgeSlot } from './ForgeSlot';
import { MAX_PROJECTS, plan } from './layout';
import { useProjects } from './useProjects';
import './work.css';
import './themes/themes.css';

/** 02 BUILDS: item cards in a bento that is planned for every count from 0 to 8 (layout.ts), forge slot filling the gap. */
export function Work() {
  const s = site.sections.work;
  const all = useProjects();
  const projects = all.slice(0, MAX_PROJECTS);
  const n = projects.length;
  const cells = plan(n);
  const shipped = projects.filter((p) => p.status === 'live' || p.status === 'beta').length;
  // WIP projects are in the forge too; the forge card itself counts as one while it is on screen.
  const inForge = projects.filter((p) => p.status === 'wip').length + (cells.some((c) => c.kind === 'forge') ? 1 : 0);
  const readout = [`${shipped} SHIPPED`, inForge > 0 ? `${inForge} IN THE FORGE` : null].filter(Boolean).join(' · ');
  // At 768 (2 columns) an odd number of non-lead cells would leave a ragged last row: the last cell spans both columns.
  const oddRest = (cells.length - 1) % 2 === 1;

  return (
    <Section id={s.id} index={s.index} title={s.title} kicker={s.kicker} subtitle={s.subtitle} readout={readout}>
      <ul className="bento" role="list" data-n={n}>
        {cells.map((c, k) => {
          const style = { '--span': c.span, '--h': c.h ? `${c.h}px` : undefined, '--rows': c.rows } as CSSProperties;
          const wide = k === 0 || (oddRest && k === cells.length - 1);
          const lead = c.kind === 'project' && c.i === 0;
          return (
            <Cell key={c.kind === 'forge' ? 'forge' : projects[c.i].slug} i={k} className="bento-cell" style={style} data-wide={wide ? '' : undefined} data-slim={c.slim ? '' : undefined}>
              {c.kind === 'forge' ? (
                <ForgeSlot slim={c.slim} />
              ) : (
                // n >= 5: on phones every non-lead card collapses to a 96px inventory row.
                <ItemCard project={projects[c.i]} index={c.i} featured={lead} compact={n >= 5 && !lead} density={c.h === null || c.h > 380 ? undefined : c.span === 5 ? 'row' : 'dense'} />
              )}
            </Cell>
          );
        })}
      </ul>
    </Section>
  );
}
