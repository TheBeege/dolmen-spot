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
// (day buttons, month/day/year inputs, returning from Fairy, an import)
// stays in step without having to remember to update a second number.
//
// The timeline alternates Dolmenwood stretches and Fairy visits:
//
//   epoch ──Dolmenwood──▶ enter #1 ─Fairy─ return #1 ──Dolmenwood──▶ enter #2 ─Fairy─ … ──▶ now
//
// Lived days = the Dolmenwood stretches + the days spent in Fairy. Dolmenwood
// time that passes between entering and returning isn't lived. Inside a
// stretch, any change to the date counts as lived time, including manual
// corrections backwards. A stretch never counts below zero, so moving the
// date back past the day the character returned from Fairy can't make lived
// time negative.

import type {
  ActiveSpellStudy,
  CalendarDate,
  Character,
  FairyDate,
  FairyVisit,
  JournalEntry,
} from './types';
import { MONTHS, DAYS_IN_YEAR, addDays, daysBetween, formatCalendarDate } from './gamedata';

/**
 * Lived time is counted from Year 1, day 1: the app's campaign start and the
 * default date for new characters. Lived day 0 is that day; a character who
 * has never been to Fairy has lived exactly as many days as the calendar has
 * advanced since then.
 */
export const LIVED_TIME_EPOCH: CalendarDate = { day: 1, month: 0, year: 1 };

type WithVisits = Pick<Character, 'fairyVisits'>;
type WithClock = Pick<Character, 'fairyVisits' | 'currentDate'>;

