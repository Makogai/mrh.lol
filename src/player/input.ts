// Pointer tracking (SPEC 6.3) and drag / tap (SPEC 6.4). Listeners only write plain numbers; the frame reads them.
import { D2R, clamp } from './motion';

export interface Input {
  has: boolean; touch: boolean; at: number;  // a pointer is known / it is a touch / its last event time (performance.now)
  cx: number; cy: number;                    // last client position
  nx: number; ny: number;                    // look offset, -1..1 relative to half the window
  gx: number; gy: number;                    // cursor in canvas NDC (can exceed 1), for the pedestal glow
  over: boolean;                             // cursor is inside the canvas rect
  w: number;                                 // canvas CSS width
  mode: 0 | 1 | 2 | 4;                       // idle, dragging, inertia, spring-back
  yaw: number; vel: number;                  // drag yaw (rad) and its velocity (rad/s)
}

export interface InputHooks {
  tap(): void;
  /** A grab begins: sync the drag yaw with whatever the spring-back has reached. */
  grab(): void;
  /** Hand the drag yaw to the spring. v = release velocity in rad/s (0 for a cancel). */
  release(v: number): void;
}

export function attachInput(canvas: HTMLCanvasElement, hooks: InputHooks, rm: boolean) {
  const s: Input = { has: false, touch: false, at: 0, cx: 0, cy: 0, nx: 0, ny: 0, gx: 0, gy: 0, over: false, w: 1, mode: 0, yaw: 0, vel: 0 };
  let sx = 0, sy = 0, st = 0, lx = 0, lt = 0;

  // The rect is read per event, not per frame: a frame-rate layout read would be wasted work while the pointer is still.
  const track = () => {
    const r = canvas.getBoundingClientRect(), hw = r.width / 2, hh = r.height / 2;
    const dx = s.cx - (r.left + hw), dy = s.cy - (r.top + hh);
    s.w = r.width || 1;
    s.nx = clamp(dx / (innerWidth / 2), -1, 1); s.ny = clamp(dy / (innerHeight / 2), -1, 1);
    s.gx = dx / hw; s.gy = -dy / hh;
    s.over = Math.abs(dx) < hw && Math.abs(dy) < hh;
  };
  const move = (e: PointerEvent) => {
    s.cx = e.clientX; s.cy = e.clientY; s.has = true; s.touch = e.pointerType === 'touch'; s.at = performance.now();
    track();
  };
  const leave = () => { s.has = false; s.over = false; };
  const scroll = () => { if (s.has) track(); };

  const down = (e: PointerEvent) => {
    if (!e.isPrimary || e.button) return;
    canvas.setPointerCapture(e.pointerId);
    if (!rm) canvas.style.cursor = 'grabbing';
    // A new grab takes over from inertia or the spring-back: the yaw is whatever is on screen right now.
    hooks.grab();
    s.mode = 1; s.vel = 0;
    sx = lx = e.clientX; sy = e.clientY; st = lt = e.timeStamp;
  };
  const drag = (e: PointerEvent) => {
    if (s.mode !== 1 || rm) return;
    const dY = ((e.clientX - lx) * 200 * D2R) / s.w;
    lx = e.clientX;
    s.yaw += dY;
    const dt = Math.max((e.timeStamp - lt) / 1000, 0.004);
    lt = e.timeStamp;
    s.vel += 0.35 * (dY / dt - s.vel);
  };
  const up = (e: PointerEvent, cancelled: boolean) => {
    if (s.mode !== 1) return;
    if (!rm) canvas.style.cursor = 'grab';
    if (!cancelled && Math.hypot(e.clientX - sx, e.clientY - sy) < 6 && e.timeStamp - st < 350) {
      hooks.tap(); hooks.release(0); return;
    }
    // A pointer that sat still before release must not fling on stale velocity.
    const v = cancelled || e.timeStamp - lt > 100 ? 0 : clamp(s.vel, -720 * D2R, 720 * D2R);
    if (Math.abs(v) < 25 * D2R) hooks.release(v); else { s.mode = 2; s.vel = v; }
  };
  const onUp = (e: PointerEvent) => up(e, false), onCancel = (e: PointerEvent) => up(e, true);

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', drag);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  if (!rm) {
    if (!rm) canvas.style.cursor = 'grab';
    // vertical swipes keep scrolling the page, horizontal ones become drags. pinch-zoom stays allowed (WCAG 1.4.4): the
    // browser then takes the gesture and fires pointercancel, which releases the drag without inertia.
    canvas.style.touchAction = 'pan-y pinch-zoom';
    addEventListener('pointermove', move, { passive: true });
    addEventListener('scroll', scroll, { passive: true });
    addEventListener('blur', leave);
    document.documentElement.addEventListener('pointerleave', leave);
  }
  return {
    s,
    detach() {
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', drag);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onCancel);
      removeEventListener('pointermove', move); removeEventListener('scroll', scroll); removeEventListener('blur', leave);
      document.documentElement.removeEventListener('pointerleave', leave);
    },
  };
}
