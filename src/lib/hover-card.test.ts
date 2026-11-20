// Tests for placeHoverCard in hover-card.ts. Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOVER_CARD_GAP as GAP,
  HOVER_CARD_MARGIN as MARGIN,
  intersects,
  placeHoverCard,
  union,
  type Box,
  type Point,
  type Size,
} from './hover-card';

const screen = (width: number, height: number, top = 0): Box => ({ left: 0, top, right: width, bottom: height });
const desktop = screen(1280, 900);
const phone = screen(320, 640);
const card = { width: 200, height: 100 };
/** Too wide to sit beside anything on a phone, so it goes above or below. */
const wideCard = { width: 290, height: 100 };
/** A 24px info button with its top-left corner at (left, top). */
const button = (left: number, top: number): Box => ({ left, top, right: left + 24, bottom: top + 24 });
/** A spell's name and button in a list row, from `left` to `right`. */
const spell = (left: number, top: number, right: number): Box => ({ left, top, right, bottom: top + 24 });
const boxOf = (p: Point, size: Size): Box => ({ left: p.left, top: p.top, right: p.left + size.width, bottom: p.top + size.height });
const inside = (p: Point, size: Size, area: Box) =>
  p.left >= area.left + MARGIN && p.top >= area.top + MARGIN
  && p.left + size.width <= area.right - MARGIN && p.top + size.height <= area.bottom - MARGIN;

describe('placeHoverCard next to its anchor', () => {
  test('goes to the right of the anchor, level with its top, when nothing is in the way', () => {
    assert.deepEqual(placeHoverCard(button(100, 100), card, desktop), { left: 124 + GAP, top: 100 });
  });
  test('rises to end level with the anchor when the spot level with its top would cover a spell', () => {
    const longerNameBelow = [spell(20, 130, 300)];
    assert.deepEqual(placeHoverCard(button(100, 100), card, desktop, longerNameBelow), { left: 124 + GAP, top: 124 - 100 });
  });
  test('goes above when there is no room on the right', () => {
    assert.deepEqual(placeHoverCard(button(1100, 300), card, desktop), { left: 1280 - MARGIN - 200, top: 300 - GAP - 100 });
  });
  test('goes below when above would cover a spell', () => {
    const spellAbove = [spell(1050, 250, 1250)];
    assert.deepEqual(placeHoverCard(button(1100, 300), card, desktop, spellAbove), { left: 1280 - MARGIN - 200, top: 324 + GAP });
  });
  test('goes to the left when the right, above and below would all cover a spell', () => {
    const around = [spell(1096, 250, 1250), spell(1096, 350, 1250)];
    assert.deepEqual(placeHoverCard(button(1100, 300), card, desktop, around), { left: 1100 - GAP - 200, top: 300 });
  });
  test('moves up to stay on screen when the anchor is near the bottom', () => {
    assert.deepEqual(placeHoverCard(button(100, 880), card, desktop), { left: 124 + GAP, top: 900 - MARGIN - 100 });
  });
});

describe('placeHoverCard around other spells', () => {
  test('slides right past longer names above and below when no spot next to the anchor is clear', () => {
    const list = [spell(20, 70, 260), spell(20, 130, 260), spell(20, 160, 200)];
    assert.deepEqual(placeHoverCard(button(100, 100), card, desktop, list), { left: 260 + GAP, top: 100 });
  });
  test('slides left past them when nothing to the right can be cleared', () => {
    const around = [spell(900, 250, 1250), spell(900, 350, 1250)];
    assert.deepEqual(placeHoverCard(button(1100, 300), card, desktop, around), { left: 900 - GAP - 200, top: 300 });
  });
  test('ignores spells it would not reach', () => {
    const farBelow = [spell(20, 400, 600)];
    assert.deepEqual(placeHoverCard(button(100, 100), card, desktop, farBelow), { left: 124 + GAP, top: 100 });
  });
  test('sits beside a menu whose rows are all spells', () => {
    const menu = { left: 20, top: 250, right: 272, bottom: 600 };
    assert.deepEqual(placeHoverCard(button(240, 300), card, desktop, [menu]), { left: 272 + GAP, top: 300 });
  });
  test('covers as few spells as it can when every spot covers some', () => {
    // A phone with a full row of names above the anchor's row and two below.
    const rows = [spell(8, 250, 312), spell(8, 330, 312), spell(8, 360, 312)];
    assert.deepEqual(placeHoverCard(button(10, 300), wideCard, phone, rows), { left: 10, top: 300 - GAP - 100 });
  });
});

describe('placeHoverCard at the edges of its area', () => {
  test('goes below when there is no room above', () => {
    assert.deepEqual(placeHoverCard(button(10, 50), wideCard, phone), { left: 10, top: 74 + GAP });
  });
  test('moves in from the sides of the screen', () => {
    assert.equal(placeHoverCard(button(0, 100), wideCard, phone).left, MARGIN);
    assert.equal(placeHoverCard(button(300, 100), wideCard, phone).left, 320 - MARGIN - 290);
  });
  test('stays below a sticky header, moving beside the anchor when neither above nor below fits', () => {
    const belowHeader = screen(1280, 380, 76);
    const tall = { width: 200, height: 200 };
    const p = placeHoverCard(button(1100, 236), tall, belowHeader);
    assert.deepEqual(p, { left: 1100 - GAP - 200, top: 380 - MARGIN - 200 });
    assert.ok(p.top >= 76 + MARGIN);
  });
  test('a card bigger than the area starts at its top-left margin rather than off screen', () => {
    assert.deepEqual(placeHoverCard(button(100, 300), { width: 400, height: 900 }, phone), { left: MARGIN, top: MARGIN });
    assert.deepEqual(placeHoverCard(button(100, 300), { width: 400, height: 900 }, screen(320, 640, 76)), { left: MARGIN, top: 76 + MARGIN });
  });
});

describe('placeHoverCard everywhere', () => {
  test('stays in its area and off its anchor, and on a desktop off every other spell too', () => {
    const cases: [Box, Size][] = [[desktop, card], [screen(1280, 900, 76), card], [phone, card], [phone, wideCard]];
    for (const [area, size] of cases) {
      for (let x = 0; x <= area.right - 24; x += 37) {
        for (let y = area.top; y <= area.bottom - 24; y += 41) {
          const anchor = button(x, y);
          // A list column: other spells in the rows above and below, a little longer.
          const others = [-60, -30, 30, 60].map((dy) => spell(x - 40, y + dy, x + 39));
          const p = placeHoverCard(anchor, size, area, others);
          const where = `${area.right}x${area.bottom} from ${area.top}, ${size.width}w card, anchor at (${x}, ${y})`;
          assert.ok(inside(p, size, area), `outside its area: ${where}`);
          assert.ok(!intersects(boxOf(p, size), anchor), `over its anchor: ${where}`);
          if (area.right === 1280) {
            assert.ok(!others.some((o) => intersects(boxOf(p, size), o)), `over another spell: ${where}`);
          }
        }
      }
    }
  });
});

describe('union', () => {
  test('is the smallest box holding both', () => {
    assert.deepEqual(union(button(10, 20), button(100, 5)), { left: 10, top: 5, right: 124, bottom: 44 });
  });
});
