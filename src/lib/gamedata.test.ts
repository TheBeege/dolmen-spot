// Tests for the arcane and holy spell lists and their summaries in gamedata.ts.
// Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCANE_SPELLS,
  ARCANE_SPELL_SUMMARIES,
  HOLY_SPELLS,
  HOLY_SPELL_SUMMARIES,
  MAGICIAN_STARTING_SPELL_BOOKS,
  getSpellSummary,
  type SpellSummary,
} from './gamedata';

const SAVE_CATEGORIES = ['Doom', 'Ray', 'Hold', 'Blast', 'Spell'];

const LISTS = [
  { type: 'arcane', spells: ARCANE_SPELLS, summaries: ARCANE_SPELL_SUMMARIES, perRank: [12, 12, 12, 12, 12, 12] },
  { type: 'holy', spells: HOLY_SPELLS, summaries: HOLY_SPELL_SUMMARIES, perRank: [8, 8, 6, 6, 6] },
] as const;

const countByRank = (spells: readonly { rank: number }[]) => {
  const counts: number[] = [];
  for (const s of spells) counts[s.rank - 1] = (counts[s.rank - 1] ?? 0) + 1;
  return counts;
};

describe('spell lists', () => {
  test('72 arcane spells, 12 in each of Ranks 1-6', () => {
    assert.equal(ARCANE_SPELLS.length, 72);
    assert.deepEqual(countByRank(ARCANE_SPELLS), [12, 12, 12, 12, 12, 12]);
  });
  test('34 holy spells: 8, 8, 6, 6 and 6 in Ranks 1-5', () => {
    assert.equal(HOLY_SPELLS.length, 34);
    assert.deepEqual(countByRank(HOLY_SPELLS), [8, 8, 6, 6, 6]);
  });
  for (const { type, spells } of LISTS) {
    test(`${type} spell names are unique, even ignoring case`, () => {
      const names = spells.map((s) => s.name.toLowerCase());
      assert.equal(new Set(names).size, names.length);
    });
  }
});

describe('spell summaries', () => {
  for (const { type, spells, summaries, perRank } of LISTS) {
    test(`every ${type} spell has a summary with a range, duration and effect`, () => {
      for (const spell of spells) {
        const summary: SpellSummary | undefined = summaries[spell.name];
        assert.ok(summary, `${spell.name} has no summary`);
        for (const field of ['range', 'duration', 'effect'] as const) {
          assert.ok(summary[field].trim().length > 0, `${spell.name} has an empty ${field}`);
        }
      }
    });
    test(`every ${type} summary belongs to a spell in the ${type} list (no stray or misspelt entries)`, () => {
      const names = new Set(spells.map((s) => s.name));
      const strays = Object.keys(summaries).filter((name) => !names.has(name));
      assert.deepEqual(strays, []);
      assert.equal(Object.keys(summaries).length, perRank.reduce((a, b) => a + b, 0));
    });
  }

  const all = LISTS.flatMap(({ summaries }) => Object.entries(summaries));

  test('every save is written "Save vs" plus one of the five save categories', () => {
    let saves = 0;
    for (const [name, summary] of all) {
      const text = `${summary.range} ${summary.duration} ${summary.effect}`;
      assert.doesNotMatch(text, /versus|saving throw|\bvs\./i, `${name} writes a save another way`);
      for (const match of text.matchAll(/\bvs\b\s*([A-Za-z]*)/g)) {
        assert.match(text.slice(0, match.index), /\bSaves? $/, `${name}: "vs" not after "Save"`);
        assert.ok(SAVE_CATEGORIES.includes(match[1]), `${name}: unknown save "${match[1]}"`);
        saves++;
      }
    }
    assert.ok(saves > 0);
  });

  test('feet are marked with a plain apostrophe, as elsewhere on the sheet', () => {
    for (const [name, summary] of all) {
      for (const text of Object.values(summary)) {
        assert.doesNotMatch(text, /[′’‘“”]/, `${name} has a curly quote or prime`);
      }
    }
  });

  test('fields have no stray spaces, and each effect is a short text ending in a full stop', () => {
    for (const [name, summary] of all) {
      for (const text of Object.values(summary)) {
        assert.equal(text, text.trim(), `${name} has leading or trailing spaces`);
        assert.doesNotMatch(text, / {2}/, `${name} has a double space`);
      }
      assert.match(summary.effect, /\.$/, `${name}'s effect doesn't end with a full stop`);
      // Short enough to read at a glance in the hover card.
      assert.ok(summary.effect.length <= 400, `${name}'s effect is ${summary.effect.length} characters`);
    }
  });
});

describe('getSpellSummary', () => {
  test('finds a spell whatever its case or surrounding spaces', () => {
    assert.equal(getSpellSummary('arcane', '  fireball '), ARCANE_SPELL_SUMMARIES['Fireball']);
    assert.equal(getSpellSummary('holy', 'LESSER HEALING'), HOLY_SPELL_SUMMARIES['Lesser Healing']);
  });
  test('only looks in the list for the given kind of magic', () => {
    assert.equal(getSpellSummary('holy', 'Fireball'), undefined);
    assert.equal(getSpellSummary('arcane', 'Bless'), undefined);
  });
  test("returns nothing for a name that isn't a spell", () => {
    for (const name of ['', '   ', 'Firebal', 'constructor', 'toString', '__proto__']) {
      assert.equal(getSpellSummary('arcane', name), undefined, name);
      assert.equal(getSpellSummary('holy', name), undefined, name);
    }
  });
  test("every spell in a magician's starting spell book has a summary", () => {
    for (const book of MAGICIAN_STARTING_SPELL_BOOKS) {
      for (const spell of book.spells) {
        assert.ok(getSpellSummary('arcane', spell), `${book.name}: ${spell}`);
      }
    }
  });
});
