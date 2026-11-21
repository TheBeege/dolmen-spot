import type {
  Character,
  FairyDate,
  FairyDoor,
  FairyDoorDestination,
  FairyEvent,
  FairyVisit,
  HexCoord,
  LeyLine,
  MapPOI,
  Npc,
  NpcQuest,
  PathKind,
  ShardState,
  SpellbookEntry,
} from './types';
import { createDefaultCharacter, LATEST_DATE, MAX_YEAR, MONTHS, daysBetween } from './gamedata';
import { fitCountingStart, getLivedDayAtDolmenwoodDate } from './livedTime';
import { HEX_GRID_META } from './hex-grid';
import { isValidHex, pixelToHex } from './hex';
import { DEFAULT_LEY_LINE_TYPE, LEY_LINE_COLORS, isPathKind, isPoiKind, pathKindFromType } from './map-data';

export const CURRENT_SCHEMA_VERSION = 15;

/**
 * A saved `schemaVersion` as a number. Some old saves have it as a string of
 * digits, such as "10", which counts as the number it spells; any other value
 * is returned as it is. migrateCharacter reads the version through this, and
 * so does the store's check for a save from a newer version, so the two agree:
 * "10" is migrated from version 10, and "99" is from a newer version.
 */
export function readSchemaVersion(value: unknown): unknown {
  return typeof value === 'string' && /^\s*\d+\s*$/.test(value) ? Number(value) : value;
}

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

const MAP_PINS_MARKER = '<!--MAP_PINS-->';
// Heading of the list, appended to otherNotes, of map items that couldn't be
// kept on the map (legacy pins with no usable position, items on hexes that
// aren't on the printed map), so nothing the player wrote is thrown away.
const LOST_ITEMS_HEADING = "Map markers that couldn't be placed:";
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

// A new id for an item repaired on load (a map item, a journal entry).
function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}`;
}

/** A text field read defensively: strings as is, finite numbers as text, anything else ''. */
function asText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

/**
 * True if `v` is, or somewhere contains, a string that isn't blank, a number
 * or a boolean. Walks nested arrays and objects without recursion, so a
 * deeply nested hand-edited value can't overflow the stack.
 */
function holdsText(v: unknown): boolean {
  const pending: unknown[] = [v];
  const seen = new Set<object>();
  while (pending.length > 0) {
    const x = pending.pop();
    if (typeof x === 'string') {
      if (x.trim() !== '') return true;
    } else if (typeof x === 'number' || typeof x === 'boolean') {
      return true;
    } else if (x !== null && typeof x === 'object' && !seen.has(x)) {
      seen.add(x);
      for (const y of Object.values(x)) pending.push(y);
    }
  }
  return false;
}

/**
 * Text to keep from a value that can't be a map item or pin (or list of
 * them): strings (trimmed), numbers and booleans as written, arrays and
 * objects as JSON. '' for values that hold no text: null, blank strings,
 * and arrays or objects with none inside, such as [] or {"a": [[]]}.
 */
function nonItemText(v: unknown): string {
  if (!holdsText(v)) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v) ?? '';
  } catch {
    return '';
  }
}

/**
 * `fields`, then any fields of `raw` it doesn't set. The values in `fields`
 * win, and its keys come first, in its order.
 */
function withExtraFields<T extends object>(fields: T, raw: Record<string, unknown>): T {
  return { ...fields, ...raw, ...fields };
}

/** "Label (Hex 1313): notes" for the couldn't-be-placed list. */
function lostItem(label: string, hex: string, notes: string): string {
  return `${label}${hex ? ` (Hex ${hex})` : ''}${notes ? `: ${notes}` : ''}`;
}

/** `notes` plus a line recording a fairy road that had to be unlinked. */
function withLostRoad(notes: string, roadName: string): string {
  if (!roadName) return notes;
  const line = `Was on the fairy road "${roadName}" (its other end couldn't be found).`;
  return notes ? `${notes}\n${line}` : line;
}

/** `value` as a whole number no less than `min`, or `fallback` if it isn't a finite number. */
function wholeAtLeast(value: unknown, min: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.floor(value)) : fallback;
}

