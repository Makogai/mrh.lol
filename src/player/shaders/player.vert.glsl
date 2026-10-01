// SPEC 5.2 (normative math). GLSL ES 1.00: identical source for WebGL1 and WebGL2.
precision highp float;
attribute vec3 a_pos; attribute vec2 a_nrm; attribute vec2 a_uv; attribute vec4 a_skin;
uniform mat4 u_viewProj;
uniform mat4 u_bone[8];   // world matrix per bone (root yaw included), composed on the CPU every frame
uniform vec4 u_jq[8];     // local rotation per bone (quaternion, w >= 0)
uniform vec3 u_jp[8];     // bind-pose pivots, static
uniform vec3 u_posMin, u_posRange;
uniform vec2 u_uvMin, u_uvRange;
// Separate from the fragment's u_mode on purpose: the vertex stage is always highp, the fragment stage can fall
// back to mediump, and a uniform with different precision in the two stages fails to link.
uniform float u_vm;       // 2 = ground, anything else = avatar
varying vec3 v_world, v_nrm, v_bind;
varying vec2 v_uv;
varying float v_phase;

vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
vec3 octDecode(vec2 e) {
  vec3 n = vec3(e, 1.0 - abs(e.x) - abs(e.y));
  float t = max(-n.z, 0.0);
  n.x += n.x >= 0.0 ? -t : t;
  n.y += n.y >= 0.0 ? -t : t;
  return normalize(n);
}

void main() {
  vec3 p = u_posMin + a_pos * u_posRange;
  v_bind = p;                                    // bind pose: the scan front, noise and ground pattern must not animate
  vec4 world;
  if (u_vm > 1.5) {                              // the pedestal turns with the turntable (root)
    // Rotation only: the avatar levitates by translating the root, but the pedestal stays on the ground. (The root pivot is
    // the origin, so its matrix has no translation other than the levitation.)
    world = vec4((u_bone[0] * vec4(p, 0.0)).xyz, 1.0);
    v_nrm = vec3(0.0, 1.0, 0.0); v_uv = vec2(0.0); v_phase = 0.0;
  } else {
    vec3 n = octDecode(a_nrm * 2.0 - 1.0);
    int b = int(a_skin.x * 255.0 + 0.5);
    mat4 M;
    if (a_skin.z > 0.999) {
      M = u_bone[b];                             // rigid
    } else {
      // angle-weighted: nlerp(identity, q, w) about the pivot, then the parent's world matrix. Linear-blend skinning
      // collapses the shoulder at 140 degrees (cos 70 = 34 % of the radius); this keeps the distance to the pivot.
      float w = a_skin.z;
      vec4 q = normalize(vec4(u_jq[b].xyz * w, 1.0 - w + u_jq[b].w * w));
      vec3 c = u_jp[b];
      p = c + qrot(q, p - c);
      n = qrot(q, n);
      M = u_bone[int(a_skin.y * 255.0 + 0.5)];
    }
    world = M * vec4(p, 1.0);
    v_nrm = (M * vec4(n, 0.0)).xyz;              // GLSL ES 1.00 has no mat3(mat4)
    v_uv = u_uvMin + a_uv * u_uvRange;
    v_phase = a_skin.w;
  }
  v_world = world.xyz;
  gl_Position = u_viewProj * world;
}
