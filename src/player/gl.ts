// The whole GL side: one program (GLSL ES 1.00, identical for WebGL1 and 2), two buffers, one texture per material.
// `init()` can run again on the same context after a context restore: every CPU-side input is retained.
import type { AvatarManifest } from './manifest';
import type { TexSource } from './load';
import { perr } from './err';
import vsSrc from './shaders/player.vert.glsl?raw';
import fsSrc from './shaders/player.frag.glsl?raw';

export type GL = WebGLRenderingContext | WebGL2RenderingContext;

/** The linked avatar program. Shared between actors by the squad stage (one compile, one link); createRenderer makes its own otherwise. */
export interface Prog { prog: WebGLProgram; L: Record<string, WebGLUniformLocation | null>; init(): void; release(): void }

export function createProgram(gl: GL): Prog {
  function shader(type: number, src: string): WebGLShader {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw perr('shader', gl.getShaderInfoLog(s) || 'compile failed');
    return s;
  }
  const p: Prog = {
    prog: null as unknown as WebGLProgram, L: {},
    init() {
      const vs = shader(gl.VERTEX_SHADER, vsSrc), fs = shader(gl.FRAGMENT_SHADER, fsSrc);
      p.prog = gl.createProgram()!;
      gl.attachShader(p.prog, vs); gl.attachShader(p.prog, fs);
      ['a_pos', 'a_nrm', 'a_uv', 'a_skin'].forEach((n, i) => gl.bindAttribLocation(p.prog, i, n));
      gl.linkProgram(p.prog);
      if (!gl.getProgramParameter(p.prog, gl.LINK_STATUS)) throw perr('shader', gl.getProgramInfoLog(p.prog) || 'link failed');
      gl.deleteShader(vs); gl.deleteShader(fs);
      p.L = {};
      for (const n of ['u_viewProj', 'u_bone', 'u_jq', 'u_jp', 'u_posMin', 'u_posRange', 'u_uvMin', 'u_uvRange', 'u_vm', 'u_tex', 'u_mat', 'u_mat2', 'u_eye', 'u_mode', 'u_fx', 'u_ground', 'u_cursorI']) p.L[n] = gl.getUniformLocation(p.prog, n);
      gl.useProgram(p.prog);
      gl.uniform1i(p.L.u_tex, 0);
    },
    release() { if (p.prog) gl.deleteProgram(p.prog); },
  };
  return p;
}

/** What one draw() call renders. Defaults = the single-avatar card (clear, pedestal, opaque then halo). */
export interface DrawOpts {
  pedestal?: boolean;    // false: the squad floor replaces the per-avatar pedestal
  clear?: boolean;       // false: the stage already set the viewport and cleared
  pass?: 0 | 1 | 2;      // 0 all, 1 opaque only, 2 additive (halo) only: the stage draws every actor's opaque pass before any halo
}

