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
