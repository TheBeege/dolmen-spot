'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FairyDoor, LeyLine, MapPOI } from '@/lib/types';
import { buildSearchIndex, searchMap, type MapSearchHit } from '@/lib/map-search';
import { FOCUS_RING } from '@/components/focus-ring';

// The map's search box: it finds the character's own places, doors and paths by
// name and takes the player to the one they pick. What matches, and in what
// order, is in map-search.ts; this is the box, its list and its keys.
//
// Keys: the arrow keys move through the results — the list takes the focus, so
// each result is announced as it's reached — Enter takes the result in focus,
// or the best match from the box itself, and Escape closes the list and clears
// the box. The number of matches is a live region of its own, so the results
// are announced as the player types. (The Journal's search is the sheet's other
// one; this follows it in being a plain labelled field, and adds the keys
// because its list is the thing the player means to reach.)
//
// The field's chrome is HexMap's INPUT_ON_CARD, with three deltas: it is
// toolbar-sized (`md:text-xs`, as the "Go to hex" field beside it), it leaves
// room on the right for the clear button (`pr-8`), and it hides the browser's
// own search-cancel button, which the clear button replaces.
const INPUT_CLASSES =
  'w-full bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 pr-8 text-base md:text-xs focus:outline-none focus:border-[#c4a35a] placeholder:text-[#9c948b] [&::-webkit-search-cancel-button]:hidden';
// Unavailable (while a ley line is drawn) keeps a cue other than its colour: a
// dashed border, as the sheet's other boxed controls do.
const INPUT_OFF = 'disabled:cursor-not-allowed disabled:border-dashed disabled:border-[#9c948b]';
const HIT_CLASSES = `w-full rounded px-2 py-1 text-left transition-colors hover:bg-[#2a2a3e] ${FOCUS_RING}`;

interface MapSearchProps {
  pois: MapPOI[];
  fairyDoors: FairyDoor[];
  leyLines: LeyLine[];
  /** Take the player to `hit`: recentre the map on it, select it and focus it. */
  onSelect: (hit: MapSearchHit) => void;
  /**
   * True while something else owns the map's hex clicks — a ley line being
   * drawn. The box stays where it is, with whatever was typed still in it, but
   * can't be used: a hex picked then joins the line rather than opening in the
   * inspector.
   */
  disabled?: boolean;
}

