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
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

export const HEX_GRID_META: HexGridMeta = gridData.meta as HexGridMeta;
export const HEX_CELLS: Readonly<Record<HexCoord, HexCell>> =
  gridData.hexes as Record<HexCoord, HexCell>;

export const ALL_HEXES: readonly HexCoord[] = Object.keys(HEX_CELLS).sort();

export function getHex(coord: HexCoord): HexCell | undefined {
  return HEX_CELLS[coord];
}

export function isValidHex(coord: HexCoord): boolean {
  return coord in HEX_CELLS;
}
