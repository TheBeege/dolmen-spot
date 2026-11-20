// Migration sanity test. Runs migrateCharacter across legacy and malformed
// save shapes and prints PASS/FAIL summaries. Run with:
//   npm run test:migration
// (tsx, because Node's built-in type stripping can't resolve src/lib's
// extensionless imports or its value-style imports of types.)
import { migrateCharacter, CURRENT_SCHEMA_VERSION } from '../src/lib/migrations.ts';
import { hexCenter } from '../src/lib/hex.ts';
import { ALL_HEXES, HEX_CELLS, HEX_GRID_META } from '../src/lib/hex-grid.ts';

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

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(name: string): void {
  console.log(`\n${name}`);
}

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

console.log(`Target schema: ${CURRENT_SCHEMA_VERSION}`);

// ----- Scenario 1: clean v10 save, no map data -----
section('Scenario 1: clean v10 save (no marker, no mapData)');
{
  const data = baseV10();
  const migrated = migrateCharacter(data as never);
  check('reaches current schema', migrated.schemaVersion === CURRENT_SCHEMA_VERSION);
  check('mapData created', Array.isArray(migrated.mapData?.pois));
  check('mapData.pois empty', migrated.mapData.pois.length === 0);
  check('mapData.fairyDoors empty', migrated.mapData.fairyDoors.length === 0);
  check('mapData.leyLines empty', migrated.mapData.leyLines.length === 0);
  check('currentLocationHex empty', migrated.currentLocationHex === '');
  check('CalendarDate gets year', migrated.currentDate.year === 1);
}

// ----- Scenario 2: legacy MAP_PINS marker with valid pins -----
section('Scenario 2: legacy MAP_PINS marker with valid pins');
{
  const data = baseV10();
  data.otherNotes = 'My notes here.\n<!--MAP_PINS-->[{"id":"a","label":"Sniggle","hex":"0303","isCurrentLocation":false},{"id":"b","label":"Inn","hex":"0507","isCurrentLocation":true}]';
  const migrated = migrateCharacter(data as never);
  check('marker stripped from otherNotes', !migrated.otherNotes.includes('MAP_PINS'));
  check('prose preserved', migrated.otherNotes === 'My notes here.');
  check('two POIs imported', migrated.mapData.pois.length === 2);
  check('first POI label', migrated.mapData.pois[0].name === 'Sniggle');
  check('first POI hex', migrated.mapData.pois[0].hex === '0303');
  check('isCurrent → currentLocationHex', migrated.currentLocationHex === '0507');
}

// ----- Scenario 3: unpadded legacy hex like "303" → "0303" -----
section('Scenario 3: unpadded legacy hex codes');
{
  const data = baseV10();
  // "303" → "0303" (live), "7" → "0007" (NOT in manifest, and the pin has
  // no position to fall back on), "0507" (live).
  data.otherNotes = '<!--MAP_PINS-->[{"label":"X","hex":"303"},{"label":"Y","hex":"7"},{"label":"Z","hex":"0507"}]';
  const migrated = migrateCharacter(data as never);
  check('two live POIs placed', migrated.mapData.pois.length === 2);
  const hexes = migrated.mapData.pois.map((p) => p.hex);
  check('hex 303 padded to 0303', hexes.includes('0303'));
  check('hex 0507 unchanged', hexes.includes('0507'));
  check('hex 7 → 0007 (off-grid, no position) is not a POI', !hexes.includes('0007'));
  check('…but its label and typed hex stay in otherNotes',
    migrated.otherNotes === `${UNPLACED_HEADING}\n- Y (Hex 7)`, JSON.stringify(migrated.otherNotes));
}

// ----- Scenario 4: no marker at all -----
section('Scenario 4: no marker at all');
{
  const data = baseV10();
  data.otherNotes = 'Just regular prose.';
  const migrated = migrateCharacter(data as never);
  check('otherNotes preserved', migrated.otherNotes === 'Just regular prose.');
  check('no POIs imported', migrated.mapData.pois.length === 0);
}

