// The character's own clock, kept apart from Dolmenwood's calendar.
//
// Fairy is a timeless world (Player's Book p9, p14). A character can spend
// twelve days there and come back to find years have passed in Dolmenwood,
// or the reverse; the Referee decides. So the sheet keeps two clocks:
//
//   - Dolmenwood's calendar (`Character.currentDate`) drives the date, moon
//     phases, festivals, celestial events and seasons.
//   - Lived time, the days the character has actually lived, drives anything
//     personal, such as spell study.
//
// Lived time is derived, never stored as a running counter. It's computed
// from `currentDate` plus `fairyVisits`, so every way of changing the date
// stays in step without having to remember to update a second number.
//
// The timeline alternates Dolmenwood stretches and Fairy visits:
//
//   Year 1, day 1 ──Dolmenwood──▶ enter #1 ─Fairy─ return #1 ──Dolmenwood──▶ enter #2 ─Fairy─ … ──▶ now
//
// Lived days = the Dolmenwood stretches + the days spent in Fairy. The
// Dolmenwood time that passes between entering and returning isn't lived.
// Within a stretch, any change to the date counts as lived time, including
// corrections backwards. The calendar can't be set earlier than the day the
// character last came back from Fairy (getEarliestDolmenwoodDate); a wrong
// return date is fixed with editReturnDate, which moves the rest of that
// stretch along with it, so no lived time is gained or lost. `stretch` still
// clamps at zero, but only to guard against imported data that breaks this.
//
// Spell study only uses differences between lived days, measured on a fixed
// clock that starts at Year 1, day 1 (getLivedDays). The days-lived counter
// shown to players counts from the character's own start date instead
// (Character.livedTimeStart; see getLivedTime).

import type {
  ActiveSpellStudy,
  CalendarDate,
  Character,
  FairyDate,
  FairyVisit,
  JournalEntry,
} from './types';
import {
  daysBetween,
  describeDolmenwoodSpan,
  formatCalendarDate,
  formatShortDate,
  fromAbsoluteDay,
  getAbsoluteDay,
  plural,
} from './gamedata';

/** Year 1, day 1: where the lived-time clock starts (lived day 0), and the default start of the days-lived counter. */
export const LIVED_TIME_EPOCH: CalendarDate = { day: 1, month: 0, year: 1 };

type WithVisits = Pick<Character, 'fairyVisits'>;
type WithClock = Pick<Character, 'fairyVisits' | 'currentDate'>;

// A Dolmenwood stretch between two dates, in days. Never negative: a guard
// for imported data, since the app keeps every stretch's end after its start.
function stretch(from: CalendarDate, to: CalendarDate): number {
  return Math.max(0, daysBetween(from, to));
}

// `date` moved by some number of days, in constant time.
function shiftDate(date: CalendarDate, days: number): CalendarDate {
  return fromAbsoluteDay(getAbsoluteDay(date) + days);
}

// Day N of a visit after `daysLived` days there (day 1 = the day they entered).
function fairyDayNumber(daysLived: number): number {
  return Math.max(0, daysLived) + 1;
}

// ── Fairy visits ─────────────────────────────────────────────────────

/** Visits, oldest first. Defensive against characters loaded before the field existed. */
export function getFairyVisits(character: WithVisits): FairyVisit[] {
  return Array.isArray(character.fairyVisits) ? character.fairyVisits : [];
}

/** The visit the character is on right now, or null when they're in Dolmenwood. */
export function getOpenFairyVisit(character: WithVisits): FairyVisit | null {
  const visits = getFairyVisits(character);
  const last = visits[visits.length - 1];
  return last && last.returnedOn == null ? last : null;
}

export function isInFairy(character: WithVisits): boolean {
  return getOpenFairyVisit(character) !== null;
}

/** The most recent visit, if the character has come back from it: the only return date that can be edited. */
export function getEditableReturnVisit(character: WithVisits): FairyVisit | null {
  const visits = getFairyVisits(character);
  const last = visits[visits.length - 1];
  return last && last.returnedOn ? last : null;
}

