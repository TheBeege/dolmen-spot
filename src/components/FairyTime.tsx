'use client';

// Fairy time controls for the Adventuring tab's calendar: entering Fairy,
// counting days there, and the days-lived counter with its start date and
// visit list. Returning (or fixing a return date) happens in
// FairyDateDialog; the time math lives in src/lib/livedTime.ts.

import { useEffect, useId, useRef, useState, type Ref } from 'react';
import type { CalendarDate, Character, FairyVisit } from '@/lib/types';
import { daysBetween, describeDays, describeDolmenwoodSpan, formatCalendarDate, formatShortDate } from '@/lib/gamedata';
import { pluralize } from '@/lib/grammar';
import {
  LIVED_TIME_EPOCH,
  enterFairy,
  getEditableReturnVisit,
  getFairyVisits,
  getLivedTime,
  getOpenFairyVisit,
  getVisitAwayOn,
  setDaysInFairy,
  setLivedTimeStart,
} from '@/lib/livedTime';
import { useFocusAfterRender } from '@/hooks/useFocusAfterRender';
import FairyDateDialog, { type DialogOutcome } from '@/components/FairyDateDialog';
import {
  BLANK,
  DateFields,
  draftFrom,
  errorClasses,
  fairyButtonClasses,
  greenButtonClasses,
  inputClass,
  linkButtonClasses,
  quietButtonClasses,
  readDate,
  readWholeNumber,
  type NumberField,
} from '@/components/FairyFields';

interface FairyTimeProps {
  character: Character;
  onChange: (updates: Partial<Character>) => void;
}

// The largest number of days the "add days" field takes at once; anything
// bigger is almost certainly a typo.
const MAX_DAYS_PER_ADD = 9999;

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
          entered {formatShortDate(visit.enteredOn)} &middot;{' '}
          <span className="whitespace-nowrap">visit {visitNumber}</span>
        </p>
      </div>

      <div className="mb-3">
        <div className="flex flex-wrap items-center justify-center gap-2">
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
          <span className="flex items-center gap-1">
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
            <button
              type="button"
              onClick={addCustomDays}
              disabled={customReading.value === undefined}
              className={fairyButtonClasses}
            >
              Add
            </button>
          </span>
        </div>
        {/* On its own row, so it never pushes Add away from its field. */}
        {customError && (
          <p id={customErrorId} className={`${errorClasses} text-center`}>
            {customError}
          </p>
        )}
      </div>

      <div className="text-center">
        {/* The label mirrors the "Enter Fairy…" that got the character here, and
            is half the length of the "Return to Dolmenwood…" it replaces: at a
            24px font on a 320px phone the panel leaves the button 190px, two
            lines rather than three. `max-w-full` still caps the button at the
            card, and `break-words` keeps a long label inside it: "Dolmenwood…"
            is one word, wider than the button's content box at a 24px font on a
            phone, so the browser drew it past the button's rounded background.
            `hyphens-auto` gives a syllable break where the browser has the
            dictionary for it, as spell names do. */}
        <button
          type="button"
          ref={openerRef}
          onClick={() => setReturning(true)}
          className={`${greenButtonClasses} max-w-full break-words hyphens-auto`}
        >
          Leave Fairy&hellip;
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

  let fairySummary;
  if (lived.startsAfterToday) {
    fairySummary = (
      <div className="text-[#f5e6c8]/80 text-xs mt-1">
        Counting starts on {formatShortDate(lived.countingFrom)}, which is after today&apos;s date, so no days count yet.
      </div>
    );
  } else if (visits.length === 0) {
    fairySummary = <div className="text-[#f5e6c8]/80 text-xs mt-1">No days in Fairy yet.</div>;
  } else if (lived.visitCount === 0) {
    // Every visit began before the counter's start date.
    fairySummary = (
      <div className="text-[#f5e6c8]/80 text-xs mt-1">No days in Fairy since {formatShortDate(lived.countingFrom)}.</div>
    );
  } else {
    fairySummary = (
      <div className="text-xs mt-1 space-y-0.5">
        <div className="text-[#f5e6c8]/80">
          {pluralize(lived.dolmenwoodDays, 'day', { grouping: true })} in Dolmenwood &middot;{' '}
          <span className="text-[#c9b3f0]">{pluralize(lived.fairyDays, 'day', { grouping: true })} in Fairy</span> across{' '}
          {pluralize(lived.visitCount, 'visit', { grouping: true })}
        </div>
        {lived.awayDays > 0 && (
          <div className="text-[#f5e6c8]/80">
            Dolmenwood time that passed while you were away: {describeDays(lived.awayDays)}
          </div>
        )}
      </div>
    );
  }

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
                <button type="button" ref={changeStartRef} onClick={() => setEditingStart(true)} className={linkButtonClasses}>
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

      {editingStart && <CountingFromEditor character={character} onSave={saveStart} onCancel={closeStartEditor} />}

      {fairySummary}

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
                      <button type="button" ref={editReturnRef} onClick={() => setEditingReturn(true)} className={linkButtonClasses}>
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
  if (!visit.returnedOn) return `${entered} · ${pluralize(visit.daysInFairy, 'day', { grouping: true })} in Fairy so far (still there)`;
  const passed = daysBetween(visit.enteredOn, visit.returnedOn) > 0
    ? `${describeDolmenwoodSpan(visit.enteredOn, visit.returnedOn)} later`
    : 'the same day';
  return `${entered} · ${pluralize(visit.daysInFairy, 'day', { grouping: true })} in Fairy · returned ${formatShortDate(visit.returnedOn)} (${passed})`;
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
  const issueId = useId();
  const [draft, setDraft] = useState(() => draftFrom(character.livedTimeStart ?? LIVED_TIME_EPOCH));
  useEffect(() => {
    monthRef.current?.focus();
  }, []);

  const { date } = readDate(draft);
  let issue: string | undefined;
  if (date !== undefined && daysBetween(character.currentDate, date) > 0) {
    issue = `That's after today's date (${formatShortDate(character.currentDate)}). Pick today or earlier.`;
  } else if (date !== undefined) {
    const away = getVisitAwayOn(character, date);
    if (away?.returnedOn) {
      const visitNumber = getFairyVisits(character).indexOf(away) + 1;
      issue =
        `You were away in Fairy then (visit ${visitNumber}). Pick ${formatShortDate(away.enteredOn)} or earlier, ` +
        `or ${formatShortDate(away.returnedOn)} or later.`;
    }
  }
  const valid = date !== undefined && !issue;

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
      <p className="text-[#f5e6c8] text-sm mb-2">Count days lived from the day your character&apos;s story began:</p>
      <DateFields draft={draft} onChange={setDraft} monthRef={monthRef} issueId={issue ? issueId : undefined} />
      {/* Announced as it appears; linked to every field while it applies. */}
      <div aria-live="polite">
        {issue && (
          <p id={issueId} className={errorClasses}>
            {issue}
          </p>
        )}
      </div>
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
