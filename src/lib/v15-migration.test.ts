// Tests for the v14 → v15 migration and the repairs that came with it, which
// run on every load and import: NPCs, the NPCs a journal entry is about,
// Dwemer shards, and a schemaVersion saved as a string of digits. The map's
// side of v15 (kinds of paths and POIs, ley lines recorded as found and their
// spells) is in map-migration.test.ts, Scenarios 25-28. Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCharacter } from './gamedata';
import { isValidHex } from './hex';
import { editReturnDate } from './livedTime';
import { isPathKind, isPoiKind } from './map-data';
import { CURRENT_SCHEMA_VERSION, MIGRATION_VERSIONS, migrateCharacter, readSchemaVersion } from './migrations';
import { CHARACTERS_KEY, characterFileJson, createCharacterStore, parseImportedCharacter, type StorageLike } from './storage';
import type { Character } from './types';

type AnyData = Record<string, unknown>;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** A save from schema 14, with these fields: it has no NPCs, and its paths no kind. */
function v14(fields: AnyData = {}): AnyData {
  const data = clone(createDefaultCharacter()) as unknown as AnyData;
  delete data.npcs;
  return { ...data, ...fields, schemaVersion: 14 };
}

/** A save from this version, with these fields. */
function current(fields: AnyData = {}): AnyData {
  return { ...(clone(createDefaultCharacter()) as unknown as AnyData), ...fields, schemaVersion: CURRENT_SCHEMA_VERSION };
}

/** Loading what loading saved changes nothing. */
function assertStable(m: Character, message?: string): void {
  assert.equal(JSON.stringify(migrateCharacter(clone(m))), JSON.stringify(m), message);
}

const npc = (fields: AnyData = {}): AnyData => ({
  id: 'n1',
  name: 'Brother Fenwick',
  affiliation: 'Pluritine Church',
  location: 'Lankshorn',
  hex: '0606',
  goals: 'The bell of St Clewd, returned',
  quests: [{ id: 'q1', text: 'Find the bell', done: false }],
  ...fields,
});

const loadNpcs = (npcs: unknown): Character['npcs'] => migrateCharacter(current({ npcs })).npcs;

describe('v14 → v15', () => {
  test('there is a migration from 14, and the schema is one past the last migration', () => {
    assert.ok(MIGRATION_VERSIONS.includes(14));
    assert.equal(CURRENT_SCHEMA_VERSION, Math.max(...MIGRATION_VERSIONS) + 1);
  });

  test('a v14 save gets an empty list of NPCs and a kind on each path; nothing else changes', () => {
    const saved = v14({
      mapData: {
        pois: [{ id: 'p', hex: '0606', name: 'Old Tower', notes: '' }],
        fairyDoors: [],
        leyLines: [
          { id: 'l', type: 'Ley line', name: 'Humming Line', color: '#c4a35a', hexes: ['0303', '0404'], notes: 'hums' },
          { id: 'r', type: 'Old road', name: 'Kings Road', color: '#7a5fc4', hexes: ['0505', '0606'], notes: '' },
        ],
      },
      journalEntries: [{ id: 'j', date: { day: 1, month: 0, year: 1 }, location: 'Lankshorn', text: 'Arrived.' }],
      stowedItems: [{ id: 'i', name: 'Rope', slots: 1, weight: 200, notes: '', equipped: false }],
    });
    const migrated = migrateCharacter(clone(saved));
    assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.deepEqual(migrated.npcs, []);
    assert.deepEqual(migrated.mapData.leyLines.map((l) => l.kind), ['leyLine', 'other']);
    const { schemaVersion: _version, npcs: _npcs, mapData, ...rest } = migrated;
    const { schemaVersion: _savedVersion, mapData: savedMap, ...savedRest } = saved;
    assert.deepEqual(rest, savedRest);
    assert.deepEqual(mapData.leyLines.map(({ kind: _kind, ...line }) => line), (savedMap as AnyData).leyLines);
    assert.deepEqual(mapData.pois, (savedMap as AnyData).pois, 'no POI kind is guessed from a name');
  });

  test('NPCs already in a v14 save (a hand edit) are kept, repaired', () => {
    const migrated = migrateCharacter(v14({ npcs: [{ id: 'n', name: 'Fenwick' }] }));
    assert.deepEqual(migrated.npcs, [{ id: 'n', name: 'Fenwick', affiliation: '', location: '', goals: '', quests: [] }]);
  });

  test('a second load changes nothing', () => {
    assertStable(migrateCharacter(v14({ npcs: [npc()] })));
  });
});

