// The map's marker glyphs, drawn by hand: one for each kind of point of
// interest, and one for fairy doors. Pure geometry, so it can be tested
// without drawing; src/components/MapIcons.tsx draws them.
//
// Each glyph is a silhouette on a 24 × 24 grid (y down), with a few details
// cut out of it. Every point of it, curve control points included, lies within
// GLYPH_EXTENT of the grid's middle, so it fits inside a round marker.
// Buildings stand on the line y = 19.5.
import type { PoiKind } from './types';

/** The middle of the 24 × 24 grid glyphs are drawn on, in both x and y. */
export const GLYPH_CENTER = 12;
/** Every point of a glyph is within this distance of (GLYPH_CENTER, GLYPH_CENTER). */
export const GLYPH_EXTENT = 11;

export interface Glyph {
  /** Paths filled in the glyph's colour, in order. Absolute M, L, H, V, C and Z commands only. */
  readonly body: readonly string[];
  /** Details cut out of the body: paths filled in the marker's own colour, drawn over it. */
  readonly cut: readonly string[];
}

type Pt = readonly [number, number];

// Coordinates are rounded so that the paths don't carry float noise.
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const pt = ([x, y]: Pt) => `${r3(x)} ${r3(y)}`;

/** A closed polygon through `pts`. */
function poly(...pts: Pt[]): string {
  return `M${pt(pts[0])} ${pts.slice(1).map((p) => `L${pt(p)}`).join(' ')} Z`;
}

/** An axis-aligned rectangle. */
function rect(x: number, y: number, w: number, h: number): string {
  return poly([x, y], [x + w, y], [x + w, y + h], [x, y + h]);
}

// A quarter circle as a cubic Bézier: control points this far along the tangents.
const KAPPA = 0.5523;

/** An ellipse, as four cubic Béziers. */
function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    `M${pt([cx - rx, cy])}`,
    `C${pt([cx - rx, cy - ky])} ${pt([cx - kx, cy - ry])} ${pt([cx, cy - ry])}`,
    `C${pt([cx + kx, cy - ry])} ${pt([cx + rx, cy - ky])} ${pt([cx + rx, cy])}`,
    `C${pt([cx + rx, cy + ky])} ${pt([cx + kx, cy + ry])} ${pt([cx, cy + ry])}`,
    `C${pt([cx - kx, cy + ry])} ${pt([cx - rx, cy + ky])} ${pt([cx - rx, cy])}`,
    'Z',
  ].join(' ');
}

function circle(cx: number, cy: number, r: number): string {
  return ellipse(cx, cy, r, r);
}

/** A doorway: straight sides from `bottom` up to `spring`, and a round top. */
function arch(left: number, right: number, bottom: number, spring: number): string {
  const r = (right - left) / 2;
  const cx = left + r;
  const k = r * KAPPA;
  return [
    `M${pt([left, bottom])} L${pt([left, spring])}`,
    `C${pt([left, spring - k])} ${pt([cx - k, spring - r])} ${pt([cx, spring - r])}`,
    `C${pt([cx + k, spring - r])} ${pt([right, spring - k])} ${pt([right, spring])}`,
    `L${pt([right, bottom])} Z`,
  ].join(' ');
}

/** A dome: a half ellipse over the line y = `base`, from `left` to `right`, `height` tall. */
function dome(left: number, right: number, base: number, height: number): string {
  const rx = (right - left) / 2;
  const cx = left + rx;
  const kx = rx * KAPPA;
  const ky = height * KAPPA;
  return [
    `M${pt([left, base])}`,
    `C${pt([left, base - ky])} ${pt([cx - kx, base - height])} ${pt([cx, base - height])}`,
    `C${pt([cx + kx, base - height])} ${pt([right, base - ky])} ${pt([right, base])}`,
    'Z',
  ].join(' ');
}

/**
 * A ray from (cx, cy) at `deg` degrees from straight down (positive is to
 * the right), from `from` to `to` along it, widening from `w0` to `w1`.
 */
