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
// character last came back from Fairy (getEarliestDolmenwoodDate). A wrong
// return date is fixed with editReturnDate, which moves everything after the
// return along with it (today, and the journal entries, spells, study and
// counter start made since then), so no lived time is gained or lost.
// `stretch` still clamps at zero, but only to guard against imported data
// that breaks these rules.
//
// Spell study only uses differences between lived days, measured on a fixed
// clock that starts at Year 1, day 1 (getLivedDays). The days-lived counter
// shown to players counts from the character's own start date instead
// (Character.livedTimeStart; see getLivedTime).

import type {
  ActiveSpellStudy,
  CalendarDate,
  Character,
  CountingStart,
  FairyDate,
  FairyVisit,
  HexCoord,
  JournalEntry,
} from './types';
import { isValidHex } from './hex';
import { getPlaceNameOn } from './map-data';
import {
  MAX_YEAR,
  daysBetween,
  describeDolmenwoodSpan,
  formatCalendarDate,
  formatShortDate,
  fromAbsoluteDay,
  getAbsoluteDay,
} from './gamedata';
import { pluralize } from './grammar';

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
  const start: CountingStart = character.livedTimeStart ?? LIVED_TIME_EPOCH;
  const countingFrom = { day: start.day, month: start.month, year: start.year };
  const visits = getFairyVisits(character);
  // A stamped start comes after its visit, even on that visit's entry day.
  const after = returnStampIndex(visits, countingFrom, start.sinceReturnFrom);
  let fairyDays = 0;
  let awayDays = 0;
  let visitCount = 0;
  visits.forEach((visit, i) => {
    if (i <= after || daysBetween(countingFrom, visit.enteredOn) < 0) return;
    visitCount += 1;
    fairyDays += Math.max(0, visit.daysInFairy);
    if (visit.returnedOn) awayDays += stretch(visit.enteredOn, visit.returnedOn);
  });
  const totalDays = Math.max(
    0,
    getLivedDays(character) - getLivedDayAtDolmenwoodDate(character, countingFrom, start.sinceReturnFrom),
  );
  return {
    countingFrom,
    startsAfterToday: daysBetween(character.currentDate, countingFrom) > 0,
    totalDays,
    dolmenwoodDays: Math.max(0, totalDays - fairyDays),
    fairyDays,
    visitCount,
    awayDays,
  };
}

/**
 * Where the character was on some lived day: a Dolmenwood date, plus a Fairy
 * date if they were in Fairy, or the visit they had last come back from if
 * they were in Dolmenwood after a return (stamped on records as
 * `sinceReturnFrom`, so editing that return date can move them with it).
 */
export interface TimelinePoint {
  date: CalendarDate;
  fairyDate?: FairyDate;
  sinceReturnFrom?: string;
}

/** Where the character is now, and their lived day. Use this to stamp new records. */
export function getCurrentTimelinePoint(character: WithClock): TimelinePoint & { livedDay: number } {
  const visits = getFairyVisits(character);
  const last = visits[visits.length - 1];
  const open = last && last.returnedOn == null ? last : null;
  return {
    date: { ...(open ? open.enteredOn : character.currentDate) },
    fairyDate: open ? { visitId: open.id, day: fairyDayNumber(open.daysInFairy) } : undefined,
    sinceReturnFrom: last && !open ? last.id : undefined,
    livedDay: getLivedDays(character),
  };
}

/**
 * Where the character is now, to stamp on a new journal entry alongside
 * getCurrentTimelinePoint: the location typed on the Adventuring tab, and the
 * map's current hex. In Fairy that hex is where the party left Dolmenwood,
 * not where they are, so there's none. An entry stamped without one has no
 * `hex`; the player can set it in the journal.
 */
export function getCurrentPlace(
  character: Pick<Character, 'currentLocation' | 'currentLocationHex' | 'fairyVisits'>,
): Pick<JournalEntry, 'location' | 'hex'> {
  const location = character.currentLocation ?? '';
  const hex = character.currentLocationHex;
  return isValidHex(hex) && !isInFairy(character) ? { location, hex } : { location };
}

