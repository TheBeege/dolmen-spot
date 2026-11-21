'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

export interface TabBarTab<Id extends string> {
  id: Id;
  /** Shown from sm up. */
  label: string;
  /** Shown on phones. */
  shortLabel: string;
}

/** The id of a tab's button, which labels its panel. */
export const tabElementId = (id: string) => `sheet-tab-${id}`;
/** The id of a tab's panel, which the tab controls. */
export const panelElementId = (id: string) => `sheet-panel-${id}`;

interface TabBarProps<Id extends string> {
  tabs: readonly TabBarTab<Id>[];
  activeTab: Id;
  onSelect: (id: Id) => void;
  /** The tab list's accessible name. */
  label: string;
}

const smoothScrolling = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

/**
 * Scroll the row, never the page, the least that shows the whole tab clear of
 * the scroll buttons, which the row's scroll padding makes room for. Aims at a
 * scroll position rather than scrolling by an amount, so a second call while
 * the first is still scrolling aims at the same place.
 */
function revealTab(list: HTMLElement, tab: HTMLElement, behavior: ScrollBehavior) {
  if (list.scrollWidth <= list.clientWidth) return; // The tabs all fit (from sm up, they wrap).
  const style = getComputedStyle(list);
  const viewLeft = list.getBoundingClientRect().left + list.clientLeft;
  const tabRect = tab.getBoundingClientRect();
  // The tab's edges and the clear part of the row, in the row's scroll coordinates.
  const tabStart = tabRect.left - viewLeft + list.scrollLeft;
  const tabEnd = tabStart + tabRect.width;
  const clearStart = list.scrollLeft + (parseFloat(style.scrollPaddingLeft) || 0);
  const clearEnd = list.scrollLeft + list.clientWidth - (parseFloat(style.scrollPaddingRight) || 0);
  let left = list.scrollLeft;
  if (tabStart < clearStart) left -= clearStart - tabStart;
  else if (tabEnd > clearEnd) left += tabEnd - clearEnd;
  left = Math.max(0, Math.min(left, list.scrollWidth - list.clientWidth));
  if (Math.abs(left - list.scrollLeft) >= 1) list.scrollTo({ left, behavior });
}

/**
 * The sheet's tabs, as a WAI-ARIA tab list. From sm up the tabs wrap onto as
 * many rows as they need; on phones they share one row that scrolls sideways,
 * with fades and ‹ › buttons at whichever ends have more tabs.
 *
 * Arrow keys, Home and End move focus between the tabs, and Enter or Space
 * opens the focused one (manual activation): opening a tab builds its whole
 * panel, the map's among them, so arrowing past tabs shouldn't.
 */
