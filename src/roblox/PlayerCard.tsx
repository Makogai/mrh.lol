import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { TextLink } from '../components/TextLink';
import { site } from '../config/site';
import type { PlayerHandle } from '../player'; // type only: the player code itself is a lazy chunk
import { PresenceBadge } from './PresenceBadge';
import type { Pulse } from './PlayerTrace';
import { usePresence } from './usePresence';

type CardState = 'poster' | 'spawning' | 'live' | 'fallback';

// Transparent 1x1 GIF: the poster <img> needs a src before the card is near (an <img> without one shows its alt text).
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const BUBBLE_MS = 1500;
const HOVER_WAVE_GAP_MS = 8000;
const SRC = (file: string) => `${site.roblox.assetsBase}fallback/${file}`;
// Widest the poster is drawn per breakpoint (84 % of the card height x 300/440): 256 / 286 / 330 / 372 px.
const POSTER_SIZES = '(min-width:1920px) 372px, (min-width:1280px) 330px, (min-width:768px) 286px, 256px';

/** Save-Data, or a phone that is both low on cores and on memory: the 3D view is not worth ~370 KB there. */
function skip3d(): boolean {
  const n = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  return !!n.connection?.saveData || (navigator.hardwareConcurrency <= 2 && (n.deviceMemory ?? Infinity) <= 2);
}

/**
 * The player card. `data-state`: poster (SSR + first client render, identical) -> spawning -> live | fallback.
 * Until the 3D view is up the card shows the 2D render, so the card's aspect-ratio reserves all the space (CLS 0).
 * The canvas is created in the effect, never in JSX: a lost WebGL context cannot be reused, and StrictMode runs
 * effects twice.
 */
