// The journal's logic, kept apart from its tab (src/components/Journal.tsx)
// so that it can be tested: new entries, the order entries are listed in,
// search, and the hex filter.

import type { Character, HexCoord, JournalEntry } from './types';
import { getAbsoluteDay } from './gamedata';
import { isValidHex } from './hex';
import {
  formatRecordDate,
  getCurrentPlace,
  getCurrentTimelinePoint,
  getFairyVisits,
  getLivedDayAtDolmenwoodDate,
  getLivedDays,
} from './livedTime';

type WithVisits = Pick<Character, 'fairyVisits'>;

// ── Entries ──────────────────────────────────────────────────────────

/** The character's journal entries, oldest first; [] if the saved value isn't a list. */
export function getJournalEntries(character: Pick<Character, 'journalEntries'>): JournalEntry[] {
  return Array.isArray(character.journalEntries) ? character.journalEntries : [];
}

/** An entry's hex, or '' if it has none on the map. */
export function getEntryHex(entry: JournalEntry): HexCoord | '' {
  return isValidHex(entry.hex) ? entry.hex : '';
}

/**
 * A new, empty entry, stamped with when and where the character is: the
 * date (a Fairy date while in Fairy), the location typed on the Adventuring
 * tab and the map's current hex.
 */
export function createJournalEntry(
  character: Pick<Character, 'fairyVisits' | 'currentDate' | 'currentLocation' | 'currentLocationHex'>,
): JournalEntry {
  const now = getCurrentTimelinePoint(character);
  return {
    id: crypto.randomUUID(),
    date: now.date,
    ...(now.fairyDate ? { fairyDate: now.fairyDate } : {}),
    ...(now.sinceReturnFrom ? { sinceReturnFrom: now.sinceReturnFrom } : {}),
    ...getCurrentPlace(character),
    text: '',
  };
}

/** `entry` with its hex set to `hex`, or with no hex if `hex` is ''. */
export function withEntryHex(entry: JournalEntry, hex: HexCoord | ''): JournalEntry {
  const { hex: _old, ...rest } = entry;
  return hex ? { ...rest, hex } : rest;
}

// A text field read defensively: strings as is, finite numbers as text,
// anything else (only a hand edit could put it there) as ''.
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

// ── Order: newest first, as the character lived them ─────────────────
//
// Entries are listed newest first in the order the character lived them,
// not by Dolmenwood's calendar, which stands still while they're in Fairy
// and jumps when they come back. Each entry is placed on the lived-time
// clock of src/lib/livedTime.ts (days lived since Year 1, day 1, Fairy days
// included):
//   - written in Fairy: the lived day the visit began, plus the Fairy day it
//     was written on. A day the visit never reached (days taken back after
//     writing it) counts as the visit's last day, so nothing written in Fairy
//     is placed after the return;
//   - the app's "Entered Fairy" and "Returned from Fairy" entries: the moment
//     the character stepped into Fairy, and the moment they came back;
//   - written in Dolmenwood: its date, read with the return it was written
//     after (sinceReturnFrom), so that on a return day (even one when no
//     time passed in Dolmenwood) it's placed after the visit
//     (getLivedDayAtDolmenwoodDate).
// An entry the clock can't place exactly falls back to its Dolmenwood date,
// placed on the clock as best it can be: one from before Fairy time was
// tracked whose date is in or after a visit, or one whose Fairy visit no
// longer exists.
//
// Entries on the same lived day are ordered by their Dolmenwood date, which
// only matters for entries placed by date alone (for the others, date order
// and the order they were written in agree), and then newest written first.
// Entries are only ever added to the end of the saved list, so a later
// position means written later. Editing the date of the last return moves
// the entries written since then with it (planReturnEdit), so the order
// stays the same.

interface VisitSpan {
  began: number;        // lived day the character stepped into Fairy
  ended: number | null; // lived day they came back; null while still there
  lastDay: number;      // days lived there, so the last Fairy day is lastDay + 1
}

