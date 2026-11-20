// The journal's logic, kept apart from its tab (src/components/Journal.tsx)
// so that it can be tested: new entries, the order entries are listed in,
// search, and the hex filter.

import type { CalendarDate, Character, FairyVisit, HexCoord, JournalEntry } from './types';
import { getAbsoluteDay } from './gamedata';
import { isValidHex } from './hex';
import {
  LIVED_TIME_EPOCH,
  formatRecordDate,
  getCurrentPlace,
  getCurrentTimelinePoint,
  getFairyVisits,
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
 * tab and the map's current hex. In Fairy that hex is where the party left
 * from, so an entry written there gets none (getCurrentPlace).
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
// and jumps when they come back. The character's timeline alternates
// stretches in Dolmenwood and Fairy visits (see src/lib/livedTime.ts), and
// an entry is placed by, in turn:
//   1. the part of the timeline it belongs to: the stretch in Dolmenwood
//      before the first visit, then that visit, then the stretch after it,
//      and so on;
//   2. the lived day it was written on (days lived since Year 1, day 1,
//      days in Fairy included);
//   3. on a visit's day, the "Entered Fairy" entry first, then the entries
//      written in Fairy, then "Returned from Fairy";
//   4. its Dolmenwood date;
//   5. the order the entries were written in. They're only ever added to
//      the end of the saved list, so a later position means written later.
// What belongs where:
//   - an entry written in Fairy belongs to its visit, on the visit's first
//     lived day plus its Fairy day. A day the visit never reached (days taken
//     back after writing it) counts as the visit's last day;
//   - "Entered Fairy" and "Returned from Fairy" belong to their visit, on
//     the lived days the character stepped in and came back;
//   - an entry written in Dolmenwood after coming back from a visit, and
//     stamped with it (sinceReturnFrom), belongs to the stretch after it;
//   - any other entry is placed by its Dolmenwood date alone. One dated
//     during a visit's time away, or on the day of the return, wasn't written
//     after that visit (it would carry its stamp), so it was written before
//     it: it goes at the end of the stretch before the visit. That happens
//     when the calendar was moved back before entering Fairy, and in
//     journals from before Fairy time was tracked. An entry naming a visit
//     that no longer exists is placed by its date too.
// For an entry the timeline places exactly, its Dolmenwood date and the
// order it was written in never disagree; the date only decides between
// entries placed by date alone. Editing the date of the last return moves the
// entries written since then with it (planReturnEdit), so the order stays
// the same.

/** Where an entry sits on the character's timeline (see "Order" above). */
export interface EntryPlace {
  part: number;     // 2k: the stretch in Dolmenwood before visit k (or, 2 × the visits, after the last); 2k + 1: visit k
  livedDay: number; // the lived day it was written on
  step: number;     // on a visit's day: 0 entering, 1 in Fairy, 2 returning. 0 in Dolmenwood
}

interface VisitSpan {
  index: number;        // the visit's place in the list, from 0
  began: number;        // lived day the character stepped into Fairy
  ended: number | null; // lived day they came back; null while still there
  lastDay: number;      // days lived there, so the last Fairy day is lastDay + 1
}

interface Timeline {
  visits: FairyVisit[];
  spans: VisitSpan[];             // one per visit, in order
  byId: Map<string, VisitSpan>;   // ids are unique once loaded
}

function timelineOf(character: WithVisits): Timeline {
  const visits = getFairyVisits(character);
  const byId = new Map<string, VisitSpan>();
  const spans = visits.map((visit, index): VisitSpan => {
    const began = getLivedDays({ fairyVisits: visits.slice(0, index), currentDate: visit.enteredOn });
    const lastDay = Number.isFinite(visit.daysInFairy) ? Math.max(0, Math.floor(visit.daysInFairy)) : 0;
    const span = { index, began, ended: visit.returnedOn ? began + lastDay : null, lastDay };
    if (!byId.has(visit.id)) byId.set(visit.id, span);
    return span;
  });
  return { visits, spans, byId };
}

// The place of an entry written in Dolmenwood (see "Order" above).
function placeInDolmenwood(date: CalendarDate, sinceReturnFrom: unknown, timeline: Timeline): EntryPlace {
  const { visits, spans, byId } = timeline;
  const day = getAbsoluteDay(date);
  // Written after coming back from the visit it's stamped with, if its date
  // is after that return and not after the next visit began.
  const after = typeof sinceReturnFrom === 'string' ? byId.get(sinceReturnFrom) : undefined;
  const returnedOn = after ? visits[after.index].returnedOn : null;
  if (after && after.ended !== null && returnedOn) {
    const returned = getAbsoluteDay(returnedOn);
    const next = visits[after.index + 1];
    if (day >= returned && (!next || day <= getAbsoluteDay(next.enteredOn))) {
      return { part: 2 * after.index + 2, livedDay: after.ended + (day - returned), step: 0 };
    }
  }
  // Otherwise by its date alone, in the stretch before the first visit that
  // hadn't ended by then.
  let cursor = getAbsoluteDay(LIVED_TIME_EPOCH);
  let lived = 0;
  for (let k = 0; k < visits.length; k++) {
    const entered = getAbsoluteDay(visits[k].enteredOn);
    if (day <= entered) return { part: 2 * k, livedDay: lived + Math.max(0, day - cursor), step: 0 };
    lived += Math.max(0, entered - cursor);
    const back = visits[k].returnedOn;
    if (!back || day <= getAbsoluteDay(back)) return { part: 2 * k, livedDay: lived, step: 0 };
    lived += spans[k].lastDay;
    cursor = getAbsoluteDay(back);
  }
  return { part: 2 * visits.length, livedDay: lived + Math.max(0, day - cursor), step: 0 };
}

/**
 * Where an entry sits on the character's timeline (see "Order" above).
 * `timeline` can be passed in when placing many entries of one character.
 */
export function getEntryPlace(entry: JournalEntry, character: WithVisits, timeline = timelineOf(character)): EntryPlace {
  const { fairyDate, fairyEvent } = entry;
  const inFairy = fairyDate ? timeline.byId.get(fairyDate.visitId) : undefined;
  if (fairyDate && inFairy) {
    const day = Number.isFinite(fairyDate.day) ? Math.floor(fairyDate.day) : 1;
    const livedDay = inFairy.began + Math.min(Math.max(0, day - 1), inFairy.lastDay);
    return { part: 2 * inFairy.index + 1, livedDay, step: 1 };
  }
  const event = fairyEvent ? timeline.byId.get(fairyEvent.visitId) : undefined;
  if (fairyEvent && event) {
    if (fairyEvent.kind === 'entered') return { part: 2 * event.index + 1, livedDay: event.began, step: 0 };
    if (event.ended !== null) return { part: 2 * event.index + 1, livedDay: event.ended, step: 2 };
  }
  return placeInDolmenwood(entry.date, entry.sinceReturnFrom, timeline);
}

// Larger first. Numbers that aren't finite (never, for a loaded save) go last.
function compareDescending(a: number, b: number): number {
  const x = Number.isFinite(a) ? a : -Infinity;
  const y = Number.isFinite(b) ? b : -Infinity;
  return x === y ? 0 : x > y ? -1 : 1;
}

/** `entries` newest first (see "Order" above). The saved list keeps its order. */
export function sortJournalNewestFirst(entries: readonly JournalEntry[], character: WithVisits): JournalEntry[] {
  const timeline = timelineOf(character);
  return entries
    .map((entry, written) => ({
      entry,
      written,
      place: getEntryPlace(entry, character, timeline),
      dolmenwoodDay: getAbsoluteDay(entry.date),
    }))
    .sort(
      (a, b) =>
        compareDescending(a.place.part, b.place.part) ||
        compareDescending(a.place.livedDay, b.place.livedDay) ||
        compareDescending(a.place.step, b.place.step) ||
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
// What's searched: an entry's text, location, hex ("Hex 0606") and date as
// the list shows it ("3 Grimvold (Hayme), Year 1", or "Fairy visit 1, day 5
// (entered 3 Grimvold, Year 2)").
//
// Case and accents don't matter: text is compared after folding, which
// splits accented letters into letter and accent (NFKD), drops the accent,
// lower-cases, and folds the few letters that don't split that way (ø, ł,
// ß, æ, þ...), Greek's final sigma, and curly quotes and the various dashes,
// which phones type for straight ones. Only accents (the combining
// diacritical marks) are dropped, with the variation selectors that pick
// how an emoji is drawn (⚔️ is ⚔ drawn in colour): the marks that make
// letters of their own in other scripts, such as Japanese voicing marks,
// Devanagari vowel signs and Thai tone marks, are kept, and a match never
// ends just before one, so か doesn't find が.
//
// A search is made of terms: each word, and each phrase in double quotes
// ("goblin king"). An entry matches when every term is somewhere in it, in
// any part and any order. A phrase's words must be next to each other, in
// order, with only spaces or line breaks between them. Anything but letters,
// digits and symbols such as emoji is taken off the ends of a term, so
// "Grimvold," or "(Hayme)" still finds the word; inside it, it stays, as in
// "Hag's" or "goblin-king".
// A term that starts or ends with a digit doesn't match inside a longer
// number: "1" finds "day 1" but not "11" or "Year 12", and "year 1" in quotes
// finds Year 1 only.

const DIACRITICS = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe00-\ufe0f\ufe20-\ufe2f]/g;
const ASCII_ONLY = /^[\x00-\x7f]*$/;
const EXTRA_FOLDS: ReadonlyMap<string, string> = new Map([
  ['ø', 'o'], ['ł', 'l'], ['đ', 'd'], ['ð', 'd'], ['ħ', 'h'], ['ŧ', 't'], ['ı', 'i'], ['þ', 'th'],
  ['ß', 'ss'], ['æ', 'ae'], ['œ', 'oe'], ['ς', 'σ'],
  ['‘', "'"], ['’', "'"], ['‚', "'"], ['‛', "'"], ['ʼ', "'"],
  ['“', '"'], ['”', '"'], ['„', '"'], ['‟', '"'],
  ['‐', '-'], ['‒', '-'], ['–', '-'], ['—', '-'], ['―', '-'], ['−', '-'],
]);
const foldedChars = new Map<string, string>();

// One character (code point) folded; '' for an accent typed on its own.
function foldChar(ch: string): string {
  if (ch.length === 1 && ch.charCodeAt(0) < 0x80) return ch.toLowerCase();
  let folded = foldedChars.get(ch);
  if (folded === undefined) {
    // Lower-casing can itself add an accent (İ → i̇), so strip twice.
    const lower = ch.normalize('NFKD').replace(DIACRITICS, '').toLowerCase();
    const bare = lower.normalize('NFKD').replace(DIACRITICS, '');
    folded = Array.from(bare, (c) => EXTRA_FOLDS.get(c) ?? c).join('');
    foldedChars.set(ch, folded);
  }
  return folded;
}

// Text folded, with what's needed to find where a stretch of the folded text
// came from: the characters whose folded form isn't as long as they are
// (ß → ss, an accent typed on its own → nothing), in order. Between two of
// those, offsets in the two texts differ by a constant.
interface FoldedText {
  folded: string;
  changed: { at: number; length: number; source: number; sourceLength: number }[];
}

function foldText(text: string): FoldedText {
  if (ASCII_ONLY.test(text)) return { folded: text.toLowerCase(), changed: [] };
  let folded = '';
  const changed: FoldedText['changed'] = [];
  let source = 0;
  for (const ch of text) {
    const f = foldChar(ch);
    if (f.length !== ch.length) changed.push({ at: folded.length, length: f.length, source, sourceLength: ch.length });
    folded += f;
    source += ch.length;
  }
  return { folded, changed };
}

/** `text` folded for comparing (see "Search" above). */
export function foldForSearch(text: string): string {
  return foldText(text).folded;
}

/** One thing to search for: a word, or the words of a phrase in quotes, folded. */
export type SearchTerm = readonly string[];

// Letters, digits, and symbols such as emoji (🧙, ⚔, ©, °).
const WORD_CHAR = /[\p{L}\p{M}\p{N}\p{So}\p{Extended_Pictographic}]/u;

// `text` without anything but those at its two ends.
function trimToWord(text: string): string {
  const chars = Array.from(text);
  let start = 0;
  let end = chars.length;
  while (start < end && !WORD_CHAR.test(chars[start])) start += 1;
  while (end > start && !WORD_CHAR.test(chars[end - 1])) end -= 1;
  return chars.slice(start, end).join('');
}

/**
 * The terms of a search (see "Search" above), without repeats: each word,
 * and each phrase in straight or curly double quotes. A quote left open
 * runs to the end. An empty list means no search.
 */
export function parseJournalQuery(query: string): SearchTerm[] {
  const terms = new Map<string, SearchTerm>();
  const add = (text: string) => {
    const words = trimToWord(text).split(/\s+/).filter(Boolean);
    if (words.length > 0) terms.set(words.join(' '), words);
  };
  // Folding turns curly double quotes into straight ones.
  foldForSearch(query)
    .split('"')
    .forEach((part, i) => {
      if (i % 2 === 1) add(part); // inside quotes: a phrase
      else for (const word of part.split(/\s+/)) add(word);
    });
  return [...terms.values()];
}

const DIGIT = /^\p{Nd}$/u;
const MARK = /^\p{M}$/u;
const SPACE = /\s/;

// The character (code point) just before, or at, an offset of `s`.
function charBefore(s: string, at: number): string {
  if (at <= 0) return '';
  const low = s.charCodeAt(at - 1);
  return low >= 0xdc00 && low <= 0xdfff && at >= 2 ? s.slice(at - 2, at) : s.charAt(at - 1);
}
function charAt(s: string, at: number): string {
  const code = s.codePointAt(at);
  return code === undefined ? '' : String.fromCodePoint(code);
}

// Whether a term found at `start`..`end` of `folded` stands as it should: a
// number in it isn't part of a longer number, and it doesn't stop inside a
// letter, just before a mark that belongs to it.
function standsAlone(folded: string, start: number, end: number, term: SearchTerm): boolean {
  const first = term[0];
  const last = term[term.length - 1];
  if (DIGIT.test(charAt(first, 0)) && DIGIT.test(charBefore(folded, start))) return false;
  if (DIGIT.test(charBefore(last, last.length)) && DIGIT.test(charAt(folded, end))) return false;
  return !MARK.test(charAt(folded, end));
}

// Where `term` occurs in `folded`, first starting at or after `from`.
function findTerm(folded: string, term: SearchTerm, from: number): TextRange | null {
  const [first, ...rest] = term;
  for (let start = folded.indexOf(first, from); start !== -1; start = folded.indexOf(first, start + 1)) {
    let end = start + first.length;
    for (const word of rest) {
      let next = end;
      while (next < folded.length && SPACE.test(folded.charAt(next))) next += 1;
      if (next === end || !folded.startsWith(word, next)) {
        end = -1;
        break;
      }
      end = next + word.length;
    }
    if (end !== -1 && standsAlone(folded, start, end, term)) return { start, end };
  }
  return null;
}

/** A stretch of a string, by UTF-16 offsets: `start` up to, not including, `end`. */
export interface TextRange {
  start: number;
  end: number;
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

// The last of `changed` that starts at or before folded offset `at`.
function lastChangedAt(changed: FoldedText['changed'], at: number): number {
  let lo = 0;
  let hi = changed.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (changed[mid].at <= at) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

// The stretch of `source` that the folded character at `at` came from.
function sourceOf(source: string, text: FoldedText, at: number): TextRange {
  const i = lastChangedAt(text.changed, at);
  const c = i === -1 ? null : text.changed[i];
  if (c && at < c.at + c.length) return { start: c.source, end: c.source + c.sourceLength };
  const start = c ? at + (c.source + c.sourceLength) - (c.at + c.length) : at;
  return { start, end: start + charAt(source, start).length };
}

// The first of `changed` that starts at or after folded offset `at`.
function firstChangedFrom(changed: FoldedText['changed'], at: number): number {
  let lo = 0;
  let hi = changed.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (changed[mid].at < at) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// A range of the folded text as the stretch of `source` it came from. Accents
// typed on their own fold to nothing; those right after the range belong to
// its last letter, so a mark takes in the whole letter.
function toSource(source: string, text: FoldedText, range: TextRange): TextRange {
  const start = sourceOf(source, text, range.start).start;
  let end = sourceOf(source, text, range.end - 1).end;
  for (let i = firstChangedFrom(text.changed, range.end); i < text.changed.length; i += 1) {
    const c = text.changed[i];
    if (c.at !== range.end || c.length !== 0 || c.source !== end) break;
    end += c.sourceLength;
  }
  return { start, end };
}

// Every stretch of `source` where a term occurs, given `source` folded.
function findMatchRangesIn(source: string, text: FoldedText, terms: readonly SearchTerm[]): TextRange[] {
  const found: TextRange[] = [];
  for (const term of terms) {
    for (let hit = findTerm(text.folded, term, 0); hit; hit = findTerm(text.folded, term, hit.start + 1)) {
      found.push(hit);
    }
  }
  if (found.length === 0) return [];
  return joinRanges(joinRanges(found).map((range) => toSource(source, text, range)));
}

/**
 * Where the terms of a search appear in `text`, in order, with overlapping
 * or touching stretches joined. Offsets are into `text` itself, so an
 * accented letter or a ß is highlighted whole.
 */
export function findMatchRanges(text: string, terms: readonly SearchTerm[]): TextRange[] {
  if (terms.length === 0 || text === '') return [];
  return findMatchRangesIn(text, foldText(text), terms);
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
const PARTS = ['text', 'location', 'hex', 'date'] as const;

// What's worked out about an entry for the list, kept for as long as the
// entry and the character's Fairy visits (which its date reads from) are
// the same objects. Entries are never changed in place: an edit makes a new
// object. So a letter typed into the search, or into one entry, doesn't fold
// every entry's text again, and each entry's card gets the same props, and
// isn't drawn again, unless something about it changed.
interface EntryFacts {
  visits: unknown;
  shown: JournalEntryText;
  folded?: { [K in keyof JournalEntryText]: FoldedText };
  matches?: { terms: readonly SearchTerm[]; ranges: JournalEntryMatches };
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

function foldedOf(facts: EntryFacts): NonNullable<EntryFacts['folded']> {
  const { shown } = facts;
  facts.folded ??= {
    date: foldText(shown.date),
    location: foldText(shown.location),
    hex: foldText(shown.hex),
    text: foldText(shown.text),
  };
  return facts.folded;
}

export function getEntryDisplayText(entry: JournalEntry, character: WithVisits): JournalEntryText {
  return factsOf(entry, character).shown;
}

/** Whether every term of a search (parseJournalQuery) is somewhere in the entry. */
export function matchesSearch(entry: JournalEntry, character: WithVisits, terms: readonly SearchTerm[]): boolean {
  if (terms.length === 0) return true;
  const folded = foldedOf(factsOf(entry, character));
  return terms.every((term) => PARTS.some((part) => findTerm(folded[part].folded, term, 0) !== null));
}

/**
 * Where the terms of a search appear in each part of the entry, for marking
 * them. The same `terms` array gives back the same result object.
 */
export function getEntryMatches(
  entry: JournalEntry,
  character: WithVisits,
  terms: readonly SearchTerm[],
): JournalEntryMatches {
  if (terms.length === 0) return NO_MATCHES;
  const facts = factsOf(entry, character);
  if (facts.matches?.terms === terms) return facts.matches.ranges;
  const { shown } = facts;
  const folded = foldedOf(facts);
  const ranges = {
    date: findMatchRangesIn(shown.date, folded.date, terms),
    location: findMatchRangesIn(shown.location, folded.location, terms),
    hex: findMatchRangesIn(shown.hex, folded.hex, terms),
    text: findMatchRangesIn(shown.text, folded.text, terms),
  };
  facts.matches = { terms, ranges };
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

const isSpace = (text: string, i: number) => SPACE.test(text.charAt(i));

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
 * where two excerpts would overlap, they split the text between them, and
 * neither is marked as cut there, since nothing is left out. Each holds at
 * least one match, and `moreMatches` counts the ones after the last.
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
  // Where one excerpt picks up where the last left off (only spaces between),
  // nothing was left out.
  for (let i = 1; i < excerpts.length; i += 1) {
    if (text.slice(excerpts[i - 1].end, excerpts[i].start).trim() === '') {
      excerpts[i - 1].cutEnd = false;
      excerpts[i].cutStart = false;
    }
  }
  return { excerpts, moreMatches: ranges.length - next };
}

// ── The list ─────────────────────────────────────────────────────────

export interface JournalListItem {
  entry: JournalEntry;
  shown: JournalEntryText;
  matches: boolean; // false for an entry kept in view that doesn't match
}

export interface JournalList {
  items: JournalListItem[]; // newest first
  matching: number;         // entries that pass the filter and the search
  total: number;
}

// The journal in order, kept while the list of entries and the visits stay
// the same objects, so that a letter typed into the search doesn't sort it
// again.
const sortedJournals = new WeakMap<readonly JournalEntry[], { visits: unknown; sorted: JournalEntry[] }>();

function sortedJournal(entries: readonly JournalEntry[], character: WithVisits): JournalEntry[] {
  const cached = sortedJournals.get(entries);
  if (cached && cached.visits === character.fairyVisits) return cached.sorted;
  const sorted = sortJournalNewestFirst(entries, character);
  sortedJournals.set(entries, { visits: character.fairyVisits, sorted });
  return sorted;
}

/**
 * The entries to list, newest first: those in the filter's hexes that match
 * every term of the search, plus those in `keep` (entries the player is
 * working on, which mustn't vanish while they type or as soon as they move
 * one to another hex). Where the search matched in each is worked out only
 * for the entries shown (getEntryMatches).
 */
export function listJournal(
  entries: readonly JournalEntry[],
  character: WithVisits,
  filter: JournalHexFilter,
  terms: readonly SearchTerm[],
  keep: ReadonlySet<string> = new Set(),
): JournalList {
  let matching = 0;
  const items: JournalListItem[] = [];
  for (const entry of sortedJournal(entries, character)) {
    const matches = matchesHexFilter(entry, filter) && matchesSearch(entry, character, terms);
    if (matches) matching += 1;
    if (matches || keep.has(entry.id)) items.push({ entry, shown: getEntryDisplayText(entry, character), matches });
  }
  return { items, matching, total: entries.length };
}

const MAX_SHOWN_QUERY = 60;
const DOUBLE_QUOTES = /["“”„‟]/;

/**
 * One line saying what the list shows, such as "12 entries", "3 of 12
 * entries are in hex 0606" or "1 of 12 entries has no hex and matches
 * “goblin”". `query` is the search as typed; one with quotes of its own is
 * shown as it is.
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
    const shown = chars.length > MAX_SHOWN_QUERY ? `${chars.slice(0, MAX_SHOWN_QUERY).join('')}…` : typed;
    parts.push(`${one ? 'matches' : 'match'} ${DOUBLE_QUOTES.test(typed) ? shown : `“${shown}”`}`);
  }
  return `${formatCount(matching)} of ${entries} ${parts.join(' and ')}`;
}
