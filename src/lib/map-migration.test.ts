// Tests for the hex-map side of loading a save: the v12 → v13 migration,
// converting the old map's pins, and the repair of mapData and
// currentLocationHex that runs on every load and import. Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_SCHEMA_VERSION, migrateCharacter } from './migrations';
import { hexCenter } from './hex';
import { ALL_HEXES, HEX_CELLS, HEX_GRID_META } from './hex-grid';
import mainV12Save from './fixtures/main-v12-save.json';

type AnyData = Record<string, unknown>;

// Where a hex sits on the old map, as the x/y percentages the old map stored
// for its pins (pixel position in scripts/dolmenwood-map.png ÷ image size).
// dx/dy nudge the point off the hex centre, in image pixels.
function oldMapPosition(hex: string, dx = 0, dy = 0): { x: number; y: number } {
  const cell = HEX_CELLS[hex];
  const c = hexCenter(cell.col, cell.row);
  return {
    x: ((c.x + dx) / HEX_GRID_META.imageWidth) * 100,
    y: ((c.y + dy) / HEX_GRID_META.imageHeight) * 100,
  };
}

const UNPLACED_HEADING = "Map markers that couldn't be placed:";

function baseV10(): AnyData {
  // A minimal v10 character (post knownSpells migration, pre year migration).
  return {
    schemaVersion: 10,
    id: 'test-id',
    name: 'Test',
    kindred: '',
    class: '',
    background: '',
    alignment: '',
    affiliation: '',
    moonSign: '',
    moonPhase: '',
    level: 1,
    xp: 0,
    xpNextLevel: 0,
    xpModifier: 0,
    abilityScores: { strength: 10, intelligence: 10, wisdom: 10, dexterity: 10, constitution: 10, charisma: 10 },
    maxHp: 1,
    currentHp: 1,
    armorClass: 10,
    attackBonus: 0,
    speed: 40,
    travelPointsPerDay: 8,
    magicResistance: 0,
    saveTargets: { doom: 14, ray: 14, hold: 13, blast: 16, spell: 14 },
    skillTargets: { listen: 6, search: 6, survival: 6 },
    equippedItems: [],
    stowedItems: [],
    containers: [],
    tinyItems: '',
    coins: { copper: 0, silver: 0, gold: 10, pellucidium: 0 },
    encumbranceMethod: 'slots',
    equippedArmourName: '',
    hasShield: false,
    spells: [],
    spellNotes: '',
    glamours: [],
    runes: [],
    knack: null,
    startingSpellBook: '',
    knownSpells: [],
    spellStudy: { active: null, queue: [] },
    failedStudies: [],
    classTraits: '',
    kindredTraits: '',
    languages: 'Woldish',
    combatTalents: '',
    otherNotes: '',
    retainers: [],
    gazeUsesRemaining: 0,
    currentForm: 'estray',
    wilderUsedToday: false,
    madRevelryUsesRemaining: 0,
    trophies: [],
    animalCompanion: null,
    liegeHouse: '',
    selectedCombatTalents: [],
    holyOrder: '',
    symbioticFleshTraits: [],
    fungalSymbiosisUsesRemaining: 0,
    currentDate: { day: 1, month: 0 },
    currentLocation: '',
    journalEntries: [],
    exhaustionLevel: 0,
    hungerDays: 0,
    thirstDays: 0,
    rations: { fresh: 0, preserved: 0 },
    activeLightSources: [],
    travelDaysWithoutRest: 0,
    forcedMarchActive: false,
    travelPointsRemaining: 0,
  };
}

function baseV13(mapData: unknown): AnyData {
  const data = baseV10();
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  data.currentDate = { day: 1, month: 0, year: 1 };
  data.currentLocationHex = '';
  data.mapData = mapData;
  return data;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('Scenario 1: clean v10 save (no marker, no mapData)', () => {
  const migrated = migrateCharacter(baseV10() as never);
  test('reaches current schema', () => assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION));
  test('mapData created', () => assert.ok(Array.isArray(migrated.mapData?.pois)));
  test('mapData.pois empty', () => assert.equal(migrated.mapData.pois.length, 0));
  test('mapData.fairyDoors empty', () => assert.equal(migrated.mapData.fairyDoors.length, 0));
  test('mapData.leyLines empty', () => assert.equal(migrated.mapData.leyLines.length, 0));
  test('currentLocationHex empty', () => assert.equal(migrated.currentLocationHex, ''));
  test('CalendarDate gets year', () => assert.equal(migrated.currentDate.year, 1));
});

describe('Scenario 2: legacy MAP_PINS marker with valid pins', () => {
  const data = baseV10();
  data.otherNotes = 'My notes here.\n<!--MAP_PINS-->[{"id":"a","label":"Sniggle","hex":"0303","isCurrentLocation":false},{"id":"b","label":"Inn","hex":"0507","isCurrentLocation":true}]';
  const migrated = migrateCharacter(data as never);
  test('marker stripped from otherNotes', () => assert.ok(!migrated.otherNotes.includes('MAP_PINS')));
  test('prose preserved', () => assert.equal(migrated.otherNotes, 'My notes here.'));
  test('two POIs imported', () => assert.equal(migrated.mapData.pois.length, 2));
  test('first POI label', () => assert.equal(migrated.mapData.pois[0].name, 'Sniggle'));
  test('first POI hex', () => assert.equal(migrated.mapData.pois[0].hex, '0303'));
  test('isCurrent → currentLocationHex', () => assert.equal(migrated.currentLocationHex, '0507'));
});

describe('Scenario 3: unpadded legacy hex codes', () => {
  const data = baseV10();
  // "303" → "0303" (live), "7" → "0007" (NOT in manifest, and the pin has
  // no position to fall back on), "0507" (live).
  data.otherNotes = '<!--MAP_PINS-->[{"label":"X","hex":"303"},{"label":"Y","hex":"7"},{"label":"Z","hex":"0507"}]';
  const migrated = migrateCharacter(data as never);
  const hexes = migrated.mapData.pois.map((p) => p.hex);
  test('two live POIs placed', () => assert.equal(migrated.mapData.pois.length, 2));
  test('hex 303 padded to 0303', () => assert.ok(hexes.includes('0303')));
  test('hex 0507 unchanged', () => assert.ok(hexes.includes('0507')));
  test('hex 7 → 0007 (off-grid, no position) is not a POI', () => assert.ok(!hexes.includes('0007')));
  test('…but its label and typed hex stay in otherNotes', () => {
    assert.equal(migrated.otherNotes, `${UNPLACED_HEADING}\n- Y (Hex 7)`);
  });
});

describe('Scenario 4: no marker at all', () => {
  const data = baseV10();
  data.otherNotes = 'Just regular prose.';
  const migrated = migrateCharacter(data as never);
  test('otherNotes preserved', () => assert.equal(migrated.otherNotes, 'Just regular prose.'));
  test('no POIs imported', () => assert.equal(migrated.mapData.pois.length, 0));
});

describe('Scenario 5: marker followed by malformed JSON', () => {
  const data = baseV10();
  data.otherNotes = 'Notes.\n<!--MAP_PINS-->[{"hex":"0303"'; // truncated
  const migrated = migrateCharacter(data as never);
  test('marker preserved for recovery', () => assert.ok(migrated.otherNotes.includes('MAP_PINS')));
  test('no POIs imported', () => assert.equal(migrated.mapData.pois.length, 0));
});

