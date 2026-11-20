'use client';

// Fairy time controls for the Adventuring tab's calendar: entering Fairy,
// counting days there, coming back (or fixing the date you came back), and
// the days-lived counter. The time math lives in src/lib/livedTime.ts.

import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref, type RefObject } from 'react';
import type { CalendarDate, Character, FairyVisit } from '@/lib/types';
import {
  MAX_YEAR,
  MONTHS,
  addElapsedTime,
  daysBetween,
  describeDays,
  describeDolmenwoodSpan,
  formatCalendarDate,
  formatShortDate,
  fromAbsoluteDay,
  getAbsoluteDay,
  plural,
  type ElapsedTime,
} from '@/lib/gamedata';
import {
  LIVED_TIME_EPOCH,
  canReturnOn,
  editReturnDate,
  enterFairy,
  getEditableReturnVisit,
  getFairyVisits,
  getLivedTime,
  getOpenFairyVisit,
  returnFromFairy,
  roll2d20,
  setDaysInFairy,
  setLivedTimeStart,
} from '@/lib/livedTime';

interface FairyTimeProps {
  character: Character;
  onChange: (updates: Partial<Character>) => void;
}

// ── Styles ───────────────────────────────────────────────────────────
// Text colours are chosen to stay at WCAG AA contrast on the card colours.

const inputBase =
  'bg-[#1a1a2e] border text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a]';
const inputClass = (invalid: boolean) => `${inputBase} ${invalid ? 'border-[#ff8a6a]' : 'border-[#5a3a28]'}`;
const labelClasses = 'block text-[#c4a35a] text-sm font-semibold mb-1';
const errorClasses = 'text-[#ff8a6a] text-xs mt-1';

// Fairy gets a violet accent so its state is easy to tell apart from
// Dolmenwood's gold-and-green calendar.
const fairyButtonClasses =
  'bg-[#4a3a6b] hover:bg-[#5c4a82] text-[#f5e6c8] rounded px-3 py-1 transition-colors ' +
  'disabled:bg-[#3a3352] disabled:text-[#f5e6c8]/70 disabled:cursor-not-allowed ' +
  'aria-disabled:bg-[#3a3352] aria-disabled:hover:bg-[#3a3352] aria-disabled:text-[#f5e6c8]/70 aria-disabled:cursor-not-allowed';
const greenButtonClasses =
  'bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-4 py-1.5 font-semibold transition-colors ' +
  'disabled:bg-[#2a3a2b] disabled:text-[#f5e6c8]/70 disabled:cursor-not-allowed';
const quietButtonClasses =
  'text-[#f5e6c8]/80 hover:text-[#f5e6c8] border border-[#5a3a28] rounded px-3 py-1 transition-colors';
const linkButtonClasses = 'text-[#c4a35a] hover:underline rounded';

// ── Number fields ────────────────────────────────────────────────────

// Upper limits for the number fields. The date math copes with any size;
// numbers this large are almost certainly typos.
const MAX_DAYS_PER_ADD = 9999;
const ELAPSED_LIMITS: ElapsedTime = { years: 9999, months: 9999, weeks: 9999, days: 99999 };

// What the player typed. `badInput`: the browser couldn't read it as a number.
interface NumberField {
  text: string;
  badInput: boolean;
}
const BLANK: NumberField = { text: '', badInput: false };
const fieldFrom = (n: number): NumberField => ({ text: String(n), badInput: false });

type Reading = { value: number; error?: undefined } | { value?: undefined; error: string };

// Read a field as a whole number from min to max, without guessing: "2.5",
// "45" for a day, or a cleared field each get a message instead of being
// rounded, clamped or replaced. `blank` is what an empty field means: a
// value, or the message to show.
function readWholeNumber(field: NumberField, label: string, min: number, max: number, blank: number | string): Reading {
  const text = field.text.trim();
  if (!field.badInput && text === '') return typeof blank === 'number' ? { value: blank } : { error: blank };
  const n = Number(text);
  if (field.badInput || !Number.isInteger(n)) return { error: `${label} must be a whole number.` };
  if (n < min || n > max) {
    return { error: `${label} must be from ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}.` };
  }
  return { value: n };
}

