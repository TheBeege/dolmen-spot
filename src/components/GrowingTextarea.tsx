'use client';

import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from 'react';

// The line breaks a textarea's value can hold: Enter and pasted CR/LF arrive
// as "\n", and pasted text can also carry the Unicode line and paragraph separators.
const LINE_BREAKS = /[\n\u2028\u2029]/g;

type GrowingTextareaProps = Omit<
  ComponentPropsWithoutRef<'textarea'>,
  'value' | 'onChange' | 'onKeyDown' | 'rows' | 'className'
> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Where the box sits: width, flex sizing, margins. */
  className?: string;
  /** How the box looks: border, padding, colours, font size. Its sizer uses the same classes. */
  fieldClassName: string;
  /** For one-line text such as names: Enter adds nothing and pasted line breaks become spaces. Long text still wraps. */
  singleLine?: boolean;
};

/**
 * A textarea that is one line tall until its text needs more, then grows up to
 * 15rem (`max-h-60`) and scrolls from there. An invisible copy of the text in
 * the same grid cell sets its height, so it fits its text at any width without
 * measuring anything.
 */
export default function GrowingTextarea({
  value,
  onValueChange,
  className = '',
  fieldClassName,
  singleLine = false,
  ...props
}: GrowingTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Setting the value moves the caret to the end, so after a line break is
  // replaced it goes back to where it was (each break becomes one space).
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caret.current === null) return;
    ref.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  return (
    <div className={`grid grid-cols-1 ${className}`}>
      {/* Fills the grid cell (h-full, w-full), whose height the sizer below sets. */}
      <textarea
        {...props}
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => {
          const text = singleLine ? e.target.value.replace(LINE_BREAKS, ' ') : e.target.value;
          if (text !== e.target.value) caret.current = e.target.selectionEnd;
          onValueChange(text);
        }}
        onKeyDown={
          singleLine
            ? (e) => {
                // An Enter that finishes an IME composition is left to the IME.
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.preventDefault();
              }
            : undefined
        }
        className={`${fieldClassName} col-start-1 row-start-1 h-full w-full resize-none overflow-y-auto`}
      />
      {/* The sizer: the same box and wrapping as the textarea. The trailing
          space gives a final line break its empty line, as the textarea does. */}
      <div
        aria-hidden="true"
        className={`${fieldClassName} col-start-1 row-start-1 max-h-60 overflow-hidden whitespace-pre-wrap break-words invisible`}
      >
        {value}{' '}
      </div>
    </div>
  );
}