// Where each Fairy visit sits on the lived-time clock, by visit id.
function visitSpans(character: WithVisits): Map<string, VisitSpan> {
  const visits = getFairyVisits(character);
  const spans = new Map<string, VisitSpan>();
  visits.forEach((visit, k) => {
    if (spans.has(visit.id)) return; // ids are unique once loaded
    const began = getLivedDays({ fairyVisits: visits.slice(0, k), currentDate: visit.enteredOn });
    const lastDay = Number.isFinite(visit.daysInFairy) ? Math.max(0, Math.floor(visit.daysInFairy)) : 0;
    spans.set(visit.id, { began, ended: visit.returnedOn ? began + lastDay : null, lastDay });
  });
  return spans;
}

/**
 * The lived day an entry was written on (see "Order" above). `spans` can be
 * passed in when placing many entries of one character.
 */
export function getEntryLivedDay(entry: JournalEntry, character: WithVisits, spans = visitSpans(character)): number {
  const { fairyDate, fairyEvent } = entry;
  const fairyVisit = fairyDate ? spans.get(fairyDate.visitId) : undefined;
  if (fairyDate && fairyVisit) {
    const day = Number.isFinite(fairyDate.day) ? Math.floor(fairyDate.day) : 1;
    return fairyVisit.began + Math.min(Math.max(0, day - 1), fairyVisit.lastDay);
  }
  const eventVisit = fairyEvent ? spans.get(fairyEvent.visitId) : undefined;
  if (fairyEvent && eventVisit) {
    if (fairyEvent.kind === 'entered') return eventVisit.began;
    if (eventVisit.ended !== null) return eventVisit.ended;
  }
  return getLivedDayAtDolmenwoodDate(character, entry.date, entry.sinceReturnFrom);
}

// Larger first. Numbers that aren't finite (never, for a loaded save) go last.
function compareDescending(a: number, b: number): number {
  const x = Number.isFinite(a) ? a : -Infinity;
  const y = Number.isFinite(b) ? b : -Infinity;
  return x === y ? 0 : x > y ? -1 : 1;
}

/** `entries` newest first (see "Order" above). The saved list keeps its order. */
export function sortJournalNewestFirst(entries: readonly JournalEntry[], character: WithVisits): JournalEntry[] {
  const spans = visitSpans(character);
  return entries
    .map((entry, written) => ({
      entry,
      written,
      livedDay: getEntryLivedDay(entry, character, spans),
      dolmenwoodDay: getAbsoluteDay(entry.date),
    }))
    .sort(
      (a, b) =>
        compareDescending(a.livedDay, b.livedDay) ||
        compareDescending(a.dolmenwoodDay, b.dolmenwoodDay) ||
        b.written - a.written,
    )
    .map(({ entry }) => entry);
}

// ── Hex filter ───────────────────────────────────────────────────────

/** Which entries to list: all of them, those with no hex, or those in one hex. */
export type JournalHexFilter = 'all' | 'none' | HexCoord;

/** A filter from a select's value; anything unknown means all entries. */
export function toJournalHexFilter(value: string): JournalHexFilter {
  return value === 'none' || isValidHex(value) ? value : 'all';
}

export function matchesHexFilter(entry: JournalEntry, filter: JournalHexFilter): boolean {
  if (filter === 'all') return true;
  const hex = getEntryHex(entry);
  return filter === 'none' ? hex === '' : hex === filter;
}

export interface JournalHexCounts {
  byHex: Map<HexCoord, number>; // entries in each hex that has any
  withoutHex: number;
}

export function countEntriesByHex(entries: readonly JournalEntry[]): JournalHexCounts {
  const byHex = new Map<HexCoord, number>();
  let withoutHex = 0;
  for (const entry of entries) {
    const hex = getEntryHex(entry);
    if (hex) byHex.set(hex, (byHex.get(hex) ?? 0) + 1);
    else withoutHex += 1;
  }
  return { byHex, withoutHex };
}

export interface JournalHexFilterOption {
  value: JournalHexFilter;
  label: string;
}

const formatCount = (n: number) => n.toLocaleString('en-US');

/**
 * The hex filter's choices: all entries, entries with no hex, then each hex
 * that has entries, in hex order, with their counts. The selected hex stays
 * listed (with 0) after its last entry leaves it.
 */