/** `raw` as an id that isn't in `used` (a new one if it's empty or taken), now added to `used`. */
function uniqueIn(used: Set<string>, raw: unknown): string {
  let id = asText(raw);
  while (!id || used.has(id)) id = newId();
  used.add(id);
  return id;
}

/**
 * A spell recorded on a ley line or a Dwemer shard: `{ name, rank }` with text
 * in its name, and a rank that's a whole number of at least 1 (1 if it isn't
 * a number). Undefined for anything else, which means the spell isn't known.
 */
function sanitizeSpellRef(value: unknown): SpellbookEntry | undefined {
  if (!isPlainObject(value)) return undefined;
  const v = value as Record<string, unknown>;
  const name = asText(v.name);
  if (name.trim() === '') return undefined;
  return withExtraFields({ name, rank: wholeAtLeast(v.rank, 1, 1) }, v);
}

/**
 * Repair `mapData` and `currentLocationHex` on a partially-trusted save
 * (hand-edited imports, saves made on an older grid). Runs after the
 * migration loop on every load and import, so it must be idempotent.
 * Every element is normalized to the shape the map UI relies on, ids are
 * made unique, and items that can't stay on the map are described in `lost`
 * (kept in Other Notes) instead of being deleted: a POI or door off the map,
 * and a path other than a ley line with fewer than 2 hexes on it. A ley line
 * keeps the hexes it has, even one or none, since it's recorded as it's found.
 * Fields this repair doesn't know about are kept as they are, so a field
 * added later isn't deleted on the next load if it was left out here.
 * `legacyPois` (converted old-map pins) are added after the saved POIs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeMapData(data: any, lost: string[], legacyPois: readonly unknown[]): void {
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  // Values that can't be map items (a mapData that isn't an object, a list
  // that isn't an array, an entry that isn't an object) are replaced, but
  // any text they carry is kept.
  const keepText = (v: unknown) => {
    const t = nonItemText(v);
    if (t) lost.push(t);
  };
  if (!isPlainObject(data.mapData)) {
    keepText(data.mapData);
    data.mapData = {};
  }
  const md = data.mapData as Record<string, unknown>;
  const items = (key: 'pois' | 'fairyDoors' | 'leyLines'): unknown[] => {
    if (Array.isArray(md[key])) return md[key];
    keepText(md[key]);
    return [];
  };
  // Ids must be unique across POIs, doors and ley lines: the UI keys,
  // focuses, edits and deletes items by id.
  const usedIds = new Set<string>();
  const uniqueId = (raw: unknown): string => {
    let id = asText(raw);
    while (!id || usedIds.has(id)) id = newId();
    usedIds.add(id);
    return id;
  };

  const pois: MapPOI[] = [];
  for (const raw of [...items('pois'), ...legacyPois]) {
    if (!isPlainObject(raw)) { keepText(raw); continue; }
    const p = raw as Record<string, unknown>;
    const name = asText(p.name);
    const notes = asText(p.notes);
    if (!isValidHex(p.hex)) {
      lost.push(lostItem(name || 'Unnamed point of interest', asText(p.hex), notes));
      continue;
    }
    // A kind that isn't one of the POI kinds is removed, so the POI gets the
    // plain marker. withExtraFields would copy it back, hence the delete.
    const kind = isPoiKind(p.kind) ? p.kind : undefined;
    const poi: MapPOI = withExtraFields({ id: uniqueId(p.id), hex: p.hex, name, notes, ...(kind ? { kind } : {}) }, p);
    if (!kind) delete poi.kind;
    pois.push(poi);
  }
  md.pois = pois;

  const doors: FairyDoor[] = [];
  for (const raw of items('fairyDoors')) {
    if (!isPlainObject(raw)) { keepText(raw); continue; }
    const d = raw as Record<string, unknown>;
    const name = asText(d.name);
    let notes = asText(d.notes);
    const dest = (isPlainObject(d.destination) ? d.destination : {}) as Record<string, unknown>;
    const roadName = dest.kind === 'roaded' ? asText(dest.roadName) : '';
    if (!isValidHex(d.hex)) {
      lost.push(lostItem(`Fairy door ${name || 'Unnamed'}`, asText(d.hex), withLostRoad(notes, roadName)));
      continue;
    }
    // Anything but a well-formed wild or roaded destination becomes wild.
    let destination: FairyDoorDestination = { kind: 'wild' };
    if (dest.kind === 'roaded' && asText(dest.pairedDoorId)) {
      destination = withExtraFields<FairyDoorDestination>({ kind: 'roaded', pairedDoorId: asText(dest.pairedDoorId), roadName }, dest);
    } else {
      if (dest.kind === 'wild') destination = withExtraFields<FairyDoorDestination>({ kind: 'wild' }, dest);
      notes = withLostRoad(notes, roadName);
    }
    doors.push(withExtraFields({ id: uniqueId(d.id), hex: d.hex, name, notes, destination }, d));
  }
  // A roaded door whose partner doesn't link back (partner wild, pointing
  // elsewhere, missing, or the door itself) becomes wild, keeping its road
  // name in its notes. Checks read the doors as they were, so order is
  // irrelevant.
  const byId = new Map(doors.map((d) => [d.id, d]));
  md.fairyDoors = doors.map((d): FairyDoor => {
    if (d.destination.kind !== 'roaded') return d;
    const partner = byId.get(d.destination.pairedDoorId);
    const linked = partner !== undefined && partner !== d
      && partner.destination.kind === 'roaded' && partner.destination.pairedDoorId === d.id;
    return linked ? d : { ...d, notes: withLostRoad(d.notes, d.destination.roadName), destination: { kind: 'wild' } };
  });

  const leyLines: LeyLine[] = [];
  for (const raw of items('leyLines')) {
    if (!isPlainObject(raw)) { keepText(raw); continue; }
    const l = raw as Record<string, unknown>;
    const name = asText(l.name);
    const type = asText(l.type);
    const notes = asText(l.notes);
    // A kind that isn't valid comes from the type, as in the v14 → v15 migration.
    const kind: PathKind = isPathKind(l.kind) ? l.kind : pathKindFromType(type);
    const color = typeof l.color === 'string' && HEX_COLOR_RE.test(l.color) ? l.color : LEY_LINE_COLORS[0];
    const allHexes = list(l.hexes);
    const hexes = allHexes.filter(isValidHex);
    const off = allHexes.filter((h) => !isValidHex(h)).map(asText).filter(Boolean);
    const label = `${type || DEFAULT_LEY_LINE_TYPE} ${name || 'Unnamed'}`;
    // Any other path needs 2 hexes to be drawn. A ley line is recorded as
    // it's found, so it keeps the hexes it has, however few.
    if (kind !== 'leyLine' && hexes.length < 2) {
      const route = Array.isArray(l.hexes) ? allHexes.map(asText).filter(Boolean).join(' → ') : nonItemText(l.hexes);
      lost.push(`${label}${route ? ` (hexes ${route})` : ''}${notes ? `: ${notes}` : ''}`);
      continue;
    }
    if (off.length > 0) lost.push(`${label}: hexes ${off.join(', ')} left out (not on the map)`);
    const notAList = Array.isArray(l.hexes) ? '' : nonItemText(l.hexes);
    if (notAList) lost.push(`${label}: hexes ${notAList} left out (not a list of hexes)`);
    // A spell that isn't well formed is removed: the line's spell isn't known.
    const spell = sanitizeSpellRef(l.spell);
    const line: LeyLine = withExtraFields({ id: uniqueId(l.id), kind, type, name, color, hexes, notes, ...(spell ? { spell } : {}) }, l);
    if (!spell) delete line.spell;
    leyLines.push(line);
  }
  md.leyLines = leyLines;

  // The in-progress draft only needs a sane shape; a draft with no hexes yet
  // is normal (the player clicked Draw Ley Line and hasn't picked any).
  if (isPlainObject(md.draftLeyLine)) {
    const dft = md.draftLeyLine as Record<string, unknown>;
    const type = asText(dft.type);
    md.draftLeyLine = withExtraFields({
      name: asText(dft.name),
      type,
      color: typeof dft.color === 'string' && HEX_COLOR_RE.test(dft.color) ? dft.color : LEY_LINE_COLORS[0],
      notes: asText(dft.notes),
      hexes: list(dft.hexes).filter(isValidHex),
      kind: isPathKind(dft.kind) ? dft.kind : pathKindFromType(type),
    }, dft);
  } else {
    keepText(md.draftLeyLine);
    delete md.draftLeyLine;
  }

  // currentLocationHex lives on the character, but its check belongs with
  // the other hex references: anything but a hex on the map becomes ''.
  if (!isValidHex(data.currentLocationHex)) data.currentLocationHex = '';
}

/**
 * Index just past the JSON array that `text` starts with (after optional
 * whitespace), or -1 if it doesn't start with a complete array.
 */
