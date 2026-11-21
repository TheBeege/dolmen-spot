'use client';

// A field for an optional map hex, shared by the journal's hex editor and
// the Fairy return dialog. It's typed as on the map's "Go to hex" ("303" is
// 0303) and read with readHexInput (src/lib/hex.ts): blank is no hex, and
// anything else must be a hex on the map. The form it's in reads it on
// submit and passes back any error to show.

import { useEffect, useId, useRef, type ReactNode, type Ref } from 'react';
import { errorClasses } from '@/components/FairyFields';

// 16 px, so iOS doesn't zoom the page when the field gets focus.
const fieldBase = 'bg-[#1a1a2e] border text-[#f5e6c8] rounded px-2 py-1 text-base w-24 focus:outline-none';

export default function HexField({
  label,
  labelClassName,
  value,
  onChange,
  error,
  hint,
  inputRef,
  autoFocus,
  children,
}: {
  label: string;
  labelClassName: string;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  hint: string;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
  children?: ReactNode; // shown after the field, on its line: a form's buttons
}) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  // An error can appear below the visible part of a scrolling dialog.
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={inputId} className={labelClassName}>
          {label}
        </label>
        <input
          id={inputId}
          ref={inputRef}
          autoFocus={autoFocus}
          type="text"
          inputMode="numeric"
          enterKeyHint="done"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          className={`${fieldBase} ${error ? 'border-[#ff8a6a] focus:ring-1 focus:ring-[#c4a35a]' : 'border-[#5a3a28] focus:border-[#c4a35a]'}`}
        />
        {children}
      </div>
      <p id={hintId} className="text-[#f5e6c8]/80 text-xs mt-1">
        {hint}
      </p>
      <div aria-live="polite">
        {error && (
          <p id={errorId} ref={errorRef} className={`${errorClasses} [overflow-wrap:anywhere]`}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