export default function MapSearch({ pois, fairyDoors, leyLines, onSelect, disabled = false }: MapSearchProps) {
  // The lists are the saved map data's own arrays, so the index only changes
  // when the map does, not on every render of the map.
  const index = useMemo(() => buildSearchIndex({ pois, fairyDoors, leyLines }), [pois, fairyDoors, leyLines]);
  const [query, setQuery] = useState('');
  // Shut by Escape, by a press elsewhere and by a choice; typing opens it again,
  // and so does coming back to the box, so a query left in it still has a list.
  const [open, setOpen] = useState(false);
  const { hits, total } = useMemo(() => searchMap(index, query), [index, query]);
  const typed = query.trim();
  const listOpen = !disabled && open && typed !== '' && hits.length > 0;
  const more = total - hits.length;
  const inputId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  // What the box says under itself, and announces: how much matched, and how
  // much of it is listed. An empty query says nothing.
  const status = disabled
    ? 'Off while a ley line is drawn'
    : typed === ''
      ? ''
      : total === 0
        ? 'No matches'
        : more > 0
          ? `${total} matches · ${more} more not listed`
          : `${total} ${total === 1 ? 'match' : 'matches'}`;

  const focusHit = (at: number) => listRef.current?.querySelectorAll<HTMLButtonElement>('[data-search-hit]')[at]?.focus();
  const clear = () => {
    setQuery('');
    setOpen(false);
    inputRef.current?.focus({ preventScroll: true });
  };
  const choose = (hit: MapSearchHit) => {
    setQuery('');
    setOpen(false);
    onSelect(hit);
  };

  // A press or a focus anywhere else shuts the list without clearing the box.
  // Both, and across the page: Safari doesn't focus a button you click, so a
  // result's press blurs the box with nothing focused next, and a blur handler
  // of its own closed the list between that press and its click, leaving the
  // click to land on the map underneath. (SpellsAndMagic.tsx closes its menu
  // the same way, for the same reason.)
  useEffect(() => {
    if (!listOpen) return;
    const outside = (target: EventTarget | null) => target instanceof Element && !rootRef.current?.contains(target);
    const onMouseDownOrFocus = (e: Event) => {
      if (outside(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDownOrFocus);
    document.addEventListener('focusin', onMouseDownOrFocus);
    return () => {
      document.removeEventListener('mousedown', onMouseDownOrFocus);
      document.removeEventListener('focusin', onMouseDownOrFocus);
    };
  }, [listOpen]);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // While an input method is composing, Escape is the composition's, to
      // cancel it: the search is left alone.
      if (e.nativeEvent.isComposing) return;
      if (query !== '' || open) {
        e.preventDefault();
        clear();
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!listOpen) return;
      e.preventDefault();
      focusHit(e.key === 'ArrowDown' ? 0 : hits.length - 1);
      return;
    }
    if (e.key === 'Enter' && listOpen) {
      e.preventDefault();
      choose(hits[0]);
    }
  };

  // From a result: the arrow keys move on to the next one, or back into the
  // box at either end, so the keys never trap the focus in the list.
  const onHitKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, at: number) => {
    if (e.key === 'Escape') {
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      clear();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const next = at + (e.key === 'ArrowDown' ? 1 : -1);
    if (next < 0 || next >= hits.length) inputRef.current?.focus();
    else focusHit(next);
  };

  return (
    <div
      ref={rootRef}
      role="search"
      aria-label="Map search"
      // The whole row on a phone, so the input is as wide as the card and its
      // list has room; a box of its own beside the other controls from sm up.
      className="relative min-w-0 basis-full sm:w-72 sm:basis-auto"
    >
      <div className="relative">
        <label htmlFor={inputId} className="sr-only">
          Search the map
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          // Coming back to a box whose list was shut shows the list again. The
          // press matters as well as the focus: a press on the box that already
          // has the focus doesn't focus it again.
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onInputKeyDown}
          disabled={disabled}
          placeholder="Find a place, door or path"
          enterKeyHint="search"
          autoComplete="off"
          className={`${INPUT_CLASSES} ${INPUT_OFF}`}
        />
        {query !== '' && (
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            aria-label="Clear the search"
            title="Clear the search"
            className="absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded text-[#a1988f] hover:text-[#f5e6c8] disabled:cursor-not-allowed"
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>
      <p role="status" className="text-xs text-[#a1988f] [overflow-wrap:anywhere]">
        {status}
      </p>
      {listOpen && (
        // Over the map rather than pushing it down, and never taller than the
        // screen it's read on.
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-[min(60vh,22rem)] overflow-y-auto rounded border border-[#5a3a28] bg-[#1a1a2e] shadow-lg">
          <ol ref={listRef} role="list">
            {hits.map((hit, at) => (
              <li key={`${hit.type}:${hit.id}`}>
                {/* One button per result: its text is what a screen reader
                    announces, so it says the name, what the item is and its
                    hex, and no two results say the same thing. A press on one
                    keeps the focus in the box (as the tab bar's own buttons do,
                    TabBar.tsx), so that nothing can unmount the list between
                    the press and the click that chooses it. */}
                <button
                  type="button"
                  data-search-hit={hit.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(hit)}
                  onKeyDown={(e) => onHitKeyDown(e, at)}
                  className={HIT_CLASSES}
                >
                  <span className="block text-[#f5e6c8] [overflow-wrap:anywhere]">{hit.name}</span>
                  <span className="block text-xs text-[#a1988f] [overflow-wrap:anywhere]">
                    {hit.hex ? `${hit.kindLabel} · hex ${hit.hex}` : hit.kindLabel}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
