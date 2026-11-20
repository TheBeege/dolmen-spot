'use client';

// What a spell does, beside its name on the Spells & Magic tab.
//
// SpellInfo puts an info button after a spell's name. Pressing it opens the
// spell's summary in a panel below the row (SpellSummaryPanel): a disclosure
// that works the same with touch, keyboard and screen readers. With a mouse or
// pen, resting on the name or the button also shows the summary in a card next
// to the button, as does focusing the button from the keyboard. The card meets
// WCAG 1.4.13: Escape dismisses it, the pointer can move onto it, and it stays
// until the pointer or focus leaves. It repeats the panel's text, so it's hidden
// from screen readers, which get the panel instead.
//
// A <select> option can't hold a summary, so ChosenSpellSummary shows the one
// for the spell picked in a select.

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { findSpell, getSpellSummary } from '@/lib/gamedata';
import { placeHoverCard } from '@/lib/hover-card';
import type { SpellSummary, SpellType } from '@/lib/types';

/** How long the pointer rests on a spell before its card appears, so a pointer passing over doesn't flash cards. */
const SHOW_DELAY_MS = 250;
/** How long the card waits after the pointer leaves, so it can cross the gap onto the card. */
const HIDE_DELAY_MS = 150;

const summaryTextClasses = 'text-xs leading-snug text-[#f5e6c8]/90 border-l-2 border-[#c4a35a]/60 pl-2';

/** One spell's open/closed summary panel within a list. */
export interface SpellDisclosure {
  open: boolean;
  toggle: () => void;
  panelId: string;
}

/**
 * Which spells in a list have their summary panel open. Call the result with
 * a key unique within the list (a row's id, or the spell's name) to get that
 * spell's disclosure, and pass it to both its SpellInfo and SpellSummaryPanel.
 */
export function useSpellDisclosures(): (key: string) => SpellDisclosure {
  const baseId = useId();
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(() => new Set());
  return (key) => ({
    open: openKeys.has(key),
    toggle: () => setOpenKeys((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    }),
    // An id can't contain spaces, and spell names do.
    panelId: `${baseId}spell-${key.replace(/\s/g, '_')}`,
  });
}

/**
 * `children` (usually the spell's name) followed by the info button, or just
 * `children` when `name` isn't an arcane or holy spell the app knows (a
 * homebrew prayer, say). Hovering `children` shows the card too.
 */
