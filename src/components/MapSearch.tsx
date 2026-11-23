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
// the box. The number of matches is a live region, so the results are announced
// as the player types. (The Journal's search is the sheet's other one; this
// follows it in being a plain labelled field, and adds the keys because its
// list is the thing the player means to reach.)
const INPUT_CLASSES =
  'w-full bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 pr-8 text-base md:text-xs focus:outline-none focus:border-[#c4a35a] placeholder:text-[#9c948b] [&::-webkit-search-cancel-button]:hidden';
const HIT_CLASSES = `w-full rounded px-2 py-1 text-left transition-colors hover:bg-[#2a2a3e] ${FOCUS_RING}`;

interface MapSearchProps {
  pois: MapPOI[];
  fairyDoors: FairyDoor[];
  leyLines: LeyLine[];
  /** Take the player to `hit`: recentre the map on it, select it and focus it. */
  onSelect: (hit: MapSearchHit) => void;
}

export default function MapSearch({ pois, fairyDoors, leyLines, onSelect }: MapSearchProps) {
  // The lists are the saved map data's own arrays, so the index only changes
  // when the map does, not on every render of the map.
  const index = useMemo(() => buildSearchIndex({ pois, fairyDoors, leyLines }), [pois, fairyDoors, leyLines]);
  const [query, setQuery] = useState('');
  // Shut by Escape, by a click elsewhere and by a choice; typing opens it again.
  const [open, setOpen] = useState(false);
  const { hits, total } = useMemo(() => searchMap(index, query), [index, query]);
  const typed = query.trim();
  const listOpen = open && typed !== '' && hits.length > 0;
  const more = total - hits.length;
  const inputId = useId();
  const statusId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  // What the box says under itself, and announces: how much matched, and how
  // much of it is listed. An empty query says nothing.
  const status =
    typed === ''
      ? ''
      : total === 0
        ? `No matches for “${typed}”`
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

  // A click anywhere else shuts the list without clearing the box. Not a blur
  // handler alone, which would unmount the list between a result's press and
  // its click, and swallow the choice.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // While an input method is composing, Escape is the composition's, to
      // cancel: the search stays, and the browser mustn't clear the field.
      if (e.nativeEvent.isComposing) e.preventDefault();
      else if (query !== '' || open) {
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
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
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
          onKeyDown={onInputKeyDown}
          placeholder="Find a place, door or path"
          enterKeyHint="search"
          autoComplete="off"
          aria-describedby={statusId}
          className={INPUT_CLASSES}
        />
        {query !== '' && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear the search"
            title="Clear the search"
            className="absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded text-[#a1988f] hover:text-[#f5e6c8]"
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>
      <p id={statusId} role="status" className="text-xs text-[#a1988f] [overflow-wrap:anywhere]">
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
                    hex, and no two results say the same thing. */}
                <button
                  type="button"
                  data-search-hit={hit.id}
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
