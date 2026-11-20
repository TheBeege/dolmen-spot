// Tests for the map's pan limit (nearestPointOnMap in hex.ts). Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { gridBounds, hexCenterOf, nearestPointOnMap } from './hex';
import { ALL_HEXES, HEX_GRID_META } from './hex-grid';

const MARGIN = HEX_GRID_META.hexSize / 2; // what HexMap passes
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