// ── Lived time ───────────────────────────────────────────────────────

/**
 * Days lived since Year 1, day 1, in Dolmenwood and in Fairy. This fixed
 * clock is what spell study measures; it doesn't depend on the counter's
 * start date.
 */
export function getLivedDays(character: WithClock): number {
  let cursor: CalendarDate | null = LIVED_TIME_EPOCH;
  let lived = 0;
  for (const visit of getFairyVisits(character)) {
    if (!cursor) break; // only the last visit can be open
    lived += stretch(cursor, visit.enteredOn) + Math.max(0, visit.daysInFairy);
    cursor = visit.returnedOn ?? null; // null: still in Fairy, so Dolmenwood's calendar waits
  }
  if (cursor) lived += stretch(cursor, character.currentDate);
  return lived;
}

export interface LivedTime {
  countingFrom: CalendarDate; // the character's livedTimeStart
  startsAfterToday: boolean;  // countingFrom is after today's Dolmenwood date, so nothing counts yet
  totalDays: number;          // days lived since countingFrom
  dolmenwoodDays: number;     // ...of which in Dolmenwood
  fairyDays: number;          // ...of which in Fairy
  visitCount: number;         // visits begun on or after countingFrom, including one in progress
  awayDays: number;           // Dolmenwood days that passed while away on those visits, once over
}

/**
 * The days-lived counter: time lived since the character's own start date
 * (Character.livedTimeStart). Visits that began before that date don't
 * count. If the start date is after today's Dolmenwood date, every count is
 * zero and `startsAfterToday` is set.
 */
export function getLivedTime(character: Pick<Character, 'fairyVisits' | 'currentDate' | 'livedTimeStart'>): LivedTime {
  const countingFrom = character.livedTimeStart ?? LIVED_TIME_EPOCH;
  let fairyDays = 0;
  let awayDays = 0;
  let visitCount = 0;
  for (const visit of getFairyVisits(character)) {
    if (daysBetween(countingFrom, visit.enteredOn) < 0) continue;
    visitCount += 1;
    fairyDays += Math.max(0, visit.daysInFairy);
    if (visit.returnedOn) awayDays += stretch(visit.enteredOn, visit.returnedOn);
  }
  const totalDays = Math.max(0, getLivedDays(character) - getLivedDayAtDolmenwoodDate(character, countingFrom));
  return {
    countingFrom: { ...countingFrom },
    startsAfterToday: daysBetween(character.currentDate, countingFrom) > 0,
    totalDays,
    dolmenwoodDays: Math.max(0, totalDays - fairyDays),
    fairyDays,
    visitCount,
    awayDays,
  };
}

/** Where the character was on some lived day: a Dolmenwood date, plus a Fairy date if they were in Fairy. */
export interface TimelinePoint {
  date: CalendarDate;
  fairyDate?: FairyDate;
}

/** Where the character is now, and their lived day. Use this to stamp new records. */
export function getCurrentTimelinePoint(character: WithClock): TimelinePoint & { livedDay: number } {
  const open = getOpenFairyVisit(character);
  return {
    date: { ...(open ? open.enteredOn : character.currentDate) },
    fairyDate: open ? { visitId: open.id, day: fairyDayNumber(open.daysInFairy) } : undefined,
    livedDay: getLivedDays(character),
  };
}

/**
 * Where the character was on a past lived day (the inverse of getLivedDays).
 * A lived day on a boundary, such as the day they stepped into Fairy or the
 * day they came back, resolves to the Dolmenwood side, even for a visit that
 * is still open. Only lived days inside a visit, or after the start of the
 * visit in progress, resolve to a Fairy date.
 */
