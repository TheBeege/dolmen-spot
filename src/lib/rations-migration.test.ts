// Tests for the v15 → v16 migration, which turns the old fresh/preserved ration
// counters into inventory items (src/lib/rations.ts), and for the repair that
// runs on every load and import. Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, createDefaultCharacter, daysBetween, RATIONS } from './gamedata';
import { getLivedDays } from './livedTime';
import { CURRENT_SCHEMA_VERSION, MIGRATION_VERSIONS, migrateCharacter } from './migrations';
import { getRationItems, getRationSpoilage, rationSlots, rationWeight } from './rations';
import { CHARACTERS_KEY, characterFileJson, createCharacterStore, parseImportedCharacter, type StorageLike } from './storage';
import type { Character } from './types';

type AnyData = Record<string, unknown>;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** A save from schema 15, with these fields: rations are counters, and there is no dankConditions. */
function v15(fields: AnyData = {}): AnyData {
  const data = clone(createDefaultCharacter()) as unknown as AnyData;
  delete data.dankConditions;
  delete data.rations;
  return { ...data, rations: { fresh: 0, preserved: 0 }, ...fields, schemaVersion: 15 };
}

/** A save from this version, with these fields. */
function current(fields: AnyData = {}): AnyData {
  return { ...(clone(createDefaultCharacter()) as unknown as AnyData), ...fields, schemaVersion: CURRENT_SCHEMA_VERSION };
}

/** Loading what loading saved changes nothing. */
function assertStable(m: Character, message?: string): void {
  assert.equal(JSON.stringify(migrateCharacter(clone(m))), JSON.stringify(m), message);
}

/** Today on the character's lived-time clock, as the migration reads it. */
function livedDayOf(data: AnyData): number {
  return getLivedDays(data as unknown as Character);
}

const rationStateOf = (m: Character) => getRationItems(m).map((item) => item.ration?.freshness);
const namesOf = (m: Character) => getRationItems(m).map((item) => item.name);
const acquiredDaysOf = (m: Character) => getRationItems(m).map((item) => item.ration?.acquiredLivedDay);