describe('Scenario 6: marker followed by non-array JSON', () => {
  const data = baseV10();
  data.otherNotes = 'Notes.\n<!--MAP_PINS-->{"oops":1}';
  const migrated = migrateCharacter(data as never);
  test('notes left untouched (nothing to convert)', () => assert.equal(migrated.otherNotes, 'Notes.\n<!--MAP_PINS-->{"oops":1}'));
  test('no POIs imported', () => assert.equal(migrated.mapData.pois.length, 0));
});

describe('Scenario 7: empty pin array', () => {
  const data = baseV10();
  data.otherNotes = 'Prose\n\n<!--MAP_PINS-->[]';
  const migrated = migrateCharacter(data as never);
  test('marker stripped', () => assert.ok(!migrated.otherNotes.includes('MAP_PINS')));
  test('trailing whitespace trimmed', () => assert.equal(migrated.otherNotes, 'Prose'));
  test('no POIs imported', () => assert.equal(migrated.mapData.pois.length, 0));
});

describe('Scenario 8: pre-existing mapData with garbage entries', () => {
  const data = baseV10();
  data.mapData = {
    pois: [
      { id: '1', hex: '0303', name: 'good', notes: '' }, // keep
      { id: '2', hex: 'bad!', name: 'bad', notes: 'x' }, // off the map
      'not an object', // not an item
      { id: '4', hex: '0404', name: 'good2', notes: '' }, // keep
    ],
    fairyDoors: [
      { id: 'd1', hex: '0505', name: 'D', notes: '', destination: { kind: 'wild' } },
      { hex: 'bad', name: 'x' }, // off the map
    ],
    leyLines: [
      { id: 'l1', name: 'L', type: 'Ley line', color: '#fff', hexes: ['0101', '0102'], notes: '' },
      // Paths other than ley lines (which keep any number of hexes: Scenario 25).
      { id: 'l2', name: 'short', type: 'Old road', hexes: ['0101'], notes: '' }, // < 2 hexes
      { id: 'l3', name: 'noarray', type: 'Old road', hexes: 'oops', notes: '' }, // hexes not an array
    ],
  };
  const migrated = migrateCharacter(data as never);
  test('pois filtered to 2 good', () => assert.equal(migrated.mapData.pois.length, 2));
  test('first POI is good', () => assert.equal(migrated.mapData.pois[0].name, 'good'));
  test('second POI is good2', () => assert.equal(migrated.mapData.pois[1].name, 'good2'));
  test('fairyDoors filtered to 1', () => assert.equal(migrated.mapData.fairyDoors.length, 1));
  test('leyLines filtered to 1', () => assert.equal(migrated.mapData.leyLines.length, 1));
  test('everything removed is listed in otherNotes', () => {
    assert.equal(migrated.otherNotes, [
      UNPLACED_HEADING,
      '- bad (Hex bad!): x',
      '- not an object',
      '- Fairy door x (Hex bad)',
      '- Old road short (hexes 0101)',
      '- Old road noarray (hexes oops)',
    ].join('\n'));
  });
  test('a 3-digit colour is replaced by a 6-digit default', () => assert.equal(migrated.mapData.leyLines[0].color, '#c4a35a'));
});

describe('Scenario 9: malformed mapData wholesale (string)', () => {
  const data = baseV10();
  data.mapData = 'junk';
  const migrated = migrateCharacter(data as never);
  test('mapData replaced with empty', () => {
    assert.ok(Array.isArray(migrated.mapData.pois) && migrated.mapData.pois.length === 0);
  });
});

describe('Scenario 10: idempotency — re-running on a v13 save', () => {
  const data = baseV10();
  data.otherNotes = '<!--MAP_PINS-->[{"label":"A","hex":"0303"}]';
  const first = migrateCharacter(data as never);
  // Re-migrate a copy of the (now current) data.
  const second = migrateCharacter(clone(first) as never);
  test('schemaVersion stable', () => assert.equal(second.schemaVersion, CURRENT_SCHEMA_VERSION));
  test('pois unchanged', () => assert.ok(second.mapData.pois.length === 1 && second.mapData.pois[0].name === 'A'));
  test('currentLocationHex unchanged', () => assert.equal(second.currentLocationHex, first.currentLocationHex));
});

describe('Scenario 11b: v13 save with borked mapData.pois (string)', () => {
  const data = baseV10();
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  // The migration loop is skipped entirely; only the post-loop sanitizers
  // and reconcileWithDefaults run.
  data.mapData = { pois: 'oh no', fairyDoors: [], leyLines: [] };
  data.currentDate = { day: 1, month: 0, year: 1 };
  const migrated = migrateCharacter(data as never);
  test('pois repaired to array', () => assert.ok(Array.isArray(migrated.mapData.pois)));
  test('pois empty after repair', () => assert.equal(migrated.mapData.pois.length, 0));
  test('schemaVersion stable', () => assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION));
});

describe('Scenario 11e: hex refs pointing at non-manifest hexes get cleared', () => {
  const data = baseV10();
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  data.currentDate = { day: 1, month: 0, year: 1 };
  // 1313 was in the old 250-hex bounding rectangle but is now an excluded
  // corner (under the "Dolmenwood" title). 0303 is a live hex.
  data.currentLocationHex = '1313';
  data.mapData = {
    pois: [
      { id: 'live', hex: '0303', name: 'Live POI', notes: '' },
      { id: 'orphan', hex: '1313', name: 'Orphan POI', notes: '' },
    ],
    fairyDoors: [
      { id: 'd1', hex: '0404', name: 'Live door', notes: '', destination: { kind: 'wild' } },
      { id: 'd2', hex: '1313', name: 'Orphan door', notes: '', destination: { kind: 'wild' } },
    ],
    leyLines: [
      // Survives after pruning orphans (2 live hexes left).
      { id: 'll1', name: 'Mixed', type: 'Ley line', color: '#fff', hexes: ['0303', '1313', '0404'], notes: '' },
      // A ley line with no live hex left: kept, with none (it's recorded as found).
      { id: 'll2', name: 'AllOrphan', type: 'Ley line', color: '#fff', hexes: ['1313', '1414'], notes: 'hums' },
      // Any other path with no live hex left disappears.
      { id: 'll3', name: 'Lost Lane', type: 'Old road', color: '#fff', hexes: ['1313', '1414'], notes: 'muddy' },
    ],
  };
  const migrated = migrateCharacter(data as never);
  test('orphan POI dropped', () => {
    assert.ok(migrated.mapData.pois.length === 1 && migrated.mapData.pois[0].name === 'Live POI');
  });
  test('orphan door dropped', () => {
    assert.ok(migrated.mapData.fairyDoors.length === 1 && migrated.mapData.fairyDoors[0].name === 'Live door');
  });
  test('an orphan-only ley line is kept with no hexes, and an orphan-only road dropped', () => {
    assert.deepEqual(migrated.mapData.leyLines.map((l) => [l.name, l.hexes, l.notes]), [['Mixed', ['0303', '0404'], ''], ['AllOrphan', [], 'hums']]);
  });
  test('mixed ley line pruned to live hexes', () => assert.deepEqual(migrated.mapData.leyLines[0].hexes, ['0303', '0404']));
  test('orphan currentLocationHex cleared', () => assert.equal(migrated.currentLocationHex, ''));
  test('removed items and hexes are listed in otherNotes', () => {
    assert.equal(migrated.otherNotes, [
      UNPLACED_HEADING,
      '- Orphan POI (Hex 1313)',
      '- Fairy door Orphan door (Hex 1313)',
      '- Ley line Mixed: hexes 1313 left out (not on the map)',
      '- Ley line AllOrphan: hexes 1313, 1414 left out (not on the map)',
      '- Old road Lost Lane (hexes 1313 → 1414): muddy',
    ].join('\n'));
  });
});

