// The static board layer (BUILD_PLAN §7.4): bloom pass + core pass batched into ≤ 48 strokes, node decorations and the
// chip silkscreen. It draws in CSS px — the engine owns the DPR transform.
import type { Network } from './types';
import { AMBER_400, COPPER, INK_300, STEEL, TEAL_400, VIOLET_400, BLUE_400, WARM_STEEL, mix, rgba } from './palette';
import type { RGB } from './palette';

const NB = 48;
// Stroke buckets = efar step (0‥7) × width class (0‥5). PCB traces use classes 0–1, veins 2–5, so one stroke() covers
// every edge of one hue and one width: 8 × 6 = 48 strokes for the whole board.
const PCB_W = [1.06, 1.2];
const VEIN_W = [0.6, 0.9, 1.2, 1.5];

function widthClass(pcb: number, w: number): number {
  if (pcb) return w < 1.12 ? 0 : 1;
  return 2 + Math.min(3, Math.max(0, Math.floor((w - 0.45) / 0.3)));
}

export class Board {
  net: Network;
  /** edge ids in reveal order (ascending ebirth) */
  order: Uint32Array;
  /** decorated node ids in reveal order (ascending nbirth) */
  norder: Uint32Array;
  /** edges / decorated nodes already on the static canvas */
  drawnEdges = 0;
  drawnNodes = 0;
  private key: Uint8Array;
  private ncls: Uint8Array;
  private tmp: Uint32Array;
  private cnt = new Uint32Array(NB + 1);
  private coreStyle: string[] = [];
  private coreWidth: number[] = [];
  private bloomStyle: string[] = [];

  constructor(net: Network) {
    this.net = net;
    const E = net.edgeCount;
    const ebirth = net.ebirth;
    this.order = Uint32Array.from({ length: E }, (_, i) => i).sort((a, b) => ebirth[a] - ebirth[b]);
    this.tmp = new Uint32Array(E);
    this.key = new Uint8Array(E);
    for (let e = 0; e < E; e++) this.key[e] = Math.round(net.efar[e] * 7) * 6 + widthClass(net.epcb[e], net.ewidth[e]);

    // 0 none · 1 pad · 2 via · 3 pin (top) · 4 pin (right) · 5 junction · 6/7/8 nodule teal/violet/blue
    this.ncls = new Uint8Array(net.nodeCount);
    const chipRight = net.chip.x + net.chip.w;
    const decorated: number[] = [];
    for (let i = 0; i < net.nodeCount; i++) {
      const k = net.nkind[i];
      let c = 0;
      if (k === 1) c = 1;
      else if (k === 2) c = 2;
      else if (k === 3) c = net.nx[i] > chipRight ? 4 : 3;
      else if (k === 5) c = 5;
      else if (k === 4) {
        // Colour by a hash of position so it is stable across regenerations of the same layout.
        const h = (Math.imul(Math.round(net.nx[i]), 73856093) ^ Math.imul(Math.round(net.ny[i]), 19349663)) >>> 0;
        c = 6 + (h % 4 < 2 ? 0 : h % 4 === 2 ? 1 : 2);
      }
      this.ncls[i] = c;
      if (c) decorated.push(i);
    }
    const nbirth = net.nbirth;
    this.norder = Uint32Array.from(decorated).sort((a, b) => nbirth[a] - nbirth[b]);

    for (let b = 0; b < NB; b++) {
      const efar = Math.floor(b / 6) / 7;
      const wc = b % 6;
      if (wc < 2) {
        this.coreStyle.push(rgba(mix(COPPER, STEEL, Math.min(1, efar * 1.4)), 0.36 - 0.12 * efar));
        this.coreWidth.push(PCB_W[wc]);
      } else {
        this.coreStyle.push(rgba(mix(WARM_STEEL, TEAL_400, Math.min(1, 0.25 + efar)), 0.22 - 0.06 * efar));
        this.coreWidth.push(VEIN_W[wc - 2]);
      }
    }
    for (let i = 0; i < 8; i++) this.bloomStyle.push(rgba(mix(COPPER, STEEL, Math.min(1, (i / 7) * 1.4)), 0.05));
  }

  reset() {
    this.drawnEdges = 0;
    this.drawnNodes = 0;
  }

  /** Strokes the edges order[from..to) — one path per bucket. */
  private batch(ctx: CanvasRenderingContext2D, from: number, to: number, bloom: boolean) {
    const { net, order, key, cnt, tmp } = this;
    const { nx, ny, ea, eb } = net;
    cnt.fill(0);
    let m = 0;
    for (let k = from; k < to; k++) {
      const e = order[k];
      if (bloom && !(net.epcb[e] && net.efar[e] < 0.5)) continue;
      cnt[(bloom ? (key[e] / 6) | 0 : key[e]) + 1]++;
      m++;
    }
    if (!m) return;
    for (let b = 0; b < NB; b++) cnt[b + 1] += cnt[b];
    const at = cnt.slice(0, NB);
    for (let k = from; k < to; k++) {
      const e = order[k];
      if (bloom && !(net.epcb[e] && net.efar[e] < 0.5)) continue;
      tmp[at[bloom ? (key[e] / 6) | 0 : key[e]]++] = e;
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let b = 0; b < NB; b++) {
      if (cnt[b + 1] === cnt[b]) continue;
      ctx.beginPath();
      for (let k = cnt[b]; k < cnt[b + 1]; k++) {
        const e = tmp[k];
        ctx.moveTo(nx[ea[e]], ny[ea[e]]);
        ctx.lineTo(nx[eb[e]], ny[eb[e]]);
      }
      ctx.strokeStyle = bloom ? this.bloomStyle[b] : this.coreStyle[b];
      ctx.lineWidth = bloom ? 5 : this.coreWidth[b];
      ctx.stroke();
    }
  }

