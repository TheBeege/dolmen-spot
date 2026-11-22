// Where the markers of one hex go on the map, and how big they are. Pure
// geometry in the map image's units, so it can be tested without drawing.
import { HEX_GRID_META } from './hex-grid';

/** Distance from a hex's centre to the middle of an edge. */
export const HEX_INNER_RADIUS = HEX_GRID_META.rowPitch / 2;

// Marker sizes at full size, in image units. Zoomed out they grow (markerGrowth).
export const POI_RADIUS = 22; // a point of interest without a kind: a plain dot
export const ICON_RADIUS = 24; // a point of interest with a kind, whose icon needs a little more room
export const DOOR_RADIUS = 26;
export const BADGE_RADIUS = 24; // the "+N" overflow badge
export const MARKER_RIM = 4; // rim around markers
export const STAR_RADIUS = 42; // the current location's star
export const MARKER_RING_RADIUS = 42; // markers sharing a hex fan out on this circle
/** On the current hex the star takes the middle, and markers circle it this far outside it. */
export const CURRENT_RING_GAP = DOOR_RADIUS + 4;

/** The markers a hex can show: plain points of interest, ones with a kind's icon, and fairy doors. */
export type MarkerKind = 'poi' | 'icon' | 'door';

export const MARKER_RADIUS: Readonly<Record<MarkerKind, number>> = { poi: POI_RADIUS, icon: ICON_RADIUS, door: DOOR_RADIUS };

// Smallest on-screen sizes, in CSS px.
export const MIN_MARKER_PX = 12; // POI diameter; kind icons, doors, badges and rings grow with it
export const MIN_STAR_PX = 14; // star diameter
// The count over the star when the current hex's markers are combined. Its
// digit is 0.7 of this, so it's no smaller than the map's other text (8 px).
export const MIN_COUNT_PX = 12;

export interface Offset {
  x: number;
  y: number;
}

export interface MarkerGrowth {
  /** Factor for every marker size: 1 at full size, more when zoomed out. */
  marker: number;
  /** The star's radius. */
  starRadius: number;
  /** Radius of a hex's combined marker, in the middle of the hex. */
  combinedRadius: number;
  /** Radius of the current hex's combined marker, its count over the star. */
  countRadius: number;
}

/**
 * How big markers and the star are drawn at a scale of `pxPerUnit` CSS px per
 * image unit (null before the map has been measured): full size, or bigger
 * where that would be under MIN_MARKER_PX, MIN_STAR_PX or MIN_COUNT_PX across.
 * None of them is ever wider than its hex.
 */
export function markerGrowth(pxPerUnit: number | null): MarkerGrowth {
  const atLeast = (units: number, minPx: number) => (pxPerUnit ? Math.max(units, minPx / pxPerUnit) : units);
  const marker = atLeast(POI_RADIUS, MIN_MARKER_PX / 2) / POI_RADIUS;
  return {
    marker,
    starRadius: Math.min(atLeast(STAR_RADIUS, MIN_STAR_PX / 2), HEX_INNER_RADIUS),
    combinedRadius: Math.min(BADGE_RADIUS * marker, HEX_INNER_RADIUS),
    countRadius: Math.min(atLeast(BADGE_RADIUS * 0.6, MIN_COUNT_PX / 2), HEX_INNER_RADIUS),
  };
}

export interface RingInput {
  /** Marker places needed: the visible items, plus the "+N" badge if any. */
  slots: number;
  /** Radius of the largest of those markers, rim included. */
  markerRadius: number;
  /** Ring radius the markers would use with room to spare (0 for a lone marker). */
  ringRadius: number;
  /** Distance from the hex's centre to the middle of an edge. */
  innerRadius: number;
  /** Radius of the current-location star in the middle, or 0 if the hex isn't current. */
  starRadius: number;
}

/** layoutRing's input for a hex showing markers of these `kinds` (and the "+N" badge if `badge`). */
export function ringFor({ kinds, badge, onCurrent, growth }: {
  kinds: readonly MarkerKind[];
  badge: boolean;
  onCurrent: boolean;
  growth: MarkerGrowth;
}): RingInput {
  const k = growth.marker;
  const slots = kinds.length + (badge ? 1 : 0);
  const largest = Math.max(...kinds.map((kind) => MARKER_RADIUS[kind]), badge ? BADGE_RADIUS : 0);
  return {
    slots,
    markerRadius: largest * k + (MARKER_RIM * k) / 2,
    ringRadius: onCurrent ? growth.starRadius + CURRENT_RING_GAP * k : slots === 1 ? 0 : MARKER_RING_RADIUS * k,
    innerRadius: HEX_INNER_RADIUS,
    starRadius: onCurrent ? growth.starRadius : 0,
  };
}

export type RingLayout =
  | { kind: 'separate'; offsets: Offset[] }
  | { kind: 'combined' };

/** How much of a marker's diameter neighbouring markers (or the star) may cover. */
export const MAX_MARKER_OVERLAP = 0.15;

/**
 * Lays out a hex's markers inside the hex. A lone marker sits in the middle;
 * several share a ring, the first at the top. On the current hex the star has
 * the middle and markers ring it, with one more place on the ring than there
 * are markers, and the top one left empty for the coordinate label.
 *
 * The ring is pulled in so that every marker stays inside the hex. If the
 * markers then overlap each other or the star too much, they don't fit, and
 * the hex gets one combined marker instead ({ kind: 'combined' }).
 */
export function layoutRing({ slots, markerRadius: r, ringRadius, innerRadius, starRadius }: RingInput): RingLayout {
  const onCurrent = starRadius > 0;
  if (!onCurrent && slots === 1) {
    return r <= innerRadius ? { kind: 'separate', offsets: [{ x: 0, y: 0 }] } : { kind: 'combined' };
  }
  const radius = Math.min(ringRadius, innerRadius - r);
  const places = onCurrent ? slots + 1 : slots;
  const firstPlace = onCurrent ? 1 : 0;
  const apart = 2 * radius * Math.sin(Math.PI / places) >= 2 * r * (1 - MAX_MARKER_OVERLAP);
  const clearOfStar = !onCurrent || radius - r >= starRadius * (1 - MAX_MARKER_OVERLAP);
  if (radius <= 0 || !apart || !clearOfStar) return { kind: 'combined' };
  return {
    kind: 'separate',
    offsets: Array.from({ length: slots }, (_, i) => {
      const angle = -Math.PI / 2 + ((i + firstPlace) / places) * Math.PI * 2;
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    }),
  };
}

/**
 * Where the item count goes on the current hex when its markers are
 * combined: over the star's lower right, as far out as the hex allows.
 */
export function countOnStar(starRadius: number, countRadius: number, innerRadius: number): Offset {
  const d = Math.max(0, Math.min(starRadius * (1 - MAX_MARKER_OVERLAP), innerRadius - countRadius));
  return { x: d * Math.SQRT1_2, y: d * Math.SQRT1_2 };
}