describe("Scenario 11g: non-string currentLocationHex (null/number) coerced to ''", () => {
  const data = baseV10();
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  data.currentDate = { day: 1, month: 0, year: 1 };
  data.currentLocationHex = null;
  data.mapData = { pois: [], fairyDoors: [], leyLines: [] };
  const migrated = migrateCharacter(data as never);
  test('null currentLocationHex coerced to empty string', () => assert.equal(migrated.currentLocationHex, ''));
});

describe('Scenario 11f: a live currentLocationHex survives migration', () => {
  const data = baseV10();
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  data.currentDate = { day: 1, month: 0, year: 1 };
  data.currentLocationHex = '0303';
  data.mapData = { pois: [], fairyDoors: [], leyLines: [] };
  const migrated = migrateCharacter(data as never);
  test('currentLocationHex preserved', () => assert.equal(migrated.currentLocationHex, '0303'));
});

describe('Scenario 11d: self-paired door (pairedDoorId === own id) → wild', () => {
  const data = baseV10();
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  data.currentDate = { day: 1, month: 0, year: 1 };
  data.mapData = {
    pois: [],
    fairyDoors: [
      { id: 'S', hex: '0303', name: 'Self', notes: '', destination: { kind: 'roaded', pairedDoorId: 'S', roadName: 'Loop' } },
    ],
    leyLines: [],
  };
  const migrated = migrateCharacter(data as never);
  test('self-paired downgraded to wild', () => assert.equal(migrated.mapData.fairyDoors[0].destination.kind, 'wild'));
  test('its road name is kept in its notes', () => {
    assert.equal(migrated.mapData.fairyDoors[0].notes, 'Was on the fairy road "Loop" (its other end couldn\'t be found).');
  });
});

describe('Scenario 11c: asymmetric door pair gets repaired to wild', () => {
  const data = baseV10();
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  data.currentDate = { day: 1, month: 0, year: 1 };
  data.mapData = {
    pois: [],
    fairyDoors: [
      // A claims B, but B is wild → A should become wild.
      { id: 'A', hex: '0303', name: 'A', notes: '', destination: { kind: 'roaded', pairedDoorId: 'B', roadName: 'Solo Road' } },
      { id: 'B', hex: '0404', name: 'B', notes: '', destination: { kind: 'wild' } },
      // C and D mutually paired → preserved.
      { id: 'C', hex: '0505', name: 'C', notes: '', destination: { kind: 'roaded', pairedDoorId: 'D', roadName: 'Twin Road' } },
      { id: 'D', hex: '0606', name: 'D', notes: '', destination: { kind: 'roaded', pairedDoorId: 'C', roadName: 'Twin Road' } },
      // E points at non-existent door → E should become wild.
      { id: 'E', hex: '0707', name: 'E', notes: '', destination: { kind: 'roaded', pairedDoorId: 'ghost', roadName: 'Ghost Road' } },
    ],
    leyLines: [],
  };
  const migrated = migrateCharacter(data as never);
  const byId = Object.fromEntries(migrated.mapData.fairyDoors.map((d) => [d.id, d]));
  test('A repaired to wild', () => assert.equal(byId.A.destination.kind, 'wild'));
  test('B stays wild', () => assert.equal(byId.B.destination.kind, 'wild'));
  test('C stays roaded', () => assert.equal(byId.C.destination.kind, 'roaded'));
  test('D stays roaded', () => assert.equal(byId.D.destination.kind, 'roaded'));
  test('E (orphan) repaired to wild', () => assert.equal(byId.E.destination.kind, 'wild'));
  test('repaired doors keep their road names in their notes', () => {
    assert.ok(byId.A.notes.includes('"Solo Road"') && byId.E.notes.includes('"Ghost Road"') && byId.C.notes === '');
  });
});

describe("Scenario 11: pins that can't be placed are kept in otherNotes", () => {
  const data = baseV10();
  data.otherNotes = 'Prose.\n<!--MAP_PINS-->[{},{"label":"no-hex"},{"hex":"abcd"},{"hex":"0303","label":"good"},null,"str",true,[1,"a"]]';
  const migrated = migrateCharacter(data as never);
  test('only the good pin becomes a POI', () => assert.equal(migrated.mapData.pois.length, 1));
  test('good pin label', () => assert.equal(migrated.mapData.pois[0].name, 'good'));
  test('marker stripped, unplaced pins (and text-only entries) listed after the prose; empty ones ignored', () => {
    assert.equal(migrated.otherNotes, `Prose.\n\n${UNPLACED_HEADING}\n- no-hex\n- Marker (Hex abcd)\n- str\n- true\n- [1,"a"]`);
  });
});

describe('Scenario 12: pins without a usable hex are placed by their old-map position', () => {
  const data = baseV10();
  const pins = [
    // No hex typed, valid position (the old "Hex #" field was optional).
    { id: 'no-hex', label: 'Hidden Shrine', hex: '', ...oldMapPosition('0909', 40, -30), isCurrentLocation: false },
    // Junk typed into "Hex #": fall back to the position.
    { id: 'junk', label: 'Ford', hex: 'by the river', ...oldMapPosition('0606'), isCurrentLocation: false },
    // Well-formed hex that isn't on the grid (1313 sits under the title
    // art): fall back to the position.
    { id: 'off-grid-hex', label: 'Abbey', hex: '1313', ...oldMapPosition('1210', -50, 40), isCurrentLocation: false },
    // A typed hex that IS on the grid wins over the position.
    { id: 'typed', label: 'Inn', hex: '0507', ...oldMapPosition('0909'), isCurrentLocation: false },
    // Converted pin marked current → currentLocationHex.
    { id: 'current', label: 'Camp', hex: '', ...oldMapPosition('1004', 0, 60), isCurrentLocation: true },
    // Hand-edited numeric hex: no crash, padded like a typed one.
    { id: 'numeric', label: 'Numeric', hex: 303, x: 'n/a', y: null, isCurrentLocation: false },
    // Position in the image margin, outside the grid: kept in notes.
    { id: 'margin', label: 'Compass Rose', hex: '', x: 1, y: 98, isCurrentLocation: false },
    // Position out of range / not numbers: kept in notes.
    { id: 'bad-pos', label: 'Lost', hex: 'nowhere', x: 150, y: '20', isCurrentLocation: false },
  ];
  data.otherNotes = `Notes.\n<!--MAP_PINS-->${JSON.stringify(pins)}`;
  const migrated = migrateCharacter(data as never);
  const hexOf = Object.fromEntries(migrated.mapData.pois.map((p) => [p.id, p.hex]));
  const notesOf = Object.fromEntries(migrated.mapData.pois.map((p) => [p.id, p.notes]));
  test('no hex, valid position → POI on the hex under the pin', () => assert.equal(hexOf['no-hex'], '0909'));
  test('junk hex string → placed by position', () => assert.equal(hexOf['junk'], '0606'));
  test('off-grid typed hex → placed by position', () => assert.equal(hexOf['off-grid-hex'], '1210'));
  test('typed on-grid hex wins over position', () => assert.equal(hexOf['typed'], '0507'));
  test('numeric hex padded, not crashing', () => assert.equal(hexOf['numeric'], '0303'));
  test('converted current-location pin sets currentLocationHex', () => assert.equal(migrated.currentLocationHex, '1004'));
  test('POIs keep the pin labels', () => assert.equal(migrated.mapData.pois.find((p) => p.id === 'no-hex')?.name, 'Hidden Shrine'));
  test('text typed into "Hex #" is kept in the notes of a pin placed by position', () => {
    assert.ok(notesOf['junk'] === 'Old map hex: by the river' && notesOf['off-grid-hex'] === 'Old map hex: 1313', JSON.stringify(notesOf));
  });
  test('…and pins placed by their typed hex get no such note', () => {
    assert.ok(notesOf['typed'] === '' && notesOf['no-hex'] === '' && notesOf['numeric'] === '');
  });
  test('off-grid / invalid positions are not POIs', () => assert.ok(!('margin' in hexOf) && !('bad-pos' in hexOf)));
  test('…their labels stay in otherNotes, marker stripped', () => {
    assert.equal(migrated.otherNotes, `Notes.\n\n${UNPLACED_HEADING}\n- Compass Rose\n- Lost (Hex nowhere)`);
  });
});

