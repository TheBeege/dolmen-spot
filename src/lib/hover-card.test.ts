// Tests for placeHoverCard in hover-card.ts. Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { HOVER_CARD_GAP as GAP, HOVER_CARD_MARGIN as MARGIN, placeHoverCard } from './hover-card';

const viewport = { width: 320, height: 640 };
const card = { width: 200, height: 100 };
/** A 24px button with its top-left corner at (left, top). */
const button = (left: number, top: number) => ({ left, top, right: left + 24, bottom: top + 24 });

const onScreen = (pos: { left: number; top: number }, size = card, vp = viewport) =>
  pos.left >= MARGIN && pos.top >= MARGIN
  && pos.left + size.width <= vp.width - MARGIN && pos.top + size.height <= vp.height - MARGIN;

describe('placeHoverCard', () => {
  test('goes below the anchor, lined up with its left edge, when there is room', () => {
    assert.deepEqual(placeHoverCard(button(40, 100), card, viewport), { left: 40, top: 124 + GAP });
  });
  test('goes above the anchor when there is no room below', () => {
    assert.deepEqual(placeHoverCard(button(40, 580), card, viewport), { left: 40, top: 580 - GAP - 100 });
  });
  test('moves left to stay clear of the right edge', () => {
    const pos = placeHoverCard(button(300, 100), card, viewport);
    assert.equal(pos.left, 320 - MARGIN - 200);
    assert.ok(onScreen(pos));
  });
  test('moves right to stay clear of the left edge', () => {
    assert.equal(placeHoverCard(button(0, 100), card, viewport).left, MARGIN);
  });
  test('never overlaps the anchor when it fits on either side', () => {
    for (let top = MARGIN; top <= viewport.height - MARGIN - 24; top += 8) {
      const anchor = button(100, top);
      const pos = placeHoverCard(anchor, card, viewport);
      const fitsSomewhere = anchor.bottom + GAP + card.height <= viewport.height - MARGIN
        || anchor.top - GAP - card.height >= MARGIN;
      if (!fitsSomewhere) continue;
      assert.ok(pos.top >= anchor.bottom + GAP || pos.top + card.height <= anchor.top - GAP, `anchor at ${top}`);
      assert.ok(onScreen(pos), `anchor at ${top}`);
    }
  });
  test('in a viewport too short for either side, picks the roomier side and stays on screen', () => {
    const short = { width: 320, height: 180 };
    const pos = placeHoverCard(button(100, 30), card, short);
    assert.ok(onScreen(pos, card, short));
    assert.ok(pos.top > 30, 'more room below, so it leans down');
  });
  test('a card bigger than the viewport starts at the top-left margin rather than off screen', () => {
    const huge = { width: 400, height: 900 };
    assert.deepEqual(placeHoverCard(button(100, 300), huge, viewport), { left: MARGIN, top: MARGIN });
  });
});
