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
// from screen readers, which get the panel instead. Only one card shows at a
// time.
//
// A <select> option can't hold a summary, so ChosenSpellSummary shows the one
// for the spell picked in a select.

import {
  memo,
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
import { HOVER_CARD_MARGIN, placeHoverCard, union, type Box } from '@/lib/hover-card';
import type { SpellSummary, SpellType } from '@/lib/types';

/** How long the pointer rests on a spell before its card appears, so a pointer passing over doesn't flash cards. */
const SHOW_DELAY_MS = 250;
/** How long the card stays after the pointer leaves the spell, the card and the space between them. */
const HIDE_DELAY_MS = 150;

const summaryTextClasses = 'text-xs leading-snug text-[#f5e6c8]/90 border-l-2 border-[#c4a35a]/60 pl-2';

/**
 * One spell's summary panel within a list, as props for its SpellInfo and
 * SpellSummaryPanel: spread the same object into both.
 */
export interface SpellDisclosure {
  open: boolean;
  panelId: string;
  /** What to pass to onToggle: the key it was made from in useSpellDisclosures. */
  toggleKey: string;
  onToggle: (key: string) => void;
}

/**
 * Which spells in a list have their summary panel open. Call the result with
 * a key unique within the list (a row's id, or the spell's name) to get that
 * spell's disclosure. Each value in it is a string, a boolean or a function
 * that never changes, so memoised rows that are passed them skip re-rendering
 * when nothing of theirs has changed.
 */
export function useSpellDisclosures(): (key: string) => SpellDisclosure {
  const baseId = useId();
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(() => new Set());
  const onToggle = useCallback((key: string) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);
  return (key) => ({
    open: openKeys.has(key),
    // An id can't contain spaces, and spell names do.
    panelId: `${baseId}spell-${key.replace(/\s/g, '_')}`,
    toggleKey: key,
    onToggle,
  });
}

// The card showing now, if any. Showing another dismisses it, so a card from
// keyboard focus and one from the mouse never show together.
let dismissShownCard: (() => void) | null = null;

/**
 * `children` (usually the spell's name) followed by the info button, or just
 * `children` when `name` isn't an arcane or holy spell the app knows (a
 * homebrew prayer, say). Hovering `children` shows the card too.
 * `labelClassName` styles `children` alone (a cast spell's faded name), so
 * the button and card keep full contrast. `context` says where the button is
 * ("known", "reference"), so screen readers can tell apart the buttons for the
 * same spell in different lists. Mark the element around a list of these with
 * `data-spell-list`, and the card keeps off the list's spells where it can;
 * `data-spell-list="whole"` keeps it off the whole element, for a menu. Mark
 * a row with `data-spell-row`, and the card keeps clear of the row's
 * controls whenever it has anywhere else to go. Of `data-spell-list`, only the
 * value `whole` means anything; every other value gets the default. Of
 * `data-spell-row`, only the attribute's presence matters, so its value is
 * free for the markup to name the row by (`data-spell-row="known"`).
 */
export const SpellInfo = memo(function SpellInfo({
  spellType,
  name,
  context,
  open,
  panelId,
  toggleKey,
  onToggle,
  children,
  labelClassName = '',
  className = '',
}: {
  spellType: SpellType;
  name: string;
  context: string;
  children?: ReactNode;
  labelClassName?: string;
  className?: string;
} & SpellDisclosure) {
  const spell = findSpell(spellType, name);
  const summary = spell ? getSpellSummary(spellType, spell.name) : undefined;

  const buttonRef = useRef<HTMLButtonElement>(null);
  // Whether the pointer is on the name (or button), and whether it's in the
  // bridge: the box around the name and the card (see checkBridge). They're
  // tracked apart because the card isn't inside the name's element.
  const overAnchor = useRef(false);
  const overBridge = useRef(false);
  const bridge = useRef<Box | null>(null);
  // Where the pointer was last seen, while it matters.
  const pointerAt = useRef<{ x: number; y: number } | null>(null);
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
  const dismiss = useCallback(() => update({ dismissed: true }), [update]);

  // After `delay`, show the card if the pointer is on the name or the card, and hide it if not.
  const settle = useCallback((delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => update({ pointer: overAnchor.current || overBridge.current }), delay);
  }, [update]);

  // Anywhere in the bridge counts as on the card, so the pointer can cross the
  // space between the name and the card (wider when the card has moved past
  // other spells) without the card hiding. It's checked whenever the pointer
  // moves and whenever the bridge changes, so a card that appears under the
  // pointer (in a window too small for it to go anywhere else) or vanishes
  // from under it (dismissed with Escape) counts at once.
  const checkBridge = useCallback(() => {
    const box = bridge.current;
    const at = pointerAt.current;
    const inBridge = box !== null && at !== null
      && at.x >= box.left && at.x <= box.right && at.y >= box.top && at.y <= box.bottom;
    if (inBridge === overBridge.current) return;
    overBridge.current = inBridge;
    settle(inBridge ? 0 : HIDE_DELAY_MS);
  }, [settle]);

  // From HoverCard each time it places the card; null while it's hidden.
  const setBridge = useCallback((box: Box | null) => {
    bridge.current = box;
    checkBridge();
  }, [checkBridge]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const shown = summary !== undefined && (hover.pointer || hover.focus) && !hover.dismissed && !open;

  useEffect(() => {
    if (!shown) return;
    if (dismissShownCard && dismissShownCard !== dismiss) dismissShownCard();
    dismissShownCard = dismiss;
    // Escape dismisses the card, and only the card: it's caught on its way
    // down, so a menu the spell is in doesn't close as well.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      dismiss();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (dismissShownCard === dismiss) dismissShownCard = null;
    };
  }, [shown, dismiss]);

  // The pointer is followed while the card shows, and after it's dismissed
  // for as long as the pointer still counts as on the spell, so that moving
  // away ends the dismissal and a later hover shows the card again.
  const tracking = shown || hover.pointer;
  useEffect(() => {
    if (!tracking) return;
    const onPointerMove = (e: globalThis.PointerEvent) => {
      if (e.pointerType === 'touch') return;
      pointerAt.current = { x: e.clientX, y: e.clientY };
      checkBridge();
    };
    // Leaving the window sends no move to say where the pointer went.
    const onPointerOut = (e: globalThis.PointerEvent) => {
      if (e.pointerType === 'touch' || e.relatedTarget !== null) return;
      pointerAt.current = null;
      checkBridge();
    };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerout', onPointerOut);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerout', onPointerOut);
      overBridge.current = false;
      // Unfollowed, it could move anywhere.
      pointerAt.current = null;
    };
  }, [tracking, checkBridge]);

  // Touch has no hover: a tap on the button opens the panel instead.
  const onAnchorEnter = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    pointerAt.current = { x: e.clientX, y: e.clientY };
    overAnchor.current = true;
    settle(hover.pointer ? 0 : SHOW_DELAY_MS);
  };
  const onAnchorLeave = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    pointerAt.current = { x: e.clientX, y: e.clientY };
    overAnchor.current = false;
    checkBridge();
    settle(HIDE_DELAY_MS);
  };

  // Keyboard focus shows the card; a click (which also focuses the button in
  // most browsers) doesn't, since it opens the panel.
  const onFocus = (e: FocusEvent<HTMLButtonElement>) => {
    if (isFocusVisible(e.currentTarget)) update({ focus: true });
  };
  const onBlur = () => update({ focus: false });
  const onClick = () => {
    onToggle(toggleKey);
    dismiss();
  };

  return (
    <>
      <span
        data-spell-info=""
        className={`inline-flex max-w-full items-center gap-1 ${className}`}
        onPointerEnter={onAnchorEnter}
        onPointerLeave={onAnchorLeave}
      >
        {children !== undefined && <span className={`min-w-0 break-words ${labelClassName}`}>{children}</span>}
        {spell && summary && (
          <button
            ref={buttonRef}
            type="button"
            onClick={onClick}
            onFocus={onFocus}
            onBlur={onBlur}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`What ${spell.name} does (${context})`}
            className={`shrink-0 inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${
              open
                ? 'bg-[#c4a35a]/25 text-[#c4a35a]'
                : 'text-[#c4a35a]/80 hover:text-[#c4a35a] hover:bg-[#c4a35a]/15'
            }`}
          >
            <InfoIcon />
          </button>
        )}
      </span>
      {/* Outside the span: React's pointer enter and leave follow the
          component tree, portals included, so a card inside it would count as
          part of the name and moving onto the card wouldn't leave the name. */}
      {shown && spell && <HoverCard anchorRef={buttonRef} title={spell.name} summary={summary} onPlace={setBridge} />}
    </>
  );
});

