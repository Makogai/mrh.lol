import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ButtonLink } from '../components/Button';
import { PlatformSigil } from '../components/Sigil';
import { buildData } from '../data';
import type { Project, ProjectStatus } from '../data/types';
import { cx } from '../lib/cx';
import { usePrefersReducedMotion } from '../lib/media';
import { useReveal } from '../components/Reveal';
import { resolveTheme, type Readout, type ThemeDef } from './themes';

const STATUS: Record<ProjectStatus, string> = { live: 'LIVE', beta: 'BETA', wip: 'WIP', archived: 'ARCHIVED' };

/** Up to 3 readouts. Real data only: Supabase `stats` wins; otherwise the theme fills from live build data; plain themes show none. */
function readoutsFor(theme: ThemeDef, project: Project, config: unknown): Readout[] {
  if (project.stats?.length) return project.stats.slice(0, 3).map((s) => ({ value: s.value, label: s.label }));
  const a = buildData.atlas.stats;
  if (theme.readout === 'ore') {
    return [
      { value: String(a.minerals), label: 'Minerals' },
      { value: String(a.digSites), label: 'Dig sites' },
      { value: String(a.pages), label: 'Pages' },
    ];
  }
  if (theme.readout === 'discord') {
    const filled = (config as { commands?: unknown[] } | null)?.commands?.length;
    return [
      { value: String(filled || a.discordCommands), label: 'Commands' },
      { value: String(a.minerals), label: 'Minerals' }, // the bot answers from the same dataset as the Atlas
    ];
  }
  return [];
}

/**
 * Active = the card may animate its theme art. Pointer devices: hover or focus-within. Touch: >= 60% in view. Never on a
 * hidden tab. Reduced motion is handled in CSS (animations are off) and passed to Art as a prop.
 */
function useActive(ref: React.RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let hover = false, focus = false, inView = false;
    const apply = () => setActive(document.visibilityState === 'visible' && (fine ? hover || focus : inView));
    const on = (t: EventTarget, e: string, f: () => void) => { t.addEventListener(e, f); return () => t.removeEventListener(e, f); };
    const off = [
      on(document, 'visibilitychange', apply),
      on(el, 'pointerenter', () => { hover = true; apply(); }),
      on(el, 'pointerleave', () => { hover = false; apply(); }),
      on(el, 'focusin', () => { focus = true; apply(); }),
      on(el, 'focusout', () => { focus = false; apply(); }),
    ];
    let io: IntersectionObserver | undefined;
    if (!fine && 'IntersectionObserver' in window) {
      io = new IntersectionObserver(([e]) => { inView = e.intersectionRatio >= 0.6; apply(); }, { threshold: [0, 0.6, 1] });
      io.observe(el);
    }
    return () => { off.forEach((f) => f()); io?.disconnect(); };
  }, [ref]);
  return active;
}

/** Fine pointers only: writes --lx/--ly (px inside the art box: the atlas lantern) and --px/--py (-1..1: the ±8px art parallax), rAF-throttled. */
function usePointerVars(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const art = el.querySelector<HTMLElement>('.item-art');
    if (!art) return;
    let raf = 0, x = 0, y = 0;
    const flush = () => {
      raf = 0;
      const r = art.getBoundingClientRect();
      const lx = x - r.left, ly = y - r.top;
      el.style.setProperty('--lx', `${Math.round(lx)}px`);
      el.style.setProperty('--ly', `${Math.round(ly)}px`);
      el.style.setProperty('--px', String(Math.max(-1, Math.min(1, (lx / r.width - 0.5) * 2)).toFixed(2)));
      el.style.setProperty('--py', String(Math.max(-1, Math.min(1, (ly / r.height - 0.5) * 2)).toFixed(2)));
    };
    const move = (e: PointerEvent) => { x = e.clientX; y = e.clientY; raf ||= requestAnimationFrame(flush); };
    el.addEventListener('pointermove', move);
    return () => { el.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, [ref]);
}

export interface ItemCardProps {
  project: Project;
  /** 0-based position in the bento; also the B-01 label. */
  index: number;
  /** The lead card: bigger title, bigger art. */
  featured: boolean;
  /** 390px inventory row (n >= 5, non-featured). */
  compact: boolean;
  /** 1440 short cells (see layout.ts): trims content so a fixed-height cell never overflows. */
  density?: 'row' | 'dense';
}

export function ItemCard({ project, index, featured, compact, density }: ItemCardProps) {
  const theme = resolveTheme(project.theme);
  const config = theme.parseConfig ? theme.parseConfig(project.themeConfig) : project.themeConfig;
  const reduced = usePrefersReducedMotion();
  const cardRef = useRef<HTMLElement | null>(null);
  const active = useActive(cardRef);
  usePointerVars(cardRef);
  const readouts = readoutsFor(theme, project, config);
  const cta = theme.cta?.(project, config) ?? (project.url ? { label: 'Open', href: project.url } : null);
  const titleId = `item-${project.slug}`;
  const forge = theme.id === 'forge';
  const v = theme.vars;
  // Theme variables inline (single source: ThemeDef.vars). Forge keeps the project's accent via [data-accent] instead.
  const style = useMemo(
    () =>
      ({
        '--surface-0': v.surface0,
        '--surface-1': v.surface1,
        ...(forge ? null : { '--accent': v.accent, '--accent-ink': v.accentInk, '--glow': v.glow }),
      }) as CSSProperties,
    [v, forge],
  );

  return (
    <article
      ref={cardRef}
      aria-labelledby={titleId}
      className={cx('item slot slot-card', `theme-${theme.id}`)}
      style={style}
      data-accent={forge ? project.accent : undefined}
      data-active={active ? '' : undefined}
      data-featured={featured ? '' : undefined}
      data-compact={compact ? '' : undefined}
      data-density={density}
    >
      <div className="item-hud">
        <span className="item-idx">B-{String(index + 1).padStart(2, '0')}</span>
        <span className="item-pill" data-status={project.status}>{STATUS[project.status]}</span>
        {project.platform.length > 0 && (
          <span className="item-plat">
            {project.platform.map((p) => <PlatformSigil key={p} name={p} size={16} />)}
            <span className="sr-only">Platforms: {project.platform.join(', ')}</span>
          </span>
        )}
      </div>

      {/* THEME LAYER: decorative, box reserved by CSS (aspect-ratio / min-height) so it can never shift layout. */}
      <div className="item-art" aria-hidden="true">
        <theme.Art project={project} config={config} active={active} reduced={reduced} />
      </div>

      <h3 id={titleId} className="item-title ui-label">{project.title}</h3>
      <p className="item-tag">{project.tagline}</p>

      {readouts.length > 0 && (
        <dl className="item-stats">
          {readouts.map((r) => (
            <div key={r.label}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {(cta || project.repoUrl) && (
        <div className="item-cta">
          {cta && <ButtonLink href={cta.href} external className="item-open">{cta.label}</ButtonLink>}
          {project.repoUrl && <ButtonLink href={project.repoUrl} external variant="ghost" className="item-src">Source</ButtonLink>}
        </div>
      )}
    </article>
  );
}

/** The grid cell wrapper owns the reveal (opacity + translate); the card inside owns hover lift, so the two never fight over transform. */
export function Cell({ children, i, ...rest }: { children: React.ReactNode; i: number } & React.HTMLAttributes<HTMLLIElement>) {
  const ref = useReveal<HTMLLIElement>();
  return (
    <li {...rest} ref={ref} data-reveal="" style={{ ...rest.style, '--reveal-i': Math.min(i, 6) } as CSSProperties}>
      {children}
    </li>
  );
}
