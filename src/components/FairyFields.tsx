'use client';

// Shared styles and form fields for the Fairy time controls (FairyTime.tsx
// and FairyDateDialog.tsx), also used by the calendar's Day and Year fields
// (Adventuring.tsx): whole-number fields that say what's wrong instead of
// rounding, clamping or replacing what the player typed, and a
// month/day/year date picker built from them.

import { useId, type Ref } from 'react';
import type { CalendarDate } from '@/lib/types';
import { MAX_YEAR, MONTHS } from '@/lib/gamedata';

// ── Styles ───────────────────────────────────────────────────────────
// Text colours stay at WCAG AA contrast on the card colours. Fairy gets a
// violet accent so its state is easy to tell apart from Dolmenwood's
// gold-and-green calendar.

const inputBase =
  'bg-[#1a1a2e] border text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a]';
export const inputClass = (invalid: boolean) => `${inputBase} ${invalid ? 'border-[#ff8a6a]' : 'border-[#5a3a28]'}`;
export const labelClasses = 'block text-[#c4a35a] text-sm font-semibold mb-1';
export const errorClasses = 'text-[#ff8a6a] text-xs mt-1';
export const fairyButtonClasses =
  'bg-[#4a3a6b] hover:bg-[#5c4a82] text-[#f5e6c8] rounded px-3 py-1 transition-colors ' +
  'disabled:bg-[#3a3352] disabled:text-[#f5e6c8]/70 disabled:cursor-not-allowed ' +
  'aria-disabled:bg-[#3a3352] aria-disabled:hover:bg-[#3a3352] aria-disabled:text-[#f5e6c8]/70 aria-disabled:cursor-not-allowed';
export const greenButtonClasses =
  'bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-4 py-1.5 font-semibold transition-colors ' +
  'disabled:bg-[#2a3a2b] disabled:text-[#f5e6c8]/70 disabled:cursor-not-allowed';
export const quietButtonClasses =
  'text-[#f5e6c8]/80 hover:text-[#f5e6c8] border border-[#5a3a28] rounded px-3 py-1 transition-colors';
export const linkButtonClasses = 'text-[#c4a35a] hover:underline rounded';

// ── Whole-number fields ──────────────────────────────────────────────

// What the player typed. `badInput`: the browser couldn't read it as a number.
export interface NumberField {
  text: string;
  badInput: boolean;
}
export const BLANK: NumberField = { text: '', badInput: false };
export const fieldFrom = (n: number): NumberField => ({ text: String(n), badInput: false });

export type Reading = { value: number; error?: undefined } | { value?: undefined; error: string };

/**
 * Read a field as a whole number from min to max, without guessing: "2.5",
 * "45" for a day, or a cleared field each get a message instead of being
 * rounded, clamped or replaced. `blank` is what an empty field means: a
 * value, or the message to show.
 */
export function readWholeNumber(field: NumberField, label: string, min: number, max: number, blank: number | string): Reading {
  const text = field.text.trim();
  if (!field.badInput && text === '') return typeof blank === 'number' ? { value: blank } : { error: blank };
  const n = Number(text);
  if (field.badInput || !Number.isInteger(n)) return { error: `${label} must be a whole number.` };
  if (n < min || n > max) {
    return { error: `${label} must be from ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}.` };
  }
  return { value: n };
}

/** A labelled number field with its own error message. */
export function NumberInput({
  label,
  field,
  onChange,
  error,
  min,
  max,
  inputRef,
  describedBy,
  invalid = false,
  className = '',
}: {
  label: string;
  field: NumberField;
  onChange: (field: NumberField) => void;
  error?: string;
  min: number;
  max: number;
  inputRef?: Ref<HTMLInputElement>;
  describedBy?: string; // a message about more than this field, such as a whole date
  invalid?: boolean;
  className?: string;
}) {
  const errorId = useId();
  const describedByIds = [error ? errorId : '', describedBy ?? ''].filter(Boolean).join(' ');
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
          aria-invalid={error || invalid ? true : undefined}
          aria-describedby={describedByIds || undefined}
          className={`${inputClass(Boolean(error) || invalid)} w-full`}
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

export interface DateDraft {
  month: number;
  day: NumberField;
  year: NumberField;
}
export const draftFrom = (date: CalendarDate): DateDraft => ({ month: date.month, day: fieldFrom(date.day), year: fieldFrom(date.year) });

export function readDate(draft: DateDraft): { date?: CalendarDate; dayError?: string; yearError?: string } {
  const day = readWholeNumber(draft.day, 'Day', 1, MONTHS[draft.month].days, 'Enter a day.');
  const year = readWholeNumber(draft.year, 'Year', 1, MAX_YEAR, 'Enter a year.');
  if (day.error !== undefined || year.error !== undefined) return { dayError: day.error, yearError: year.error };
  return { date: { day: day.value, month: draft.month, year: year.value } };
}

/**
 * Month, day and year. On phones the month gets a row of its own so long
 * names fit. `issueId` points at a message about the date as a whole (for
 * example "after today"): every field is then marked invalid and described
 * by it.
 */
export function DateFields({
  draft,
  onChange,
  monthRef,
  issueId,
}: {
  draft: DateDraft;
  onChange: (draft: DateDraft) => void;
  monthRef?: Ref<HTMLSelectElement>;
  issueId?: string;
}) {
  const { dayError, yearError } = readDate(draft);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <label className="block col-span-2 sm:col-span-1">
        <span className={labelClasses}>Month</span>
        <select
          ref={monthRef}
          value={draft.month}
          onChange={(e) => onChange({ ...draft, month: Number(e.target.value) })}
          aria-invalid={issueId ? true : undefined}
          aria-describedby={issueId}
          className={`${inputClass(Boolean(issueId))} w-full`}
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
        describedBy={issueId}
        invalid={Boolean(issueId)}
        onChange={(day) => onChange({ ...draft, day })}
      />
      <NumberInput
        label="Year"
        field={draft.year}
        min={1}
        max={MAX_YEAR}
        error={yearError}
        describedBy={issueId}
        invalid={Boolean(issueId)}
        onChange={(year) => onChange({ ...draft, year })}
      />
    </div>
  );
}
