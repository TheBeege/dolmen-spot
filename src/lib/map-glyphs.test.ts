// Tests for the map's marker glyphs (map-glyphs.ts). Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DOOR_GLYPH, GLYPH_CENTER, GLYPH_EXTENT, POI_GLYPHS, type Glyph } from './map-glyphs';
import { POI_KINDS } from './map-data';

/**
 * Every point a path names, for paths made of absolute M, L, H, V, C and Z
 * commands: with `controls`, curve control points too. A Bézier curve lies
 * inside the hull of its control points, so if they're all inside a circle,
 * so is the curve. Without them, only points the path passes through.
 */
function pathPoints(d: string, { controls = true } = {}): { x: number; y: number }[] {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  assert.equal(tokens.join(''), d.replace(/[\s,]+/g, ''), `only commands and numbers in ${d}`);
  const points: { x: number; y: number }[] = [];
  let cmd = '';
  let x = 0;
  let y = 0;
  for (let i = 0; i < tokens.length; ) {
    if (/[A-Za-z]/.test(tokens[i])) {
      cmd = tokens[i++];
      assert.ok('MLHVCZ'.includes(cmd), `absolute M, L, H, V, C and Z only, not ${cmd}, in ${d}`);
      if (cmd === 'Z') continue;
    }
    const next = () => {
      const v = Number(tokens[i++]);
      assert.ok(Number.isFinite(v), `a number after ${cmd} in ${d}`);
      return v;
    };
    if (cmd === 'H') x = next();
    else if (cmd === 'V') y = next();
    else if (cmd === 'C') {
      for (let k = 0; k < 2; k++) {
        const control = { x: next(), y: next() };
        if (controls) points.push(control);
      }
      x = next();
      y = next();
    } else {
      x = next();
      y = next();
    }
    points.push({ x, y });
  }
  return points;
}

const glyphs: [string, Glyph][] = [...Object.entries(POI_GLYPHS), ['door', DOOR_GLYPH]];

describe('marker glyphs', () => {
  test('every kind of point of interest has a glyph but "other", the plain marker', () => {
    assert.deepEqual(Object.keys(POI_GLYPHS).sort(), POI_KINDS.filter((k) => k !== 'other').sort());
  });

  test('every glyph stays within its extent, so it fits inside its round marker', () => {
    for (const [name, glyph] of glyphs) {
      assert.ok(glyph.body.length > 0, `${name} has a body`);
      for (const d of [...glyph.body, ...glyph.cut]) {
        for (const p of pathPoints(d)) {
          const r = Math.hypot(p.x - GLYPH_CENTER, p.y - GLYPH_CENTER);
          assert.ok(r <= GLYPH_EXTENT + 1e-9, `${name}: (${p.x}, ${p.y}) is ${r.toFixed(2)} from the middle`);
        }
      }
    }
  });

  test('glyphs fill their extent about as much as each other, so none looks small', () => {
    // Measured at points the outline passes through: control points lie outside it.
    for (const [name, glyph] of glyphs) {
      const onCurve = glyph.body.flatMap((d) => pathPoints(d, { controls: false }));
      const far = Math.max(...onCurve.map((p) => Math.hypot(p.x - GLYPH_CENTER, p.y - GLYPH_CENTER)));
      assert.ok(far >= GLYPH_EXTENT * 0.75, `${name} reaches only ${far.toFixed(2)}`);
    }
  });

  test('the path reader reads every command and catches the ones glyphs mustn\'t use', () => {
    assert.deepEqual(pathPoints('M1 2 L3 4 H5 V6 C7 8 9 10 11 12 Z'), [
      { x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 4 }, { x: 5, y: 6 }, { x: 7, y: 8 }, { x: 9, y: 10 }, { x: 11, y: 12 },
    ]);
    assert.deepEqual(pathPoints('M1 2 C7 8 9 10 11 12 Z', { controls: false }), [{ x: 1, y: 2 }, { x: 11, y: 12 }]);
    assert.throws(() => pathPoints('M1 2 l3 4 Z'), /absolute/);
    assert.throws(() => pathPoints('M1 2 A1 1 0 0 1 3 4 Z'), /absolute/);
  });
});
