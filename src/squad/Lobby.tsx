import './squad.css';
import { useMemo, useState } from 'react';
import { Section } from '../components/Section';
import { Reveal } from '../components/Reveal';
import { site } from '../config/site';
import { PartyPanel } from '../status';
import { SLOT_COUNT } from './layout';
import { buildMembers } from './members';
import { Roster } from './Roster';
import { Stage } from './Stage';

/**
 * 03 LOBBY: my Roblox party. Header readout `n/5 READY` (a solo lobby says `1/5 · WAITING FOR SQUAD`, deliberately); the stage (2D posters
 * first, one WebGL canvas on top when the gates pass); then the roster and the live PartyPanel. Phones show the roster first (it is the
 * primary information at that width), then the panel; from 1024 the panel takes columns 1-5 and the roster 6-12.
 */
export function Lobby() {
  const s = site.sections.squad;
  const members = useMemo(buildMembers, []);
  // null = the final, static count (what SSR and every non-animated state show). A number is the ready check ticking.
  const [ticking, setTicking] = useState<number | null>(null);
  const n = ticking ?? members.length;
  const copy = site.squad.copy;

  const readout = (
    <span key={n} className="lb-readout" data-tick={ticking !== null ? '' : undefined} aria-live="off">
      {n <= 1 && members.length <= 1 ? `${Math.max(n, 1)}/${SLOT_COUNT} · ${copy.waiting}` : `${n}/${SLOT_COUNT} ${copy.ready}`}
    </span>
  );

  return (
    <Section id={s.id} index={s.index} title={s.title} kicker={s.kicker} subtitle={s.subtitle} readout={readout} intro={copy.sub}>
      <Stage members={members} onCount={setTicking} />
      <div className="lb-lower">
        <Reveal className="lb-roster-wrap" index={1}>
          <Roster members={members} className="lb-roster" />
        </Reveal>
        <Reveal className="lb-panel-wrap" index={2}>
          <PartyPanel />
        </Reveal>
      </div>
    </Section>
  );
}
