'use client';

// Fairy time controls for the Adventuring tab's calendar: entering Fairy,
// counting days there, returning to Dolmenwood, and the days-lived counter.
// The time math lives in src/lib/livedTime.ts.

import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDate, Character, FairyVisit } from '@/lib/types';
import { MONTHS, daysBetween, formatCalendarDate } from '@/lib/gamedata';
import {
  ElapsedTime,
  addElapsedTime,
  canReturnOn,
  describeDays,
  describeDolmenwoodSpan,
  enterFairy,
  formatShortDate,
  getFairyVisits,
  getLivedTime,
  getOpenFairyVisit,
  returnFromFairy,
  roll2d20,
  setDaysInFairy,
} from '@/lib/livedTime';

interface FairyTimeProps {
  character: Character;
  onChange: (updates: Partial<Character>) => void;
}

const inputClasses =
  'bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a]';

const labelClasses = 'block text-[#c4a35a] text-sm font-semibold mb-1';

// Fairy gets a violet accent so its state is easy to tell apart from
// Dolmenwood's gold-and-green calendar.
const fairyButtonClasses =
  'bg-[#4a3a6b] hover:bg-[#5c4a82] text-[#f5e6c8] rounded px-3 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

const quietButtonClasses =
  'text-[#f5e6c8]/60 hover:text-[#f5e6c8] rounded px-3 py-1 transition-colors';

// Limits keep a mistyped number from freezing the page in day-by-day date math.
const MAX_DAYS_PER_ADD = 9999;
const ELAPSED_LIMITS: ElapsedTime = { years: 9999, months: 9999, weeks: 9999, days: 99999 };
const MAX_YEAR = 99999;

function dayCount(n: number): string {
  return `${n.toLocaleString('en-US')} day${n === 1 ? '' : 's'}`;
}

function parseCount(raw: string, max: number): number {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
}

// ── In Fairy: status and day controls ────────────────────────────────

/** Shown at the top of the calendar while the character is in Fairy. */
export function FairyStatusPanel({ character, onChange }: FairyTimeProps) {
  const visit = getOpenFairyVisit(character);
  const [customDays, setCustomDays] = useState('');
  const [returning, setReturning] = useState(false);
  if (!visit) return null;

  const visitNumber = getFairyVisits(character).length;
  const custom = parseInt(customDays, 10);
  const customValid = Number.isFinite(custom) && custom > 0 && custom <= MAX_DAYS_PER_ADD;

  const changeDays = (delta: number) => {
    const patch = setDaysInFairy(character, visit.daysInFairy + delta);
    if (patch) onChange(patch);
  };

  const addCustomDays = () => {
    if (!customValid) return;
    changeDays(custom);
    setCustomDays('');
  };

  return (
    <div className="border border-[#8a6fb0]/60 bg-[#8a6fb0]/10 rounded-lg p-3 mb-4">
      <div className="text-center mb-3">
        <div className="text-2xl font-bold text-[#c9b3f0]">
          In Fairy &mdash; day {visit.daysInFairy + 1}
        </div>
        <div className="text-[#f5e6c8]/70 text-sm mt-1">
          <span className="whitespace-nowrap">entered {formatShortDate(visit.enteredOn)}</span> &middot;{' '}
          <span className="whitespace-nowrap">visit {visitNumber}</span> &middot;{' '}
          <span className="whitespace-nowrap">{dayCount(visit.daysInFairy)} lived here</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => changeDays(-1)}
          disabled={visit.daysInFairy === 0}
          title={visit.daysInFairy === 0 ? 'Already on the day you entered' : 'Take back a day in Fairy'}
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
            type="number"
            min={1}
            max={MAX_DAYS_PER_ADD}
            inputMode="numeric"
            value={customDays}
            onChange={(e) => setCustomDays(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addCustomDays();
            }}
            placeholder="Days"
            aria-label="Number of days to add in Fairy"
            className={`${inputClasses} w-20`}
          />
          <button type="button" onClick={addCustomDays} disabled={!customValid} className={fairyButtonClasses}>
            Add
          </button>
        </span>
      </div>

      <div className="text-center">
        <button
          type="button"
          onClick={() => setReturning(true)}
          className="bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-4 py-1.5 font-semibold transition-colors"
        >
          Return to Dolmenwood&hellip;
        </button>
        <p className="text-[#f5e6c8]/50 text-xs mt-2">
          Fairy is timeless. Dolmenwood&apos;s calendar waits on the day you entered, and these buttons count the
          days you live in Fairy.
        </p>
      </div>

      {returning && (
        <ReturnFromFairyDialog
          character={character}
          visit={visit}
          visitNumber={visitNumber}
          onChange={onChange}
          onClose={() => setReturning(false)}
        />
      )}
    </div>
  );
}

