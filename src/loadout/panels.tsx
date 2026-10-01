import { useRef, type CSSProperties, type PointerEvent } from 'react';
import { IconArrowDown, IconArrowRight } from '../components/icons';
import { site, type GameKey } from '../config/site';
import { buildData } from '../data';
import { cx } from '../lib/cx';
import type { LoadoutData } from './data';
import { useMatch } from './useMatch';

/** `IN MATCH · 23:14`. Mono, visible text (not colour alone); the clock only exists once the status store has a startedAt. */
function MatchBadge({ elapsed }: { elapsed: string | null }) {
  return <span className="lo-match">IN MATCH{elapsed ? ` · ${elapsed}` : ''}</span>;
}

/* ── PROGRAMMING (teal): a code-editor panel ─────────────────────────────────────────────────────────────────────── */
export function ProgrammingPanel({ data }: { data: LoadoutData }) {
  const forge = data.building;
  return (
    <div className="slot lo-editor" data-static>
      <ol className="lo-code" aria-label="Stack">
        {data.stack.length ? (
          data.stack.map((s) => <li key={s}>{s}</li>)
        ) : (
          // Empty slot: the one statement about the stack that is true by construction.
          <li>This site: Vite · React · TypeScript · raw WebGL</li>
        )}
        {forge && (
          <li className="lo-code-now">
            <span className="text-ink-400">Currently building</span>
            <IconArrowRight size={14} className="lo-code-arrow" />
            <strong className="font-semibold text-ink-100">{forge.title}</strong>
          </li>
        )}
      </ol>
    </div>
  );
}

/* ── GAMES (amber): three evoked-not-copied tiles ────────────────────────────────────────────────────────────────── */
const GAME_NAME: Record<GameKey, string> = { cs2: 'Counter-Strike 2', warThunder: 'War Thunder', roblox: 'Roblox' };

/** Pointer offset from the tile centre → --px/--py (rAF-throttled, mouse only); the crosshair eases there with the spring. */
function useCrosshair() {
  const raf = useRef(0);
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return;
    const el = e.currentTarget;
    const { clientX, clientY } = e;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--px', `${Math.round((clientX - r.left - r.width / 2) * 0.6)}px`);
      el.style.setProperty('--py', `${Math.round((clientY - r.top - r.height / 2) * 0.6)}px`);
    });
  };
  const onPointerLeave = (e: PointerEvent<HTMLElement>) => {
    cancelAnimationFrame(raf.current);
    e.currentTarget.style.setProperty('--px', '0px');
    e.currentTarget.style.setProperty('--py', '0px');
  };
  return { onPointerMove, onPointerLeave };
}