describe('NPCs are repaired on every load and import', () => {
  test('well-formed NPCs are kept exactly, fields from later versions included', () => {
    const saved = [npc({ portrait: 'owl.png' }), npc({ id: 'n2', name: 'Wren', quests: [] })];
    delete saved[1].hex;
    assert.deepEqual(loadNpcs(clone(saved)), saved);
  });

  test('a value that is not a list becomes one: a lone NPC, or text, is kept as one NPC', () => {
    assert.deepEqual(loadNpcs(npc()), [npc()]);
    assert.deepEqual(loadNpcs('Brother Fenwick').map((n) => n.name), ['Brother Fenwick']);
    assert.deepEqual(loadNpcs(42).map((n) => n.name), ['42']);
    for (const none of [undefined, null, {}, '', '  ', [[], [null], null]]) assert.deepEqual(loadNpcs(none), [], JSON.stringify(none));
  });

  test('an entry that is not an object becomes an NPC named with the text it holds, or is dropped', () => {
    assert.deepEqual(loadNpcs([null, 'Wren', 7, [], ['Old Moss'], {}]).map((n) => n.name), ['Wren', '7', '["Old Moss"]', '']);
  });

  test('every NPC has an id of its own, as text', () => {
    const ids = loadNpcs([{ id: 'a' }, { id: 'a' }, { id: '' }, { id: 7 }, {}, { id: { x: 1 } }]).map((n) => n.id);
    assert.equal(ids[0], 'a', 'the first of a repeated id keeps it');
    assert.equal(ids[3], '7');
    assert.ok(ids.every((id) => typeof id === 'string' && id !== ''));
    assert.equal(new Set(ids).size, ids.length);
  });

  test('names, affiliations, locations and goals are text; anything else keeps the text it holds', () => {
    const [n] = loadNpcs([{ name: 42, affiliation: null, location: ['Lankshorn'], goals: { a: 1 } }]);
    assert.deepEqual([n.name, n.affiliation, n.location, n.goals], ['42', '', '["Lankshorn"]', '{"a":1}']);
    const [typed] = loadNpcs([{ name: ' Fen ', goals: '\nfirst line\n' }]);
    assert.deepEqual([typed.name, typed.goals], [' Fen ', '\nfirst line\n'], 'text is kept as typed');
  });

  test("a hex is kept only if it's on the map", () => {
    const hexes = ['0606', '9999', 606, '', null, ['0606'], 'constructor'].map((hex) => {
      const [n] = loadNpcs([npc({ hex })]);
      return 'hex' in n ? n.hex : '(none)';
    });
    assert.deepEqual(hexes, ['0606', '(none)', '(none)', '(none)', '(none)', '(none)', '(none)']);
  });

  test('quests are a checklist of { id, text, done }: done only if true, ids unique within the NPC', () => {
    const [n] = loadNpcs([npc({
      quests: [
        { id: 'q', text: 'Find the bell', done: true },
        { id: 'q', text: 'Ring it', done: 'yes' },
        'Tell the abbot',
        null,
        {},
        { text: 3, done: 1, reward: '10gp' },
      ],
    })]);
    assert.deepEqual(n.quests.map((q) => [q.text, q.done]), [
      ['Find the bell', true], ['Ring it', false], ['Tell the abbot', false], ['', false], ['3', false],
    ]);
    assert.equal(n.quests[0].id, 'q');
    assert.equal(new Set(n.quests.map((q) => q.id)).size, n.quests.length);
    assert.equal((n.quests[4] as unknown as AnyData).reward, '10gp', 'fields from later versions are kept');
    assert.deepEqual(loadNpcs([npc({ quests: 'Find the bell' })])[0].quests.map((q) => q.text), ['Find the bell']);
    assert.deepEqual(loadNpcs([npc({ quests: null })])[0].quests, []);
  });

  test('a second load changes nothing', () => {
    const m = migrateCharacter(current({ npcs: [npc(), 'Wren', { id: 'n1', quests: ['x', 'y'] }, { hex: 'bad' }] }));
    assertStable(m);
  });
});

