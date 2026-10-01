// mountSquad: the lobby stage. ONE WebGL context, ONE rAF, one shared avatar program; each actor owns its buffers, textures and spring bank.
// Public entry, lazily imported by src/squad/Lobby.tsx (V2_DESIGN section 5). The camera is fixed (src/squad/layout.ts): no orbit, no pointer look-at.
//
//   const { mountSquad } = await import('../player/squad');
//   const h = mountSquad(canvas, { actors, layout, onSpawn, onReady, onError });
//   h.start();        // the ready check: actors materialise left to right, 180 ms apart
//   h.wave(i); h.highlight(i, true); h.setActive(false); h.destroy();
//
// The 3D is an upgrade over the 2D posters the page already shows, so every failure path ends in onError (or onActor(i, false)) and the host
// keeps the posters. onError is never synchronous and, once it has fired, everything is already released.
import { load, type Loaded } from './load';
import type { AvatarManifest } from './manifest';
import { createProgram, createRenderer, type GL, type Prog, type Renderer } from './gl';
import { perr } from './err';
import { D2R, clamp, ease, makeSprings, type Springs } from './motion';
import { euler, local, mul } from './rig';
import { SLOT_X, SLOT_Z, viewProj, CAMS, type LayoutKind } from '../squad/layout';

export interface SquadActorSpec {
  baseUrl: string;                       // folder with avatar.json (desktop or phone pack), ends with '/'
  slot: number;                          // 0..4, see src/squad/layout.ts
  accent: [number, number, number];      // floor ring colour, sRGB 0..1
  me?: boolean;                          // the owner: shifts weight now and then
}
export interface SquadOptions {
  actors: SquadActorSpec[];
  layout: LayoutKind;
  onActor?(i: number, ok: boolean): void; // one actor finished loading (false: skipped, its poster stays)
  onReady?(): void;                       // every actor resolved and at least one is usable
  onSpawn?(i: number): void;              // the actor's scan starts: crossfade its poster out
  onError?(e: unknown): void;             // once; WebGL unavailable, nothing loaded, context lost, or 'perf'
  onStats?(s: SquadStats): void;          // ~1 Hz, for debug overlays and tests
}
export interface SquadHandle {
  start(staggerMs?: number): void;        // begin the ready check (idempotent)
  wave(i: number): void;
  highlight(i: number, on: boolean): void;
  setActive(active: boolean): void;
  destroy(): void;
}
export interface SquadStats { fps: number; cpuMs: number; dpr: number; width: number; height: number; draws: number; triangles: number; frames: number; actors: number; running: boolean }

const TAU = Math.PI * 2;
// spring slots (same bank layout as the single-avatar card; CI is the floor ring brightness here)
const TY = 0, HY = 1, HP = 2, HR = 3, AR = 4, DR = 5, CI = 6;
const ENT_END = 1.6, SCAN_T0 = 0.2, SCAN_DUR = 1.25;
const FLOOR_VS = `precision highp float;attribute vec2 a_xz;uniform mat4 u_vp;varying vec2 v_xz;void main(){v_xz=a_xz;gl_Position=u_vp*vec4(a_xz.x,0.0,a_xz.y,1.0);}`;
// The floor (about 40 lines in the spec; this is the compact form): an 8-stud grid at teal 6 %, an amber pool and a contact shadow under each
// occupied slot, a per-slot accent ring whose brightness is the highlight/spawn state, and one expanding ring for the all-ready pulse.
// Output is premultiplied: rgb is light ADDED to the page (alpha 0), alpha only carries the contact shadow, exactly like the card's pedestal.
// Colours are written in display space so every Gaussian tail reaches exactly 0 and the quad edge never shows.
const FLOOR_FS = `precision highp float;varying vec2 v_xz;uniform vec4 u_slot[5];uniform vec3 u_acc[5];uniform vec2 u_pulse;uniform float u_dist;
const vec3 TEAL=vec3(0.243,0.878,0.816);const vec3 AMBER=vec3(1.0,0.76,0.28);
float ln(float p,float w){float d=abs(fract(p-0.5)-0.5);return 1.0-smoothstep(w,w*2.0,d);}
void main(){
  vec3 c=vec3(0.0);float sh=0.0;
  float g=max(ln(v_xz.x/8.0,0.012),ln(v_xz.y/8.0,0.012))*0.06+max(ln(v_xz.x/2.0,0.02),ln(v_xz.y/2.0,0.02))*0.012;
  float fade=(1.0-smoothstep(7.0,13.5,abs(v_xz.x)))*(1.0-smoothstep(1.5,8.0,-v_xz.y))*(1.0-smoothstep(3.0,5.0,v_xz.y));
  c+=TEAL*g*fade;
  for(int i=0;i<5;i++){
    vec4 s=u_slot[i];float d=length(v_xz-s.xy);
    float pool=exp(-d*d/3.2)*0.20;
    float ring=exp(-pow((d-2.15)/0.06,2.0))*0.9*s.w;
    float pr=u_pulse.y>0.0?exp(-pow((d-(1.2+2.6*u_pulse.x))/0.1,2.0))*(1.0-u_pulse.x)*1.1:0.0;
    c+=(AMBER*pool*0.9+u_acc[i]*(ring+pr))*s.z;
    sh+=exp(-d*d/1.1)*0.5*s.z;
  }
  float a=clamp(sh,0.0,0.6);
  gl_FragColor=vec4(c*(1.0-a),a);
}`;

