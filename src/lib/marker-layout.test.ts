// Tests for the marker layout inside a hex (marker-layout.ts). Run with `npm test`.
// Sizes come from markerGrowth and ringFor, exactly as the map draws them.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEX_INNER_RADIUS as INNER,
  MARKER_RIM,
  MAX_MARKER_OVERLAP,
  countOnStar,
  layoutRing,
  markerGrowth,
  ringFor,
  type MarkerKind as Kind,
  type Offset,
} from './marker-layout';
import { gridBounds } from './hex';
const dist = (o: Offset) => Math.hypot(o.x, o.y);
const round = (o: Offset) => ({ x: Math.round(o.x), y: Math.round(o.y) });
const layout = (px: number | null, kinds: Kind[], badge: boolean, onCurrent: boolean) => {
  const input = ringFor({ kinds, badge, onCurrent, growth: markerGrowth(px) });
  return { input, layout: layoutRing(input) };
};

// CSS px per image unit at the whole-map view: the map box is as wide as the
// screen less 24 px of padding on a phone, and 540 px tall on a 1280 × 900 desktop.
const b = gridBounds();
const PHONE_390 = (390 - 24) / b.w;
const PHONE_320 = (320 - 24) / b.w;
const DESKTOP = 540 / b.h;

// Every mix of up to four markers (plain POIs, POIs with a kind's icon,
// doors), with and without the "+N" badge.
const MIXES: Kind[][] = [];
for (let n = 1; n <= 4; n++) {
  for (let icons = 0; icons <= n; icons++) {
    for (let doors = 0; doors <= n - icons; doors++) {
      MIXES.push([...Array(n - icons - doors).fill('poi'), ...Array(icons).fill('icon'), ...Array(doors).fill('door')]);
    }
  }
}
// Scales from far zoomed out to well past full size.
const SCALES = Array.from({ length: 80 }, (_, i) => 0.03 * 1.06 ** i);

describe('markerGrowth', () => {
  const FULL_SIZE = { marker: 1, starRadius: 42, combinedRadius: 24, countRadius: 24 * 0.6 };
  test('nothing grows at full size, or before the map is measured', () => {
    assert.deepEqual(markerGrowth(null), FULL_SIZE);
    assert.deepEqual(markerGrowth(1), FULL_SIZE);
  });
  test('zoomed out, markers, the star and combined markers grow to their smallest on-screen sizes', () => {
    for (const px of [PHONE_320, PHONE_390]) {
      const g = markerGrowth(px);
      assert.ok(Math.abs(22 * g.marker * px - 6) < 1e-9, 'a POI is 12 px across');
      assert.ok(Math.abs(g.starRadius * px - 7) < 1e-9, 'the star is 14 px across');
      assert.ok(Math.abs(g.countRadius * px - 6) < 1e-9, "the current hex's count is 12 px across");
      assert.ok(Math.abs(g.combinedRadius * px - (6 * 24) / 22) < 1e-9, 'a combined marker is as big as a "+N" badge');
    }
  });
  test('none of them ever gets wider than its hex', () => {
    for (const px of [0.001, ...SCALES]) {
      const g = markerGrowth(px);
      for (const r of [g.starRadius, g.combinedRadius, g.countRadius]) assert.ok(r <= INNER, `px=${px}`);
    }
    const far = markerGrowth(0.001);
    assert.deepEqual([far.starRadius, far.combinedRadius, far.countRadius], [INNER, INNER, INNER]);
  });
});

describe('layoutRing at full size', () => {
  test('a lone marker sits in the middle of its hex', () => {
    assert.deepEqual(layout(1, ['poi'], false, false).layout, { kind: 'separate', offsets: [{ x: 0, y: 0 }] });
  });
  test('several share a ring of radius 42, the first at the top', () => {
    const { layout: l } = layout(1, ['poi', 'poi', 'door', 'door'], false, false);
    assert.equal(l.kind, 'separate');
    if (l.kind === 'separate') assert.deepEqual(l.offsets.map(round), [{ x: 0, y: -42 }, { x: 42, y: 0 }, { x: 0, y: 42 }, { x: -42, y: 0 }]);
  });
  test('on the current hex they ring the star, and the top place stays empty', () => {
    for (const kinds of MIXES) {
      for (const badge of [false, true]) {
        const { layout: l } = layout(1, kinds, badge, true);
        assert.equal(l.kind, 'separate', `${kinds} ${badge}`);
        if (l.kind !== 'separate') continue;
        assert.ok(l.offsets.every((o) => Math.abs(dist(o) - 72) < 1e-9), 'radius 42 + 30');
        assert.ok(l.offsets.every((o) => !(Math.abs(o.x) < 1e-9 && o.y < 0)), 'nothing at the top');
      }
    }
  });
});

