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

/** Space between the card and its anchor, or anything it steps past. */
export const HOVER_CARD_GAP = 4;
/** The least space kept between the card and the edges of the area it may use. */
export const HOVER_CARD_MARGIN = 8;

export const intersects = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Viewport coordinates for a card of `card` size next to `anchor`. The card
 * stays at least HOVER_CARD_MARGIN inside `area` (the part of the viewport it
 * may use, such as the part below a sticky header) and off the anchor, unless
 * `area` is too small for that.
 *
 * The places it can go, in order of preference: to the right of the anchor
 * (level with its top, then with its bottom), above it and below it (lined up
 * with its left edge), then to its left and above or below it lined up with
 * its right edge. It takes the first of those that covers none of `obstacles`
 * (the other spells in the anchor's list); failing that, the first that can
 * slide sideways clear of them, rightwards for the first four and leftwards
 * for the rest; failing that, the one that covers the fewest.
 */
export function placeHoverCard(anchor: Box, card: Size, area: Box, obstacles: readonly Box[] = []): Point {
  const minLeft = area.left + HOVER_CARD_MARGIN;
  const minTop = area.top + HOVER_CARD_MARGIN;
  const maxLeft = area.right - HOVER_CARD_MARGIN - card.width;
  const maxTop = area.bottom - HOVER_CARD_MARGIN - card.height;
  const boxAt = (p: Point): Box => ({ left: p.left, top: p.top, right: p.left + card.width, bottom: p.top + card.height });
  const inArea = (p: Point) => p.left >= minLeft && p.left <= maxLeft && p.top >= minTop && p.top <= maxTop;
  const covered = (p: Point) => obstacles.filter((o) => intersects(boxAt(p), o));

  // Beside the anchor, the card may move up or down to stay in the area;
  // above or below it, left or right.
  const levelWithTop = clamp(anchor.top, minTop, maxTop);
  const levelWithBottom = clamp(anchor.bottom - card.height, minTop, maxTop);
  const fromLeftEdge = clamp(anchor.left, minLeft, maxLeft);
  const fromRightEdge = clamp(anchor.right - card.width, minLeft, maxLeft);
  const toRight = anchor.right + HOVER_CARD_GAP;
  const toLeft = anchor.left - HOVER_CARD_GAP - card.width;
  const above = anchor.top - HOVER_CARD_GAP - card.height;
  const below = anchor.bottom + HOVER_CARD_GAP;
  const places = ([
    [{ left: toRight, top: levelWithTop }, 1],
    [{ left: toRight, top: levelWithBottom }, 1],
    [{ left: fromLeftEdge, top: above }, 1],
    [{ left: fromLeftEdge, top: below }, 1],
    [{ left: toLeft, top: levelWithTop }, -1],
    [{ left: toLeft, top: levelWithBottom }, -1],
    [{ left: fromRightEdge, top: above }, -1],
    [{ left: fromRightEdge, top: below }, -1],
  ] as const).filter(([p]) => inArea(p) && !intersects(boxAt(p), anchor));

  const clear = places.find(([p]) => covered(p).length === 0);
  if (clear) return clear[0];

  // Slide past whatever is in the way, as long as the card stays in the area.
  const slide = (start: Point, direction: 1 | -1): Point | null => {
    let p = start;
    for (let hit = covered(p); hit.length > 0; hit = covered(p)) {
      const left = direction > 0
        ? Math.max(...hit.map((o) => o.right)) + HOVER_CARD_GAP
        : Math.min(...hit.map((o) => o.left)) - HOVER_CARD_GAP - card.width;
      p = { left, top: p.top };
      if (!inArea(p)) return null;
    }
    return p;
  };
  for (const [p, direction] of places) {
    const slid = slide(p, direction);
    if (slid) return slid;
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

// Like Math.min(Math.max(value, min), max), except that `min` wins when the
// card is too big for the area, so it never starts off its top or left.
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
