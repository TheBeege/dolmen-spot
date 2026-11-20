'use client';

import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from 'react';

// Every line break a value can hold: Enter and most pasted line breaks reach a
// textarea as "\n", but some insertions and saved values have "\r", and pasted
// text the Unicode line and paragraph separators. One character per break, so
// replacing each with a space keeps every caret position valid.
const LINE_BREAKS = /[\r\n\u2028\u2029]/g;
// The same test without the `g` flag, which would make .test() stateful.
const HAS_LINE_BREAK = /[\r\n\u2028\u2029]/;

/** Text on one line: a space for each line break, counting a CRLF pair as one break. */
function toOneLine(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(LINE_BREAKS, ' ');
}

type GrowingTextareaProps = Omit<
  ComponentPropsWithoutRef<'textarea'>,
  'value' | 'onChange' | 'onKeyDown' | 'onPaste' | 'onDrop' | 'rows' | 'className'
> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Where the box sits: width, flex sizing, margins. */
  className?: string;
  /** How the box looks: border, padding, colours, font size. Its fallback sizer uses the same classes. */
  fieldClassName: string;
  /**
   * For one-line text such as names: it shows and stores line breaks as
   * spaces, and Enter adds none (`onEnter` runs instead). Long text still wraps.
   */
  singleLine?: boolean;
  /** With `singleLine`, what Enter does, such as moving to the next field. */
  onEnter?: () => void;
};

/**
 * Inserts text at the caret through the browser's editing commands, so Undo
 * still works; setting the value directly would clear the undo history.
 */
function insertText(el: HTMLTextAreaElement, text: string) {
  el.focus();
  if (!document.execCommand('insertText', false, text)) {
    el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/** Where in the textarea's text a drop at (x, y) lands; the caret if the browser can't say. */
function dropOffset(el: HTMLTextAreaElement, x: number, y: number): number {
  const position = document.caretPositionFromPoint?.(x, y);
  return position?.offsetNode === el ? position.offset : el.selectionEnd;
}

/**
 * A textarea that is one line tall until its text needs more, then grows up to
 * 15rem (`max-h-60`) and scrolls from there. Browsers with `field-sizing`
 * size it to its text themselves, scrollbar included. Elsewhere, an invisible
 * copy of the text in the same grid cell sets the cell's height, and the
 * textarea fills it. There both reserve the scrollbar's gutter, so a scrollbar
 * appearing can't make the textarea wrap its text narrower than the copy.
 */
export default function GrowingTextarea({
  value,
  onValueChange,
  className = '',
  fieldClassName,
  singleLine = false,
  onEnter,
  placeholder,
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

  const shown = singleLine ? toOneLine(value) : value;

  return (
    <span className={`grid grid-cols-1 ${className}`}>
      <textarea
        {...props}
        ref={ref}
        rows={1}
        value={shown}
        placeholder={placeholder}
        onChange={(e) => {
          const text = singleLine ? e.target.value.replace(LINE_BREAKS, ' ') : e.target.value;
          if (text !== e.target.value) caret.current = e.target.selectionEnd;
          onValueChange(text);
        }}
        onKeyDown={
          singleLine
            ? (e) => {
                // An Enter that finishes an IME composition is left to the IME.
                if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                e.preventDefault();
                onEnter?.();
              }
            : undefined
        }
        onPaste={
          singleLine
            ? (e) => {
                const text = e.clipboardData.getData('text/plain');
                if (!HAS_LINE_BREAK.test(text)) return;
                e.preventDefault();
                insertText(e.currentTarget, toOneLine(text));
              }
            : undefined
        }
        onDrop={
          singleLine
            ? (e) => {
                const text = e.dataTransfer.getData('text/plain');
                if (!HAS_LINE_BREAK.test(text)) return;
                e.preventDefault();
                const el = e.currentTarget;
                const at = dropOffset(el, e.clientX, e.clientY);
                el.focus();
                el.setSelectionRange(at, at);
                insertText(el, toOneLine(text));
              }
            : undefined
        }
        className={`${fieldClassName} col-start-1 row-start-1 h-auto max-h-60 w-full resize-none overflow-y-auto [field-sizing:content] not-supports-[field-sizing:content]:h-full not-supports-[field-sizing:content]:[scrollbar-gutter:stable]`}
      />
      {/* The fallback sizer, only shown without field-sizing: the same box and
          wrapping as the textarea. An empty field is as tall as its
          placeholder, and the trailing space gives a final line break its
          empty line, as the textarea does. */}
      <span
        aria-hidden="true"
        className={`${fieldClassName} col-start-1 row-start-1 max-h-60 overflow-hidden [scrollbar-gutter:stable] whitespace-pre-wrap break-words invisible supports-[field-sizing:content]:hidden`}
      >
        {shown || placeholder}{' '}
      </span>
    </span>
  );
}