function endOfLeadingJsonArray(text: string): number {
  let i = 0;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== '[') return -1;
  let depth = 0;
  let inString = false;
  for (; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === '[' || c === '{') {
      depth++;
    } else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Hex under a pre-v13 map pin. The old map stored each pin's position as x/y
 * percentages (0–100) of the printed map image (now scripts/dolmenwood-map.png).
 * hex-grid.json was extracted from that same image, so percentage × image
 * size is a point in pixelToHex's pixel space. Returns null when the position
 * is missing or out of range, or isn't on a hex of the current grid.
 */
function legacyPinPositionToHex(x: unknown, y: unknown): HexCoord | null {
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x > 100 || y < 0 || y > 100) return null;
  return pixelToHex((x / 100) * HEX_GRID_META.imageWidth, (y / 100) * HEX_GRID_META.imageHeight);
}

/**
 * Convert pins saved by the pre-v13 map, a <!--MAP_PINS--> marker followed by
 * a JSON array in otherNotes, into POIs, which it returns for sanitizeMapData
 * to add. Each pin goes on the hex typed into the old "Hex #" field if that's
 * a hex on the map, otherwise on the hex under its position (keeping the
 * typed text in the POI's notes); pins that fit neither are described in
 * `lost`. Text after the array is kept.
 *
 * Runs after the migration loop on every load and import, not only in
 * v12 → v13, so a save whose marker had to be repaired by hand still
 * converts when re-imported. A marker not followed by a complete array is
 * left alone so the player can recover it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertLegacyMapPins(data: any, lost: string[]): MapPOI[] {
  const converted: MapPOI[] = [];
  for (;;) { // a save can hold more than one marker
    if (typeof data.otherNotes !== 'string') return converted;
    const notes: string = data.otherNotes;
    const idx = notes.indexOf(MAP_PINS_MARKER);
    if (idx === -1) return converted;
    const rest = notes.slice(idx + MAP_PINS_MARKER.length);
    const end = endOfLeadingJsonArray(rest);
    if (end === -1) return converted;
    let pins: unknown;
    try {
      pins = JSON.parse(rest.slice(0, end));
    } catch {
      return converted;
    }
    if (!Array.isArray(pins)) return converted;
    // Every pin below becomes a POI or a `lost` entry, so stripping the
    // marker and its JSON loses nothing.
    data.otherNotes = [notes.slice(0, idx).trimEnd(), rest.slice(end).trim()].filter(Boolean).join('\n');

    for (const raw of pins) {
      if (!isPlainObject(raw)) {
        const t = nonItemText(raw);
        if (t) lost.push(t);
        continue;
      }
      const pin = raw as Record<string, unknown>;
      const label = asText(pin.label);
      const typedHex = asText(pin.hex).trim();
      // Users typed things like "303" expecting the canonical 4-digit form.
      const padded = /^\d{1,4}$/.test(typedHex) ? typedHex.padStart(4, '0') : '';
      const typedIsHex = isValidHex(padded);
      const hex = typedIsHex ? padded : legacyPinPositionToHex(pin.x, pin.y);
      if (hex === null) {
        if (label || typedHex) lost.push(typedHex ? `${label || 'Marker'} (Hex ${typedHex})` : label);
        continue;
      }
      converted.push({
        id: asText(pin.id), // made unique by sanitizeMapData
        hex,
        name: label || 'Marker',
        notes: !typedIsHex && typedHex ? `Old map hex: ${typedHex}` : '',
      });
      if (pin.isCurrentLocation === true) data.currentLocationHex = hex;
    }
  }
}

/**
 * Give journal entries their hex (JournalEntry.hex): the map hex each was
 * written in. Saves from before this version never recorded it, and it isn't
 * guessed from the free-text location, with one exception: a location that
 * is exactly a hex id on the map, such as "0606", can only mean that hex, so
 * it's carried over (the location stays as it is). Anything looser ("Hex
 * 0606", "606", "near 0606") is left alone, and the entry gets no hex.
 *
 * A hex already on an entry could only be there by a hand edit; it stays if
 * it's on the map, like one in a current save (see sanitizeJournalEntries),
 * and is otherwise removed. Running this twice changes nothing more.
 *
 * Kept self-contained (no version numbers inside) so it can be renumbered
 * if another schema bump lands first.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateAddJournalHexes(data: any): any {
  if (!Array.isArray(data.journalEntries)) return data; // repaired after the migrations
  for (const entry of data.journalEntries) {
    if (!isPlainObject(entry) || isValidHex(entry.hex)) continue;
    if (isValidHex(entry.location)) entry.hex = entry.location;
    else delete entry.hex;
  }
  return data;
}

/**
 * Give every path on the map, and the one being drawn, a kind (PathKind).
 * Until this version a path had only its free-text type, so the kind comes
 * from that (pathKindFromType): a type that names a ley line, or a blank one,
 * which the map shows as "Ley line", makes a ley line; anything else (a road,
 * a ward) makes another path. A valid kind already there could only be there
 * by a hand edit, and stays. Values of the wrong shape are left for
 * sanitizeMapData, which gives the paths it keeps a kind the same way.
 *
 * Kept self-contained (no version numbers inside) so it can be renumbered
 * if another schema bump lands first.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateAddPathKinds(data: any): any {
  if (!isPlainObject(data.mapData)) return data;
  const { leyLines, draftLeyLine } = data.mapData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addKind = (path: any) => {
    if (isPlainObject(path) && !isPathKind(path.kind)) path.kind = pathKindFromType(asText(path.type));
  };
  if (Array.isArray(leyLines)) leyLines.forEach(addKind);
  addKind(draftLeyLine);
  return data;
}

/**
 * Start the character's list of NPCs, empty. A list already there could only
 * be there by a hand edit; sanitizeNpcs repairs it.
 *
 * Kept self-contained (no version numbers inside) so it can be renumbered
 * if another schema bump lands first.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateAddNpcs(data: any): any {
  if (data.npcs === undefined) data.npcs = [];
  return data;
}

/**
 * Repair journal entries on a partially-trusted save (hand-edited imports
 * skip the migration loop). Runs after the migrations on every load and
 * import, and after sanitizeCharacterDates has made the journal a list of
 * objects:
 *   - every entry has an id of its own, a non-empty string. The Journal tab
 *     lists, edits and deletes entries by id, so a missing or repeated one is
 *     replaced; nothing else refers to an entry's id;
 *   - its text and location are strings, which the journal and editing a
 *     return date (planReturnEdit) rely on. Anything else keeps the text it
 *     holds, as nonItemText writes it: a number as written, a list or object
 *     as JSON, and nothing for null;
 *   - its hex is a hex on the map, or it has none. No hex is ever guessed
 *     here, so an entry whose hex the player cleared stays without one;
 *   - the NPCs it's about (npcIds) are a list of ids, each once. An id is
 *     text, as NPC ids are (sanitizeNpcs), so a number counts as its digits;
 *     anything else is dropped, and a list left empty is removed. An id whose
 *     NPC is gone is kept: it names no one.
 * Nothing else about an entry changes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeJournalEntries(data: any): void {
  if (!Array.isArray(data.journalEntries)) return;
  const ids = new Set<string>();
  for (const entry of data.journalEntries) {
    if (!isPlainObject(entry)) continue;
    let id = typeof entry.id === 'string' ? entry.id : '';
    while (id === '' || ids.has(id)) id = newId();
    entry.id = id;
    ids.add(id);
    if (typeof entry.text !== 'string') entry.text = nonItemText(entry.text);
    if (typeof entry.location !== 'string') entry.location = nonItemText(entry.location);
    if (entry.hex !== undefined && !isValidHex(entry.hex)) delete entry.hex;
    if (Object.hasOwn(entry, 'npcIds')) {
      const npcIds = Array.isArray(entry.npcIds) ? [...new Set(entry.npcIds.map(asText).filter(Boolean))] : [];
      if (npcIds.length > 0) entry.npcIds = npcIds;
      else delete entry.npcIds;
    }
  }
}

/**
 * Repair what loading checks on inventory items, equipped and stowed: for
 * now, a Dwemer shard's state (InventoryItem.shard), which every item of kind
 * 'shard' gets, so the shard's UI can rely on it. Every other item, and every
 * other field, is left as it is. Runs after the migrations on every load and
 * import.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeInventoryItems(data: any): void {
  for (const items of [data.equippedItems, data.stowedItems]) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (isPlainObject(item) && item.kind === 'shard') item.shard = sanitizeShard(item.shard);
    }
  }
}

/**
 * A Dwemer shard's state, repaired: whole numbers of casts (at least 1 a
 * charge; none or more left, which may be more than a charge gives), and a
 * spell and a ley line only if they're well formed. A ley line that has since
 * been deleted keeps its id. A state that isn't an object becomes an
 * uncharged shard that holds no known spell.
 */
