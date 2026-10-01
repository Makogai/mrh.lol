// SPEC 7: framing is computed per resize, never per frame, and does not depend on the yaw.
import type { AvatarManifest } from './manifest';
import { mul } from './rig';

const FOV = (30 * Math.PI) / 180, ELEV = (8 * Math.PI) / 180;
const TAN = Math.tan(FOV / 2), SE = Math.sin(ELEV), CE = Math.cos(ELEV);

export interface Cam {
  vp: Float32Array; eye: Float32Array;
  aspect: number; px: number;      // px = studs per device pixel at the pedestal (keeps thin lines >= 1.25 px)
  eyeY: number; eyeZ: number;
}

export function makeCam(): Cam {
  return { vp: new Float32Array(16), eye: new Float32Array(3), aspect: 1, px: 0.01, eyeY: 0, eyeZ: 0 };
}

const P = new Float32Array(16), V = new Float32Array(16);

export function frame(c: Cam, m: AvatarManifest, aspect: number, bufH: number): void {
  const R = m.radiusXZ;
  const yLo = -0.85, yHi = m.bounds.max[1] + 0.12;       // room for the pedestal's front arc, then the horn tips
  const halfH = ((yHi - yLo) / 2) * 1.04, halfW = R * 1.06;
  // Whichever of height and width limits the fit, plus a margin for the turntable (any yaw fits).
  const dist = Math.max(halfH / TAN, halfW / (TAN * aspect)) + 0.35 * R;
  const ty = (yHi + yLo) / 2;
  c.aspect = aspect;
  c.eyeY = ty + dist * SE; c.eyeZ = dist * CE;
  c.eye[0] = 0; c.eye[1] = c.eyeY; c.eye[2] = c.eyeZ;
  c.px = (2 * dist * TAN) / bufH;
  const n = Math.max(0.1, dist - 2.5 * R), f = dist + 2.5 * R;
  P.fill(0);
  P[0] = 1 / (aspect * TAN); P[5] = 1 / TAN; P[10] = (f + n) / (n - f); P[11] = -1; P[14] = (2 * f * n) / (n - f);
  // view: rows are right (1,0,0), up (0,cos e,-sin e), back (0,sin e,cos e)
  V.fill(0);
  V[0] = 1; V[5] = CE; V[9] = -SE; V[6] = SE; V[10] = CE; V[15] = 1;
  V[13] = -(CE * c.eyeY - SE * c.eyeZ);
  V[14] = -(SE * c.eyeY + CE * c.eyeZ);
  mul(c.vp, 0, P, 0, V, 0);
}

/**
 * Model-space angle (atan2(z, x)) of the point where the cursor ray meets the pedestal plane. The model turns by
 * R_y(yaw), which moves a model angle a to a - yaw in world space, so model = world + yaw.
 */
export function groundAngle(c: Cam, gx: number, gy: number, yaw: number): number {
  const dx = gx * TAN * c.aspect;
  let dy = -SE + gy * TAN * CE;
  const dz = -CE - gy * TAN * SE;
  if (dy > -0.02) dy = -0.02; // cursor above the horizon: aim at a far point in that direction
  const t = -c.eyeY / dy;
  return Math.atan2(c.eyeZ + dz * t, dx * t) + yaw;
}
