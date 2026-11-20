// Tests for the journal side of loading a save: the v13 → v14 migration that
// gives journal entries a hex, and the repair of entries' hexes that runs on
// every load and import. Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCharacter } from './gamedata';
import { CURRENT_SCHEMA_VERSION, MIGRATION_VERSIONS, migrateCharacter } from './migrations';
import { CHARACTERS_KEY, characterFileJson, createCharacterStore, parseImportedCharacter, type StorageLike } from './storage';
import type { Character } from './types';

type AnyData = Record<string, unknown>;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** A save from schema 13 (the hex map, before journal hexes) with these journal entries. */
function v13(journalEntries: unknown): AnyData {
  const data = clone(createDefaultCharacter()) as unknown as AnyData;
  data.schemaVersion = 13;
  data.journalEntries = journalEntries;
  return data;
}

let entryCount = 0;
const entry = (location: unknown, extra: AnyData = {}): AnyData => ({
  id: `entry-${(entryCount += 1)}`,
  date: { day: 1, month: 0, year: 1 },
  location,
  text: 'Something happened.',
  ...extra,
});

const hexes = (c: Character) => c.journalEntries.map((e) => ('hex' in e ? e.hex : '(none)'));

describe('v13 → v14: journal entries get a hex', () => {
  test('there is a migration from 13, and the schema is one past the last migration', () => {
    assert.ok(MIGRATION_VERSIONS.includes(13));
    assert.equal(CURRENT_SCHEMA_VERSION, Math.max(...MIGRATION_VERSIONS) + 1);
  });

  test("an old entry gets no hex: where it was written isn't known", () => {
    const migrated = migrateCharacter(v13([entry('Lankshorn'), entry('')]));
    assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.deepEqual(hexes(migrated), ['(none)', '(none)']);
  });

  test('a location that is exactly a hex on the map is carried over, and the location stays', () => {
    const migrated = migrateCharacter(v13([entry('0606'), entry('1303')]));
    assert.deepEqual(hexes(migrated), ['0606', '1303']);
    assert.deepEqual(migrated.journalEntries.map((e) => e.location), ['0606', '1303']);
  });

  test('nothing looser is guessed', () => {
    const locations = ['Hex 0606', '0606 ', ' 0606', '606', '06 06', '0606a', 'near 0606', '9999', '0007', 606];
    assert.deepEqual(hexes(migrateCharacter(v13(locations.map((l) => entry(l))))), locations.map(() => '(none)'));
  });

  test("a hex already on an old entry (a hand edit) stays if it's on the map; anything else there goes", () => {
    const migrated = migrateCharacter(
      v13([
        entry('Lankshorn', { hex: '0303' }),
        entry('Lankshorn', { hex: '9999' }),
        entry('0707', { hex: 'zz' }),
        entry('Lankshorn', { hex: '' }),
        entry('Lankshorn', { hex: 606 }),
        entry('Lankshorn', { hex: ['0606'] }),
      ]),
    );
    assert.deepEqual(hexes(migrated), ['0303', '(none)', '0707', '(none)', '(none)', '(none)']);
  });

  test('everything else about the entries is unchanged', () => {
    const saved = [
      entry('0606', { fairyEvent: { visitId: 'v', kind: 'entered' } }),
      entry('Lankshorn', { sinceReturnFrom: 'v', note: 'a field from the future' }),
    ];
    const migrated = migrateCharacter(v13(clone(saved)));
    assert.deepEqual(migrated.journalEntries, [{ ...saved[0], hex: '0606' }, saved[1]]);
  });

  test('a save from before versioning migrates all the way, with the same rule', () => {
    const legacy = {
      id: 'legacy',
      name: 'Old Timer',
      journalEntries: [entry('0606'), entry('Lankshorn')],
    };
    const migrated = migrateCharacter(clone(legacy));
    assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.deepEqual(hexes(migrated), ['0606', '(none)']);
  });

  test('a second load changes nothing', () => {
    const migrated = migrateCharacter(v13([entry('0606'), entry('Lankshorn'), entry('x', { hex: '1001' })]));
    assert.deepEqual(migrateCharacter(clone(migrated)), migrated);
  });

  test('it never throws, whatever the journal holds', () => {
    const hostile: unknown[] = [
      undefined,
      null,
      'lol',
      42,
      true,
      {},
      { 0: entry('0606') },
      [],
      [null, 1, 'x', [], true, [entry('0606')]],
      [{ location: { toString: null } }, { location: [], hex: {} }, { hex: null }, { hex: undefined, location: '0101' }],
      [Object.create(null)],
      [{ location: '__proto__' }, { hex: '__proto__' }, { location: 'constructor' }, { hex: 'hasOwnProperty' }],
      [entry('0606', { date: 'not a date' }), entry('0606', { date: null })],
    ];
    for (const journal of hostile) {
      const migrated = migrateCharacter(v13(journal));
      assert.ok(Array.isArray(migrated.journalEntries), JSON.stringify(journal));
      for (const e of migrated.journalEntries) {
        assert.ok(!('hex' in e) || /^\d{4}$/.test(e.hex ?? ''), JSON.stringify(e));
      }
    }
  });
});

