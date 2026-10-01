// Skeleton maths on preallocated Float32Arrays (column-major, like GL). Nothing here allocates per call.

const T = new Float32Array(16);

/** o = a * b. Safe when o aliases a or b: the product goes through a scratch array. */
export function mul(o: Float32Array, oi: number, a: Float32Array, ai: number, b: Float32Array, bi: number): void {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      const k = bi + c * 4;
      T[c * 4 + r] = a[ai + r] * b[k] + a[ai + 4 + r] * b[k + 1] + a[ai + 8 + r] * b[k + 2] + a[ai + 12 + r] * b[k + 3];
    }
  }
  for (let i = 0; i < 16; i++) o[oi + i] = T[i];
}

/**
 * q = Ry(ey) * Rx(ex) * Rz(ez), i.e. SPEC 2's "q_yaw * q_pitch * q_roll" (roll applied first). Closed form so a
 * bone costs three sin/cos pairs and no intermediate quaternions. w is kept >= 0 because the shader nlerps from
 * identity and a negative w would take the long way round for blended vertices.
 */
export function euler(q: Float32Array, i: number, ex: number, ey: number, ez: number): void {
  const sx = Math.sin(ex / 2), cx = Math.cos(ex / 2);
  const sy = Math.sin(ey / 2), cy = Math.cos(ey / 2);
  const sz = Math.sin(ez / 2), cz = Math.cos(ez / 2);
  const px = cy * sx, py = sy * cx, pz = -sy * sx, pw = cy * cx; // Ry * Rx
  let x = px * cz + py * sz, y = py * cz - px * sz, z = pw * sz + pz * cz, w = pw * cz - pz * sz;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  q[i] = x; q[i + 1] = y; q[i + 2] = z; q[i + 3] = w;
}

/** o = T(c + t) * R(q) * T(-c): rotate about the pivot c, then translate by t. */
export function local(o: Float32Array, q: Float32Array, qi: number, c: Float32Array, ci: number, tx: number, ty: number, tz: number): void {
  const x = q[qi], y = q[qi + 1], z = q[qi + 2], w = q[qi + 3];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  const r00 = 1 - 2 * (yy + zz), r01 = 2 * (xy - wz), r02 = 2 * (xz + wy);
  const r10 = 2 * (xy + wz), r11 = 1 - 2 * (xx + zz), r12 = 2 * (yz - wx);
  const r20 = 2 * (xz - wy), r21 = 2 * (yz + wx), r22 = 1 - 2 * (xx + yy);
  const cx = c[ci], cy = c[ci + 1], cz = c[ci + 2];
  o[0] = r00; o[1] = r10; o[2] = r20; o[3] = 0;
  o[4] = r01; o[5] = r11; o[6] = r21; o[7] = 0;
  o[8] = r02; o[9] = r12; o[10] = r22; o[11] = 0;
  o[12] = cx + tx - (r00 * cx + r01 * cy + r02 * cz);
  o[13] = cy + ty - (r10 * cx + r11 * cy + r12 * cz);
  o[14] = cz + tz - (r20 * cx + r21 * cy + r22 * cz);
  o[15] = 1;
}