function NumberInput({
  label,
  field,
  onChange,
  error,
  min,
  max,
  inputRef,
  className = '',
}: {
  label: string;
  field: NumberField;
  onChange: (field: NumberField) => void;
  error?: string;
  min: number;
  max: number;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
}) {
  const errorId = useId();
  return (
    <div className={className}>
      <label className="block">
        <span className={labelClasses}>{label}</span>
        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          step={1}
          min={min}
          max={max}
          value={field.text}
          placeholder={min === 0 ? '0' : undefined}
          onChange={(e) => onChange({ text: e.target.value, badInput: e.target.validity.badInput })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`${inputClass(Boolean(error))} w-full`}
        />
      </label>
      {error && (
        <p id={errorId} className={errorClasses}>
          {error}
        </p>
      )}
    </div>
  );
}

// ── Date fields (month, day, year) ───────────────────────────────────

interface DateDraft {
  month: number;
  day: NumberField;
  year: NumberField;
}
const draftFrom = (date: CalendarDate): DateDraft => ({ month: date.month, day: fieldFrom(date.day), year: fieldFrom(date.year) });

function readDate(draft: DateDraft): { date?: CalendarDate; dayError?: string; yearError?: string } {
  const day = readWholeNumber(draft.day, 'Day', 1, MONTHS[draft.month].days, 'Enter a day.');
  const year = readWholeNumber(draft.year, 'Year', 1, MAX_YEAR, 'Enter a year.');
  if (day.error !== undefined || year.error !== undefined) return { dayError: day.error, yearError: year.error };
  return { date: { day: day.value, month: draft.month, year: year.value } };
}