function sanitizeShard(value: unknown): ShardState {
  const s = (isPlainObject(value) ? value : {}) as Record<string, unknown>;
  const spell = sanitizeSpellRef(s.spell);
  const leyLineId = asText(s.leyLineId);
  const shard: ShardState = withExtraFields({
    ...(spell ? { spell } : {}),
    castsLeft: wholeAtLeast(s.castsLeft, 0, 0),
    castsPerCharge: wholeAtLeast(s.castsPerCharge, 1, 1),
    ...(leyLineId ? { leyLineId } : {}),
  }, s);
  if (!spell) delete shard.spell;
  if (!leyLineId) delete shard.leyLineId;
  return shard;
}

/**
 * Repair the character's NPCs on a partially-trusted save. Runs after the
 * migrations on every load and import:
 *   - the NPCs are a list. A value that isn't one becomes a list holding just
 *     that value if it holds any text (one NPC saved without its list, say),
 *     or an empty list if it doesn't;
 *   - every NPC is an object. An entry that isn't one, but holds text,
 *     becomes an NPC named with that text; one with no text is dropped;
 *   - every NPC has an id of its own, as text (journal entries name NPCs by
 *     id); its name, affiliation, location and goals are text, and anything
 *     else keeps the text it holds, as nonItemText writes it, like a journal
 *     entry's text; its hex is a hex on the map, or it has none;
 *   - its quests are repaired the same way: a list of { id, text, done }, each
 *     with an id of its own among that NPC's quests, done only if it's true.
 * Fields this doesn't know about are kept.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeNpcs(data: any): void {
  if (data.npcs === undefined) return; // reconcileWithDefaults adds an empty list
  const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : holdsText(v) ? [v] : []);
  const text = (v: unknown): string => (typeof v === 'string' ? v : nonItemText(v));
  // An entry with text but no object around it: an object holding that text in `key`.
  const asObject = (v: unknown, key: string): Record<string, unknown> | null => {
    if (isPlainObject(v)) return v as Record<string, unknown>;
    return holdsText(v) ? { [key]: v } : null;
  };
  const npcIds = new Set<string>();
  const npcs: Npc[] = [];
  for (const raw of asList(data.npcs)) {
    const n = asObject(raw, 'name');
    if (!n) continue;
    const questIds = new Set<string>();
    const quests: NpcQuest[] = [];
    for (const rawQuest of asList(n.quests)) {
      const q = asObject(rawQuest, 'text');
      if (q) quests.push(withExtraFields({ id: uniqueIn(questIds, q.id), text: text(q.text), done: q.done === true }, q));
    }
    const hex = isValidHex(n.hex) ? n.hex : undefined;
    const npc: Npc = withExtraFields({
      id: uniqueIn(npcIds, n.id),
      name: text(n.name),
      affiliation: text(n.affiliation),
      location: text(n.location),
      ...(hex ? { hex } : {}),
      goals: text(n.goals),
      quests,
    }, n);
    if (!hex) delete npc.hex;
    npcs.push(npc);
  }
  data.npcs = npcs;
}

/** Append `lost` to otherNotes under LOST_ITEMS_HEADING. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function keepLostMapItems(data: any, lost: string[]): void {
  if (lost.length === 0) return;
  // One "- " entry per item; continuation lines are indented. A marker
  // inside an entry is defused so a later load can't treat it as pins.
  const entries = lost.map((s) => `- ${s.split(MAP_PINS_MARKER).join('<!--MAP PINS-->').replace(/\n/g, '\n  ')}`);
  const block = `${LOST_ITEMS_HEADING}\n${entries.join('\n')}`;
  const notes = asText(data.otherNotes).trimEnd();
  data.otherNotes = notes ? `${notes}\n\n${block}` : block;
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
  // v12 -> v13: Structured hex-map data. Adds mapData + currentLocationHex.
  // Pins from the old map (the <!--MAP_PINS--> marker in otherNotes) are
  // converted after the migration loop, by convertLegacyMapPins, so that a
  // save whose marker was repaired by hand still converts on re-import.
  // Values of the wrong shape are left for sanitizeMapData, which keeps any
  // text they hold.
  12: (data) => {
    if (data.mapData === undefined) data.mapData = { pois: [], fairyDoors: [], leyLines: [] };
    if (data.currentLocationHex === undefined) data.currentLocationHex = '';
    return data;
  },
  // v13 -> v14: Journal entries record the hex they were written in. Old
  // entries get none, unless their location is exactly a hex id on the map.
  13: migrateAddJournalHexes,
  // v14 -> v15: Fields for the next features. Paths on the map get a kind (a
  // ley line or another path), worked out from their type, and characters a
  // list of NPCs. The other new fields are optional, so old saves need
  // nothing: a POI's kind (absent: the plain marker), a ley line's spell
  // (absent: not learned yet), a Dwemer shard's state, and the NPCs a
  // journal entry is about.
  14: (data) => migrateAddNpcs(migrateAddPathKinds(data)),
};

/**
 * The versions that have a migration to the next one, in order. Exported for
 * migrations.test.ts, which checks that they run without a gap from 1 to
 * CURRENT_SCHEMA_VERSION - 1: two branches that each add a migration can
 * merge without a conflict on the version line and leave it one too low.
 */