describe('v15 → v16', () => {
  test('there is a migration from 15, and the schema is one past the last migration', () => {
    assert.ok(MIGRATION_VERSIONS.includes(15));
    assert.equal(CURRENT_SCHEMA_VERSION, Math.max(...MIGRATION_VERSIONS) + 1);
  });

  test('the fresh and preserved counters become that many ration items among the stowed items', () => {
    const saved = v15({ rations: { fresh: 2, preserved: 3 } });
    const migrated = migrateCharacter(clone(saved));

    assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.equal(migrated.stowedItems.length, 5);
    assert.deepEqual(rationStateOf(migrated), ['fresh', 'fresh', 'preserved', 'preserved', 'preserved']);
    assert.deepEqual(namesOf(migrated), [
      'Rations (fresh, 1 day)',
      'Rations (fresh, 1 day)',
      'Rations (preserved, 1 day)',
      'Rations (preserved, 1 day)',
      'Rations (preserved, 1 day)',
    ]);
    // The rules' own slots and weight, so the encumbrance totals count them: a
    // day's rations is a general item, so both kinds take 1 slot.
    assert.deepEqual(migrated.stowedItems.map((item) => [item.kind, item.slots, item.weight]), [
      ['ration', 1, 20],
      ['ration', 1, 20],
      ['ration', 1, 20],
      ['ration', 1, 20],
      ['ration', 1, 20],
    ]);
    assert.equal(rationSlots(migrated.stowedItems), 5, 'one slot per day, fresh or preserved');
    assert.equal(rationWeight(migrated.stowedItems), 5 * RATIONS.fresh.weight);
  });

  test('every converted ration is stamped with today, so nothing is instantly spoiled', () => {
    const saved = v15({
      currentDate: { day: 20, month: 5, year: 12 },
      rations: { fresh: 1, preserved: 1 },
    });
    const today = livedDayOf(saved);
    assert.ok(today > 0, 'a character far into the calendar has lived many days');
    const migrated = migrateCharacter(clone(saved));
    assert.deepEqual(acquiredDaysOf(migrated), [today, today]);
    for (const item of getRationItems(migrated)) {
      const spoilage = getRationSpoilage(migrated, item);
      assert.equal(spoilage?.ageDays, 0);
      assert.equal(spoilage?.spoiled, false);
      assert.equal(spoilage?.daysLeft, RATIONS[item.ration!.freshness].keepsDays);
    }
  });

  test('a save already past a few days keeps its rations fresh too: the migration can\'t know when they were bought', () => {
    // A character whose days-lived counter starts long after Year 1.
    const saved = v15({
      currentDate: addDays({ day: 1, month: 0, year: 1 }, 300),
      livedTimeStart: { day: 1, month: 0, year: 1 },
      rations: { fresh: 1, preserved: 0 },
    });
    const migrated = migrateCharacter(clone(saved));
    assert.deepEqual(acquiredDaysOf(migrated), [livedDayOf(saved)]);
    assert.equal(getRationSpoilage(migrated, getRationItems(migrated)[0])?.spoiled, false);
  });

  test('the days spent in Fairy count towards the acquisition day, as they do for everything on that clock', () => {
    const saved = v15({
      currentDate: { day: 1, month: 0, year: 1 },
      fairyVisits: [{
        id: 'v1',
        enteredOn: { day: 1, month: 0, year: 1 },
        returnedOn: { day: 1, month: 0, year: 1 },
        daysInFairy: 12,
      }],
      rations: { fresh: 1, preserved: 0 },
    });
    const migrated = migrateCharacter(clone(saved));
    assert.deepEqual(acquiredDaysOf(migrated), [12]);
  });

  test('the ids are all different, and none of them is an id an item already has', () => {
    const saved = v15({
      equippedItems: [{ id: 'kept-equipped', name: 'Sword', slots: 1, weight: 40, notes: '', equipped: true }],
      stowedItems: [{ id: 'kept-stowed', name: 'Rope', slots: 1, weight: 200, notes: '', equipped: false }],
      rations: { fresh: 3, preserved: 4 },
    });
    const migrated = migrateCharacter(clone(saved));
    const ids = migrated.stowedItems.map((item) => item.id);
    assert.equal(ids.length, 8, 'the 7 rations follow the item that was already there');
    assert.equal(new Set(ids).size, 8, 'every item has an id of its own');
    assert.ok(ids.includes('kept-stowed'), 'the item that was there keeps its id');
    assert.ok(migrated.equippedItems.some((item) => item.id === 'kept-equipped'));
    const all = [...migrated.equippedItems, ...migrated.stowedItems].map((item) => item.id);
    assert.equal(new Set(all).size, 9);
  });

  test('the old rations field is gone, and the new one is set', () => {
    const migrated = migrateCharacter(v15({ rations: { fresh: 1, preserved: 1 } })) as unknown as AnyData;
    assert.equal('rations' in migrated, false);
    assert.equal(migrated.dankConditions, false);
  });

  test('a character with no rations is unchanged apart from the two new fields', () => {
    const saved = v15({ name: 'Wren', stowedItems: [{ id: 'i', name: 'Rope', slots: 1, weight: 200, notes: '', equipped: false }] });
    const migrated = migrateCharacter(clone(saved));
    const { schemaVersion: _v, dankConditions: _d, rations: _r, ...rest } = migrated as unknown as AnyData;
    const { schemaVersion: _sv, rations: _sr, ...savedRest } = saved;
    assert.deepEqual(rest, savedRest);
    assert.deepEqual(migrated.stowedItems, saved.stowedItems);
  });

  test('counter values that aren\'t whole numbers of rations convert what they can hold', () => {
    const cases: [unknown, [number, number]][] = [
      [{ fresh: 2.7, preserved: 0 }, [2, 0]], // floored: whole days' food
      [{ fresh: -3, preserved: 1 }, [0, 1]],
      [{ fresh: '4', preserved: 1 }, [4, 1]], // digits saved as text spell a count
      [{ fresh: ' 2 ', preserved: 'many' }, [2, 0]],
      [{ fresh: '2.5', preserved: 3 }, [0, 3]], // not digits: not a count
      [{ fresh: null, preserved: true }, [0, 0]],
      [{ fresh: Number.NaN, preserved: Number.POSITIVE_INFINITY }, [0, 0]],
      [{}, [0, 0]],
    ];
    for (const [rations, expected] of cases) {
      const states = rationStateOf(migrateCharacter(v15({ rations })));
      const counts: [number, number] = [
        states.filter((state) => state === 'fresh').length,
        states.filter((state) => state === 'preserved').length,
      ];
      assert.deepEqual(counts, expected, JSON.stringify(rations));
    }
  });

  test('a count saved as digits counts as the number it spells, as a saved schemaVersion once did', () => {
    for (const fresh of ['4', ' 4 ', '04']) {
      const migrated = migrateCharacter(v15({ rations: { fresh, preserved: '2' } }));
      assert.deepEqual(rationStateOf(migrated), ['fresh', 'fresh', 'fresh', 'fresh', 'preserved', 'preserved'], JSON.stringify(fresh));
      assert.equal((migrated as unknown as AnyData).otherNotes, '', `${JSON.stringify(fresh)}: nothing to note`);
    }
  });

  test('no ration is lost: every count the save could hold is converted, not dropped', () => {
    for (const [fresh, preserved] of [[0, 0], [1, 0], [0, 1], [7, 9], [40, 40]]) {
      const migrated = migrateCharacter(v15({ rations: { fresh, preserved } }));
      assert.equal(getRationItems(migrated).length, fresh + preserved, `${fresh} fresh, ${preserved} preserved`);
    }
  });

  test('a plain ration the catalog made before this version becomes a ration item, with the rules\' name and slots', () => {
    // The catalog offered "Rations (preserved, 1 day)" as ordinary gear with no
    // state, so it never spoiled; it's the item's kind that's missing, not its
    // numbers (1 slot and 20 coins are what the rules give it).
    const plain = { id: 'plain', name: 'Rations (preserved, 1 day)', slots: 1, weight: 20, notes: 'From Lankshorn', equipped: false };
    const migrated = migrateCharacter(v15({
      stowedItems: [plain],
      equippedItems: [{ id: 'hand', name: ' RATIONS (FRESH, 1 DAY) ', slots: 1, weight: 20, notes: '', equipped: true }],
    }));
    const [stowed] = migrated.stowedItems;
    assert.deepEqual(stowed, {
      id: 'plain',
      name: 'Rations (preserved, 1 day)',
      slots: 1,
      weight: 20,
      notes: 'From Lankshorn',
      equipped: false,
      kind: 'ration',
      ration: { freshness: 'preserved', acquiredLivedDay: livedDayOf(v15()) },
    });
    assert.deepEqual(migrated.equippedItems[0].ration, { freshness: 'fresh', acquiredLivedDay: livedDayOf(v15()) });
    assert.equal(migrated.equippedItems[0].slots, 1);
    // Its name takes the sheet's spelling, which is what makes it one kind of item.
    assert.equal(migrated.equippedItems[0].name, 'Rations (fresh, 1 day)');
    assertStable(migrated, 'a second load changes nothing');
  });

  test('a kind saved as null or an empty string is no kind, so the item converts', () => {
    const plain = (kind: unknown) => ({ id: 'p', name: 'Rations (fresh, 1 day)', slots: 1, weight: 20, notes: '', equipped: false, kind });
    for (const kind of [undefined, null, '']) {
      const migrated = migrateCharacter(v15({ stowedItems: [plain(kind)] }));
      assert.deepEqual(migrated.stowedItems[0].ration, { freshness: 'fresh', acquiredLivedDay: livedDayOf(v15()) }, JSON.stringify(kind));
      assert.equal(migrated.stowedItems[0].kind, 'ration', JSON.stringify(kind));
    }
  });

  test('an item with another name, or one that is already a kind of its own, is left alone', () => {
    const others = [
      { id: 'a', name: 'Rations (preserved, 2 days)', slots: 1, weight: 20, notes: '', equipped: false },
      { id: 'b', name: 'Rations', slots: 1, weight: 20, notes: '', equipped: false },
      { id: 'c', name: 'Rations (fresh, 1 day)', slots: 4, weight: 30, notes: '', equipped: false, kind: 'scroll' },
      { id: 'd', name: 'Rations (fresh, 1 day)', slots: 1, weight: 20, notes: '', equipped: false, kind: 'ration', ration: { freshness: 'fresh', acquiredLivedDay: 4 } },
    ];
    const migrated = migrateCharacter(v15({ stowedItems: clone(others) }));
    assert.deepEqual(migrated.stowedItems, others, 'well-formed ration items keep what they say');
  });

  test('a count of more digits than a number holds is capped too, not lost', () => {
    // 401 digits parse to Infinity as a number; it's still a count, far past
    // what becomes items, so 999 are made and the rest is written down.
    const digits = '9'.repeat(401);
    const migrated = migrateCharacter(v15({ rations: { fresh: digits, preserved: 0 } }));
    assert.equal(rationStateOf(migrated).filter((state) => state === 'fresh').length, 999);
    assert.match(migrated.otherNotes, /^Rations \(fresh\): \d+ more days' rations/);
  });

  test('a counter in the thousands is capped, and the rest is written into Other Notes', () => {
    // Nothing a real character carries, so not worth thousands of items (or a
    // save too big to write); the number is kept where the player can see it.
    const migrated = migrateCharacter(v15({ rations: { fresh: 1_000_000, preserved: 2 }, otherNotes: 'A note.' }));
    assert.deepEqual(rationStateOf(migrated).filter((state) => state === 'fresh').length, 999);
    assert.deepEqual(rationStateOf(migrated).filter((state) => state === 'preserved').length, 2);
    assert.match(migrated.otherNotes, /^A note\.\n\nRations \(fresh\): 999001 more days' rations/);
    assertStable(migrated, 'a second load changes nothing');
  });

  test('a save with no schemaVersion at all migrates the same way (legacy data)', () => {
    const legacy = v15({ rations: { fresh: 2, preserved: 1 } }) as AnyData;
    delete legacy.schemaVersion;
    const migrated = migrateCharacter(legacy);
    assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.deepEqual(rationStateOf(migrated), ['fresh', 'fresh', 'preserved']);
    assert.equal('rations' in (migrated as unknown as AnyData), false);
  });

  test('a v15 save with rations and no items list at all still converts them', () => {
    for (const stowed of [undefined, null, 'rope', 42, {}]) {
      const saved = v15({ rations: { fresh: 2, preserved: 1 }, stowedItems: stowed });
      const migrated = migrateCharacter(clone(saved));
      assert.equal(getRationItems(migrated).length, 3, JSON.stringify(stowed));
    }
  });

  test('a second load changes nothing', () => {
    assertStable(migrateCharacter(v15({
      rations: { fresh: 2, preserved: 1 },
      currentDate: { day: 9, month: 3, year: 4 },
    })));
  });
});

describe('a v16 save is repaired, not migrated', () => {
  test('a ration\'s slots and weight are the rules\' ones, whatever the save says', () => {
    const item = (ration: unknown, slots = 9, weight = 99) => ({
      id: 'r', name: 'Rations (fresh, 1 day)', slots, weight, notes: '', equipped: false, kind: 'ration', ration,
    });
    const loaded = migrateCharacter(current({
      stowedItems: [
        item({ freshness: 'preserved', acquiredLivedDay: 5 }),
        item({ freshness: 'fresh', acquiredLivedDay: 5 }, 0, 0),
      ],
    }));
    assert.deepEqual(loaded.stowedItems.map((i) => [i.slots, i.weight]), [[1, 20], [1, 20]]);
  });

  test('a state that isn\'t an object, or a kind that isn\'t one of the two, becomes fresh food acquired today', () => {
    const today = livedDayOf(current({ currentDate: addDays({ day: 1, month: 0, year: 1 }, 17) }));
    assert.ok(today > 0);
    for (const ration of [undefined, null, 'preserved', [], {}, { freshness: 'smoked', acquiredLivedDay: 3 }]) {
      const loaded = migrateCharacter(current({
        currentDate: addDays({ day: 1, month: 0, year: 1 }, 17),
        stowedItems: [{ id: 'r', name: 'Rations', slots: 1, weight: 20, notes: '', equipped: false, kind: 'ration', ration }],
      }));
      const state = loaded.stowedItems[0].ration;
      const label = JSON.stringify(ration);
      if (ration !== null && typeof ration === 'object' && !Array.isArray(ration) && 'acquiredLivedDay' in ration) {
        // A well-formed day is a claim about when the food was got, and is kept.
        assert.deepEqual(state, { freshness: 'fresh', acquiredLivedDay: 3 }, label);
      } else {
        assert.deepEqual(state, { freshness: 'fresh', acquiredLivedDay: today }, label);
      }
    }
  });

  test('loading a save with rations, exporting it and importing it again keeps them', () => {
    const migrated = migrateCharacter(v15({
      currentDate: { day: 4, month: 2, year: 3 },
      rations: { fresh: 1, preserved: 2 },
    }));
    const again = parseImportedCharacter(characterFileJson(migrated));
    const { id: _newId, ...rest } = again;
    const { id: _oldId, ...expected } = migrated;
    assert.deepEqual(rest, expected);
    assert.deepEqual(rationStateOf(again), ['fresh', 'preserved', 'preserved']);
    assertStable(again, 'importing what was exported changes nothing');
  });
});

/** What the migration must survive: values a hand edit or a bug could leave behind. */
const hostileRations: unknown[] = [
  undefined, null, 0, 1, -1, 2.5, '', 'lol', [], {}, [[]], [null],
  { fresh: 'lol' }, { preserved: -2 }, { fresh: 999, preserved: 0 }, { fresh: 3, preserved: 2, other: 1 },
];

describe('the migration never throws', () => {
  test('whatever the rations field, the items or the clock hold', () => {
    for (const [i, rations] of hostileRations.entries()) {
      for (const [j, stowedItems] of [undefined, null, 5, 'rope', [], [null], [{}]].entries()) {
        for (const [k, currentDate] of [undefined, null, 'today', { day: 99, month: 99, year: -4 }].entries()) {
          const saved = v15({ rations, stowedItems, currentDate } as AnyData);
          const label = `value ${i}, items ${j}, date ${k}`;
          let migrated: Character | undefined;
          assert.doesNotThrow(() => { migrated = migrateCharacter(clone(saved)); }, label);
          assert.ok(migrated, label);
          assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION, label);
          assert.ok(Array.isArray(migrated.stowedItems), label);
          const ids = [...migrated.equippedItems, ...migrated.stowedItems]
            .filter((item) => item != null && typeof item === 'object')
            .map((item) => item.id);
          assert.equal(new Set(ids).size, ids.length, `${label}: ids are unique`);
          assert.equal(typeof migrated.dankConditions, 'boolean', label);
          assert.equal('rations' in (migrated as unknown as AnyData), false, label);
          assertStable(migrated, `${label}: a second load changes nothing`);
        }
      }
    }
  });
});

/** In-memory localStorage, for the real load path. */
class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

describe('through loading and import', () => {
  test('loading a v15 save turns its rations into items and saves it back as the current version', () => {
    const ls = new MemoryStorage();
    ls.setItem(CHARACTERS_KEY, JSON.stringify([v15({ id: 'kept-id', name: 'Wren', rations: { fresh: 2, preserved: 1 } })]));
    const { characters } = createCharacterStore(ls).load();
    assert.deepEqual(rationStateOf(characters[0]), ['fresh', 'fresh', 'preserved']);
    const [written] = JSON.parse(ls.getItem(CHARACTERS_KEY) ?? '[]');
    assert.equal(written.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.equal('rations' in written, false);
    assert.equal(written.dankConditions, false);
    assert.deepEqual(
      written.stowedItems.map((item: { kind: string }) => item.kind),
      ['ration', 'ration', 'ration'],
    );
  });

  test('importing a v15 file converts its rations, so a player\'s food comes across with the character', () => {
    const imported = parseImportedCharacter(JSON.stringify(v15({ rations: { fresh: 4, preserved: 2 } })));
    assert.equal(imported.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.deepEqual(rationStateOf(imported), ['fresh', 'fresh', 'fresh', 'fresh', 'preserved', 'preserved']);
    assert.equal(rationSlots(imported.stowedItems), 6, 'one slot each');
  });

  test('a v15 file with no rations at all imports with none, and nothing invented', () => {
    const imported = parseImportedCharacter(JSON.stringify(v15()));
    assert.deepEqual(imported.stowedItems, []);
    assert.deepEqual(getRationItems(imported), []);
    assert.equal(imported.dankConditions, false);
  });

  test('a save at a newer schema is left as it is (only the migration changes shape)', () => {
    const future = { ...current({ rations: { fresh: 2, preserved: 0 } }), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    const ls = new MemoryStorage();
    ls.setItem(CHARACTERS_KEY, JSON.stringify([future]));
    // The store sets a newer save aside rather than migrating it, so its
    // `rations` counters are still there and no items were made from them.
    const store = createCharacterStore(ls);
    store.load();
    const status = store.getStatus();
    assert.ok(status.setAside.some((entry) => entry.reason === 'newer-version'));
    assert.equal(status.startedNewSheet, true, 'nothing could be opened, so a new sheet was started in memory');
    const [raw] = JSON.parse(ls.getItem(CHARACTERS_KEY) ?? '[]');
    assert.deepEqual(raw.rations, { fresh: 2, preserved: 0 }, 'no items made from its counters');
    assert.equal(raw.schemaVersion, CURRENT_SCHEMA_VERSION + 1, 'its version is untouched');
  });
});

describe('days and rations agree with the calendar', () => {
  test('the acquisition day is on the same clock as the character\'s dates', () => {
    const saved = v15({ currentDate: { day: 1, month: 0, year: 1 }, rations: { fresh: 1, preserved: 0 } });
    const migrated = migrateCharacter(clone(saved));
    const [ration] = getRationItems(migrated);
    assert.equal(ration.ration?.acquiredLivedDay, 0);

    // Ten Dolmenwood days later, the same item is ten days old.
    const later: Character = { ...migrated, currentDate: addDays(migrated.currentDate, 10) };
    assert.equal(daysBetween(migrated.currentDate, later.currentDate), 10);
    assert.equal(getRationSpoilage(later, ration)?.ageDays, 10);
    assert.equal(getRationSpoilage(later, ration)?.spoiled, true);
  });
});
