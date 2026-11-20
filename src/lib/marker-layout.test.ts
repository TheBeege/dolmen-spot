// Tests for the marker layout inside a hex (marker-layout.ts). Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_MARKER_OVERLAP, countOnStar, layoutRing, type Offset } from './marker-layout';
import { HEX_GRID_META } from './hex-grid';

// The map's sizes, in image units (HexMap.tsx), at a scale where nothing
// has had to grow (k = 1). Zoomed out on a phone, markers grow by k.
const INNER = HEX_GRID_META.rowPitch / 2;
const RING = 42;
const STAR = 42;
const GAP = 30; // the current hex's ring sits this far outside the star
const DOOR = 26 + 2; // the largest marker, half its rim included

const ring = (slots: number, k: number, current = false) =>
  layoutRing({
    slots,
    markerRadius: DOOR * k,
    ringRadius: current ? STAR + GAP * k : slots === 1 ? 0 : RING * k,
    innerRadius: INNER,
    starRadius: current ? STAR : 0,
  });
const round = (o: Offset) => ({ x: Math.round(o.x), y: Math.round(o.y) });
const dist = (o: Offset) => Math.hypot(o.x, o.y);

describe('layoutRing at full size', () => {
  test('a lone marker sits in the middle of its hex', () => {
    assert.deepEqual(ring(1, 1), { kind: 'separate', offsets: [{ x: 0, y: 0 }] });
  });
  test('several share a ring of radius 42, the first at the top', () => {
    const l = ring(4, 1);
    assert.equal(l.kind, 'separate');
    if (l.kind !== 'separate') return;
    assert.deepEqual(l.offsets.map(round), [{ x: 0, y: -42 }, { x: 42, y: 0 }, { x: 0, y: 42 }, { x: -42, y: 0 }]);
  });
  test('on the current hex they ring the star, and the top place stays empty', () => {
    for (let slots = 1; slots <= 5; slots++) {
      const l = ring(slots, 1, true);
      assert.equal(l.kind, 'separate', `${slots} slots`);
      if (l.kind !== 'separate') continue;
      assert.ok(l.offsets.every((o) => Math.abs(dist(o) - (STAR + GAP)) < 1e-9), `${slots} slots: radius ${STAR + GAP}`);
      assert.ok(l.offsets.every((o) => !(Math.abs(o.x) < 1e-9 && o.y < 0)), `${slots} slots: nothing at the top`);
    }
  });
});

describe('layoutRing when markers grow (zoomed out)', () => {
  test('every marker it lays out stays inside the hex', () => {
    for (let k = 1; k <= 5; k += 0.05) {
      for (const current of [false, true]) {
        for (let slots = 1; slots <= 5; slots++) {
          const l = ring(slots, k, current);
          if (l.kind !== 'separate') continue;
          for (const o of l.offsets) {
            assert.ok(dist(o) + DOOR * k <= INNER + 1e-9, `k=${k.toFixed(2)} slots=${slots} current=${current}: ${dist(o) + DOOR * k} > ${INNER}`);
          }
        }
      }
    }
  });
  test('a crowded ring is pulled in to stay inside the hex before it gives up', () => {
    // At k = 2 the ring would reach 84 + 56 = 140 > 134: pulled in to 78.
    const l = ring(2, 2);
    assert.equal(l.kind, 'separate');
    if (l.kind === 'separate') assert.ok(Math.abs(dist(l.offsets[0]) - (INNER - DOOR * 2)) < 1e-9);
  });
  test('markers that would overlap too much are combined into one', () => {
    // A 390 px phone at the whole-map view: markers grow by about 3.4.
    for (let slots = 2; slots <= 5; slots++) assert.deepEqual(ring(slots, 3.4), { kind: 'combined' }, `${slots} slots`);
    for (let slots = 1; slots <= 5; slots++) assert.deepEqual(ring(slots, 3.4, true), { kind: 'combined' }, `current, ${slots} slots`);
    assert.equal(ring(1, 3.4).kind, 'separate', 'a lone marker still fits');
  });
  test('neighbours on a ring never overlap more than allowed', () => {
    for (let k = 1; k <= 5; k += 0.05) {
      for (let slots = 2; slots <= 5; slots++) {
        const l = ring(slots, k);
        if (l.kind !== 'separate') continue;
        const [a, b] = l.offsets;
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 2 * DOOR * k * (1 - MAX_MARKER_OVERLAP) - 1e-9, `k=${k.toFixed(2)} slots=${slots}`);
      }
    }
  });
});

describe('countOnStar', () => {
  test('the count sits over the star, inside the hex', () => {
    for (const [star, count] of [[42, 14], [108, 70], [200, 60]]) {
      const o = countOnStar(star, count, INNER);
      assert.ok(dist(o) + count <= INNER + 1e-9, `star ${star}, count ${count}`);
      assert.ok(dist(o) <= star * (1 - MAX_MARKER_OVERLAP) + 1e-9, `star ${star}, count ${count}`);
      assert.ok(o.x >= 0 && o.y >= 0, 'lower right');
    }
  });
});