describe('Scenario 13: each hex centre, as an old-map position, migrates back to that hex', () => {
  const data = baseV10();
  data.otherNotes = `<!--MAP_PINS-->${JSON.stringify(ALL_HEXES.map((h) => ({ id: h, label: h, hex: '', ...oldMapPosition(h) })))}`;
  const migrated = migrateCharacter(data as never);
  const wrong = migrated.mapData.pois.filter((p) => p.id !== p.hex).map((p) => `${p.id}→${p.hex}`);
  test(`all ${ALL_HEXES.length} hexes round-trip`, () => {
    assert.ok(migrated.mapData.pois.length === ALL_HEXES.length && wrong.length === 0, wrong.join(', '));
  });
});

describe('Scenario 14: malformed map elements are normalized to the shape the map draws', () => {
  const migrated = migrateCharacter(baseV13({
    pois: [{ id: 'p', hex: '0303', name: 'P', notes: 5 }, { hex: '0404', name: { a: 1 } }],
    fairyDoors: [
      { id: 'd0', hex: '0303', name: 'No destination', notes: '' },
      { id: 'd1', hex: '0404', name: 'Null destination', notes: '', destination: null },
      { id: 'd2', hex: '0505', name: 'String destination', notes: '', destination: 'wild' },
      { id: 'd3', hex: '0606', name: 'Unknown kind', notes: '', destination: { kind: 'portal' } },
      { id: 'd4', hex: '0707', name: 'R1', notes: null, destination: { kind: 'roaded', pairedDoorId: 'd5', roadName: { x: 1 } } },
      { id: 'd5', hex: '0808', name: 7, destination: { kind: 'roaded', pairedDoorId: 'd4' } },
      { id: 'd6', hex: '0909', name: 'No partner id', notes: '', destination: { kind: 'roaded', roadName: 'Lost Lane' } },
    ],
    leyLines: [
      { hexes: ['0303', '0404'] },
      { id: 7, name: null, type: 3, color: 'red', hexes: ['0505', '0606'], notes: {} },
    ],
    draftLeyLine: { name: 5, hexes: ['0101', 'zz'], color: '#ABCDEF' },
  }) as never);
  const md = migrated.mapData;
  const isStr = (v: unknown) => typeof v === 'string';
  const door = Object.fromEntries(md.fairyDoors.map((d) => [d.id, d]));
  test('every POI has string id / name / notes', () => {
    assert.ok(md.pois.every((p) => isStr(p.id) && p.id !== '' && isStr(p.name) && isStr(p.notes)), JSON.stringify(md.pois));
  });
  test('non-string notes / names are coerced (number → text, object → empty)', () => {
    assert.ok(md.pois[0].notes === '5' && md.pois[1].name === '');
  });
  test('missing / null / string / unknown destinations become wild', () => {
    assert.ok(['d0', 'd1', 'd2', 'd3'].every((id) => door[id].destination.kind === 'wild'));
  });
  test('a mutual roaded pair stays roaded, with string road names', () => {
    assert.ok(
      door.d4.destination.kind === 'roaded' && door.d4.destination.roadName === '' &&
      door.d5.destination.kind === 'roaded' && door.d5.destination.roadName === '',
      JSON.stringify([door.d4, door.d5]),
    );
  });
  test('non-string door names / notes are coerced', () => {
    assert.ok(door.d5.name === '7' && door.d4.notes === '' && door.d5.notes === '');
  });
  test('a roaded door without a partner id goes wild and keeps its road name', () => {
    assert.ok(door.d6.destination.kind === 'wild' && door.d6.notes.includes('"Lost Lane"'));
  });
  test('every ley line gets a string id / name / type / notes and a #rrggbb colour', () => {
    assert.ok(
      md.leyLines.length === 2 && md.leyLines.every((l) => isStr(l.id) && l.id !== '' && isStr(l.name) && isStr(l.type) && isStr(l.notes) && /^#[0-9a-f]{6}$/i.test(l.color)),
      JSON.stringify(md.leyLines),
    );
  });
  test('ley line fields are coerced', () => {
    assert.ok(md.leyLines[1].id === '7' && md.leyLines[1].type === '3' && md.leyLines[1].name === '');
  });
  test('a path with no kind gets one from its type as coerced: none is a ley line, "3" another path', () => {
    assert.deepEqual(md.leyLines.map((l) => l.kind), ['leyLine', 'other']);
  });
  test('the draft is normalized and keeps only hexes on the map', () => {
    assert.equal(
      JSON.stringify(md.draftLeyLine),
      JSON.stringify({ name: '5', type: '', color: '#ABCDEF', notes: '', hexes: ['0101'], kind: 'leyLine' }),
    );
  });
});

describe('Scenario 15: duplicate ids are made unique', () => {
  const data = baseV10();
  data.otherNotes = '<!--MAP_PINS-->[{"id":"p1","label":"A","hex":"0303"},{"id":"p1","label":"B","hex":"0404"}]';
  const a = migrateCharacter(data as never);
  test('two legacy pins with one id → two POIs, two ids', () => {
    assert.ok(a.mapData.pois.length === 2 && a.mapData.pois[0].id !== a.mapData.pois[1].id);
  });

  const withExisting = baseV10();
  withExisting.mapData = { pois: [{ id: 'p1', hex: '0505', name: 'Existing', notes: 'keep me' }], fairyDoors: [], leyLines: [] };
  withExisting.otherNotes = '<!--MAP_PINS-->[{"id":"p1","label":"Legacy","hex":"0303"}]';
  const b = migrateCharacter(withExisting as never);
  const existing = b.mapData.pois.find((p) => p.name === 'Existing');
  const legacy = b.mapData.pois.find((p) => p.name === 'Legacy');
  test('a pin whose id clashes with an existing POI gets a fresh id; the existing POI keeps its own', () => {
    assert.ok(existing?.id === 'p1' && legacy !== undefined && legacy.id !== 'p1');
  });

  const c = migrateCharacter(baseV13({
    pois: [{ id: 'x', hex: '0303', name: 'P', notes: '' }],
    fairyDoors: [{ id: 'x', hex: '0404', name: 'D', notes: '', destination: { kind: 'wild' } }],
    leyLines: [{ id: 'x', name: 'L', type: 'Ley line', color: '#c4a35a', hexes: ['0303', '0404'], notes: '' }],
  }) as never);
  const ids = [...c.mapData.pois, ...c.mapData.fairyDoors, ...c.mapData.leyLines].map((i) => i.id);
  test('ids are unique across POIs, doors and ley lines', () => assert.equal(new Set(ids).size, 3, JSON.stringify(ids)));
});

describe('Scenario 16: text after the pins JSON is kept, and a repaired export converts on re-import', () => {
  const data = baseV10();
  data.otherNotes = 'Session 1.<!--MAP_PINS-->[{"id":"a","label":"Inn","hex":"0507","isCurrentLocation":true}]\nSession 2: the Drune are in 0707.';
  const a = migrateCharacter(data as never);
  test('pins before trailing text are converted', () => assert.ok(a.mapData.pois.length === 1 && a.currentLocationHex === '0507'));
  test('the trailing text is kept', () => assert.equal(a.otherNotes, 'Session 1.\nSession 2: the Drune are in 0707.'));

  const two = baseV10();
  two.otherNotes = 'A<!--MAP_PINS-->[{"id":"x","label":"X","hex":"0303"}]<!--MAP_PINS-->[{"id":"y","label":"Y","hex":"0404"}]';
  const b = migrateCharacter(two as never);
  test('every marker in the notes is converted', () => {
    assert.ok(b.mapData.pois.map((p) => p.name).join() === 'X,Y' && b.otherNotes === 'A', JSON.stringify(b.otherNotes));
  });

  // A marker the migration couldn't parse is left for the player to fix.
  const broken = baseV10();
  broken.otherNotes = 'Notes.<!--MAP_PINS-->[{"id":"a","label":"Inn","hex":"0507"';
  const c = migrateCharacter(broken as never);
  test('an unparseable marker is left in the notes', () => {
    assert.ok(c.otherNotes === 'Notes.<!--MAP_PINS-->[{"id":"a","label":"Inn","hex":"0507"' && c.mapData.pois.length === 0);
  });
  // …they repair the exported (now v13) file and import it again:
  const repaired = clone(c);
  repaired.otherNotes = `${repaired.otherNotes}}]`;
  const d = migrateCharacter(repaired as never);
  test('a repaired v13 export converts its pins on re-import', () => {
    assert.ok(d.mapData.pois.length === 1 && d.otherNotes === 'Notes.', JSON.stringify(d.otherNotes));
  });
});

describe('Scenario 17: legacy pin fields are read strictly', () => {
  const data = baseV10();
  data.otherNotes = '<!--MAP_PINS-->[{"id":"a","label":"A","hex":"0303","isCurrentLocation":"false"},{"id":"b","label":"B","hex":"0404","isCurrentLocation":1}]';
  const a = migrateCharacter(data as never);
  test('only isCurrentLocation === true marks the current hex ("false", 1 don\'t)', () => assert.equal(a.currentLocationHex, ''));
  const labels = baseV10();
  labels.otherNotes = 'x<!--MAP_PINS-->[{"label":"odd <!--MAP_PINS-->[] label","hex":"","x":1,"y":98},{"label":"two\\nlines","hex":"","x":1,"y":98}]';
  const b = migrateCharacter(labels as never);
  test('a marker inside a label is defused and multi-line labels are indented', () => {
    assert.equal(b.otherNotes, `x\n\n${UNPLACED_HEADING}\n- odd <!--MAP PINS-->[] label\n- two\n  lines`);
  });
  test('…so a second load changes nothing', () => {
    assert.equal(JSON.stringify(migrateCharacter(clone(b) as never)), JSON.stringify(b));
  });
});

describe('Scenario 18: migrating twice gives the same result', () => {
  const noMap = baseV13(undefined);
  delete noMap.mapData;
  noMap.currentLocationHex = '1313';
  const once = migrateCharacter(clone(noMap) as never);
  test('a v13 save with no mapData still gets currentLocationHex repaired', () => assert.equal(once.currentLocationHex, ''));
  const corrupt = baseV13('corrupt');
  corrupt.currentLocationHex = 303;
  const c = migrateCharacter(clone(corrupt) as never);
  test('mapData "corrupt" + numeric currentLocationHex → empty map, ""', () => {
    assert.ok(c.currentLocationHex === '' && c.mapData.pois.length === 0);
  });
  const messy = baseV10();
  messy.otherNotes = 'Prose\n<!--MAP_PINS-->[{"id":"p","label":"P","hex":"junk","x":40,"y":40},{"label":"Gone","hex":"","x":1,"y":98},"text"]';
  messy.mapData = { pois: [{ id: 'p', hex: '1313', name: 'Old', notes: 7 }], fairyDoors: [{ id: 'd', hex: '0303', destination: { kind: 'roaded', pairedDoorId: 'z', roadName: 'R' } }], leyLines: [{ hexes: ['0303'] }] };
  const first = migrateCharacter(clone(messy) as never);
  const second = migrateCharacter(clone(first) as never);
  test('migrate(migrate(x)) equals migrate(x)', () => assert.equal(JSON.stringify(second), JSON.stringify(first)));
});

describe('Scenario 19: names inherited from Object.prototype are not hexes', () => {
  const bad = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'];
  const results = bad.map((k) => {
    const d = baseV13({ pois: [{ id: 'p', hex: k, name: 'P', notes: '' }], fairyDoors: [], leyLines: [] });
    d.currentLocationHex = k;
    const m = migrateCharacter(d as never);
    return m.currentLocationHex === '' && m.mapData.pois.length === 0;
  });
  test('currentLocationHex and POI hexes reject prototype names', () => assert.ok(results.every(Boolean), JSON.stringify(results)));
});

describe('Scenario 20: whitespace before the marker is trimmed in linear time', () => {
  test('40,000 spaces inside the prose take well under a second', () => {
    const data = baseV10();
    data.otherNotes = `a${' '.repeat(40000)}b<!--MAP_PINS-->[]`;
    // performance.now(), unlike Date.now(), never jumps when the system clock is corrected.
    const t = performance.now();
    const m = migrateCharacter(data as never);
    const ms = performance.now() - t;
    assert.ok(ms < 500 && m.otherNotes === `a${' '.repeat(40000)}b`, `${ms.toFixed(1)} ms`);
  });
});

describe('Scenario 21: printed hex 0111 is on the grid', () => {
  const data = baseV10();
  data.otherNotes = `<!--MAP_PINS-->${JSON.stringify([
    { id: 'a', label: 'Hut by the wood edge', hex: '', ...oldMapPosition('0111'), isCurrentLocation: true },
    { id: 'b', label: 'Typed 0111', hex: '0111', x: 1, y: 98, isCurrentLocation: false },
  ])}`;
  const m = migrateCharacter(data as never);
  test('pins on 0111 (typed or by position) become POIs there', () => {
    assert.ok(
      m.mapData.pois.length === 2 && m.mapData.pois.every((p) => p.hex === '0111') && m.currentLocationHex === '0111',
      JSON.stringify(m.mapData.pois),
    );
  });
});

describe('Scenario 22: fields the repair doesn\'t know about are kept', () => {
  const data = baseV13({
    pois: [
      { id: 'p', hex: '0303', name: { bad: 1 }, notes: 5, visited: true, icon: 'skull' },
      { id: 'q', hex: '0404', name: 'Tower', notes: '', kind: 'tower', ruinedBy: 'fire' },
    ],
    fairyDoors: [
      { id: 'a', hex: '0404', name: 'Oak', notes: '', discoveredOn: { day: 3, month: 1, year: 1 },
        destination: { kind: 'roaded', pairedDoorId: 'b', roadName: 'Silver', roadNotes: 'Moonlit' } },
      { id: 'b', hex: '0505', name: 'Stone', notes: '', destination: { kind: 'roaded', pairedDoorId: 'a', roadName: 'Silver' } },
      { id: 'w', hex: '0606', name: 'Well', notes: '', destination: { kind: 'wild', realm: 'Fairy' } },
    ],
    leyLines: [{
      id: 'l', name: 'L', type: 'Ley line', color: '#c4a35a', hexes: ['0303', '0404'], notes: '', strength: 3,
      spell: { name: 'Web', rank: 2, learnedAt: 'the Old Stones' },
    }],
    draftLeyLine: { name: 'D', type: '', color: '#c4a35a', notes: '', hexes: [], startedOn: 'today' },
    futureLayer: ['kept'],
  });
  const m = migrateCharacter(clone(data) as never);
  const [poi, tower] = m.mapData.pois as unknown as AnyData[];
  const doors = Object.fromEntries((m.mapData.fairyDoors as unknown as AnyData[]).map((d) => [d.id, d]));
  test('a POI keeps its extra fields, and the repaired ones still win', () => {
    assert.deepEqual(poi, { id: 'p', hex: '0303', name: '', notes: '5', visited: true, icon: 'skull' });
  });
  test('the known fields come first, in their usual order, a kind among them', () => {
    assert.deepEqual(Object.keys(poi), ['id', 'hex', 'name', 'notes', 'visited', 'icon']);
    assert.deepEqual(Object.keys(tower), ['id', 'hex', 'name', 'notes', 'kind', 'ruinedBy']);
  });
  test("a ley line's spell keeps its extra fields too", () => {
    assert.deepEqual(m.mapData.leyLines[0].spell, { name: 'Web', rank: 2, learnedAt: 'the Old Stones' });
  });
  test('a door and its roaded destination keep their extra fields', () => {
    assert.deepEqual(doors.a.discoveredOn, { day: 3, month: 1, year: 1 });
    assert.deepEqual(doors.a.destination, { kind: 'roaded', pairedDoorId: 'b', roadName: 'Silver', roadNotes: 'Moonlit' });
  });
  test('a wild destination keeps its extra fields', () => {
    assert.deepEqual(doors.w.destination, { kind: 'wild', realm: 'Fairy' });
  });
  test('a ley line, the draft and mapData itself keep theirs', () => {
    assert.equal((m.mapData.leyLines[0] as unknown as AnyData).strength, 3);
    assert.equal((m.mapData.draftLeyLine as unknown as AnyData).startedOn, 'today');
    assert.deepEqual((m.mapData as unknown as AnyData).futureLayer, ['kept']);
  });
  test('a second load changes nothing', () => {
    assert.equal(JSON.stringify(migrateCharacter(clone(m) as never)), JSON.stringify(m));
  });
});

describe('Scenario 23: text in map values of the wrong shape is kept in otherNotes', () => {
  const textMap = migrateCharacter(baseV13('Remember the ford at 0606') as never);
  test('a mapData that is text, not an object', () => {
    assert.equal(textMap.otherNotes, `${UNPLACED_HEADING}\n- Remember the ford at 0606`);
    assert.deepEqual(textMap.mapData, { pois: [], fairyDoors: [], leyLines: [] });
  });
  const old = baseV10();
  old.mapData = 'Remember the ford at 0606';
  test('…also in a save from before v13, which the v12 → v13 migration used to overwrite', () => {
    assert.equal(migrateCharacter(old as never).otherNotes, `${UNPLACED_HEADING}\n- Remember the ford at 0606`);
  });
  const lists = migrateCharacter(baseV13({
    pois: 'Shrine at 0303',
    fairyDoors: 42,
    leyLines: { route: '0303 to 0404' },
    draftLeyLine: 'half a line',
  }) as never);
  test('lists that are not arrays, and a draft that is not an object', () => {
    assert.equal(lists.otherNotes, [
      UNPLACED_HEADING,
      '- Shrine at 0303',
      '- 42',
      '- {"route":"0303 to 0404"}',
      '- half a line',
    ].join('\n'));
    assert.deepEqual(lists.mapData, { pois: [], fairyDoors: [], leyLines: [] });
  });
  const empty = migrateCharacter(baseV13({ pois: null, fairyDoors: '', leyLines: '  ', draftLeyLine: null }) as never);
  test('values with no text add nothing', () => assert.equal(empty.otherNotes, ''));
  test('…nor do empty arrays and objects, however deeply nested', () => {
    const noText: unknown[] = [
      [],
      [[], {}],
      { pois: {}, fairyDoors: [[]], leyLines: { a: [] }, draftLeyLine: [] },
      { pois: [[], [{ a: [null, ' '] }]], fairyDoors: [], leyLines: [{ name: 'L', type: 'Old road', hexes: {} }] },
      { pois: [], fairyDoors: [], leyLines: [{ name: 'M', type: 'Ley line', hexes: {} }] },
    ];
    const notes = noText.map((mapData) => migrateCharacter(baseV13(mapData) as never).otherNotes);
    // The road with no hexes is itself listed, but without "(hexes {})". A
    // ley line is kept with no hexes, and nothing is said about the {}.
    assert.deepEqual(notes, ['', '', '', `${UNPLACED_HEADING}\n- Old road L`, '']);
    const pinsOnly = baseV10();
    pinsOnly.otherNotes = 'Prose.\n<!--MAP_PINS-->[[],{},{"a":[[]]},"text"]';
    assert.equal(migrateCharacter(pinsOnly as never).otherNotes, `Prose.\n\n${UNPLACED_HEADING}\n- text`);
  });
  test('…while text inside them is still kept', () => {
    const m = migrateCharacter(baseV13({ pois: { a: [[], ['Ford at 0606']] }, fairyDoors: [], leyLines: [] }) as never);
    assert.equal(m.otherNotes, `${UNPLACED_HEADING}\n- {"a":[[],["Ford at 0606"]]}`);
  });
  const pins = baseV10();
  pins.mapData = 'Remember the ford at 0606';
  pins.otherNotes = 'Prose.\n<!--MAP_PINS-->[{"id":"a","label":"Inn","hex":"0507"}]';
  const converted = migrateCharacter(pins as never);
  test('old-map pins still convert when mapData holds text', () => {
    assert.deepEqual(converted.mapData.pois.map((p) => [p.name, p.hex]), [['Inn', '0507']]);
    assert.equal(converted.otherNotes, `Prose.\n\n${UNPLACED_HEADING}\n- Remember the ford at 0606`);
  });
  test('a second load changes nothing', () => {
    for (const m of [textMap, lists, converted]) assert.equal(JSON.stringify(migrateCharacter(clone(m) as never)), JSON.stringify(m));
  });
});

// fixtures/main-v12-save.json is a save written by main at 3ef3c04, the last
// version before this map (schema 12, with #14's Fairy time). Its pins were
// placed with the old map's Place Pin, Clearing set as the current location.
// Then, with main's Fairy time controls, the character spent a week in
// Fairy, wrote a journal entry there and came back 3 days later, and is now
// in Fairy again: the second visit is still open.
describe('Scenario 24: a v12 save from main, with Fairy time and old map pins', () => {
  const saved = clone(mainV12Save) as AnyData;
  test("the save is v12, with two Fairy visits and the old map's pins", () => {
    assert.equal(saved.schemaVersion, 12);
    assert.equal((saved.fairyVisits as unknown[]).length, 2);
    assert.ok((saved.otherNotes as string).startsWith('<!--MAP_PINS-->'));
    assert.equal(saved.mapData, undefined);
  });
  const migrated = migrateCharacter(clone(mainV12Save) as never);
  test('it loads as the current version', () => assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION));
  test("its pins become POIs on their hexes, and Clearing's hex is the current one", () => {
    assert.deepEqual(migrated.mapData.pois.map((p) => [p.name, p.hex]), [['Clearing', '1103'], ['North lobe tip', '1101'], ['Woodland islets', '0203']]);
    assert.equal(migrated.currentLocationHex, '1103');
  });
  test('pins off the grid are listed in Other Notes, and the marker is gone', () => {
    assert.equal(migrated.otherNotes, `${UNPLACED_HEADING}\n- Compass rose\n- Dolmenwood title`);
  });
  test("its Fairy time is unchanged: the visits (the open one too), the counter's start, the frozen date and the journal", () => {
    assert.deepEqual(migrated.fairyVisits, saved.fairyVisits);
    assert.deepEqual(migrated.livedTimeStart, saved.livedTimeStart);
    assert.deepEqual(migrated.currentDate, saved.currentDate);
    assert.deepEqual(migrated.journalEntries, saved.journalEntries);
  });
  test('nothing else changes, besides an empty list of NPCs (v15) and the ration fields (v16)', () => {
    // v16 turns the ration counters into items (none here: both were 0) and
    // replaces the counters with `dankConditions`.
    const {
      schemaVersion: _version, otherNotes: _notes, mapData: _map, currentLocationHex: _hex, npcs,
      rations: _rations, dankConditions, ...rest
    } = migrated as unknown as AnyData;
    const { schemaVersion: _savedVersion, otherNotes: _savedNotes, rations: _savedRations, ...savedRest } = saved;
    assert.deepEqual(rest, savedRest);
    assert.deepEqual(npcs, []);
    assert.equal(dankConditions, false);
    assert.deepEqual(migrated.stowedItems, [], 'its counters were both 0, so no rations were made into items');
  });
  test('a second load changes nothing', () => {
    assert.deepEqual(migrateCharacter(clone(migrated) as never), migrated);
  });

  // The same save with its Fairy time broken by hand, which only #14's
  // repair on load (sanitizeFairyTime) fixes. The expected values are what
  // main at 3ef3c04 makes of it.
  describe('with its Fairy time broken by hand, it is repaired as on main', () => {
    const broken = clone(mainV12Save) as AnyData;
    broken.fairyVisits = [
      { id: 'dup', enteredOn: { day: 3, month: 0, year: 1 }, returnedOn: null, daysInFairy: 2.7 },
      { id: 'dup', enteredOn: { day: 9, month: 1, year: 1 }, returnedOn: { day: 2, month: 1, year: 1 }, daysInFairy: -4 },
      'junk',
      { enteredOn: 'bad', returnedOn: null, daysInFairy: 'x' },
    ];
    broken.livedTimeStart = { day: 'one', month: 99 };
    const entries = broken.journalEntries as AnyData[];
    entries[0].fairyEvent = { visitId: 'dup', kind: 'teleported' };
    entries[1].fairyDate = { visitId: 5, day: 'x' };
    broken.spellStudy = {
      active: { spellName: 'Web', startedOn: { day: 2, month: 0, year: 1 }, startedInFairy: { visitId: 'dup', day: -3 }, startedLivedDay: 'tampered' },
      queue: [],
    };
    const repaired = migrateCharacter(clone(broken) as never);
    const [first, second] = repaired.fairyVisits;
    test('visits that are not objects, or have no entry date, are dropped', () => assert.equal(repaired.fairyVisits.length, 2));
    test('a duplicate visit id is replaced', () => {
      assert.equal(first.id, 'dup');
      assert.ok(typeof second.id === 'string' && second.id !== '' && second.id !== 'dup', second.id);
    });
    test('an earlier visit left open is closed on the day it began', () => {
      assert.deepEqual(first, { id: 'dup', enteredOn: { day: 3, month: 0, year: 1 }, returnedOn: { day: 3, month: 0, year: 1 }, daysInFairy: 2 });
    });
    test('a return before its entry moves to the entry day, and negative days in Fairy become 0', () => {
      assert.deepEqual(second, { id: second.id, enteredOn: { day: 9, month: 1, year: 1 }, returnedOn: { day: 9, month: 1, year: 1 }, daysInFairy: 0 });
    });
    test("the calendar moves up to the last return, and the counter's start is repaired", () => {
      assert.deepEqual(repaired.currentDate, { day: 9, month: 1, year: 1 });
      assert.deepEqual(repaired.livedTimeStart, { day: 1, month: 11, year: 1, sinceReturnFrom: second.id });
    });
    test("a broken journal Fairy date and event are dropped, and the other entries' references are kept", () => {
      assert.equal('fairyEvent' in repaired.journalEntries[0], false);
      assert.equal('fairyDate' in repaired.journalEntries[1], false);
      assert.deepEqual(repaired.journalEntries.slice(2), (saved.journalEntries as unknown[]).slice(2));
    });
    test("a tampered study anchor is worked out again, and the study's Fairy day repaired", () => {
      assert.deepEqual(repaired.spellStudy.active, {
        spellName: 'Web',
        startedOn: { day: 2, month: 0, year: 1 },
        startedInFairy: { visitId: 'dup', day: 1 },
        startedLivedDay: 1,
      });
    });
    test('the old pins still convert', () => {
      assert.deepEqual(repaired.mapData.pois.map((p) => [p.name, p.hex]), [['Clearing', '1103'], ['North lobe tip', '1101'], ['Woodland islets', '0203']]);
      assert.equal(repaired.currentLocationHex, '1103');
    });
    test('a second load changes nothing', () => {
      assert.deepEqual(migrateCharacter(clone(repaired) as never), repaired);
    });
  });
});