export function createRenderer(gl: GL, m: AvatarManifest, bin: ArrayBuffer, srcs: Map<string, TexSource>, shared?: Prog) {
  const hdr = new DataView(bin);
  const off = (o: number) => hdr.getUint32(o, true);
  const pO = off(16), nO = off(20), uO = off(24), sO = off(28), iO = off(32);
  const I = m.bin.indexCount;
  const u32 = m.bin.indexType === 'u32';
  const ixType = u32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, ixBytes = u32 ? 4 : 2;
  const Rg = Math.min(2.4, Math.max(1.6, 0.68 * m.radiusXZ));
  const q = m.quant;
  const gLo = -1.45 * Rg, gSpan = 2.9 * Rg;                 // pedestal quad extent; uploaded with uniform3f (no per-frame array conversion)
  // Per-material uniforms, flattened once: useTex, gloss, spec, emissive | r, g, b, alphaCut
  const mu = new Float32Array(m.materials.length * 8);
  m.materials.forEach((t, i) => mu.set([t.texture ? 1 : 0, t.gloss, t.spec, t.emissive, t.color[0], t.color[1], t.color[2], t.alphaMode === 'mask' ? 0.5 : 0], i * 8));
  const jp = new Float32Array(24);
  m.bones.forEach((b, i) => jp.set(b.pivot, i * 3));

  const own = shared ? null : createProgram(gl), P = (shared || own)!;
  let vb: WebGLBuffer, ib: WebGLBuffer, gb: WebGLBuffer, dummy: WebGLTexture;
  let texs: Map<string, WebGLTexture>;

  function texture(src: TexSource | null): WebGLTexture {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    // Pixel-store state belongs to the context and is reset by a restore, so it is set for every upload.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);                 // the preprocess already flipped v
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    if (src) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.generateMipmap(gl.TEXTURE_2D);                            // sizes are power-of-two, so WebGL1 may mip and REPEAT
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); // UVs leave [0,1] slightly (hair, wings)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      const ax = gl.getExtension('EXT_texture_filter_anisotropic');
      if (ax) gl.texParameterf(gl.TEXTURE_2D, ax.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  const r = {
    // CPU-owned inputs; index.ts writes them, draw() uploads them.
    bones: new Float32Array(128), jq: new Float32Array(32),
    fx: new Float32Array(4), gr: new Float32Array(4), ci: 0,
    vp: new Float32Array(16), eye: new Float32Array(3),

    init() {
      if (u32 && !(gl as WebGL2RenderingContext).createVertexArray && !gl.getExtension('OES_element_index_uint')) throw perr('format', 'u32 indices unsupported');
      own?.init();                                                  // a shared program is initialised by its owner (the stage) first

      // The vertex blocks are a prefix of the file, so a view (no copy) is enough; indices need their own buffer
      // because one WebGL buffer cannot be bound to both ARRAY_BUFFER and ELEMENT_ARRAY_BUFFER.
      vb = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(bin, 0, iO), gl.STATIC_DRAW);
      ib = gl.createBuffer()!; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, u32 ? new Uint32Array(bin, iO, I) : new Uint16Array(bin, iO, I), gl.STATIC_DRAW);
      // Pedestal quad reuses the a_pos encoding: u16 corners 0 / 65535 in xz.
      gb = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, gb);
      gl.bufferData(gl.ARRAY_BUFFER, new Uint16Array([0, 0, 0, 65535, 0, 0, 0, 0, 65535, 65535, 0, 65535]), gl.STATIC_DRAW);

      dummy = texture(null);
      texs = new Map();
      srcs.forEach((s, url) => texs.set(url, texture(s)));

      gl.useProgram(P.prog);
      // Attributes 1-3 are disabled for the ground quad; their constants are never read in that mode.
      for (let i = 1; i < 4; i++) gl.vertexAttrib4f(i, 0, 0, 0, 0);
      gl.frontFace(gl.CCW);
      gl.clearColor(0, 0, 0, 0);
      r.view();
    },

    /** Uploads the camera arrays (call after the framing changes). */
    view() {
      gl.useProgram(P.prog);
      gl.uniformMatrix4fv(P.L.u_viewProj, false, r.vp);
      gl.uniform3fv(P.L.u_eye, r.eye);
    },

    draw(w: number, h: number, o?: DrawOpts) {
      const L = P.L;
      if (o?.clear !== false) {
        gl.viewport(0, 0, w, h);
        gl.depthMask(true);                                         // clear() honours the depth mask
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      }
      gl.useProgram(P.prog);
      // Per-avatar constants live in the (possibly shared) program, so every draw sets its own.
      r.view();
      gl.uniform3fv(L.u_jp, jp);
      gl.uniform2f(L.u_uvMin, q.uvMin[0], q.uvMin[1]); gl.uniform2f(L.u_uvRange, q.uvRange[0], q.uvRange[1]);
      gl.uniformMatrix4fv(L.u_bone, false, r.bones);
      gl.uniform4fv(L.u_jq, r.jq);
      const f = r.fx;
      gl.uniform4f(L.u_fx, f[0], f[1], f[2], f[3]);
      gl.uniform4f(L.u_ground, Rg, r.gr[1], r.gr[2], r.gr[3]);
      gl.uniform1f(L.u_cursorI, r.ci);
      gl.activeTexture(gl.TEXTURE0);

      // 1. pedestal: no depth, premultiplied blend into the transparent buffer (glow adds light, shadow darkens)
      if (o?.pedestal !== false) {
        gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform1f(L.u_vm, 2); gl.uniform1f(L.u_mode, 2);
        gl.uniform3f(L.u_posMin, gLo, 0, gLo); gl.uniform3f(L.u_posRange, gSpan, 0, gSpan);
        gl.bindBuffer(gl.ARRAY_BUFFER, gb);
        gl.vertexAttribPointer(0, 3, gl.UNSIGNED_SHORT, true, 6, 0);
        gl.enableVertexAttribArray(0);
        gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2); gl.disableVertexAttribArray(3);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      // 2. avatar: SPEC 3.1 attribute layout, every attribute normalized (identical decode in WebGL1 and 2)
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.vertexAttribPointer(0, 3, gl.UNSIGNED_SHORT, true, 6, pO);
      gl.vertexAttribPointer(1, 2, gl.UNSIGNED_BYTE, true, 2, nO);
      gl.vertexAttribPointer(2, 2, gl.UNSIGNED_SHORT, true, 4, uO);
      gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 4, sO);
      for (let i = 0; i < 4; i++) gl.enableVertexAttribArray(i);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.uniform1f(L.u_vm, 0);
      gl.uniform3f(L.u_posMin, q.posMin[0], q.posMin[1], q.posMin[2]);
      gl.uniform3f(L.u_posRange, q.posRange[0], q.posRange[1], q.posRange[2]);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.BLEND);
      let additive = false;
      for (const d of m.draws) {
        const mt = m.materials[d.material], k = d.material * 8;
        if (o?.pass === 1 ? mt.pass === 'additive' : o?.pass === 2 && mt.pass !== 'additive') continue;
        if (mt.pass === 'additive' && !additive) {                  // the halo: pure light, never writes depth
          additive = true;
          gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
        }
        // Culling is load-bearing: the bolts are an inverted-hull outline that only reads with back faces culled.
        if (mt.cull === 'back') { gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); } else gl.disable(gl.CULL_FACE);
        gl.uniform1f(L.u_mode, additive ? 1 : 0);
        gl.uniform4f(L.u_mat, mu[k], mu[k + 1], mu[k + 2], mu[k + 3]);
        gl.uniform4f(L.u_mat2, mu[k + 4], mu[k + 5], mu[k + 6], mu[k + 7]);
        gl.bindTexture(gl.TEXTURE_2D, (mt.texture && texs.get(mt.texture.url)) || dummy);
        gl.drawElements(gl.TRIANGLES, d.count, ixType, d.first * ixBytes);
      }
    },

    release() {
      // Deleting on a lost context is a harmless no-op, so this is also the destroy() path.
      if (!vb) return;
      own?.release();
      [vb, ib, gb].forEach((b) => gl.deleteBuffer(b));
      gl.deleteTexture(dummy);
      texs.forEach((t) => gl.deleteTexture(t));
      texs.clear();
    },
  };
  return r;
}

export type Renderer = ReturnType<typeof createRenderer>;
