// SPEC 3.2 / 4.3 expectations for THIS avatar. Used for the console comparison and, when the source
// fingerprint matches (22,791 tris, 17 groups), as hard assertions in validate.mjs.
export const EXPECT = {
  tris: { body: 2203, shoes: 2008, hair: 2753, sweater: 2614, pants: 2667, bolts: 2278, wings: 2544, horns: 1856, mask: 2024, tail: 1468, halo: 376 },
  materialCount: 11, drawCount: 11,
  pivots: {
    root: [0, 0, 0], torso: [0, 2.279, 0], head: [0, 3.988, 0], armR: [-1.141, 3.538, -0.031], armL: [1.160, 3.538, -0.040],
    wingR: [-0.434, 3.140, -0.660], wingL: [0.435, 3.140, -0.660], tail: [0.005, 2.270, -0.260],
  },
  pivotTol: 0.01,
  bounds: { min: [-2.769, 0, -2.952], max: [2.770, 7.020, 1.242] }, boundsTol: 0.01, radiusXZ: 2.952, radiusTol: 0.01,
  vertexCount: 21150, indexCount: 68370, countTol: 0.02,
  // source-vertex (corner) counts, +-10 %
  sleeves: { armR: { rigid: 309, blended: 168 }, armL: { rigid: 266, blended: 171 } }, sleeveTol: 0.10,
  // material -> expected texture / flags
  materials: {
    body: { cull: 'back', texW: 512, texH: 256 }, shoes: { cull: 'back', texW: 256, texH: 256 }, hair: { cull: 'back', texW: 256, texH: 256 },
    sweater: { cull: 'none', texW: 1024, texH: 1024 }, pants: { cull: 'back', texW: 512, texH: 512 }, bolts: { cull: 'back', texW: 64, texH: 64 },
    wings: { cull: 'back', texW: 512, texH: 512 }, horns: { cull: 'back', texW: 128, texH: 128 }, mask: { cull: 'back', texW: 256, texH: 256 },
    tail: { cull: 'back', texture: null }, halo: { cull: 'none', shading: 'halo', pass: 'additive' },
  },
};