// ── v15: kinds of paths and POIs, ley lines recorded as found, their spells ──

/** A save from schema 14, the last version before paths had a kind. */
function baseV14(mapData: unknown): AnyData {
  const data = baseV13(mapData);
  data.schemaVersion = 14;
  return data;
}

const path = (id: string, type: unknown, hexes: unknown, extra: AnyData = {}): AnyData =>
  ({ id, name: id, type, color: '#c4a35a', hexes, notes: '', ...extra });

describe('Scenario 25: v14 → v15 gives every path a kind, from its type', () => {
  const m = migrateCharacter(baseV14({
    pois: [],
    fairyDoors: [],
    leyLines: [
      path('a', 'Ley line', ['0303', '0404']),
      path('b', '', ['0303', '0404']),
      path('c', 'Leyline (dormant)', ['0303', '0404']),
      path('d', 'Ancient Road', ['0303', '0404']),
      path('e', 'Valley road', ['0303', '0404']),
      path('f', 'Ward', ['0303', '0404'], { kind: 'leyLine' }), // a hand edit: a valid kind stays
      path('g', 7, ['0303', '0404']), // a type that isn't text is read as its text, "7"
    ],
    draftLeyLine: { name: 'D', type: 'Old road', color: '#c4a35a', notes: '', hexes: [] },
  }) as never);
  test('a type naming a ley line, or a blank one, makes a ley line; anything else another path', () => {
    assert.deepEqual(m.mapData.leyLines.map((l) => [l.id, l.kind]), [
      ['a', 'leyLine'], ['b', 'leyLine'], ['c', 'leyLine'], ['d', 'other'], ['e', 'other'], ['f', 'leyLine'], ['g', 'other'],
    ]);
  });
  test('the line being drawn gets one too', () => assert.equal(m.mapData.draftLeyLine?.kind, 'other'));
  test('types and everything else stay as they were', () => {
    assert.deepEqual(m.mapData.leyLines.map((l) => l.type), ['Ley line', '', 'Leyline (dormant)', 'Ancient Road', 'Valley road', 'Ward', '7']);
    assert.equal(m.otherNotes, '');
  });
  test('on a current save a kind is kept, whatever the type says', () => {
    const current = migrateCharacter(baseV13({ pois: [], fairyDoors: [], leyLines: [path('r', 'Old road', ['0303', '0404'], { kind: 'leyLine' })] }) as never);
    assert.equal(current.mapData.leyLines[0].kind, 'leyLine');
  });
  test('a kind that is not one is worked out again from the type', () => {
    const kinds = ['road', 'LeyLine', '', null, 3, { a: 1 }].map((kind) =>
      migrateCharacter(baseV13({ pois: [], fairyDoors: [], leyLines: [path('x', 'Old road', ['0303', '0404'], { kind })] }) as never).mapData.leyLines[0].kind,
    );
    assert.deepEqual(kinds, ['other', 'other', 'other', 'other', 'other', 'other']);
  });
  test('a second load changes nothing', () => assert.equal(JSON.stringify(migrateCharacter(clone(m) as never)), JSON.stringify(m)));
});

