// SPEC 6.1: one spring, one ease. Everything reactive settles through the spring; scripted one-shots use the ease.

export const D2R = Math.PI / 180;
export const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);

/** cubic-bezier(0.16, 1, 0.3, 1). Newton is safe here: x'(t) stays > 0 on [0, 1] (0.48 at 0, 2.1 at 1). */
export function ease(u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  let t = u;
  for (let i = 0; i < 6; i++) {
    const m = 1 - t;
    t -= (3 * m * m * t * 0.16 + 3 * m * t * t * 0.3 + t * t * t - u) / (3 * m * m * 0.16 + 6 * m * t * 0.14 + 3 * t * t * 0.7);
  }
  t = clamp(t, 0, 1);
  return 3 * (1 - t) * (1 - t) * t + 3 * (1 - t) * t * t + t * t * t; // y1 = y2 = 1
}

const W0 = Math.sqrt(180), Z = 0.72, WD = W0 * Math.sqrt(1 - Z * Z);

/** A bank of springs sharing one set of coefficients: v = value, d = velocity, t = target. */
export interface Springs { v: Float64Array; d: Float64Array; t: Float64Array; step(dt: number): void }

export function makeSprings(n: number): Springs {
  const v = new Float64Array(n), d = new Float64Array(n), t = new Float64Array(n);
  return {
    v, d, t,
    // Exact closed form of the damped oscillator, so the result does not depend on the frame rate (and dt = 0 is a
    // no-op). exp/cos/sin are evaluated once per frame, not once per spring.
    step(dt) {
      const e = Math.exp(-Z * W0 * dt), c = Math.cos(WD * dt), s = Math.sin(WD * dt), k = Z * W0;
      for (let i = 0; i < n; i++) {
        const x0 = v[i] - t[i], v0 = d[i];
        v[i] = t[i] + e * (x0 * c + ((v0 + k * x0) / WD) * s);
        d[i] = e * (v0 * c - ((W0 * W0 * x0 + k * v0) / WD) * s);
      }
    },
  };
}
