import { useCallback, type RefCallback } from 'react';

export interface MagneticOptions {
  /** Fraction of the pointer's offset-from-centre the element follows. */
  strength?: number;
  /** Hard clamp on the displacement, px. */
  max?: number;
}

/**
 * Magnetic pull for the two hero CTAs (PROMPT §5: "on the two primary buttons only, if at all").
 * Writes --mx/--my on the element; Button's transform and its spring transition do the actual movement, so the return
 * home after pointerleave is the same spring as a press. Only runs for a fine, hover-capable pointer with motion
 * allowed — touch has no hover and reduced-motion users get a still button.
 * Everything browser-specific happens inside the ref callback, i.e. after hydration (SSR-safe).
 */
export function useMagnetic<T extends HTMLElement>(enabled: boolean, opts: MagneticOptions = {}): RefCallback<T> {
  const { strength = 0.28, max = 8 } = opts;

  return useCallback<RefCallback<T>>((el) => {
    if (!el || !enabled) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let curX = 0;
    let curY = 0;
    let lastEvent: PointerEvent | null = null;
    let frame = 0;

    const clamp = (v: number) => Math.max(-max, Math.min(max, v));
    const apply = (x: number, y: number) => {
      curX = x;
      curY = y;
      el.style.setProperty('--mx', `${x.toFixed(2)}px`);
      el.style.setProperty('--my', `${y.toFixed(2)}px`);
    };

    const flush = () => {
      frame = 0;
      const e = lastEvent;
      if (!e) return;
      // getBoundingClientRect includes the current translate, so subtract it to get the resting centre — otherwise the
      // element chases its own displaced centre and jitters at the edges.
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2 - curX;
      const cy = r.top + r.height / 2 - curY;
      apply(clamp((e.clientX - cx) * strength), clamp((e.clientY - cy) * strength));
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      lastEvent = e;
      if (!frame) frame = requestAnimationFrame(flush);
    };
    const onLeave = () => {
      lastEvent = null;
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      apply(0, 0);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
      el.style.removeProperty('--mx');
      el.style.removeProperty('--my');
    };
  }, [enabled, strength, max]);
}