describe('Scenario 26: a ley line keeps the hexes it has, even one or none; other paths still need 2', () => {
  const m = migrateCharacter(baseV13({
    pois: [],
    fairyDoors: [],
    leyLines: [
      path('one', 'Ley line', ['0606']),
      path('none', 'Ley line', []),
      path('missing', 'Ley line', undefined),
      path('text', 'Ley line', 'ran past the Old Stones'),
      path('off', 'Ley line', ['9999', '0606', 'zz']),
      path('road', 'Old road', ['0606']),
    ],
  }) as never);
  test('ley lines with one hex, none, or hexes that are not a list are kept', () => {
    assert.deepEqual(m.mapData.leyLines.map((l) => [l.id, l.hexes]), [
      ['one', ['0606']], ['none', []], ['missing', []], ['text', []], ['off', ['0606']],
    ]);
  });
  test('what was left out of them, and the road with one hex, are listed in otherNotes', () => {
    assert.equal(m.otherNotes, [
      UNPLACED_HEADING,
      '- Ley line text: hexes ran past the Old Stones left out (not a list of hexes)',
      '- Ley line off: hexes 9999, zz left out (not on the map)',
      '- Old road road (hexes 0606)',
    ].join('\n'));
  });
  test('the map still has every kept line, each with a kind and a list of hexes', () => {
    assert.ok(m.mapData.leyLines.every((l) => l.kind === 'leyLine' && Array.isArray(l.hexes)));
  });
  test('a second load changes nothing', () => assert.equal(JSON.stringify(migrateCharacter(clone(m) as never)), JSON.stringify(m)));
});

