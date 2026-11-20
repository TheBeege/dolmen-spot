'use client';

// The modal for setting the Dolmenwood date a character comes back on from
// Fairy: "return" closes the open visit, "edit" corrects the last visit's
// return date (see planReturnEdit in src/lib/livedTime.ts). A return also
// asks which map hex they came back in.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { CalendarDate, Character, FairyVisit } from '@/lib/types';
import { isValidHex, readHexInput } from '@/lib/hex';
import {
  LATEST_DATE,
  addElapsedTime,
  daysBetween,
  describeDolmenwoodSpan,
  formatCalendarDate,
  formatShortDate,
  fromAbsoluteDay,
  getAbsoluteDay,
  type ElapsedTime,
} from '@/lib/gamedata';
import { pluralize } from '@/lib/grammar';
import {
  canReturnOn,
  isWithinCalendar,
  planReturnEdit,
  returnFromFairy,
  roll2d20,
  type ReturnEditPlan,
} from '@/lib/livedTime';
import {
  BLANK,
  DateFields,
  NumberInput,
  draftFrom,
  fairyButtonClasses,
  fieldFrom,
  greenButtonClasses,
  quietButtonClasses,
  readDate,
  readWholeNumber,
  type DateDraft,
  type NumberField,
  type Reading,
} from '@/components/FairyFields';
import HexField from '@/components/HexField';

export type DialogOutcome = 'cancelled' | 'saved';
type DateMode = 'elapsed' | 'exact';

// Upper limits for the "Time passed" fields. The date math copes with any
// size; numbers this large are almost certainly typos.
const ELAPSED_LIMITS: ElapsedTime = { years: 9999, months: 9999, weeks: 9999, days: 99999 };

const ELAPSED_FIELDS: { key: keyof ElapsedTime; label: string }[] = [
  { key: 'years', label: 'Years' },
  { key: 'months', label: 'Months' },
  { key: 'weeks', label: 'Weeks' },
  { key: 'days', label: 'Days' },
];

const BLANK_ELAPSED: Record<keyof ElapsedTime, NumberField> = { years: BLANK, months: BLANK, weeks: BLANK, days: BLANK };