export function getTimelinePointAtLivedDay(character: WithVisits, livedDay: number): TimelinePoint {
  const target = Math.max(0, Math.floor(livedDay));
  let cursor = LIVED_TIME_EPOCH;
  let lived = 0;
  for (const visit of getFairyVisits(character)) {
    const dolmenwood = stretch(cursor, visit.enteredOn);
    if (target <= lived + dolmenwood) return { date: shiftDate(cursor, target - lived) };
    lived += dolmenwood;
    const inFairy = Math.max(0, visit.daysInFairy);
    if (!visit.returnedOn || target < lived + inFairy) {
      return {
        date: { ...visit.enteredOn },
        fairyDate: { visitId: visit.id, day: fairyDayNumber(Math.min(target - lived, inFairy)) },
      };
    }
    lived += inFairy;
    cursor = visit.returnedOn;
  }
  return { date: shiftDate(cursor, target - lived) };
}

/**
 * Best-effort lived day for a bare Dolmenwood date: the start of the
 * days-lived counter, or a record saved before lived time existed. With no
 * Fairy visits it's exact: the days since Year 1, day 1. A date inside a
 * visit's away time maps to the moment the character returned; a visit's
 * entry date maps to just before they left.
 */
export function getLivedDayAtDolmenwoodDate(character: WithVisits, date: CalendarDate): number {
  let cursor = LIVED_TIME_EPOCH;
  let lived = 0;
  for (const visit of getFairyVisits(character)) {
    if (daysBetween(visit.enteredOn, date) <= 0) return lived + stretch(cursor, date);
    lived += stretch(cursor, visit.enteredOn) + Math.max(0, visit.daysInFairy);
    if (!visit.returnedOn || daysBetween(date, visit.returnedOn) >= 0) return lived;
    cursor = visit.returnedOn;
  }
  return lived + stretch(cursor, date);
}

// ── The calendar's floor, and the counter's start ────────────────────

/**
 * The earliest Dolmenwood date the calendar can be set to: the day the
 * character last came back from Fairy, or Year 1, day 1 if they never went.
 * Going further back would undo time spent in Fairy; editReturnDate is the
 * way to fix a wrong return date.
 */
export function getEarliestDolmenwoodDate(character: WithVisits): CalendarDate {
  const visits = getFairyVisits(character);
  const last = visits[visits.length - 1];
  return { ...(last ? last.returnedOn ?? last.enteredOn : LIVED_TIME_EPOCH) };
}

/** `date`, or the earliest allowed date if it's before that. */
export function clampToEarliestDate(character: WithVisits, date: CalendarDate): CalendarDate {
  const earliest = getEarliestDolmenwoodDate(character);
  return daysBetween(earliest, date) < 0 ? earliest : { ...date };
}

/** Set the date the days-lived counter counts from. Null if it's after today's Dolmenwood date. */
export function setLivedTimeStart(character: WithClock, date: CalendarDate): Partial<Character> | null {
  if (daysBetween(character.currentDate, date) > 0) return null;
  return { livedTimeStart: { day: date.day, month: date.month, year: date.year } };
}

// ── Spell study ──────────────────────────────────────────────────────

export interface StudyProgress {
  elapsedDays: number;          // lived days since the study began; never negative
  elapsedWeeks: number;         // whole weeks of that
  weeksRequired: number;
  weeksRemaining: number;
  ready: boolean;
  startedLivedDay: number;      // lived day the study began
  completesOnLivedDay: number;  // lived day it's (or was) ready: start + weeksRequired * 7
}

/**
 * Progress of the active spell study, counted in days the character has
 * lived: days in Fairy count, and Dolmenwood time that passes while they're
 * away doesn't. Null when nothing is being studied. The single source of
 * truth for study progress; every view should use it.
 */
