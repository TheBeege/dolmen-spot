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