/**
 * The summary panel that a SpellInfo's button opens and closes. Put it right
 * after that SpellInfo in the page, so a screen reader comes to it next; in a
 * flex row, CSS `order` can still show it below the row's other controls.
 * While closed it's an empty hidden element, there for the button's
 * aria-controls to point at.
 */
export const SpellSummaryPanel = memo(function SpellSummaryPanel({
  spellType,
  name,
  open,
  panelId,
  className = '',
}: {
  spellType: SpellType;
  name: string;
  className?: string;
} & SpellDisclosure) {
  const summary = getSpellSummary(spellType, name);
  if (!summary) return null;
  return (
    <div id={panelId} hidden={!open} className={`${summaryTextClasses} ${className}`}>
      {open && <SpellSummaryText summary={summary} />}
    </div>
  );
});

/**
 * The summary of the spell picked in a select, or nothing while none is.
 * Give the select `aria-describedby={id}` while there's a summary (see
 * getSpellSummary), so a screen reader reads it with the choice.
 */
export function ChosenSpellSummary({
  spellType,
  name,
  id,
  className = '',
}: {
  spellType: SpellType;
  name: string;
  id: string;
  className?: string;
}) {
  const summary = getSpellSummary(spellType, name);
  if (!summary) return null;
  return (
    <div id={id} className={`${summaryTextClasses} ${className}`}>
      <SpellSummaryText summary={summary} />
    </div>
  );
}