// ----- Scenario 5: marker with malformed JSON -----
section('Scenario 5: marker followed by malformed JSON');
{
  const data = baseV10();
  data.otherNotes = 'Notes.\n<!--MAP_PINS-->[{"hex":"0303"';  // truncated
  const migrated = migrateCharacter(data as never);
  check('marker preserved for recovery', migrated.otherNotes.includes('MAP_PINS'));
  check('no POIs imported', migrated.mapData.pois.length === 0);
}

// ----- Scenario 6: marker followed by non-array JSON -----
section('Scenario 6: marker followed by non-array JSON');
{
  const data = baseV10();
  data.otherNotes = 'Notes.\n<!--MAP_PINS-->{"oops":1}';
  const migrated = migrateCharacter(data as never);
  check('notes left untouched (nothing to convert)', migrated.otherNotes === 'Notes.\n<!--MAP_PINS-->{"oops":1}');
  check('no POIs imported', migrated.mapData.pois.length === 0);
}

// ----- Scenario 7: empty pin array -----
section('Scenario 7: empty pin array');
{
  const data = baseV10();
  data.otherNotes = 'Prose\n\n<!--MAP_PINS-->[]';
  const migrated = migrateCharacter(data as never);
  check('marker stripped', !migrated.otherNotes.includes('MAP_PINS'));
  check('trailing whitespace trimmed', migrated.otherNotes === 'Prose');
  check('no POIs imported', migrated.mapData.pois.length === 0);
}

// ----- Scenario 8: pre-existing mapData with garbage entries -----
section('Scenario 8: pre-existing mapData with garbage entries');
{
  const data = baseV10();
  data.mapData = {
    pois: [
      { id: '1', hex: '0303', name: 'good', notes: '' },     // keep
      { id: '2', hex: 'bad!', name: 'bad', notes: 'x' },    // off the map
      'not an object',                                       // not an item
      { id: '4', hex: '0404', name: 'good2', notes: '' },   // keep
    ],
    fairyDoors: [
      { id: 'd1', hex: '0505', name: 'D', notes: '', destination: { kind: 'wild' } },
      { hex: 'bad', name: 'x' }, // off the map
    ],
    leyLines: [
      { id: 'l1', name: 'L', type: 'Ley line', color: '#fff', hexes: ['0101', '0102'], notes: '' },
      { id: 'l2', name: 'short', hexes: ['0101'], notes: '' }, // < 2 hexes
      { id: 'l3', name: 'noarray', hexes: 'oops', notes: '' }, // hexes not an array
    ],
  };
  const migrated = migrateCharacter(data as never);
  check('pois filtered to 2 good', migrated.mapData.pois.length === 2);
  check('first POI is good', migrated.mapData.pois[0].name === 'good');
  check('second POI is good2', migrated.mapData.pois[1].name === 'good2');
  check('fairyDoors filtered to 1', migrated.mapData.fairyDoors.length === 1);
  check('leyLines filtered to 1', migrated.mapData.leyLines.length === 1);
  check('everything removed is listed in otherNotes', migrated.otherNotes === [
    UNPLACED_HEADING,
    '- bad (Hex bad!): x',
    '- not an object',
    '- Fairy door x (Hex bad)',
    '- Ley line short (hexes 0101)',
    '- Ley line noarray',
  ].join('\n'), JSON.stringify(migrated.otherNotes));
  check('a 3-digit colour is replaced by a 6-digit default', migrated.mapData.leyLines[0].color === '#c4a35a');
}

// ----- Scenario 9: malformed mapData wholesale -----
section('Scenario 9: malformed mapData wholesale (string)');
{
  const data = baseV10();
  (data as AnyData).mapData = 'junk';
  const migrated = migrateCharacter(data as never);
  check('mapData replaced with empty', Array.isArray(migrated.mapData.pois) && migrated.mapData.pois.length === 0);
}

// ----- Scenario 10: re-migrating an already-current save is a no-op for map -----
section('Scenario 10: idempotency — re-running on a v12 save');
{
  const data = baseV10();
  data.otherNotes = '<!--MAP_PINS-->[{"label":"A","hex":"0303"}]';
  const first = migrateCharacter(data as never);
  // Mutate a copy of the (now-current) data and re-migrate.
  const reSubmit = JSON.parse(JSON.stringify(first));
  const second = migrateCharacter(reSubmit as never);
  check('schemaVersion stable', second.schemaVersion === CURRENT_SCHEMA_VERSION);
  check('pois unchanged', second.mapData.pois.length === 1 && second.mapData.pois[0].name === 'A');
  check('currentLocationHex unchanged', second.currentLocationHex === first.currentLocationHex);
}

