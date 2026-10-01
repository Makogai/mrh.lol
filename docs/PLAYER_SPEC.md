# mrh-player — SPEC v1

The 3D Roblox avatar "player card" for **mrh.lol**. This file is the **only contract** between the two
parallel implementers:

- **A — preprocess pipeline**: owns `scripts/**`, `public/roblox/**`, `assets-src/**`, `package.json` (+ lock,
  `node_modules`), `README.md`, `.gitignore`.
- **B — renderer + demo**: owns `src/**`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tests/**`,
  `public/demo/**` (if needed).
- **Nobody edits this file or `docs/**`.** If you find a contract problem, do not diverge silently; implement
  the closest compliant thing and report the problem in your final message.

Normative words: **MUST** = contract, **SHOULD** = strong default, **MAY** = your call.
Section 3 (format) is byte-exact. Sections 5–7 carry art-directed numbers validated with CPU prototypes
(`docs/reference/*.cjs`). The reference renders in `docs/` show the target look:

| file | what |
|---|---|
| `docs/lookdev-front.png` | target look, yaw 0, 640×800 (4:5), final lighting constants |
| `docs/lookdev-yaw-m25.png` | yaw −25° (turntable extreme) |
| `docs/lookdev-static-m16.png` | the reduced-motion static frame (yaw −16°) |
| `docs/lookdev-wave-140.png` | wave pose: right arm abducted 140° with angle-weighted sleeve skinning |
| `docs/rig-rest.png`, `docs/rig-wave-140.png` | bone colours (amber = armR, teal = armL, red tint = blended weights) |
| `docs/groups-contact.png` | every OBJ group isolated (front + side) |
| `docs/sweater-uv-islands.png` | the 10 UV islands of the sweater (front/back/side/bottom) |
| `docs/wings-classes.png` | wing mesh classes: wingR, wingL, spine, flat halo |
| `docs/cull-comparison.png` | why back-face culling is mandatory (lightning outlines) |
| `docs/reference/player.vert.glsl`, `player.frag.glsl` | §5.2–5.4 + §6.5 assembled; **compile + link verified** in WebGL1 and WebGL2 (headless Chrome, ANGLE D3D11) |
| `docs/reference/rig-prototype.cjs`, `lookdev-prototype.cjs` | the CPU prototypes that produced the numbers (reference only; this SPEC wins on any difference) |

---

## 1. What the source asset actually is (analysis, 2026-10-01)

Source: `D:\code\mrh.lol\assets-src\roblox` (**read-only**; A copies it to `D:\code\mrh-player\assets-src\roblox`).
Roblox `avatar-3d` export for userId **1113999731** ("MrHarold0011").

- **OBJ**: 17 groups, 22,791 triangles (no quads, no degenerates), 27,445 `v`/`vt`/`vn` each. Every corner is
  `f a/a/a` (position, uv and normal share one index). `v` lines carry 7 numbers (xyz + RGBA vertex colour,
  always `1 1 1 1` → ignore). **1,735 vertices are unreferenced** (hidden-surface-removal leftovers) → drop.
  No `mtllib`/`o`/`s` lines. One `usemtl` per group.
- **Space**: y-up, studs. The avatar **faces −Z** (verified: the meta camera sits at z = −6.71 looking +Z;
  mask/face are at −z, wings/tail extend to +z). Avatar's right hand = **+X**. AABB (−2.770, 101.015, −1.242) →
  (2.770, 108.035, 2.952).
- **Normals**: present, unit length (±0.6 %), consistent with **CCW = front** winding (≥ 96.8 % of faces in every
  group; 100 % in most).
- **Not R6.** The body is R15 with Roblox **hidden-surface removal (HSR)** under layered clothing: arms, hands,
  torso and thighs were culled away. The 7 `Player*` groups are just the visible remnants. **The arms exist only
  as the sleeves of the layered sweater (Handle4)**, a single connected mesh with the torso.

| group | mat | tris | verts | source bbox min → max | identified as | bone |
|---|---|---|---|---|---|---|
| Handle1 | Handle1Mtl (PBR) | 1004 | 717 | (−0.871, 101.017, −0.571) → (0.121, 101.403, 0.601) | left shoe | root |
| Handle2 | Handle2Mtl (PBR) | 1004 | 717 | (−0.150, 101.015, −0.572) → (0.871, 101.406, 0.602) | right shoe | root |
| Handle3 | Handle3Mtl | 2753 | 3293 | (−0.981, 105.210, −1.242) → (0.958, 106.757, 0.898) | messy black hair (2 comps) | head |
| Handle4 | Handle4Mtl (PBR) | 2614 | 1611 | (−1.781, 102.765, −0.905) → (1.718, 105.066, 0.783) | layered sweater: torso + both sleeves, 1 component, 10 UV islands | torso / armR / armL (skinned) |
| Handle5 | Handle5Mtl (PBR) | 2667 | 2398 | (−0.956, 101.520, −0.603) → (1.002, 103.329, 0.681) | layered black shorts | root |
| Handle6 | Handle6Mtl | 2278 | 6243 | (−2.167, 103.674, −1.093) → (1.970, 106.427, 1.104) | violet lightning bolts around the shoulders: 8 black cores + 8 slightly larger **inverted-hull** purple shells (outline trick) | torso |
| Handle7 | Handle7Mtl | 2920 | 4097 | (−2.770, 101.091, −0.222) → (2.770, 107.367, 1.722) | wings, 137 components: right wing 1110 tris (white), left wing 1110 (black), spine ornament 324, **flat halo** of rays + sparkles 376 tris in 56 comps (planes at z 1.25–1.72) | wingR / wingL / torso |
| Handle8 | Handle8Mtl | 1856 | 2640 | (−1.400, 105.666, −0.821) → (1.400, 108.035, 1.336) | big curved black horns (2 comps) | head |
| Handle9 | Handle9Mtl | 2024 | 1394 | (−0.474, 105.170, −0.624) → (0.474, 105.661, −0.330) | skull-teeth mask over the mouth (16 comps) | head |
| Handle10 | Handle10Mtl | 1468 | 838 | (−0.102, 101.215, 0.190) → (0.101, 103.402, 2.952) | thin demon tail with spade tip (2 comps) | tail |
| Player1 | Player1Mtl | 1802 | 1161 | (−0.568, 105.003, −0.569) → (0.568, 106.146, 0.569) | head (+ 2 eye comps) | head |
| Player2 | Player1Mtl | 13 | 25 | (0.603, 102.112, −0.390) → (0.687, 102.524, 0.015) | sliver of right upper leg | root |
| Player3 | Player1Mtl | 148 | 214 | (−0.001, 101.255, −0.437) → (0.732, 102.344, 0.436) | right lower leg | root |
| Player4 | Player1Mtl | 41 | 75 | (−0.003, 101.229, −0.426) → (0.714, 101.346, 0.404) | right foot | root |
| Player5 | Player1Mtl | 30 | 31 | (−0.675, 104.920, −0.406) → (0.684, 105.016, 0.399) | top of upper torso (neck slab) | torso |
| Player6 | Player1Mtl | 128 | 181 | (−0.731, 101.255, −0.436) → (0.002, 101.779, 0.436) | left lower leg | root |
| Player7 | Player1Mtl | 41 | 75 | (−0.707, 101.229, −0.424) → (−0.000, 101.345, 0.404) | left foot | root |

**Textures** (19 files, 9.2 MB). No accessory texture uses alpha (α = 255 everywhere). The body composite has
7.5 % α = 0 texels, and **no body triangle samples them** (checked 15,421 samples) → flatten.

| hash (prefix) | size | used by | content | → output |
|---|---|---|---|---|
| `0a1218c4` | 916×568 | Player1Mtl Kd/d | R15 body composite (skin, face, lavender torso) | `body` 512×256 lossless, α flattened over Kd (211,167,131) |
| `7001a34f` / `a7ee7f9f` | 1024² | Handle1 / Handle2 Kd | striped sneakers; the two files are the same image (mean abs diff 0.42) | `shoes` 256² q85, **one shared file** |
| `f048ac74` | 256² | Handle3 | hair | `hair` 256² q85 |
| `95fbbdfb` | 1024² | Handle4 | black knit + white skull graphic "LOST VORDS" | `sweater` **1024² q90** (at 3.2× brightness, i.e. lit, q80 and 512 both visibly smear the knit ribs and the graphic's linework) |
| `96a44c6b` | 1024² | Handle5 | shorts | `pants` 512² q85 |
| `679a0f9a` | 420², 4 colours | Handle6 | black core / purple (178,0,255) outline | `bolts` 64² lossless |
| `770c92a2` | 1024² | Handle7 | feathers + rays, mostly white | `wings` 512² q85 (halo shares the file) |
| `3926a397` | 256² | Handle8 | near-black gradient | `horns` 128² q85 |
| `b42a5c11` | 256² | Handle9 | skull teeth | `mask` 256² q90 |
| `abf94154` | 4×4 solid (13,13,13) | Handle10 | tail | **no texture**, `color` = (13,13,13)/255 |
| `91d467ff`, `7daca2b7`, `d59c6480`, `0cf2fe94` | 1024² RGB | PBR `map_Bump` | tangent-space normal maps | **dropped** (sub-pixel at card size, no tangents, 1.5 MB each) |
| `d0ca7687`, `ab6b7680`, `073720ec`, `34017fb4` | 1024² | PBR `map_Ns` | packed **R = metalness, G = roughness** (G means 87, 87, 231, 207) | **dropped**, roughness mean baked into `gloss` |
| `ffb35b3a` | 1024² RGB | PBR `map_Ke` | all black (no emission) | **dropped** |

`rbx_alphamode overlay` on the PBR materials means "colour-map alpha blends over the part colour", not transparency.
With α = 255 everywhere that is just `tex.rgb`. **There are no alpha cards: no alpha test or blend is needed for this
avatar** (the format still supports `mask` for future outfits).

**Culling is load-bearing.** The bolts are an inverted-hull outline: with back-face culling they read as black bolts
with thin violet edges (matches Roblox). Without culling they become solid purple blobs (`docs/cull-comparison.png`).
Default is `cull: 'back'` everywhere (Roblox semantics). The sweater is the one exception (`none`): when the arm is
raised you would otherwise see through the open cuff, because the hands were HSR-culled.

---

## 2. Canonical model space (used by every output)

- **+Y up, avatar faces +Z (toward the default camera), avatar's LEFT = +X** (screen-right when facing it).
  1 unit = 1 stud. Feet rest on y = 0.
- Transform from Roblox source (a 180° rotation about Y: det = +1, so **CCW winding is preserved**):
  - `origin.x, origin.z` = centre of the union AABB (x and z) of all `Player*` groups' **referenced** vertices
    (this avatar: 0.0005, 0.0000); `origin.y` = min y over all referenced vertices (101.015).
  - `p' = (−(x − origin.x), y − origin.y, −(z − origin.z))`, `n' = (−nx, ny, −nz)`.
  - `uv' = (u, 1 − v)`: OBJ's bottom-left origin becomes image top-left. The renderer never sets `UNPACK_FLIP_Y`.
    (Verified: without the flip, the chest graphic lands on the sleeve.)
- Expected canonical bounds for this avatar: min ≈ (−2.769, 0.000, −2.952), max ≈ (2.770, 7.020, 1.242).
  `radiusXZ` (max √(x² + z²), the tail tip) ≈ **2.952**.
- Rotations are right-handed. Quaternions are `(x, y, z, w)`. Named motions map to axes like this (all canonical):

| motion (positive value) | rotation |
|---|---|
| yaw: face turns toward screen-right (+X) | `R_y(+a)` |
| pitch "look up / lean back" | `R_x(−a)` |
| roll "tilt toward the avatar's right" (screen-left, −X) | `R_z(+a)` |
| armR abduction (raise out to the side) | `R_z(−a)` about the armR pivot |
| armL abduction | `R_z(+a)` about the armL pivot |
| arm swing forward | `R_x(−a)` |
| wingR lift (tip up) / wingL lift | `R_z(−a)` / `R_z(+a)` |
| wingR fold (tip back) / wingL fold | `R_y(−a)` / `R_y(+a)` |
| tail sway | `R_y(a)` about the tail root |

Composition for a bone's local rotation: `q = q_yaw · q_pitch · q_roll` (roll applied first).

---

## 3. Asset format (byte-exact contract)

Output directory: `public/roblox/` (served at `<baseUrl>`, e.g. `/roblox/`). The preprocess **deletes stale
generated files** there before writing (only its own patterns: `avatar.json`, `avatar.*.bin`, `tex/*`, `fallback/*`).

```
public/roblox/
  avatar.json                          manifest (stable name, revalidate: Cache-Control no-cache)
  avatar.<h8>.bin                      geometry (content-hashed, immutable)
  tex/<material>.<h8>.webp             textures (content-hashed, immutable; shared files allowed)
  fallback/avatar-300x440.{avif,webp,png}   2D fallback (stable names, referenced from static HTML)
  fallback/avatar-150x220.{avif,webp,png}
```

`<h8>` = first 8 hex chars of SHA-256 of the file bytes.

### 3.1 `avatar.<h8>.bin`: little-endian, planar

Header, 48 bytes:

| offset | type | field | value |
|---|---|---|---|
| 0 | u8[4] | magic | `4D 52 48 41` (`"MRHA"`) |
| 4 | u16 | version | `1` |
| 6 | u16 | flags | bit 0 = indices are u32 (else u16); other bits 0 |
| 8 | u32 | vertexCount `N` | |
| 12 | u32 | indexCount `I` | multiple of 3 |
| 16 | u32 | posOffset | `48` |
| 20 | u32 | nrmOffset | `48 + 6N` |
| 24 | u32 | uvOffset | `48 + 8N` |
| 28 | u32 | skinOffset | `48 + 12N` |
| 32 | u32 | indexOffset | `48 + 16N` |
| 36 | u32 | byteLength | total file size = `indexOffset + I·(2 or 4)`, rounded up to a multiple of 4 (zero pad) |
| 40 | u32 | reserved | 0 |
| 44 | u32 | reserved | 0 |

Blocks are tightly packed, one attribute per block (planar layout gzips 5.6 % smaller than interleaved here, and the
mostly constant skin block shrinks to a few KB):

| block | per vertex | WebGL pointer `(size, type, normalized, stride, offset)` | decode |
|---|---|---|---|
| POS | `u16 x, y, z` | `(3, UNSIGNED_SHORT, true, 6, posOffset)` | `p = posMin + a_pos * posRange` |
| NRM | `u8 ox, oy` (octahedral) | `(2, UNSIGNED_BYTE, true, 2, nrmOffset)` | `e = a_nrm * 2 − 1; n = octDecode(e)` |
| UV | `u16 u, v` | `(2, UNSIGNED_SHORT, true, 4, uvOffset)` | `uv = uvMin + a_uv * uvRange` (v already flipped) |
| SKIN | `u8 bone, parent, weight, phase` | `(4, UNSIGNED_BYTE, true, 4, skinOffset)` | `bone = floor(a.x*255+0.5)` etc. |
| INDEX | `u16` (or `u32` if flag) | `ELEMENT_ARRAY_BUFFER` | triangle list, CCW front in canonical space |

**Unsigned normalized everywhere** on purpose: `c/(2ⁿ−1)` decodes identically in WebGL1 and WebGL2 (signed
normalized does not), and SKIN is read normalized because D3D11/ANGLE has no native "u8 → float, unnormalized"
format.

Quantisation (A):
- `posMin = bounds.min`, `posRange = bounds.max − bounds.min` (any component < 1e-6 → 1). `q = round((p − posMin) / posRange · 65535)`.
- Oct encode (unit `n`):
  ```js
  const l1 = Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]);
  let x = n[0] / l1, y = n[1] / l1;
  if (n[2] < 0) { const ox = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1); y = (1 - Math.abs(x)) * (y >= 0 ? 1 : -1); x = ox; }
  q = [Math.round((x * 0.5 + 0.5) * 255), Math.round((y * 0.5 + 0.5) * 255)];
  ```
  Decode (GLSL ES 1.00):
  ```glsl
  vec3 octDecode(vec2 e) {
    vec3 n = vec3(e, 1.0 - abs(e.x) - abs(e.y));
    float t = max(-n.z, 0.0);
    n.x += n.x >= 0.0 ? -t : t;
    n.y += n.y >= 0.0 ? -t : t;
    return normalize(n);
  }
  ```
  Measured round-trip error: 0.94° max, 0.34° mean. That is fine because it is per vertex and interpolated.
- UV: `uvMin` / `uvRange` = min / extent of the flipped UVs over all vertices. The UVs go slightly outside
  [0, 1] (u up to 1.031, v′ down to −0.042), and textures **wrap (REPEAT)**.
- SKIN:
  - `bone` ∈ 0..7, index into `manifest.bones`.
  - `weight` 255 = **rigid** on `bone` (then `parent` = `bone`, ignored).
  - `weight` 1..254 = **blended**. `parent` MUST equal `bones[bone].parent`. `w = weight/255` is the fraction of the
    bone's local **rotation** applied about its pivot (angle-weighted, see §5.2). It is not a linear matrix blend.
  - `phase` 0..255: per-component random phase for halo twinkle (1..255 on halo vertices, 0 elsewhere).
- **Weld** after quantisation: identical 12-byte `(POS, NRM, UV, SKIN)` tuples share one vertex. Drop triangles
  whose welded indices are not all distinct. Expected: **N ≈ 21,150** (< 65,536 → u16 indices), I ≈ 68,370.
- Vertex order: emitted in order of first reference while walking `draws` in order (keeps each draw's vertex
  range nearly contiguous). Triangle order within a material: source order.

### 3.2 `avatar.json`: manifest types (B copies this verbatim into `src/player/manifest.ts`)

```ts
// Contract for public/roblox/avatar.json, SPEC.md §3.2. Written by scripts/preprocess.mjs.
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export const BONE_NAMES = ['root', 'torso', 'head', 'armR', 'armL', 'wingR', 'wingL', 'tail'] as const;
export type BoneName = (typeof BONE_NAMES)[number];

export interface AvatarManifest {
  format: 'mrh-avatar';
  version: 1;
  generatedAt: string;                       // ISO-8601 UTC
  source: { userId: number; objHash: string; mtlHash: string }; // from meta.json, informational
  space: 'canonical-v1';                     // SPEC §2: +Y up, faces +Z, avatar's left = +X, studs, feet on y=0
  bounds: { min: Vec3; max: Vec3 };          // bind-pose AABB of every vertex (halo included)
  radiusXZ: number;                          // max sqrt(x*x + z*z) over every vertex, bind pose
  bin: {
    url: string;                             // relative to baseUrl, e.g. "avatar.3f2a9c1d.bin"
    byteLength: number;                      // == header.byteLength
    vertexCount: number;                     // == header N
    indexCount: number;                      // == header I
    indexType: 'u16' | 'u32';                // == header flags bit 0
  };
  quant: { posMin: Vec3; posRange: Vec3; uvMin: Vec2; uvRange: Vec2 };
  bones: BoneDef[];                          // EXACTLY 8, in BONE_NAMES order; array index == SKIN bone id
  materials: MaterialDef[];                  // names unique
  draws: DrawDef[];                          // render order: every 'opaque' draw (front-to-back), then 'additive'
  fallback: FallbackImage[];                 // ascending width
  stats: PayloadStats;
}

export interface BoneDef {
  name: BoneName;
  parent: number;                            // -1 for root; root=-1, torso=0, head=1, armR=1, armL=1, wingR=1, wingL=1, tail=0
  pivot: Vec3;                               // joint position, bind pose, canonical space
  vertexCount: number;                       // welded vertices on this bone (rigid or blended). 0 = unused bone
}

export interface MaterialDef {
  name: string;                              // 'body' | 'shoes' | ... (debug label, no semantics)
  texture: TextureRef | null;                // null => flat `color`
  color: Vec3;                               // sRGB 0..1, used only when texture === null
  shading: 'lit' | 'halo';
  pass: 'opaque' | 'additive';               // 'halo' <=> 'additive'
  cull: 'back' | 'none';
  alphaMode: 'opaque' | 'mask';              // 'mask' => discard where texture alpha < 0.5
  gloss: number;                             // 0..1, shininess = 2^(1 + 9*gloss)
  spec: number;                              // 0..1 specular strength
  emissive: number;                          // >= 0, multiplies LINEAR albedo, added after lighting
}

export interface TextureRef {
  url: string;                               // relative to baseUrl, e.g. "tex/sweater.9c0e11aa.webp"
  width: number;                             // power of two (WebGL1 mip + REPEAT)
  height: number;                            // power of two
  hasAlpha: boolean;                         // true only for alphaMode 'mask'
}

export interface DrawDef {
  material: number;                          // index into materials
  first: number;                             // first INDEX (element offset, not bytes)
  count: number;                             // index count, multiple of 3; draws tile [0, indexCount) exactly
}

export interface FallbackImage {
  width: number;                             // exact pixel size of the files
  height: number;
  avif: string;                              // relative to baseUrl
  webp: string;
  png: string;
}

export interface PayloadStats {
  vertexCount: number;
  triangleCount: number;
  binBytes: number;
  binGzipBytes: number;                      // zlib level 9
  binBrotliBytes: number;                    // quality 11
  textureBytes: number;                      // sum of unique texture files
  totalBytes: number;                        // binBytes + textureBytes (what the 3D view downloads; manifest ~4 KB extra)
  totalGzipBytes: number;                    // binGzipBytes + textureBytes
}
```

Expected manifest for this avatar (A MUST reproduce it within the stated tolerance; B MUST NOT hard-code anything
from it, since the renderer reads everything from the manifest). Pivots ±0.01, counts ±10 %:

```jsonc
{
  "bounds": { "min": [-2.769, 0.0, -2.952], "max": [2.770, 7.020, 1.242] }, "radiusXZ": 2.952,
  "bones": [
    { "name": "root",  "parent": -1, "pivot": [0, 0, 0] },
    { "name": "torso", "parent": 0,  "pivot": [0, 2.279, 0] },          // waist
    { "name": "head",  "parent": 1,  "pivot": [0, 3.988, 0] },          // neck = head bbox (centre x/z, min y)
    { "name": "armR",  "parent": 1,  "pivot": [-1.141, 3.538, -0.031] },
    { "name": "armL",  "parent": 1,  "pivot": [1.160, 3.538, -0.040] },
    { "name": "wingR", "parent": 1,  "pivot": [-0.434, 3.140, -0.660] },
    { "name": "wingL", "parent": 1,  "pivot": [0.435, 3.140, -0.660] },
    { "name": "tail",  "parent": 0,  "pivot": [0.005, 2.270, -0.260] }
  ],
  // materials: name, triangles, texture, cull, gloss, spec, emissive
  //  body     2203  body 512x256 lossless     back 0.25 0.25 0
  //  shoes    2008  shoes 256 q85 (shared L/R) back 0.55 0.60 0
  //  hair     2753  hair 256 q85              back 0.65 0.25 0
  //  sweater  2614  sweater 1024 q90          NONE 0.12 0.18 0
  //  pants    2667  pants 512 q85             back 0.20 0.25 0
  //  bolts    2278  bolts 64 lossless         back 0.30 0.30 2.2   (inverted hull: MUST stay 'back')
  //  wings    2544  wings 512 q85             back 0.30 0.35 0     (feathers + spine ornament)
  //  horns    1856  horns 128 q85             back 0.80 1.00 0     (art call: glossy obsidian)
  //  mask     2024  mask 256 q90              back 0.50 0.50 0
  //  tail     1468  null, color [0.051,0.051,0.051]  back 0.80 1.00 0
  //  halo      376  wings file (shared)       none  shading 'halo', pass 'additive'
  // => 11 materials, 11 draws (10 opaque front-to-back, then halo)
}
```

### 3.3 Textures

- **One texture per material, no atlas.** An atlas would save about 10 binds per frame, which is nothing at 12
  draws. It would cost gutter/mip-bleed handling and break hardware REPEAT for the out-of-range UVs (hair u 1.031,
  wings v −0.042). The payload is already only 86 KB.
- WebP, **power-of-two** sizes (table in §1), resized with lanczos3 (`fit: 'fill'`: UVs are normalised, so a
  non-uniform resize of the 916×568 body composite is correct).
- Alpha is flattened over the material's `Kd` (`rgb·a + Kd·(1−a)`), so files are RGB. This is Roblox's own
  semantics: body colour under transparent composite texels. **Always flatten** the body material (the one used by
  `Player*` groups) and every `rbx_alphamode overlay` material. Any other material gets `alphaMode: 'mask'` (and an
  RGBA file) only when its source has real transparency (α < 250 on > 0.5 % of texels). Never true for this avatar.
- A texture whose pixels are all one colour (±2) becomes `texture: null` with that `color`.
- Identical encoded bytes are written once and shared by URL (shoes L/R; wings and halo).
- Measured sizes at these settings: body 2.1 KB, shoes 9.4, hair 0.7, sweater 55.3, pants 6.7, bolts 0.1,
  wings 5.9, horns 0.2, mask 6.0 → **86.4 KB total**.

### 3.4 2D fallback

From `render-720.png` (Roblox's own full-body render, 720², 88.7 % transparent): trim transparent margins
(sharp `trim({ threshold: 1 })` → 282×416), then `resize(W, H, { fit: 'contain', position: 'bottom',
background: transparent })`, so the feet sit on the bottom edge. Write exactly:

| file | size | encoder | measured |
|---|---|---|---|
| `fallback/avatar-300x440.avif` / `.webp` / `.png` | 300×440 | avif q60 · webp q82 alphaQuality 90 · png palette q90 | 16.2 / 20.5 / 41.6 KB |
| `fallback/avatar-150x220.avif` / `.webp` / `.png` | 150×220 | same | 7.8 / 10.8 / 15.4 KB |

300×440 is about 1.06× the native trimmed height. Roblox's 2D API tops out at 720², so this is the most detail
available. It will look soft at 2× DPR, which is acceptable because it is only a fallback.

### 3.5 Payload budget (target ≤ ~600 KB)

Measured with the prototype quantiser: geometry **464 KB raw / 277 KB gzip / 205 KB brotli** (positions 124,
normals 41, uv 83, skin 83, indices 134 KB raw) + textures **86 KB** + manifest ~4 KB:

- **≈ 554 KB uncompressed**, within budget even if the host forgets to compress `.bin`.
- **≈ 368 KB with gzip**, ≈ 296 KB with brotli.

Hosting MUST compress `.bin` (nginx: add `application/octet-stream` to `gzip_types`). Long-cache the hashed files
(`immutable`) and set `no-cache` on `avatar.json`. A reports the real numbers in `stats` and in the console.

---

## 4. Preprocess semantics (A implements; B relies on the meaning)

Classification is **heuristic-first** (so a refreshed outfit mostly just works), with an explicit config for art
direction and overrides. All rules use canonical coordinates.

### 4.1 Landmarks

- `headPart` = the `Player*` group whose bbox dims are all in [0.6, 1.6] studs and whose centroid y is highest.
- `neckY = headPart.bbox.min.y` (3.988) · `headTop = headPart.bbox.max.y` (5.131) · `feetY` = min y over `Player*`
  (0.214).
- `waistY = feetY + 0.42·(headTop − feetY)` (2.279, matches the shorts' waistband) · `chestY = (waistY + neckY)/2`
  (3.134) · `shoulderY = neckY − 0.45` (3.538).

### 4.2 Group → bone (first matching rule wins)

Body parts (`Player*`):
1. `headPart`, or centroid y > neckY → **head**.
2. |centroid x| > 0.9 and waistY < centroid y < neckY → **armL** (x > 0) / **armR** (x < 0) (body arms; none in this avatar).
3. centroid y > waistY → **torso**.
4. else **root**.

Accessories (`Handle*`):
1. bbox.min.y > neckY − 0.35 → **head** (hair, horns, mask).
2. bbox-centre z < −0.4 **and** x-extent < 0.6 **and** centroid y < waistY + 0.3 → **tail**.
3. bbox-centre z < −0.4 **and** x-extent > 2.0 → **back accessory (wings)**, split per position-welded connected
   component (weld at 1e-4 studs):
   - **halo**: min bbox extent < **0.026** studs **and** ≤ 64 triangles → bone **torso**, material `halo`, phase =
     1 + hash(component) mod 255. (The spine ornament is 0.0307 thick with 324 tris; rays and sparkles are
     ≤ 0.0219 with ≤ 16 tris. Both criteria are needed.)
   - else centroid x > 0.15 → **wingL**; < −0.15 → **wingR**; else **torso** (spine ornament).
4. **upper-body clothing** (chest probe): ≥ 5 vertices with |x| < 0.35, |y − chestY| < 0.35, z > 0 → torso, plus
   sleeve skinning (§4.3). This avatar: Handle4, 14 probe hits.
5. centroid y < waistY → **root** (shoes, shorts).
6. else **torso** (the lightning bolts).

Overrides: `scripts/avatar.config.json → groups.<name>.bone` forces a rigid bone for a whole group (escape hatch
after refreshes).

No hip or leg bones, by design: the shorts are one mesh across both legs, and the legs are HSR fragments, so
rotating legs would tear. The lower body is the static root (feet stay planted on the pedestal). Weight shift,
breathing and sway happen at the waist pivot, where the sweater hem overlaps the shorts' waistband by about
0.5 studs and hides the seam.

### 4.3 Sleeve weights (the wave depends on this; validated in `docs/rig-wave-140.png`)

A pure x threshold **does not work**: the torso panels have side walls at |x| 0.8–1.0 hidden under sleeves whose
inner walls reach |x| 0.43. A threshold would rip a hole in the torso when the arm lifts. Use the UV islands:

1. Islands of the upper-clothing group = connected components over shared **source vertex indices** (the OBJ
   splits vertices at UV seams). The sweater has 10: front panel 592 tris, back 589, right sleeve 468, left sleeve
   447, hem 238, collar 84 + 21, cuffs 84 / 77 / 14.
2. Sleeve islands: armL ⇐ island bbox.min.x > 0.1 **and** centroid x > 0.45; armR ⇐ bbox.max.x < −0.1 **and**
   centroid x < −0.45. This avatar: armR = {468, 84, 14}, armL = {447, 77}.
3. Weld the group by position (1e-4) → graph with Euclidean edge lengths. Per arm: `inS(w)` = a source vertex of
   welded vertex w is in that arm's sleeve islands; `inT(w)` = one is in any other island. **Seam** = inS ∧ inT
   (12 welded verts per arm here).
4. Dijkstra from the seam → `dist(w)`. Signed `s = +dist` if inS ∧ ¬inT, `0` on the seam, `−dist` otherwise.
5. `wf(w) = (x(w)·side < −0.05) ? 0 : smoothstep(−0.60, +0.30, s)`, with side = +1 for armL, −1 for armR.
6. Two Jacobi Laplacian-smoothing iterations over vertices with `0 < wf` that are not pure sleeve
   (`inS ∧ ¬inT ∧ wf ≥ 1` stay pinned): `wf' = (wf + Σ neighbour wf) / (1 + degree)`.
7. Per source vertex, with `wt = wf(weld(v))`: ≤ 0.002 → rigid **torso**; ≥ 0.998 → rigid arm; else blended
   `{bone: arm, parent: torso(1), weight: clamp(round(wt·255), 1, 254)}`.
   Expected source-vertex counts: armR 309 rigid + 168 blended, armL 266 + 171 (±10 %).
8. Arm pivot: x, z = mean of the arm's sleeve-island vertices with y > (their max y − 0.5); y = shoulderY.
   Pivot means in §4.3–4.4 are taken over **source vertices** (referenced OBJ vertices, before the §3.1 weld), as
   in the prototype. That keeps them within the ±0.01 tolerance.

The wave is an **angle-weighted rotation about the shoulder pivot**: a vertex with w = 0.5 turns half the angle and
keeps its distance from the pivot. Plain linear-blend skinning collapses the shoulder at a 140° raise
(cos 70° → 34 % of the radius), so it is not an option here.

### 4.4 Other pivots

- root (0,0,0) · torso (0, waistY, 0) · head = (head bbox centre x, neckY, head bbox centre z). Use the bbox, not
  the vertex centroid: dense face detail pulls the centroid 0.28 forward.
- wing hinge = mean position of that wing's vertices with |x| ≤ the 10th percentile of |x| over the wing
  (the inner root).
- tail root = mean of tail vertices with z > (max z − 0.15) (the end that enters the body).
- Bones with no geometry still get a pivot (any sensible landmark) and `vertexCount: 0`.

### 4.5 Materials

- One logical material per OBJ material, except Handle7Mtl, which splits into `wings` and `halo` by face class.
  Materials with identical texture bytes and identical params merge into one (shoes L/R → one `shoes`, one draw).
- `halo` params are fixed by this spec, not by config: `shading 'halo'`, `pass 'additive'`, `cull 'none'`, the
  parent material's texture, gloss/spec/emissive 0.
- Params come from `scripts/avatar.config.json` keyed by OBJ material name, with an `expectTris` fingerprint. On a
  fingerprint mismatch (a new outfit) the entry is ignored with a warning and defaults apply:
  `gloss` = PBR? `clamp((1 − mean(map_Ns.G)/255)·0.85, 0.05, 0.9)` : 0.3; `spec` 0.35; `emissive` 0;
  `cull: 'back'`; size = min(source, 512) POT; webp q85.
- Draw order: opaque materials sorted by bbox-centre z **descending** (front first, for early-z), then additive.

### 4.6 Debug outputs (not shipped): `scripts/out/`

`report.json` (classification table, pivots, counts, sizes) and `rig-debug.png`: front + side, bone colours, blended
weights tinted, pivots as dots, plus the armR 140° pose, rendered like `docs/rig-*.png`. Review it after every
refresh.

---

## 5. Renderer (B)

Raw WebGL, **zero runtime dependencies**, framework-free TS in `src/player/`. Budget **≤ 12 KB gzipped** for the
lazily imported chunk (measure the `vite build` output).

### 5.1 Context and resources

- `canvas.getContext('webgl2', A) || canvas.getContext('webgl', A)` with
  `A = { alpha: true, premultipliedAlpha: true, antialias: true, depth: true, stencil: false,
  preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true }`.
  `failIfMajorPerformanceCaveat` sends software-GL machines to the 2D fallback, where 23k skinned triangles would
  burn battery.
- **One GLSL ES 1.00 program** (WebGL2 accepts `#version 100` unchanged → no dual sources). No derivatives
  extension needed. WebGL1 needs `OES_element_index_uint` only if `indexType === 'u32'` (not the case here).
  `EXT_texture_filter_anisotropic` optional (max 4).
- Upload `bin.slice(0, indexOffset)` as the `ARRAY_BUFFER` and use the §3.1 offsets unchanged (they are file
  offsets). Upload `new Uint16Array(bin, indexOffset, I)` (or `Uint32Array`) as a **separate**
  `ELEMENT_ARRAY_BUFFER`: WebGL forbids one buffer on both targets. Plus one tiny ground-quad buffer
  (renderer-internal, §5.4). Resolve URLs as `new URL(rel, new URL(opts.baseUrl, location.href))`.
- Textures: `fetch → blob → createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })`,
  falling back to `HTMLImageElement.decode()`. `pixelStorei`: `UNPACK_FLIP_Y_WEBGL false`,
  `UNPACK_PREMULTIPLY_ALPHA_WEBGL false`, `UNPACK_COLORSPACE_CONVERSION_WEBGL NONE`. RGBA8, `generateMipmap`,
  `LINEAR_MIPMAP_LINEAR` / `LINEAR`, `REPEAT`. Cache by URL. Decode sRGB in the shader (`pow(c, 2.2)`).
- Fetch `avatar.json` with `cache: 'no-cache'`, then the bin and all textures **in parallel**. Validate the header
  against the manifest (magic, version, N, I, byteLength, indexType), otherwise `format` error.
- Keep the `ArrayBuffer` and `ImageBitmap`s until `destroy()` so context restore is synchronous.

### 5.2 Uniforms and vertex shader (normative math)

```glsl
precision highp float;
attribute vec3 a_pos; attribute vec2 a_nrm; attribute vec2 a_uv; attribute vec4 a_skin;
uniform mat4 u_viewProj;
uniform mat4 u_bone[8];          // WORLD matrix per bone (includes root yaw); CPU-composed each frame
uniform vec4 u_jq[8];            // LOCAL rotation of bone i relative to its parent, quaternion, w >= 0
uniform vec3 u_jp[8];            // bone pivots (bind pose); static, upload once
uniform vec3 u_posMin, u_posRange;
uniform vec2 u_uvMin, u_uvRange;
uniform float u_mode;            // 0 lit, 1 halo, 2 ground
varying vec3 v_world, v_nrm, v_bind;
varying vec2 v_uv;
varying float v_phase;

vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }

void main() {
  vec3 p = u_posMin + a_pos * u_posRange;
  v_bind = p;                                  // bind-pose position: scan front, noise, ground pattern
  vec4 world;
  if (u_mode > 1.5) {                          // ground quad turns with the turntable (root)
    world = u_bone[0] * vec4(p, 1.0);
    v_nrm = vec3(0.0, 1.0, 0.0); v_uv = vec2(0.0); v_phase = 0.0;
  } else {
    vec3 n = octDecode(a_nrm * 2.0 - 1.0);
    int b = int(a_skin.x * 255.0 + 0.5);
    mat4 M;
    if (a_skin.z > 0.999) {
      M = u_bone[b];                           // rigid
    } else {                                   // angle-weighted: nlerp(identity, q, w) about the pivot
      float w = a_skin.z;
      vec4 q = normalize(vec4(u_jq[b].xyz * w, 1.0 - w + u_jq[b].w * w));
      vec3 c = u_jp[b];
      p = c + qrot(q, p - c);
      n = qrot(q, n);
      M = u_bone[int(a_skin.y * 255.0 + 0.5)]; // parent world matrix
    }
    world = M * vec4(p, 1.0);
    v_nrm = (M * vec4(n, 0.0)).xyz;            // GLSL ES 1.00 has no mat3(mat4)
    v_uv = u_uvMin + a_uv * u_uvRange;
    v_phase = a_skin.w;
  }
  v_world = world.xyz;
  gl_Position = u_viewProj * world;
}
```

CPU side: `M_bone = M_parent · T(pivot + t) · R(q) · T(−pivot)` with `M_root = R_y(rootYaw)`, and
`u_jq[bone] = q`. A blended bone (the arms) MUST have `t = 0` so w = 1 reproduces `M_bone` exactly. Keep `q.w ≥ 0`.
Dynamic indexing of uniform arrays in a vertex shader is mandated by GLSL ES 1.00 Appendix A.

### 5.3 Lighting (normative constants; world space = camera-fixed studio: +X right, +Y up, +Z toward camera)

Linear-space values (sRGB hex in comments):

```glsl
const vec3 KEY_DIR  = normalize(vec3(-0.55, 0.72, 0.55));  const vec3 KEY_COL  = vec3(1.000, 0.800, 0.580); // #ffe7c8 (was #ffd59a: the non-albedo spec term turned black hair tan)
const float KEY_I   = 1.9;
const vec3 RIM_DIR  = normalize(vec3(0.80, 0.35, -0.50));  const vec3 TEAL     = vec3(0.045, 0.752, 0.639); // #3ee0d0
const float RIM_I   = 1.7;   const float RIM_POW = 4.0;
const vec3 RIM2_DIR = normalize(vec3(-0.85, 0.20, -0.45)); const vec3 VIOLET   = vec3(0.394, 0.263, 0.957); // #a78bfa
const float RIM2_I  = 0.8;
const vec3 FILL_DIR = normalize(vec3(0.70, -0.05, 0.70));  const float FILL_I = 0.25;                     // violet
const vec3 AMBER    = vec3(1.000, 0.548, 0.060);                                                         // #ffc247
const vec3 SKY_AMB  = vec3(0.0046, 0.0072, 0.0170) * 0.30;                                               // #161b28
const vec3 GND_AMB  = AMBER * 0.005;
const float BOUNCE_I = 0.6;  const float BOUNCE_H = 2.2;   // pedestal uplight, fades out over 2.2 studs of height
```

Why the key is `#ffd59a`, not pure `#ffc247`: pure amber on the near-black outfit reads as chocolate brown. The
lighter lantern amber keeps the clothes black and the face natural. Pure amber stays in the pedestal, the bounce
and the scan. Rim and spec are **not multiplied by albedo**: on black cloth `light × albedo ≈ 0`. The Fresnel rim
(physically a grazing reflection) is what makes the silhouette read on `#06080e`.

Fragment, `u_mode == 0` (lit):

```glsl
vec3 albedo = u_mat.x > 0.5 ? pow(texture2D(u_tex, v_uv).rgb, vec3(2.2)) : pow(u_mat2.rgb, vec3(2.2));
// alphaMode mask: if (u_mat2.w > 0.0 && texture2D(u_tex, v_uv).a < u_mat2.w) discard;
vec3 N = normalize(v_nrm); if (!gl_FrontFacing) N = -N;     // matters for cull 'none' (sweater)
vec3 V = normalize(u_eye - v_world);
float nv = clamp(dot(N, V), 0.0, 1.0);
float ndl = dot(N, KEY_DIR);
float wrap = clamp((ndl + 0.3) / 1.3, 0.0, 1.0);
float shin = exp2(1.0 + 9.0 * u_mat.y);
vec3 H = normalize(KEY_DIR + V);
float spec = pow(clamp(dot(N, H), 0.0, 1.0), shin) * (shin + 8.0) / 25.1327 * u_mat.z * 0.12 * clamp(ndl * 4.0, 0.0, 1.0);
float fres = pow(1.0 - nv, RIM_POW);
float rimM  = 0.15 + 0.85 * clamp(dot(N, RIM_DIR) * 0.6 + 0.4, 0.0, 1.0);
float rim2M = clamp(dot(N, RIM2_DIR) * 0.6 + 0.4, 0.0, 1.0);
float fill = clamp((dot(N, FILL_DIR) + 0.2) / 1.2, 0.0, 1.0);
float hemi = N.y * 0.5 + 0.5;
float bounce = clamp(-N.y * 0.8 + 0.2, 0.0, 1.0) * (1.0 - smoothstep(0.0, BOUNCE_H, v_world.y));
vec3 col = albedo * (KEY_COL * KEY_I * wrap + VIOLET * FILL_I * fill + mix(GND_AMB, SKY_AMB, hemi)
                     + AMBER * BOUNCE_I * bounce * u_fx.z)
         + KEY_COL * KEY_I * spec
         + TEAL * RIM_I * fres * rimM + VIOLET * RIM2_I * fres * rim2M
         + albedo * u_mat.w;                                   // emissive (bolts: 2.2)
col += scan;                                                   // §6.5, zero once the entrance is done
gl_FragColor = vec4(pow(aces(col), vec3(1.0 / 2.2)), 1.0);
// aces(x) = clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0)   (Narkowicz fit), exposure 1.0
```

Fragment uniforms (≤ 16 vec4 for WebGL1): `u_tex`; `u_mat = (useTex, gloss, spec, emissive)`;
`u_mat2 = (color.srgb, alphaCut)`; `u_eye`; `u_mode`;
`u_fx = (time s, scanFront studs | 999 = off, groundIntensity 0..1, studs per device px at the pedestal)`;
`u_ground = (Rg, pulseRadius in Rg units, pulseIntensity, cursorAngle model-space rad)`; `u_cursorI` (0..1).
Use `highp` where `GL_FRAGMENT_PRECISION_HIGH` is defined, else `mediump`.

`u_mode == 1` (halo, additive, unlit):
`col = albedo · mix(AMBER, TEAL, smoothstep(0.5, 6.5, v_bind.y)) · 0.55 · mix(0.35, 1.0, smoothstep(2.5, 5.0, v_bind.y)) · (0.70 + 0.30·sin(u_fx.x·2.3 + v_phase·6.2832))`
(the height term keeps the head starburst at full strength and drops the low rays to 35 %, so they read as atmosphere, not scratches),
output `vec4(pow(aces(col), 1/2.2), 0.0)`. The scan discard (§6.5) applies here too.

### 5.4 Forge pedestal and contact shadow (`u_mode == 2`, same program)

A quad on y = 0, half-size `1.45·Rg`, with `Rg = clamp(0.68·radiusXZ, 1.6, 2.4)` (**2.0** here). It is
transformed by `u_bone[0]`, so it **turns with the turntable** like a real one. The pattern is computed in model
space from `v_bind.xz`. The ground buffer reuses the `a_pos` encoding: 4 corners at u16 0/65535, drawn with
`u_posMin = (−1.45Rg, 0, −1.45Rg)` and `u_posRange = (2.9Rg, 0, 2.9Rg)` for that draw only. The other attributes
are disabled, with constants via `vertexAttrib4f`. GLSL helper functions below are written inline for reading;
hoist them to top level. Output is premultiplied: `rgb` = additive light, `a` = shadow. Draw it with
`blendFunc(ONE, ONE_MINUS_SRC_ALPHA)` into the transparent buffer. The browser then composites
`page·(1−a) + rgb`: the glow adds light to the page and the shadow darkens it.

```glsl
vec2 q = v_bind.xz; float rs = length(q); float Rg = u_ground.x; float r = rs / Rg; float px = u_fx.w;
float ring(float r, float rr, float w) {          // energy-preserving min width of ~1.25 device px (no fwidth needed)
  float we = max(w, 1.25 * px / Rg); return exp(-pow((r - rr) / we, 2.0)) * (w / we); }
float disc  = exp(-r * r * 2.6) * 0.22;                                       // soft amber pool
float lines = ring(r, 1.0, 0.012) * 0.55 + ring(r, 0.72, 0.008) * 0.28 + ring(r, 1.15, 0.006) * 0.20;
float ang = atan(q.y, q.x);
float sector = floor((ang + PI) / TAU * 18.0);  float h = hash11(sector);     // 18 radial "PCB / vein" traces
float on = step(0.35, h);  float len = 1.08 + 0.30 * h;
float dAng = abs(mod(ang - ((sector + 0.5) / 18.0 * TAU - PI) + PI, TAU) - PI) * rs;   // arc distance, studs
float tw = max(0.012, 1.25 * px);  float nw = max(0.03, 1.25 * px);
float trace = on * step(1.0, r) * step(r, len) * exp(-pow(dAng / tw, 2.0)) * (0.012 / tw) * 0.6
            + on * exp(-pow(length(vec2(dAng, (r - len) * Rg)) / nw, 2.0)) * 0.9;            // node dot
float gp = 1.0 + (len - 1.0) * fract(u_fx.x * 0.22 + h * 7.0);                // glints race outward along traces
trace *= 1.0 + 2.5 * on * exp(-pow((r - gp) * Rg / 0.05, 2.0));
trace *= 1.0 + 0.6 * u_cursorI * smoothstep(0.55, 0.0, abs(mod(ang - u_ground.w + PI, TAU) - PI)); // cursor drags light
float fade  = 1.0 - smoothstep(1.05, 1.42, r);
float pulse = exp(-pow((r - u_ground.y) / 0.03, 2.0)) * u_ground.z;           // entrance / wave pulse ring
vec3 glow = (AMBER * (disc + lines * 0.9 * fade + pulse) + TEAL * (trace * 0.7 * fade + pulse * 0.5)) * u_fx.z;
vec2 e = q / vec2(0.95, 0.75);  float shadow = exp(-dot(e, e) * 1.6) * 0.70;  // contact shadow under the feet (0.70: the avatar floats)
glow *= 1.0 - shadow * 0.9;
float alpha = shadow * 0.55 * (1.0 - clamp(r - 0.6, 0.0, 1.0)) * u_fx.z;
gl_FragColor = vec4(pow(aces(glow), vec3(1.0 / 2.2)), alpha);
// hash11(p): p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p);   (sin-free: stable on mediump GPUs)
```

`px` = `2·dist·tan(fovY/2) / drawingBufferHeight`. `cursorAngle` = angle of the cursor ray's hit on the ground plane
in model space (subtract rootYaw). `u_cursorI` is spring-smoothed: 1 while the pointer is over the card, else 0.

### 5.5 Passes (per frame)

1. `clearColor(0,0,0,0)`, clear colour + depth. `viewport` = drawing buffer.
2. **Ground**: depth test off, depth write off, cull off, blend `(ONE, ONE_MINUS_SRC_ALPHA)`, `u_mode = 2`,
   ground buffer, `TRIANGLE_STRIP` × 4.
3. **Opaque draws** in manifest order: depth test `LESS` on, depth write on, blend off, `frontFace(CCW)`, cull per
   material (`back` → `CULL_FACE` + `BACK`, `none` → off), `u_mode = 0`, per-draw material uniforms + texture.
4. **Additive draws**: blend `(ONE, ONE)`, depth test on, depth write off, cull off, `u_mode = 1`.

Draw count ≈ 12. The canvas CSS background stays transparent and composites over the page.

---

## 6. Motion (B): one spring, one ease

### 6.1 Tokens (identical in the site's CSS later)

- **EASE** = `cubic-bezier(0.16, 1, 0.3, 1)` (expo-out-like). Use it for scripted, one-shot transitions: entrance
  scan, pedestal ignite and pulse, wave raise, host canvas fade-in. Implement with Newton–Raphson + bisection
  fallback (WebKit UnitBezier), or a 64-entry LUT built once.
- **SPRING** = damped spring, **ω₀ = √180 = 13.416 rad/s, ζ = 0.72**: 3.8 % overshoot at 338 ms, within 1 % by
  492 ms. Use it for everything reactive that settles toward a target: head and torso cursor tracking, drag
  spring-back, wave release, head roll, cursor-glow strength. Integrate with the **exact closed form** (frame-rate
  independent, error 3e-16). Compute the coefficients once per frame (all springs share them):
  ```
  e = exp(−ζω₀·dt), C = cos(ω_d·dt), S = sin(ω_d·dt), ω_d = ω₀·√(1−ζ²)
  x0 = value − target, v0 = velocity
  value    = target + e·(x0·C + ((v0 + ζω₀·x0)/ω_d)·S)
  velocity =          e·(v0·C − ((ω₀²·x0 + ζω₀·v0)/ω_d)·S)
  ```
  CSS equivalent (600 ms):
  `linear(0, 0.032, 0.111, 0.217, 0.336, 0.456, 0.57, 0.673, 0.762, 0.837, 0.898, 0.945, 0.98, 1.005, 1.022, 1.032, 1.037, 1.038, 1.037, 1.034, 1.03, 1.025, 1.02, 1.016, 1.012, 1.009, 1.006, 1.004, 1.002, 1.001, 1)`
- Idle loops are continuous oscillators, neither eased nor sprung. Anything whose frequency changes MUST integrate
  its phase (`φ += 2π·f·dt`) so it never jumps.
- `dt` = clamp(frame delta, 0, 50 ms). The animation clock only advances while running.

### 6.2 Idle (t = animation clock, seconds; `Bth = sin(2π t / 3.6)`)

| channel | value |
|---|---|
| root yaw (turntable drift) | `25°·sin(2π t_drift / 16)` + dragYaw (t_drift pauses while dragging, during inertia and spring-back) |
| root translate y (levitation) | `0.10 + 0.05·sin(2π t / 4.8)` studs (static 0.10 in reduced motion); the pedestal quad ignores it (rotation-only root matrix in the ground branch) |
| torso translate y | `0.035·Bth` studs (breathing bob; 0.010 was under 1 px) |
| torso pitch (lean back) | `0.5°·Bth` |
| torso roll (weight shift) | `1.0°·sin(2π t / 7.2)` |
| torso yaw | spring → `0.3 × cursor yaw` (§6.3) |
| head pitch nod | `+0.6°·sin(2π t / 3.6 − 0.8)` (added to the cursor pitch) |
| head roll | `−0.6 × torso roll` (stays level) + wave tilt |
| arms abduction (both, outward) | `2.0° + 0.8°·Bth` |
| arms swing forward | `1.5°·sin(2π t / 3.6 + {armR: 0, armL: π})` |
| wings | `A = 4°·(1 + 1.5·boost)`, `φ_w += 2π·dt·(1 + 0.6·boost)/2.6`; lift `A·sin φ_w`, fold `0.75·A·sin(φ_w + 0.6)`, mirrored per §2 |
| tail | sway `7°·sin(2π t/4.2) + 2.5°·sin(2π t/1.7 + 1.0)`; lift `R_x`: `2°·sin(2π t/3.1)` |
| pedestal | groundIntensity × `(1 + 0.08·Bth)`; trace glints via `u_fx.x` |
| halo | twinkle via `u_fx.x` (shader) |

### 6.3 Cursor and head tracking

- `pointermove` on `window` (passive). `nx = clamp((clientX − canvasCentreX) / (innerWidth/2), −1, 1)`, `ny`
  likewise with height.
- World look yaw `= 32°·nx`, pitch `= clamp(−14°·ny, −10°, +12°)` (cursor above → look up).
  `total = worldYaw − rootYaw`, `torsoYawTarget = clamp(0.3·total, ±12°)`,
  `headYawTarget = clamp(total − torsoYawTarget, ±35°)`. All sprung.
- No pointer (left the window, blur, or 2.5 s after the last touch): `worldYaw = 0` at half strength
  (`total = −0.5·rootYaw`) and pitch 0. It keeps half-watching you while it drifts.
- Tracking fades in after the entrance completes (targets stay 0 until then).

### 6.4 Drag, inertia, tap

- The canvas gets `touch-action: pan-y pinch-zoom` (vertical swipes keep scrolling the page, and a two-finger pinch still
  zooms the page, WCAG 1.4.4; the browser then fires `pointercancel`) and cursor `grab`, or
  `grabbing` while dragging (set by the module).
- `pointerdown` (primary) → `setPointerCapture`. `dragYaw += dx · 200° / canvasCssWidth`. Velocity = EMA
  (α 0.35) of dYaw/dt.
- `pointerup`: a move of < 6 px and < 350 ms is a **tap → `wave()`**. Otherwise inertia: `v` clamped ±720°/s,
  `dragYaw += v·dt`, `v *= exp(−4.5·dt)`. When |v| < 25°/s, wrap dragYaw to (−180°, 180°] and hand it to the
  **spring** (target 0, initial velocity v), so it returns the short way after a full spin.
- `pointercancel` (the browser took the gesture for scrolling) → same as release without inertia.
- Yaw-invariant framing (§7) means a full spin never clips.

### 6.5 Entrance "materialise" (once, when running = true AND at least 60 % of the card is on screen; 1.6 s)

The clock holds until the card is **armed** (IntersectionObserver thresholds `[0, 0.6]`; a card taller than the viewport
arms when it covers 90 % of the viewport height). Until then the loop may run but draws an empty buffer (scan front below
the feet, pedestal off). Otherwise it started when only the horn tips entered and was over before the feet scrolled in.

`T` = seconds since the entrance started, `ENT_END = 1.6`:

- groundIntensity = `EASE(clamp(T/0.6))`, times `1 + 0.08·Bth·clamp((T − 1.0)/0.6)` (the breath fades in, no pop).
  Pulse ring: radius `0.25 + 1.15·EASE(clamp(T/1.1))` (Rg units), intensity `(1 − EASE(clamp(T/1.1)))·1.2`.
- scanFront = `−0.15 + (bounds.max.y + 0.6)·s`, `u = clamp((T − 0.35)/1.25)`, `s = u²(3 − 2u)` (smoothstep, not EASE: the
  expo-out curve crossed the body in 0.2 s). Peak about 9 studs/s, 10 % to 90 % in about 0.8 s. At `T ≥ 1.6` set
  `u_fx.y = 999` (off). Cursor tracking and a queued `wave()` start at `T ≥ 1.6`.
- Host: the canvas opacity fade must be near-instant (the demo uses 120 ms linear), or the scan plays under a partial fade.
- Fragment (modes 0 and 1), in bind space, so animation does not disturb the front:
  ```glsl
  if (u_fx.y < 90.0) {
    float h = v_bind.y + 0.08 * (vnoise(v_bind.xz * 4.0 + vec2(v_bind.y * 1.3)) - 0.5);   // ragged front
    float d = u_fx.y - h;  if (d < 0.0) discard;
    float band  = 1.0 - clamp(d / 0.45, 0.0, 1.0);
    float lines = 0.55 + 0.45 * step(0.5, fract(v_bind.y * 22.0 - u_fx.x * 3.0));        // rising scanlines
    scan = mix(AMBER, TEAL, band * band * band) * band * band * lines * 3.0 + TEAL * smoothstep(0.035, 0.0, d) * 4.0;
  }
  // vnoise = 2D value noise over a sin-free hash (e.g. Dave Hoskins hash12)
  ```
  Result: a teal edge with an amber afterglow and scanlines, rising from the feet to the horn tips.
- `wave()` called before or during the entrance is queued and plays right after it.

### 6.6 `wave()` (right arm, shoulder pivot)

`T` = seconds since the wave started, `a` = armR abduction:

- 0 → 0.32 s: `a = a0 + (140° − a0)·EASE(T/0.32)` (a0 = current angle).
- 0.32 → 1.22 s: `a = 140° + 14°·sin(2π (T − 0.32)/0.30)` (3 waves, so it stays in the validated 126–154° range).
- ≥ 1.22 s: hand `(a, da/dt)` to the **spring** toward the idle target (the oscillator ends at phase 0 with peak
  velocity, which the spring carries through naturally).
- Accents: head roll target +6° for T < 1.4 s (sprung); wing boost = 1 for T < 1.2 s then decays
  (`boost *= exp(−3·dt)`); pedestal pulse ring as in the entrance.
- A call while T < 1.22 s is ignored. The host rate-limits hover waves (see §9).

### 6.7 Reduced motion (`opts.reducedMotion === true`): a still, beautifully lit frame

No entrance, idle, drift, cursor tracking, drag, inertia, glints or twinkle (pass time = 0). Static pose: rootYaw
−16°, head yaw +10° and pitch +2° (looks at you), arms at 2°, wings at rest, groundIntensity 1. Render **one frame**
on ready, then only on resize or context restore. **No rAF loop.** `wave()` renders one frame with the arm at 140°
and head roll 6°, then after 1.6 s one frame at rest: a state change, not an animation. Taps call `wave()`. Target
look: `docs/lookdev-static-m16.png`.

### 6.8 Run state, lifecycle, performance

- `running = ready && hostActive && intersecting && document.visibilityState === 'visible' && !contextLost && !reducedMotion`.
  The module observes its own canvas (IntersectionObserver, thresholds `[0, 0.6]`: running at any intersection, entrance armed at 60 %) and listens to `visibilitychange`.
  `setActive(false)` is a host override (for example a modal), and **`hostActive` defaults to true**. When
  `running` turns false, cancel rAF. When it turns true, restart without a time jump (paused time is not
  animation time).
- `ResizeObserver` on the canvas (`contentRect × devicePixelRatio`; `devicePixelContentBoxSize` reports CSS px under DPR emulation), plus a one-shot `matchMedia('(resolution: Ndppx)')` watcher re-armed on every change, because a DPR change with an unchanged CSS size does not fire the observer.
  `dpr = min(devicePixelRatio, 2) × dynScale`, capped so `w·h ≤ 1.35 MP`. Resize the drawing buffer and the
  framing only there, never inside the frame.
- Dynamic resolution: if the EMA of the rAF interval stays > 24 ms for 90 consecutive frames,
  `dynScale −= 0.25` (min 1.0 effective DPR). Never step up within a session. Resizing clears the buffer, so the step-down redraws in the same task.
- **No per-frame allocation**: preallocated `Float32Array`s for 8 bone matrices, quaternions and scratch; no
  closures, array literals or template strings in the frame path.
- Budget: JS frame work ≤ 1 ms on a desktop and ≤ 4 ms under 4× CDP CPU throttle. GPU work is about
  1 MP × a light shader. Report both (§10).
- Context loss: `webglcontextlost` → `preventDefault()`, stop, start a 3 s timer. If it is not restored in time,
  raise `onError(code 'context-lost')`. `webglcontextrestored` → rebuild everything from the retained
  `ArrayBuffer` and `ImageBitmap`s, then resume (or re-render one frame in reduced motion). A loss before `boot()` parks the
  downloaded assets and boots on restore; every `onError` argument is a `PlayerError`.

---

## 7. Camera framing (B)

Fixed per resize, never per frame (no zoom pumping). Yaw-invariant, so drift, drag spins, the wave and the
horns all fit:

```
fovY = 30°   (portrait lens; small distortion, close to Roblox's look)
elev = 8°    (camera above, looking slightly down → the pedestal reads as an ellipse)
yLo  = −0.85                      (room for the front of the pedestal ellipse)
yHi  = bounds.max.y + 0.12        (horn tips)
halfH = (yHi − yLo)/2 · 1.04
halfW = radiusXZ · 1.06           (any yaw fits)
dist  = max(halfH / tan(fovY/2), halfW / (tan(fovY/2)·aspect)) + 0.35·radiusXZ
target = (0, (yHi + yLo)/2, 0);  eye = target + dist·(0, sin elev, cos elev);  up = +Y
near = max(0.1, dist − 2.5·radiusXZ);  far = dist + 2.5·radiusXZ
```

At 4:5 this gives dist 16.54, eye (0, 5.45, 16.38) and target y 3.15, which is exactly the framing of the
`docs/lookdev-*.png` renders. It works for any aspect (height-limited when wider). The card is 4:5 at every
breakpoint: 358×447.5 on a 390 px phone, 460×575 at 1440, 520×650 at 2560 (§9 sizing rule).

---

## 8. Public API (B), exact

```ts
// src/player/index.ts: the only public entry; lazily imported by hosts
export interface PlayerOptions {
  baseUrl: string;                 // ends with '/', e.g. `${import.meta.env.BASE_URL}roblox/`
  reducedMotion: boolean;          // host passes matchMedia('(prefers-reduced-motion: reduce)').matches; remount to change
  onReady?(): void;                // once: resources uploaded and the first frame drawn without error
  onError?(e: unknown): void;      // once: Error with name 'PlayerError' and code below; host shows the 2D fallback
  onStats?(s: PlayerStats): void;  // optional, ~1 Hz, for debug overlays and tests (additive to the brief's API)
}
export interface PlayerHandle { destroy(): void; wave(): void; setActive(active: boolean): void; }
export interface PlayerStats {
  fps: number; cpuMs: number; cpuMsMax: number; dpr: number; width: number; height: number;
  draws: number; triangles: number; gl: 1 | 2; running: boolean;
}
export type PlayerErrorCode = 'webgl-unavailable' | 'shader' | 'network' | 'format' | 'decode' | 'context-lost';
export function mountPlayer(canvas: HTMLCanvasElement, opts: PlayerOptions): PlayerHandle;
```

- `mountPlayer` returns synchronously and starts fetching immediately. `onReady` and `onError` are **never** called
  synchronously inside it. After `onError` the module releases everything (like `destroy`) and stays inert.
- In full motion, the first frame drawn may be "empty" (scan below the feet, ground at 0) if not yet running. That
  is still `onReady`, so the host can fade the canvas in. The entrance plays when `running` first becomes true.
- `destroy()` is idempotent: cancel rAF, abort fetches (AbortController), disconnect the observers, remove every
  listener, delete GL objects, `WEBGL_lose_context.loseContext()`, close `ImageBitmap`s. After `destroy`, `wave`
  and `setActive` are no-ops.
- The canvas is **decorative**: the host sets `aria-hidden="true"`. Nothing in it is the only way to get
  information. The keyboard path to the wave is the "Say hi" button.

---

## 9. Demo page (B): `index.html` + `src/demo/*`

A sandbox styled like the site (dark only), testing the card exactly as it will sit on mrh.lol:

- Tokens: `--bg-0 #06080e`, `--bg-1 #0b0e17`, `--bg-2 #161b28`, `--amber #ffc247`, `--teal #3ee0d0`,
  `--violet #a78bfa`, `--blue #60a5fa`, ink `#eef2fb / #b8c0d4 / #8a93a8 / #5a6379` (the last is decorative only:
  3.3:1). `--ease` and `--spring` from §6.1. 8 px rhythm. One system sans plus one mono (`ui-monospace`).
  `html { overflow-x: clip }`, never `hidden`. Grain overlay ~3 % (inline SVG `feTurbulence` data URI,
  `pointer-events: none`). Page gradient `#06080e → #161b28`.
- Layout: a 100svh intro block ("mrh.lol / player sandbox", scroll hint) so the card starts **below the fold**.
  Then a "Who I am"-style section: two columns ≥ 900 px (text left, card right), stacked below that. 16 px side
  gutters at 390 px.
- **Card**: `aspect-ratio: 4/5; width: 100%; max-width: clamp(358px, 32vw, 520px)`, radius 24 px. Depth through light,
  not borders: background `radial-gradient(120% 70% at 50% 100%, rgba(255,194,71,.10), transparent 60%)` over
  `--bg-1`, 1 px hairline `rgba(238,242,251,.07)`, faint inner top highlight. Canvas absolutely fills the card
  (`inset: 0`, `aria-hidden`).
  - Top-left label in mono 12 px, tracking 0.12em: **`PLAYER 1 · MrHarold0011 · Roblox`** ("PLAYER 1" in amber),
    plus a status dot: amber pulsing "SPAWNING" while loading, teal "ONLINE" on ready, grey "2D" on fallback.
    No pulse under reduced motion.
  - Bottom: **"Say hi"** primary button (amber bg, `#06080e` text, ≥ 44 px, styled focus ring 2 px teal offset
    3 px, hover and press feedback < 100 ms using the spring token) → `wave()`. Secondary link **"View on Roblox ↗"**
    → `https://www.roblox.com/users/1113999731/profile` (`target="_blank" rel="noopener noreferrer"`, ≥ 44 px
    target).
  - Hover (`(hover: hover) and (pointer: fine)` only): `pointerenter` on the card → `wave()`, at most every 8 s
    and never while dragging.
  - Optional flourish: a small mono "hi!" bubble near the head during a wave (opacity only).
- **Fallback**: `<picture>` with `fallback/avatar-300x440.avif|webp|png` (srcset with the 150×220 set),
  `width="300" height="440"`, alt `MrHarold's Roblox avatar: curved black horns, messy black hair, skull-teeth
  mask, black skull-print sweater, one white and one black wing with violet lightning`. Bottom-centred, height
  ~84 %. Hidden unless the card has `.is-fallback` (set on `onError`). Shown by `<noscript>` CSS without JS.
- Lazy mount: IntersectionObserver `rootMargin: '600px 0px'` → `import('./player')` (its own chunk) →
  `mountPlayer`. Fade the canvas in on `onReady` (opacity 0 → 1, 500 ms, `--ease`).
- URL flags: `?rm=1` forces reduced motion; `?fail=1` mounts with a bogus baseUrl (→ `network` error → fallback);
  `?debug=1` shows an overlay (fps, cpu ms avg/max, dpr, size, draws, tris, GL version, `manifest.stats`) with
  buttons: wave, active on/off, lose/restore context (`WEBGL_lose_context`), remount reduced. Exposes
  `window.__player` (handle + last stats) for tests.

---

## 10. Testing and acceptance

Environment: Windows 11, Node 24, npm. Headless tests use **puppeteer-core** with
`executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'`. It launches its own instance with a temp
profile and gets hardware WebGL2 here (ANGLE D3D11, RTX 4080). **Never** drive the user's interactive Chrome or
the claude-in-chrome tools. Never read `.env*` files.

A (pipeline) is done when:
- `npm run build:avatar` regenerates `public/roblox/` from `assets-src/roblox` in < 60 s, deterministically
  (same input → same bin and texture bytes → same hashes; only `generatedAt` changes).
- `npm run check:avatar` passes. **Structural checks fail hard**: header ↔ manifest, all indices < N, bones and
  parents valid, blended `parent == bones[bone].parent`, draws tile `[0, I)` exactly, textures exist with POT dims
  as stated, decoded bounds == manifest bounds (±1e-3). The **§3.2 expectations** (classification, tris per
  material, pivots) are asserted when the source fingerprint matches this avatar (22,791 tris, 17 groups), and are
  only warnings otherwise (a refreshed outfit).
- Payload is reported (raw, gzip, brotli) and is ≤ ~600 KB total; `scripts/out/rig-debug.png` looks like
  `docs/rig-wave-140.png`; the README covers the refresh procedure.

B (renderer + demo) is done when:
- `npm run build` passes `tsc --noEmit`. The lazy player chunk is **≤ 12 KB gzip** (report the exact number) with
  zero runtime deps.
- Screenshots in `tests/out/` at 390×844 @3, 768×1024 @2, 1440×900 @2 and 2560×1440 @1: after the entrance, mid-wave
  (≈ 0.45 s after "Say hi"), reduced motion, `?fail=1` fallback, and after a forced context loss + restore. They
  visually match `docs/lookdev-*.png` (exposure, black outfit, teal rim, violet bolt outlines, pedestal), with
  nothing clipped at any yaw.
- `scrollWidth ≤ innerWidth` at 390 px, mid-animation included. rAF stops when scrolled offscreen, on
  `setActive(false)` and when hidden (count frames via `onStats`). Reduced motion = exactly one frame (plus wave
  pose swaps). `?fail=1` shows the 2D fallback.
- CPU frame cost (`onStats.cpuMs`) is reported unthrottled and at 4× throttle (CDP
  `Emulation.setCPUThrottlingRate`), within §6.8.

Both: comment the non-obvious (why, not what). Don't edit the other side's files or this SPEC.
