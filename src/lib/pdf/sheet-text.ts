/**
 * Which of the character's text the printable sheet may print: what
 * `sheetText` collects, for choosing which fonts to load (pdf/fonts.ts).
 *
 * It lives apart from CharacterSheetDocument.tsx so that it can be tested with
 * `npm test`, which runs in Node: that file imports @react-pdf/renderer, which
 * Node can't load. Nothing here may import React or react-pdf.
 */
import type { Character } from '@/lib/types';

// Fields the sheet leaves out: the Combat, Magic and Other notes, spell
// study, the journal, the NPCs, the party's location and the map. Typed as
// Character's keys, so that renaming or removing one of them fails the
// typecheck.
const UNPRINTED_FIELDS: ReadonlySet<string> = new Set<keyof Character>([
  'combatTalents',
  'otherNotes',
  'spellNotes',
  'spellStudy',
  'failedStudies',
  'journalEntries',
  'npcs',
  'currentLocation',
  'currentLocationHex',
  'mapData',
]);

/**
 * A Dwemer shard's state, recognised by the two whole numbers every one has.
 * Only an inventory item holds a `shard` key, so this is a guard against a
 * future field of that name rather than a real ambiguity.
 */
function isShardState(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const s = value as Record<string, unknown>;
  return typeof s.castsLeft === 'number' && typeof s.castsPerCharge === 'number';
}

/** All the character's text the sheet may print, for choosing which fonts to load. */
export function sheetText(c: Character): string {
  // Known spells print without their notes.
  const printed = { ...c, knownSpells: c.knownSpells.map((spell) => spell.name) };
  return JSON.stringify(printed, (key, value) => {
    if (UNPRINTED_FIELDS.has(key)) return undefined;
    // A shard's name, the spell it holds and its casts all print
    // (CharacterSheetDocument.tsx), so the fonts have to cover them. The ley line
    // it was charged on does not: that name lives in the map, which the sheet
    // leaves out, so the id points at text the sheet never sets.
    if (key === 'shard' && isShardState(value)) {
      const { leyLineId: _drop, ...rest } = value;
      return rest;
    }
    return value;
  });
}