export function getStudyProgress(
  character: Pick<Character, 'spellStudy' | 'fairyVisits' | 'currentDate'>,
): StudyProgress | null {
  const active = character.spellStudy?.active;
  if (!active) return null;
  const startedLivedDay = Number.isFinite(active.startedLivedDay)
    ? active.startedLivedDay
    : getLivedDayAtDolmenwoodDate(character, active.startedOn);
  // Clamp at 0 so a backward calendar correction reads as "not started yet"
  // instead of negative progress.
  const elapsedDays = Math.max(0, getLivedDays(character) - startedLivedDay);
  const elapsedWeeks = Math.floor(elapsedDays / 7);
  return {
    elapsedDays,
    elapsedWeeks,
    weeksRequired: active.weeksRequired,
    weeksRemaining: Math.max(0, active.weeksRequired - elapsedWeeks),
    ready: elapsedWeeks >= active.weeksRequired,
    startedLivedDay,
    completesOnLivedDay: startedLivedDay + active.weeksRequired * 7,
  };
}

/**
 * The start fields for a study beginning now, or at an earlier lived day
 * (for example when the previous study finished before the player clicked
 * Complete). A lived day in the future is treated as now.
 */
export function getStudyStart(
  character: WithClock,
  livedDay?: number,
): Pick<ActiveSpellStudy, 'startedOn' | 'startedLivedDay' | 'startedInFairy'> {
  const now = getCurrentTimelinePoint(character);
  if (livedDay === undefined || !Number.isFinite(livedDay) || livedDay >= now.livedDay) {
    return { startedOn: now.date, startedLivedDay: now.livedDay, startedInFairy: now.fairyDate };
  }
  const start = Math.max(0, Math.floor(livedDay));
  const point = getTimelinePointAtLivedDay(character, start);
  return { startedOn: point.date, startedLivedDay: start, startedInFairy: point.fairyDate };
}

// ── Returning from Fairy ─────────────────────────────────────────────

/**
 * Player's Book p93, "Quests in Fairy" (optional rule): while a character
 * journeys in Fairy to receive a rune, 2d20 days pass in the mortal world.
 */
export function roll2d20(random: () => number = Math.random): { dice: [number, number]; total: number } {
  const d20 = () => Math.min(20, Math.floor(random() * 20) + 1);
  const dice: [number, number] = [d20(), d20()];
  return { dice, total: dice[0] + dice[1] };
}

/** A character can come back on the day they entered or later, never earlier. */
export function canReturnOn(visit: FairyVisit, date: CalendarDate): boolean {
  return daysBetween(visit.enteredOn, date) >= 0;
}

// The sentence for a return's automatic journal entry.
function describeReturn(visitNumber: number, daysInFairy: number, enteredOn: CalendarDate, returnedOn: CalendarDate): string {
  const stay = daysInFairy > 0 ? `after ${plural(daysInFairy, 'day')}` : 'without spending a day there';
  const passed = daysBetween(enteredOn, returnedOn) > 0
    ? `${describeDolmenwoodSpan(enteredOn, returnedOn)} passed in Dolmenwood`
    : 'no time passed in Dolmenwood';
  return `Returned from Fairy (visit ${visitNumber}) ${stay}; ${passed}.`;
}

// ── Display ──────────────────────────────────────────────────────────

/**
 * "Fairy visit 2, day 5 (entered 3 Grimvold, Year 2)". `enteredOn` is a
 * fallback for a record whose visit can't be found; it's the frozen
 * Dolmenwood date stored on the record itself.
 */
export function formatFairyDate(character: WithVisits, fairyDate: FairyDate, enteredOn?: CalendarDate): string {
  const visits = getFairyVisits(character);
  const index = visits.findIndex((v) => v.id === fairyDate.visitId);
  const entered = index === -1 ? enteredOn : visits[index].enteredOn;
  const label = index === -1 ? `In Fairy, day ${fairyDate.day}` : `Fairy visit ${index + 1}, day ${fairyDate.day}`;
  return entered ? `${label} (entered ${formatShortDate(entered)})` : label;
}

/** A record's date: its Fairy date if it was made in Fairy, otherwise its Dolmenwood date. */
export function formatRecordDate(character: WithVisits, date: CalendarDate, fairyDate?: FairyDate): string {
  return fairyDate ? formatFairyDate(character, fairyDate, date) : formatCalendarDate(date);
}

