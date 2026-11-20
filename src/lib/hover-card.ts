// Where to put a card that appears beside the element it describes (such as a
// spell's summary next to its info button), so that it stays on screen.

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

/** Space between the anchor and the card. */
export const HOVER_CARD_GAP = 4;
/** The least space kept between the card and the edge of the viewport. */
export const HOVER_CARD_MARGIN = 8;

/**
 * Viewport coordinates for a card of `card` size anchored to `anchor`: lined up
 * with the anchor's left edge and below it, or above it when there's no room
 * below but there is above (or more room above than below). It's then shifted
 * to keep it at least HOVER_CARD_MARGIN inside every edge of the viewport,
 * and it only overlaps the anchor if the viewport is too short for it to fit
 * either side.
 */
export function placeHoverCard(anchor: Box, card: Size, viewport: Size): { left: number; top: number } {
  const below = anchor.bottom + HOVER_CARD_GAP;
  const above = anchor.top - HOVER_CARD_GAP - card.height;
  const fitsBelow = below + card.height <= viewport.height - HOVER_CARD_MARGIN;
  const fitsAbove = above >= HOVER_CARD_MARGIN;
  const roomBelow = viewport.height - anchor.bottom;
  const roomAbove = anchor.top;
  const goAbove = !fitsBelow && (fitsAbove || roomAbove > roomBelow);
  return {
    left: clamp(anchor.left, HOVER_CARD_MARGIN, viewport.width - HOVER_CARD_MARGIN - card.width),
    top: clamp(goAbove ? above : below, HOVER_CARD_MARGIN, viewport.height - HOVER_CARD_MARGIN - card.height),
  };
}

// Like Math.min(Math.max(value, min), max), except that `min` wins when the
// card is too big for the viewport, so it never starts off its top or left.
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
