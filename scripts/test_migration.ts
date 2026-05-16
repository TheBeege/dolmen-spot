// Migration sanity test. Runs migrateCharacter across a handful of legacy
// save shapes and prints PASS/FAIL summaries. Run with:
//   npx tsx scripts/test_migration.ts
// (Plain `node --experimental-strip-types` doesn't resolve the .ts-less
// relative imports inside the migration module.)
import { migrateCharacter, CURRENT_SCHEMA_VERSION } from '../src/lib/migrations.ts';

type AnyData = Record<string, unknown>;

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
  check('mapData.fayeDoors empty', migrated.mapData.fayeDoors.length === 0);
  check('mapData.laylines empty', migrated.mapData.laylines.length === 0);
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
  // "303" → "0303" (live), "7" → "0007" (NOT in manifest, gets dropped by
  // the orphan filter), "0507" (live).
  data.otherNotes = '<!--MAP_PINS-->[{"label":"X","hex":"303"},{"label":"Y","hex":"7"},{"label":"Z","hex":"0507"}]';
  const migrated = migrateCharacter(data as never);
  check('two live POIs survive (orphan dropped)', migrated.mapData.pois.length === 2);
  const hexes = migrated.mapData.pois.map((p) => p.hex);
  check('hex 303 padded to 0303', hexes.includes('0303'));
  check('hex 0507 unchanged', hexes.includes('0507'));
  check('hex 7 → 0007 was dropped (off-grid)', !hexes.includes('0007'));
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
  check('marker stripped (parse succeeded)', !migrated.otherNotes.includes('MAP_PINS'));
  check('trailing newline trimmed', migrated.otherNotes === 'Notes.');
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
      { id: '2', hex: 'bad!', name: 'bad', notes: '' },     // drop (hex regex)
      'not an object',                                       // drop (non-object)
      { id: '4', hex: '0404', name: 'good2', notes: '' },   // keep
    ],
    fayeDoors: [
      { id: 'd1', hex: '0505', name: 'D', notes: '', destination: { kind: 'wild' } },
      { hex: 'bad', name: 'x' }, // drop (bad hex)
    ],
    laylines: [
      { id: 'l1', name: 'L', type: 'Layline', color: '#fff', hexes: ['0101', '0102'], notes: '' },
      { id: 'l2', name: 'short', hexes: ['0101'], notes: '' }, // drop (< 2 hexes)
      { id: 'l3', name: 'noarray', hexes: 'oops', notes: '' }, // drop (hexes not array)
    ],
  };
  const migrated = migrateCharacter(data as never);
  check('pois filtered to 2 good', migrated.mapData.pois.length === 2);
  check('first POI is good', migrated.mapData.pois[0].name === 'good');
  check('second POI is good2', migrated.mapData.pois[1].name === 'good2');
  check('fayeDoors filtered to 1', migrated.mapData.fayeDoors.length === 1);
  check('laylines filtered to 1', migrated.mapData.laylines.length === 1);
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
  (data as AnyData).mapData = { pois: 'oh no', fayeDoors: [], laylines: [] };
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
    fayeDoors: [
      { id: 'd1', hex: '0404', name: 'Live door', notes: '', destination: { kind: 'wild' } },
      { id: 'd2', hex: '1313', name: 'Orphan door', notes: '', destination: { kind: 'wild' } },
    ],
    laylines: [
      // Layline that survives after pruning orphans (2 live hexes left).
      { id: 'll1', name: 'Mixed', type: 'Layline', color: '#fff',
        hexes: ['0303', '1313', '0404'], notes: '' },
      // Layline that disappears (only 1 live hex left after pruning).
      { id: 'll2', name: 'AllOrphan', type: 'Layline', color: '#fff',
        hexes: ['1313', '1414'], notes: '' },
    ],
  };
  const migrated = migrateCharacter(data as never);
  check('orphan POI dropped', migrated.mapData.pois.length === 1 && migrated.mapData.pois[0].name === 'Live POI');
  check('orphan door dropped', migrated.mapData.fayeDoors.length === 1 && migrated.mapData.fayeDoors[0].name === 'Live door');
  check('orphan-only layline dropped',
    migrated.mapData.laylines.length === 1 && migrated.mapData.laylines[0].name === 'Mixed');
  check('mixed layline pruned to live hexes',
    migrated.mapData.laylines[0].hexes.length === 2 &&
    migrated.mapData.laylines[0].hexes[0] === '0303' &&
    migrated.mapData.laylines[0].hexes[1] === '0404');
  check('orphan currentLocationHex cleared', migrated.currentLocationHex === '');
}

