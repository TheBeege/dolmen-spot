import { ALL_HEXES, HEX_GRID_META, HEX_CELLS } from './hex-grid';
import type { HexCoord, HexPos } from './types';

const { colPitch, rowPitch, labelX_col1, labelY_row1, labelToCenterDy } = HEX_GRID_META;
const ORIGIN_X = labelX_col1;
const ORIGIN_Y = labelY_row1 + labelToCenterDy;

const SQRT3 = Math.sqrt(3);
// The printed grid isn't quite regular: columns are 232.5 px apart and rows
// 268 px. A regular flat-top hex of size s has a column pitch of 1.5·s and a
// row pitch of √3·s, so use one scale per axis. Vertices and pixelToHex then
// agree with hexCenter exactly: no slivers between columns, no drift.
const SCALE_X = colPitch / 1.5;
const SCALE_Y = rowPitch / SQRT3;

const COORD_RE = /^\d{4}$/;

export function formatCoord(col: number, row: number): HexCoord {
  return `${col.toString().padStart(2, '0')}${row.toString().padStart(2, '0')}`;
}

export function parseCoord(coord: HexCoord): HexPos | null {
  if (!COORD_RE.test(coord)) return null;
  return { col: parseInt(coord.slice(0, 2), 10), row: parseInt(coord.slice(2, 4), 10) };
}

/** True if `coord` is a hex on the printed map. */
export function isValidHex(coord: unknown): coord is HexCoord {
  return typeof coord === 'string' && COORD_RE.test(coord) && Object.hasOwn(HEX_CELLS, coord);
}

/**
 * Pixel coordinates (in the source image's frame) for the center of a hex.
 * Useful for rendering an SVG that scales with viewBox = (0, 0, imageWidth, imageHeight).
 */
export function hexCenter(col: number, row: number): { x: number; y: number } {
  const ci = col - 1;
  const ri = row - 1;
  const x = ORIGIN_X + ci * colPitch;
  // Odd-q offset: odd 0-indexed columns (printed columns 02, 04, …) sit half
  // a row lower. `& 1` (unlike `% 2`) is also right for negative columns.
  const y = ORIGIN_Y + ri * rowPitch + (ci & 1 ? rowPitch / 2 : 0);
  return { x, y };
}

const CENTERS: ReadonlyMap<HexCoord, { x: number; y: number }> = new Map(
  ALL_HEXES.map((h) => [h, hexCenter(HEX_CELLS[h].col, HEX_CELLS[h].row)]),
);

/** Center of a hex on the printed map, or null if `coord` isn't one. */
export function hexCenterOf(coord: HexCoord): { x: number; y: number } | null {
  return CENTERS.get(coord) ?? null;
}

/**
 * Six vertices (flat-top) of the hex at (col, row) in source-image pixel coords.
 * Vertex 0 is at the right; the rest run clockwise on screen (y points down).
 */
export function hexVertices(col: number, row: number): Array<{ x: number; y: number }> {
  const { x: cx, y: cy } = hexCenter(col, row);
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i; // 0, 60, 120, ...
    out.push({ x: cx + SCALE_X * Math.cos(angle), y: cy + SCALE_Y * Math.sin(angle) });
  }
  return out;
}

/**
 * SVG path 'd' string for the hex polygon at (col, row).
 */
export function hexPath(col: number, row: number): string {
  const verts = hexVertices(col, row);
  return `M ${verts.map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(' L ')} Z`;
}

/**
 * Convert a pixel position (in the image frame) to the hex drawn there.
 * Returns null if no hex of the printed map is at that location.
 *
 * Algorithm: convert to fractional axial coords (flat-top, with the per-axis
 * scales above), round to the nearest cube coord, then convert back to
 * offset (col, row).
 */
