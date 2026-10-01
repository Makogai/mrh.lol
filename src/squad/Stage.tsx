import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Reveal } from '../components/Reveal';
import { cx } from '../lib/cx';
import { usePrefersReducedMotion, useMediaQuery } from '../lib/media';
import type { SquadHandle } from '../player/squad'; // type only: the 3D code stays in its own lazy chunk
import { SLOT_COUNT, slotAt, type LayoutKind } from './layout';
import { robloxAsset, type Member } from './members';
import { OpenSlot, Poster, ProfileLink, slotVars } from './Slots';

const WIDE = '(min-width: 48rem)';
const READY_CHECK_TIMEOUT = 2500;

/**
 * The lobby canvas host. SSR paints the 2D poster line-up (and open-slot silhouettes) into fixed slots, so layout never moves. The WebGL
 * stage is an upgrade that only loads when every gate passes (V2_DESIGN section 5):
 *   WebGL works (the stage checks), !saveData, deviceMemory >= 4, motion not reduced, and the host is within 600px of the viewport.
 * It then waits for 60 % visibility (or 2.5 s after that) and runs the READY CHECK once: avatars materialise left to right.
 * Anything going wrong (perf governor, lost context, network) calls onError and the posters simply stay.
 */
export function Stage({ members, onCount }: { members: Member[]; onCount: (n: number | null) => void }) {
  const wide = useMediaQuery(WIDE);
  const reduced = usePrefersReducedMotion();
  const kind: LayoutKind = wide ? 'line' : 'v';
  const hostRef = useRef<HTMLDivElement>(null);
  const live = useRef<{ h: SquadHandle | null; actorOf: Map<number, number>; spawned: Set<number> }>({ h: null, actorOf: new Map(), spawned: new Set() });
  const [spawned, setSpawned] = useState<ReadonlySet<number>>(() => new Set());
  const bySlot = useMemo(() => new Map(members.map((m) => [m.slot, m])), [members]);

  const slotEl = (slot: number) => hostRef.current?.querySelector<HTMLElement>(`[data-slot="${slot}"]`) ?? null;
  const posterWave = (slot: number) => {
    const el = slotEl(slot);
    if (!el || el.hasAttribute('data-wave')) return;
    el.setAttribute('data-wave', '');
    window.setTimeout(() => el.removeAttribute('data-wave'), 700);
  };
  const wave = (slot: number) => {
    const r = live.current, i = r.actorOf.get(slot);
    if (r.h && i !== undefined && r.spawned.has(slot)) r.h.wave(i); else posterWave(slot);
  };
  const highlight = (slot: number, on: boolean) => {
    const r = live.current, i = r.actorOf.get(slot);
    if (on) slotEl(slot)?.setAttribute('data-hl', ''); else slotEl(slot)?.removeAttribute('data-hl');
    if (r.h && i !== undefined) r.h.highlight(i, on);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    if (reduced || nav.connection?.saveData === true || (nav.deviceMemory ?? 4) < 4) return;
    const cast = members.filter((m) => m.gen);
    if (!cast.length) return;

    const r = live.current;
    let cancelled = false, canvas: HTMLCanvasElement | null = null, vis60 = false, ready = false, started = false, timer = 0, ticks = 0;
    const toPosters = () => {
      r.h = null; r.spawned.clear(); r.actorOf.clear();
      canvas?.remove(); canvas = null;
      setSpawned(new Set()); onCount(null);
    };
    const go = () => {
      if (started || !r.h) return;
      started = true; clearTimeout(timer);
      ticks = 0; onCount(0);
      r.h.start(180);
    };
    const tryStart = () => {
      if (started || !r.h || !vis60) return;
      if (ready) go(); else if (!timer) timer = window.setTimeout(go, READY_CHECK_TIMEOUT);
    };

    const ioNear = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      ioNear.disconnect();
      void mount();
    }, { rootMargin: '600px 0px' });
    const io60 = new IntersectionObserver(([e]) => { vis60 = e.intersectionRatio >= 0.6; tryStart(); }, { threshold: [0, 0.6] });
    ioNear.observe(host); io60.observe(host);

    async function mount() {
      try {
        const { mountSquad } = await import('../player/squad');
        if (cancelled) return;
        canvas = document.createElement('canvas');
        canvas.className = 'lb-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        host!.append(canvas);
        r.actorOf.clear(); r.spawned.clear();
        cast.forEach((m, i) => r.actorOf.set(m.slot, i));
        r.h = mountSquad(canvas, {
          layout: kind,
          // phone pack = smaller textures and fewer triangles, chosen by the same breakpoint as the layout
          actors: cast.map((m) => ({ baseUrl: robloxAsset(kind === 'line' ? m.gen!.packs.desktop : m.gen!.packs.phone), slot: m.slot, accent: m.rgb, me: m.me })),
          onReady: () => { ready = true; tryStart(); },
          onSpawn: (i) => {
            const slot = cast[i].slot;
            r.spawned.add(slot);
            setSpawned(new Set(r.spawned));
            onCount(++ticks);                                  // 1/5 -> n/5 READY, one amber flash per step
            if (ticks === cast.length) window.setTimeout(() => !cancelled && onCount(null), 600);
          },
          onError: () => { if (!cancelled) toPosters(); },
        });
        tryStart();
      } catch {
        if (!cancelled) toPosters();                           // the chunk itself failed to load
      }
    }

    return () => {
      cancelled = true;
      ioNear.disconnect(); io60.disconnect(); clearTimeout(timer);
      r.h?.destroy();
      toPosters();
    };
  }, [kind, reduced, members, onCount]);

  // Tap on the canvas area: hit-test against the precomputed slot rects (no raycast, no per-frame DOM work).
  const onTap = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.lb-plate')) return;
    const b = e.currentTarget.getBoundingClientRect();
    const slot = slotAt(kind, (e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height);
    if (slot >= 0 && bySlot.has(slot)) wave(slot);
  };

  return (
    <Reveal>
      <div ref={hostRef} className="slot slot-card lb-stage" data-static="" onPointerDown={onTap}>
        <span aria-hidden="true" className="lb-word">Lobby</span>
        {Array.from({ length: SLOT_COUNT }, (_, s) => {
          const m = bySlot.get(s);
          if (!m) return <OpenSlot key={s} slot={s} />;
          return (
            <div key={s} className={cx('lb-slot', m.me && 'is-me')} data-slot={s} data-3d={spawned.has(s) ? '' : undefined} style={{ ...slotVars(s), '--accent': m.css } as CSSProperties}>
              <span className="lb-ring" aria-hidden="true" />
              <Poster member={m} />
              <div className="lb-plate">
                <button
                  type="button"
                  className="lb-plate-btn"
                  aria-label={`Wave at ${m.name}`}
                  onClick={() => wave(s)}
                  onPointerEnter={(e) => { if (e.pointerType === 'mouse') { highlight(s, true); wave(s); } }}
                  onPointerLeave={() => highlight(s, false)}
                  onFocus={() => { highlight(s, true); wave(s); }}
                  onBlur={() => highlight(s, false)}
                >
                  <span className="lb-plate-name">{m.name}</span>
                  {m.role && <span className="lb-plate-role">{m.role}</span>}
                </button>
                <ProfileLink member={m} className="lb-plate-link" />
              </div>
            </div>
          );
        })}
      </div>
    </Reveal>
  );
}