// ── Entering and leaving Fairy ───────────────────────────────────────
// Each returns the whole patch for one onChange call, so the visit, the date
// and the journal entry are saved together.

export function enterFairy(character: Character): Partial<Character> | null {
  if (isInFairy(character)) return null;
  const visits = getFairyVisits(character);
  const enteredOn = { ...character.currentDate };
  const visit: FairyVisit = { id: crypto.randomUUID(), enteredOn, returnedOn: null, daysInFairy: 0 };
  const entry: JournalEntry = {
    id: crypto.randomUUID(),
    date: { ...enteredOn },
    fairyEvent: { visitId: visit.id, kind: 'entered' },
    location: character.currentLocation ?? '',
    text: `Entered Fairy (visit ${visits.length + 1}).`,
  };
  return {
    fairyVisits: [...visits, visit],
    journalEntries: [...(character.journalEntries ?? []), entry],
  };
}

/** Set the days lived on the current visit. Dolmenwood's date doesn't move. */
export function setDaysInFairy(character: Character, days: number): Partial<Character> | null {
  const open = getOpenFairyVisit(character);
  if (!open || !Number.isFinite(days)) return null;
  const daysInFairy = Math.max(0, Math.floor(days));
  return {
    fairyVisits: getFairyVisits(character).map((v) => (v.id === open.id ? { ...v, daysInFairy } : v)),
  };
}

/**
 * Close the current visit: Dolmenwood's calendar jumps to `returnedOn` (the
 * Referee's call) and the journal records the trip. Null if the character
 * isn't in Fairy or the date is before the day they entered.
 */
export function returnFromFairy(character: Character, returnedOn: CalendarDate): Partial<Character> | null {
  const open = getOpenFairyVisit(character);
  if (!open || !canReturnOn(open, returnedOn)) return null;
  const visits = getFairyVisits(character);
  const date = { day: returnedOn.day, month: returnedOn.month, year: returnedOn.year };
  const entry: JournalEntry = {
    id: crypto.randomUUID(),
    date: { ...date },
    fairyEvent: { visitId: open.id, kind: 'returned' },
    location: character.currentLocation ?? '',
    text: describeReturn(visits.length, open.daysInFairy, open.enteredOn, date),
  };
  return {
    fairyVisits: visits.map((v) => (v.id === open.id ? { ...v, returnedOn: { ...date } } : v)),
    currentDate: { ...date },
    journalEntries: [...(character.journalEntries ?? []), entry],
  };
}

/**
 * Correct the date the character came back from their most recent visit.
 * Today's Dolmenwood date moves by the same amount, so the days lived since
 * coming back are kept: lived time and study progress don't change, and the
 * return date can't end up after today. The return's automatic journal
 * entry is redated and its sentence rewritten (any text the player added
 * stays). Other records keep the dates they were written with. Null if
 * there's no completed visit or the date is before the day they entered.
 */
export function editReturnDate(character: Character, returnedOn: CalendarDate): Partial<Character> | null {
  const visit = getEditableReturnVisit(character);
  if (!visit || !visit.returnedOn || !canReturnOn(visit, returnedOn)) return null;
  const visits = getFairyVisits(character);
  const date = { day: returnedOn.day, month: returnedOn.month, year: returnedOn.year };
  const oldText = describeReturn(visits.length, visit.daysInFairy, visit.enteredOn, visit.returnedOn);
  const newText = describeReturn(visits.length, visit.daysInFairy, visit.enteredOn, date);
  return {
    fairyVisits: visits.map((v) => (v.id === visit.id ? { ...v, returnedOn: { ...date } } : v)),
    currentDate: shiftDate(character.currentDate, daysBetween(visit.returnedOn, date)),
    journalEntries: (character.journalEntries ?? []).map((entry) =>
      entry.fairyEvent?.visitId === visit.id && entry.fairyEvent.kind === 'returned'
        ? { ...entry, date: { ...date }, text: entry.text.split(oldText).join(newText) }
        : entry,
    ),
  };
}