export function hexFilterOptions(entries: readonly JournalEntry[], selected: JournalHexFilter): JournalHexFilterOption[] {
  const { byHex, withoutHex } = countEntriesByHex(entries);
  const hexes = [...byHex.keys()];
  if (isValidHex(selected) && !byHex.has(selected)) hexes.push(selected);
  hexes.sort();
  return [
    { value: 'all', label: `All hexes (${formatCount(entries.length)})` },
    { value: 'none', label: `No hex (${formatCount(withoutHex)})` },
    ...hexes.map((hex) => ({ value: hex, label: `Hex ${hex} (${formatCount(byHex.get(hex) ?? 0)})` })),
  ];
}

// ── Search ───────────────────────────────────────────────────────────
//
// Search ignores case and accents: text is compared after folding, which
// splits accented letters into letter and accent (NFKD) and drops the
// accents, lower-cases, and folds the few letters that don't split that way
// (ø, ł, ß, æ...) and curly quotes and dashes, which phones type for
// straight ones. A query is split into words, and an entry matches when
// every word is somewhere in its text, location, hex ("Hex 0606") or date
// as the list shows it ("3 Grimvold (Hayme), Year 1", or "Fairy visit 1,
// day 5 (entered 3 Grimvold, Year 2)"), in any order.

const COMBINING_MARKS = /\p{M}/gu;
const ASCII_ONLY = /^[\x00-\x7f]*$/;
const EXTRA_FOLDS: ReadonlyMap<string, string> = new Map([
  ['ø', 'o'], ['ł', 'l'], ['đ', 'd'], ['ħ', 'h'], ['ŧ', 't'], ['ı', 'i'],
  ['ß', 'ss'], ['æ', 'ae'], ['œ', 'oe'],
  ['‘', "'"], ['’', "'"], ['ʼ', "'"], ['“', '"'], ['”', '"'], ['–', '-'], ['—', '-'],
]);
const foldedChars = new Map<string, string>();

// One character (code point) folded; '' for a lone accent.
function foldChar(ch: string): string {
  if (ch.length === 1 && ch.charCodeAt(0) < 0x80) return ch.toLowerCase();
  let folded = foldedChars.get(ch);
  if (folded === undefined) {
    // Lower-casing can itself add an accent (İ → i̇), so strip twice.
    const lower = ch.normalize('NFKD').replace(COMBINING_MARKS, '').toLowerCase();
    const bare = lower.normalize('NFKD').replace(COMBINING_MARKS, '');
    folded = Array.from(bare, (c) => EXTRA_FOLDS.get(c) ?? c).join('');
    foldedChars.set(ch, folded);
  }
  return folded;
}

/** `text` folded for comparing (see "Search" above). */
export function foldForSearch(text: string): string {
  if (ASCII_ONLY.test(text)) return text.toLowerCase();
  let out = '';
  for (const ch of text) out += foldChar(ch);
  return out;
}

/** The words of a search, folded, without repeats. An empty list means no search. */
export function parseJournalQuery(query: string): string[] {
  return [...new Set(foldForSearch(query).split(/\s+/).filter(Boolean))];
}

/** A stretch of a string, by UTF-16 offsets: `start` up to, not including, `end`. */
export interface TextRange {
  start: number;
  end: number;
}

// For each folded character at `indexes` (ascending), the stretch of `text`
// it came from. An accent typed as a character of its own folds to nothing;
// it counts as part of the character before it, so a match ending on that
// character takes it in.
function sourceSpans(text: string, indexes: readonly number[]): Map<number, TextRange> {
  const spans = new Map<number, TextRange>();
  let k = 0;
  let folded = 0; // folded position of the current character
  let at = 0;
  let previous: TextRange[] = []; // the stretches of the last character that folded to something
  for (const ch of text) {
    const length = foldChar(ch).length;
    if (length === 0) {
      for (const span of previous) span.end = at + ch.length;
    } else {
      if (k >= indexes.length) break;
      previous = [];
      while (k < indexes.length && indexes[k] < folded + length) {
        const span = { start: at, end: at + ch.length };
        spans.set(indexes[k], span);
        previous.push(span);
        k += 1;
      }
    }
    folded += length;
    at += ch.length;
  }
  return spans;
}