export function SpellInfo({
  spellType,
  name,
  disclosure,
  children,
  className = '',
}: {
  spellType: SpellType;
  name: string;
  disclosure: SpellDisclosure;
  children?: ReactNode;
  className?: string;
}) {
  const spell = findSpell(spellType, name);
  const summary = spell ? getSpellSummary(spellType, spell.name) : undefined;

  const buttonRef = useRef<HTMLButtonElement>(null);
  // Whether the pointer is on the name (or button) and on the card. They're
  // tracked apart because the card isn't inside the name's element.
  const overAnchor = useRef(false);
  const overCard = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [hover, setHover] = useState({ pointer: false, focus: false, dismissed: false });

  const update = useCallback((patch: Partial<typeof hover>) => {
    setHover((prev) => {
      const next = { ...prev, ...patch };
      // Once neither the pointer nor focus is on it, a new hover or focus shows the card again.
      if (!next.pointer && !next.focus) next.dismissed = false;
      return next;
    });
  }, []);

  // After `delay`, show the card if the pointer is on the name or card, and hide it if not.
  const settle = (delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => update({ pointer: overAnchor.current || overCard.current }), delay);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  const shown = summary !== undefined && (hover.pointer || hover.focus) && !hover.dismissed && !disclosure.open;

  useEffect(() => {
    if (!shown) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') update({ dismissed: true });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [shown, update]);

  // Touch has no hover: a tap on the button opens the panel instead.
  const onAnchorEnter = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    overAnchor.current = true;
    settle(hover.pointer ? 0 : SHOW_DELAY_MS);
  };
  const onAnchorLeave = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    overAnchor.current = false;
    settle(HIDE_DELAY_MS);
  };
  const onCardEnter = () => {
    overCard.current = true;
    settle(0);
  };
  const onCardLeave = () => {
    overCard.current = false;
    settle(HIDE_DELAY_MS);
  };

  // Keyboard focus shows the card; a click (which also focuses the button in
  // most browsers) doesn't, since it opens the panel.
  const onFocus = (e: FocusEvent<HTMLButtonElement>) => {
    if (isFocusVisible(e.currentTarget)) update({ focus: true });
  };
  const onBlur = () => update({ focus: false });
  const onClick = () => {
    disclosure.toggle();
    update({ dismissed: true });
  };

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 ${className}`}
      onPointerEnter={onAnchorEnter}
      onPointerLeave={onAnchorLeave}
    >
      {children !== undefined && <span className="min-w-0 break-words">{children}</span>}
      {spell && summary && (
        <>
          <button
            ref={buttonRef}
            type="button"
            onClick={onClick}
            onFocus={onFocus}
            onBlur={onBlur}
            aria-expanded={disclosure.open}
            aria-controls={disclosure.panelId}
            aria-label={`What ${spell.name} does`}
            className={`shrink-0 inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${
              disclosure.open
                ? 'bg-[#c4a35a]/25 text-[#c4a35a]'
                : 'text-[#c4a35a]/80 hover:text-[#c4a35a] hover:bg-[#c4a35a]/15'
            }`}
          >
            <InfoIcon />
          </button>
          {shown && (
            <HoverCard
              anchorRef={buttonRef}
              title={spell.name}
              summary={summary}
              onPointerEnter={onCardEnter}
              onPointerLeave={onCardLeave}
            />
          )}
        </>
      )}
    </span>
  );
}

/**
 * The summary panel that a SpellInfo's button opens and closes. Put it right
 * after that SpellInfo in the page, so a screen reader comes to it next; in a
 * flex row, CSS `order` can still show it below the row's other controls.
 */
export function SpellSummaryPanel({
  spellType,
  name,
  disclosure,
  className = '',
}: {
  spellType: SpellType;
  name: string;
  disclosure: SpellDisclosure;
  className?: string;
}) {
  const summary = getSpellSummary(spellType, name);
  if (!summary) return null;
  return (
    <div id={disclosure.panelId} hidden={!disclosure.open} className={`${summaryTextClasses} ${className}`}>
      <SpellSummaryText summary={summary} />
    </div>
  );
}

/** The summary of the spell picked in a select, or nothing while none is. */
export function ChosenSpellSummary({
  spellType,
  name,
  className = '',
}: {
  spellType: SpellType;
  name: string;
  className?: string;
}) {
  const summary = getSpellSummary(spellType, name);
  if (!summary) return null;
  return (
    <div className={`${summaryTextClasses} ${className}`}>
      <SpellSummaryText summary={summary} />
    </div>
  );
}

function SpellSummaryText({ summary }: { summary: SpellSummary }) {
  return (
    <>
      <span className="block">
        <span className="text-[#c4a35a]">Range:</span> {summary.range}
        <span aria-hidden="true" className="text-[#f5e6c8]/50"> · </span>
        <span className="text-[#c4a35a]">Duration:</span> {summary.duration}
      </span>
      <span className="block mt-0.5">{summary.effect}</span>
    </>
  );
}

// Drawn in a portal at the end of the page, so that no ancestor can clip it
// or fade it (a cast spell's row is half-transparent).
function HoverCard({
  anchorRef,
  title,
  summary,
  onPointerEnter,
  onPointerLeave,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  title: string;
  summary: SpellSummary;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Placed before the browser paints, and again whenever anything scrolls or
  // the window resizes, so it stays beside the button and on screen. While
  // the button is scrolled out of view, so is the card.
  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current;
      const card = cardRef.current;
      if (!anchor || !card) return;
      const root = document.documentElement;
      const viewport = { width: root.clientWidth, height: root.clientHeight };
      const box = anchor.getBoundingClientRect();
      if (box.bottom < 0 || box.top > viewport.height || box.right < 0 || box.left > viewport.width) {
        card.style.visibility = 'hidden';
        return;
      }
      const { left, top } = placeHoverCard(box, { width: card.offsetWidth, height: card.offsetHeight }, viewport);
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
      card.style.visibility = 'visible';
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchorRef]);

  return createPortal(
    <div
      ref={cardRef}
      aria-hidden="true"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      // The card isn't inside the menu or panel it was opened from, so keep a
      // press on it from counting as a click outside one (the Memorise menu
      // closes on those).
      onMouseDown={(e) => e.stopPropagation()}
      style={{ left: 0, top: 0, visibility: 'hidden' }}
      className="fixed z-[55] w-max max-w-[min(20rem,calc(100%_-_1rem))] max-h-[calc(100%_-_1rem)] overflow-y-auto bg-[#1a1a2e] border border-[#c4a35a]/50 rounded shadow-lg shadow-black/50 px-3 py-2 text-xs leading-snug text-[#f5e6c8]"
    >
      <span className="block font-semibold text-[#c4a35a] mb-0.5">{title}</span>
      <SpellSummaryText summary={summary} />
    </div>,
    document.body,
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="4.9" r="1" fill="currentColor" />
      <path d="M8 7.4v4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// Whether focus arrived from the keyboard rather than a click or tap.
// Browsers without :focus-visible throw on it; count their focus as visible.
function isFocusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}
