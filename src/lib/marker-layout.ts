// Where the markers of one hex go on the map. Pure geometry in the map
// image's units, so it can be tested without drawing anything.

export interface Offset {
  x: number;
  y: number;
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