describe('layoutRing at every zoom', () => {
  test('every marker it lays out stays inside the hex', () => {
    for (const px of SCALES) for (const kinds of MIXES) for (const badge of [false, true]) for (const onCurrent of [false, true]) {
      const { input, layout: l } = layout(px, kinds, badge, onCurrent);
      if (l.kind !== 'separate') continue;
      for (const o of l.offsets) assert.ok(dist(o) + input.markerRadius <= INNER + 1e-9, `px=${px.toFixed(3)} ${kinds} badge=${badge} current=${onCurrent}`);
    }
  });
  test('markers never overlap each other, or the star, more than allowed', () => {
    for (const px of SCALES) for (const kinds of MIXES) for (const badge of [false, true]) for (const onCurrent of [false, true]) {
      const { input, layout: l } = layout(px, kinds, badge, onCurrent);
      if (l.kind !== 'separate' || l.offsets.length < 2) continue;
      const [a, c] = l.offsets;
      const label = `px=${px.toFixed(3)} ${kinds} badge=${badge} current=${onCurrent}`;
      assert.ok(Math.hypot(a.x - c.x, a.y - c.y) >= 2 * input.markerRadius * (1 - MAX_MARKER_OVERLAP) - 1e-9, label);
      if (onCurrent) assert.ok(dist(a) - input.markerRadius >= input.starRadius * (1 - MAX_MARKER_OVERLAP) - 1e-9, label);
    }
  });
  test('a crowded ring is pulled in to stay inside the hex before it gives up', () => {
    // Two doors at a scale where their full ring would cross the hex's edge.
    const px = 6 / (22 * 2); // markers grow by 2
    const { input, layout: l } = layout(px, ['door', 'door'], false, false);
    assert.ok(input.ringRadius + input.markerRadius > INNER, 'the full ring would cross the edge');
    assert.equal(l.kind, 'separate');
    if (l.kind === 'separate') assert.ok(Math.abs(dist(l.offsets[0]) - (INNER - input.markerRadius)) < 1e-9);
  });
  test("at a phone's whole-map view, two or more markers, or any on the current hex, are combined", () => {
    for (const px of [PHONE_320, PHONE_390]) {
      for (const kinds of MIXES) {
        assert.equal(layout(px, kinds, false, true).layout.kind, 'combined', `current ${kinds}`);
        if (kinds.length >= 2) assert.equal(layout(px, kinds, false, false).layout.kind, 'combined', `${kinds}`);
      }
      assert.equal(layout(px, ['poi'], false, false).layout.kind, 'separate', 'a lone POI fits');
      assert.equal(layout(px, ['icon'], false, false).layout.kind, 'separate', "a lone kind's icon fits");
      assert.equal(layout(px, ['door'], false, false).layout.kind, 'separate', 'a lone door fits');
    }
  });
  test("at a desktop's whole-map view, two POIs on the current hex still fit, with kinds or without", () => {
    assert.equal(layout(DESKTOP, ['poi', 'poi'], false, true).layout.kind, 'separate');
    assert.equal(layout(DESKTOP, ['icon', 'icon'], false, true).layout.kind, 'separate');
    assert.equal(layout(DESKTOP, ['icon', 'poi'], false, true).layout.kind, 'separate');
    assert.equal(layout(DESKTOP, ['door'], false, true).layout.kind, 'combined', 'a door is bigger');
  });
});

describe('marker sizes', () => {
  test("a kind's icon is a little bigger than a plain POI, and smaller than a door", () => {
    const radius = (kind: Kind) => ringFor({ kinds: [kind], badge: false, onCurrent: false, growth: markerGrowth(1) }).markerRadius - MARKER_RIM / 2;
    assert.deepEqual([radius('poi'), radius('icon'), radius('door')], [22, 24, 26]);
  });
  test('a ring makes room for its largest marker', () => {
    const input = (kinds: Kind[]) => ringFor({ kinds, badge: false, onCurrent: false, growth: markerGrowth(1) }).markerRadius;
    assert.equal(input(['poi', 'icon']), input(['icon']));
    assert.equal(input(['icon', 'door', 'poi']), input(['door']));
  });
});

describe('countOnStar', () => {
  test('the count sits over the star, inside the hex', () => {
    for (const px of SCALES) {
      const { starRadius: star, countRadius: count } = markerGrowth(px);
      const o = countOnStar(star, count, INNER);
      assert.ok(dist(o) + count <= INNER + 1e-9, `px=${px.toFixed(3)} count ${count.toFixed(1)}`);
      assert.ok(dist(o) <= star * (1 - MAX_MARKER_OVERLAP) + 1e-9);
      assert.ok(o.x >= 0 && o.y >= 0, 'lower right');
    }
  });
});
