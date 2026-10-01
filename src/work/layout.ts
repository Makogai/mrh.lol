// Bento plan for 1440 (12 columns), by project count (V2_DESIGN §3 / §2 BUILDS). Pure function of n, so SSR and client agree.
// The IN THE FORGE card is a cell like any other: it fills the gap in the last row, so rows are never ragged.
export interface Cell {
  kind: 'project' | 'forge';
  /** index into the ordered project list (project cells only) */
  i: number;
  /** column span at >= 64rem (of 12) */
  span: number;
  /** fixed height at >= 64rem; null = stretches over `rows` grid rows */
  h: number | null;
  rows: number;
  /** forge only: a slim 12-column banner instead of a card */
  slim?: boolean;
}

const p = (i: number, span: number, h: number | null, rows = 1): Cell => ({ kind: 'project', i, span, h, rows });
const f = (span: number, h: number, slim = false): Cell => ({ kind: 'forge', i: -1, span, h, rows: 1, slim });
const SLIM = 192;

export const MAX_PROJECTS = 8;

export function plan(n: number): Cell[] {
  if (n <= 0) return [f(12, 320, true)];
  if (n === 1) return [p(0, 7, 560), f(5, 560)];
  if (n === 2) return [p(0, 7, 600), p(1, 5, 600), f(12, SLIM, true)];
  // 7 (640) + a 5-column stack of two 312s (312 + 16 gap + 312 = 640)
  if (n === 3) return [p(0, 7, null, 2), p(1, 5, 312), p(2, 5, 312), f(12, SLIM, true)];
  if (n === 4) return [p(0, 7, 440), p(1, 5, 440), p(2, 5, 440), p(3, 7, 440), f(12, SLIM, true)];
  const cells = [p(0, 7, 480), p(1, 5, 480)];
  const rest = Math.min(n, MAX_PROJECTS) - 2;
  for (let k = 0; k < rest; k++) cells.push(p(k + 2, 4, 380));
  if (n < MAX_PROJECTS) {
    const left = rest % 3; // projects sitting in the last 4+4+4 row
    cells.push(left === 0 ? f(12, SLIM, true) : f(12 - 4 * left, 380));
  }
  return cells;
}