// ── Days lived, Fairy visits, and entering Fairy ─────────────────────

/** The days-lived counter, a compact visit summary, and the Enter Fairy control. */
export function LivedTimePanel({ character, onChange }: FairyTimeProps) {
  const [confirmingEntry, setConfirmingEntry] = useState(false);
  const [showVisits, setShowVisits] = useState(false);
  const lived = getLivedTime(character);
  const visits = getFairyVisits(character);
  const inFairy = getOpenFairyVisit(character) !== null;

  const handleEnter = () => {
    const patch = enterFairy(character);
    if (patch) onChange(patch);
    setConfirmingEntry(false);
  };

  return (
    <div className="mt-4 bg-[#1a1a2e] rounded p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-[#c4a35a] text-sm font-semibold">Days lived:</span>{' '}
          <span className="text-[#f5e6c8] text-lg font-bold">{lived.totalDays.toLocaleString('en-US')}</span>{' '}
          <span className="text-[#f5e6c8]/50 text-xs">since Year 1, day 1</span>
        </div>
        {!inFairy && !confirmingEntry && (
          <button type="button" onClick={() => setConfirmingEntry(true)} className={`${fairyButtonClasses} text-sm`}>
            Enter Fairy&hellip;
          </button>
        )}
      </div>

      {visits.length === 0 ? (
        <div className="text-[#f5e6c8]/50 text-xs mt-1">No days in Fairy yet.</div>
      ) : (
        <div className="text-xs mt-1 space-y-0.5">
          <div className="text-[#f5e6c8]/70">
            {dayCount(lived.dolmenwoodDays)} in Dolmenwood &middot;{' '}
            <span className="text-[#c9b3f0]">{dayCount(lived.fairyDays)} in Fairy</span> across{' '}
            {lived.visitCount} visit{lived.visitCount === 1 ? '' : 's'}
          </div>
          {lived.awayDays > 0 && (
            <div className="text-[#f5e6c8]/60">
              Dolmenwood time that passed while you were away: {describeDays(lived.awayDays)}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowVisits(!showVisits)}
            aria-expanded={showVisits}
            className="text-[#c4a35a] hover:underline"
          >
            {showVisits ? 'Hide' : 'Show'} Fairy visits
          </button>
          {showVisits && (
            <ol className="space-y-1 mt-1">
              {visits.map((visit, i) => (
                <li key={visit.id} className="text-[#f5e6c8]/70">
                  <span className="text-[#c9b3f0] font-semibold">Visit {i + 1}:</span>{' '}
                  {describeVisit(visit)}
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
          <p className="text-[#f5e6c8]/60 text-xs mt-1">
            Fairy is timeless: Dolmenwood&apos;s calendar waits on this date while the day buttons count days in
            Fairy. When you come back, you&apos;ll set the new Dolmenwood date the Referee decides.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <button type="button" onClick={handleEnter} className={`${fairyButtonClasses} font-semibold`}>
              Enter Fairy
            </button>
            <button type="button" onClick={() => setConfirmingEntry(false)} className={quietButtonClasses}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function describeVisit(visit: FairyVisit): string {
  const entered = `entered ${formatShortDate(visit.enteredOn)}`;
  if (!visit.returnedOn) return `${entered} · ${dayCount(visit.daysInFairy)} in Fairy so far (still there)`;
  const passed = daysBetween(visit.enteredOn, visit.returnedOn) > 0
    ? `${describeDolmenwoodSpan(visit.enteredOn, visit.returnedOn)} later`
    : 'the same day';
  return `${entered} · ${dayCount(visit.daysInFairy)} in Fairy · returned ${formatShortDate(visit.returnedOn)} (${passed})`;
}

// ── Returning to Dolmenwood ──────────────────────────────────────────

type ReturnMode = 'elapsed' | 'exact';

const ELAPSED_FIELDS: { key: keyof ElapsedTime; label: string }[] = [
  { key: 'years', label: 'Years' },
  { key: 'months', label: 'Months' },
  { key: 'weeks', label: 'Weeks' },
  { key: 'days', label: 'Days' },
];

const EMPTY_ELAPSED: Record<keyof ElapsedTime, string> = { years: '', months: '', weeks: '', days: '' };

function ReturnFromFairyDialog({
  character,
  visit,
  visitNumber,
  onChange,
  onClose,
}: FairyTimeProps & { visit: FairyVisit; visitNumber: number; onClose: () => void }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<ReturnMode>('elapsed');
  const [elapsed, setElapsed] = useState(EMPTY_ELAPSED);
  const [roll, setRoll] = useState<{ dice: [number, number]; total: number } | null>(null);
  const [exactMonth, setExactMonth] = useState(visit.enteredOn.month);
  const [exactDay, setExactDay] = useState(String(visit.enteredOn.day));
  const [exactYear, setExactYear] = useState(String(visit.enteredOn.year));

  // Move focus into the dialog once, when it opens.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const elapsedTime: ElapsedTime = {
    years: parseCount(elapsed.years, ELAPSED_LIMITS.years),
    months: parseCount(elapsed.months, ELAPSED_LIMITS.months),
    weeks: parseCount(elapsed.weeks, ELAPSED_LIMITS.weeks),
    days: parseCount(elapsed.days, ELAPSED_LIMITS.days),
  };
  const exactDate: CalendarDate = {
    month: exactMonth,
    day: Math.max(1, Math.min(MONTHS[exactMonth].days, parseInt(exactDay, 10) || 1)),
    year: Math.max(1, Math.min(MAX_YEAR, parseInt(exactYear, 10) || 1)),
  };
  const target = mode === 'elapsed' ? addElapsedTime(visit.enteredOn, elapsedTime) : exactDate;
  const valid = canReturnOn(visit, target);
  const passedDays = daysBetween(visit.enteredOn, target);
  const span = describeDolmenwoodSpan(visit.enteredOn, target);
  const passedText = passedDays > 0
    ? `${span} passed in Dolmenwood${span === dayCount(passedDays) ? '' : ` (${dayCount(passedDays)})`}`
    : 'No time passed in Dolmenwood';

  const switchMode = (next: ReturnMode) => {
    if (next === 'exact' && mode === 'elapsed') {
      // Carry the date worked out so far over into the exact-date fields.
      setExactMonth(target.month);
      setExactDay(String(target.day));
      setExactYear(String(target.year));
    }
    setMode(next);
  };

  const handleRoll = () => {
    const result = roll2d20();
    setRoll(result);
    setElapsed({ ...EMPTY_ELAPSED, days: String(result.total) });
    setMode('elapsed');
  };

  const handleConfirm = () => {
    const patch = returnFromFairy(character, target);
    if (!patch) return;
    onChange(patch);
    onClose();
  };

  const modeButton = (value: ReturnMode, label: string) => (
    <button
      type="button"
      onClick={() => switchMode(value)}
      aria-pressed={mode === value}
      className={`flex-1 px-3 py-1.5 text-sm font-semibold transition-colors ${
        mode === value ? 'bg-[#c4a35a] text-[#1a1a2e]' : 'text-[#f5e6c8]/70 hover:text-[#f5e6c8]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative bg-[#2a2a3e] rounded-lg border border-[#8a6fb0]/60 w-full max-w-lg max-h-[90vh] flex flex-col focus:outline-none"
      >
        <div className="flex items-center justify-between p-4 border-b border-[#5a3a28] shrink-0">
          <h3 id={titleId} className="text-[#c4a35a] text-lg font-bold">
            Return to Dolmenwood
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[#8b2500] hover:text-[#b33a1a] font-bold text-lg px-2">
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          <div className="text-sm text-[#f5e6c8]/80">
            Fairy visit {visitNumber}: you entered on{' '}
            <span className="text-[#c4a35a]">{formatCalendarDate(visit.enteredOn)}</span> and have lived{' '}
            <span className="text-[#c9b3f0] font-semibold">{dayCount(visit.daysInFairy)}</span> in Fairy.
            The Referee decides how much time passed in Dolmenwood.
          </div>

          <div className="flex rounded border border-[#5a3a28] overflow-hidden">
            {modeButton('elapsed', 'Time passed')}
            {modeButton('exact', 'Exact date')}
          </div>

          {mode === 'elapsed' ? (
            <div>
              <div className="text-[#f5e6c8]/60 text-xs mb-2">How much Dolmenwood time passed since you entered?</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ELAPSED_FIELDS.map(({ key, label }) => (
                  <label key={key} className="block">
                    <span className={labelClasses}>{label}</span>
                    <input
                      type="number"
                      min={0}
                      max={ELAPSED_LIMITS[key]}
                      inputMode="numeric"
                      value={elapsed[key]}
                      onChange={(e) => setElapsed({ ...elapsed, [key]: e.target.value })}
                      placeholder="0"
                      className={`${inputClasses} w-full`}
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <label className="block">
                <span className={labelClasses}>Month</span>
                <select
                  value={exactMonth}
                  onChange={(e) => {
                    const month = parseInt(e.target.value, 10);
                    setExactMonth(month);
                    setExactDay(String(Math.min(MONTHS[month].days, parseInt(exactDay, 10) || 1)));
                  }}
                  className={`${inputClasses} w-full`}
                >
                  {MONTHS.map((m, i) => (
                    <option key={m.name} value={i}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelClasses}>Day</span>
                <input
                  type="number"
                  min={1}
                  max={MONTHS[exactMonth].days}
                  inputMode="numeric"
                  value={exactDay}
                  onChange={(e) => setExactDay(e.target.value)}
                  className={`${inputClasses} w-full`}
                />
              </label>
              <label className="block col-span-2 sm:col-span-1">
                <span className={labelClasses}>Year</span>
                <input
                  type="number"
                  min={1}
                  max={MAX_YEAR}
                  inputMode="numeric"
                  value={exactYear}
                  onChange={(e) => setExactYear(e.target.value)}
                  className={`${inputClasses} w-full`}
                />
              </label>
            </div>
          )}

          <div className="border-t border-[#5a3a28]/60 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={handleRoll} className={`${fairyButtonClasses} text-sm`}>
                Roll 2d20 days
              </button>
              {roll && (
                <span className="text-[#f5e6c8] text-sm">
                  Rolled {roll.dice[0]} + {roll.dice[1]} = <span className="font-semibold">{dayCount(roll.total)}</span>
                </span>
              )}
            </div>
            <p className="text-[#f5e6c8]/50 text-xs mt-1">
              Player&apos;s Book optional rule (Quests in Fairy, p93): while a character journeys in Fairy for a
              rune, 2d20 days pass in the mortal world.
            </p>
          </div>

          <div className={`rounded p-3 text-center ${valid ? 'bg-[#1a1a2e]' : 'bg-[#8b2500]/20 border border-[#8b2500]/40'}`}>
            {valid ? (
              <>
                <div className="text-[#f5e6c8]/60 text-xs">Back in Dolmenwood on</div>
                <div className="text-[#c4a35a] text-lg font-bold">{formatCalendarDate(target)}</div>
                <div className="text-[#f5e6c8]/70 text-sm">{passedText}</div>
              </>
            ) : (
              <div className="text-[#ff6b4a] text-sm" role="alert">
                {formatShortDate(target)} is before you entered Fairy ({formatShortDate(visit.enteredOn)}). Pick that
                day or later.
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 p-4 border-t border-[#5a3a28] shrink-0">
          <button type="button" onClick={onClose} className={quietButtonClasses}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!valid}
            className="bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-4 py-1.5 font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Return to Dolmenwood
          </button>
        </div>
      </div>
    </div>
  );
}