function Readouts({ rows }: { rows: [string, string | null][] }) {
  const shown = rows.filter((r): r is [string, string] => r[1] !== null);
  if (!shown.length) return null;
  return (
    <dl className="lo-score">
      {shown.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

interface TileProps { id: GameKey; big: boolean; live: boolean; elapsed: string | null; data: LoadoutData }

function GameTile({ id, big, live, elapsed, data }: TileProps) {
  const cross = useCrosshair();
  const { cs2, warThunder } = data.games;
  const atlas = buildData.projects.find((p) => p.slug === 'prospecting-atlas');
  return (
    <li
      className={cx('slot lo-tile', big && 'lo-tile-big')}
      data-accent={id}
      data-static
      data-live={live ? '' : undefined}
      {...(id === 'cs2' ? cross : null)}
    >
      <div className="lo-tile-art" aria-hidden="true">
        {id === 'cs2' && (
          <>
            <div className="lo-buy">{[1, 2, 3, 4, 5, 6].map((n) => <span key={n}>{n}</span>)}</div>
            <i className="lo-xhair" />
          </>
        )}
        {id === 'warThunder' && (
          <>
            <svg className="lo-ladder" viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="1">
              {[20, 40, 60, 80, 100].map((y) => (
                <path key={y} d={y === 60 ? 'M8 60h38M74 60h38' : `M34 ${y}h18M68 ${y}h18M34 ${y}v${y < 60 ? 4 : -4}M86 ${y}v${y < 60 ? 4 : -4}`} />
              ))}
              <circle cx="60" cy="60" r="3" />
            </svg>
            <div className="lo-tape" />
          </>
        )}
      </div>
      <div className="lo-tile-body">
        <p className="lo-kicker">
          {id === 'cs2' ? 'FAVOURITE · #1' : id === 'warThunder' ? 'FAVOURITE' : 'PLATFORM'}
          {live && <MatchBadge elapsed={elapsed} />}
        </p>
        <h4 className="lo-tile-name ui-label">{GAME_NAME[id]}</h4>
        {id === 'cs2' && <Readouts rows={[[cs2.mode ?? 'RANK', cs2.rank], ['HOURS', cs2.hours], ['ROLE', cs2.role], ['MAP', cs2.map]]} />}
        {id === 'warThunder' && (
          <>
            {warThunder.topBR && (
              <p className="lo-br" aria-label={`Top battle rating ${warThunder.topBR}`}>
                {warThunder.topBR}
                <small>BR</small>
              </p>
            )}
            <Readouts rows={[['NATION', warThunder.nation], ['VEHICLE', warThunder.mainVehicle]]} />
          </>
        )}
        {id === 'roblox' && (
          <p className="lo-links">
            <a href={`#${site.sections.squad.id}`}>
              Meet the squad <IconArrowDown size={14} />
            </a>
            {atlas && <a href={`#${site.sections.work.id}`}>Built for it: {atlas.title}</a>}
          </p>
        )}
      </div>
    </li>
  );
}

export function GamesPanel({ data, active }: { data: LoadoutData; active: boolean }) {
  const { game, elapsed } = useMatch(active);
  return (
    <ul className="lo-games" aria-label="Games">
      {data.games.order.map((id, i) => (
        <GameTile key={id} id={id} big={i === 0} live={game === id} elapsed={game === id ? elapsed : null} data={data} />
      ))}
    </ul>
  );
}

/* ── ANIME (violet): manga-panel frames ──────────────────────────────────────────────────────────────────────────── */
export function AnimePanel({ data }: { data: LoadoutData }) {
  const { nowWatching: now, favourites, stats } = data.anime;
  const covers = [now?.cover, ...favourites.map((f) => f.cover)].filter((c): c is NonNullable<typeof c> => Boolean(c));
  return (
    <div className="lo-anime slot" data-static>
      <div className="lo-frames" aria-hidden="true">
        {[0, 1, 2].map((i) => {
          const c = covers[i];
          return (
            <span key={i} className="lo-frame" style={{ '--i': i } as CSSProperties}>
              {c && <img src={c.src} width={c.width} height={c.height} alt="" loading="lazy" decoding="async" />}
            </span>
          );
        })}
      </div>
      <div className="lo-copy">
        {now ? (
          <>
            <p className="lo-kicker">NOW WATCHING</p>
            <p className="lo-headline ui-label">{now.title}</p>
            {now.ep !== null && (
              <p className="lo-fine">
                EP {now.ep}
                {now.episodes ? ` / ${now.episodes}` : ''}
              </p>
            )}
          </>
        ) : (
          <p className="lo-headline ui-label">One more episode. Always.</p>
        )}
        {favourites.length > 0 && (
          <ol className="lo-favs" aria-label="Favourites">
            {favourites.map((f, i) => (
              <li key={f.title}>
                <span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span> {f.title}
              </li>
            ))}
          </ol>
        )}
        {stats && stats.count > 0 && (
          <p className="lo-fine">
            {stats.count} SERIES · {stats.episodesWatched} EPISODES
          </p>
        )}
      </div>
    </div>
  );
}

/* ── TRAINING (blue): plate rings and a tempo bar ────────────────────────────────────────────────────────────────── */
export function TrainingPanel({ data }: { data: LoadoutData }) {
  const { split, lifts } = data.training;
  return (
    <div className="lo-train slot" data-static>
      <svg className="lo-plate" viewBox="0 0 160 160" fill="none" stroke="currentColor" aria-hidden="true">
        {[70, 52, 34, 16].map((r) => (
          <circle key={r} cx="80" cy="80" r={r} strokeWidth={r === 70 ? 2 : 1} />
        ))}
        <path d="M6 80h148" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div className="lo-copy">
        <p className="lo-headline ui-label">{split ?? (lifts.length ? 'Training' : 'Consistency over noise.')}</p>
        {lifts.length > 0 && (
          <dl className="lo-lifts">
            {lifts.slice(0, 4).map((l) => (
              <div key={l.name}>
                <dt>{l.name}</dt>
                <dd>
                  {l.value} <small>{l.unit}</small>
                </dd>
              </div>
            ))}
          </dl>
        )}
        <div className="lo-tempo" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <i key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      </div>
    </div>
  );
}