interface Actor {
  spec: SquadActorSpec; idx: number;
  man?: AvatarManifest; R?: Renderer; sp: Springs; pivots: Float32Array; par: number[];
  loaded?: Loaded; failed: boolean;
  off: number;                // idle phase offset, seconds (so five avatars never breathe in unison)
  spawnT: number;             // sim time at which the scan starts (Infinity until start() scheduled it)
  ent: number;                // entrance clock, -1 before spawn
  waveT: number; waveQ: boolean; boost: number; phW: number; a0: number;
  hop: number;                // squash-free "hello" for avatars without a separable arm
  canWave: boolean;
  nextGlance: number; glanceUntil: number; glanceDir: number;
  hl: number;                 // highlight target 0..1 (plate hover / focus)
  yaw0: number;               // resting turn towards the middle of the line, radians
}

export function mountSquad(canvas: HTMLCanvasElement, opts: SquadOptions): SquadHandle {
  const kind = opts.layout;
  const ac = new AbortController();
  const L = new Float32Array(16);
  const vp = viewProj(kind), eye = Float32Array.from(CAMS[kind].eye);
  const xs = SLOT_X[kind], zs = SLOT_Z[kind];
  const actors: Actor[] = opts.actors.map((spec, idx) => ({
    spec, idx, sp: makeSprings(7), pivots: new Float32Array(24), par: [], failed: false,
    off: Math.random() * 3.6, spawnT: Infinity, ent: -1, waveT: -1, waveQ: false, boost: 0, phW: 0, a0: 0, hop: -1, canWave: false,
    nextGlance: 4 + Math.random() * 6, glanceUntil: -1, glanceDir: 0, hl: 0, yaw0: -0.06 * xs[spec.slot],
  }));
  // draw order: nearest first for early-z; every opaque pass, then every halo pass
  const order = [...actors].sort((a, b) => zs[b.spec.slot] - zs[a.spec.slot]);

  let dead = false, started = false, ready = false, lost = false, active = true, inView = false, readyFired = false;
  let vis = document.visibilityState === 'visible';
  let gl: GL | null, prog: Prog, floorProg: WebGLProgram, floorBuf: WebGLBuffer, FL: Record<string, WebGLUniformLocation | null> = {};
  let raf = 0, last = -1, statTimer = 0, lostTimer = 0;
  let cssW = 0, cssH = 0, rdpr = devicePixelRatio || 1, dprCap = kind === 'v' ? 1.5 : 2, stage = 0, ema = 16.7, slow = 0;
  let t = 0, pulseT = -1, pulseDone = false;
  let fN = 0, cSum = 0, tStat = 0, frames = 0, bufW = 0, bufH = 0, dprNow = 1;
  const slotU = new Float32Array(20), accU = new Float32Array(15);

  const A: WebGLContextAttributes = {
    alpha: true, premultipliedAlpha: true, antialias: true, depth: true, stencil: false,
    preserveDrawingBuffer: false, powerPreference: 'low-power',
    // Software GL would burn the battery on ~20k skinned triangles: those machines keep the 2D posters.
    failIfMajorPerformanceCaveat: true,
  };
  const gl2 = canvas.getContext('webgl2', A);
  gl = gl2 || canvas.getContext('webgl', A);

  function kill(): void {
    if (dead) return;
    dead = true; ready = false;
    ac.abort();
    cancelAnimationFrame(raf); raf = 0;
    clearInterval(statTimer); clearTimeout(lostTimer);
    io.disconnect(); ro.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    for (const a of actors) { a.R?.release(); a.loaded?.tex.forEach((b) => (b as ImageBitmap).close?.()); }
    prog?.release();
    if (gl && floorProg) { gl.deleteProgram(floorProg); gl.deleteBuffer(floorBuf); }
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
  const wrap = (e: unknown, code: 'shader' | 'decode'): unknown => (e && (e as Error).name === 'PlayerError' ? e : perr(code, String((e && (e as Error).message) || e), e));
  function fail(e: unknown): void {
    if (dead) return;
    kill();
    queueMicrotask(() => opts.onError?.(e));   // never synchronous: the host is still wiring things up
  }

  // ---- run state ----
  function sync(): void {
    const go = ready && started && active && inView && vis && !lost && !dead;
    if (go && !raf) { last = -1; raf = requestAnimationFrame(tick); }
    else if (!go && raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  const onVis = () => { vis = document.visibilityState === 'visible'; sync(); };
  const io = new IntersectionObserver((es) => { inView = es[es.length - 1].isIntersecting; sync(); });
  const ro = new ResizeObserver((es) => {
    const r = es[es.length - 1].contentRect; cssW = r.width; cssH = r.height; rdpr = devicePixelRatio || 1;
    if (ready && !lost) { resize(); renderNow(); }
  });
  function onLost(e: Event): void {
    e.preventDefault();
    if (dead || lost) return;
    lost = true; sync();
    lostTimer = window.setTimeout(() => fail(perr('context-lost', 'not restored in 3 s')), 3000);
  }
  function onRestored(): void {
    if (dead || !lost) return;
    clearTimeout(lostTimer);
    try { initGL(); } catch (e) { fail(wrap(e, 'shader')); return; }
    lost = false; resize(); renderNow(); sync();
  }

  function initGL(): void {
    const g = gl!;
    prog = prog || createProgram(g);
    prog.init();
    const sh = (type: number, src: string) => {
      const s = g.createShader(type)!; g.shaderSource(s, src); g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw perr('shader', g.getShaderInfoLog(s) || 'floor compile failed');
      return s;
    };
    const vs = sh(g.VERTEX_SHADER, FLOOR_VS), fs = sh(g.FRAGMENT_SHADER, FLOOR_FS);
    floorProg = g.createProgram()!;
    g.attachShader(floorProg, vs); g.attachShader(floorProg, fs); g.bindAttribLocation(floorProg, 0, 'a_xz'); g.linkProgram(floorProg);
    if (!g.getProgramParameter(floorProg, g.LINK_STATUS)) throw perr('shader', g.getProgramInfoLog(floorProg) || 'floor link failed');
    g.deleteShader(vs); g.deleteShader(fs);
    FL = {};
    for (const n of ['u_vp', 'u_slot', 'u_acc', 'u_pulse']) FL[n] = g.getUniformLocation(floorProg, n);
    floorBuf = g.createBuffer()!; g.bindBuffer(g.ARRAY_BUFFER, floorBuf);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-14, -10, 14, -10, -14, 5, 14, 5]), g.STATIC_DRAW);
    for (const a of actors) if (a.R) a.R.init();
    g.frontFace(g.CCW); g.clearColor(0, 0, 0, 0);
  }

  if (!gl) {
    fail(perr('webgl-unavailable', 'no WebGL context'));
  } else {
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    document.addEventListener('visibilitychange', onVis);
    io.observe(canvas); ro.observe(canvas);
    try { initGL(); } catch (e) { fail(wrap(e, 'shader')); }
    if (!dead) void loadAll();
  }

  /** P1 first, then the friends one after another: the bandwidth goes to the avatar the visitor is looking at. */
  async function loadAll(): Promise<void> {
    let ok = 0, firstErr: unknown;
    for (const a of actors) {
      if (dead) return;
      try {
        a.loaded = await load(a.spec.baseUrl, ac.signal);
        if (dead) return;
        boot(a); ok++;
        if (!ready && !firstFrame()) return;
        opts.onActor?.(a.idx, true);
      } catch (e) {
        if (ac.signal.aborted || dead) return;
        a.failed = true; firstErr ??= e;
        opts.onActor?.(a.idx, false);
      }
    }
    if (dead) return;
    if (!ok) { fail(wrap(firstErr, 'decode')); return; }
    queueMicrotask(() => { if (!dead && !readyFired) { readyFired = true; opts.onReady?.(); } });
  }

  /** The stage can run as soon as ONE actor is on the GPU; the others join while it runs. False = the context is unusable. */
  function firstFrame(): boolean {
    if (!cssW) { cssW = canvas.clientWidth || 640; cssH = canvas.clientHeight || 280; }
    resize(); renderNow();
    const ge = gl!.getError();
    if (ge && !gl!.isContextLost()) { fail(perr('shader', 'GL error 0x' + ge.toString(16))); return false; }
    ready = true;
    if (opts.onStats) { tStat = performance.now(); statTimer = window.setInterval(stats, 1000); }
    sync();
    return true;
  }

  function boot(a: Actor): void {
    const l = a.loaded!;
    if (lost || gl!.isContextLost()) throw perr('context-lost', 'lost while loading');
    a.man = l.man;
    a.par = l.man.bones.map((b) => b.parent);
    l.man.bones.forEach((b, i) => a.pivots.set(b.pivot, i * 3));
    a.R = createRenderer(gl!, l.man, l.bin, l.tex, prog);
    a.R.init();
    a.canWave = l.man.bones[3].vertexCount > 0;           // armR owns vertices: it can really wave
    a.R.vp.set(vp); a.R.eye.set(eye);
    if (started) a.spawnT = t + 0.18;                     // a straggler joins the ready check late
  }

  // ---- size ----
  function resize(): void {
    // The fill-rate cap is ~1.6 megapixels for the whole stage: five avatars share it.
    let d = Math.min(rdpr, dprCap);
    const mp = cssW * cssH * d * d;
    if (mp > 1.6e6) d *= Math.sqrt(1.6e6 / mp);
    bufW = Math.max(1, Math.round(cssW * d)); bufH = Math.max(1, Math.round(cssH * d));
    if (canvas.width !== bufW || canvas.height !== bufH) { canvas.width = bufW; canvas.height = bufH; }
    dprNow = d;
    const m = viewProj(kind, cssW / Math.max(cssH, 1));
    vp.set(m);
    for (const a of actors) a.R?.vp.set(vp);
  }

  // ---- motion ----
  function schedule(staggerMs: number): void {
    const left = actors.filter((a) => a.R).sort((a, b) => a.spec.slot - b.spec.slot);
    left.forEach((a, k) => { a.spawnT = t + 0.05 + (k * staggerMs) / 1000; });
  }
  function spawnWave(a: Actor): void { a.waveT = 0; a.waveQ = false; a.a0 = a.sp.v[AR]; a.hop = a.canWave ? -1 : 0; }

  function update(a: Actor, dt: number): void {
    const sp = a.sp, T = t + a.off;
    if (a.ent < 0 && t >= a.spawnT) {
      a.ent = 0;
      opts.onSpawn?.(a.idx);
    } else if (a.ent >= 0 && a.ent < ENT_END) a.ent = Math.min(ENT_END, a.ent + dt);
    if (a.ent < 0) return;
    const entDone = a.ent >= ENT_END;
    if (entDone && a.waveQ) spawnWave(a);

    // glance at a neighbour every 6-10 s: head leads, shoulders follow (yaw spring), then back to rest
    if (entDone && t >= a.nextGlance) {
      const others = actors.filter((o) => o !== a && o.R && o.ent >= 0);
      if (others.length) { const o = others[Math.floor(Math.random() * others.length)]; a.glanceDir = Math.sign(xs[o.spec.slot] - xs[a.spec.slot]) || 1; a.glanceUntil = t + 1.5; }
      a.nextGlance = t + 6 + Math.random() * 4;
    }
    const gl_ = t < a.glanceUntil ? a.glanceDir : 0;
    sp.t[DR] = gl_ * 12 * D2R; sp.t[HY] = gl_ * 24 * D2R; sp.t[TY] = gl_ * 6 * D2R; sp.t[HP] = 0;
    sp.t[HR] = a.waveT >= 0 && a.waveT < 1.4 ? 6 * D2R : 0;
    sp.t[AR] = 2 * D2R + 0.8 * D2R * Math.sin((TAU * T) / 3.6);
    // the floor ring is bright while materialising, while waving and while its plate is hovered, then settles to its resting level
    sp.t[CI] = a.hl > 0 || a.ent < ENT_END || (a.waveT >= 0 && a.waveT < 1.3) ? 1 : 0;
    sp.step(dt);

    // wave: scripted up to 1.22 s, then the spring carries position and velocity on (same shape as the single-avatar card)
    if (a.waveT >= 0) {
      a.waveT += dt;
      if (a.canWave) {
        if (a.waveT < 0.32) { sp.v[AR] = a.a0 + (140 * D2R - a.a0) * ease(a.waveT / 0.32); sp.d[AR] = 0; }
        else if (a.waveT < 1.22) {
          const ph = (TAU * (a.waveT - 0.32)) / 0.3;
          sp.v[AR] = 140 * D2R + 14 * D2R * Math.sin(ph); sp.d[AR] = 14 * D2R * (TAU / 0.3) * Math.cos(ph);
        } else if (a.waveT - dt < 1.22) { sp.v[AR] = 140 * D2R; sp.d[AR] = 14 * D2R * (TAU / 0.3); }
      } else a.hop = a.waveT < 0.6 ? Math.sin((Math.PI * a.waveT) / 0.6) : -1;   // rigid avatars: a hop and a nod instead of a wave
      if (a.waveT >= 1.4) { a.waveT = -1; a.hop = -1; }
    }
    a.boost = a.waveT >= 0 && a.waveT < 1.2 ? 1 : a.boost * Math.exp(-3 * dt);
    a.phW += (TAU * dt * (1 + 0.6 * a.boost)) / 2.6;
  }

  function pose(a: Actor, scan: number): void {
    const R = a.R!, sp = a.sp, jq = R.jq, T = t + a.off;
    const bth = Math.sin((TAU * T) / 3.6), roll = D2R * Math.sin((TAU * T) / 7.2), swing = 1.5 * D2R * bth;
    const abdL = 2 * D2R + 0.8 * D2R * bth;
    const wa = 4 * D2R * (1 + 1.5 * a.boost), lift = wa * Math.sin(a.phW), fold = 0.75 * wa * Math.sin(a.phW + 0.6);
    const slot = a.spec.slot;
    euler(jq, 0, 0, a.yaw0 + sp.v[DR], 0);
    euler(jq, 4, -0.5 * D2R * bth, sp.v[TY], roll);
    euler(jq, 8, -(sp.v[HP] + (a.hop > 0 ? -0.18 * a.hop : 0) + 0.6 * D2R * Math.sin((TAU * T) / 3.6 - 0.8)), sp.v[HY], sp.v[HR] - 0.6 * roll);
    euler(jq, 12, -swing, 0, -sp.v[AR]);
    euler(jq, 16, swing, 0, abdL);
    euler(jq, 20, 0, -fold, -lift);
    euler(jq, 24, 0, fold, lift);
    euler(jq, 28, -2 * D2R * Math.sin((TAU * T) / 3.1), 7 * D2R * Math.sin((TAU * T) / 4.2) + 2.5 * D2R * Math.sin((TAU * T) / 1.7 + 1), 0);
    const shift = a.spec.me ? 0.05 * Math.sin((TAU * T) / 11) ** 3 : 0;   // P1 occasionally shifts weight: a cubed sine is flat most of the time
    for (let b = 0; b < 8; b++) {
      // the root carries the slot position: a pure translation, because the root pivot is the origin
      local(L, jq, b * 4, a.pivots, b * 3, b === 0 ? xs[slot] + shift : 0, (b === 0 ? 0.02 + 0.28 * Math.max(a.hop, 0) : 0) + (b === 1 ? 0.035 * bth : 0), b === 0 ? zs[slot] : 0);
      if (a.par[b] < 0) for (let k = 0; k < 16; k++) R.bones[b * 16 + k] = L[k];
      else mul(R.bones, b * 16, R.bones, a.par[b] * 16, L, 0);
    }
    const f = R.fx;
    f[0] = t; f[1] = scan; f[2] = 1; f[3] = 0.01;
  }

  // ---- draw ----
  function renderNow(): void {
    if (dead || lost) return;
    const g = gl!;
    for (const a of actors) {
      if (!a.R || a.ent < 0) continue;                    // before its spawn an actor is neither posed nor drawn
      const su = clamp((a.ent - SCAN_T0) / SCAN_DUR, 0, 1);
      pose(a, a.ent >= ENT_END ? 999 : -0.15 + (a.man!.bounds.max[1] + 0.6) * su * su * (3 - 2 * su));
    }
    g.viewport(0, 0, bufW, bufH);
    g.depthMask(true);
    g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);

    // 1. floor: no depth, premultiplied blend
    g.useProgram(floorProg);
    g.disable(g.DEPTH_TEST); g.disable(g.CULL_FACE); g.depthMask(false);
    g.enable(g.BLEND); g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
    actors.forEach((a, i) => {
      const present = a.R && a.ent >= 0 ? clamp(a.ent / 0.6, 0, 1) : 0;
      const ring = 0.3 + 0.7 * clamp(a.sp.v[CI], 0, 1.2);
      slotU.set([xs[a.spec.slot], zs[a.spec.slot], present, ring], i * 4); accU.set(a.spec.accent, i * 3);
    });
    slotU.fill(0, actors.length * 4);
    g.uniformMatrix4fv(FL.u_vp, false, vp);
    g.uniform4fv(FL.u_slot, slotU); g.uniform3fv(FL.u_acc, accU);
    g.uniform2f(FL.u_pulse, pulseT < 0 ? 0 : pulseT, pulseT >= 0 && pulseT < 1 ? 1 : 0);
    g.bindBuffer(g.ARRAY_BUFFER, floorBuf);
    g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
    g.disableVertexAttribArray(1); g.disableVertexAttribArray(2); g.disableVertexAttribArray(3);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);

    // 2. actors: every opaque pass front to back, then every halo
    const live = order.filter((a) => a.R && a.ent >= 0);
    for (const a of live) a.R!.draw(bufW, bufH, { pedestal: false, clear: false, pass: 1 });
    for (const a of live) a.R!.draw(bufW, bufH, { pedestal: false, clear: false, pass: 2 });
    frames++;
  }

  function tick(now: number): void {
    raf = requestAnimationFrame(tick);
    const c0 = performance.now();
    const raw = last < 0 ? 0 : now - last;
    last = now;
    const dt = Math.min(raw, 50) / 1000;
    t += dt;
    if (pulseT >= 0) { pulseT += dt / 1.1; if (pulseT >= 1) pulseT = -1; }
    for (const a of actors) if (a.R) update(a, dt);
    // all floor rings pulse together once, when the last actor has finished materialising
    if (started && !pulseDone && actors.every((a) => !a.R || a.ent >= ENT_END)) { pulseDone = true; pulseT = 0; }
    renderNow();
    fN++; cSum += performance.now() - c0;
    if (raw > 0) {
      // EMA governor: above 22 ms for 60 frames, DPR drops to 1; still slow after another 60, give the page back to the posters.
      ema += 0.1 * (raw - ema);
      slow = ema > 22 ? slow + 1 : 0;
      if (slow >= 60) {
        slow = 0; ema = 16.7;
        if (stage === 0) { stage = 1; dprCap = 1; resize(); renderNow(); } else fail(perr('perf', 'frame time stayed above 22 ms at DPR 1'));
      }
    }
  }

  function stats(): void {
    const now = performance.now(), dt = (now - tStat) / 1000;
    let draws = 0, tris = 0;
    for (const a of actors) if (a.man && a.ent >= 0) { draws += a.man.draws.length; tris += a.man.bin.indexCount / 3; }
    opts.onStats!({ fps: raf && dt > 0 ? fN / dt : 0, cpuMs: fN ? cSum / fN : 0, dpr: dprNow, width: bufW, height: bufH, draws: draws + 1, triangles: tris, frames, actors: actors.filter((a) => a.R).length, running: !!raf });
    fN = 0; cSum = 0; tStat = now;
  }

  return {
    start(staggerMs = 180) {
      if (dead || started) return;
      started = true;
      schedule(staggerMs);                                // actors still loading are scheduled in boot()
      sync();
    },
    wave(i) {
      const a = actors[i];
      if (dead || !a?.R) return;
      if (a.ent < ENT_END) a.waveQ = true;
      else if (a.waveT < 0 || a.waveT >= 1.22) spawnWave(a);
    },
    highlight(i, on) { const a = actors[i]; if (a) a.hl = on ? 1 : 0; },
    destroy: kill,
    setActive(v) { if (!dead) { active = !!v; sync(); } },
  };
}
