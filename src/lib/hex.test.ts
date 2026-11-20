// Tests for the map's pan and zoom limits, and reading a typed hex (hex.ts).
// Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CENTRE_HULL, MIN_VIEW_FRACTION, PAN_MARGIN as MARGIN, gridBounds, hexCenterOf, hexVertices, nearestPointOnMap, parseTypedHex } from './hex';
import { ALL_HEXES, HEX_CELLS } from './hex-grid';

type Point = { x: number; y: number };
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const b = gridBounds();

describe('nearestPointOnMap', () => {
  test('hex centres and the middle of the map stay where they are', () => {
    for (const h of ALL_HEXES) {
      const c = hexCenterOf(h)!;
      assert.deepEqual(nearestPointOnMap(c, MARGIN), c, h);
    }
    const mid = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    assert.deepEqual(nearestPointOnMap(mid, MARGIN), mid);
  });

  test('a point far off the map comes back to within the margin of the hex centres\' hull', () => {
    for (const p of [{ x: -1e5, y: -1e5 }, { x: 1e5, y: b.y }, { x: b.x + b.w / 2, y: 1e5 }, { x: -3000, y: 4000 }]) {
      const q = nearestPointOnMap(p, MARGIN);
      assert.ok(dist(q, nearestPointOnMap(q, 0)) <= MARGIN + 1e-6, JSON.stringify({ p, q }));
    }
  });

  test('it never moves further than the point does, so dragging past an edge is smooth', () => {
    // Sweep 4-unit steps along a line beyond each side of the map, and
    // compare random pairs of points around it.
    const sides: [Point, Point][] = [
      [{ x: b.x - 500, y: b.y - 800 }, { x: b.x + b.w + 500, y: b.y - 800 }],
      [{ x: b.x - 500, y: b.y + b.h + 800 }, { x: b.x + b.w + 500, y: b.y + b.h + 800 }],
      [{ x: b.x - 800, y: b.y - 500 }, { x: b.x - 800, y: b.y + b.h + 500 }],
      [{ x: b.x + b.w + 800, y: b.y - 500 }, { x: b.x + b.w + 800, y: b.y + b.h + 500 }],
    ];
    for (const [from, to] of sides) {
      const steps = Math.ceil(dist(from, to) / 4);
      let prev = nearestPointOnMap(from, MARGIN);
      let maxStep = 0;
      for (let i = 1; i <= steps; i++) {
        const p = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
        const q = nearestPointOnMap(p, MARGIN);
        maxStep = Math.max(maxStep, dist(prev, q));
        prev = q;
      }
      assert.ok(maxStep <= 4 + 1e-6, `largest step ${maxStep.toFixed(2)} along ${JSON.stringify(from)} → ${JSON.stringify(to)}`);
    }
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 2000; i++) {
      const p = { x: b.x - 2000 + rnd() * (b.w + 4000), y: b.y - 2000 + rnd() * (b.h + 4000) };
      const q = { x: p.x + (rnd() - 0.5) * 400, y: p.y + (rnd() - 0.5) * 400 };
      assert.ok(dist(nearestPointOnMap(p, MARGIN), nearestPointOnMap(q, MARGIN)) <= dist(p, q) + 1e-6);
    }
  });
});

// Does a w × h view centred at c show any part of a drawn hex? Each hex is
// clipped to the view (Sutherland–Hodgman); anything left is on screen.
const HEX_POLYGONS = ALL_HEXES.map((h) => hexVertices(HEX_CELLS[h].col, HEX_CELLS[h].row));
function showsAHex(c: Point, w: number, h: number): boolean {
  const clip = (poly: Point[], inside: (p: Point) => boolean, cut: (p: Point, q: Point) => Point) => {
    const out: Point[] = [];
    poly.forEach((q, i) => {
      const p = poly[(i + poly.length - 1) % poly.length];
      if (inside(q)) {
        if (!inside(p)) out.push(cut(p, q));
        out.push(q);
      } else if (inside(p)) {
        out.push(cut(p, q));
      }
    });
    return out;
  };
  const atX = (x: number) => (p: Point, q: Point) => ({ x, y: p.y + ((q.y - p.y) * (x - p.x)) / (q.x - p.x) });
  const atY = (y: number) => (p: Point, q: Point) => ({ x: p.x + ((q.x - p.x) * (y - p.y)) / (q.y - p.y), y });
  const [left, right, top, bottom] = [c.x - w / 2, c.x + w / 2, c.y - h / 2, c.y + h / 2];
  return HEX_POLYGONS.some((poly) => {
    let q = clip(poly, (p) => p.x >= left, atX(left));
    q = clip(q, (p) => p.x <= right, atX(right));
    q = clip(q, (p) => p.y >= top, atY(top));
    q = clip(q, (p) => p.y <= bottom, atY(bottom));
    return q.length >= 3;
  });
}

// Where the pan limit holds the view's centre when it's pushed out in every
// direction: beyond each edge of the hull (densely, staircase included) and
// all round each corner.
function boundaryCentres(): Point[] {
  const n = CENTRE_HULL.length;
  const outward = (p: Point, q: Point) => {
    const len = dist(p, q);
    return { x: (q.y - p.y) / len, y: -(q.x - p.x) / len };
  };
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const p = CENTRE_HULL[i];
    const q = CENTRE_HULL[(i + 1) % n];
    const nrm = outward(p, q);
    for (let s = 0; s <= 2000; s++) {
      const t = s / 2000;
      out.push(nearestPointOnMap({ x: p.x + (q.x - p.x) * t + nrm.x * 5000, y: p.y + (q.y - p.y) * t + nrm.y * 5000 }, MARGIN));
    }
    const next = outward(q, CENTRE_HULL[(i + 2) % n]);
    const from = Math.atan2(nrm.y, nrm.x);
    let to = Math.atan2(next.y, next.x);
    while (to < from) to += 2 * Math.PI;
    for (let s = 0; s <= 200; s++) {
      const a = from + ((to - from) * s) / 200;
      out.push(nearestPointOnMap({ x: q.x + 5000 * Math.cos(a), y: q.y + 5000 * Math.sin(a) }, MARGIN));
    }
  }
  return out;
}

describe('MIN_VIEW_FRACTION', () => {
  const centres = boundaryCentres();
  test("every sampled centre is on the pan limit's boundary", () => {
    assert.ok(centres.every((c) => Math.abs(dist(c, nearestPointOnMap(c, 0)) - MARGIN) < 1e-6));
  });
  test('the most zoomed-in view shows part of a hex wherever the pan limit holds it', () => {
    const blank = centres.filter((c) => !showsAHex(c, MIN_VIEW_FRACTION * b.w, MIN_VIEW_FRACTION * b.h));
    assert.equal(blank.length, 0, `${blank.length} of ${centres.length} views show no hex, e.g. ${JSON.stringify(blank[0])}`);
  });
  test('(the old limit, 5%, left some of those views blank)', () => {
    assert.ok(centres.some((c) => !showsAHex(c, 0.05 * b.w, 0.05 * b.h)));
  });
});

describe('parseTypedHex', () => {
  test('a hex on the map, as typed or without its leading zero, and with spaces around it', () => {
    assert.equal(parseTypedHex('0606'), '0606');
    assert.equal(parseTypedHex(' 1303 '), '1303');
    assert.equal(parseTypedHex('303'), '0303');
  });
  test('anything else is not a hex', () => {
    for (const typed of ['', '   ', '9999', '7', '06 06', '0606a', 'Hex 0606', '00606', '-606', '6.06']) {
      assert.equal(parseTypedHex(typed), null, typed);
    }
  });
});