/**
 * Where the character was on a past lived day (the inverse of getLivedDays).
 * A lived day on a boundary, such as the day they stepped into Fairy or the
 * day they came back, resolves to the Dolmenwood side, even for a visit that
 * is still open. Only lived days inside a visit, or after the start of the
 * visit in progress, resolve to a Fairy date.
 *
 * A visit with no days in Fairy has one lived day on both sides of it: the
 * day they entered and the day they came back. That reads as the day they
 * entered, unless `sinceReturnFrom` names the visit (or a later one), as it
 * does for a record made after coming back.
 */
export function getTimelinePointAtLivedDay(character: WithVisits, livedDay: number, sinceReturnFrom?: string): TimelinePoint {
  const target = Math.max(0, Math.floor(livedDay));
  const visits = getFairyVisits(character);
  const stamped = visits.findIndex((v) => v.id === sinceReturnFrom && v.returnedOn != null);
  const after = stamped >= 0 && target >= livedDayAtReturn(visits, stamped) ? stamped : -1;
  let cursor = LIVED_TIME_EPOCH;
  let lived = 0;
  let returnedFrom: string | undefined; // the visit whose return began the current stretch
  for (let i = 0; i < visits.length; i++) {
    const visit = visits[i];
    const dolmenwood = stretch(cursor, visit.enteredOn);
    if (target < lived + dolmenwood || (target === lived + dolmenwood && i > after)) {
      return dolmenwoodPoint(shiftDate(cursor, target - lived), returnedFrom);
    }
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
    returnedFrom = visit.id;
  }
  return dolmenwoodPoint(shiftDate(cursor, target - lived), returnedFrom);
}

function dolmenwoodPoint(date: CalendarDate, sinceReturnFrom: string | undefined): TimelinePoint {
  return sinceReturnFrom ? { date, sinceReturnFrom } : { date };
}

// The lived day the character came back from visits[k] on. That visit must be over.
function livedDayAtReturn(visits: FairyVisit[], k: number): number {
  return getLivedDays({ fairyVisits: visits.slice(0, k + 1), currentDate: visits[k].returnedOn ?? LIVED_TIME_EPOCH });
}

// Which visit a `sinceReturnFrom` stamp on a Dolmenwood date names, if the
// stamp fits the date: that visit is over, and the date falls between its
// return and the next visit's entry. Otherwise -1, and the date is read alone.
function returnStampIndex(visits: FairyVisit[], date: CalendarDate, sinceReturnFrom: string | undefined): number {
  if (!sinceReturnFrom) return -1;
  const k = visits.findIndex((v) => v.id === sinceReturnFrom);
  if (k < 0) return -1;
  const returnedOn = visits[k].returnedOn;
  const next = visits[k + 1];
  if (!returnedOn || daysBetween(returnedOn, date) < 0) return -1;
  if (next && daysBetween(date, next.enteredOn) < 0) return -1;
  return k;
}

/**
 * Best-effort lived day for a Dolmenwood date: the start of the days-lived
 * counter, or a record saved before lived time existed. With no Fairy visits
 * it's exact: the days since Year 1, day 1. A date inside a visit's away time
 * maps to the moment the character returned; a visit's entry date maps to
 * just before they left, unless `sinceReturnFrom` names that visit: then the
 * date is after its return (the same day, when no Dolmenwood time passed).
 */