export function pixelToHex(px: number, py: number): HexCoord | null {
  // Fractional axial coordinates around the (col=1, row=1) center.
  const dx = px - ORIGIN_X;
  const dy = py - ORIGIN_Y;
  // For flat-top: q = (2/3)·x / size, r = (−1/3)·x / size + (√3/3)·y / size.
  const q = ((2 / 3) * dx) / SCALE_X;
  const r = ((-1 / 3) * dx) / SCALE_X + ((SQRT3 / 3) * dy) / SCALE_Y;
  const s = -q - r;
  // Cube round
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - s);
  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs;
  } else if (rDiff > sDiff) {
    rr = -rq - rs;
  }
  // axial -> odd-q offset (Red Blob Games' "odd-q": odd 0-indexed columns
  // are shifted down, matching hexCenter):
  //   col_offset (0-indexed) = q
  //   row_offset (0-indexed) = r + (q - (q & 1)) / 2
  const col = rq + 1;
  const row = rr + ((rq - (rq & 1)) >> 1) + 1;
  const coord = formatCoord(col, row);
  return isValidHex(coord) ? coord : null;
}

/**
 * Bounding box of all hexes (plus a margin), for sizing the SVG viewBox.
 * HEX_CELLS is a frozen module-level constant, so the bounds never change
 * after load: compute once and freeze. An outlier hex would stretch the box
 * and leave empty viewBox padding around the playable area.
 */
const GRID_BOUNDS: Readonly<{ x: number; y: number; w: number; h: number }> = (() => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { x, y } of CENTERS.values()) {
    if (x - SCALE_X < minX) minX = x - SCALE_X;
    if (x + SCALE_X > maxX) maxX = x + SCALE_X;
    if (y - SCALE_Y < minY) minY = y - SCALE_Y;
    if (y + SCALE_Y > maxY) maxY = y + SCALE_Y;
  }
  const pad = HEX_GRID_META.hexSize * 0.3;
  return Object.freeze({
    x: minX - pad,
    y: minY - pad,
    w: maxX - minX + 2 * pad,
    h: maxY - minY + 2 * pad,
  });
})();

export function gridBounds(): Readonly<{ x: number; y: number; w: number; h: number }> {
  return GRID_BOUNDS;
}

type Point = { x: number; y: number };

/** > 0 if o → a → b turns counter-clockwise (in y-up coordinates). */
function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Convex hull of the hex centres (Andrew's monotone chain), counter-clockwise
 * in y-up coordinates. The map's pan limit: because it's convex, the nearest
 * point of it moves smoothly as a point outside it moves.
 */
export const CENTRE_HULL: readonly Point[] = (() => {
  const pts = [...CENTERS.values()].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out;
  };
  const lower = half(pts);
  const upper = half([...pts].reverse());
  return Object.freeze([...lower.slice(0, -1), ...upper.slice(0, -1)]);
})();

/** The point of segment a–b nearest to p. */
function nearestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** How far beyond the hull of the hex centres the view's centre may be panned. */
export const PAN_MARGIN = HEX_GRID_META.hexSize / 2;

/**
 * The most zoomed-in view, as a fraction of the whole map's width and height.
 * With the pan limit, a smaller view centred at the edge of the map's
 * bottom-right staircase could show no hex at all (at 5% it did). hex.test.ts
 * checks that this one shows part of a hex all along the limit's boundary.
 */
export const MIN_VIEW_FRACTION = 0.08;

/**
 * `p` if it lies within `margin` of the hull of the hex centres; otherwise the
 * nearest point that does. The region is convex, so as `p` moves the result
 * never moves further than `p` did.
 */
export function nearestPointOnMap(p: Point, margin = 0): Point {
  const n = CENTRE_HULL.length;
  let inside = true;
  for (let i = 0; i < n; i++) {
    if (cross(CENTRE_HULL[i], CENTRE_HULL[(i + 1) % n], p) < 0) {
      inside = false;
      break;
    }
  }
  if (inside) return p;
  let best = CENTRE_HULL[0];
  let bestD2 = Infinity;
  for (let i = 0; i < n; i++) {
    const q = nearestOnSegment(p, CENTRE_HULL[i], CENTRE_HULL[(i + 1) % n]);
    const d2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = q;
    }
  }
  const d = Math.sqrt(bestD2);
  if (d <= margin) return p;
  const k = margin / d;
  return { x: best.x + (p.x - best.x) * k, y: best.y + (p.y - best.y) * k };
}
