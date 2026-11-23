// Where to put a card that appears next to the element it describes (such as
// a spell's summary beside its info button): on screen, next to that element,
// and where it can, off the other things the pointer might move to next.

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  left: number;
  top: number;
}

export interface Surroundings {
  /** What the card should stay off where it can: the other spells in the anchor's list. */
  avoid?: readonly Box[];
  /**
   * What the card must not cover whenever it has anywhere else to go, just
   * like the anchor: the controls in the anchor's own row, which the pointer
   * often goes to next. Above or below the anchor then means above or below
   * these as well.
   */
  keepClear?: readonly Box[];
  /**
   * The list the anchor is in, which must hold it. When nothing beside the
   * anchor, above it or below it is clear of `avoid`, the card steps just past
   * the nearer end of this box rather than over the list, as long as that
   * keeps it near the anchor: the rows it would otherwise cover are the
   * buttons the pointer has to be able to reach. A list can run past both ends
   * of the window, so the step past it is bounded.
   */
  list?: Box;
  /**
   * A box the card keeps off entirely, which must hold the anchor: a list too
   * small or too narrow to go beside, such as the Memorise menu, whose every
   * row is a button the pointer walks down. Nowhere clear nearer, the card
   * goes just past it, above or below, however far that is — such a box is
   * short by nature (the menu is capped at 24rem), so the step is never far,
   * and leaving a row of it covered would block a button outright.
   */
  outside?: Box;
}

/** Space between the card and its anchor, or anything it steps past. */
export const HOVER_CARD_GAP = 4;
/** The least space kept between the card and the edges of the area it may use. */
export const HOVER_CARD_MARGIN = 8;

export const intersects = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Viewport coordinates for a card of `card` size next to `anchor`. The card
 * stays at least HOVER_CARD_MARGIN inside `area` (the part of the viewport it
 * may use, such as the part below a sticky header) and off the anchor and
 * everything in `keepClear`, unless `area` is too small for that.
 *
 * The places it can go, in order of preference: to the right of the anchor
 * (level with its top, then with its bottom), above it and below it (lined up
 * with its left edge), then to its left and above or below it lined up with
 * its right edge. It takes the first of those that covers nothing in `avoid`;
 * failing that, the first that can slide sideways clear of it, rightwards
 * for the first four and leftwards for the rest; failing that, just past the
 * nearer end of `outside`, however far that is, or of `list`, while that
 * leaves it within twice its own height of the anchor; failing that, the one
 * that covers the least of it.
 *
 * `outside` comes first among the escapes because the card must not cover it
 * at all; it is a menu, short by construction, so no bound is needed. `list`
 * is the anchor's own list, which can be longer than the window: past the far
 * end of one of those the card would be nowhere near the spell it describes,
 * so it covers the fewest rows there instead.
 */
