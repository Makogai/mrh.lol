import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Reveal } from '../components/Reveal';
import { Section } from '../components/Section';
import { Sigil } from '../components/Sigil';
import { site, type PillarId } from '../config/site';
import { buildData } from '../data';
import type { AvatarConfig } from '../config/site';
import { cx } from '../lib/cx';
import { renderEmphasis } from '../lib/inline';
import { useLiveGame } from '../status';
import { resolveLoadoutData, type LoadoutData } from './data';
import { AnimePanel, GamesPanel, ProgrammingPanel, TrainingPanel } from './panels';
import { useMatch } from './useMatch';
import './loadout.css';

const ORDER: PillarId[] = ['programming', 'games', 'anime', 'training'];

/** 'LAST PUSH 3D AGO' is measured against the build time, not Date.now(), so SSR and the client print the same thing. */
function pushAge(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.parse(buildData.builtAt) - Date.parse(iso)) / 864e5);
  return Number.isFinite(days) ? (days <= 0 ? 'TODAY' : `${days}D AGO`) : null;
}

function Mascot({ avatar }: { avatar: AvatarConfig | null }) {
  if (!avatar) {
    // No mascot yet: a monogram on the same ground (the Roblox render replaces this once the squad build lands).
    return <span className="lo-mono ui-label" aria-hidden="true">{site.displayName.slice(0, 1)}</span>;
  }
  const set = (k: 'avif' | 'webp' | 'png') =>
    [avatar.srcSm && `${avatar.srcSm[k]} 352w`, `${avatar.src[k]} ${avatar.width}w`, avatar.src2x && `${avatar.src2x[k]} 1024w`].filter(Boolean).join(', ');
  const sizes = '(min-width: 64rem) 420px, 72px';
  return (
    <picture>
      <source type="image/avif" srcSet={set('avif')} sizes={sizes} />
      <source type="image/webp" srcSet={set('webp')} sizes={sizes} />
      <img src={avatar.src.png} srcSet={set('png')} sizes={sizes} width={avatar.width} height={avatar.height} alt={avatar.alt} decoding="async" loading="lazy" />
    </picture>
  );
}

export interface LoadoutViewProps {
  data: LoadoutData;
  /** Fixtures: first selected pillar. */
  initial?: PillarId;
  /** Fixtures: avatar override (undefined → site.avatar). */
  avatar?: AvatarConfig | null;
}

/**
 * 01 LOADOUT: a character sheet (V2_DESIGN §2). Programming is the MAIN class and the base teal accent.
 * The four slots are one ARIA tablist (roving tabindex, arrows, Home/End); picking one sets `data-pillar` on the <section>,
 * so `--accent`/`--glow` transition over 240 ms and the bloom, ticks and rings all re-skin. SSR renders all four panels
 * (inactive ones `hidden`), so nothing depends on JS.
 */
