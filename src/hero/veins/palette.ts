// Colours and pre-rendered glow sprites for the Forge Board (BUILD_PLAN §7.3–7.4).
// Canvas can't read CSS custom properties per stroke, so these triples mirror the tokens in styles/global.css
// (amber-200/300/400/500, teal-300/400/500, blue-400, ink-300).
export type RGB = readonly [number, number, number];

export const AMBER_200: RGB = [255, 233, 189];
export const AMBER_300: RGB = [255, 217, 138];
export const AMBER_400: RGB = [255, 194, 71];
export const AMBER_500: RGB = [245, 166, 35];
export const TEAL_300: RGB = [142, 240, 230];
export const TEAL_400: RGB = [62, 224, 208];
export const TEAL_500: RGB = [18, 181, 170];
export const VIOLET_400: RGB = [167, 139, 250];
export const BLUE_400: RGB = [96, 165, 250];
export const INK_300: RGB = [170, 179, 199];
export const COPPER = AMBER_400;
export const STEEL: RGB = [150, 162, 188];
export const WARM_STEEL: RGB = [170, 166, 160];

export const rgba = (c: RGB, a: number): string => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export interface Sprites {
  amber: HTMLCanvasElement; // 32 px spark, white-hot core
  teal: HTMLCanvasElement; // 24 px
  hot: HTMLCanvasElement; // 36 px lantern hot spot
}

export function glowSprite(size: number, dpr: number, stops: Array<[number, string]>): HTMLCanvasElement {
  const px = Math.max(2, Math.round(size * Math.min(dpr, 2)));
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  if (!g) throw new Error('sprite context');
  const grad = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, px, px);
  return c;
}

/** Rendered once per DPR change into small offscreen canvases; per-frame glows are then a single drawImage each. */
export function makeSprites(dpr: number): Sprites {
  return {
    amber: glowSprite(32, dpr, [[0, '#fff6e0'], [0.14, rgba(AMBER_200, 0.95)], [0.4, rgba(AMBER_400, 0.4)], [1, rgba(AMBER_400, 0)]]),
    teal: glowSprite(24, dpr, [[0, rgba(TEAL_300, 1)], [0.2, rgba(TEAL_300, 0.8)], [0.5, rgba(TEAL_400, 0.28)], [1, rgba(TEAL_400, 0)]]),
    hot: glowSprite(36, dpr, [[0, rgba(AMBER_300, 0.95)], [0.3, rgba(AMBER_400, 0.4)], [1, rgba(AMBER_400, 0)]]),
  };
}