// A Dolmenwood stretch between two dates, in days. Never negative.
function stretch(from: CalendarDate, to: CalendarDate): number {
  return Math.max(0, daysBetween(from, to));
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

/** 1-based number of a visit, or null if the id isn't one of this character's visits. */
export function getFairyVisitNumber(character: WithVisits, visitId: string): number | null {
  const index = getFairyVisits(character).findIndex((v) => v.id === visitId);
  return index === -1 ? null : index + 1;
}

/** Today's Fairy date while the character is in Fairy, else undefined. */
export function getCurrentFairyDate(character: WithVisits): FairyDate | undefined {
  const open = getOpenFairyVisit(character);
  return open ? { visitId: open.id, day: fairyDayNumber(open.daysInFairy) } : undefined;
}

// ── Lived time ───────────────────────────────────────────────────────

export interface LivedTime {
  totalDays: number;      // days lived since LIVED_TIME_EPOCH
  dolmenwoodDays: number; // ...of which in Dolmenwood
  fairyDays: number;      // ...of which in Fairy
  visitCount: number;     // visits to Fairy, including one still in progress
  awayDays: number;       // Dolmenwood days that passed while away, over completed visits
}

export function getLivedTime(character: WithClock): LivedTime {
  const visits = getFairyVisits(character);
  let cursor: CalendarDate | null = LIVED_TIME_EPOCH;
  let dolmenwoodDays = 0;
  let fairyDays = 0;
  let awayDays = 0;
  for (const visit of visits) {
    if (!cursor) break; // only the last visit can be open
    dolmenwoodDays += stretch(cursor, visit.enteredOn);
    fairyDays += Math.max(0, visit.daysInFairy);
    if (visit.returnedOn) {
      awayDays += stretch(visit.enteredOn, visit.returnedOn);
      cursor = visit.returnedOn;
    } else {
      cursor = null; // still in Fairy: Dolmenwood's calendar waits for them
    }
  }
  if (cursor) dolmenwoodDays += stretch(cursor, character.currentDate);
  return {
    totalDays: dolmenwoodDays + fairyDays,
    dolmenwoodDays,
    fairyDays,
    visitCount: visits.length,
    awayDays,
  };
}

/** Days the character has lived since LIVED_TIME_EPOCH, in Dolmenwood and in Fairy. */
export function getLivedDays(character: WithClock): number {
  return getLivedTime(character).totalDays;
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
 * On a boundary, such as the day they stepped into Fairy or back out, the
 * Dolmenwood side wins, except for a visit that's still open.
 */
export function getTimelinePointAtLivedDay(character: WithVisits, livedDay: number): TimelinePoint {
  const target = Math.max(0, Math.floor(livedDay));
  let cursor = LIVED_TIME_EPOCH;
  let lived = 0;
  for (const visit of getFairyVisits(character)) {
    const dolmenwood = stretch(cursor, visit.enteredOn);
    if (target <= lived + dolmenwood) return { date: addDays(cursor, target - lived) };
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
  return { date: addDays(cursor, target - lived) };
}

/**
 * Best-effort lived day for a bare Dolmenwood date, for records saved before
 * lived time existed. With no Fairy visits it's exact: the days since
 * LIVED_TIME_EPOCH. A date inside a visit's away time maps to the moment the
 * character returned; a visit's entry date maps to just before they left.
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

/** Whole weeks of progress on the active spell study (0 when there's none). */
export function getStudyProgressWeeks(
  character: Pick<Character, 'spellStudy' | 'fairyVisits' | 'currentDate'>,
): number {
  return getStudyProgress(character)?.elapsedWeeks ?? 0;
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

// ── Calendar-aware arithmetic (for setting the return date) ──────────

/** Add whole months, keeping the day of the month where it fits (31 Chysting + 1 month = 29 Lillipythe). */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
  const perYear = MONTHS.length;
  const index = (date.year - 1) * perYear + date.month + Math.trunc(months);
  const year = Math.floor(index / perYear) + 1;
  const month = index - (year - 1) * perYear;
  return { day: Math.min(date.day, MONTHS[month].days), month, year };
}

export function addYears(date: CalendarDate, years: number): CalendarDate {
  return addMonths(date, Math.trunc(years) * MONTHS.length);
}

export interface ElapsedTime {
  years: number;
  months: number;
  weeks: number;
  days: number;
}

/** A date plus some years, months, weeks and days, applied in that order. */
export function addElapsedTime(date: CalendarDate, elapsed: ElapsedTime): CalendarDate {
  return addDays(addMonths(date, elapsed.years * MONTHS.length + elapsed.months), elapsed.weeks * 7 + elapsed.days);
}

function plural(count: number, unit: string): string {
  if (count === 0) return '';
  return `${count.toLocaleString('en-US')} ${unit}${count === 1 ? '' : 's'}`;
}

function joinParts(parts: string[]): string {
  const kept = parts.filter(Boolean);
  if (kept.length <= 1) return kept[0] ?? '';
  return `${kept.slice(0, -1).join(', ')} and ${kept[kept.length - 1]}`;
}

/** A span of Dolmenwood time in calendar terms, e.g. "3 years, 2 months and 5 days". */
export function describeDolmenwoodSpan(from: CalendarDate, to: CalendarDate): string {
  if (daysBetween(from, to) <= 0) return 'no time';
  const perYear = MONTHS.length;
  let months = (to.year - from.year) * perYear + (to.month - from.month);
  if (months > 0 && daysBetween(addMonths(from, months), to) < 0) months -= 1;
  const days = daysBetween(addMonths(from, months), to);
  return joinParts([
    plural(Math.floor(months / perYear), 'year'),
    plural(months % perYear, 'month'),
    plural(days, 'day'),
  ]);
}

/** A number of days as years and days. Exact, since every Dolmenwood year has the same length. */
export function describeDays(totalDays: number): string {
  const days = Math.max(0, Math.floor(totalDays));
  if (days === 0) return 'no time';
  return joinParts([plural(Math.floor(days / DAYS_IN_YEAR), 'year'), plural(days % DAYS_IN_YEAR, 'day')]);
}

/**
 * Player's Book p93, "Quests in Fairy" (optional rule): while a character
 * journeys in Fairy to receive a rune, 2d20 days pass in the mortal world.
 */
export function roll2d20(random: () => number = Math.random): { dice: [number, number]; total: number } {
  const d20 = () => Math.min(20, Math.floor(random() * 20) + 1);
  const dice: [number, number] = [d20(), d20()];
  return { dice, total: dice[0] + dice[1] };
}

// ── Display ──────────────────────────────────────────────────────────

/** "3 Grimvold, Year 2" */
export function formatShortDate(date: CalendarDate): string {
  return `${date.day} ${MONTHS[date.month]?.name ?? 'Unknown'}, Year ${date.year}`;
}

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

/** A character can come back on the day they entered or later, never earlier. */
export function canReturnOn(visit: FairyVisit, date: CalendarDate): boolean {
  return daysBetween(visit.enteredOn, date) >= 0;
}

export function describeReturn(
  visitNumber: number,
  daysInFairy: number,
  enteredOn: CalendarDate,
  returnedOn: CalendarDate,
): string {
  const stay = daysInFairy > 0 ? `after ${plural(daysInFairy, 'day')}` : 'without spending a day there';
  const passed = daysBetween(enteredOn, returnedOn) > 0
    ? `${describeDolmenwoodSpan(enteredOn, returnedOn)} passed in Dolmenwood`
    : 'no time passed in Dolmenwood';
  return `Returned from Fairy (visit ${visitNumber}) ${stay}; ${passed}.`;
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
    location: character.currentLocation ?? '',
    text: describeReturn(visits.length, open.daysInFairy, open.enteredOn, date),
  };
  return {
    fairyVisits: visits.map((v) => (v.id === open.id ? { ...v, returnedOn: { ...date } } : v)),
    currentDate: { ...date },
    journalEntries: [...(character.journalEntries ?? []), entry],
  };
}
