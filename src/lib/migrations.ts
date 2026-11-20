import type { Character, FairyDoor, FairyDoorDestination, HexCoord, LeyLine, MapPOI } from './types';
import { createDefaultCharacter, MONTHS } from './gamedata';
import { HEX_GRID_META } from './hex-grid';
import { isValidHex, pixelToHex } from './hex';
import { DEFAULT_LEY_LINE_TYPE, LEY_LINE_COLORS } from './map-data';

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

const MAP_PINS_MARKER = '<!--MAP_PINS-->';
// Heading of the list, appended to otherNotes, of map items that couldn't be
// kept on the map (legacy pins with no usable position, items on hexes that
// aren't on the printed map), so nothing the player wrote is thrown away.
const LOST_ITEMS_HEADING = "Map markers that couldn't be placed:";
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

function newMapId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `map-${Math.random().toString(36).slice(2)}`;
}

/** A text field read defensively: strings as is, finite numbers as text, anything else ''. */
function asText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
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

/**
 * Repair `mapData` and `currentLocationHex` on a partially-trusted save
 * (hand-edited imports, saves made on an older grid). Runs after the
 * migration loop on every load and import, so it must be idempotent.
 * Every element is normalized to the shape the map UI relies on, ids are
 * made unique, and items that can't stay on the map are described in `lost`
 * (kept in Other Notes) instead of being deleted.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeMapData(data: any, lost: string[]): void {
  if (!isPlainObject(data.mapData)) data.mapData = {};
  const md = data.mapData as Record<string, unknown>;
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  // Non-object entries aren't map items; keep any text they carry.
  const keepText = (v: unknown) => {
    const t = asText(v).trim();
    if (t) lost.push(t);
  };
  // Ids must be unique across POIs, doors and ley lines: the UI keys,
  // focuses, edits and deletes items by id.
  const usedIds = new Set<string>();
  const uniqueId = (raw: unknown): string => {
    let id = asText(raw);
    while (!id || usedIds.has(id)) id = newMapId();
    usedIds.add(id);
    return id;
  };

  const pois: MapPOI[] = [];
  for (const raw of list(md.pois)) {
    if (!isPlainObject(raw)) { keepText(raw); continue; }
    const p = raw as Record<string, unknown>;
    const name = asText(p.name);
    const notes = asText(p.notes);
    if (!isValidHex(p.hex)) {
      lost.push(lostItem(name || 'Unnamed point of interest', asText(p.hex), notes));
      continue;
    }
    pois.push({ id: uniqueId(p.id), hex: p.hex, name, notes });
  }
  md.pois = pois;

  const doors: FairyDoor[] = [];
  for (const raw of list(md.fairyDoors)) {
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
      destination = { kind: 'roaded', pairedDoorId: asText(dest.pairedDoorId), roadName };
    } else {
      notes = withLostRoad(notes, roadName);
    }
    doors.push({ id: uniqueId(d.id), hex: d.hex, name, notes, destination });
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
  for (const raw of list(md.leyLines)) {
    if (!isPlainObject(raw)) { keepText(raw); continue; }
    const l = raw as Record<string, unknown>;
    const name = asText(l.name);
    const type = asText(l.type);
    const notes = asText(l.notes);
    const color = typeof l.color === 'string' && HEX_COLOR_RE.test(l.color) ? l.color : LEY_LINE_COLORS[0];
    const allHexes = list(l.hexes);
    const hexes = allHexes.filter(isValidHex);
    const off = allHexes.filter((h) => !isValidHex(h)).map(asText).filter(Boolean);
    const label = `${type || DEFAULT_LEY_LINE_TYPE} ${name || 'Unnamed'}`;
    if (hexes.length < 2) {
      const route = allHexes.map(asText).filter(Boolean).join(' → ');
      lost.push(`${label}${route ? ` (hexes ${route})` : ''}${notes ? `: ${notes}` : ''}`);
      continue;
    }
    if (off.length > 0) lost.push(`${label}: hexes ${off.join(', ')} left out (not on the map)`);
    leyLines.push({ id: uniqueId(l.id), type, name, color, hexes, notes });
  }
  md.leyLines = leyLines;

  // The in-progress draft only needs a sane shape; a draft with no hexes yet
  // is normal (the player clicked Draw Ley Line and hasn't picked any).
  if (isPlainObject(md.draftLeyLine)) {
    const dft = md.draftLeyLine as Record<string, unknown>;
    md.draftLeyLine = {
      name: asText(dft.name),
      type: asText(dft.type),
      color: typeof dft.color === 'string' && HEX_COLOR_RE.test(dft.color) ? dft.color : LEY_LINE_COLORS[0],
      notes: asText(dft.notes),
      hexes: list(dft.hexes).filter(isValidHex),
    };
  } else {
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
 * Hex under a pre-v12 map pin. The old map stored each pin's position as x/y
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
 * Convert pins saved by the pre-v12 map, a <!--MAP_PINS--> marker followed by
 * a JSON array in otherNotes, into POIs. Each pin goes on the hex typed into
 * the old "Hex #" field if that's a hex on the map, otherwise on the hex
 * under its position (keeping the typed text in the POI's notes); pins that
 * fit neither are described in `lost`. Text after the array is kept.
 *
 * Runs after the migration loop on every load and import, not only in
 * v11 → v12, so a save whose marker had to be repaired by hand still
 * converts when re-imported. A marker not followed by a complete array is
 * left alone so the player can recover it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertLegacyMapPins(data: any, lost: string[]): void {
  for (;;) { // a save can hold more than one marker
    if (typeof data.otherNotes !== 'string') return;
    const notes: string = data.otherNotes;
    const idx = notes.indexOf(MAP_PINS_MARKER);
    if (idx === -1) return;
    const rest = notes.slice(idx + MAP_PINS_MARKER.length);
    const end = endOfLeadingJsonArray(rest);
    if (end === -1) return;
    let pins: unknown;
    try {
      pins = JSON.parse(rest.slice(0, end));
    } catch {
      return;
    }
    if (!Array.isArray(pins)) return;
    // Every pin below becomes a POI or a `lost` entry, so stripping the
    // marker and its JSON loses nothing.
    data.otherNotes = [notes.slice(0, idx).trimEnd(), rest.slice(end).trim()].filter(Boolean).join('\n');
    if (!isPlainObject(data.mapData)) data.mapData = {};
    if (!Array.isArray(data.mapData.pois)) data.mapData.pois = [];

    for (const raw of pins) {
      if (!isPlainObject(raw)) {
        const t = asText(raw).trim();
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
      data.mapData.pois.push({
        id: asText(pin.id), // made unique by sanitizeMapData
        hex,
        name: label || 'Marker',
        notes: !typedIsHex && typedHex ? `Old map hex: ${typedHex}` : '',
      });
      if (pin.isCurrentLocation === true) data.currentLocationHex = hex;
    }
  }
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
  // v11 -> v12: Structured hex-map data. Adds mapData + currentLocationHex.
  // Pins from the old map (the <!--MAP_PINS--> marker in otherNotes) are
  // converted after the migration loop, by convertLegacyMapPins, so that a
  // save whose marker was repaired by hand still converts on re-import.
  11: (data) => {
    if (!isPlainObject(data.mapData)) data.mapData = { pois: [], fairyDoors: [], leyLines: [] };
    if (typeof data.currentLocationHex !== 'string') data.currentLocationHex = '';
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
  const lostMapItems: string[] = [];
  convertLegacyMapPins(data, lostMapItems);
  sanitizeMapData(data, lostMapItems);
  keepLostMapItems(data, lostMapItems);

  return reconcileWithDefaults(data) as Character;
}
