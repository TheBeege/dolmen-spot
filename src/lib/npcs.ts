// The NPC tracker's logic, kept apart from its tab
// (src/components/NpcTracker.tsx) so that it can be tested: the NPCs, the
// order they're listed in, the search, the quest checklist, and the journal
// entries that are an NPC's notes.
//
// An NPC's notes are not stored on the NPC. They are the journal entries that
// name it (JournalEntry.npcIds), so a note is dated and located like any other
// entry, shows in the Journal tab too, and one entry can be about several
// NPCs. Two consequences, both deliberate:
//   - deleting an NPC never touches its notes: they stay in the journal, and
//     an entry naming an id whose NPC is gone is kept by the load repair
//     (sanitizeJournalEntries) as it names no one;
//   - a note is deleted exactly as the Journal tab deletes one, by id, from
//     the character's journalEntries: both call withoutEntry (journal.ts), so
//     the two really are the same delete.

import type { Character, HexCoord, JournalEntry, Npc, NpcQuest } from './types';
import { isValidHex } from './hex';
import { newId } from './ids';
import { npcText } from './npc-names';
import {
  createJournalEntry,
  foldForSearch,
  getJournalEntries,
  matchesEveryTerm,
  sortJournalNewestFirst,
  type SearchTerm,
} from './journal';

type WithNpcs = Pick<Character, 'npcs'>;
type WithNotes = Pick<Character, 'journalEntries' | 'fairyVisits'>;

// How an NPC is named in text, which the Journal needs too (npc-names.ts),
// re-exported so that the NPCs tab's callers have one place to import from.
export { entryNpcNames, npcLabel, npcText } from './npc-names';

// ── NPCs ─────────────────────────────────────────────────────────────

/** The character's NPCs; [] if the saved value isn't a list. */
export function getNpcs(character: WithNpcs): Npc[] {
  return Array.isArray(character.npcs) ? character.npcs : [];
}

/** An NPC's quests; [] if the saved value isn't a list. */
export function getNpcQuests(npc: Npc): NpcQuest[] {
  return Array.isArray(npc.quests) ? npc.quests : [];
}

/** An NPC's hex, or '' if their place isn't on the map. */
export function getNpcHex(npc: Npc): HexCoord | '' {
  return isValidHex(npc.hex) ? npc.hex : '';
}

/** A new, empty NPC, for the form that's about to fill one in. */
export function createNpc(): Npc {
  return { id: newId(), name: '', affiliation: '', location: '', goals: '', quests: [] };
}

/** `npcs` with `npc` at the end, the place a new one is saved in. */
export function addNpc(npcs: readonly Npc[], npc: Npc): Npc[] {
  return [...npcs, npc];
}

/** `npcs` with the NPC `id` replaced by what `change` makes of it; the rest untouched. */
export function changeNpc(npcs: readonly Npc[], id: string, change: (npc: Npc) => Npc): Npc[] {
  return npcs.map((npc) => (npc.id === id ? change(npc) : npc));
}

/**
 * `npcs` without the NPC `id`. Nothing else changes: their notes are journal
 * entries and stay in the journal (see the top of this file).
 */
export function deleteNpc(npcs: readonly Npc[], id: string): Npc[] {
  return npcs.filter((npc) => npc.id !== id);
}

/** `npc` with their hex set to `hex`, or with no hex at all if `hex` is ''. */
export function withNpcHex(npc: Npc, hex: HexCoord | ''): Npc {
  const { hex: _old, ...rest } = npc;
  return hex ? { ...rest, hex } : rest;
}

// ── Order ────────────────────────────────────────────────────────────
//
// NPCs are listed by name, folded as search folds text (foldForSearch), so
// that "Élora" sorts with the E's and case doesn't decide the order. Two with
// the same name are ordered by affiliation, and any still tied keep the order
// they were saved in, which is the order they were added. An NPC with no name
// yet goes last: it's one being filled in, not one to look up.

