export interface Rect { x: number; y: number; w: number; h: number }
export type NetworkProfile = 'desktop' | 'phone' | 'og';

export interface GenerateOptions {
  width: number;          // field width, CSS px
  height: number;         // field height, CSS px
  chip: Rect;             // the hero content block, padded. Traces never enter it; pins sit on its top/right edges.
  avoid?: Rect[];         // extra keep-outs without pins (e.g. the scroll hint)
  seed: number;           // uint32 — same inputs ⇒ identical network
  profile: NetworkProfile;
}

/** 0 Bend · 1 Pad · 2 Via · 3 Pin · 4 Nodule · 5 Junction. Runtime constants: `NodeKind` in generate.ts. */
export type NodeKindValue = 0 | 1 | 2 | 3 | 4 | 5;

export interface Network {
  width: number;
  height: number;
  nodeCount: number;
  edgeCount: number;
  nx: Float32Array;       // node x, CSS px
  ny: Float32Array;       // node y, CSS px
  nkind: Uint8Array;      // NodeKindValue
  nbirth: Float32Array;   // growth distance at which the node appears
  ea: Uint32Array;        // edge start (the end nearer its root)
  eb: Uint32Array;        // edge end
  elen: Float32Array;     // edge length, CSS px
  ebirth: Float32Array;   // growth distance at the far end (eb) — reveal order
  efar: Float32Array;     // 0 at the chip … 1 in the far field (smoothstep of distance to the chip)
  epcb: Uint8Array;       // 1 = 45°-snapped PCB trace, 0 = organic vein
  ewidth: Float32Array;   // stroke width, CSS px
  adjStart: Uint32Array;  // CSR adjacency: edges touching node i are adjEdge[adjStart[i] .. adjStart[i+1]-1]
  adjEdge: Uint32Array;
  pins: Uint32Array;      // chip pin node ids, in order along the chip edges
  maxBirth: number;
  chip: Rect;             // echo of the input (silkscreen drawing)
}