// Overlapping or touching ranges joined, in order.
function joinRanges(ranges: TextRange[]): TextRange[] {
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const joined: TextRange[] = [];
  for (const range of ranges) {
    const last = joined[joined.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else joined.push({ ...range });
  }
  return joined;
}

// findMatchRanges, given `text` already folded.
function findMatchRangesIn(text: string, folded: string, words: readonly string[]): TextRange[] {
  const found: TextRange[] = [];
  for (const word of words) {
    for (let at = folded.indexOf(word); at !== -1; at = folded.indexOf(word, at + 1)) {
      found.push({ start: at, end: at + word.length });
    }
  }
  if (found.length === 0) return [];
  const inFolded = joinRanges(found);
  // Folding keeps plain ASCII text the same length, so offsets carry over.
  if (ASCII_ONLY.test(text)) return inFolded;
  const indexes = [...new Set(inFolded.flatMap((r) => [r.start, r.end - 1]))].sort((a, b) => a - b);
  const spans = sourceSpans(text, indexes);
  return joinRanges(inFolded.map((r) => ({ start: spans.get(r.start)!.start, end: spans.get(r.end - 1)!.end })));
}

/**
 * Where the words of a search appear in `text`, in order, with overlapping
 * or touching stretches joined. Offsets are into `text` itself, so an
 * accented letter or a ß is highlighted whole.
 */
export function findMatchRanges(text: string, words: readonly string[]): TextRange[] {
  if (words.length === 0 || text === '') return [];
  return findMatchRangesIn(text, foldForSearch(text), words);
}

/** The text of an entry that search looks in, as the list shows it. */
export interface JournalEntryText {
  date: string;
  location: string;
  hex: string; // "Hex 0606", or '' for none
  text: string;
}

/** Where a search matched in each part of an entry. */
export type JournalEntryMatches = { [K in keyof JournalEntryText]: TextRange[] };

const NO_MATCHES: JournalEntryMatches = Object.freeze({ date: [], location: [], hex: [], text: [] });

// What's worked out about an entry for the list, kept for as long as the
// entry and the character's Fairy visits (which its date reads from) are
// the same objects. Entries are never changed in place: an edit makes a new
// object. So a letter typed into the search, or into one entry, doesn't fold
// every entry's text again, and each entry's card gets the same props, and
// isn't drawn again, unless something about it changed.
interface EntryFacts {
  visits: unknown;
  shown: JournalEntryText;
  folded?: JournalEntryText;
  matches?: { words: readonly string[]; ranges: JournalEntryMatches };
}
const entryFacts = new WeakMap<JournalEntry, EntryFacts>();

function factsOf(entry: JournalEntry, character: WithVisits): EntryFacts {
  const visits = character.fairyVisits;
  let facts = entryFacts.get(entry);
  if (!facts || facts.visits !== visits) {
    const hex = getEntryHex(entry);
    const shown = {
      date: formatRecordDate(character, entry.date, entry.fairyDate),
      location: asText(entry.location),
      hex: hex ? `Hex ${hex}` : '',
      text: asText(entry.text),
    };
    facts = { visits, shown };
    entryFacts.set(entry, facts);
  }
  return facts;
}

function foldedOf(facts: EntryFacts): JournalEntryText {
  const { shown } = facts;
  facts.folded ??= {
    date: foldForSearch(shown.date),
    location: foldForSearch(shown.location),
    hex: foldForSearch(shown.hex),
    text: foldForSearch(shown.text),
  };
  return facts.folded;
}

export function getEntryDisplayText(entry: JournalEntry, character: WithVisits): JournalEntryText {
  return factsOf(entry, character).shown;
}

/** Whether every word of the search (parseJournalQuery) is somewhere in the entry. */
export function matchesSearch(entry: JournalEntry, character: WithVisits, words: readonly string[]): boolean {
  if (words.length === 0) return true;
  const folded = foldedOf(factsOf(entry, character));
  const fields = [folded.text, folded.location, folded.hex, folded.date];
  return words.every((word) => fields.some((field) => field.includes(word)));
}

/**
 * Where the words of a search appear in each part of the entry, for marking
 * them. The same `words` array gives back the same result object.
 */
export function getEntryMatches(entry: JournalEntry, character: WithVisits, words: readonly string[]): JournalEntryMatches {
  if (words.length === 0) return NO_MATCHES;
  const facts = factsOf(entry, character);
  if (facts.matches?.words === words) return facts.matches.ranges;
  const { shown } = facts;
  const folded = foldedOf(facts);
  const ranges = {
    date: findMatchRangesIn(shown.date, folded.date, words),
    location: findMatchRangesIn(shown.location, folded.location, words),
    hex: findMatchRangesIn(shown.hex, folded.hex, words),
    text: findMatchRangesIn(shown.text, folded.text, words),
  };
  facts.matches = { words, ranges };
  return ranges;
}

export interface TextSegment {
  text: string;
  match: boolean;
}

/** `text` from `from` to `to`, cut into the parts that match and the parts that don't. */
export function highlightSegments(
  text: string,
  ranges: readonly TextRange[],
  from = 0,
  to = text.length,
): TextSegment[] {
  const segments: TextSegment[] = [];
  let at = from;
  for (const range of ranges) {
    const start = Math.max(range.start, at);
    const end = Math.min(range.end, to);
    if (end <= start) continue;
    if (start > at) segments.push({ text: text.slice(at, start), match: false });
    segments.push({ text: text.slice(start, end), match: true });
    at = end;
  }
  if (at < to) segments.push({ text: text.slice(at, to), match: false });
  return segments;
}

export interface TextExcerpt {
  start: number; // where in the text it begins
  end: number;   // ...and ends
  segments: TextSegment[];
  cutStart: boolean; // it begins partway through the text
  cutEnd: boolean;   // ...and ends before the text's end
}

const isLowSurrogate = (text: string, i: number) => {
  const code = text.charCodeAt(i);
  return code >= 0xdc00 && code <= 0xdfff;
};

const isSpace = (text: string, i: number) => /\s/.test(text.charAt(i));

// Where an excerpt around a match starting at `matchStart` begins: about
// `context` characters before it, at the start of a word unless there's no
// break before the match, and never between the halves of a character.
function excerptStart(text: string, matchStart: number, context: number): number {
  let start = Math.max(0, matchStart - context);
  if (start > 0 && !isSpace(text, start - 1)) {
    const space = text.slice(start, matchStart).search(/\s/);
    if (space !== -1) start += space + 1;
    else if (isLowSurrogate(text, start)) start -= 1;
  }
  while (start < matchStart && isSpace(text, start)) start += 1;
  return start;
}

// Where it ends: about `context` characters after the match, at the end of a word.
function excerptEnd(text: string, matchEnd: number, context: number): number {
  let end = Math.min(text.length, matchEnd + context);
  if (end < text.length && !isSpace(text, end)) {
    let space = -1;
    for (let i = end - 1; i >= matchEnd; i--) {
      if (isSpace(text, i)) {
        space = i;
        break;
      }
    }
    if (space !== -1) end = space;
    else if (isLowSurrogate(text, end)) end += 1;
  }
  while (end > matchEnd && isSpace(text, end - 1)) end -= 1;
  return end;
}

// Where an excerpt that must stop by `limit` ends: at the last break from
// `from` up to and including `limit`, or at `limit` if there's none.
function lastBreakBy(text: string, from: number, limit: number): number {
  for (let i = limit; i >= from; i--) {
    if (isSpace(text, i)) {
      let end = i;
      while (end > from && isSpace(text, end - 1)) end -= 1;
      return end;
    }
  }
  return isLowSurrogate(text, limit) ? limit + 1 : limit;
}

/**
 * Short excerpts of `text` around its matches, for showing where a search
 * matched in an entry's text: up to `max` of them, in order, each with about
 * `context` characters around its matches. Matches close together share an
 * excerpt while it stays short (its matches span at most `span` characters);
 * where two excerpts would overlap, they split the text between them. Each
 * holds at least one match, and `moreMatches` counts the ones after the last.
 */
export function matchExcerpts(
  text: string,
  ranges: readonly TextRange[],
  { context = 40, max = 3, span = 2 * context }: { context?: number; max?: number; span?: number } = {},
): { excerpts: TextExcerpt[]; moreMatches: number } {
  const excerpts: TextExcerpt[] = [];
  let next = 0; // the first match not in an excerpt yet
  let floor = 0; // where the last excerpt ended
  while (next < ranges.length && excerpts.length < max) {
    const first = ranges[next];
    let last = next;
    while (
      last + 1 < ranges.length &&
      ranges[last + 1].start - ranges[last].end <= context &&
      ranges[last + 1].end - first.start <= span
    ) {
      last += 1;
    }
    let start = excerptStart(text, first.start, context);
    if (start < floor) {
      start = floor;
      while (start < first.start && isSpace(text, start)) start += 1;
    }
    let end = excerptEnd(text, ranges[last].end, context);
    const following = ranges[last + 1];
    if (following && end > following.start) {
      // Too close to the next match to leave it out whole: stop halfway there.
      end = lastBreakBy(text, ranges[last].end, Math.ceil((ranges[last].end + following.start) / 2));
    }
    excerpts.push({
      start,
      end,
      segments: highlightSegments(text, ranges, start, end),
      cutStart: start > 0,
      cutEnd: end < text.length,
    });
    floor = end;
    next = last + 1;
  }
  return { excerpts, moreMatches: ranges.length - next };
}

// ── The list ─────────────────────────────────────────────────────────

export interface JournalListItem {
  entry: JournalEntry;
  shown: JournalEntryText;
  ranges: JournalEntryMatches; // where the search matched, to mark
  matches: boolean;            // false for an entry kept in view that doesn't match
}

export interface JournalList {
  items: JournalListItem[]; // newest first
  matching: number;         // entries that pass the filter and the search
  total: number;
}

/**
 * The entries to list, newest first: those in the filter's hexes that match
 * every word of the search, plus those in `keep` (entries the player is
 * working on, which mustn't vanish while they type or as soon as they move
 * one to another hex).
 */
export function listJournal(
  entries: readonly JournalEntry[],
  character: WithVisits,
  filter: JournalHexFilter,
  words: readonly string[],
  keep: ReadonlySet<string> = new Set(),
): JournalList {
  let matching = 0;
  const items: JournalListItem[] = [];
  for (const entry of sortJournalNewestFirst(entries, character)) {
    const matches = matchesHexFilter(entry, filter) && matchesSearch(entry, character, words);
    if (matches) matching += 1;
    if (matches || keep.has(entry.id)) {
      items.push({
        entry,
        shown: getEntryDisplayText(entry, character),
        ranges: getEntryMatches(entry, character, words),
        matches,
      });
    }
  }
  return { items, matching, total: entries.length };
}

const MAX_QUOTED_QUERY = 60;

/**
 * One line saying what the list shows, such as "12 entries", "3 of 12
 * entries are in hex 0606" or "1 of 12 entries has no hex and matches
 * “goblin”". `query` is the search as typed.
 */
export function describeJournalList(
  list: Pick<JournalList, 'matching' | 'total'>,
  filter: JournalHexFilter,
  query: string,
): string {
  const { matching, total } = list;
  if (total === 0) return 'No journal entries yet.';
  const entries = `${formatCount(total)} ${total === 1 ? 'entry' : 'entries'}`;
  const typed = query.trim().replace(/\s+/g, ' ');
  const searching = parseJournalQuery(typed).length > 0;
  if (filter === 'all' && !searching) return entries;
  const one = matching === 1;
  const parts: string[] = [];
  if (filter === 'none') parts.push(one ? 'has no hex' : 'have no hex');
  else if (filter !== 'all') parts.push(`${one ? 'is' : 'are'} in hex ${filter}`);
  if (searching) {
    const chars = Array.from(typed);
    const quoted = chars.length > MAX_QUOTED_QUERY ? `${chars.slice(0, MAX_QUOTED_QUERY).join('')}…` : typed;
    parts.push(`${one ? 'matches' : 'match'} “${quoted}”`);
  }
  return `${formatCount(matching)} of ${entries} ${parts.join(' and ')}`;
}