describe("Scenario 27: a POI's kind is kept if it's one of the kinds, and never guessed", () => {
  const poi = (id: string, extra: AnyData = {}): AnyData => ({ id, hex: '0303', name: id, notes: '', ...extra });
  const m = migrateCharacter(baseV13({
    pois: [
      poi('tower', { kind: 'tower' }),
      poi('other', { kind: 'other' }),
      poi('none'),
      poi('castle', { kind: 'castle' }),
      poi('caps', { kind: 'Tower' }),
      poi('number', { kind: 3 }),
      poi('proto', { kind: '__proto__' }),
      poi('ctor', { kind: 'constructor' }),
      poi('null', { kind: null }),
    ],
    fairyDoors: [],
    leyLines: [],
  }) as never);
  test('the kinds are kept; anything else is removed, so the POI gets the plain marker', () => {
    assert.deepEqual(m.mapData.pois.map((p) => [p.id, 'kind' in p ? p.kind : '(none)']), [
      ['tower', 'tower'], ['other', 'other'], ['none', '(none)'], ['castle', '(none)'], ['caps', '(none)'],
      ['number', '(none)'], ['proto', '(none)'], ['ctor', '(none)'], ['null', '(none)'],
    ]);
  });
  test('POIs from before v15 get no kind, even names that suggest one', () => {
    const old = migrateCharacter(baseV14({ pois: [poi('Old Tower'), poi('Hoarblight Keep'), poi('Lankshorn')], fairyDoors: [], leyLines: [] }) as never);
    assert.ok(old.mapData.pois.every((p) => !('kind' in p)), JSON.stringify(old.mapData.pois));
  });
  test('a second load changes nothing', () => assert.equal(JSON.stringify(migrateCharacter(clone(m) as never)), JSON.stringify(m)));
});

describe("Scenario 28: a ley line's spell, once learned, is kept if it's well formed", () => {
  const spellOf = (spell: unknown) =>
    migrateCharacter(baseV13({ pois: [], fairyDoors: [], leyLines: [path('l', 'Ley line', ['0303'], { spell })] }) as never).mapData.leyLines[0].spell;
  test('a spell with a name is kept; its rank becomes a whole number of at least 1', () => {
    assert.deepEqual(spellOf({ name: 'Web', rank: 2 }), { name: 'Web', rank: 2 });
    assert.deepEqual(
      [2.7, 0, -3, 'x', null, undefined, 1e400].map((rank) => spellOf({ name: 'Web', rank })?.rank),
      [2, 1, 1, 1, 1, 1, 1],
    );
    assert.deepEqual(spellOf({ name: 7, rank: 1 }), { name: '7', rank: 1 });
  });
  test("a spell without a name, or that isn't an object, is removed: the line's spell isn't known", () => {
    for (const spell of [undefined, null, 'Web', 5, [], {}, { name: '' }, { name: '  ', rank: 2 }, { name: { a: 1 } }]) {
      assert.equal(spellOf(spell), undefined, JSON.stringify(spell));
    }
  });
});
