// Which Ranks of spell a character can learn: only those they can memorise at
// their current Level (Player's Book p78), read off the Spells Per Day tables
// (magician p73, breggle kindred-class p180). Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, KINDREDS, SPELLS_PER_DAY, getCharacterMagicProfile, getLearnableSpellRanks } from './gamedata';
import type { ClassId, KindredId } from './types';

const learnable = (kindred: KindredId | '', classId: ClassId | '', level: number) =>
  getLearnableSpellRanks(getCharacterMagicProfile(kindred, classId, level));

describe('getLearnableSpellRanks', () => {
  test('a magician learns the Ranks they can memorise at their Level', () => {
    assert.deepEqual(learnable('human', 'magician', 1), [1]);
    assert.deepEqual(learnable('human', 'magician', 3), [1, 2]);
    assert.deepEqual(learnable('human', 'magician', 4), [1, 2]);
    assert.deepEqual(learnable('human', 'magician', 7), [1, 2, 3, 4]);
    assert.deepEqual(learnable('human', 'magician', 15), [1, 2, 3, 4, 5, 6]);
  });

  test("a magician of any Kindred uses the magician's table", () => {
    assert.deepEqual(learnable('elf', 'magician', 3), [1, 2]);
    assert.deepEqual(learnable('breggle', 'magician', 1), [1]);
    assert.deepEqual(learnable('', 'magician', 7), [1, 2, 3, 4]);
  });

  test('a breggle kindred-class learns nothing before Level 4, then Rank 1, up to Rank 5', () => {
    assert.deepEqual(learnable('breggle', '', 1), []);
    assert.deepEqual(learnable('breggle', '', 3), []);
    assert.deepEqual(learnable('breggle', '', 4), [1]);
    assert.deepEqual(learnable('breggle', '', 5), [1]);
    assert.deepEqual(learnable('breggle', '', 7), [1, 2]);
    assert.deepEqual(learnable('breggle', '', 15), [1, 2, 3, 4, 5]);
  });

  test('Levels outside 1-15 count as Level 1 or 15, as the tables do', () => {
    assert.deepEqual(learnable('human', 'magician', 0), [1]);
    assert.deepEqual(learnable('human', 'magician', 20), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(learnable('breggle', '', 20), [1, 2, 3, 4, 5]);
  });

  test("holy spell-casters don't learn spells, whatever their Level", () => {
    for (const classId of ['cleric', 'friar'] as const) {
      for (const level of [1, 2, 7, 15]) assert.deepEqual(learnable('human', classId, level), [], `${classId} ${level}`);
    }
  });

  test('characters without spells learn none', () => {
    for (const classId of ['bard', 'enchanter', 'fighter', 'hunter', 'knight', 'thief'] as const) {
      for (const level of [1, 7, 15]) assert.deepEqual(learnable('human', classId, level), [], `${classId} ${level}`);
    }
    for (const kindred of ['elf', 'grimalkin', 'mossling', 'woodgrue'] as const) {
      for (const level of [1, 7, 15]) assert.deepEqual(learnable(kindred, '', level), [], `${kindred} ${level}`);
    }
    assert.deepEqual(learnable('human', '', 5), []);
    assert.deepEqual(learnable('', '', 5), []);
  });

  test('every arcane table at every Level gives Ranks 1 to n: exactly those with a slot', () => {
    // The tables are found through the profiles themselves, so a third arcane
    // class is covered here without editing the test. Today's are the
    // Magician's (whatever the Kindred) and the Breggle kindred-class's.
    const arcane = new Map<string, { kindred: KindredId | ''; classId: ClassId | '' }>();
    for (const kindred of ['' as const, ...KINDREDS.map((k) => k.id)]) {
      for (const classId of ['' as const, ...CLASSES.map((c) => c.id)]) {
        const profile = getCharacterMagicProfile(kindred, classId, 15);
        if (profile.spellType === 'arcane' && profile.spellsPerDay) arcane.set(classId || kindred, { kindred, classId });
      }
    }
    for (const table of ['magician', 'breggle']) assert.ok(arcane.has(table), `${table} is missing from the sweep`);

    for (const [table, { kindred, classId }] of arcane) {
      for (let level = 1; level <= 15; level++) {
        const slots = SPELLS_PER_DAY[table][level];
        const n = slots.filter((count) => count > 0).length;
        assert.deepEqual(
          learnable(kindred, classId, level),
          Array.from({ length: n }, (_, i) => i + 1),
          `${table} Level ${level}`,
        );
        slots.forEach((count, i) => assert.equal(count > 0, i < n, `${table} Level ${level} Rank ${i + 1}`));
      }
    }
  });
});
