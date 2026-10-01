// The lobby's fixed camera and slot table (V2_DESIGN section 5). One module, imported by BOTH the WebGL stage (lazy chunk) and the DOM
// (posters, plates, open-slot silhouettes in the main chunk), so the DOM is placed from the exact projection the GL draws with and
// nothing is synced per frame. Pure maths, no DOM, no allocation after module load.

export type LayoutKind = 'line' | 'v';
export const SLOT_COUNT = 5;
/** Left to right the slots are [3rd friend, 1st, ME, 2nd, 4th]: friends fill outward from the owner, alternating sides, so 2 friends sit either side of ME (spec order f2 f1 ME f3 f4 would put both on the left). */
export const ME_SLOT = 2;
export const FRIEND_SLOTS = [1, 3, 0, 4] as const;

/** World position of each slot, studs (x right, z towards the camera). Feet are on y = 0. */
export const SLOT_X: Record<LayoutKind, readonly number[]> = { line: [-6.8, -3.4, 0, 3.4, 6.8], v: [-4.6, -2.8, 0, 2.8, 4.6] };
export const SLOT_Z: Record<LayoutKind, readonly number[]> = { line: [-3, -1.5, 0, -1.5, -3], v: [-5.5, -3, 0, -3, -5.5] };
/** Canvas aspect (w / h) per layout. The host reserves exactly this with CSS aspect-ratio: 16:7 on desktop, 4:5 on phones. */
export const ASPECT: Record<LayoutKind, number> = { line: 16 / 7, v: 4 / 5 };
/** The reference avatar height (studs) that the poster and silhouette sizes are measured against. */
export const REF_HEIGHT = 7;

const D = Math.PI / 180;
// Fixed camera. Distances come from fitting the outermost slot plus a wing's reach horizontally and a 7-stud avatar vertically with
// room under the feet for the plate; FOV 28 / eye height 4.2 as specified for the line, raised for the V.
interface Cam { fov: number; eye: readonly [number, number, number]; target: readonly [number, number, number] }
export const CAMS: Record<LayoutKind, Cam> = {
  line: { fov: 28 * D, eye: [0, 4.2, 18.6], target: [0, 3.0, 0] },
  v: { fov: 30 * D, eye: [0, 9, 26], target: [0, 2.4, 0] },
};

const mul4 = (a: number[], b: number[]): number[] => {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};

/** Column-major view-projection for a layout at the given canvas aspect (defaults to the layout's own). */
export function viewProj(kind: LayoutKind, aspect = ASPECT[kind]): Float32Array {
  const { fov, eye, target } = CAMS[kind];
  let f = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
  const fl = Math.hypot(f[0], f[1], f[2]); f = f.map((v) => v / fl);
  let r = [f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0]; // f x up(0,1,0)
  const rl = Math.hypot(r[0], r[1], r[2]); r = r.map((v) => v / rl);
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]; // r x f
  const dot = (a: number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const V = [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, eye), -dot(u, eye), dot(f, eye), 1];
  const t = Math.tan(fov / 2), n = 1, fa = 120;
  const P = [1 / (aspect * t), 0, 0, 0, 0, 1 / t, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, (2 * fa * n) / (n - fa), 0];
  return Float32Array.from(mul4(P, V));
}

/** World point -> fraction of the canvas box, origin top-left, y down. */
export function project(kind: LayoutKind, x: number, y: number, z: number): { x: number; y: number } {
  const m = viewProj(kind);
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  return { x: (cx / cw) * 0.5 + 0.5, y: 0.5 - (cy / cw) * 0.5 };
}

export interface SlotBox {
  /** Feet centre, percent of the host box: where the plate is anchored. */
  feet: { x: number; y: number };
  /** The box a REF_HEIGHT avatar fills, percent of the host box: poster / silhouette placement and canvas-tap hit-test. */
  box: { left: number; top: number; width: number; height: number };
}

/** Static percent table per layout, computed once at module load. */
export const SLOT_BOXES: Record<LayoutKind, readonly SlotBox[]> = (['line', 'v'] as const).reduce(
  (acc, kind) => {
    acc[kind] = SLOT_X[kind].map((x, i) => {
      const z = SLOT_Z[kind][i];
      const feet = project(kind, x, 0, z), head = project(kind, x, REF_HEIGHT, z);
      const h = feet.y - head.y;
      // Aspect of the box: an avatar of height 7 is about 3.4 studs wide (a wing span is wider, hit-testing is generous on purpose).
      const edge = project(kind, x + 1.7, 0, z);
      const w = (edge.x - feet.x) * 2;
      return { feet: { x: feet.x * 100, y: feet.y * 100 }, box: { left: (feet.x - w / 2) * 100, top: head.y * 100, width: w * 100, height: h * 100 } };
    });
    return acc;
  },
  {} as Record<LayoutKind, readonly SlotBox[]>,
);

/** Which slot, if any, a tap at (fx, fy) in 0..1 of the host box lands on. Front slots win (they are drawn last). */
export function slotAt(kind: LayoutKind, fx: number, fy: number): number {
  let best = -1, bz = -Infinity;
  SLOT_BOXES[kind].forEach((s, i) => {
    const b = s.box;
    if (fx * 100 >= b.left && fx * 100 <= b.left + b.width && fy * 100 >= b.top && fy * 100 <= b.top + b.height && SLOT_Z[kind][i] > bz) { best = i; bz = SLOT_Z[kind][i]; }
  });
  return best;
}