export function PlayerCard({ onPulse }: { onPulse?: (kind: Pulse['kind']) => void }) {
  const cfg = site.roblox;
  const [state, setState] = useState<CardState>('poster');
  const [near, setNear] = useState(false); // within ~one viewport: time to fetch the poster and start the 3D view
  const [reduced, setReduced] = useState<boolean | null>(null); // null until read: never touched during SSR
  const [waving, setWaving] = useState(false);
  const { presence, watchRef } = usePresence();

  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const handle = useRef<PlayerHandle | null>(null);
  const pendingWave = useRef(false);
  const lastHover = useRef(-Infinity);
  const pressing = useRef(false);
  const bubbleTimer = useRef(0);
  const onPulseRef = useRef(onPulse);
  onPulseRef.current = onPulse;

  const setCard = useCallback((el: HTMLDivElement | null) => {
    cardRef.current = el;
    return watchRef(el);
  }, [watchRef]);

  // Bubble + trace pulse: the visible half of a wave.
  const flash = useCallback(() => {
    setWaving(true);
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setWaving(false), BUBBLE_MS);
    onPulseRef.current?.('wave');
  }, []);
  useEffect(() => () => window.clearTimeout(bubbleTimer.current), []);

  // Reduced motion: read in an effect (SSR-safe). A change re-runs the mount effect below, which re-mounts the player.
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mql.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, []);

  // The one IntersectionObserver: ~one viewport away, fires once. It releases the poster image AND the 3D mount.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      setNear(true);
    }, { rootMargin: '100% 0px' });
    io.observe(card);
    return () => io.disconnect();
  }, []);

  // Mount: the lazy chunk, then a fresh canvas. Re-runs (a re-mount) when reduced motion flips.
  useEffect(() => {
    if (reduced === null || !near) return;
    if (skip3d()) { setState('fallback'); return; }
    const stage = stageRef.current;
    if (!stage) return;
    let cancelled = false;
    let canvas: HTMLCanvasElement | null = null;
    setState('poster');

    const fail = () => {
      if (cancelled) return;
      canvas?.remove();
      canvas = null;
      handle.current = null;
      setState('fallback');
    };
    const start = async () => {
      setState('spawning');
      try {
        const { mountPlayer } = await import('../player');
        if (cancelled) return;
        canvas = document.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        stage.append(canvas);
        const queued = pendingWave.current;
        handle.current = mountPlayer(canvas, {
          baseUrl: cfg.assetsBase,
          reducedMotion: reduced,
          onReady: () => {
            if (cancelled) return;
            setState('live');
            if (queued) flash(); // the player plays the queued wave right after its entrance
          },
          onError: (e) => { console.warn('[player]', e); fail(); },
        });
        // A "Say hi" pressed before the player existed is replayed now; the player queues it through the entrance.
        if (queued) { pendingWave.current = false; handle.current.wave(); }
      } catch (e) {
        console.warn('[player]', e);
        fail();
      }
    };

    void start();

    return () => {
      cancelled = true;
      handle.current?.destroy();
      handle.current = null;
      canvas?.remove();
    };
  }, [reduced, near, cfg.assetsBase, flash]);

  const sayHi = () => {
    if (handle.current) { handle.current.wave(); flash(); }
    else pendingWave.current = true; // replayed (with its bubble) once the player is ready
  };

  // Teal pulse on a real presence change (known -> different known), never on the first load.
  const seenRev = useRef(presence.rev);
  useEffect(() => {
    if (presence.rev === seenRev.current) return;
    seenRev.current = presence.rev;
    onPulseRef.current?.('presence');
  }, [presence.rev]);

  // Hover wave: precise pointers only, at most once per 8 s, never mid-drag, only while the 3D view is live.
  useEffect(() => {
    const up = () => { pressing.current = false; };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, []);
  const onPointerEnter = () => {
    if (state !== 'live' || pressing.current || !handle.current) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const now = performance.now();
    if (now - lastHover.current < HOVER_WAVE_GAP_MS) return;
    lastHover.current = now;
    handle.current.wave();
    flash();
  };

  const game = cfg.presence === 'game' && presence.kind === 'game' && presence.placeId ? presence.placeId : null;

  return (
    <div
      ref={setCard}
      data-state={state}
      data-waving={waving || undefined}
      onPointerEnter={onPointerEnter}
      onPointerDown={() => { pressing.current = true; }}
      className="pl-card"
    >
      <div ref={stageRef} className="pl-stage" />
      {/* 2D render: the poster before the 3D view loads, and the whole card when it never does. Its alt text stays in the
          accessibility tree even after it fades out, because the canvas is decorative (aria-hidden). */}
      <picture className="pl-poster">
        {near && <source type="image/avif" srcSet={`${SRC('avatar-150x220.avif')} 150w, ${SRC('avatar-300x440.avif')} 300w`} sizes={POSTER_SIZES} />}
        {near && <source type="image/webp" srcSet={`${SRC('avatar-150x220.webp')} 150w, ${SRC('avatar-300x440.webp')} 300w`} sizes={POSTER_SIZES} />}
        {/* Chrome lazy-loads <img loading="lazy"> from ~1250 px away, which here is ~1000 px under the fold: the poster
            would be fetched on load. So the real URLs are only handed over when the card is one viewport away (same
            observer as the 3D mount); the server render and the first client render both carry the blank. */}
        <img
          src={near ? SRC('avatar-300x440.png') : BLANK}
          srcSet={near ? `${SRC('avatar-150x220.png')} 150w, ${SRC('avatar-300x440.png')} 300w` : undefined}
          sizes={near ? POSTER_SIZES : undefined}
          width={300}
          height={440}
          loading="lazy"
          decoding="async"
          alt={cfg.card.posterAlt}
        />
      </picture>
      {/* Without JS nothing would ever release the poster. (React renders <noscript> on the server only.) */}
      <noscript>
        <picture className="pl-poster">
          <source type="image/avif" srcSet={`${SRC('avatar-150x220.avif')} 150w, ${SRC('avatar-300x440.avif')} 300w`} sizes={POSTER_SIZES} />
          <img src={SRC('avatar-300x440.png')} width={300} height={440} alt="" />
        </picture>
      </noscript>

      <div className="pl-label">
        <p className="font-mono text-xs tracking-label">
          <span className="uppercase text-amber-400">{cfg.card.kicker}</span>
          <span className="text-ink-300"> · {cfg.username}</span>
        </p>
        <PresenceBadge presence={presence} neutral={cfg.card.neutralBadge} className="mt-2" />
      </div>

      <p aria-hidden="true" className="pl-bubble">hi!</p>

      <div className="pl-actions">
        {/* Nothing to wave at without the 3D view, and without JS the button could not work either (html:not(.js) in CSS). */}
        {state !== 'fallback' && <Button size="md" onClick={sayHi} className="pl-hi">{cfg.card.sayHi}</Button>}
        {/* Same slot, so a status change never shifts the layout: in 'game' mode, while in a game, it points at the game. */}
        <TextLink
          external
          href={game ? `https://www.roblox.com/games/${game}` : cfg.profileUrl}
          className="pl-link"
        >
          {game ? cfg.card.viewGame : cfg.card.viewProfile}
        </TextLink>
      </div>
    </div>
  );
}