describe('journal entries: the NPCs they are about', () => {
  const entry = (fields: AnyData): AnyData => ({ id: 'e', date: { day: 1, month: 0, year: 1 }, location: '', text: '', ...fields });
  const npcIdsAfterLoad = (npcIds: unknown) => {
    const [e] = migrateCharacter(current({ journalEntries: [entry({ npcIds })] })).journalEntries;
    return 'npcIds' in e ? e.npcIds : '(none)';
  };

  test('a list of ids is kept, each id once; a number is read as its digits', () => {
    assert.deepEqual(npcIdsAfterLoad(['a', 'b']), ['a', 'b']);
    assert.deepEqual(npcIdsAfterLoad(['a', 'b', 'a']), ['a', 'b']);
    assert.deepEqual(npcIdsAfterLoad([7, '7', 'x']), ['7', 'x']);
  });

  test('anything else in the list is dropped, and a list left empty is removed', () => {
    assert.deepEqual(npcIdsAfterLoad(['a', null, '', {}, [], true, 'b']), ['a', 'b']);
    for (const v of [[], [null], 'a', 5, {}, null]) assert.equal(npcIdsAfterLoad(v), '(none)', JSON.stringify(v));
  });

  test('an id whose NPC is gone is kept: it names no one', () => {
    const m = migrateCharacter(current({ npcs: [npc({ id: 'here' })], journalEntries: [entry({ npcIds: ['here', 'gone'] })] }));
    assert.deepEqual(m.journalEntries[0].npcIds, ['here', 'gone']);
  });

  test("correcting a return date moves an NPC's note like any entry, and it keeps its NPCs", () => {
    const loaded = migrateCharacter(current({
      fairyVisits: [{ id: 'v1', enteredOn: { day: 1, month: 0, year: 1 }, returnedOn: { day: 5, month: 0, year: 1 }, daysInFairy: 2 }],
      currentDate: { day: 6, month: 0, year: 1 },
      npcs: [npc()],
      journalEntries: [entry({ id: 'met', date: { day: 6, month: 0, year: 1 }, sinceReturnFrom: 'v1', text: 'Met Fenwick.', npcIds: ['n1'] })],
    }));
    const patch = editReturnDate(loaded, { day: 7, month: 0, year: 1 });
    assert.ok(patch);
    assert.deepEqual(patch.journalEntries?.[0], { ...loaded.journalEntries[0], date: { day: 8, month: 0, year: 1 } });
  });
});

describe('Dwemer shards', () => {
  const shardItem = (shard: unknown, fields: AnyData = {}): AnyData =>
    ({ id: 's', name: 'Dwemer shard', slots: 0, weight: 1, notes: '', equipped: false, kind: 'shard', shard, ...fields });
  const shardAfterLoad = (shard: unknown) => migrateCharacter(current({ stowedItems: [shardItem(shard)] })).stowedItems[0].shard;
  const uncharged = { castsLeft: 0, castsPerCharge: 1 };

  test('a well-formed state is kept exactly, fields from later versions included', () => {
    const shard = { spell: { name: 'Web', rank: 2 }, castsLeft: 1, castsPerCharge: 3, leyLineId: 'l1', glow: 'blue' };
    assert.deepEqual(shardAfterLoad(clone(shard)), shard);
  });

  test('a shard with no state, or one that is not an object, is uncharged and holds no known spell', () => {
    for (const v of [undefined, null, 'charged', 3, [], true]) assert.deepEqual(shardAfterLoad(v), uncharged, JSON.stringify(v));
  });

  test('casts are whole numbers: at least 1 a charge, and none or more left, even more than a charge gives', () => {
    const left = [2.9, -1, 'x', null, Infinity, 5].map((castsLeft) => shardAfterLoad({ castsLeft, castsPerCharge: 1 })?.castsLeft);
    assert.deepEqual(left, [2, 0, 0, 0, 0, 5]);
    const perCharge = [0, 3.5, -2, '2', null].map((castsPerCharge) => shardAfterLoad({ castsLeft: 0, castsPerCharge })?.castsPerCharge);
    assert.deepEqual(perCharge, [1, 3, 1, 1, 1]);
  });

  test("a spell or ley line that isn't well formed is removed; a ley line's id is text", () => {
    assert.deepEqual(shardAfterLoad({ ...uncharged, spell: { name: '' }, leyLineId: '' }), uncharged);
    assert.deepEqual(shardAfterLoad({ ...uncharged, spell: 'Web', leyLineId: {} }), uncharged);
    assert.deepEqual(shardAfterLoad({ ...uncharged, spell: { name: 'Web', rank: 9.5 }, leyLineId: 5 }), {
      ...uncharged, spell: { name: 'Web', rank: 9 }, leyLineId: '5',
    });
  });

  test('shards are repaired in both lists; other items are left alone, even with a shard field', () => {
    const scroll = { id: 'sc', name: 'Scroll', slots: 0, weight: 1, notes: '', equipped: false, kind: 'scroll', shard: 'junk' };
    const m = migrateCharacter(current({ equippedItems: [shardItem(null, { equipped: true })], stowedItems: [clone(scroll)] }));
    assert.deepEqual(m.equippedItems[0].shard, uncharged);
    assert.deepEqual(m.stowedItems[0], scroll);
  });

  test('a second load changes nothing', () => {
    assertStable(migrateCharacter(current({ stowedItems: [shardItem({ castsLeft: 2.5, spell: { name: 'Web' } }), shardItem(null)] })));
  });
});