export function LoadoutView({ data, initial = 'programming', avatar = site.avatar }: LoadoutViewProps) {
  const [sel, setSel] = useState<PillarId>(initial);
  const [swapped, setSwapped] = useState(false); // the 160 ms panel crossfade only after the first user selection
  const tabs = useRef<Partial<Record<PillarId, HTMLButtonElement | null>>>({});
  const root = useRef<HTMLElement | null>(null);
  const { game } = useMatch(false);
  const coding = useLiveGame() === 'code';
  const s = site.sections.loadout;
  const meta = site.pillarMeta;

  // Ambient loops (tape, tempo, ticks) are CSS keyed on [data-onscreen]: on only while the section is in view and the tab visible.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let inView = false;
    const apply = () => el.toggleAttribute('data-onscreen', inView && document.visibilityState === 'visible');
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; apply(); });
    io.observe(el);
    document.addEventListener('visibilitychange', apply);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', apply); };
  }, []);

  const select = (id: PillarId, focus = false) => {
    setSel(id);
    setSwapped(true);
    if (focus) tabs.current[id]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const i = ORDER.indexOf(sel);
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? ORDER[(i + 1) % ORDER.length]
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? ORDER[(i + ORDER.length - 1) % ORDER.length]
      : e.key === 'Home' ? ORDER[0]
      : e.key === 'End' ? ORDER[ORDER.length - 1]
      : null;
    if (!next) return;
    e.preventDefault();
    select(next, true);
  };

  const repos = data.github?.publicRepos;
  const age = pushAge(data.github?.lastPushAt ?? null);

  return (
    <Section
      id={s.id}
      index={s.index}
      title={s.title}
      kicker={s.kicker}
      subtitle={s.subtitle}
      intro={site.loadoutLine}
      className="lo-section"
      attrs={{ 'data-pillar': sel, 'data-swapped': swapped ? '' : undefined }}
    >
      <div className="page-grid" ref={(el) => { root.current = el?.closest('section') ?? null; }}>
        <Reveal className="lo-char lg:col-span-5">
          <div className="lo-avatar">
            <Mascot avatar={avatar} />
          </div>
          <div className="lo-id">
            <p className="lo-name ui-label">{site.displayName}</p>
            <p className="lo-class">
              CLASS {meta.programming.plain.toUpperCase()}
              <span className="lo-pill">MAIN</span>
            </p>
          </div>
          <div className="lo-disc" aria-hidden="true" />
        </Reveal>

        <div className="lg:col-span-7">
          <Reveal as="p" className="lo-bio">{renderEmphasis(site.bio)}</Reveal>

          <Reveal index={1} className="lo-slots" role="tablist" aria-label="What I'm into" onKeyDown={onKeyDown}>
            {ORDER.map((id) => {
              const on = sel === id;
              const main = id === 'programming';
              return (
                <button
                  key={id}
                  ref={(el) => { tabs.current[id] = el; }}
                  type="button"
                  role="tab"
                  id={`lo-tab-${id}`}
                  aria-selected={on}
                  aria-controls={`lo-panel-${id}`}
                  tabIndex={on ? 0 : -1}
                  data-pillar={id}
                  className={cx('slot lo-slot', main && 'lo-slot-main')}
                  onClick={() => select(id)}
                >
                  <span className="lo-slot-head">
                    <Sigil name={id} size={main ? 32 : 28} />
                    {((id === 'games' && game) || (main && coding)) && (
                      <span className="lo-live">
                        <span aria-hidden="true" />
                        <span className="sr-only">{main ? 'In the editor now' : 'In a match now'}</span>
                      </span>
                    )}
                  </span>
                  <span className="lo-slot-label ui-label">{meta[id].label}</span>
                  <span className="lo-slot-sub">{main ? 'MAIN CLASS' : meta[id].blurb}</span>
                  {main && (
                    <>
                      <svg className="lo-trace" viewBox="0 0 240 120" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
                        <path d="M0 96h58l18-18h54l14 14h42l18-30h36M0 60h38l14-14h46M120 120v-20M150 120v-14l12-12M196 120v-26M96 46V22h56l10 10h78" />
                        <circle cx="76" cy="78" r="2.5" /><circle cx="162" cy="32" r="2.5" /><circle cx="240" cy="62" r="2.5" /><circle cx="98" cy="46" r="2.5" />
                      </svg>
                      {repos != null && (
                        <span className="lo-gh">
                          <span><b>{repos}</b> PUBLIC REPOS</span>
                          {age && <span><b>{age}</b> LAST PUSH</span>}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </Reveal>

          <div className="lo-panels">
            {ORDER.map((id) => (
              <div key={id} role="tabpanel" id={`lo-panel-${id}`} aria-labelledby={`lo-tab-${id}`} hidden={sel !== id} className="lo-panel">
                {id === 'programming' && <ProgrammingPanel data={data} />}
                {id === 'games' && <GamesPanel data={data} active={sel === id} />}
                {id === 'anime' && <AnimePanel data={data} />}
                {id === 'training' && <TrainingPanel data={data} />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

export function Loadout() {
  return <LoadoutView data={resolveLoadoutData()} />;
}