// ----- Scenario 11b: hand-edited v12 save with borked mapData subkey -----
section('Scenario 11b: v12 save with borked mapData.pois (string)');
{
  const data = baseV10();
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  // The migration loop should be skipped entirely; only the post-loop
  // sanitizers + reconcileWithDefaults run.
  (data as AnyData).mapData = { pois: 'oh no', fairyDoors: [], leyLines: [] };
  data.currentDate = { day: 1, month: 0, year: 1 };
  const migrated = migrateCharacter(data as never);
  check('pois repaired to array', Array.isArray(migrated.mapData.pois));
  check('pois empty after repair', migrated.mapData.pois.length === 0);
  check('schemaVersion stable', migrated.schemaVersion === CURRENT_SCHEMA_VERSION);
}

// ----- Scenario 11e: orphan hex references (dropped hexes) get cleared -----
section('Scenario 11e: hex refs pointing at non-manifest hexes get cleared');
{
  const data = baseV10();
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  data.currentDate = { day: 1, month: 0, year: 1 };
  // 1313 was in the old 250-hex bounding rectangle but is now an excluded
  // corner (under the "Dolmenwood" title). 0303 is a live hex.
  data.currentLocationHex = '1313';
  (data as AnyData).mapData = {
    pois: [
      { id: 'live', hex: '0303', name: 'Live POI', notes: '' },
      { id: 'orphan', hex: '1313', name: 'Orphan POI', notes: '' },
    ],
    fairyDoors: [
      { id: 'd1', hex: '0404', name: 'Live door', notes: '', destination: { kind: 'wild' } },
      { id: 'd2', hex: '1313', name: 'Orphan door', notes: '', destination: { kind: 'wild' } },
    ],
    leyLines: [
      // Ley line that survives after pruning orphans (2 live hexes left).
      { id: 'll1', name: 'Mixed', type: 'Ley line', color: '#fff',
        hexes: ['0303', '1313', '0404'], notes: '' },
      // Ley line that disappears (no live hex left after pruning).
      { id: 'll2', name: 'AllOrphan', type: 'Ley line', color: '#fff',
        hexes: ['1313', '1414'], notes: 'hums' },
    ],
  };
  const migrated = migrateCharacter(data as never);
  check('orphan POI dropped', migrated.mapData.pois.length === 1 && migrated.mapData.pois[0].name === 'Live POI');
  check('orphan door dropped', migrated.mapData.fairyDoors.length === 1 && migrated.mapData.fairyDoors[0].name === 'Live door');
  check('orphan-only ley line dropped',
    migrated.mapData.leyLines.length === 1 && migrated.mapData.leyLines[0].name === 'Mixed');
  check('mixed ley line pruned to live hexes',
    migrated.mapData.leyLines[0].hexes.length === 2 &&
    migrated.mapData.leyLines[0].hexes[0] === '0303' &&
    migrated.mapData.leyLines[0].hexes[1] === '0404');
  check('orphan currentLocationHex cleared', migrated.currentLocationHex === '');
  check('removed items and hexes are listed in otherNotes', migrated.otherNotes === [
    UNPLACED_HEADING,
    '- Orphan POI (Hex 1313)',
    '- Fairy door Orphan door (Hex 1313)',
    '- Ley line Mixed: hexes 1313 left out (not on the map)',
    '- Ley line AllOrphan (hexes 1313 → 1414): hums',
  ].join('\n'), JSON.stringify(migrated.otherNotes));
}

// ----- Scenario 11g: non-string currentLocationHex coerced to '' -----
section("Scenario 11g: non-string currentLocationHex (null/number) coerced to ''");
{
  const data = baseV10();
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  data.currentDate = { day: 1, month: 0, year: 1 };
  (data as AnyData).currentLocationHex = null;
  (data as AnyData).mapData = { pois: [], fairyDoors: [], leyLines: [] };
  const migrated = migrateCharacter(data as never);
  check('null currentLocationHex coerced to empty string', migrated.currentLocationHex === '');
}