function compareFolded(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

function sortKey(npc: Npc): [number, string, string] {
  const name = npcText(npc.name).trim();
  return [name === '' ? 1 : 0, foldForSearch(name), foldForSearch(npcText(npc.affiliation))];
}

/** `npcs` in the order the tab lists them (see "Order" above). */
export function sortNpcs(npcs: readonly Npc[]): Npc[] {
  return npcs
    .map((npc, saved) => ({ npc, saved, key: sortKey(npc) }))
    .sort(
      (a, b) =>
        a.key[0] - b.key[0] || compareFolded(a.key[1], b.key[1]) || compareFolded(a.key[2], b.key[2]) || a.saved - b.saved,
    )
    .map(({ npc }) => npc);
}

// ── Search ───────────────────────────────────────────────────────────
//
// An NPC is searched by their name, their affiliation, where they are, their
// hex ("Hex 0606"), their goals, their quests and the text of the notes
// written about them. The notes' own dates and places are not searched: they
// are the entries', and the Journal searches those. The terms are the
// Journal's (parseJournalQuery), so a search means the same thing in both
// tabs: words, "a phrase in quotes", accents and case folded, a number matched
// whole. Every term has to be somewhere in the NPC.

const NO_NOTES: readonly JournalEntry[] = [];

/**
 * The text an NPC is searched by (see "Search" above), one part a line.
 * `notes` are their notes (notesByNpc), so that they're found by what was
 * written about them: an entry's text, which is what its card shows.
 */
export function npcSearchText(npc: Npc, notes: readonly JournalEntry[] = NO_NOTES): string {
  const hex = getNpcHex(npc);
  return [
    npcText(npc.name),
    npcText(npc.affiliation),
    npcText(npc.location),
    hex ? `Hex ${hex}` : '',
    npcText(npc.goals),
    ...getNpcQuests(npc).map((quest) => npcText(quest.text)),
    ...notes.map((entry) => npcText(entry.text)),
  ]
    .filter(Boolean)
    .join('\n');
}

/** Whether every term of a search (parseJournalQuery) is somewhere in the NPC or their notes. */
export function matchesNpcSearch(
  npc: Npc,
  terms: readonly SearchTerm[],
  notes: readonly JournalEntry[] = NO_NOTES,
): boolean {
  return matchesEveryTerm(npcSearchText(npc, notes), terms);
}

interface NpcList {
  items: Npc[];     // in the order the tab lists them
  matching: number; // NPCs that pass the search
  total: number;
}

const NO_KEPT: ReadonlySet<string> = new Set();
const NO_NOTES_BY_NPC: ReadonlyMap<string, readonly JournalEntry[]> = new Map();

/**
 * The NPCs to list, in order: those that match every term of the search, plus
 * those in `keep` (an NPC being edited, which mustn't vanish from under the
 * form while the search changes). `notes` is notesByNpc, so a note's text
 * finds the NPC it's about.
 */
export function listNpcs(
  npcs: readonly Npc[],
  terms: readonly SearchTerm[],
  keep: ReadonlySet<string> = NO_KEPT,
  notes: ReadonlyMap<string, readonly JournalEntry[]> = NO_NOTES_BY_NPC,
): NpcList {
  const items: Npc[] = [];
  let matching = 0;
  for (const npc of sortNpcs(npcs)) {
    const matches = matchesNpcSearch(npc, terms, notes.get(npc.id) ?? NO_NOTES);
    if (matches) matching += 1;
    if (matches || keep.has(npc.id)) items.push(npc);
  }
  return { items, matching, total: npcs.length };
}

const MAX_SHOWN_QUERY = 60;
const DOUBLE_QUOTES = /["“”„‟]/;
const formatCount = (n: number) => n.toLocaleString('en-US');

/**
 * One line saying what the list shows, such as "3 NPCs" or "1 of 3 NPCs match
 * “ysolde”". `query` is the search as typed; one with quotes of its own is
 * shown as it is. The verb agrees with the count it follows, so a list of one
 * reads "1 of 1 NPC matches".
 */
export function describeNpcList(list: Pick<NpcList, 'matching' | 'total'>, query: string): string {
  const { matching, total } = list;
  if (total === 0) return 'No NPCs yet.';
  const npcs = `${formatCount(total)} ${total === 1 ? 'NPC' : 'NPCs'}`;
  const typed = query.trim().replace(/\s+/g, ' ');
  if (typed === '') return npcs;
  const chars = Array.from(typed);
  const shown = chars.length > MAX_SHOWN_QUERY ? `${chars.slice(0, MAX_SHOWN_QUERY).join('')}…` : typed;
  return `${formatCount(matching)} of ${npcs} ${total === 1 ? 'matches' : 'match'} ${DOUBLE_QUOTES.test(typed) ? shown : `“${shown}”`}`;
}

// ── Quests ───────────────────────────────────────────────────────────

/** A new quest for `text`, not done yet, with the id its caller minted for it. */
function createQuest(id: string, text: string): NpcQuest {
  return { id, text, done: false };
}

/**
 * `npc` with a quest added for `text`, as `id`, or `npc` itself when the text
 * holds nothing but spaces: an empty quest is nothing to tick off or delete.
 * The id comes from the caller, minted outside the state update that adds the
 * quest, so that running that update twice adds the same quest.
 */
export function addQuest(npc: Npc, text: string, id: string): Npc {
  const trimmed = text.trim();
  if (trimmed === '') return npc;
  return { ...npc, quests: [...getNpcQuests(npc), createQuest(id, trimmed)] };
}

/** `npc` with the quest `questId` ticked off, or unticked. */
export function setQuestDone(npc: Npc, questId: string, done: boolean): Npc {
  return { ...npc, quests: getNpcQuests(npc).map((quest) => (quest.id === questId ? { ...quest, done } : quest)) };
}

/** `npc` without the quest `questId`. */
export function deleteQuest(npc: Npc, questId: string): Npc {
  return { ...npc, quests: getNpcQuests(npc).filter((quest) => quest.id !== questId) };
}

interface QuestCount {
  done: number;
  total: number;
}

/** How many of an NPC's quests are done, and how many there are. */
export function countQuests(npc: Npc): QuestCount {
  const quests = getNpcQuests(npc);
  return { done: quests.filter((quest) => quest.done === true).length, total: quests.length };
}

/** An NPC's quest progress, as the tab shows it: "2 of 3 quests done". */
export function describeQuestCount(npc: Npc): string {
  const { done, total } = countQuests(npc);
  if (total === 0) return 'No quests yet';
  return `${formatCount(done)} of ${formatCount(total)} ${total === 1 ? 'quest' : 'quests'} done`;
}

// ── Notes, which are journal entries ─────────────────────────────────

// Every NPC's notes, grouped once per list of entries and set of visits, as
// the Journal tab caches its sorted list: the tab asks for one or two per NPC,
// and sorting the whole journal again for each would be wasted work whenever
// something else on the character changes.
const notesCache = new WeakMap<readonly JournalEntry[], { visits: unknown; byNpc: Map<string, JournalEntry[]> }>();

/**
 * Every NPC's notes, newest first, keyed by the NPC's id (see "Order" in
 * journal.ts for what newest first means: the order the character lived them).
 * An entry that names several NPCs is one of each one's notes.
 */
export function notesByNpc(character: WithNotes): Map<string, JournalEntry[]> {
  const entries = getJournalEntries(character);
  const cached = notesCache.get(entries);
  if (cached && cached.visits === character.fairyVisits) return cached.byNpc;
  const byNpc = new Map<string, JournalEntry[]>();
  for (const entry of sortJournalNewestFirst(entries, character)) {
    const ids = Array.isArray(entry.npcIds) ? entry.npcIds : [];
    for (const raw of new Set(ids)) {
      const id = npcText(raw);
      if (!id) continue;
      const notes = byNpc.get(id);
      if (notes) notes.push(entry);
      else byNpc.set(id, [entry]);
    }
  }
  notesCache.set(entries, { visits: character.fairyVisits, byNpc });
  return byNpc;
}

/**
 * A new note about `npc`, as a journal entry: dated and placed where the
 * character is now (createJournalEntry, so today in Dolmenwood, or the Fairy
 * day and the visit they're on), and naming them in `npcIds` so it's one of
 * their notes. The journal itself is where all entries are kept.
 */
export function createNpcNote(
  character: Pick<Character, 'fairyVisits' | 'currentDate' | 'currentLocation' | 'currentLocationHex'>,
  npcId: string,
  text: string,
): JournalEntry {
  return { ...createJournalEntry(character), text, npcIds: [npcId] };
}
