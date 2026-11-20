import { Character, FairyDate, FairyEvent, FairyVisit } from './types';
import { createDefaultCharacter, LATEST_DATE, MAX_YEAR, MONTHS, daysBetween } from './gamedata';
import { fitCountingStart, getLivedDayAtDolmenwoodDate } from './livedTime';

export const CURRENT_SCHEMA_VERSION = 12;

const DEFAULT_CALENDAR_DATE = { day: 1, month: 0, year: 1 };

/**
 * Coerce a value that's supposed to be a CalendarDate into a well-formed
 * one. Replaces malformed shapes and non-finite numeric subfields with
 * sensible defaults. `day` is bounded against the (clamped) month's
 * actual length so a stale `day: 50` can't survive into display. A date
 * past the calendar's last day (Year MAX_YEAR) becomes that day, so loaded
 * data stays within what the calendar and the Fairy dialogs accept, and
 * dates keep their order.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeDate(d: any): { day: number; month: number; year: number } {
  if (d == null || typeof d !== 'object' || Array.isArray(d)) {
    return { ...DEFAULT_CALENDAR_DATE };
  }
  const month = Number.isFinite(d.month)
    ? Math.max(0, Math.min(11, Math.floor(d.month)))
    : DEFAULT_CALENDAR_DATE.month;
  const monthDays = MONTHS[month].days;
  const day = Number.isFinite(d.day)
    ? Math.max(1, Math.min(monthDays, Math.floor(d.day)))
    : DEFAULT_CALENDAR_DATE.day;
  const year = Number.isFinite(d.year) ? Math.max(1, Math.floor(d.year)) : DEFAULT_CALENDAR_DATE.year;
  if (year > MAX_YEAR) return { ...LATEST_DATE };
  return { day, month, year };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isPlainObject(v: any): boolean {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Walk a character object and rewrite the CalendarDate fields that predate
 * Fairy time (currentDate, journal entry dates, learnedAt, and the active
 * study's startedOn) through sanitizeDate, repairing the shapes around them.
 * Both the v10 → v11 migration and the final post-migration pass call this.
 * The Fairy-time dates (visit dates and livedTimeStart) are repaired in
 * sanitizeFairyTime, which runs right after it in that final pass.
 */
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