// ----- Scenario 11f: live currentLocationHex preserved -----
section('Scenario 11f: a live currentLocationHex survives migration');
{
  const data = baseV10();
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  data.currentDate = { day: 1, month: 0, year: 1 };
  data.currentLocationHex = '0303';
  (data as AnyData).mapData = { pois: [], fairyDoors: [], leyLines: [] };
  const migrated = migrateCharacter(data as never);
  check('currentLocationHex preserved', migrated.currentLocationHex === '0303');
}

// ----- Scenario 11d: self-paired door is downgraded to wild -----
section('Scenario 11d: self-paired door (pairedDoorId === own id) → wild');
{
  const data = baseV10();
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  data.currentDate = { day: 1, month: 0, year: 1 };
  (data as AnyData).mapData = {
    pois: [],
    fairyDoors: [
      { id: 'S', hex: '0303', name: 'Self', notes: '', destination: { kind: 'roaded', pairedDoorId: 'S', roadName: 'Loop' } },
    ],
    leyLines: [],
  };
  const migrated = migrateCharacter(data as never);
  check('self-paired downgraded to wild', migrated.mapData.fairyDoors[0].destination.kind === 'wild');
  check('its road name is kept in its notes',
    migrated.mapData.fairyDoors[0].notes === 'Was on the fairy road "Loop" (its other end couldn\'t be found).',
    JSON.stringify(migrated.mapData.fairyDoors[0].notes));
}

