// SPEC 5.3 (lit + halo), 5.4 (pedestal), 6.5 (scan). Constants are normative; do not "improve" them by eye.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_tex;
uniform vec4 u_mat;      // useTex, gloss, spec, emissive
uniform vec4 u_mat2;     // flat colour (sRGB), alpha cut
uniform vec3 u_eye;
uniform float u_mode;    // 0 lit, 1 halo, 2 ground
uniform vec4 u_fx;       // time, scan front (999 = off), ground intensity, studs per device px
uniform vec4 u_ground;   // Rg, pulse radius (Rg units), pulse intensity, cursor angle (model space)
uniform float u_cursorI;
varying vec3 v_world, v_nrm, v_bind;
varying vec2 v_uv;
varying float v_phase;

const float PI = 3.14159265; const float TAU = 6.2831853;
const vec3 KEY_DIR = vec3(-0.5164, 0.6761, 0.5164);  const vec3 KEY_COL = vec3(1.000, 0.800, 0.580); const float KEY_I = 1.9;
const vec3 RIM_DIR = vec3(0.7956, 0.3481, -0.4973);  const vec3 TEAL = vec3(0.045, 0.752, 0.639); const float RIM_I = 1.7;
const vec3 RIM2_DIR = vec3(-0.8638, 0.2032, -0.4573); const vec3 VIOLET = vec3(0.394, 0.263, 0.957); const float RIM2_I = 0.8;
const vec3 FILL_DIR = vec3(0.7062, -0.0504, 0.7062); const float FILL_I = 0.25;
const vec3 AMBER = vec3(1.000, 0.548, 0.060);
const vec3 SKY_AMB = vec3(0.0046, 0.0072, 0.0170) * 0.30;
const vec3 GND_AMB = vec3(1.000, 0.548, 0.060) * 0.005;
const vec3 PAGE = vec3(0.0010, 0.0019, 0.0050);   // linear #0b0e17, the card background (--bg-1)
const float BOUNCE_I = 0.6; const float BOUNCE_H = 2.2;

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
// pow(negative, 2.0) is undefined in GLSL and some D3D back-ends return NaN, so squares are written as x * x.
float sq(float x) { return x * x; }
// sin-free hashes: sin() on mediump GPUs is not stable
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Gaussian ring with a floor of ~1.25 device px so thin lines never alias away; the (w / we) factor keeps the energy.
float ring(float r, float rr, float w, float px, float Rg) { float we = max(w, 1.25 * px / Rg); return exp(-sq((r - rr) / we)) * (w / we); }