/**
 * Anchor an in-progress spell study on the lived-time clock (see
 * src/lib/livedTime.ts), measured against the given well-formed visits.
 * Leaves an existing anchor alone unless `force` is set, or unless the
 * study began in Dolmenwood after the last return (stamped with that visit):
 * then the anchor always comes from its date, which is exact for such a
 * study. Editing that return works the study's start out again from the
 * anchor, so a hand-edited anchor would otherwise block every edit.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function anchorActiveStudy(data: any, fairyVisits: FairyVisit[], force = false): void {
  const active = isPlainObject(data.spellStudy) ? data.spellStudy.active : null;
  if (!isPlainObject(active)) return;
  const stamp = typeof active.sinceReturnFrom === 'string' ? active.sinceReturnFrom : undefined;
  const startedOn = sanitizeDate(active.startedOn);
  const last = fairyVisits[fairyVisits.length - 1];
  const sinceLastReturn =
    !active.startedInFairy && stamp !== undefined && last?.id === stamp && last.returnedOn != null && daysBetween(last.returnedOn, startedOn) >= 0;
  if (!force && !sinceLastReturn && Number.isFinite(active.startedLivedDay)) {
    active.startedLivedDay = Math.max(0, Math.floor(active.startedLivedDay)); // a whole, non-negative lived day
    return;
  }
  active.startedLivedDay = getLivedDayAtDolmenwoodDate({ fairyVisits }, startedOn, stamp);
}

/**
 * Add Fairy time tracking: an empty visit list, the days-lived counter's
 * start date (Year 1, 1 Grimvold), and a lived-day anchor on any
 * in-progress spell study.
 *
 * A save from before this version can't hold real Fairy data, so anything
 * already in those fields is a leftover from a hand edit: the visit list and
 * counter start are replaced, and Fairy references on records are removed.
 * The anchor is measured with no visits, where a date's lived day is just
 * its days since Year 1, day 1. Progress, livedDays(now) - startedLivedDay,
 * then equals daysBetween(startedOn, currentDate): exactly what the old app
 * showed.
 *
 * Kept self-contained (no version numbers inside) so it can be renumbered
 * if another schema bump lands first.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateAddFairyTime(data: any): any {
  data.fairyVisits = [];
  data.livedTimeStart = { ...DEFAULT_CALENDAR_DATE };
  if (Array.isArray(data.journalEntries)) {
    for (const entry of data.journalEntries.filter(isPlainObject)) {
      delete entry.fairyDate;
      delete entry.fairyEvent;
      delete entry.sinceReturnFrom;
    }
  }
  if (Array.isArray(data.knownSpells)) {
    for (const spell of data.knownSpells.filter(isPlainObject)) {
      delete spell.learnedInFairy;
      delete spell.sinceReturnFrom;
    }
  }
  if (isPlainObject(data.spellStudy) && isPlainObject(data.spellStudy.active)) {
    delete data.spellStudy.active.startedInFairy;
    delete data.spellStudy.active.sinceReturnFrom;
  }
  anchorActiveStudy(data, [], true);
  return data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeFairyDate(ref: any): FairyDate | undefined {
  if (!isPlainObject(ref) || typeof ref.visitId !== 'string' || !Number.isFinite(ref.day)) return undefined;
  return { visitId: ref.visitId, day: Math.max(1, Math.floor(ref.day)) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeFairyEvent(event: any): FairyEvent | undefined {
  if (!isPlainObject(event) || typeof event.visitId !== 'string') return undefined;
  if (event.kind !== 'entered' && event.kind !== 'returned') return undefined;
  return { visitId: event.visitId, kind: event.kind };
}

// Repair (or drop) the Fairy references a record can carry.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeRecordRefs(record: any, fairyDateKey: string, withEvent = false): void {
  if (record[fairyDateKey] !== undefined) {
    const ref = sanitizeFairyDate(record[fairyDateKey]);
    if (ref) record[fairyDateKey] = ref; else delete record[fairyDateKey];
  }
  if (withEvent && record.fairyEvent !== undefined) {
    const event = sanitizeFairyEvent(record.fairyEvent);
    if (event) record.fairyEvent = event; else delete record.fairyEvent;
  }
  if (record.sinceReturnFrom !== undefined && typeof record.sinceReturnFrom !== 'string') delete record.sinceReturnFrom;
}

// A date with all three parts present as numbers (it may still need clamping).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasDateParts(d: any): boolean {
  return isPlainObject(d) && Number.isFinite(d.day) && Number.isFinite(d.month) && Number.isFinite(d.year);
}

/**
 * Repair Fairy-time data on a partially-trusted save (a hand-edited import
 * can skip the migration loop), restoring the invariants the rest of the app
 * relies on:
 *   - visits have unique ids, whole non-negative days, and an entry date. A
 *     visit with no usable entry date is dropped rather than placed on an
 *     invented one;
 *   - visits are in order: none begins before the previous one ended, and
 *     none ends before it began; only the last can still be open;
 *   - while the character is in Fairy, Dolmenwood's date is frozen on the
 *     entry day; otherwise it's never before the last return (the calendar's
 *     floor);
 *   - the study's lived-day anchor is a whole, non-negative number.
 * A counter start date later than today is valid; the counter shows 0 until
 * the calendar reaches it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeFairyTime(data: any): void {
  if (data.fairyVisits !== undefined && !Array.isArray(data.fairyVisits)) data.fairyVisits = [];
  if (Array.isArray(data.fairyVisits)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const visits: any[] = data.fairyVisits.filter((v: any) => isPlainObject(v) && hasDateParts(v.enteredOn));
    const seenIds = new Set<string>();
    let previousReturn: { day: number; month: number; year: number } | null = null;
    visits.forEach((visit, i) => {
      if (typeof visit.id !== 'string' || visit.id === '' || seenIds.has(visit.id)) visit.id = crypto.randomUUID();
      seenIds.add(visit.id);
      visit.enteredOn = sanitizeDate(visit.enteredOn);
      if (previousReturn && daysBetween(previousReturn, visit.enteredOn) < 0) visit.enteredOn = { ...previousReturn };
      if (visit.returnedOn == null) {
        // Only the most recent visit can still be open; close any earlier
        // one on the day it began, as if no time passed.
        visit.returnedOn = i === visits.length - 1 ? null : { ...visit.enteredOn };
      } else {
        visit.returnedOn = sanitizeDate(visit.returnedOn);
        if (daysBetween(visit.enteredOn, visit.returnedOn) < 0) visit.returnedOn = { ...visit.enteredOn };
      }
      visit.daysInFairy = Number.isFinite(visit.daysInFairy) ? Math.max(0, Math.floor(visit.daysInFairy)) : 0;
      previousReturn = visit.returnedOn;
    });
    data.fairyVisits = visits;
    const last = visits[visits.length - 1];
    if (last && last.returnedOn === null) {
      data.currentDate = { ...last.enteredOn };
    } else if (last && (!isPlainObject(data.currentDate) || daysBetween(last.returnedOn, data.currentDate) < 0)) {
      data.currentDate = { ...last.returnedOn };
    }
  }

  // The counter's start; reconcileWithDefaults fills it in if missing. Its
  // stamp stays only if it fits the visits; a day spent away in Fairy moves
  // to the return date (see fitCountingStart).
  if (data.livedTimeStart !== undefined) {
    const raw = data.livedTimeStart;
    const stamp = isPlainObject(raw) && typeof raw.sinceReturnFrom === 'string' ? raw.sinceReturnFrom : undefined;
    data.livedTimeStart = fitCountingStart(
      { fairyVisits: Array.isArray(data.fairyVisits) ? data.fairyVisits : [] },
      { ...sanitizeDate(raw), ...(stamp ? { sinceReturnFrom: stamp } : {}) },
    );
  }

  // Fairy references on records: keep well-formed ones, drop anything else.
  // A reference to an unknown visit is kept; it still displays its day.
  if (Array.isArray(data.journalEntries)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const entry of data.journalEntries as any[]) sanitizeRecordRefs(entry, 'fairyDate', true);
  }
  if (Array.isArray(data.knownSpells)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const spell of data.knownSpells as any[]) sanitizeRecordRefs(spell, 'learnedInFairy');
  }
  if (isPlainObject(data.spellStudy) && isPlainObject(data.spellStudy.active)) {
    sanitizeRecordRefs(data.spellStudy.active, 'startedInFairy');
    anchorActiveStudy(data, Array.isArray(data.fairyVisits) ? data.fairyVisits : []);
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
  // v11 -> v12: Fairy time tracking. Adds fairyVisits and anchors any
  // in-progress spell study on the lived-time clock (progress unchanged).
  11: migrateAddFairyTime,
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
  // JSON import that smuggles in non-numeric date fields gets cleaned
  // before downstream date math tries to use it.
  sanitizeCharacterDates(data);
  sanitizeFairyTime(data);

  return reconcileWithDefaults(data) as Character;
}