// ----- Scenario 11c: asymmetric door pair in hand-edited v12 save -----
section('Scenario 11c: asymmetric door pair gets repaired to wild');
{
  const data = baseV10();
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  data.currentDate = { day: 1, month: 0, year: 1 };
  (data as AnyData).mapData = {
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
  check('A repaired to wild', byId.A.destination.kind === 'wild');
  check('B stays wild', byId.B.destination.kind === 'wild');
  check('C stays roaded', byId.C.destination.kind === 'roaded');
  check('D stays roaded', byId.D.destination.kind === 'roaded');
  check('E (orphan) repaired to wild', byId.E.destination.kind === 'wild');
  check('repaired doors keep their road names in their notes',
    byId.A.notes.includes('"Solo Road"') && byId.E.notes.includes('"Ghost Road"') && byId.C.notes === '');
}

// ----- Scenario 11: pins with no usable hex and no position -----
section("Scenario 11: pins that can't be placed are kept in otherNotes");
{
  const data = baseV10();
  data.otherNotes = 'Prose.\n<!--MAP_PINS-->[{},{"label":"no-hex"},{"hex":"abcd"},{"hex":"0303","label":"good"},null,"str",true,[1,"a"]]';
  const migrated = migrateCharacter(data as never);
  check('only the good pin becomes a POI', migrated.mapData.pois.length === 1);
  check('good pin label', migrated.mapData.pois[0].name === 'good');
  check('marker stripped, unplaced pins (and text-only entries) listed after the prose; empty ones ignored',
    migrated.otherNotes === `Prose.\n\n${UNPLACED_HEADING}\n- no-hex\n- Marker (Hex abcd)\n- str\n- true\n- [1,"a"]`, JSON.stringify(migrated.otherNotes));
}

// ----- Scenario 12: pins placed by their position on the old map -----
section('Scenario 12: pins without a usable hex are placed by their old-map position');
{
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
  check('no hex, valid position → POI on the hex under the pin', hexOf['no-hex'] === '0909', String(hexOf['no-hex']));
  check('junk hex string → placed by position', hexOf['junk'] === '0606', String(hexOf['junk']));
  check('off-grid typed hex → placed by position', hexOf['off-grid-hex'] === '1210', String(hexOf['off-grid-hex']));
  check('typed on-grid hex wins over position', hexOf['typed'] === '0507', String(hexOf['typed']));
  check('numeric hex padded, not crashing', hexOf['numeric'] === '0303', String(hexOf['numeric']));
  check('converted current-location pin sets currentLocationHex', migrated.currentLocationHex === '1004', migrated.currentLocationHex);
  check('POIs keep the pin labels', migrated.mapData.pois.find((p) => p.id === 'no-hex')?.name === 'Hidden Shrine');
  const notesOf = Object.fromEntries(migrated.mapData.pois.map((p) => [p.id, p.notes]));
  check('text typed into "Hex #" is kept in the notes of a pin placed by position',
    notesOf['junk'] === 'Old map hex: by the river' && notesOf['off-grid-hex'] === 'Old map hex: 1313', JSON.stringify(notesOf));
  check('…and pins placed by their typed hex get no such note', notesOf['typed'] === '' && notesOf['no-hex'] === '' && notesOf['numeric'] === '');
  check('off-grid / invalid positions are not POIs', !('margin' in hexOf) && !('bad-pos' in hexOf));
  check('…their labels stay in otherNotes, marker stripped',
    migrated.otherNotes === `Notes.\n\n${UNPLACED_HEADING}\n- Compass Rose\n- Lost (Hex nowhere)`, JSON.stringify(migrated.otherNotes));
}

// ----- Scenario 13: every hex round-trips through the old-map position -----
section('Scenario 13: each hex centre, as an old-map position, migrates back to that hex');
{
  const data = baseV10();
  data.otherNotes = `<!--MAP_PINS-->${JSON.stringify(ALL_HEXES.map((h) => ({ id: h, label: h, hex: '', ...oldMapPosition(h) })))}`;
  const migrated = migrateCharacter(data as never);
  const wrong = migrated.mapData.pois.filter((p) => p.id !== p.hex).map((p) => `${p.id}→${p.hex}`);
  check(`all ${ALL_HEXES.length} hexes round-trip`,
    migrated.mapData.pois.length === ALL_HEXES.length && wrong.length === 0, wrong.join(', '));
}

function baseV12(mapData: unknown): AnyData {
  const data = baseV10();
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  data.currentDate = { day: 1, month: 0, year: 1 };
  data.currentLocationHex = '';
  data.mapData = mapData;
  return data;
}
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// ----- Scenario 14: malformed map elements are normalized -----
section('Scenario 14: malformed map elements are normalized to the shape the map draws');
{
  const migrated = migrateCharacter(baseV12({
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
  check('every POI has string id / name / notes', md.pois.every((p) => isStr(p.id) && p.id !== '' && isStr(p.name) && isStr(p.notes)),
    JSON.stringify(md.pois));
  check('non-string notes / names are coerced (number → text, object → empty)', md.pois[0].notes === '5' && md.pois[1].name === '');
  const door = Object.fromEntries(md.fairyDoors.map((d) => [d.id, d]));
  check('missing / null / string / unknown destinations become wild',
    ['d0', 'd1', 'd2', 'd3'].every((id) => door[id].destination.kind === 'wild'));
  check('a mutual roaded pair stays roaded, with string road names',
    door.d4.destination.kind === 'roaded' && door.d4.destination.roadName === '' &&
    door.d5.destination.kind === 'roaded' && door.d5.destination.roadName === '', JSON.stringify([door.d4, door.d5]));
  check('non-string door names / notes are coerced', door.d5.name === '7' && door.d4.notes === '' && door.d5.notes === '');
  check('a roaded door without a partner id goes wild and keeps its road name',
    door.d6.destination.kind === 'wild' && door.d6.notes.includes('"Lost Lane"'));
  check('every ley line gets a string id / name / type / notes and a #rrggbb colour',
    md.leyLines.length === 2 && md.leyLines.every((l) => isStr(l.id) && l.id !== '' && isStr(l.name) && isStr(l.type) && isStr(l.notes) && /^#[0-9a-f]{6}$/i.test(l.color)),
    JSON.stringify(md.leyLines));
  check('ley line fields are coerced', md.leyLines[1].id === '7' && md.leyLines[1].type === '3' && md.leyLines[1].name === '');
  check('the draft is normalized and keeps only hexes on the map',
    JSON.stringify(md.draftLeyLine) === JSON.stringify({ name: '5', type: '', color: '#ABCDEF', notes: '', hexes: ['0101'] }),
    JSON.stringify(md.draftLeyLine));
}

// ----- Scenario 15: duplicate ids are made unique -----
section('Scenario 15: duplicate ids are made unique');
{
  const data = baseV10();
  data.otherNotes = '<!--MAP_PINS-->[{"id":"p1","label":"A","hex":"0303"},{"id":"p1","label":"B","hex":"0404"}]';
  const a = migrateCharacter(data as never);
  check('two legacy pins with one id → two POIs, two ids', a.mapData.pois.length === 2 && a.mapData.pois[0].id !== a.mapData.pois[1].id);

  const withExisting = baseV10();
  withExisting.mapData = { pois: [{ id: 'p1', hex: '0505', name: 'Existing', notes: 'keep me' }], fairyDoors: [], leyLines: [] };
  withExisting.otherNotes = '<!--MAP_PINS-->[{"id":"p1","label":"Legacy","hex":"0303"}]';
  const b = migrateCharacter(withExisting as never);
  const existing = b.mapData.pois.find((p) => p.name === 'Existing');
  const legacy = b.mapData.pois.find((p) => p.name === 'Legacy');
  check('a pin whose id clashes with an existing POI gets a fresh id; the existing POI keeps its own',
    existing?.id === 'p1' && legacy !== undefined && legacy.id !== 'p1');

  const c = migrateCharacter(baseV12({
    pois: [{ id: 'x', hex: '0303', name: 'P', notes: '' }],
    fairyDoors: [{ id: 'x', hex: '0404', name: 'D', notes: '', destination: { kind: 'wild' } }],
    leyLines: [{ id: 'x', name: 'L', type: 'Ley line', color: '#c4a35a', hexes: ['0303', '0404'], notes: '' }],
  }) as never);
  const ids = [...c.mapData.pois, ...c.mapData.fairyDoors, ...c.mapData.leyLines].map((i) => i.id);
  check('ids are unique across POIs, doors and ley lines', new Set(ids).size === 3, JSON.stringify(ids));
}

// ----- Scenario 16: text after the pins JSON, several markers, a repaired export -----
section('Scenario 16: text after the pins JSON is kept, and a repaired export converts on re-import');
{
  const data = baseV10();
  data.otherNotes = 'Session 1.<!--MAP_PINS-->[{"id":"a","label":"Inn","hex":"0507","isCurrentLocation":true}]\nSession 2: the Drune are in 0707.';
  const a = migrateCharacter(data as never);
  check('pins before trailing text are converted', a.mapData.pois.length === 1 && a.currentLocationHex === '0507');
  check('the trailing text is kept', a.otherNotes === 'Session 1.\nSession 2: the Drune are in 0707.', JSON.stringify(a.otherNotes));

  const two = baseV10();
  two.otherNotes = 'A<!--MAP_PINS-->[{"id":"x","label":"X","hex":"0303"}]<!--MAP_PINS-->[{"id":"y","label":"Y","hex":"0404"}]';
  const b = migrateCharacter(two as never);
  check('every marker in the notes is converted', b.mapData.pois.map((p) => p.name).join() === 'X,Y' && b.otherNotes === 'A', JSON.stringify(b.otherNotes));

  // A marker the migration couldn't parse is left for the player to fix.
  const broken = baseV10();
  broken.otherNotes = 'Notes.<!--MAP_PINS-->[{"id":"a","label":"Inn","hex":"0507"';
  const c = migrateCharacter(broken as never);
  check('an unparseable marker is left in the notes', c.otherNotes === 'Notes.<!--MAP_PINS-->[{"id":"a","label":"Inn","hex":"0507"' && c.mapData.pois.length === 0);
  // ...they repair the exported (now v12) file and import it again:
  const repaired = clone(c);
  repaired.otherNotes = `${repaired.otherNotes}}]`;
  const d = migrateCharacter(repaired as never);
  check('a repaired v12 export converts its pins on re-import', d.mapData.pois.length === 1 && d.otherNotes === 'Notes.', JSON.stringify(d.otherNotes));
}

// ----- Scenario 17: pin fields read strictly -----
section('Scenario 17: legacy pin fields are read strictly');
{
  const data = baseV10();
  data.otherNotes = '<!--MAP_PINS-->[{"id":"a","label":"A","hex":"0303","isCurrentLocation":"false"},{"id":"b","label":"B","hex":"0404","isCurrentLocation":1}]';
  const a = migrateCharacter(data as never);
  check('only isCurrentLocation === true marks the current hex ("false", 1 don\'t)', a.currentLocationHex === '', JSON.stringify(a.currentLocationHex));
  const labels = baseV10();
  labels.otherNotes = 'x<!--MAP_PINS-->[{"label":"odd <!--MAP_PINS-->[] label","hex":"","x":1,"y":98},{"label":"two\\nlines","hex":"","x":1,"y":98}]';
  const b = migrateCharacter(labels as never);
  check('a marker inside a label is defused and multi-line labels are indented',
    b.otherNotes === `x\n\n${UNPLACED_HEADING}\n- odd <!--MAP PINS-->[] label\n- two\n  lines`, JSON.stringify(b.otherNotes));
  check('…so a second load changes nothing', JSON.stringify(migrateCharacter(clone(b) as never)) === JSON.stringify(b));
}

// ----- Scenario 18: idempotency on messy saves -----
section('Scenario 18: migrating twice gives the same result');
{
  const noMap = baseV12(undefined);
  delete (noMap as AnyData).mapData;
  noMap.currentLocationHex = '1313';
  const once = migrateCharacter(clone(noMap) as never);
  check('a v12 save with no mapData still gets currentLocationHex repaired', once.currentLocationHex === '', JSON.stringify(once.currentLocationHex));
  const corrupt = baseV12('corrupt');
  corrupt.currentLocationHex = 303;
  const c = migrateCharacter(clone(corrupt) as never);
  check('mapData "corrupt" + numeric currentLocationHex → empty map, ""', c.currentLocationHex === '' && c.mapData.pois.length === 0);
  const messy = baseV10();
  messy.otherNotes = 'Prose\n<!--MAP_PINS-->[{"id":"p","label":"P","hex":"junk","x":40,"y":40},{"label":"Gone","hex":"","x":1,"y":98},"text"]';
  messy.mapData = { pois: [{ id: 'p', hex: '1313', name: 'Old', notes: 7 }], fairyDoors: [{ id: 'd', hex: '0303', destination: { kind: 'roaded', pairedDoorId: 'z', roadName: 'R' } }], leyLines: [{ hexes: ['0303'] }] };
  const first = migrateCharacter(clone(messy) as never);
  const second = migrateCharacter(clone(first) as never);
  check('migrate(migrate(x)) equals migrate(x)', JSON.stringify(second) === JSON.stringify(first));
}

// ----- Scenario 19: prototype keys are not hexes -----
section('Scenario 19: names inherited from Object.prototype are not hexes');
{
  const bad = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'];
  const results = bad.map((k) => {
    const d = baseV12({ pois: [{ id: 'p', hex: k, name: 'P', notes: '' }], fairyDoors: [], leyLines: [] });
    d.currentLocationHex = k;
    const m = migrateCharacter(d as never);
    return m.currentLocationHex === '' && m.mapData.pois.length === 0;
  });
  check('currentLocationHex and POI hexes reject prototype names', results.every(Boolean), JSON.stringify(results));
}

// ----- Scenario 20: long whitespace before the marker is fast -----
section('Scenario 20: whitespace before the marker is trimmed in linear time');
{
  const data = baseV10();
  data.otherNotes = `a${' '.repeat(40000)}b<!--MAP_PINS-->[]`;
  const t = Date.now();
  const m = migrateCharacter(data as never);
  const ms = Date.now() - t;
  check('40,000 spaces inside the prose take well under a second', ms < 500 && m.otherNotes === `a${' '.repeat(40000)}b`, `${ms} ms`);
}

// ----- Scenario 21: hex 0111 is on the map -----
section('Scenario 21: printed hex 0111 is on the grid');
{
  const data = baseV10();
  data.otherNotes = `<!--MAP_PINS-->${JSON.stringify([
    { id: 'a', label: 'Hut by the wood edge', hex: '', ...oldMapPosition('0111'), isCurrentLocation: true },
    { id: 'b', label: 'Typed 0111', hex: '0111', x: 1, y: 98, isCurrentLocation: false },
  ])}`;
  const m = migrateCharacter(data as never);
  check('pins on 0111 (typed or by position) become POIs there',
    m.mapData.pois.length === 2 && m.mapData.pois.every((p) => p.hex === '0111') && m.currentLocationHex === '0111',
    JSON.stringify(m.mapData.pois));
}

console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
