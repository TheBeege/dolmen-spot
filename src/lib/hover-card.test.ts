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
    assert.deepEqual(placeHoverCard(button(100, 100), card, desktop, { avoid: longerNameBelow }), { left: 124 + GAP, top: 124 - 100 });
  });
  test('goes above when there is no room on the right', () => {
    assert.deepEqual(placeHoverCard(button(1100, 300), card, desktop), { left: 1280 - MARGIN - 200, top: 300 - GAP - 100 });
  });
  test('goes below when above would cover a spell', () => {
    const spellAbove = [spell(1050, 250, 1250)];
    assert.deepEqual(placeHoverCard(button(1100, 300), card, desktop, { avoid: spellAbove }), { left: 1280 - MARGIN - 200, top: 324 + GAP });
  });
  test('goes to the left when the right, above and below would all cover a spell', () => {
    const around = [spell(1096, 250, 1250), spell(1096, 350, 1250)];
    assert.deepEqual(placeHoverCard(button(1100, 300), card, desktop, { avoid: around }), { left: 1100 - GAP - 200, top: 300 });
  });
  test('moves up to stay on screen when the anchor is near the bottom', () => {
    assert.deepEqual(placeHoverCard(button(100, 880), card, desktop), { left: 124 + GAP, top: 900 - MARGIN - 100 });
  });
});

describe('placeHoverCard around other spells', () => {
  test('slides right past longer names above and below when no spot next to the anchor is clear', () => {
    const list = [spell(20, 70, 260), spell(20, 130, 260), spell(20, 160, 200)];
    assert.deepEqual(placeHoverCard(button(100, 100), card, desktop, { avoid: list }), { left: 260 + GAP, top: 100 });
  });
  test('slides left past them when nothing to the right can be cleared', () => {
    const around = [spell(900, 250, 1250), spell(900, 350, 1250)];
    assert.deepEqual(placeHoverCard(button(1100, 300), card, desktop, { avoid: around }), { left: 900 - GAP - 200, top: 300 });
  });
  test('ignores spells it would not reach', () => {
    const farBelow = [spell(20, 400, 600)];
    assert.deepEqual(placeHoverCard(button(100, 100), card, desktop, { avoid: farBelow }), { left: 124 + GAP, top: 100 });
  });
  test('sits beside a menu whose rows are all spells', () => {
    const menu = { left: 20, top: 250, right: 272, bottom: 600 };
    assert.deepEqual(placeHoverCard(button(240, 300), card, desktop, { avoid: [menu] }), { left: 272 + GAP, top: 300 });
  });
  test('covers as few spells as it can when every spot covers some', () => {
    // A phone with a full row of names above the anchor's row and two below.
    const rows = [spell(8, 250, 312), spell(8, 330, 312), spell(8, 360, 312)];
    assert.deepEqual(placeHoverCard(button(10, 300), wideCard, phone, { avoid: rows }), { left: 10, top: 300 - GAP - 100 });
  });
});

describe('placeHoverCard and the controls in its own row', () => {
  // A prepared holy spell at 1280 px: the name field, then the info button
  // (the anchor), then Rank, Prep, Cast, Notes and delete, all on one line.
  const holyRow = (top: number) => ({
    anchor: button(444, top + 5),
    controls: [
      { left: 60, top, right: 440, bottom: top + 34 }, // name field
      { left: 476, top, right: 532, bottom: top + 34 }, // Rank
      { left: 540, top: top + 7, right: 600, bottom: top + 27 }, // Prep
      { left: 608, top: top + 7, right: 668, bottom: top + 27 }, // Cast
      { left: 676, top, right: 1100, bottom: top + 34 }, // Notes
      { left: 1108, top: top + 3, right: 1135, bottom: top + 31 }, // delete
    ],
  });
  const tallCard = { width: 320, height: 130 };

  test('goes above the row rather than beside its button, over the next controls', () => {
    const { anchor, controls } = holyRow(300);
    const p = placeHoverCard(anchor, tallCard, desktop, { keepClear: controls });
    assert.deepEqual(p, { left: 444, top: 300 - GAP - 130 });
  });
  test('above means above the whole row, not just its button', () => {
    // The row's fields are taller than the button, so above the button alone
    // would still overlap them.
    const { anchor, controls } = holyRow(300);
    const p = placeHoverCard(anchor, tallCard, desktop, { keepClear: controls });
    assert.ok(boxOf(p, tallCard).bottom <= 300 - GAP);
  });
  test('slides past the spells in the rows above rather than cover its own row', () => {
    const { anchor, controls } = holyRow(300);
    const spellsAround = [button(444, 255), button(444, 355)];
    const p = placeHoverCard(anchor, tallCard, desktop, { avoid: spellsAround, keepClear: controls });
    assert.deepEqual(p, { left: 468 + GAP, top: 300 - GAP - 130 });
  });
  test('still goes beside its button when that is clear of the row', () => {
    // An arcane row: the button ends the name, and Prep is 340 px further on.
    const anchor = button(192, 305);
    const controls = [{ left: 560, top: 307, right: 620, bottom: 327 }, { left: 676, top: 300, right: 1100, bottom: 334 }];
    assert.deepEqual(placeHoverCard(anchor, card, desktop, { keepClear: controls }), { left: 216 + GAP, top: 305 });
  });
  test('covers the row only when nothing clear of it fits', () => {
    const { anchor, controls } = holyRow(300);
    const short = screen(1280, 340);
    const huge = { width: 320, height: 300 };
    assert.deepEqual(placeHoverCard(anchor, huge, short, { keepClear: controls }), { left: 468 + GAP, top: 340 - MARGIN - 300 });
  });
  test('never covers its own row while there is room above or below the row', () => {
    for (const area of [desktop, screen(1280, 900, 76), screen(768, 900), screen(375, 740)]) {
      for (let top = area.top; top <= area.bottom - 40; top += 23) {
        for (const shift of [0, -200, -400]) {
          const { anchor, controls } = holyRow(top);
          const moved = (b: Box): Box => ({ left: b.left + shift, top: b.top, right: b.right + shift, bottom: b.bottom });
          const a = moved(anchor);
          const row = controls.map(moved).filter((b) => b.left >= 0 && b.right <= area.right);
          if (a.left < 0) continue;
          const roomAbove = top - GAP - tallCard.height >= area.top + MARGIN;
          const roomBelow = top + 34 + GAP + tallCard.height <= area.bottom - MARGIN;
          const p = placeHoverCard(a, tallCard, area, { avoid: [button(a.left, top - 40), button(a.left, top + 45)], keepClear: row });
          const where = `${area.right}x${area.bottom} from ${area.top}, row at ${top}, shifted ${shift}`;
          assert.ok(!intersects(boxOf(p, tallCard), a), `over its button: ${where}`);
          if (roomAbove || roomBelow) {
            assert.ok(!row.some((b) => intersects(boxOf(p, tallCard), b)), `over its own row: ${where}`);
          }
        }
      }
    }
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
          const p = placeHoverCard(anchor, size, area, { avoid: others });
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