export default function TabBar<Id extends string>({ tabs, activeTab, onSelect, label }: TabBarProps<Id>) {
  const listRef = useRef<HTMLDivElement>(null);
  // Whether the row, on phones, has tabs out of sight before and after the part showing.
  const [more, setMore] = useState({ before: false, after: false });

  const updateMore = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    // A pixel of slack: zoom can leave the scroll position a fraction short of either end.
    const before = list.scrollLeft > 1;
    const after = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
    setMore((m) => (m.before === before && m.after === after ? m : { before, after }));
  }, []);

  // When the row first shows, and whenever its width changes (a phone turned
  // round, or bigger text), work out the fades again and bring the active tab
  // back into view.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let width: number | null = null;
    const observer = new ResizeObserver(() => {
      if (list.clientWidth !== width) {
        width = list.clientWidth;
        const active = list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
        if (active) revealTab(list, active, 'auto');
      }
      updateMore();
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [updateMore]);

  // A tab opened some other way than from the row (the map's link to the
  // Journal, for one) is brought into view too.
  useEffect(() => {
    const list = listRef.current;
    const tab = document.getElementById(tabElementId(activeTab));
    if (list && tab) revealTab(list, tab, smoothScrolling());
  }, [activeTab]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const tabEls = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])];
    const i = tabEls.indexOf(e.target as HTMLElement);
    if (i < 0) return;
    const last = tabEls.length - 1;
    let next: number;
    switch (e.key) {
      case 'ArrowRight': next = i === last ? 0 : i + 1; break;
      case 'ArrowLeft': next = i === 0 ? last : i - 1; break;
      case 'Home': next = 0; break;
      case 'End': next = last; break;
      default: return;
    }
    e.preventDefault();
    // The tab's focus handler brings it into view.
    tabEls[next].focus({ preventScroll: true });
  };

  // A page of tabs at a time: › brings the first tab cut off on the right
  // round to the left, just clear of the ‹ button that then shows; ‹ does the
  // reverse. Paging by tabs rather than by a width means no tab is ever cut
  // off on both pages.
  const scrollRow = (direction: -1 | 1) => {
    const list = listRef.current;
    if (!list) return;
    const style = getComputedStyle(list);
    const viewLeft = list.getBoundingClientRect().left + list.clientLeft;
    const clearStart = viewLeft + (parseFloat(style.scrollPaddingLeft) || 0);
    const clearEnd = viewLeft + list.clientWidth - (parseFloat(style.scrollPaddingRight) || 0);
    const rects = [...list.querySelectorAll('[role="tab"]')].map((t) => t.getBoundingClientRect());
    let delta: number | null = null;
    // A tab too wide for the clear part of the row is shown from its far end instead.
    if (direction > 0) {
      const cutOff = rects.find((r) => r.right > clearEnd + 0.5);
      if (cutOff) delta = cutOff.left > clearStart ? cutOff.left - clearStart : cutOff.right - clearEnd;
    } else {
      const cutOff = rects.filter((r) => r.left < clearStart - 0.5).pop();
      if (cutOff) delta = cutOff.right < clearEnd ? cutOff.right - clearEnd : cutOff.left - clearStart;
    }
    if (delta !== null) list.scrollTo({ left: list.scrollLeft + delta, behavior: smoothScrolling() });
  };

  // Shown only on phones. The buttons are for pointers and touch: hidden from
  // screen readers and left out of the tab order, since the arrow keys move
  // through the tabs, and they don't take focus when clicked.
  const scrollButton = (direction: -1 | 1) => (
    <button
      type="button"
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => scrollRow(direction)}
      className="w-7 flex items-center justify-center bg-[#1a1a2e] text-[#c4a35a] hover:text-[#f5e6c8] transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={direction < 0 ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  );

  return (
    // -mb-px sets the active tab's underline just above the header's border.
    <div className="relative -mb-px">
      {/* scroll-px matches the width of the buttons and fades below, so a tab
          scrolled into view stops clear of them. The scrollbar is hidden: the
          fades and buttons show that the row scrolls. */}
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={handleKeyDown}
        onScroll={updateMore}
        className="flex gap-0.5 pb-0.5 overflow-x-auto overscroll-x-contain scroll-px-11 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-x-visible"
      >
        {tabs.map((tab) => {
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={tabElementId(tab.id)}
              aria-selected={selected}
              aria-controls={panelElementId(tab.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              onFocus={(e) => {
                if (listRef.current) revealTab(listRef.current, e.currentTarget, smoothScrolling());
              }}
              className={`shrink-0 px-3 py-1.5 text-xs font-semibold whitespace-nowrap rounded-t transition-colors border-b-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#c4a35a] ${
                selected
                  ? 'text-[#c4a35a] border-[#c4a35a] bg-[#2a2a3e]/50'
                  : 'text-[#f5e6c8]/60 border-transparent hover:text-[#f5e6c8] hover:border-[#5a3a28]'
              }`}
            >
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel}</span>
            </button>
          );
        })}
      </div>
      {/* bottom-0.5: they end where the tabs do, leaving the header's border showing. */}
      {more.before && (
        <div aria-hidden="true" className="sm:hidden absolute top-0 bottom-0.5 left-0 flex">
          {scrollButton(-1)}
          <div className="w-4 pointer-events-none bg-linear-to-r from-[#1a1a2e] to-transparent" />
        </div>
      )}
      {more.after && (
        <div aria-hidden="true" className="sm:hidden absolute top-0 bottom-0.5 right-0 flex">
          <div className="w-4 pointer-events-none bg-linear-to-l from-[#1a1a2e] to-transparent" />
          {scrollButton(1)}
        </div>
      )}
    </div>
  );
}