// ----- Scenario 11g: non-string currentLocationHex coerced to '' -----
section("Scenario 11g: non-string currentLocationHex (null/number) coerced to ''");
{
  const data = baseV10();
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  data.currentDate = { day: 1, month: 0, year: 1 };
  (data as AnyData).currentLocationHex = null;
  (data as AnyData).mapData = { pois: [], fayeDoors: [], laylines: [] };
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
  (data as AnyData).mapData = { pois: [], fayeDoors: [], laylines: [] };
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
    fayeDoors: [
      { id: 'S', hex: '0303', name: 'Self', notes: '', destination: { kind: 'roaded', pairedDoorId: 'S', roadName: 'Loop' } },
    ],
    laylines: [],
  };
  const migrated = migrateCharacter(data as never);
  check('self-paired downgraded to wild', migrated.mapData.fayeDoors[0].destination.kind === 'wild');
}

// ----- Scenario 11c: asymmetric door pair in hand-edited v12 save -----
section('Scenario 11c: asymmetric door pair gets repaired to wild');
{
  const data = baseV10();
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  data.currentDate = { day: 1, month: 0, year: 1 };
  (data as AnyData).mapData = {
    pois: [],
    fayeDoors: [
      // A claims B, but B is wild → A should become wild.
      { id: 'A', hex: '0303', name: 'A', notes: '', destination: { kind: 'roaded', pairedDoorId: 'B', roadName: 'Solo Road' } },
      { id: 'B', hex: '0404', name: 'B', notes: '', destination: { kind: 'wild' } },
      // C and D mutually paired → preserved.
      { id: 'C', hex: '0505', name: 'C', notes: '', destination: { kind: 'roaded', pairedDoorId: 'D', roadName: 'Twin Road' } },
      { id: 'D', hex: '0606', name: 'D', notes: '', destination: { kind: 'roaded', pairedDoorId: 'C', roadName: 'Twin Road' } },
      // E points at non-existent door → E should become wild.
      { id: 'E', hex: '0707', name: 'E', notes: '', destination: { kind: 'roaded', pairedDoorId: 'ghost', roadName: 'Ghost Road' } },
    ],
    laylines: [],
  };
  const migrated = migrateCharacter(data as never);
  const byId = Object.fromEntries(migrated.mapData.fayeDoors.map((d) => [d.id, d]));
  check('A repaired to wild', byId.A.destination.kind === 'wild');
  check('B stays wild', byId.B.destination.kind === 'wild');
  check('C stays roaded', byId.C.destination.kind === 'roaded');
  check('D stays roaded', byId.D.destination.kind === 'roaded');
  check('E (orphan) repaired to wild', byId.E.destination.kind === 'wild');
}

// ----- Scenario 11: pin missing hex / bad shape -----
section('Scenario 11: pin records that should be skipped');
{
  const data = baseV10();
  data.otherNotes = '<!--MAP_PINS-->[{},{"label":"no-hex"},{"hex":"abcd"},{"hex":"0303","label":"good"}]';
  const migrated = migrateCharacter(data as never);
  check('only the good pin imported', migrated.mapData.pois.length === 1);
  check('good pin label', migrated.mapData.pois[0].name === 'good');
}

console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
