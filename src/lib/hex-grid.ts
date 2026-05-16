import gridData from './hex-grid.json';
import type { HexCoord } from './types';

export type Terrain = 'woods' | 'open' | 'edge';

export interface HexCell {
  col: number;
  row: number;
  terrain: Terrain;
}

export interface HexGridMeta {
  imageWidth: number;
  imageHeight: number;
  labelX_col1: number;
  labelY_row1: number;
  colPitch: number;
  rowPitch: number;
  labelToCenterDy: number;
  hexSize: number;
  orientation: 'flat-top';
  offset: 'odd-q';
  /** Number of drawn cells in the manifest. Used at load-time to verify
   *  the JSON file matches what the extractor emitted (see warning below). */
  cellCount: number;
}

export const HEX_GRID_META: HexGridMeta = gridData.meta as HexGridMeta;
export const HEX_CELLS: Readonly<Record<HexCoord, HexCell>> =
  gridData.hexes as Record<HexCoord, HexCell>;

export const ALL_HEXES: readonly HexCoord[] = Object.keys(HEX_CELLS).sort();

// Module-load sanity check: the manifest's advertised cellCount must match
// what we actually loaded. Catches a truncated/edited JSON file before
// downstream code starts indexing into a stale map. Gated to non-prod so
// it can't spam Vercel build/runtime logs of a healthy deployment.
if (
  process.env.NODE_ENV !== 'production' &&
  HEX_GRID_META.cellCount !== ALL_HEXES.length
) {
  // eslint-disable-next-line no-console
  console.warn(
    `hex-grid.json: meta.cellCount (${HEX_GRID_META.cellCount}) does not match ` +
    `the number of loaded hexes (${ALL_HEXES.length}). The manifest may be ` +
    `truncated or out of sync with its extractor.`,
  );
}

export function getHex(coord: HexCoord): HexCell | undefined {
  return HEX_CELLS[coord];
}

export function isValidHex(coord: HexCoord): boolean {
  return coord in HEX_CELLS;
}
