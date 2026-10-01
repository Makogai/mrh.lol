import { Fragment } from 'react';
import { Reveal } from '../components/Reveal';
import { Section } from '../components/Section';
import { site } from '../config/site';
import { renderEmphasis } from '../lib/inline';
import { Bezel } from './Bezel';
import { useAvatar } from './qa';
import './sections.css';

/**
 * Splits the bio after its first sentence so that sentence can be brighter (ink-100) than the rest (ink-300).
 * Falls back to one block when there is no ". " or when the cut would land inside a **emphasis** pair.
 */
function splitBio(bio: string): [string, string] {
  const cut = bio.indexOf('. ');
  if (cut === -1) return [bio, ''];
  const first = bio.slice(0, cut + 1);
  const markers = first.match(/\*\*/g)?.length ?? 0;
  return markers % 2 === 0 ? [first, bio.slice(cut + 2)] : [bio, ''];
}

/**
 * Who I am (BUILD_PLAN §8.2). The bio is the display element; the avatar sits in an instrument bezel.
 * DOM order is bio → bezel for reading order; `order-first` lifts the bezel above the bio on the single-column layout.
 */
export function About() {
  const s = site.sections.about;
  const avatar = useAvatar();
  const [lead, rest] = splitBio(site.bio);
  const { location } = site;

  return (
    <Section id={s.id} index={s.index} title={s.title} titleStyle="label">
      <div className="grid grid-cols-1 gap-y-10 md:grid-cols-6 md:items-start md:gap-x-6 xl:grid-cols-12 xl:items-center xl:gap-x-8">
        <Reveal className="md:col-span-4 xl:col-span-7">
          <p className="max-w-[30ch] text-lead font-medium tracking-snug text-ink-300 [text-wrap:pretty]">
            <span className="text-ink-100">{renderEmphasis(lead)}</span>
            {rest && ' '}
            {rest && renderEmphasis(rest)}
          </p>

          <dl className="mt-10 grid grid-cols-[max-content_1fr] items-center gap-x-6 gap-y-4 font-mono text-sm">
            <dt className="text-ink-400">Based in</dt>
            <dd className="flex flex-wrap items-center gap-x-4 gap-y-2 text-ink-100">
              <span>{location.label}</span>
              {location.flourish && (
                // A designer's joke (flight level 350); decorative, so it stays out of the accessibility tree.
                <span aria-hidden="true" className="inline-flex h-6 items-center rounded-full px-3 text-xs tracking-label text-ink-300 shadow-hairline">
                  {location.flourish}
                </span>
              )}
            </dd>
            <dt className="text-ink-400">Into</dt>
            <dd className="text-ink-100">
              {site.interests.map((interest, i) => (
                // The dot lives inside the following item's nowrap span, with the breakable space before it, so a wrap
                // starts the next line with "· aviation" and a line can never end on a dangling separator.
                <Fragment key={interest}>
                  {i > 0 && ' '}
                  <span className="whitespace-nowrap">
                    {i > 0 && <span className="text-ink-400">· </span>}
                    {interest}
                  </span>
                </Fragment>
              ))}
            </dd>
          </dl>
        </Reveal>

        <Reveal index={1} className="order-first justify-self-start md:order-none md:col-span-2 md:col-start-5 md:justify-self-end xl:col-span-4 xl:col-start-9 xl:justify-self-center">
          <Bezel avatar={avatar} />
        </Reveal>
      </div>
    </Section>
  );
}