  private drawEdges(ctx: CanvasRenderingContext2D, from: number, to: number, bloom: boolean) {
    if (to <= from) return;
    if (bloom) {
      ctx.globalCompositeOperation = 'lighter';
      // Bloom buckets only span efar 0‥3 (PCB with efar < 0.5), so the key space is reused with the efar step as index.
      this.batch(ctx, from, to, true);
      ctx.globalCompositeOperation = 'source-over';
    }
    this.batch(ctx, from, to, false);
  }

  private drawNodes(ctx: CanvasRenderingContext2D, from: number, to: number) {
    if (to <= from) return;
    const { net, norder, ncls } = this;
    const { nx, ny } = net;
    const fillAll = (cls: number, color: string, draw: (x: number, y: number) => void) => {
      ctx.beginPath();
      let any = false;
      for (let k = from; k < to; k++) {
        const n = norder[k];
        if (ncls[n] === cls) {
          draw(nx[n], ny[n]);
          any = true;
        }
      }
      if (any) {
        ctx.fillStyle = color;
        ctx.fill();
      }
    };
    const dot = (r: number) => (x: number, y: number) => {
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    };
    fillAll(1, rgba(AMBER_400, 0.42), dot(2.3));
    fillAll(2, rgba(INK_300, 0.5), dot(0.9));
    // via rings
    ctx.beginPath();
    let rings = false;
    for (let k = from; k < to; k++) {
      const n = norder[k];
      if (ncls[n] === 2) {
        ctx.moveTo(nx[n] + 3, ny[n]);
        ctx.arc(nx[n], ny[n], 3, 0, Math.PI * 2);
        rings = true;
      }
    }
    if (rings) {
      ctx.strokeStyle = rgba(INK_300, 0.38);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    fillAll(3, rgba(AMBER_400, 0.55), (x, y) => ctx.rect(x - 1.5, y - 4, 3, 6));
    fillAll(4, rgba(AMBER_400, 0.55), (x, y) => ctx.rect(x - 2, y - 1.5, 6, 3));
    fillAll(5, rgba(AMBER_400, 0.35), dot(1.6));
    const nod: RGB[] = [TEAL_400, VIOLET_400, BLUE_400];
    for (let i = 0; i < 3; i++) fillAll(6 + i, rgba(nod[i], 0.75), dot(1.5));
  }

  /** Reveal everything with birth ≤ front that is not yet on the canvas (growth / creep). */
  advance(ctx: CanvasRenderingContext2D, front: number, bloom: boolean) {
    const { net, order, norder } = this;
    let k = this.drawnEdges;
    while (k < order.length && net.ebirth[order[k]] <= front) k++;
    this.drawEdges(ctx, this.drawnEdges, k, bloom);
    this.drawnEdges = k;
    let n = this.drawnNodes;
    while (n < norder.length && net.nbirth[norder[n]] <= front) n++;
    this.drawNodes(ctx, this.drawnNodes, n);
    this.drawnNodes = n;
  }

  /** Clean redraw of everything revealed so far (resize, DPR change, context restore, end of growth). */
  redraw(ctx: CanvasRenderingContext2D, bloom: boolean) {
    const { net } = this;
    ctx.clearRect(0, 0, net.width, net.height);
    this.drawEdges(ctx, 0, this.drawnEdges, bloom);
    this.drawNodes(ctx, 0, this.drawnNodes);
    this.silk(ctx);
  }

  /** Corner brackets + pin-1 dot: the chip's silkscreen. 16 px, 1 px, ink-300 @ 0.18. */
  silk(ctx: CanvasRenderingContext2D) {
    const { x, y, w, h } = this.net.chip;
    // Clamp inside the canvas: on phones the padded chip touches the screen edge, and a bracket half off-canvas reads as a glitch.
    const x0 = Math.max(x, 2);
    const y0 = Math.max(y, 2);
    const x1 = Math.min(x + w, this.net.width - 2);
    const y1 = y + h;
    const L = 16;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
    ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
    ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1);
    ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
    ctx.strokeStyle = rgba(INK_300, 0.18);
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(Math.max(x - 8, 7), Math.max(y - 8, 7), 2, 0, Math.PI * 2);
    ctx.fillStyle = rgba(AMBER_400, 0.5);
    ctx.fill();
  }
}