export function placeHoverCard(
  anchor: Box,
  card: Size,
  area: Box,
  { avoid = [], keepClear = [], list, outside }: Surroundings = {},
): Point {
  const minLeft = area.left + HOVER_CARD_MARGIN;
  const minTop = area.top + HOVER_CARD_MARGIN;
  const maxLeft = area.right - HOVER_CARD_MARGIN - card.width;
  const maxTop = area.bottom - HOVER_CARD_MARGIN - card.height;
  const boxAt = (p: Point): Box => ({ left: p.left, top: p.top, right: p.left + card.width, bottom: p.top + card.height });
  const inArea = (p: Point) => p.left >= minLeft && p.left <= maxLeft && p.top >= minTop && p.top <= maxTop;
  const fits = (p: Point) => inArea(p) && ![anchor, ...keepClear].some((b) => intersects(boxAt(p), b));
  const covered = (p: Point) => avoid.filter((o) => intersects(boxAt(p), o));
  // The rows the anchor and the controls it keeps clear of take up.
  const band = keepClear.reduce(union, anchor);

  // Beside the anchor, the card may move up or down to stay in the area;
  // above or below it, left or right.
  const levelWithTop = clamp(anchor.top, minTop, maxTop);
  const levelWithBottom = clamp(anchor.bottom - card.height, minTop, maxTop);
  const fromLeftEdge = clamp(anchor.left, minLeft, maxLeft);
  const fromRightEdge = clamp(anchor.right - card.width, minLeft, maxLeft);
  const toRight = anchor.right + HOVER_CARD_GAP;
  const toLeft = anchor.left - HOVER_CARD_GAP - card.width;
  const above = band.top - HOVER_CARD_GAP - card.height;
  const below = band.bottom + HOVER_CARD_GAP;
  const places = ([
    [{ left: toRight, top: levelWithTop }, 1],
    [{ left: toRight, top: levelWithBottom }, 1],
    [{ left: fromLeftEdge, top: above }, 1],
    [{ left: fromLeftEdge, top: below }, 1],
    [{ left: toLeft, top: levelWithTop }, -1],
    [{ left: toLeft, top: levelWithBottom }, -1],
    [{ left: fromRightEdge, top: above }, -1],
    [{ left: fromRightEdge, top: below }, -1],
  ] as const).filter(([p]) => fits(p));

  // Nowhere clear of the anchor's row: place it as if the row had no controls.
  if (places.length === 0 && keepClear.length > 0) return placeHoverCard(anchor, card, area, { avoid, list, outside });

  const clear = places.find(([p]) => covered(p).length === 0);
  if (clear) return clear[0];

  // Slide past whatever is in the way, as long as the card still fits.
  const slide = (start: Point, direction: 1 | -1): Point | null => {
    let p = start;
    for (let hit = covered(p); hit.length > 0; hit = covered(p)) {
      const left = direction > 0
        ? Math.max(...hit.map((o) => o.right)) + HOVER_CARD_GAP
        : Math.min(...hit.map((o) => o.left)) - HOVER_CARD_GAP - card.width;
      p = { left, top: p.top };
      if (!fits(p)) return null;
    }
    return p;
  };
  for (const [p, direction] of places) {
    const slid = slide(p, direction);
    if (slid) return slid;
  }

  // Nowhere beside the anchor that is clear. Step past the nearer end of the
  // box instead of over it, so the rows there stay reachable: always for a box
  // the card must keep off (a menu), and for the anchor's own list while that
  // leaves the card near it. Past a long list's far end the card would be
  // nowhere in particular, so covering the fewest is better there.
  // A box holds the anchor, so a card placed wholly above or below it is clear
  // of it by construction.
  const pastEnd = (box: Box, reach: number): Point | null => {
    const ends = [
      { top: box.top - HOVER_CARD_GAP - card.height, distance: band.top - box.top + HOVER_CARD_GAP },
      { top: box.bottom + HOVER_CARD_GAP, distance: box.bottom - band.bottom + HOVER_CARD_GAP },
    ].sort((a, b) => a.distance - b.distance);
    for (const end of ends) {
      const p = { left: fromLeftEdge, top: end.top };
      if (end.distance <= reach && inArea(p)) return p;
    }
    return null;
  };
  for (const [box, reach] of [[outside, Infinity], [list, 2 * card.height]] as const) {
    const past = box && pastEnd(box, reach);
    if (past) return past;
  }

  if (places.length > 0) {
    let [best] = places[0];
    let fewest = covered(best).length;
    for (const [p] of places) {
      const n = covered(p).length;
      if (n < fewest) [best, fewest] = [p, n];
    }
    return best;
  }

  // The area is too small for the card anywhere beside the anchor: below it,
  // or above it when there's more room there, as far in as the area allows.
  const goAbove = anchor.top - area.top > area.bottom - anchor.bottom;
  return { left: fromLeftEdge, top: clamp(goAbove ? above : below, minTop, maxTop) };
}

/** The smallest box holding both `a` and `b`. */
export function union(a: Box, b: Box): Box {
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}

/**
 * The room a card has directly above and directly below `band` (an anchor's row)
 * within `area`: what is left of the area once the gap it keeps from the band
 * and the margin it keeps from the area's edge are taken off. Both can be
 * negative, for a band against an edge.
 */
export function roomAround(band: Box, area: Box): { above: number; below: number } {
  return {
    above: band.top - HOVER_CARD_GAP - (area.top + HOVER_CARD_MARGIN),
    below: area.bottom - HOVER_CARD_MARGIN - (band.bottom + HOVER_CARD_GAP),
  };
}

// Like Math.min(Math.max(value, min), max), except that `min` wins when the
// card is too big for the area, so it never starts off its top or left.
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