void main() {
  if (u_mode > 1.5) {
    vec2 q = v_bind.xz; float rs = length(q); float Rg = u_ground.x; float r = rs / Rg; float px = u_fx.w;
    float disc = exp(-r * r * 2.6) * 0.22;
    float lines = ring(r, 1.0, 0.012, px, Rg) * 0.55 + ring(r, 0.72, 0.008, px, Rg) * 0.28 + ring(r, 1.15, 0.006, px, Rg) * 0.20;
    float ang = atan(q.y, q.x); float sector = floor((ang + PI) / TAU * 18.0); float h = hash11(sector);
    float on = step(0.35, h); float len = 1.08 + 0.30 * h;
    float dAng = abs(mod(ang - ((sector + 0.5) / 18.0 * TAU - PI) + PI, TAU) - PI) * rs;
    float tw = max(0.012, 1.25 * px); float nw = max(0.03, 1.25 * px);
    float trace = on * step(1.0, r) * step(r, len) * exp(-sq(dAng / tw)) * (0.012 / tw) * 0.6
                + on * exp(-sq(length(vec2(dAng, (r - len) * Rg)) / nw)) * 0.9;
    float gp = 1.0 + (len - 1.0) * fract(u_fx.x * 0.22 + h * 7.0);
    trace *= 1.0 + 2.5 * on * exp(-sq((r - gp) * Rg / 0.05));
    trace *= 1.0 + 0.6 * u_cursorI * smoothstep(0.55, 0.0, abs(mod(ang - u_ground.w + PI, TAU) - PI));
    float fade = 1.0 - smoothstep(1.05, 1.42, r);
    float pulse = exp(-sq((r - u_ground.y) / 0.03)) * u_ground.z;
    vec3 glow = (AMBER * (disc + lines * 0.9 * fade + pulse) + TEAL * (trace * 0.7 * fade + pulse * 0.5)) * u_fx.z;
    vec2 e = q / vec2(0.95, 0.75); float shadow = exp(-dot(e, e) * 1.6) * 0.70;   // softer: the avatar floats
    glow *= 1.0 - shadow * 0.9;
    float alpha = shadow * 0.55 * (1.0 - clamp(r - 0.6, 0.0, 1.0)) * u_fx.z;
    // Premultiplied output: rgb is light added to the page, a is the shadow that darkens it. The browser blends in
    // sRGB space, but the look was validated compositing in LINEAR light over the page. Encoding the glow on its own
    // lifts every dim Gaussian tail to ~8/255 and the quad's edge shows. So encode glow + page together and subtract
    // the page's own encoding: what is left is exactly the light the linear composite would have added.
    vec3 base = PAGE * (1.0 - alpha);
    vec3 lit = max(pow(aces(glow) + base, vec3(1.0 / 2.2)) - pow(PAGE, vec3(1.0 / 2.2)) * (1.0 - alpha), 0.0);
    gl_FragColor = vec4(lit, alpha);
    return;
  }

  vec3 scan = vec3(0.0);
  if (u_fx.y < 90.0) {
    float hh = v_bind.y + 0.08 * (vnoise(v_bind.xz * 4.0 + vec2(v_bind.y * 1.3)) - 0.5);   // ragged front
    float d = u_fx.y - hh; if (d < 0.0) discard;
    float band = 1.0 - clamp(d / 0.45, 0.0, 1.0);
    float ln = 0.55 + 0.45 * step(0.5, fract(v_bind.y * 22.0 - u_fx.x * 3.0));
    scan = mix(AMBER, TEAL, band * band * band) * band * band * ln * 3.0 + TEAL * smoothstep(0.035, 0.0, d) * 4.0;
  }
  vec4 tx = texture2D(u_tex, v_uv);
  if (u_mat2.w > 0.0 && tx.a < u_mat2.w) discard;
  vec3 albedo = u_mat.x > 0.5 ? pow(tx.rgb, vec3(2.2)) : pow(u_mat2.rgb, vec3(2.2));   // sRGB decode here, not in the texture

  if (u_mode > 0.5) {
    vec3 c = albedo * mix(AMBER, TEAL, smoothstep(0.5, 6.5, v_bind.y)) * 0.55 * mix(0.35, 1.0, smoothstep(2.5, 5.0, v_bind.y)) * (0.70 + 0.30 * sin(u_fx.x * 2.3 + v_phase * 6.2832)) + scan;
    gl_FragColor = vec4(pow(aces(c), vec3(1.0 / 2.2)), 0.0);    // alpha 0 + additive blend = pure light
    return;
  }

  vec3 N = normalize(v_nrm); if (!gl_FrontFacing) N = -N;       // the sweater is cull 'none'
  vec3 V = normalize(u_eye - v_world); float nv = clamp(dot(N, V), 0.0, 1.0); float ndl = dot(N, KEY_DIR);
  float wrap = clamp((ndl + 0.3) / 1.3, 0.0, 1.0); float shin = exp2(1.0 + 9.0 * u_mat.y); vec3 H = normalize(KEY_DIR + V);
  float spec = pow(clamp(dot(N, H), 0.0, 1.0), shin) * (shin + 8.0) / 25.1327 * u_mat.z * 0.12 * clamp(ndl * 4.0, 0.0, 1.0);
  float fres = pow(1.0 - nv, 4.0);
  float rimM = 0.15 + 0.85 * clamp(dot(N, RIM_DIR) * 0.6 + 0.4, 0.0, 1.0);
  float rim2M = clamp(dot(N, RIM2_DIR) * 0.6 + 0.4, 0.0, 1.0);
  float fill = clamp((dot(N, FILL_DIR) + 0.2) / 1.2, 0.0, 1.0); float hemi = N.y * 0.5 + 0.5;
  float bounce = clamp(-N.y * 0.8 + 0.2, 0.0, 1.0) * (1.0 - smoothstep(0.0, BOUNCE_H, v_world.y));
  // Rim and spec are NOT multiplied by albedo: on black cloth light * albedo ~ 0 and the silhouette would vanish.
  vec3 col = albedo * (KEY_COL * KEY_I * wrap + VIOLET * FILL_I * fill + mix(GND_AMB, SKY_AMB, hemi) + AMBER * BOUNCE_I * bounce * u_fx.z)
           + KEY_COL * KEY_I * spec + TEAL * RIM_I * fres * rimM + VIOLET * RIM2_I * fres * rim2M + albedo * u_mat.w;
  col += scan;
  gl_FragColor = vec4(pow(aces(col), vec3(1.0 / 2.2)), 1.0);
}