// "a", "a and b", "a, b and c".
function listOf(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// What moves with an edited return date, in words.
function describeEditMoves(plan: ReturnEditPlan, daysSinceReturn: number): string[] {
  const records = [
    plan.movedEntries > 0 ? `${plan.movedEntries.toLocaleString('en-US')} journal ${plan.movedEntries === 1 ? 'entry' : 'entries'}` : '',
    plan.movedSpells > 0 ? `${plan.movedSpells.toLocaleString('en-US')} learned ${plan.movedSpells === 1 ? 'spell' : 'spells'}` : '',
    plan.movesStudy ? 'the spell study in progress' : '',
  ].filter(Boolean);
  const lines = [`Today moves with it, to ${formatCalendarDate(plan.today)}.`];
  if (records.length > 0) lines.push(`Records from after you came back move too: ${listOf(records)}.`);
  if (plan.movesCountingStart) lines.push("The days-lived counter's start moves too, so the count stays the same.");
  if (daysSinceReturn > 0) lines.push(`The ${pluralize(daysSinceReturn, 'day', { grouping: true })} you've lived since you came back still count.`);
  return lines;
}

/**
 * A native <dialog> opened with showModal(), so the page behind it is inert;
 * Tab is also kept inside. The parent restores focus via onClose.
 */
export default function FairyDateDialog({
  mode,
  character,
  visit,
  visitNumber,
  onChange,
  onClose,
}: {
  mode: 'return' | 'edit';
  character: Character;
  visit: FairyVisit;
  visitNumber: number;
  onChange: (updates: Partial<Character>) => void;
  onClose: (outcome: DialogOutcome) => void;
}) {
  const editing = mode === 'edit';
  const titleId = useId();
  const introId = useId();
  const ruleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const yearsRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLSelectElement>(null);
  const pressStartedOnBackdrop = useRef(false);
  const [dateMode, setDateMode] = useState<DateMode>(editing ? 'exact' : 'elapsed');
  const [elapsed, setElapsed] = useState(BLANK_ELAPSED);
  const [exact, setExact] = useState(() => draftFrom(visit.returnedOn ?? visit.enteredOn));
  const [roll, setRoll] = useState<{ dice: [number, number]; total: number } | null>(null);
  // Where they came back, on a return: the map's current hex unless changed.
  const [hexText, setHexText] = useState(() => (isValidHex(character.currentLocationHex) ? character.currentLocationHex : ''));
  const [hexError, setHexError] = useState<string | null>(null);
  const hexRef = useRef<HTMLInputElement>(null);

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
  const pastCalendar = target !== undefined && !beforeEntry && !isWithinCalendar(target);
  const plan = editing && target && !beforeEntry && !pastCalendar ? planReturnEdit(character, target) : null;
  // Editing moves today, and what's been dated since the return, by the same
  // amount; none of it may pass the calendar's last day either.
  const movesPastCalendar = editing && target !== undefined && !beforeEntry && !pastCalendar && plan === null;
  const todayPastCalendar =
    movesPastCalendar && target !== undefined && visit.returnedOn
      ? !isWithinCalendar(fromAbsoluteDay(getAbsoluteDay(character.currentDate) + daysBetween(visit.returnedOn, target)))
      : false;
  const valid = target !== undefined && !beforeEntry && !pastCalendar && !movesPastCalendar;
  const passedDays = target ? daysBetween(visit.enteredOn, target) : 0;
  const span = target ? describeDolmenwoodSpan(visit.enteredOn, target) : '';
  const passedText = passedDays > 0
    ? `${span} passed in Dolmenwood${span === pluralize(passedDays, 'day', { grouping: true }) ? '' : ` (${pluralize(passedDays, 'day', { grouping: true })})`}`
    : 'No time passed in Dolmenwood';
  const daysSinceReturn = visit.returnedOn ? Math.max(0, daysBetween(visit.returnedOn, character.currentDate)) : 0;
  // Nothing moves when the date is the one already recorded.
  const editMoves = plan && target && visit.returnedOn && daysBetween(visit.returnedOn, target) !== 0
    ? describeEditMoves(plan, daysSinceReturn)
    : [];

  // ── Actions ──
  const close = (outcome: DialogOutcome) => {
    dialogRef.current?.close(); // un-inert the page first, so the parent can move focus
    onClose(outcome);
  };

  const confirm = () => {
    if (!valid || !target) return;
    let patch: Partial<Character> | null | undefined;
    if (editing) {
      patch = plan?.patch;
    } else {
      const cameBackIn = readHexInput(hexText);
      if (cameBackIn.error !== undefined) {
        setHexError(cameBackIn.error);
        hexRef.current?.focus();
        return;
      }
      patch = returnFromFairy(character, target, cameBackIn.hex);
    }
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
      // Close on a click on the backdrop, but only when the press began there
      // too: a text selection dragged out of a field mustn't close it.
      onPointerDown={(e) => {
        pressStartedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressStartedOnBackdrop.current) close('cancelled');
        pressStartedOnBackdrop.current = false;
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
        {/* The title and the close button share a line when the title's
            longest word leaves room; otherwise (a large font on a narrow
            screen) the button goes on a line above it, rather than past the
            dialog's edge. */}
        <div className="flex flex-wrap-reverse items-center justify-between gap-2 p-4 border-b border-[#5a3a28] shrink-0">
          <h2 id={titleId} className="flex-1 text-[#c4a35a] text-lg font-bold">
            {editing ? 'Edit return date' : 'Return to Dolmenwood'}
          </h2>
          <button
            type="button"
            onClick={() => close('cancelled')}
            aria-label="Close"
            className="ml-auto text-[#f5e6c8]/80 hover:text-[#f5e6c8] text-2xl leading-none px-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b3f0]"
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
                , lived <span className="text-[#c9b3f0] font-semibold">{pluralize(visit.daysInFairy, 'day', { grouping: true })}</span> in
                Fairy, and came back on <span className="text-[#c4a35a]">{formatCalendarDate(visit.returnedOn)}</span>.
                Set the date you really came back; everything since then moves with it.
              </>
            ) : (
              <>
                {' '}and have lived <span className="text-[#c9b3f0] font-semibold">{pluralize(visit.daysInFairy, 'day', { grouping: true })}</span>{' '}
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
                  Rolled {roll.dice[0]} + {roll.dice[1]} = <span className="font-semibold">{pluralize(roll.total, 'day', { grouping: true })}</span>
                </span>
              )}
            </div>
            <p id={ruleId} className="text-[#f5e6c8]/80 text-xs mt-1">
              Player&apos;s Book optional rule (Quests in Fairy, p93): while a character journeys in Fairy for a
              rune, 2d20 days pass in the mortal world.
            </p>
          </div>

          {!editing && (
            <div className="border-t border-[#5a3a28]/60 pt-3">
              <HexField
                label="Came back in hex"
                labelClassName="text-[#c4a35a] text-sm font-semibold"
                value={hexText}
                onChange={(next) => {
                  setHexText(next);
                  setHexError(null);
                }}
                error={hexError}
                hint="Its number on the map, like 1105. It starts as the map's current hex. Leave it blank if you don't know: that clears the map's current hex."
                inputRef={hexRef}
              />
            </div>
          )}

          <div
            aria-live="polite"
            aria-atomic="true"
            className={`rounded p-3 text-center ${valid || target === undefined ? 'bg-[#1a1a2e]' : 'bg-[#8b2500]/20 border border-[#8b2500]/40'}`}
          >
            {valid && target ? (
              <>
                <div className="text-[#f5e6c8]/80 text-xs">Back in Dolmenwood on</div>
                <div className="text-[#c4a35a] text-lg font-bold">{formatCalendarDate(target)}</div>
                <div className="text-[#f5e6c8]/80 text-sm">{passedText}</div>
                {editMoves.map((line) => (
                  <div key={line} className="text-[#f5e6c8]/80 text-sm mt-1">
                    {line}
                  </div>
                ))}
              </>
            ) : beforeEntry && target ? (
              <div className="text-[#ff8a6a] text-sm">
                {formatShortDate(target)} is before you entered Fairy ({formatShortDate(visit.enteredOn)}). Pick that
                day or later.
              </div>
            ) : pastCalendar ? (
              <div className="text-[#ff8a6a] text-sm">
                That&apos;s after {formatShortDate(LATEST_DATE)}, the calendar&apos;s last day.
              </div>
            ) : movesPastCalendar ? (
              <div className="text-[#ff8a6a] text-sm">
                {todayPastCalendar ? "Today's date" : 'Something dated after today'} would move past{' '}
                {formatShortDate(LATEST_DATE)}, the calendar&apos;s last day. Pick an earlier date.
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
