import { useCallback, useEffect, useRef, useState } from 'react';
import { Reveal } from '../components/Reveal';
import { Section } from '../components/Section';
import { TextLink } from '../components/TextLink';
import { site } from '../config/site';
import { PlayerCard } from './PlayerCard';
import { PlayerTrace, type Pulse } from './PlayerTrace';
import './player.css';

const PULSE_MS = 900; // = the ct-pulse animation length; the trace's pads keep their colour for as long

/** "Prospecting! → Prospecting Atlas": the part after the last arrow is the link into the Work section. */
function splitBuiltFor(text: string): [string, string] {
  const i = text.lastIndexOf(' → ');
  return i === -1 ? ['', text] : [text.slice(0, i + 3), text.slice(i + 3)];
}

/**
 * "02 · In game": the live 3D avatar. Mirrors About (card left, copy right). The card's pedestal trace crosses the
 * gap into the copy's "Plays as" row; waves and presence changes pulse along it.
 */
export function PlayerSection() {
  const s = site.sections.player;
  const { copy, username, profileUrl } = site.roblox;
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const timer = useRef(0);
  const count = useRef(0);

  const onPulse = useCallback((kind: Pulse['kind']) => {
    setPulse({ kind, n: ++count.current });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPulse(null), PULSE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const [game, project] = splitBuiltFor(copy.builtFor);

  return (
    <Section id={s.id} index={s.index} title={s.title} titleStyle="label" className="pl-section">
      <div className="pl-grid">
        {/* Card and trace share one flex cell, so the trace is exactly as long as the gap the card leaves. */}
        <Reveal className="pl-cell">
          <PlayerCard onPulse={onPulse} />
          <PlayerTrace pulse={pulse} />
        </Reveal>

        <Reveal index={1} className="pl-copy">
          <h3 className="text-title font-[800] [font-stretch:112.5%] tracking-display text-ink-100">{copy.line}</h3>
          <p className="mt-4 max-w-[34ch] text-lg text-ink-300">{copy.sub}</p>

          {/* About's readout pattern. The first row ("Plays as") is where the trace ends; see --pl-pb in player.css. */}
          <dl className="pl-readout mt-8 font-mono text-sm">
            <div className="pl-row">
              <dt className="text-ink-400">Plays as</dt>
              <dd className="text-ink-100"><TextLink external href={profileUrl}>{username}</TextLink></dd>
            </div>
            <div className="pl-row">
              <dt className="text-ink-400">Built for</dt>
              <dd className="text-ink-100">
                {game}
                <TextLink href={`#${site.sections.work.id}`}>{project}</TextLink>
              </dd>
            </div>
          </dl>
        </Reveal>
      </div>
    </Section>
  );
}