function DateFields({
  draft,
  onChange,
  monthRef,
}: {
  draft: DateDraft;
  onChange: (draft: DateDraft) => void;
  monthRef?: Ref<HTMLSelectElement>;
}) {
  const { dayError, yearError } = readDate(draft);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <label className="block">
        <span className={labelClasses}>Month</span>
        <select
          ref={monthRef}
          value={draft.month}
          onChange={(e) => onChange({ ...draft, month: Number(e.target.value) })}
          className={`${inputClass(false)} w-full`}
        >
          {MONTHS.map((m, i) => (
            <option key={m.name} value={i}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <NumberInput
        label="Day"
        field={draft.day}
        min={1}
        max={MONTHS[draft.month].days}
        error={dayError}
        onChange={(day) => onChange({ ...draft, day })}
      />
      <NumberInput
        label="Year"
        field={draft.year}
        min={1}
        max={MAX_YEAR}
        error={yearError}
        onChange={(year) => onChange({ ...draft, year })}
        className="col-span-2 sm:col-span-1"
      />
    </div>
  );
}

// Move focus to a ref's element after the next render, once it exists.
export function useFocusAfterRender() {
  const pending = useRef<RefObject<HTMLElement | null> | null>(null);
  useEffect(() => {
    const target = pending.current;
    if (!target) return;
    pending.current = null;
    target.current?.focus();
  });
  return (target: RefObject<HTMLElement | null>) => {
    pending.current = target;
  };
}

// ── In Fairy: status and day controls ────────────────────────────────

/** Shown at the top of the calendar while the character is in Fairy. */
export function FairyStatusPanel({
  character,
  onChange,
  statusRef,
  onReturned,
}: FairyTimeProps & {
  statusRef?: Ref<HTMLHeadingElement>;
  onReturned?: () => void; // after a return; the parent moves focus, since this panel goes away
}) {
  const visit = getOpenFairyVisit(character);
  const statusId = useId();
  const customErrorId = useId();
  const [custom, setCustom] = useState<NumberField>(BLANK);
  const [returning, setReturning] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const customRef = useRef<HTMLInputElement>(null);
  if (!visit) return null;

  const visitNumber = getFairyVisits(character).length;
  const atFirstDay = visit.daysInFairy === 0;
  const customReading = readWholeNumber(custom, 'Days', 1, MAX_DAYS_PER_ADD, 'Enter a number of days.');
  // Don't nag about an empty field; just keep Add disabled.
  const customError = custom.text !== '' || custom.badInput ? customReading.error : undefined;

  const changeDays = (delta: number) => {
    const patch = setDaysInFairy(character, visit.daysInFairy + delta);
    if (patch) onChange(patch);
  };

  // aria-disabled rather than disabled, so the button keeps focus at day 1.
  const takeBackDay = () => {
    if (!atFirstDay) changeDays(-1);
  };

  const addCustomDays = () => {
    if (customReading.value === undefined) return;
    changeDays(customReading.value);
    setCustom(BLANK);
    customRef.current?.focus();
  };

  const closeDialog = (outcome: DialogOutcome) => {
    setReturning(false);
    if (outcome === 'cancelled') openerRef.current?.focus();
    else onReturned?.();
  };

  return (
    <section aria-labelledby={statusId} className="border border-[#8a6fb0]/60 bg-[#8a6fb0]/10 rounded-lg p-3 mb-4">
      <div className="text-center mb-3">
        <h3
          id={statusId}
          ref={statusRef}
          tabIndex={-1}
          className="text-2xl font-bold text-[#c9b3f0] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b3f0]/60"
        >
          In Fairy &mdash; day {visit.daysInFairy + 1}
        </h3>
        <p className="text-[#f5e6c8]/80 text-sm mt-1">
          <span className="whitespace-nowrap">entered {formatShortDate(visit.enteredOn)}</span> &middot;{' '}
          <span className="whitespace-nowrap">visit {visitNumber}</span>
        </p>
      </div>

      <div className="flex flex-wrap items-start justify-center gap-2 mb-3">
        <button
          type="button"
          onClick={takeBackDay}
          aria-disabled={atFirstDay}
          title={atFirstDay ? 'Already on the day you entered' : 'Take back a day in Fairy'}
          className={fairyButtonClasses}
        >
          &minus;1 day
        </button>
        <button type="button" onClick={() => changeDays(1)} className={fairyButtonClasses}>
          +1 day
        </button>
        <button type="button" onClick={() => changeDays(7)} className={fairyButtonClasses}>
          +1 week
        </button>
        <div className="flex items-start gap-1">
          <div>
            <input
              ref={customRef}
              type="number"
              inputMode="numeric"
              step={1}
              min={1}
              max={MAX_DAYS_PER_ADD}
              value={custom.text}
              onChange={(e) => setCustom({ text: e.target.value, badInput: e.target.validity.badInput })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addCustomDays();
              }}
              placeholder="Days"
              aria-label="Number of days to add in Fairy"
              aria-invalid={customError ? true : undefined}
              aria-describedby={customError ? customErrorId : undefined}
              className={`${inputClass(Boolean(customError))} w-20`}
            />
            {customError && (
              <p id={customErrorId} className={`${errorClasses} max-w-[11rem]`}>
                {customError}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={addCustomDays}
            disabled={customReading.value === undefined}
            className={fairyButtonClasses}
          >
            Add
          </button>
        </div>
      </div>

      <div className="text-center">
        <button type="button" ref={openerRef} onClick={() => setReturning(true)} className={greenButtonClasses}>
          Return to Dolmenwood&hellip;
        </button>
        <p className="text-[#f5e6c8]/80 text-xs mt-2">
          Fairy is timeless. Dolmenwood&apos;s calendar waits on the day you entered, and these buttons count the
          days you live in Fairy.
        </p>
      </div>

      {returning && (
        <FairyDateDialog
          mode="return"
          character={character}
          visit={visit}
          visitNumber={visitNumber}
          onChange={onChange}
          onClose={closeDialog}
        />
      )}
    </section>
  );
}

// ── Days lived, Fairy visits, and entering Fairy ─────────────────────

/** The days-lived counter, its start date, a compact visit summary, and the Enter Fairy control. */
export function LivedTimePanel({
  character,
  onChange,
  onEntered,
}: FairyTimeProps & {
  onEntered?: () => void; // after entering; the parent moves focus to the Fairy status
}) {
  const [confirmingEntry, setConfirmingEntry] = useState(false);
  const [showVisits, setShowVisits] = useState(false);
  const [editingStart, setEditingStart] = useState(false);
  const [editingReturn, setEditingReturn] = useState(false);
  const enterRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const changeStartRef = useRef<HTMLButtonElement>(null);
  const editReturnRef = useRef<HTMLButtonElement>(null);
  const focusAfterRender = useFocusAfterRender();
  const visitsId = useId();

  const lived = getLivedTime(character);
  const visits = getFairyVisits(character);
  const inFairy = getOpenFairyVisit(character) !== null;
  const editableVisit = getEditableReturnVisit(character);

  const openConfirmation = () => {
    setConfirmingEntry(true);
    focusAfterRender(confirmRef);
  };
  const cancelConfirmation = () => {
    setConfirmingEntry(false);
    focusAfterRender(enterRef);
  };
  const handleEnter = () => {
    const patch = enterFairy(character);
    setConfirmingEntry(false);
    if (!patch) return;
    onEntered?.();
    onChange(patch);
  };

  const closeStartEditor = () => {
    setEditingStart(false);
    focusAfterRender(changeStartRef);
  };
  const saveStart = (date: CalendarDate) => {
    const patch = setLivedTimeStart(character, date);
    if (patch) onChange(patch);
    closeStartEditor();
  };

  const closeReturnEditor = () => {
    setEditingReturn(false);
    focusAfterRender(editReturnRef);
  };

  return (
    <div className="mt-4 bg-[#1a1a2e] rounded p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div>
            <span className="text-[#c4a35a] text-sm font-semibold">Days lived:</span>{' '}
            <span className="text-[#f5e6c8] text-lg font-bold">{lived.totalDays.toLocaleString('en-US')}</span>
          </div>
          <div className="text-[#f5e6c8]/80 text-xs">
            since {formatShortDate(lived.countingFrom)}
            {!editingStart && (
              <>
                {' '}&middot;{' '}
                <button
                  type="button"
                  ref={changeStartRef}
                  onClick={() => setEditingStart(true)}
                  className={linkButtonClasses}
                >
                  Change start
                </button>
              </>
            )}
          </div>
        </div>
        {!inFairy && !confirmingEntry && (
          <button type="button" ref={enterRef} onClick={openConfirmation} className={`${fairyButtonClasses} text-sm`}>
            Enter Fairy&hellip;
          </button>
        )}
      </div>

      {editingStart && (
        <CountingFromEditor character={character} onSave={saveStart} onCancel={closeStartEditor} />
      )}

      {lived.startsAfterToday ? (
        <div className="text-[#f5e6c8]/80 text-xs mt-1">
          Counting starts on {formatShortDate(lived.countingFrom)}, which is after today&apos;s date, so no days count yet.
        </div>
      ) : visits.length === 0 ? (
        <div className="text-[#f5e6c8]/80 text-xs mt-1">No days in Fairy yet.</div>
      ) : (
        <div className="text-xs mt-1 space-y-0.5">
          <div className="text-[#f5e6c8]/80">
            {plural(lived.dolmenwoodDays, 'day')} in Dolmenwood &middot;{' '}
            <span className="text-[#c9b3f0]">{plural(lived.fairyDays, 'day')} in Fairy</span> across{' '}
            {plural(lived.visitCount, 'visit')}
          </div>
          {lived.awayDays > 0 && (
            <div className="text-[#f5e6c8]/80">
              Dolmenwood time that passed while you were away: {describeDays(lived.awayDays)}
            </div>
          )}
        </div>
      )}

      {visits.length > 0 && (
        <div className="text-xs mt-1">
          <button
            type="button"
            onClick={() => setShowVisits(!showVisits)}
            aria-expanded={showVisits}
            aria-controls={visitsId}
            className={linkButtonClasses}
          >
            {showVisits ? 'Hide' : 'Show'} Fairy visits
          </button>
          {showVisits && (
            <ol id={visitsId} className="space-y-1 mt-1">
              {visits.map((visit, i) => (
                <li key={visit.id} className="text-[#f5e6c8]/80">
                  <span className="text-[#c9b3f0] font-semibold">Visit {i + 1}:</span> {describeVisit(visit)}
                  {editableVisit?.id === visit.id && (
                    <>
                      {' '}
                      <button
                        type="button"
                        ref={editReturnRef}
                        onClick={() => setEditingReturn(true)}
                        className={linkButtonClasses}
                      >
                        Edit return date
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {confirmingEntry && (
        <div className="mt-3 border border-[#8a6fb0]/60 bg-[#8a6fb0]/10 rounded p-3">
          <p className="text-[#f5e6c8] text-sm">
            Step into Fairy on <span className="text-[#c4a35a]">{formatCalendarDate(character.currentDate)}</span>?
          </p>
          <p className="text-[#f5e6c8]/80 text-xs mt-1">
            Fairy is timeless: Dolmenwood&apos;s calendar waits on this date while the day buttons count days in
            Fairy. When you come back, you&apos;ll set the new Dolmenwood date the Referee decides.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <button type="button" ref={confirmRef} onClick={handleEnter} className={`${fairyButtonClasses} font-semibold`}>
              Enter Fairy
            </button>
            <button type="button" onClick={cancelConfirmation} className={quietButtonClasses}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {editingReturn && editableVisit && (
        <FairyDateDialog
          mode="edit"
          character={character}
          visit={editableVisit}
          visitNumber={visits.length}
          onChange={onChange}
          onClose={closeReturnEditor}
        />
      )}
    </div>
  );
}

function describeVisit(visit: FairyVisit): string {
  const entered = `entered ${formatShortDate(visit.enteredOn)}`;
  if (!visit.returnedOn) return `${entered} · ${plural(visit.daysInFairy, 'day')} in Fairy so far (still there)`;
  const passed = daysBetween(visit.enteredOn, visit.returnedOn) > 0
    ? `${describeDolmenwoodSpan(visit.enteredOn, visit.returnedOn)} later`
    : 'the same day';
  return `${entered} · ${plural(visit.daysInFairy, 'day')} in Fairy · returned ${formatShortDate(visit.returnedOn)} (${passed})`;
}

/** Inline editor for the date the days-lived counter counts from. */
function CountingFromEditor({
  character,
  onSave,
  onCancel,
}: {
  character: Character;
  onSave: (date: CalendarDate) => void;
  onCancel: () => void;
}) {
  const monthRef = useRef<HTMLSelectElement>(null);
  const [draft, setDraft] = useState(() => draftFrom(character.livedTimeStart ?? LIVED_TIME_EPOCH));
  useEffect(() => {
    monthRef.current?.focus();
  }, []);

  const { date } = readDate(draft);
  const afterToday = date !== undefined && daysBetween(character.currentDate, date) > 0;
  const valid = date !== undefined && !afterToday;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && date) onSave(date);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
      className="mt-2 border border-[#5a3a28] rounded p-3"
    >
      <p className="text-[#f5e6c8] text-sm mb-2">
        Count days lived from the day your character&apos;s story began:
      </p>
      <DateFields draft={draft} onChange={setDraft} monthRef={monthRef} />
      {afterToday && (
        <p className={errorClasses}>
          That&apos;s after today&apos;s date ({formatShortDate(character.currentDate)}). Pick today or earlier.
        </p>
      )}
      <div className="flex flex-wrap gap-2 mt-3">
        <button type="submit" disabled={!valid} className={greenButtonClasses}>
          Save start
        </button>
        <button type="button" onClick={onCancel} className={quietButtonClasses}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Coming back to Dolmenwood, or fixing the return date ─────────────

type DialogOutcome = 'cancelled' | 'saved';
type DateMode = 'elapsed' | 'exact';

const ELAPSED_FIELDS: { key: keyof ElapsedTime; label: string }[] = [
  { key: 'years', label: 'Years' },
  { key: 'months', label: 'Months' },
  { key: 'weeks', label: 'Weeks' },
  { key: 'days', label: 'Days' },
];

const BLANK_ELAPSED: Record<keyof ElapsedTime, NumberField> = { years: BLANK, months: BLANK, weeks: BLANK, days: BLANK };

/**
 * The modal for setting the Dolmenwood date a character comes back on:
 * "return" closes the open visit; "edit" corrects the last visit's return
 * date. A native <dialog> opened with showModal(), so the page behind it is
 * inert; Tab is also kept inside. The parent restores focus via onClose.
 */
function FairyDateDialog({
  mode,
  character,
  visit,
  visitNumber,
  onChange,
  onClose,
}: FairyTimeProps & {
  mode: 'return' | 'edit';
  visit: FairyVisit;
  visitNumber: number;
  onClose: (outcome: DialogOutcome) => void;
}) {
  const editing = mode === 'edit';
  const titleId = useId();
  const introId = useId();
  const ruleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const yearsRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLSelectElement>(null);
  const [dateMode, setDateMode] = useState<DateMode>(editing ? 'exact' : 'elapsed');
  const [elapsed, setElapsed] = useState(BLANK_ELAPSED);
  const [exact, setExact] = useState(() => draftFrom(visit.returnedOn ?? visit.enteredOn));
  const [roll, setRoll] = useState<{ dice: [number, number]; total: number } | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    (editing ? monthRef : yearsRef).current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [editing]);

  // ── Work out the date from whichever fields are showing ──
  const elapsedReadings = Object.fromEntries(
    ELAPSED_FIELDS.map(({ key, label }) => [key, readWholeNumber(elapsed[key], label, 0, ELAPSED_LIMITS[key], 0)]),
  ) as Record<keyof ElapsedTime, Reading>;
  let target: CalendarDate | undefined;
  if (dateMode === 'elapsed') {
    const { years, months, weeks, days } = elapsedReadings;
    if (years.value !== undefined && months.value !== undefined && weeks.value !== undefined && days.value !== undefined) {
      target = addElapsedTime(visit.enteredOn, { years: years.value, months: months.value, weeks: weeks.value, days: days.value });
    }
  } else {
    target = readDate(exact).date;
  }
  const beforeEntry = target !== undefined && !canReturnOn(visit, target);
  const valid = target !== undefined && !beforeEntry;
  const passedDays = target ? daysBetween(visit.enteredOn, target) : 0;
  const span = target ? describeDolmenwoodSpan(visit.enteredOn, target) : '';
  const passedText = passedDays > 0
    ? `${span} passed in Dolmenwood${span === plural(passedDays, 'day') ? '' : ` (${plural(passedDays, 'day')})`}`
    : 'No time passed in Dolmenwood';
  // Editing moves today's date by the same amount as the return date.
  const daysSinceReturn = visit.returnedOn ? Math.max(0, daysBetween(visit.returnedOn, character.currentDate)) : 0;
  const shift = valid && target && editing && visit.returnedOn ? daysBetween(visit.returnedOn, target) : 0;
  const newToday = shift !== 0 ? fromAbsoluteDay(getAbsoluteDay(character.currentDate) + shift) : undefined;

  // ── Actions ──
  const close = (outcome: DialogOutcome) => {
    dialogRef.current?.close(); // un-inert the page first, so the parent can move focus
    onClose(outcome);
  };

  const confirm = () => {
    if (!valid || !target) return;
    const patch = editing ? editReturnDate(character, target) : returnFromFairy(character, target);
    if (!patch) return;
    close('saved');
    onChange(patch);
  };

  const changeDateMode = (next: DateMode) => {
    if (next === dateMode) return;
    if (next === 'exact' && target) setExact(draftFrom(target)); // carry the date worked out so far over
    setDateMode(next);
    setRoll(null);
  };

  const changeElapsed = (key: keyof ElapsedTime, field: NumberField) => {
    setElapsed({ ...elapsed, [key]: field });
    setRoll(null);
  };

  const changeExact = (draft: DateDraft) => {
    setExact(draft);
    setRoll(null);
  };

  const handleRoll = () => {
    const result = roll2d20();
    setElapsed({ ...BLANK_ELAPSED, days: fieldFrom(result.total) });
    setDateMode('elapsed');
    setRoll(result);
  };

  // Keep Tab and Shift+Tab cycling inside the dialog.
  const keepFocusInside = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== 'Tab') return;
    const focusable = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => !el.matches(':disabled') && el.getClientRects().length > 0);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === e.currentTarget)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const modeButton = (value: DateMode, label: string, rounding: string) => (
    <button
      type="button"
      onClick={() => changeDateMode(value)}
      aria-pressed={dateMode === value}
      className={`flex-1 px-3 py-1.5 text-sm font-semibold transition-colors ${rounding} focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9b3f0] ${
        dateMode === value ? 'bg-[#c4a35a] text-[#1a1a2e]' : 'text-[#f5e6c8]/80 hover:text-[#f5e6c8]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={introId}
      onCancel={(e) => {
        e.preventDefault(); // Escape: close through our own path so focus is restored
        close('cancelled');
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close('cancelled'); // a click on the backdrop
      }}
      onKeyDown={keepFocusInside}
      className="mx-auto mt-[7.5dvh] w-[calc(100%-2rem)] max-w-lg max-h-[85dvh] bg-transparent p-0 text-[#f5e6c8] backdrop:bg-black/60 focus:outline-none"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          confirm();
        }}
        className="bg-[#2a2a3e] rounded-lg border border-[#8a6fb0]/60 flex flex-col max-h-[85dvh]"
      >
        <div className="flex items-center justify-between gap-2 p-4 border-b border-[#5a3a28] shrink-0">
          <h2 id={titleId} className="text-[#c4a35a] text-lg font-bold">
            {editing ? 'Edit return date' : 'Return to Dolmenwood'}
          </h2>
          <button
            type="button"
            onClick={() => close('cancelled')}
            aria-label="Close"
            className="text-[#f5e6c8]/80 hover:text-[#f5e6c8] text-2xl leading-none px-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b3f0]"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          <p id={introId} className="text-sm text-[#f5e6c8]/90">
            Fairy visit {visitNumber}: you entered on{' '}
            <span className="text-[#c4a35a]">{formatCalendarDate(visit.enteredOn)}</span>
            {editing && visit.returnedOn ? (
              <>
                , lived <span className="text-[#c9b3f0] font-semibold">{plural(visit.daysInFairy, 'day')}</span> in
                Fairy, and came back on <span className="text-[#c4a35a]">{formatCalendarDate(visit.returnedOn)}</span>.
                Set the date you really came back.
              </>
            ) : (
              <>
                {' '}and have lived <span className="text-[#c9b3f0] font-semibold">{plural(visit.daysInFairy, 'day')}</span>{' '}
                in Fairy. The Referee decides how much time passed in Dolmenwood.
              </>
            )}
          </p>

          <div role="group" aria-label="How to set the date" className="flex rounded border border-[#5a3a28]">
            {modeButton('elapsed', 'Time passed', 'rounded-l')}
            {modeButton('exact', 'Exact date', 'rounded-r')}
          </div>

          {dateMode === 'elapsed' ? (
            <div>
              <p className="text-[#f5e6c8]/80 text-xs mb-2">How much Dolmenwood time passed since you entered?</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ELAPSED_FIELDS.map(({ key, label }) => (
                  <NumberInput
                    key={key}
                    label={label}
                    field={elapsed[key]}
                    min={0}
                    max={ELAPSED_LIMITS[key]}
                    error={elapsedReadings[key].error}
                    onChange={(field) => changeElapsed(key, field)}
                    inputRef={key === 'years' ? yearsRef : undefined}
                  />
                ))}
              </div>
            </div>
          ) : (
            <DateFields draft={exact} onChange={changeExact} monthRef={monthRef} />
          )}

          <div className="border-t border-[#5a3a28]/60 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={handleRoll} aria-describedby={ruleId} className={`${fairyButtonClasses} text-sm`}>
                Roll 2d20 days
              </button>
              {roll && (
                <span className="text-[#f5e6c8] text-sm">
                  Rolled {roll.dice[0]} + {roll.dice[1]} = <span className="font-semibold">{plural(roll.total, 'day')}</span>
                </span>
              )}
            </div>
            <p id={ruleId} className="text-[#f5e6c8]/80 text-xs mt-1">
              Player&apos;s Book optional rule (Quests in Fairy, p93): while a character journeys in Fairy for a
              rune, 2d20 days pass in the mortal world.
            </p>
          </div>

          <div
            aria-live="polite"
            aria-atomic="true"
            className={`rounded p-3 text-center ${beforeEntry ? 'bg-[#8b2500]/20 border border-[#8b2500]/40' : 'bg-[#1a1a2e]'}`}
          >
            {valid && target ? (
              <>
                <div className="text-[#f5e6c8]/80 text-xs">Back in Dolmenwood on</div>
                <div className="text-[#c4a35a] text-lg font-bold">{formatCalendarDate(target)}</div>
                <div className="text-[#f5e6c8]/80 text-sm">{passedText}</div>
                {newToday && (
                  <div className="text-[#f5e6c8]/80 text-sm mt-1">
                    Today&apos;s date becomes {formatCalendarDate(newToday)}, keeping the{' '}
                    {plural(daysSinceReturn, 'day')} you&apos;ve lived since you came back.
                  </div>
                )}
              </>
            ) : beforeEntry && target ? (
              <div className="text-[#ff8a6a] text-sm">
                {formatShortDate(target)} is before you entered Fairy ({formatShortDate(visit.enteredOn)}). Pick that
                day or later.
              </div>
            ) : (
              <div className="text-[#f5e6c8]/80 text-sm">Fix the fields marked above to see the date.</div>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 p-4 border-t border-[#5a3a28] shrink-0">
          <button type="button" onClick={() => close('cancelled')} className={`${quietButtonClasses} w-full sm:w-auto`}>
            Cancel
          </button>
          <button type="submit" disabled={!valid} className={`${greenButtonClasses} w-full sm:w-auto`}>
            {editing ? 'Save return date' : 'Return to Dolmenwood'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
