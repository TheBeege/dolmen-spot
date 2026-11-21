// Tests for the magic data in gamedata.ts: the arcane and holy spell lists and
// their summaries, and the glamour, rune and knack descriptions.
// Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCANE_SPELLS,
  ARCANE_SPELL_SUMMARIES,
  FAIRY_RUNES,
  GLAMOURS,
  HOLY_SPELLS,
  HOLY_SPELL_SUMMARIES,
  MAGICIAN_STARTING_SPELL_BOOKS,
  MOSSLING_KNACKS,
  findSpell,
  getSpellSummary,
} from './gamedata';
import type { SpellSummary } from './types';

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

const summaries = LISTS.flatMap(({ summaries }) => Object.entries(summaries));

/** Every magic text the sheet shows, as [what it is, text] pairs. */
const MAGIC_TEXTS: [string, string][] = [
  ...summaries.flatMap(([name, s]): [string, string][] =>
    [[`${name} range`, s.range], [`${name} duration`, s.duration], [`${name} effect`, s.effect]]),
  ...GLAMOURS.map((g): [string, string] => [g.name, g.description]),
  ...FAIRY_RUNES.map((r): [string, string] => [r.name, r.description]),
  ...MOSSLING_KNACKS.flatMap((k) => k.tiers.map((t): [string, string] => [`${k.name} L${t.level}`, t.description])),
];

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

  test('each effect is a short text ending in a full stop', () => {
    for (const [name, summary] of summaries) {
      assert.match(summary.effect, /\.$/, `${name}'s effect doesn't end with a full stop`);
      // Short enough to read at a glance in the hover card.
      assert.ok(summary.effect.length <= 400, `${name}'s effect is ${summary.effect.length} characters`);
    }
  });
});

// The conventions noted beside the data in gamedata.ts, for the spell
// summaries and the glamour, rune and knack descriptions alike.
describe('magic text conventions', () => {
  test('every save is written "Save vs" plus one of the five save categories', () => {
    let saves = 0;
    for (const [what, text] of MAGIC_TEXTS) {
      assert.doesNotMatch(text, /versus|saving throw|\bvs\./i, `${what} writes a save another way`);
      assert.doesNotMatch(
        text,
        /\b(Doom|Ray|Hold|Blast|Spell) saves?\b|\bsaves? (against|versus) (Doom|Ray|Hold|Blast|Spell)\b/i,
        `${what} writes a save another way`,
      );
      for (const match of text.matchAll(/\bvs\b\s*([A-Za-z]*)/g)) {
        assert.match(text.slice(0, match.index), /\bSaves? $/, `${what}: "vs" not after "Save"`);
        assert.ok(SAVE_CATEGORIES.includes(match[1]), `${what}: unknown save "${match[1]}"`);
        saves++;
      }
    }
    assert.ok(saves > 0);
  });

  test('they use plain ASCII (feet are an apostrophe, minus a hyphen)', () => {
    for (const [what, text] of MAGIC_TEXTS) {
      assert.doesNotMatch(text, /[^\x20-\x7E]/, `${what} has a character outside plain ASCII`);
    }
  });

  test('numbers are numerals, and how often something works is written 1x/day', () => {
    for (const [what, text] of MAGIC_TEXTS) {
      assert.doesNotMatch(
        text,
        /\b(one(?!-way)|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|single)\b/i,
        `${what} spells out a number`,
      );
      assert.doesNotMatch(
        text,
        /\b(once|daily|weekly|monthly|yearly)\b|\bper (day|week|month|year)\b/i,
        `${what} writes a frequency another way`,
      );
    }
  });

  test('they have no stray spaces', () => {
    for (const [what, text] of MAGIC_TEXTS) {
      assert.ok(text.length > 0, `${what} is empty`);
      assert.equal(text, text.trim(), `${what} has leading or trailing spaces`);
      assert.doesNotMatch(text, / {2}/, `${what} has a double space`);
    }
  });
});

describe('findSpell and getSpellSummary', () => {
  test('find a spell whatever its case or surrounding spaces', () => {
    assert.equal(findSpell('holy', ' hold person ')?.name, 'Hold Person');
    assert.equal(findSpell('arcane', 'IGNITE/EXTINGUISH')?.name, 'Ignite/Extinguish');
    assert.equal(getSpellSummary('arcane', '  fireball '), ARCANE_SPELL_SUMMARIES['Fireball']);
    assert.equal(getSpellSummary('holy', 'LESSER HEALING'), HOLY_SPELL_SUMMARIES['Lesser Healing']);
  });
  test('find a spell written with spaces around its slash, as the book prints it, or doubled spaces', () => {
    assert.equal(findSpell('arcane', 'Ignite / Extinguish')?.name, 'Ignite/Extinguish');
    assert.equal(findSpell('arcane', 'ignite/  extinguish')?.name, 'Ignite/Extinguish');
    assert.equal(findSpell('arcane', ' Glyph  of   Sealing ')?.name, 'Glyph of Sealing');
    assert.equal(findSpell('holy', 'Purify Food  and Drink')?.name, 'Purify Food and Drink');
    assert.equal(getSpellSummary('arcane', 'Ignite / Extinguish'), ARCANE_SPELL_SUMMARIES['Ignite/Extinguish']);
  });
  test('only look in the list for the given kind of magic', () => {
    assert.equal(findSpell('holy', 'Fireball'), undefined);
    assert.equal(getSpellSummary('holy', 'Fireball'), undefined);
    assert.equal(getSpellSummary('arcane', 'Bless'), undefined);
  });
  test("return nothing for a name that isn't a spell", () => {
    for (const name of ['', '   ', '/', 'Firebal', 'Ignite', 'Ignite/', 'constructor', 'toString', '__proto__']) {
      for (const spellType of ['arcane', 'holy'] as const) {
        assert.equal(findSpell(spellType, name), undefined, name);
        assert.equal(getSpellSummary(spellType, name), undefined, name);
      }
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