export function getLivedDayAtDolmenwoodDate(character: WithVisits, date: CalendarDate, sinceReturnFrom?: string): number {
  const visits = getFairyVisits(character);
  const stamped = returnStampIndex(visits, date, sinceReturnFrom);
  if (stamped >= 0) return livedDayAtReturn(visits, stamped) + stretch(visits[stamped].returnedOn ?? date, date);
  let cursor = LIVED_TIME_EPOCH;
  let lived = 0;
  for (const visit of visits) {
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
 * way to fix a wrong return date. The calendar's controls refuse an earlier
 * date and say why, rather than changing what the player picked.
 */
export function getEarliestDolmenwoodDate(character: WithVisits): CalendarDate {
  const visits = getFairyVisits(character);
  const last = visits[visits.length - 1];
  return { ...(last ? last.returnedOn ?? last.enteredOn : LIVED_TIME_EPOCH) };
}

/**
 * The visit the character was away on during a Dolmenwood date: after the
 * day they entered and before the day they came back. They didn't live
 * those days, so the days-lived counter can't start on one.
 */
export function getVisitAwayOn(character: WithVisits, date: CalendarDate): FairyVisit | null {
  return (
    getFairyVisits(character).find(
      (v) => v.returnedOn != null && daysBetween(v.enteredOn, date) > 0 && daysBetween(date, v.returnedOn) > 0,
    ) ?? null
  );
}

// The counter start for a date, stamped with the visit the character had
// last come back from by then. A visit's entry date counts as before they
// left, as in getLivedDayAtDolmenwoodDate.
function countingStartAt(character: WithVisits, date: CalendarDate): CountingStart {
  const start: CountingStart = { day: date.day, month: date.month, year: date.year };
  const visits = getFairyVisits(character);
  for (let i = visits.length - 1; i >= 0; i--) {
    const visit = visits[i];
    if (daysBetween(visit.enteredOn, date) <= 0) continue; // on or before the day they entered
    if (visit.returnedOn && daysBetween(visit.returnedOn, date) >= 0) start.sinceReturnFrom = visit.id;
    break;
  }
  return start;
}

/**
 * A counter start that fits the visits, for saves and returns. A stamp that
 * fits the date is kept, since it's what makes a shared entry-and-return day
 * read as after the return; otherwise the stamp comes from the date. A date
 * while the character was away moves to the day they came back, which counts
 * the same days.
 */
export function fitCountingStart(character: WithVisits, start: CountingStart): CountingStart {
  const date = { day: start.day, month: start.month, year: start.year };
  if (returnStampIndex(getFairyVisits(character), date, start.sinceReturnFrom) >= 0) {
    return { ...date, sinceReturnFrom: start.sinceReturnFrom };
  }
  return countingStartAt(character, getVisitAwayOn(character, date)?.returnedOn ?? date);
}

/**
 * Set the date the days-lived counter counts from. Null if it's after
 * today's Dolmenwood date, or a day the character was away in Fairy
 * (getVisitAwayOn says which visit).
 */
export function setLivedTimeStart(character: WithClock, date: CalendarDate): Partial<Character> | null {
  if (daysBetween(character.currentDate, date) > 0 || getVisitAwayOn(character, date)) return null;
  return { livedTimeStart: countingStartAt(character, date) };
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
): Pick<ActiveSpellStudy, 'startedOn' | 'startedLivedDay' | 'startedInFairy' | 'sinceReturnFrom'> {
  const now = getCurrentTimelinePoint(character);
  const useNow = livedDay === undefined || !Number.isFinite(livedDay) || livedDay >= now.livedDay;
  const startedLivedDay = useNow ? now.livedDay : Math.max(0, Math.floor(livedDay));
  const point = useNow ? now : getTimelinePointAtLivedDay(character, startedLivedDay);
  return {
    startedOn: point.date,
    startedLivedDay,
    ...(point.fairyDate ? { startedInFairy: point.fairyDate } : {}),
    ...(point.sinceReturnFrom ? { sinceReturnFrom: point.sinceReturnFrom } : {}),
  };
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

/** Whether a date is within the calendar the sheet accepts (Year 1 to MAX_YEAR). */
export function isWithinCalendar(date: CalendarDate): boolean {
  return date.year >= 1 && date.year <= MAX_YEAR;
}

// The sentence for a return's automatic journal entry.
function describeReturn(visitNumber: number, daysInFairy: number, enteredOn: CalendarDate, returnedOn: CalendarDate): string {
  const stay = daysInFairy > 0 ? `after ${pluralize(daysInFairy, 'day', { grouping: true })}` : 'without spending a day there';
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
    ...getCurrentPlace(character),
    text: `Entered Fairy (visit ${visits.length + 1}).`,
  };
  const fairyVisits = [...visits, visit];
  return {
    fairyVisits,
    journalEntries: [...(character.journalEntries ?? []), entry],
    ...refitCountingStart(character, fairyVisits, enteredOn),
  };
}

// A days-lived counter start after the day a visit began (possible if the
// calendar was moved back before it) needs refitting when the visit starts
// or ends: its stamp no longer fits, and after the return it may fall in
// time spent away (see fitCountingStart).
function refitCountingStart(
  character: Character,
  fairyVisits: FairyVisit[],
  enteredOn: CalendarDate,
): Pick<Character, 'livedTimeStart'> | Record<string, never> {
  const start = character.livedTimeStart;
  if (!start || daysBetween(enteredOn, start) <= 0) return {};
  return { livedTimeStart: fitCountingStart({ fairyVisits }, start) };
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
 * isn't in Fairy or the date is before the day they entered. A days-lived
 * counter start in the time they were away moves to the return date, which
 * counts the same days; a study start the timeline no longer reaches (the
 * calendar was moved back past it, or days in Fairy were taken back) moves to
 * wherever its lived day now falls.
 *
 * `cameBackIn` is the map hex the party came back in ('' for none), by
 * default the map's current hex: where they left from, as the map still
 * shows it. The return's journal entry is stamped with it, and with where
 * they're back at (getReturnPlace), which becomes the party's current
 * location; the map's current hex moves to the hex, if it's another.
 */
export function returnFromFairy(
  character: Character,
  returnedOn: CalendarDate,
  cameBackIn?: HexCoord | '',
): Partial<Character> | null {
  const open = getOpenFairyVisit(character);
  if (!open || !canReturnOn(open, returnedOn) || !isWithinCalendar(returnedOn)) return null;
  const visits = getFairyVisits(character);
  const date = { day: returnedOn.day, month: returnedOn.month, year: returnedOn.year };
  const { hex, location, sameHex } = getReturnPlace(character, cameBackIn);
  const entry: JournalEntry = {
    id: crypto.randomUUID(),
    date: { ...date },
    fairyEvent: { visitId: open.id, kind: 'returned' },
    location,
    ...(hex ? { hex } : {}),
    text: describeReturn(visits.length, open.daysInFairy, open.enteredOn, date),
  };
  const fairyVisits = visits.map((v) => (v.id === open.id ? { ...v, returnedOn: { ...date } } : v));
  return {
    fairyVisits,
    currentDate: { ...date },
    journalEntries: [...(character.journalEntries ?? []), entry],
    currentLocation: location,
    ...(sameHex ? {} : { currentLocationHex: hex }),
    ...refitCountingStart(character, fairyVisits, open.enteredOn),
    ...refitOvertakenStudy(character, fairyVisits, open),
  };
}

/** Where the party is back at after coming back from Fairy (getReturnPlace). */
export interface ReturnPlace {
  hex: HexCoord | ''; // the map hex they came back in, or '' for none
  location: string; // where they're back at, which becomes the current location ('' for nowhere known)
  sameHex: boolean; // back in the hex they left from (or, having left from no hex, in none)
}

type PlaceFacts = Pick<Character, 'currentLocation' | 'currentLocationHex' | 'fairyVisits' | 'journalEntries' | 'mapData'>;

/**
 * Where the party is back at if they come back from Fairy now, in
 * `cameBackIn` (see returnFromFairy, which uses this, so the return dialog's
 * preview and the return agree):
 *   - back in the hex they left from (or, having left from no hex, back in
 *     none): the location they left from, as this visit's "Entered Fairy"
 *     entry recorded it, or the current location if that entry is gone.
 *     What was typed there while away was a place in Fairy;
 *   - back in another hex: the name of a place marked on that hex, if there
 *     is one;
 *   - back in no hex, having left from one: nowhere known.
 */
export function getReturnPlace(character: PlaceFacts, cameBackIn?: HexCoord | ''): ReturnPlace {
  const leftFrom = isValidHex(character.currentLocationHex) ? character.currentLocationHex : '';
  const hex = cameBackIn === undefined ? leftFrom : isValidHex(cameBackIn) ? cameBackIn : '';
  const sameHex = hex === leftFrom;
  const location = sameHex ? locationLeftFrom(character) : getPlaceNameOn(character.mapData, hex);
  return { hex, location, sameHex };
}

// Where the party left from on the open visit: the location its "Entered
// Fairy" entry recorded, or the current location if that entry is gone.
function locationLeftFrom(character: PlaceFacts): string {
  const open = getOpenFairyVisit(character);
  const entries = Array.isArray(character.journalEntries) ? character.journalEntries : [];
  const entered = open ? entries.find((e) => e?.fairyEvent?.kind === 'entered' && e.fairyEvent.visitId === open.id) : undefined;
  if (typeof entered?.location === 'string') return entered.location;
  return typeof character.currentLocation === 'string' ? character.currentLocation : '';
}

/**
 * What coming back to `place` does to where the party is, in words, for the
 * return dialog: where they're back at, or what's cleared. '' when there's
 * nothing to say (no location before or after, and no hex either way).
 */
export function describeReturnPlace(place: ReturnPlace, currentLocation: unknown): string {
  const location = place.location.trim();
  if (location) return `${place.sameHex ? 'Back at' : 'At'} ${location}${place.hex ? `, hex ${place.hex}` : ''}.`;
  const hadLocation = typeof currentLocation === 'string' && currentLocation.trim() !== '';
  const cleared = hadLocation ? 'Your location will be cleared.' : '';
  if (place.hex) return [`${place.sameHex ? 'Back in' : 'In'} hex ${place.hex}.`, cleared].filter(Boolean).join(' ');
  if (!place.sameHex) {
    return hadLocation ? "Your location and the map's current hex will be cleared." : "The map's current hex will be cleared.";
  }
  return cleared;
}

// The study with its start moved to a point on the timeline.
function studyStartingAt(active: ActiveSpellStudy, point: TimelinePoint): ActiveSpellStudy {
  const moved: ActiveSpellStudy = { ...active, startedOn: point.date };
  delete moved.startedInFairy;
  delete moved.sinceReturnFrom;
  if (point.fairyDate) moved.startedInFairy = point.fairyDate;
  if (point.sinceReturnFrom) moved.sinceReturnFrom = point.sinceReturnFrom;
  return moved;
}

// On the return from `visit`, a study start the visit's timeline no longer
// reaches moves to wherever its lived day falls: a day in Fairy, or a date
// after coming back. Progress doesn't change. That's a Dolmenwood start after
// the day the visit began (the calendar was moved back past it, then the
// character went into Fairy), or a start on a day of this visit it never got
// to (days were taken back with -1 day). Journal entries and spells keep the
// dates they were written with.
function refitOvertakenStudy(
  character: Character,
  fairyVisits: FairyVisit[],
  visit: FairyVisit,
): Pick<Character, 'spellStudy'> | Record<string, never> {
  const active = character.spellStudy?.active;
  const progress = getStudyProgress(character);
  if (!active || !progress) return {};
  const fairyStart = active.startedInFairy;
  const overtaken = fairyStart
    ? fairyStart.visitId === visit.id && fairyStart.day > fairyDayNumber(visit.daysInFairy)
    : daysBetween(visit.enteredOn, active.startedOn) > 0;
  if (!overtaken) return {};
  const point = getTimelinePointAtLivedDay({ fairyVisits }, progress.startedLivedDay);
  // A lived day beyond the calendar's last day can't be shown as a date; keep the old one.
  if (!isWithinCalendar(point.date)) return {};
  return { spellStudy: { ...character.spellStudy, active: studyStartingAt(active, point) } };
}

/** What correcting the last return date changes; the dialog previews it. */
export interface ReturnEditPlan {
  patch: Partial<Character>;
  today: CalendarDate;          // today's Dolmenwood date after the edit
  movedEntries: number;         // journal entries written since coming back
  movedSpells: number;          // spells learned since coming back
  movesStudy: boolean;          // the study in progress began since coming back
  movesCountingStart: boolean;  // the days-lived counter starts since coming back
}

/**
 * Correct the date the character came back from their most recent visit, and
 * move everything after the return with it by the same number of days, so
 * nothing lived is gained or lost:
 *   - today's Dolmenwood date (never earlier than the new return date);
 *   - journal entries and learned spells made since coming back: stamped
 *     `sinceReturnFrom` with this visit and dated on or after the old return.
 *     Records made in Fairy, and the entry the app wrote on entering, stay as
 *     they are;
 *   - the study in progress, if it began since coming back (stamped like a
 *     record): its start is worked out again from the lived day it began
 *     (getTimelinePointAtLivedDay);
 *   - the days-lived counter's start, if it's since coming back (stamped like
 *     a record), so the count stays the same;
 *   - the return's own journal entry, which is redated and has its sentence
 *     rewritten (any text the player added stays).
 * Because the stamps don't change, editing twice equals editing once, and
 * editing back restores everything. Null if there's no completed visit, the
 * date is before the day they entered, or today or anything else it moves
 * would pass the calendar's last day (something dated after today can be
 * moved further than today, which stays on or before LATEST_DATE).
 */
export function planReturnEdit(character: Character, returnedOn: CalendarDate): ReturnEditPlan | null {
  const visit = getEditableReturnVisit(character);
  const oldReturn = visit?.returnedOn;
  if (!visit || !oldReturn || !canReturnOn(visit, returnedOn) || !isWithinCalendar(returnedOn)) return null;
  const visits = getFairyVisits(character);
  const date = { day: returnedOn.day, month: returnedOn.month, year: returnedOn.year };
  const shift = daysBetween(oldReturn, date);
  const shifted = shiftDate(character.currentDate, shift);
  const today = daysBetween(date, shifted) < 0 ? { ...date } : shifted; // guards imported data
  if (!isWithinCalendar(today)) return null;
  const fairyVisits = visits.map((v) => (v.id === visit.id ? { ...v, returnedOn: { ...date } } : v));
  // Made in Dolmenwood since coming back from this visit.
  const sinceReturn = (on: CalendarDate | undefined, stamp: string | undefined): on is CalendarDate =>
    shift !== 0 && stamp === visit.id && on != null && daysBetween(oldReturn, on) >= 0;
  // Each moved date must stay within the calendar too.
  let pastCalendar = false;
  const moved = (on: CalendarDate): CalendarDate => {
    const next = shiftDate(on, shift);
    if (!isWithinCalendar(next)) pastCalendar = true;
    return next;
  };

  const oldText = describeReturn(visits.length, visit.daysInFairy, visit.enteredOn, oldReturn);
  const newText = describeReturn(visits.length, visit.daysInFairy, visit.enteredOn, date);
  let movedEntries = 0;
  const journalEntries = (character.journalEntries ?? []).map((entry) => {
    if (entry.fairyEvent?.visitId === visit.id && entry.fairyEvent.kind === 'returned') {
      return { ...entry, date: { ...date }, text: entry.text.split(oldText).join(newText) };
    }
    if (entry.fairyEvent || entry.fairyDate || !sinceReturn(entry.date, entry.sinceReturnFrom)) return entry;
    movedEntries += 1;
    return { ...entry, date: moved(entry.date) };
  });

  let movedSpells = 0;
  const knownSpells = (character.knownSpells ?? []).map((spell) => {
    if (spell.learnedInFairy || !sinceReturn(spell.learnedAt, spell.sinceReturnFrom)) return spell;
    movedSpells += 1;
    return { ...spell, learnedAt: moved(spell.learnedAt) };
  });

  const patch: Partial<Character> = { fairyVisits, currentDate: today, journalEntries };
  if (movedSpells > 0) patch.knownSpells = knownSpells;

  // The study in progress moves if it began since coming back. Its start is
  // worked out again from the lived day it began, read as after this return
  // (which matters when the visit had no days in Fairy).
  const active = character.spellStudy?.active ?? null;
  const progress = getStudyProgress(character);
  const movesStudy = Boolean(
    active && progress && !active.startedInFairy && sinceReturn(active.startedOn, active.sinceReturnFrom),
  );
  if (movesStudy && active && progress) {
    const point = getTimelinePointAtLivedDay({ fairyVisits }, progress.startedLivedDay, visit.id);
    if (!isWithinCalendar(point.date)) pastCalendar = true;
    patch.spellStudy = { ...character.spellStudy, active: studyStartingAt(active, point) };
  }

  const start = character.livedTimeStart;
  const movesCountingStart = Boolean(start) && sinceReturn(start, start.sinceReturnFrom);
  if (movesCountingStart) patch.livedTimeStart = { ...moved(start), sinceReturnFrom: visit.id };
  if (pastCalendar) return null;
  return { patch, today, movedEntries, movedSpells, movesStudy, movesCountingStart };
}

/** Correct the last return date; see planReturnEdit. */
export function editReturnDate(character: Character, returnedOn: CalendarDate): Partial<Character> | null {
  return planReturnEdit(character, returnedOn)?.patch ?? null;
}