export const MIGRATION_VERSIONS: readonly number[] = Object.freeze(
  Object.keys(migrations).map(Number).sort((a, b) => a - b),
);

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
  // Characters saved before versioning have no schemaVersion field. Some old
  // saves have it as a string of digits ("10"): that's version 10. Left as a
  // string, "10" + 1 would be "101" after the first migration, ending the
  // loop with the rest of the migrations skipped.
  data.schemaVersion = data.schemaVersion === undefined ? 1 : readSchemaVersion(data.schemaVersion);

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
  // JSON import that smuggles in non-numeric date fields, a malformed
  // mapData shape, journal entries with a repeated id, text that isn't
  // a string or a hex that isn't on the map, a malformed Dwemer shard, or
  // NPCs of the wrong shape gets cleaned before downstream code tries to
  // use it.
  // reconcileWithDefaults only fills MISSING top-level keys; deeper
  // shape repair has to happen here. Old-map pins are converted first so
  // the map sanitizer also normalizes (and de-duplicates) the new POIs;
  // map items that can't be kept end up listed in otherNotes.
  //
  // Call order: sanitizers run BEFORE reconcileWithDefaults. This is safe
  // because reconcileWithDefaults's object-merge branch only fills
  // subkeys when the saved value is `undefined`; the arrays/objects
  // populated by sanitizers above are never undefined, so reconcile
  // won't overwrite them.
  sanitizeCharacterDates(data);
  sanitizeFairyTime(data);
  const lostMapItems: string[] = [];
  const legacyPois = convertLegacyMapPins(data, lostMapItems);
  sanitizeMapData(data, lostMapItems, legacyPois);
  keepLostMapItems(data, lostMapItems);
  sanitizeJournalEntries(data);
  sanitizeInventoryItems(data);
  sanitizeNpcs(data);

  return reconcileWithDefaults(data) as Character;
}
