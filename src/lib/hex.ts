import { HEX_GRID_META, HEX_CELLS } from './hex-grid';
import type { HexCoord } from './types';

const { colPitch, rowPitch, hexSize, labelX_col1, labelY_row1, labelToCenterDy } = HEX_GRID_META;
const ORIGIN_X = labelX_col1;
const ORIGIN_Y = labelY_row1 + labelToCenterDy;

const SQRT3 = Math.sqrt(3);

export interface HexPos {
  col: number;
  row: number;
}

export function formatCoord(col: number, row: number): HexCoord {
  return `${col.toString().padStart(2, '0')}${row.toString().padStart(2, '0')}`;
}

export function parseCoord(coord: HexCoord): HexPos | null {
  if (!/^\d{4}$/.test(coord)) return null;
  return { col: parseInt(coord.slice(0, 2), 10), row: parseInt(coord.slice(2, 4), 10) };
}

/**
 * Pixel coordinates (in the source image's frame) for the center of a hex.
 * Useful for rendering an SVG that scales with viewBox = (0, 0, imageWidth, imageHeight).
 */
export function hexCenter(col: number, row: number): { x: number; y: number } {
  const ci = col - 1;
  const ri = row - 1;
  const x = ORIGIN_X + ci * colPitch;
  // Even-q offset: even columns (col=2,4,...; ci=1,3,...) shifted DOWN by half a row pitch.
  const y = ORIGIN_Y + ri * rowPitch + (ci % 2 === 1 ? rowPitch / 2 : 0);
  return { x, y };
}

/**
 * Six vertices (flat-top) of the hex at (col, row) in source-image pixel coords.
 * Vertex 0 is at the right; vertices proceed counter-clockwise.
 */
export function hexVertices(col: number, row: number): Array<{ x: number; y: number }> {
  const { x: cx, y: cy } = hexCenter(col, row);
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i; // 0, 60, 120, ...
    out.push({ x: cx + hexSize * Math.cos(angle), y: cy + hexSize * Math.sin(angle) });
  }
  return out;
}

/**
 * SVG path 'd' string for the hex polygon at (col, row).
 */
export function hexPath(col: number, row: number): string {
  const verts = hexVertices(col, row);
  return `M ${verts.map((v) => `${v.x.toFixed(2)},${v.y.toFixed(2)}`).join(' L ')} Z`;
}

/**
 * Convert a pixel position (in the image frame) to the nearest hex coord.
 * Returns null if no valid hex exists at that location.
 *
 * Algorithm: convert to fractional axial coords (flat-top), then round to
 * nearest integer cube coord, then back to offset (col, row).
 */
export function pixelToHex(px: number, py: number): HexCoord | null {
  // Convert to fractional axial coordinates around (col=1, row=1) center.
  const dx = px - ORIGIN_X;
  const dy = py - ORIGIN_Y;
  // For flat-top: q = (2/3)*x / size, r = (-1/3)*x/size + (sqrt(3)/3)*y/size.
  const q = (2 / 3) * dx / hexSize;
  const r = ((-1 / 3) * dx + (SQRT3 / 3) * dy) / hexSize;
  const s = -q - r;
  // Cube round
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);
  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - s);
  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs;
  } else if (rDiff > sDiff) {
    rr = -rq - rs;
  } else {
    rs = -rq - rr;
  }
  // axial -> odd-q offset. Our forward hexCenter shifts down when
  // (col-1) is odd, i.e. for 0-indexed q values 1, 3, 5, ... — that's
  // Red Blob Games' "odd-q" convention. Inverse for odd-q:
  //   col_offset (0-indexed) = q
  //   row_offset (0-indexed) = r + (q - (q & 1)) / 2
  const col = rq + 1;
  const row = rr + ((rq - (rq & 1)) >> 1) + 1;
  const coord = formatCoord(col, row);
  return coord in HEX_CELLS ? coord : null;
}

/**
 * Bounding box of all hex centers (plus the hex radius) — for sizing the
 * SVG viewBox. HEX_CELLS is a frozen module-level constant, so the bounds
 * never change after load: compute once and freeze. An outlier hex (none
 * today, but possible if the manifest gains an isolated cell in the future)
 * would stretch the box and leave empty viewBox padding around the playable
 * area.
 *
 * `Object.freeze` here is shallow — fine because every field is a primitive
 * number. If a future change adds a nested object/array to this struct,
 * inner mutations would silently succeed; either keep the struct flat or
 * upgrade to a deep freeze.
 */
const GRID_BOUNDS: Readonly<{ x: number; y: number; w: number; h: number }> = (() => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cell of Object.values(HEX_CELLS)) {
    const { x, y } = hexCenter(cell.col, cell.row);
    if (x - hexSize < minX) minX = x - hexSize;
    if (x + hexSize > maxX) maxX = x + hexSize;
    if (y - hexSize < minY) minY = y - hexSize;
    if (y + hexSize > maxY) maxY = y + hexSize;
  }
  const pad = hexSize * 0.3;
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