describe("on every load: entries' hexes are repaired, never guessed", () => {
  const current = (journalEntries: unknown): AnyData => ({ ...v13(journalEntries), schemaVersion: CURRENT_SCHEMA_VERSION });

  test('a current save keeps its hexes, and an entry whose hex was cleared stays without one', () => {
    const migrated = migrateCharacter(current([entry('Lankshorn', { hex: '0606' }), entry('0707')]));
    assert.deepEqual(hexes(migrated), ['0606', '(none)']);
  });

  test('a hex not on the map (a hand edit) is removed; the rest of the entry stays', () => {
    const saved = entry('Lankshorn', { hex: '9999' });
    const migrated = migrateCharacter(current([clone(saved), entry('x', { hex: 1 }), entry('y', { hex: '' })]));
    assert.deepEqual(hexes(migrated), ['(none)', '(none)', '(none)']);
    const { hex: _gone, ...rest } = saved;
    assert.deepEqual(migrated.journalEntries[0], rest);
  });

  test('every entry gets an id of its own: a missing, empty or repeated one is replaced', () => {
    const saved = [
      entry('a', { id: 'same' }),
      entry('b', { id: 'same' }),
      entry('c', { id: '' }),
      entry('d', { id: 7 }),
      entry('e', { id: undefined }),
      entry('f', { id: 'own' }),
    ];
    const migrated = migrateCharacter(current(saved));
    const ids = migrated.journalEntries.map((e) => e.id);
    assert.equal(ids[0], 'same', 'the first of a repeated id keeps it');
    assert.equal(ids[5], 'own');
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every((id) => typeof id === 'string' && id !== ''));
    assert.deepEqual(migrated.journalEntries.map((e) => e.location), ['a', 'b', 'c', 'd', 'e', 'f']);
    assert.deepEqual(migrateCharacter(clone(migrated)), migrated, 'and a second load changes nothing');
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
  const saved = (): AnyData => ({ ...v13([entry('0606'), entry('Lankshorn')]), id: 'kept-id', name: 'Wren' });

  test('loading a v13 save migrates it and saves it back as the current version', () => {
    const ls = new MemoryStorage();
    ls.setItem(CHARACTERS_KEY, JSON.stringify([saved()]));
    const { characters } = createCharacterStore(ls).load();
    assert.deepEqual(hexes(characters[0]), ['0606', '(none)']);
    const [written] = JSON.parse(ls.getItem(CHARACTERS_KEY) ?? '[]');
    assert.equal(written.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.deepEqual(written.journalEntries.map((e: AnyData) => e.hex ?? '(none)'), ['0606', '(none)']);
  });

  test('importing a v13 file migrates it; exporting and importing again keeps every hex', () => {
    const imported = parseImportedCharacter(JSON.stringify(saved()));
    assert.deepEqual(hexes(imported), ['0606', '(none)']);
    const edited: Character = {
      ...imported,
      journalEntries: [...imported.journalEntries, { ...imported.journalEntries[1], id: 'new', hex: '1106' }],
    };
    const again = parseImportedCharacter(characterFileJson(edited));
    assert.deepEqual(hexes(again), ['0606', '(none)', '1106']);
    assert.deepEqual(again.journalEntries, edited.journalEntries);
  });
});
