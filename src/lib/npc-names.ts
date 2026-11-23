// How an NPC is named in text. Both the NPCs tab (src/lib/npcs.ts) and the
// Journal (src/lib/journal.ts) need it: the NPCs tab to name an NPC in a
// sentence and to count whose cards an entry is on, the Journal to show and
// search the "About" line that says which NPCs an entry is about
// (JournalEntry.npcIds). It lives on its own because neither of those may
// import the other: the NPCs tab's logic is built on the Journal's.

import type { JournalEntry, Npc } from './types';

/**
 * A text field read defensively: strings as they are, finite numbers as text,
 * anything else as ''. Loading repairs an NPC's fields into strings
 * (sanitizeNpcs), so this only matters for data written since, but a field
 * that held a number would otherwise be drawn as one.
 */
export function npcText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/** What to call an NPC in a sentence: their name, or "Unnamed NPC" while they have none. */
export function npcLabel(npc: Npc): string {
  return npcText(npc.name).trim() || 'Unnamed NPC';
}

/**
 * The NPCs an entry is about, by name, in the order it names them: the
 * entry's npcIds that name an NPC that is still there. An entry naming a
 * deleted NPC names only the rest (the load repair keeps the gone id, as
 * naming no one), and one that names an id twice names them once.
 */
export function entryNpcNames(entry: JournalEntry, npcs: readonly Npc[]): string[] {
  const ids = Array.isArray(entry.npcIds) ? entry.npcIds : [];
  if (ids.length === 0) return [];
  const byId = new Map(npcs.map((npc) => [npc.id, npcLabel(npc)]));
  const names: string[] = [];
  for (const raw of new Set(ids)) {
    const name = byId.get(npcText(raw));
    if (name !== undefined) names.push(name);
  }
  return names;
}

/** Who an entry is about, as both tabs show it after "About:"; '' if it is about no one. */
export function describeEntryNpcs(entry: JournalEntry, npcs: readonly Npc[]): string {
  return entryNpcNames(entry, npcs).join(', ');
}