function SpellSummaryText({ summary }: { summary: SpellSummary }) {
  return (
    <>
      <span className="block">
        <span className="text-[#c4a35a]">Range:</span> {summary.range}
        <span aria-hidden="true" className="text-[#a1988f]"> · </span>
        <span className="text-[#c4a35a]">Duration:</span> {summary.duration}
      </span>
      <span className="block mt-0.5">{summary.effect}</span>
    </>
  );
}

// Drawn in a portal at the end of the page, so that no ancestor can clip it.
function HoverCard({
  anchorRef,
  title,
  summary,
  onPlace,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  title: string;
  summary: SpellSummary;
  /** Called with the box around the spell and the card, or null while it's hidden. */
  onPlace: (bridge: Box | null) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Placed before the browser paints, and again whenever anything scrolls or
  // the window resizes, so it stays next to the button.
  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current;
      const card = cardRef.current;
      if (!anchor || !card) return;
      card.style.visibility = 'hidden';
      onPlace(null);
      // Hidden while the button can't be seen: scrolled out of the window or
      // the Memorise menu, or under the page's sticky header. Cards (this one,
      // or one on its way out) don't count as hiding it.
      const box = anchor.getBoundingClientRect();
      const topmost = document
        .elementsFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2)
        .find((el) => !el.closest('[data-hover-card]'));
      if (!topmost || !anchor.contains(topmost)) return;
      const root = document.documentElement;
      const area = { left: 0, top: stickyHeaderBottom(), right: root.clientWidth, bottom: root.clientHeight };
      card.style.maxHeight = `${Math.max(0, area.bottom - area.top - 2 * HOVER_CARD_MARGIN)}px`;
      const size = { width: card.offsetWidth, height: card.offsetHeight };
      const { left, top } = placeHoverCard(box, size, area, { avoid: spellListObstacles(anchor), keepClear: rowControls(anchor) });
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
      card.style.visibility = 'visible';
      const spellBox = anchor.closest('[data-spell-info]')?.getBoundingClientRect() ?? box;
      onPlace(union(spellBox, { left, top, right: left + size.width, bottom: top + size.height }));
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      onPlace(null);
    };
  }, [anchorRef, onPlace]);

  return createPortal(
    <div
      ref={cardRef}
      data-hover-card=""
      aria-hidden="true"
      // Not a stop for the keyboard, even when a small window makes it scroll.
      tabIndex={-1}
      style={{ left: 0, top: 0, visibility: 'hidden' }}
      className="fixed z-[55] w-max max-w-[min(20rem,calc(100%_-_1rem))] overflow-y-auto bg-[#1a1a2e] border border-[#c4a35a]/50 rounded shadow-lg shadow-black/50 px-3 py-2 text-xs leading-snug text-[#f5e6c8]"
    >
      <span className="block font-semibold text-[#c4a35a] mb-0.5">{title}</span>
      <SpellSummaryText summary={summary} />
    </div>,
    document.body,
  );
}

// The bottom of the page's sticky header, which the card stays below, or 0
// when there's none.
function stickyHeaderBottom(): number {
  const header = document.querySelector('header');
  if (!header) return 0;
  const { position } = getComputedStyle(header);
  if (position !== 'sticky' && position !== 'fixed') return 0;
  return Math.max(0, header.getBoundingClientRect().bottom);
}

// What the card should keep off where it can: every spell (name and button)
// in the anchor's list, or the whole list when it's marked
// data-spell-list="whole".
function spellListObstacles(anchor: Element): Box[] {
  const list = anchor.closest<HTMLElement>('[data-spell-list]');
  if (!list) return [];
  if (list.dataset.spellList === 'whole') return [list.getBoundingClientRect()];
  return visibleBoxes(list.querySelectorAll('[data-spell-info]'));
}

// What the card must keep clear of whenever it can go anywhere else: the
// controls in the anchor's row (marked data-spell-row), such as a prepared
// spell's Rank, Prep, Cast, Notes and delete, since reading the summary and
// then ticking Cast is the usual next step.
function rowControls(anchor: Element): Box[] {
  const row = anchor.closest('[data-spell-row]');
  if (!row) return [];
  const own = anchor.closest('[data-spell-info]');
  const controls = [...row.querySelectorAll('input, select, textarea, button, label, a[href]')];
  return visibleBoxes(controls.filter((el) => !own?.contains(el)));
}

function visibleBoxes(elements: Iterable<Element>): DOMRect[] {
  return [...elements].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
}

// A circled "i", drawn as one shape (ring, dot and stem) to keep the page
// light: a long spell list has hundreds of these.
function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M8 .5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15ZM8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 1.9a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm-.8 3.5a.8.8 0 0 1 1.6 0v4.2a.8.8 0 0 1-1.6 0Z"
      />
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
