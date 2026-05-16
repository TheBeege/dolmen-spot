import { Character } from './types';
import { createDefaultCharacter, MONTHS } from './gamedata';
import { HEX_CELLS } from './hex-grid';

export const CURRENT_SCHEMA_VERSION = 12;

const DEFAULT_CALENDAR_DATE = { day: 1, month: 0, year: 1 };

/**
 * Coerce a value that's supposed to be a CalendarDate into a well-formed
 * one. Replaces malformed shapes and non-finite numeric subfields with
 * sensible defaults. `day` is bounded against the (clamped) month's
 * actual length so a stale `day: 50` can't survive into display.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeDate(d: any): { day: number; month: number; year: number } {
  if (d == null || typeof d !== 'object' || Array.isArray(d)) {
    return { ...DEFAULT_CALENDAR_DATE };
  }
  // `month` is guaranteed to be an integer in [0, 11] after this expression:
  // Number.isFinite rejects NaN/Infinity (so the else branch fires for those),
  // Math.floor coerces fractional input, and Math.max/min clamp to the array
  // bounds. MONTHS[month] is therefore always defined; no defensive guard
  // needed at the index.
  const month = Number.isFinite(d.month)
    ? Math.max(0, Math.min(11, Math.floor(d.month)))
    : DEFAULT_CALENDAR_DATE.month;
  const monthDays = MONTHS[month].days;
  const day = Number.isFinite(d.day)
    ? Math.max(1, Math.min(monthDays, Math.floor(d.day)))
    : DEFAULT_CALENDAR_DATE.day;
  const year = Number.isFinite(d.year) ? Math.max(1, Math.floor(d.year)) : DEFAULT_CALENDAR_DATE.year;
  return { day, month, year };
}

/**
 * Walk a character object and rewrite every persisted CalendarDate field
 * through sanitizeDate. Both the v10 → v11 migration and the final
 * post-migration pass call this so there's one canonical path for date
 * repair.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isPlainObject(v: any): boolean {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeCharacterDates(data: any): void {
  // currentDate is a required top-level field; if missing,
  // reconcileWithDefaults will fill it from createDefaultCharacter,
  // so we only sanitize when it's actually present.
  if (data.currentDate !== undefined) data.currentDate = sanitizeDate(data.currentDate);

  // journalEntries must be an array of objects with required `date`.
  // Replace a non-array value (corrupt JSON like `"lol"`) with []; then
  // drop any non-object entries before sanitizing each entry's date.
  if (data.journalEntries !== undefined && !Array.isArray(data.journalEntries)) {
    data.journalEntries = [];
  }
  if (Array.isArray(data.journalEntries)) {
    data.journalEntries = data.journalEntries.filter(isPlainObject);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const entry of data.journalEntries as any[]) {
      entry.date = sanitizeDate(entry.date);
    }
  }

  // knownSpells: same shape defense. learnedAt is optional, so we only
  // sanitize it if it's present (not undefined).
  if (data.knownSpells !== undefined && !Array.isArray(data.knownSpells)) {
    data.knownSpells = [];
  }
  if (Array.isArray(data.knownSpells)) {
    data.knownSpells = data.knownSpells.filter(isPlainObject);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const k of data.knownSpells as any[]) {
      if (k.learnedAt !== undefined) k.learnedAt = sanitizeDate(k.learnedAt);
    }
  }

  // spellStudy shape: must be an object with `active` (object or null)
  // and `queue` (array). Replace anything malformed with the default.
  if (data.spellStudy !== undefined && !isPlainObject(data.spellStudy)) {
    data.spellStudy = { active: null, queue: [] };
  }
  if (isPlainObject(data.spellStudy)) {
    // `active` is allowed to be null; anything else that isn't an object → null
    if (data.spellStudy.active !== null && data.spellStudy.active !== undefined && !isPlainObject(data.spellStudy.active)) {
      data.spellStudy.active = null;
    }
    if (data.spellStudy.queue !== undefined && !Array.isArray(data.spellStudy.queue)) {
      data.spellStudy.queue = [];
    }
    // Filter out non-object queue entries (string/number/null) so the
    // study UI can rely on `q.spellName` and friends existing.
    if (Array.isArray(data.spellStudy.queue)) {
      data.spellStudy.queue = data.spellStudy.queue.filter(isPlainObject);
    }
    // ActiveSpellStudy.startedOn is required when active is set.
    if (isPlainObject(data.spellStudy.active)) {
      data.spellStudy.active.startedOn = sanitizeDate(data.spellStudy.active.startedOn);
    }
  }
}

const HEX_COORD_RE = /^\d{4}$/;

/**
 * Repair `mapData` shape on a partially-trusted save. Runs as part of the
 * v11→v12 migration *and* unconditionally at the end of migrateCharacter so
 * that a hand-edited save already at v12 (which the migration loop skips)
 * gets the same defensive cleanup.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeMapData(data: any): void {
  if (!isPlainObject(data.mapData)) {
    data.mapData = { pois: [], fayeDoors: [], laylines: [] };
    return;
  }
  const md = data.mapData as Record<string, unknown>;
  if (!Array.isArray(md.pois)) md.pois = [];
  if (!Array.isArray(md.fayeDoors)) md.fayeDoors = [];
  if (!Array.isArray(md.laylines)) md.laylines = [];
  // Validate hex coords both for format (4-digit) AND for existence in the
  // canonical manifest. The grid shape changed between releases (the bounding
  // rectangle once held 250 cells; the manifest is now smaller after we
  // pinned to the printed map's actual outline — see hex-grid.json
  // `meta.cellCount`). Saves can carry POIs / doors / layline hexes pointing
  // at cells that no longer exist — drop those.
  const isLiveHex = (raw: unknown): raw is string =>
    typeof raw === 'string' && HEX_COORD_RE.test(raw) && raw in HEX_CELLS;

  md.pois = (md.pois as unknown[]).filter(
    (p): p is Record<string, unknown> =>
      isPlainObject(p) && isLiveHex((p as { hex?: unknown }).hex),
  );
  md.fayeDoors = (md.fayeDoors as unknown[]).filter(
    (d): d is Record<string, unknown> =>
      isPlainObject(d) && isLiveHex((d as { hex?: unknown }).hex),
  );
  // For laylines: trim each hexes[] to keep only live coords, then drop the
  // whole layline if fewer than 2 valid hexes remain.
  md.laylines = (md.laylines as unknown[])
    .filter(
      (l): l is Record<string, unknown> =>
        isPlainObject(l) && Array.isArray((l as { hexes?: unknown }).hexes),
    )
    .map((l) => {
      const hexes = (l.hexes as unknown[]).filter(isLiveHex);
      return { ...l, hexes };
    })
    .filter((l) => (l.hexes as string[]).length >= 2);

  // Validate the in-progress layline draft the same way; trim invalid hexes,
  // drop the draft entirely if it would shrink below 1 hex.
  if (isPlainObject(md.draftLayline)) {
    const draft = md.draftLayline as Record<string, unknown>;
    if (Array.isArray(draft.hexes)) {
      draft.hexes = (draft.hexes as unknown[]).filter(isLiveHex);
      if ((draft.hexes as string[]).length === 0) {
        delete md.draftLayline;
      }
    } else {
      delete md.draftLayline;
    }
  }

  // currentLocationHex lives on the character (not in mapData), but the
  // validity check belongs here next to its siblings. The field is typed
  // HexCoord | ''; coerce any non-string (null, number, object from a
  // hand-edited save) to '' and clear it if the live hex is no longer in
  // the manifest.
  if (typeof data.currentLocationHex !== 'string') {
    data.currentLocationHex = '';
  } else if (data.currentLocationHex !== '' && !(data.currentLocationHex in HEX_CELLS)) {
    data.currentLocationHex = '';
  }
  // draftLayline non-object types get dropped here; the live-hex trim
  // above handles the object-with-bad-hexes case.
  if (md.draftLayline !== undefined && !isPlainObject(md.draftLayline)) {
    delete md.draftLayline;
  }

  // Repair asymmetric Faye-door pairings from hand-edited imports. A
  // roaded door whose partner doesn't reciprocate (partner is wild, or
  // points elsewhere, or doesn't exist) is downgraded to wild — that
  // leaves it visible and editable, instead of drawing a one-sided
  // connector or blocking the partner from being re-paired.
  //
  // Two-pass to keep iteration order irrelevant: pass 1 reads the
  // ORIGINAL destination kinds and records which doors need to be
  // downgraded; pass 2 applies the downgrade. (A single-pass loop is
  // actually order-safe too because a wild-marked partner just fails
  // the reciprocation test, which is the correct outcome — but the
  // explicit two-pass version is easier to reason about.)
  const doors = md.fayeDoors as Array<Record<string, unknown>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isRoaded = (d: any): boolean => isPlainObject(d?.destination) && d.destination.kind === 'roaded';
  const toDowngrade = new Set<unknown>();
  for (const d of doors) {
    if (!isRoaded(d)) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dest = (d as any).destination;
    const ownId = (d as { id?: unknown }).id;
    const partnerId = typeof dest.pairedDoorId === 'string' ? dest.pairedDoorId : null;
    // Self-paired doors (a door whose pairedDoorId is its own id) trivially
    // "reciprocate" but are nonsense — a door can't be a road to itself.
    // Reject up-front so they get downgraded to wild.
    if (partnerId === null || partnerId === ownId) {
      toDowngrade.add(d);
      continue;
    }
    const partner = doors.find((x) => (x as { id?: unknown }).id === partnerId);
    const reciprocates =
      partner &&
      isRoaded(partner) &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (partner as any).destination.pairedDoorId === ownId;
    if (!reciprocates) {
      toDowngrade.add(d);
    }
  }
  for (const d of toDowngrade) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (d as any).destination = { kind: 'wild' };
  }
}

// Each migration transforms from version N to N+1.
// Migrations receive raw data (any) and return transformed data.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const migrations: Record<number, (data: any) => any> = {
  // v1 -> v2: Fix default skill targets from 5 to 6.
  // Only updates the 3 base skills if they're still at the old default of 5.
  1: (data) => {
    if (data.skillTargets) {
      const base = ['listen', 'search', 'survival'];
      for (const skill of base) {
        if (data.skillTargets[skill] === 5) {
          data.skillTargets[skill] = 6;
        }
      }
    }
    return data;
  },
  // v2 -> v3: Add equippedArmourName and hasShield fields for combat auto-calc.
  2: (data) => {
    if (data.equippedArmourName === undefined) data.equippedArmourName = '';
    if (data.hasShield === undefined) data.hasShield = false;
    return data;
  },
  // v3 -> v4: Add magic system fields (glamours, runes, knack, startingSpellBook).
  3: (data) => {
    if (data.glamours === undefined) data.glamours = [];
    if (data.runes === undefined) data.runes = [];
    if (data.knack === undefined) data.knack = null;
    if (data.startingSpellBook === undefined) data.startingSpellBook = '';
    return data;
  },
  // v4 -> v5: Add containers array for inventory container tracking.
  4: (data) => {
    if (data.containers === undefined) data.containers = [];
    return data;
  },
  // v5 -> v6: Add adventuring fields (exhaustion, hunger, thirst, rations, light sources, travel).
  5: (data) => {
    if (data.exhaustionLevel === undefined) data.exhaustionLevel = 0;
    if (data.hungerDays === undefined) data.hungerDays = 0;
    if (data.thirstDays === undefined) data.thirstDays = 0;
    if (data.rations === undefined) data.rations = { fresh: 0, preserved: 0 };
    if (data.activeLightSources === undefined) data.activeLightSources = [];
    if (data.travelDaysWithoutRest === undefined) data.travelDaysWithoutRest = 0;
    if (data.forcedMarchActive === undefined) data.forcedMarchActive = false;
    if (data.travelPointsRemaining === undefined) data.travelPointsRemaining = 0;
    return data;
  },
  // v6 -> v7: Add class/kindred feature fields (retainers, gaze, forms, revelry, trophies, etc.).
  6: (data) => {
    if (data.retainers === undefined) data.retainers = [];
    if (data.gazeUsesRemaining === undefined) data.gazeUsesRemaining = 0;
    if (data.currentForm === undefined) data.currentForm = 'estray';
    if (data.wilderUsedToday === undefined) data.wilderUsedToday = false;
    if (data.madRevelryUsesRemaining === undefined) data.madRevelryUsesRemaining = 0;
    if (data.trophies === undefined) data.trophies = [];
    if (data.animalCompanion === undefined) data.animalCompanion = null;
    if (data.liegeHouse === undefined) data.liegeHouse = '';
    if (data.selectedCombatTalents === undefined) data.selectedCombatTalents = [];
    if (data.holyOrder === undefined) data.holyOrder = '';
    if (data.symbioticFleshTraits === undefined) data.symbioticFleshTraits = [];
    if (data.fungalSymbiosisUsesRemaining === undefined) data.fungalSymbiosisUsesRemaining = 0;
    return data;
  },
  // v7 -> v8: Add moonPhase field for moon sign phases (Waxing/Full/Waning).
  7: (data) => {
    if (data.moonPhase === undefined) data.moonPhase = '';
    return data;
  },
  // v8 -> v9: Fix incorrect moon sign names. Old values were hallucinated;
  // clear them so users can re-select from the correct list.
  8: (data) => {
    const validMoonSigns = [
      'Grinning moon', 'Dead moon', 'Beast moon', 'Squamous moon',
      "Knight's moon", 'Rotting moon', "Maiden's moon", "Witch's moon",
      "Robber's moon", 'Goat moon', 'Narrow moon', 'Black moon',
    ];
    if (data.moonSign && !validMoonSigns.includes(data.moonSign)) {
      data.moonSign = '';
      data.moonPhase = '';
    }
    return data;
  },
  // v9 -> v10: Add knownSpells, spellStudy, and failedStudies fields for the
  // arcane spellbook/study system (Player's Book p78-79).
  9: (data) => {
    if (data.knownSpells === undefined) data.knownSpells = [];
    if (data.spellStudy === undefined) data.spellStudy = { active: null, queue: [] };
    if (data.failedStudies === undefined) data.failedStudies = [];
    return data;
  },
  // v10 -> v11: Add `year` to every CalendarDate. Pre-v11 saves had no
  // year field. sanitizeCharacterDates walks every persisted date and
  // rewrites it through sanitizeDate, which stamps year=1, coerces
  // non-numeric subfields to defaults, and clamps month/day to valid
  // ranges. Same helper runs unconditionally at the end of migration.
  10: (data) => {
    sanitizeCharacterDates(data);
    return data;
  },
  // v11 -> v12: Structured hex-map data. Adds mapData + currentLocationHex
  // and best-effort-migrates the legacy <!--MAP_PINS--> marker stashed in
  // otherNotes into proper MapPOI records.
  11: (data) => {
    // Ensure mapData is well-shaped before we push into it. The same helper
    // also runs unconditionally in migrateCharacter() so a hand-edited v12
    // save with a borked `mapData.pois` field gets repaired too.
    sanitizeMapData(data);
    if (typeof data.currentLocationHex !== 'string') data.currentLocationHex = '';

    const PIN_MARKER = '<!--MAP_PINS-->';
    const notes: string = typeof data.otherNotes === 'string' ? data.otherNotes : '';
    const idx = notes.indexOf(PIN_MARKER);
    if (idx === -1) return data;

    const before = notes.slice(0, idx);
    const payload = notes.slice(idx + PIN_MARKER.length);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(payload);
    } catch {
      // Payload is unparseable. Leave the marker in place so the user can
      // still see / recover their raw data by hand-editing the export.
      return data;
    }

    // Parse succeeded. Whether the shape was an array or not, we strip the
    // marker — keeping it around would leave it visible in the notes UI with
    // no recovery path. Trim trailing whitespace that preceded the marker
    // so re-saved notes don't accumulate phantom blank lines.
    data.otherNotes = before.replace(/\s+$/, '');
    if (!Array.isArray(parsed)) return data;

    type LegacyPin = { id?: string; label?: string; hex?: string; isCurrentLocation?: boolean };
    for (const pin of parsed as LegacyPin[]) {
      if (!pin || typeof pin !== 'object') continue;
      // Legacy form was a free-text input. Users typed things like "303"
      // expecting the canonical 4-digit form; left-pad before validating
      // so we don't silently drop their pins.
      const raw = (pin.hex || '').trim();
      const hex = /^\d{1,4}$/.test(raw) ? raw.padStart(4, '0') : raw;
      if (!HEX_COORD_RE.test(hex)) continue;
      data.mapData.pois.push({
        id: pin.id || (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `poi-${Math.random().toString(36).slice(2)}`),
        hex,
        name: pin.label || 'Marker',
        notes: '',
      });
      if (pin.isCurrentLocation) {
        data.currentLocationHex = hex;
      }
    }
    return data;
  },
};

// Required subkeys for the schema's nullable-object fields. If a saved
// plain-object value is missing any of these, the field is reset to
// `null` so the UI's "you must select X" flow handles it cleanly
// instead of rendering undefined names / NaN counts.
const NULLABLE_OBJECT_REQUIRED_KEYS: Partial<Record<keyof Character, readonly string[]>> = {
  knack: ['knackId', 'name', 'notes'],
  animalCompanion: ['name', 'type', 'hp', 'notes'],
};

/**
 * Deep-merge saved character data over a fresh default character.
 * Missing fields get safe defaults without overwriting existing player
 * data. Wrong-typed fields (e.g. an array field replaced by a string
 * from a hand-edited JSON) are repaired to the default shape so that
 * downstream components can rely on the schema.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reconcileWithDefaults(data: any): any {
  const defaults = createDefaultCharacter();

  for (const key of Object.keys(defaults) as (keyof Character)[]) {
    const defVal = defaults[key];
    const dataVal = data[key];

    if (dataVal === undefined) {
      data[key] = defVal;
      continue;
    }

    if (Array.isArray(defVal)) {
      // Array field — repair if the saved value is anything other than an array.
      if (!Array.isArray(dataVal)) data[key] = defVal;
      continue;
    }

    if (defVal === null) {
      // Nullable-object field (knack, animalCompanion). Three cases:
      //   - null: legitimate cleared state, leave alone.
      //   - non-null + non-plain-object: malformed → null.
      //   - plain object: check required subkeys; if any are missing,
      //     null it out so the UI re-selection flow handles it cleanly.
      if (dataVal === null) continue;
      if (!isPlainObject(dataVal)) {
        data[key] = null;
        continue;
      }
      const required = NULLABLE_OBJECT_REQUIRED_KEYS[key];
      if (required) {
        const obj = dataVal as Record<string, unknown>;
        // Check the VALUE, not just key existence — `{ name: undefined }`
        // would survive `k in obj` but still crash the controlled-input
        // render flow we're trying to protect.
        if (!required.every((k) => obj[k] !== undefined)) {
          data[key] = null;
        }
      }
      continue;
    }

    if (typeof defVal === 'object') {
      // Object default. If the saved value isn't a plain object, replace
      // wholesale; otherwise one-level deep-merge to fill missing subkeys.
      if (!isPlainObject(dataVal)) {
        data[key] = defVal;
        continue;
      }
      const defaultObj = defVal as Record<string, unknown>;
      const dataObj = dataVal as Record<string, unknown>;
      for (const subKey of Object.keys(defaultObj)) {
        if (dataObj[subKey] === undefined) {
          dataObj[subKey] = defaultObj[subKey];
        }
      }
    }
    // Primitive defaults (numbers, strings, booleans): leave the saved
    // value alone even if it's a different primitive type — we don't have
    // enough schema info here to coerce safely, and component-level usage
    // largely tolerates surprising primitives via Number()/String() casts.
  }

  return data;
}

/**
 * Migrate a character from any schema version to the current version,
 * then reconcile with defaults to fill any missing fields.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateCharacter(data: any): Character {
  // Characters saved before versioning have no schemaVersion field
  if (data.schemaVersion === undefined) {
    data.schemaVersion = 1;
  }

  // Run each migration in sequence
  while (data.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const migration = migrations[data.schemaVersion];
    if (!migration) {
      console.warn(`No migration found for schema version ${data.schemaVersion}`);
      break;
    }
    data = migration(data);
    data.schemaVersion = data.schemaVersion + 1;
  }

  // Defensive: also runs for already-current saves, so a hand-edited
  // JSON import that smuggles in non-numeric date fields or a malformed
  // mapData shape gets cleaned before downstream code tries to use it.
  // reconcileWithDefaults only fills MISSING top-level keys; deeper
  // shape repair has to happen here.
  //
  // Call order: sanitizers run BEFORE reconcileWithDefaults. This is safe
  // because reconcileWithDefaults's object-merge branch only fills
  // subkeys when the saved value is `undefined`; the arrays/objects
  // populated by sanitizers above are never undefined, so reconcile
  // won't overwrite them.
  sanitizeCharacterDates(data);
  sanitizeMapData(data);

  return reconcileWithDefaults(data) as Character;
}