function ray(cx: number, cy: number, deg: number, from: number, to: number, w0: number, w1: number): string {
  const a = (deg * Math.PI) / 180;
  const u: Pt = [Math.sin(a), Math.cos(a)];
  const v: Pt = [Math.cos(a), -Math.sin(a)];
  const at = (d: number, w: number, side: number): Pt => [cx + u[0] * d + v[0] * w * side, cy + u[1] * d + v[1] * w * side];
  return poly(at(from, w0 / 2, 1), at(to, w1 / 2, 1), at(to, w1 / 2, -1), at(from, w0 / 2, -1));
}

/** Glyphs for the kinds of point of interest. 'other' has none: it's the plain marker. */
export const POI_GLYPHS: Readonly<Record<Exclude<PoiKind, 'other'>, Glyph>> = {
  // Three roofs, the middle one a spire.
  town: {
    body: [
      poly([4.5, 19.5], [4.5, 13], [7.125, 10.25], [9.5, 12.737], [9.5, 8.5], [12, 3], [14.5, 8.5], [14.5, 13.237], [16.875, 10.75], [19.5, 13.5], [19.5, 19.5]),
    ],
    cut: [arch(11, 13, 19.5, 16.5), rect(6.15, 14.75, 2, 2), rect(15.85, 15.25, 2, 2), rect(11.4, 9.75, 1.2, 2.5)],
  },
  // A cottage with a chimney.
  village: {
    body: [poly([3.75, 13.25], [12, 5.75], [20.25, 13.25]), rect(5.25, 12.5, 13.5, 7), rect(15, 6.75, 2.25, 4.5)],
    cut: [rect(10.75, 15, 2.5, 4.5), rect(6.9, 14.5, 2.25, 2.25), rect(14.85, 14.5, 2.25, 2.25)],
  },
  // Two towers and a curtain wall, with a gate.
  keep: {
    body: [
      poly(
        [4.5, 19.5], [4.5, 5.5], [6.1, 5.5], [6.1, 7], [7.4, 7], [7.4, 5.5], [9, 5.5], [9, 9.5],
        [10.2, 9.5], [10.2, 11], [11.4, 11], [11.4, 9.5], [12.6, 9.5], [12.6, 11], [13.8, 11], [13.8, 9.5],
        [15, 9.5], [15, 5.5], [16.6, 5.5], [16.6, 7], [17.9, 7], [17.9, 5.5], [19.5, 5.5], [19.5, 19.5],
      ),
    ],
    cut: [arch(10, 14, 19.5, 15.5), rect(6.1, 10, 1.3, 2.75), rect(16.6, 10, 1.3, 2.75)],
  },
  // A tall tower under a battlement.
  tower: {
    body: [
      poly(
        [8.75, 19.5], [9.5, 10], [7.5, 8.5], [7.5, 3], [9.3, 3], [9.3, 4.8], [11.1, 4.8], [11.1, 3],
        [12.9, 3], [12.9, 4.8], [14.7, 4.8], [14.7, 3], [16.5, 3], [16.5, 8.5], [14.5, 10], [15.25, 19.5],
      ),
    ],
    cut: [rect(11.3, 11.25, 1.4, 3), arch(10.75, 13.25, 19.5, 17.25)],
  },
  // A broken wall, and a block fallen from it.
  ruin: {
    body: [
      poly([4.5, 19.5], [4.5, 8.2], [6, 6.4], [7.4, 7.8], [8.8, 6], [10.4, 8.8], [11.8, 8.4], [13.2, 11.2], [14.6, 11], [15.9, 13.4], [15.9, 19.5]),
      poly([17, 19.5], [16.8, 16.4], [19.7, 15.8], [19.5, 19.5]),
    ],
    cut: [arch(6.9, 10.5, 16.75, 13)],
  },
  // The Chapes, holy symbol of the Pluritine Church (Player's Book p. 178): a
  // disc with five rays fanning down from it.
  shrine: {
    body: [circle(12, 7, 3.5), ...[-60, -30, 0, 30, 60].map((deg) => ray(12, 7, deg, 4.75, 12, 1.5, 2.3))],
    cut: [],
  },
  // A dolmen: a capstone on two standing stones.
  stones: {
    body: [
      poly([3.75, 10.25], [4.9, 7.4], [12, 6.3], [19.3, 6.9], [20.25, 9.6], [19, 11], [5, 11.2]),
      poly([5.75, 10.8], [5.25, 19.5], [9.25, 19.5], [8.85, 10.8]),
      poly([15.1, 10.8], [14.75, 19.5], [18.75, 19.5], [18.25, 10.8]),
    ],
    cut: [],
  },
  // A rocky hill with a dark way in.
  cave: {
    body: [poly([4.3, 19.5], [6, 13.4], [8.3, 10.8], [9.7, 7.6], [12.8, 5.8], [15.3, 8.3], [17.4, 9.3], [18.6, 13], [19.7, 19.5])],
    cut: [arch(8.75, 15.25, 19.5, 15.75)],
  },
  // A foaming tankard.
  inn: {
    body: [
      rect(4.75, 8.25, 9, 11.25),
      circle(6.5, 8, 2),
      circle(9.25, 6.9, 2.4),
      circle(12.2, 7.6, 2.1),
      // The handle: an outer loop, with the inside cut away below.
      poly([13, 10.25], [16.75, 10.25], [18.75, 12.25], [18.75, 15.25], [16.75, 17.25], [13, 17.25]),
    ],
    cut: [rect(13.75, 12.25, 2.75, 3), rect(7.35, 11, 1.2, 6.5), rect(10.95, 11, 1.2, 6.5)],
  },
  // A tent, its door open.
  camp: {
    body: [
      poly([4.5, 19.5], [12, 5.25], [19.5, 19.5]),
      poly([10.45, 3.3], [11.15, 2.95], [12.55, 5.6], [11.85, 5.95]),
      poly([13.55, 3.3], [12.85, 2.95], [11.45, 5.6], [12.15, 5.95]),
    ],
    cut: [poly([12, 10.75], [8.9, 19.5], [15.1, 19.5])],
  },
  // A headstone on a mound.
  barrow: {
    body: [
      `M4.5 19.5 C7 16.75 9.5 15.75 12 15.75 C14.5 15.75 17 16.75 19.5 19.5 Z`,
      arch(8.25, 15.75, 17.5, 9.75),
    ],
    cut: [rect(9.75, 10.25, 4.5, 1.2), rect(9.75, 12.75, 4.5, 1.2)],
  },
  // A broad old tree.
  grove: {
    body: [
      circle(12, 8.1, 4.6),
      circle(7.9, 10.9, 3.6),
      circle(16.1, 10.9, 3.6),
      circle(12, 12, 3.6),
      poly([10.9, 13], [10.5, 18.25], [8.25, 19.5], [15.75, 19.5], [13.5, 18.25], [13.1, 13]),
    ],
    cut: [],
  },
  // A spotted toadstool.
  fairy: {
    body: [
      dome(3.75, 20.25, 11.75, 7.5),
      poly([10.25, 11.5], [9.75, 19.5], [14.25, 19.5], [13.75, 11.5]),
    ],
    cut: [circle(8, 9, 1.25), circle(12.25, 6.9, 1.15), circle(16, 9.1, 1.25), rect(9.5, 11.75, 5, 0.9)],
  },
  // A skull.
  lair: {
    body: [
      [
        'M12 4.25',
        'C7.6 4.25 5 7.4 5 11.2',
        'C5 13.6 6.1 15.3 7.75 16.1',
        'L7.75 18.4 C7.75 19.2 8.35 19.75 9.15 19.75',
        'L14.85 19.75 C15.65 19.75 16.25 19.2 16.25 18.4',
        'L16.25 16.1 C17.9 15.3 19 13.6 19 11.2',
        'C19 7.4 16.4 4.25 12 4.25 Z',
      ].join(' '),
    ],
    cut: [
      ellipse(9.2, 11.3, 1.95, 2.15),
      ellipse(14.8, 11.3, 1.95, 2.15),
      poly([12, 13.6], [10.9, 15.75], [13.1, 15.75]),
      rect(10.2, 17.5, 0.8, 2.25),
      rect(11.6, 17.5, 0.8, 2.25),
      rect(13, 17.5, 0.8, 2.25),
    ],
  },
};

/** The fairy door's glyph, wild or roaded: an arched door with a fairy star on it. */
export const DOOR_GLYPH: Glyph = {
  body: [arch(7.75, 16.25, 19, 10.75), rect(6.5, 18.75, 11, 1.25)],
  cut: [poly([12, 9.4], [12.85, 12], [15.4, 12.85], [12.85, 13.7], [12, 16.3], [11.15, 13.7], [8.6, 12.85], [11.15, 12])],
};
