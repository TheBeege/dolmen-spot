// Spells per day must match the Player's Book exactly. These are the book's
// tables, typed out row by row (Level 1 first; '-' in the book is 0), so a
// slip in gamedata.ts can't go unnoticed again: before this test, the cleric,
// friar, magician and breggle tables were wrong from Level 7 or 8 up.
// Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPELLS_PER_DAY, getSpellsPerDay } from './gamedata';

const BOOK: Record<string, number[][]> = {
  // p60
  cleric: [
    [0, 0, 0, 0, 0], // Level 1
    [1, 0, 0, 0, 0], // Level 2
    [2, 0, 0, 0, 0], // Level 3
    [2, 1, 0, 0, 0], // Level 4
    [2, 2, 0, 0, 0], // Level 5
    [2, 2, 1, 0, 0], // Level 6
    [3, 2, 2, 0, 0], // Level 7
    [3, 2, 2, 0, 0], // Level 8
    [3, 3, 2, 1, 0], // Level 9
    [3, 3, 2, 2, 0], // Level 10
    [4, 3, 3, 2, 0], // Level 11
    [4, 3, 3, 2, 1], // Level 12
    [4, 4, 3, 2, 2], // Level 13
    [4, 4, 3, 3, 2], // Level 14
    [5, 4, 4, 3, 2], // Level 15
  ],
  // p66
  friar: [
    [1, 0, 0, 0, 0], // Level 1
    [2, 0, 0, 0, 0], // Level 2
    [2, 1, 0, 0, 0], // Level 3
    [2, 2, 0, 0, 0], // Level 4
    [3, 2, 1, 0, 0], // Level 5
    [3, 2, 2, 0, 0], // Level 6
    [3, 3, 2, 1, 0], // Level 7
    [4, 3, 2, 2, 0], // Level 8
    [4, 3, 3, 2, 1], // Level 9
    [4, 4, 3, 2, 2], // Level 10
    [5, 4, 3, 3, 2], // Level 11
    [5, 4, 4, 3, 2], // Level 12
    [5, 5, 4, 3, 3], // Level 13
    [6, 5, 4, 4, 3], // Level 14
    [6, 5, 5, 4, 3], // Level 15
  ],
  // p73
  magician: [
    [1, 0, 0, 0, 0, 0], // Level 1
    [2, 0, 0, 0, 0, 0], // Level 2
    [2, 1, 0, 0, 0, 0], // Level 3
    [2, 2, 0, 0, 0, 0], // Level 4
    [2, 2, 1, 0, 0, 0], // Level 5
    [3, 2, 2, 0, 0, 0], // Level 6
    [3, 2, 2, 1, 0, 0], // Level 7
    [3, 3, 2, 2, 0, 0], // Level 8
    [3, 3, 2, 2, 1, 0], // Level 9
    [4, 3, 3, 2, 2, 0], // Level 10
    [4, 3, 3, 2, 2, 1], // Level 11
    [4, 4, 3, 3, 2, 2], // Level 12
    [4, 4, 3, 3, 3, 2], // Level 13
    [5, 4, 4, 3, 3, 2], // Level 14
    [5, 4, 4, 3, 3, 3], // Level 15
  ],
  // p180 (kindred-class)
  breggle: [
    [0, 0, 0, 0, 0], // Level 1
    [0, 0, 0, 0, 0], // Level 2
    [0, 0, 0, 0, 0], // Level 3
    [1, 0, 0, 0, 0], // Level 4
    [2, 0, 0, 0, 0], // Level 5
    [2, 1, 0, 0, 0], // Level 6
    [2, 2, 0, 0, 0], // Level 7
    [2, 2, 1, 0, 0], // Level 8
    [3, 2, 2, 0, 0], // Level 9
    [3, 2, 2, 1, 0], // Level 10
    [3, 3, 2, 2, 0], // Level 11
    [3, 3, 2, 2, 1], // Level 12
    [4, 3, 3, 2, 2], // Level 13
    [4, 3, 3, 2, 2], // Level 14
    [4, 4, 3, 3, 2], // Level 15
  ],
};

for (const [classId, rows] of Object.entries(BOOK)) {
  test(`${classId}: spells per day match the book at every Level`, () => {
    const table = SPELLS_PER_DAY[classId];
    assert.ok(table, `no table for ${classId}`);
    assert.deepEqual(Object.keys(table).map(Number).sort((a, b) => a - b), rows.map((_, i) => i + 1));
    rows.forEach((row, i) => assert.deepEqual(table[i + 1], row, `${classId} Level ${i + 1}`));
  });

  test(`${classId}: getSpellsPerDay returns the book's row, clamping Levels outside 1-15`, () => {
    rows.forEach((row, i) => assert.deepEqual(getSpellsPerDay(classId, i + 1), row));
    assert.deepEqual(getSpellsPerDay(classId, 0), rows[0]);
    assert.deepEqual(getSpellsPerDay(classId, 20), rows[14]);
  });

  test(`${classId}: no rank's count goes down as Level rises`, () => {
    for (let level = 2; level <= 15; level++) {
      rows[level - 1].forEach((count, rank) =>
        assert.ok(count >= rows[level - 2][rank], `${classId} Level ${level} rank ${rank + 1}`),
      );
    }
  });
}

test('only these four tables exist', () => {
  assert.deepEqual(Object.keys(SPELLS_PER_DAY).sort(), Object.keys(BOOK).sort());
});