describe('a schemaVersion saved as a string of digits', () => {
  test('is read as the number it spells; anything else is left as it is', () => {
    assert.deepEqual(['10', ' 12 ', '014', '99'].map(readSchemaVersion), [10, 12, 14, 99]);
    for (const v of ['', ' ', 'abc', '1e1', '10.5', '-3', '0x10', 12, null, undefined]) assert.equal(readSchemaVersion(v), v, String(v));
  });

  test('"10" runs every migration from version 10, not just the first', () => {
    // v13 → v14 is what gives this entry its hex; loading never guesses one.
    const m = migrateCharacter({
      name: 'Quirk',
      schemaVersion: '10',
      journalEntries: [{ id: 'j', date: { day: 3, month: 1 }, location: '0606', text: '' }],
    });
    assert.equal(m.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.equal(m.journalEntries[0].hex, '0606');
  });

  test('it ends as the current version, a number', () => {
    for (const v of ['1', '10', '13', '14', String(CURRENT_SCHEMA_VERSION)]) {
      assert.equal(migrateCharacter({ name: 'Quirk', schemaVersion: v }).schemaVersion, CURRENT_SCHEMA_VERSION, v);
    }
  });
});

describe('the new fields never make loading throw, whatever they hold', () => {
  const polluting = JSON.parse('{"__proto__": {"polluted": "yes"}, "constructor": {"prototype": {"polluted": "yes"}}}');
  const hostile: unknown[] = [
    undefined, null, 0, -1, 1.5, 1e308, Infinity, NaN, '', ' ', 'x', '3', '0606', '__proto__', 'constructor', true, false,
    [], [null], [[]], {}, { a: 1 }, ['x', 7, null, {}], polluting, Object.create(null),
  ];
  // Where each value goes: every new field, and the lists that hold them.
  const saves = (v: unknown): AnyData => ({
    npcs: [
      v,
      { id: v, name: v, affiliation: v, location: v, hex: v, goals: v, quests: v },
      { quests: [v, { id: v, text: v, done: v }] },
    ],
    journalEntries: [
      { id: 'a', date: { day: 1, month: 0, year: 1 }, location: '', text: '', npcIds: v },
      { id: 'b', date: { day: 1, month: 0, year: 1 }, location: '', text: '', npcIds: [v, 'n'] },
    ],
    equippedItems: [{ id: 'e', kind: 'shard', shard: v }],
    stowedItems: [
      { id: 's', kind: 'shard', shard: { spell: v, castsLeft: v, castsPerCharge: v, leyLineId: v } },
      { id: 't', kind: 'shard', shard: { spell: { name: v, rank: v } } },
      { id: 'u', kind: v, shard: v },
    ],
    mapData: {
      pois: [{ id: 'p', hex: '0303', name: '', notes: '', kind: v }],
      fairyDoors: [],
      leyLines: [
        { id: 'l', kind: v, type: v, name: 'L', hexes: v, spell: v },
        { id: 'm', type: 'Ley line', name: 'M', hexes: [v, '0303'], spell: { name: v, rank: v } },
      ],
      draftLeyLine: { kind: v, type: v, hexes: v },
    },
  });

  function assertWellFormed(m: Character, label: string): void {
    assert.ok(Array.isArray(m.npcs), label);
    for (const n of m.npcs) {
      assert.ok([n.id, n.name, n.affiliation, n.location, n.goals].every((s) => typeof s === 'string') && n.id !== '', label);
      assert.ok(!('hex' in n) || isValidHex(n.hex), label);
      assert.ok(Array.isArray(n.quests), label);
      for (const q of n.quests) assert.ok(typeof q.id === 'string' && q.id !== '' && typeof q.text === 'string' && typeof q.done === 'boolean', label);
    }
    assert.equal(new Set(m.npcs.map((n) => n.id)).size, m.npcs.length, label);
    for (const e of m.journalEntries) {
      assert.ok(!('npcIds' in e) || (Array.isArray(e.npcIds) && e.npcIds.length > 0 && e.npcIds.every((id) => typeof id === 'string' && id !== '')), label);
    }
    for (const item of [...m.equippedItems, ...m.stowedItems]) {
      if (item.kind !== 'shard') continue;
      const s = item.shard;
      assert.ok(s && Number.isInteger(s.castsLeft) && s.castsLeft >= 0 && Number.isInteger(s.castsPerCharge) && s.castsPerCharge >= 1, label);
      assert.ok(!('spell' in s) || (typeof s.spell?.name === 'string' && s.spell.name.trim() !== '' && Number.isInteger(s.spell.rank) && s.spell.rank >= 1), label);
      assert.ok(!('leyLineId' in s) || (typeof s.leyLineId === 'string' && s.leyLineId !== ''), label);
    }
    for (const p of m.mapData.pois) assert.ok(!('kind' in p) || isPoiKind(p.kind), label);
    for (const l of m.mapData.leyLines) {
      assert.ok(isPathKind(l.kind) && Array.isArray(l.hexes) && l.hexes.every(isValidHex), label);
      assert.ok(l.kind === 'leyLine' || l.hexes.length >= 2, label);
      assert.ok(!('spell' in l) || (typeof l.spell?.name === 'string' && l.spell.name.trim() !== '' && Number.isInteger(l.spell.rank)), label);
    }
    const draft = m.mapData.draftLeyLine;
    assert.ok(draft === undefined || isPathKind(draft.kind), label);
  }

  test('as a v14 save (migrated) and as a current one (repaired only)', () => {
    for (const [i, v] of hostile.entries()) {
      for (const [version, make] of [['v14', v14], ['current', current]] as const) {
        // An object without a prototype can't be made a string with String().
        const label = `${version}, value ${i}: ${v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v)}`;
        let m: Character | undefined;
        assert.doesNotThrow(() => { m = migrateCharacter(make(saves(v))); }, label);
        assertWellFormed(m as Character, label);
        assertStable(m as Character, `${label}: a second load changes nothing`);
      }
    }
    assert.equal(({} as AnyData).polluted, undefined, 'nothing reaches Object.prototype');
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
  const saved = (): AnyData => v14({
    id: 'kept-id',
    name: 'Wren',
    mapData: {
      pois: [],
      fairyDoors: [],
      leyLines: [{ id: 'l', type: 'Ley line', name: 'Humming Line', color: '#c4a35a', hexes: ['0303', '0404'], notes: '' }],
    },
  });

  test('loading a v14 save migrates it and saves it back as the current version', () => {
    const ls = new MemoryStorage();
    ls.setItem(CHARACTERS_KEY, JSON.stringify([saved()]));
    const { characters } = createCharacterStore(ls).load();
    assert.deepEqual(characters[0].npcs, []);
    assert.equal(characters[0].mapData.leyLines[0].kind, 'leyLine');
    const [written] = JSON.parse(ls.getItem(CHARACTERS_KEY) ?? '[]');
    assert.equal(written.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.deepEqual(written.npcs, []);
    assert.equal(written.mapData.leyLines[0].kind, 'leyLine');
  });

  test('importing a v14 file migrates it; exporting and importing again keeps NPCs, their notes, shards, kinds and spells', () => {
    const imported = parseImportedCharacter(JSON.stringify(saved()));
    assert.equal(imported.schemaVersion, CURRENT_SCHEMA_VERSION);
    const edited: Character = {
      ...imported,
      npcs: [{
        id: 'n1',
        name: 'Brother Fenwick',
        affiliation: 'Pluritine Church',
        location: 'Lankshorn',
        hex: '0606',
        goals: 'The bell back',
        quests: [{ id: 'q1', text: 'Find the bell', done: false }],
      }],
      journalEntries: [{ id: 'met', date: { day: 1, month: 0, year: 1 }, location: 'Lankshorn', hex: '0606', text: 'Met Fenwick.', npcIds: ['n1'] }],
      stowedItems: [{
        id: 's',
        name: 'Dwemer shard',
        slots: 0,
        weight: 1,
        notes: '',
        equipped: false,
        kind: 'shard',
        shard: { spell: { name: 'Web', rank: 2 }, castsLeft: 1, castsPerCharge: 1, leyLineId: 'l' },
      }],
      mapData: {
        ...imported.mapData,
        pois: [{ id: 'p', hex: '0606', name: 'Old Tower', notes: '', kind: 'tower' }],
        leyLines: [{ ...imported.mapData.leyLines[0], hexes: ['0303'], spell: { name: 'Web', rank: 2 } }],
      },
    };
    const again = parseImportedCharacter(characterFileJson(edited));
    const { id: _newId, ...rest } = again;
    const { id: _oldId, ...expected } = edited;
    assert.deepEqual(rest, expected);
  });
});
