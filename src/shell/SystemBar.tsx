import { useEffect, useState } from 'react';
import { site, type LiveGameKey, type SectionKey } from '../config/site';
import { StatusChip, useLiveGame } from '../status';
import './shell.css';

// Page order of the ticks (the hero menu has its own order: BUILDS first).
const TICKS: SectionKey[] = ['loadout', 'work', 'squad', 'contact'];

// Which tick the little live dot sits on, from what he is doing right now.
const LIVE_TICK: Record<LiveGameKey, SectionKey> = { cs2: 'loadout', warThunder: 'loadout', roblox: 'squad', code: 'work' };

const DESKTOP = '(min-width: 48rem)';

/**
 * Fixed 48px bar (V2_DESIGN §2). Rendered as the FIRST child of the app root, outside every animated wrapper: a transformed
 * ancestor would become the containing block for `position: fixed` (trap #1).
 *
 * Phone: hidden over the hero; past it, shows on scroll-up and hides on scroll-down. Desktop: fades in once 60% of the hero
 * is scrolled past, then stays. SSR renders it hidden and `inert`; everything below happens in effects (trap #6).
 */
export function SystemBar() {
  const [hidden, setHidden] = useState(true);
  const [current, setCurrent] = useState<SectionKey | null>(null);
  const game = useLiveGame();
  const liveTick = game ? LIVE_TICK[game] : null;

  useEffect(() => {
    const desktop = matchMedia(DESKTOP);
    let lastY = window.scrollY;
    let raf = 0;

    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const hero = document.getElementById('top');
      const heroH = hero ? hero.offsetHeight : window.innerHeight;

      if (desktop.matches) setHidden(y < heroH * 0.6);
      else if (y < heroH - 48) setHidden(true);
      else if (y < lastY - 2) setHidden(false);
      else if (y > lastY + 2) setHidden(true);
      lastY = y;

      // Current section = the last one whose top has crossed 35% of the viewport.
      const line = window.innerHeight * 0.35;
      let cur: SectionKey | null = null;
      for (const key of TICKS) {
        const el = document.getElementById(site.sections[key].id);
        if (el && el.getBoundingClientRect().top <= line) cur = key;
      }
      setCurrent(cur);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    // Scroll listener + visibilitychange re-check, not IntersectionObserver: IO callbacks are suspended in hidden tabs, so
    // the underline would be stale on return (trap #4).
    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule();
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    document.addEventListener('visibilitychange', onVisible);
    desktop.addEventListener('change', schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('visibilitychange', onVisible);
      desktop.removeEventListener('change', schedule);
    };
  }, []);

  return (
    <div className="sysbar" data-hidden={hidden ? '' : undefined} inert={hidden}>
      <div className="sysbar-inner">
        <a href="#top" className="sysbar-mono" aria-label={`${site.displayName} — back to main menu`}>
          MRH
        </a>
        <nav aria-label="Sections" className="sysbar-ticks">
          {TICKS.map((key) => {
            const s = site.sections[key];
            return (
              <a key={key} href={`#${s.id}`} className="sysbar-tick" aria-current={current === key ? 'location' : undefined}>
                {s.title}
                {liveTick === key && (
                  <>
                    <span aria-hidden="true" className="sysbar-live" />
                    <span className="sr-only"> (live now)</span>
                  </>
                )}
              </a>
            );
          })}
        </nav>
        <StatusChip className="sysbar-chip" />
      </div>
    </div>
  );
}
