// Which Ranks of spell a character can learn: only those they can memorise at
// their current Level (Player's Book p78), read off the Spells Per Day tables
// (magician p73, breggle kindred-class p180), and the note the tab and the PDF
// put on an entry of a Rank above them. Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, KINDREDS, SPELLS_PER_DAY, getCharacterMagicProfile, getLearnableSpellRanks } from './gamedata';
import { rankAboveLearnableNote, studyRankAboveLearnableNote } from './character-sheet';
import type { Character, ClassId, KindredId, SpellStudyEntry, StudySource } from './types';

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

describe('studyRankAboveLearnableNote', () => {
  // A level 3 magician: Ranks 1 and 2, so a Rank 5 study is above what they can
  // learn. Only the fields the note reads are filled in.
  const LEARNABLE = [1, 2];
  const asCharacter = (knownSpells: string[]): Pick<Character, 'level' | 'knownSpells'> => ({
    level: 3,
    knownSpells: knownSpells.map((name) => ({ id: name, name, rank: 5, source: 'mentor' })),
  });
  const asStudy = (
    spellName: string,
    rank: number,
    source: StudySource,
  ): Pick<SpellStudyEntry, 'spellName' | 'rank' | 'source'> => ({ spellName, rank, source });

  test('a study of a learnable Rank gets no note', () => {
    for (const rank of LEARNABLE) {
      assert.equal(studyRankAboveLearnableNote(asStudy('Fireball', rank, 'mentor'), asCharacter([]), LEARNABLE), undefined, `Rank ${rank}`);
    }
  });

  test('a study above those Ranks gets the note, whatever its source', () => {
    for (const source of ['book', 'mentor', 'research'] as const) {
      assert.equal(
        studyRankAboveLearnableNote(asStudy('Teleport', 5, source), asCharacter([]), LEARNABLE),
        rankAboveLearnableNote(5, 3),
        source,
      );
    }
  });

  test('rewriting a spell the character already knows gets no note: it is not learning it', () => {
    // At any Rank, including the highest, which the character can't learn at all.
    for (const rank of [5, 6]) {
      assert.equal(
        studyRankAboveLearnableNote(asStudy('Teleport', rank, 'rewrite'), asCharacter(['Teleport']), LEARNABLE),
        undefined,
        `Rank ${rank}`,
      );
    }
    // Matched as the tab matches it, ignoring case.
    assert.equal(
      studyRankAboveLearnableNote(asStudy('teleport', 5, 'rewrite'), asCharacter(['Teleport']), LEARNABLE),
      undefined,
      'lower case',
    );
  });

  test('rewriting a spell the character does not know gets the note: finishing it would teach it', () => {
    assert.equal(
      studyRankAboveLearnableNote(asStudy('Wall of Fire', 5, 'rewrite'), asCharacter(['Teleport']), LEARNABLE),
      rankAboveLearnableNote(5, 3),
    );
  });
});
