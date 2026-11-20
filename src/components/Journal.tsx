'use client';

// The Journal tab: the character's journal, newest first in the order they
// lived it, with search and a hex filter. The order, search and filter live
// in src/lib/journal.ts. Besides the entries added here, the app writes one
// when the character enters or leaves Fairy (src/lib/livedTime.ts).

import { memo, useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Character, CharacterUpdater, HexCoord, JournalEntry } from '@/lib/types';
import { parseTypedHex } from '@/lib/hex';
import {
  createJournalEntry,
  describeJournalList,
  getEntryHex,
  getJournalEntries,
  hexFilterOptions,
  highlightSegments,
  listJournal,
  matchExcerpts,
  parseJournalQuery,
  toJournalHexFilter,
  withEntryHex,
  type JournalEntryMatches,
  type JournalEntryText,
  type JournalHexFilter,
  type JournalListItem,
  type TextRange,
} from '@/lib/journal';
import { useFocusAfterRender } from '@/hooks/useFocusAfterRender';
import { errorClasses, labelClasses } from '@/components/FairyFields';

/** How another tab opened the Journal: from the map's hex inspector (with its hex), or from Adventuring. */
export interface JournalOpening {
  hex: HexCoord | null;
}

interface JournalProps {
  character: Character;
  onChange: (updates: CharacterUpdater) => void;
  // Set when another tab opened the Journal. The control that did it went
  // away with that tab, so the Journal takes focus; opened from the map, it
  // starts filtered to that hex. onOpened says it has been dealt with, so
  // that switching characters doesn't apply it again.
  opening?: JournalOpening | null;
  onOpened?: () => void;
}

// Inputs are 16 px, so iOS doesn't zoom the page when they get focus, and
// placeholders are bright enough to read (AA contrast).
const fieldBase =
  'bg-[#1a1a2e] border text-[#f5e6c8] placeholder:text-[#f5e6c8]/60 rounded px-2 py-1 text-base focus:outline-none';
const fieldClasses = `${fieldBase} border-[#5a3a28] focus:border-[#c4a35a]`;
const buttonClasses = 'bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-3 py-1 transition-colors';
const linkClasses = 'text-[#c4a35a] hover:underline rounded';
const markClasses = 'bg-[#c4a35a] text-[#1a1a2e] rounded-sm';
const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a35a]/60';

// The result count is announced this long after the search or filter last
// changed, so screen readers don't read it out at every letter typed.
const RESULTS_ANNOUNCE_DELAY_MS = 800;
// Other messages wait a moment too: the region is emptied first, so that
// the same message twice in a row is read both times.
const MESSAGE_ANNOUNCE_DELAY_MS = 100;

const NONE_KEPT: ReadonlySet<string> = new Set();

export default function Journal({ character, onChange, opening, onOpened }: JournalProps) {
  const entries = getJournalEntries(character);
  const visits = character.fairyVisits;

  const [query, setQuery] = useState('');
  const [hexFilter, setHexFilter] = useState<JournalHexFilter>(() => opening?.hex ?? 'all');
  // Entries added or edited since the search or filter last changed. They
  // stay listed even if they don't match, so one doesn't vanish while it's
  // being typed in, or as soon as it's moved to another hex.
  const [kept, setKept] = useState<ReadonlySet<string>>(NONE_KEPT);

  // The list follows the search a moment behind the field, so that typing
  // stays quick in a long journal: React redraws the list when it's free.
  const searched = useDeferredValue(query);
  const words = useMemo(() => parseJournalQuery(searched), [searched]);
  const list = useMemo(
    () => listJournal(entries, { fairyVisits: visits }, hexFilter, words, kept),
    [entries, visits, hexFilter, words, kept],
  );
  const options = useMemo(() => hexFilterOptions(entries, hexFilter), [entries, hexFilter]);
  const summary = describeJournalList(list, hexFilter, searched);

  const headingId = useId();
  const summaryId = useId();
  const searchId = useId();
  const filterId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Opened from another tab: start at the top, with focus on the heading,
  // which reads out the summary (as its description).
  useEffect(() => {
    if (!opening) return;
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
    onOpened?.();
  }, [opening, onOpened]);

  // Focus for after an action that removes or adds the focused control,
  // found by its data-journal-focus key once the change is on screen.
  const [focusRequest, setFocusRequest] = useState<{ key: string; seq: number } | null>(null);
  const moveFocusTo = useCallback((key: string) => setFocusRequest((r) => ({ key, seq: (r?.seq ?? 0) + 1 })), []);
  useEffect(() => {
    if (!focusRequest) return;
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-journal-focus="${CSS.escape(focusRequest.key)}"]`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusRequest]);

  // Screen-reader announcements, in a polite live region. `null` stands for
  // the summary as it is when the announcement is made.
  const [announcement, setAnnouncement] = useState('');
  const [pending, setPending] = useState<{ message: string | null; seq: number } | null>(null);
  const announce = useCallback((message: string | null) => {
    setAnnouncement('');
    setPending((p) => ({ message, seq: (p?.seq ?? 0) + 1 }));
  }, []);
  // The latest summary and list, for the timer above and for deleting.
  const summaryRef = useRef(summary);
  const itemsRef = useRef<JournalListItem[]>(list.items);
  useEffect(() => {
    summaryRef.current = summary;
    itemsRef.current = list.items;
  });
  useEffect(() => {
    if (!pending) return;
    const { message } = pending;
    const timer = setTimeout(
      () => setAnnouncement(message ?? summaryRef.current),
      message === null ? RESULTS_ANNOUNCE_DELAY_MS : MESSAGE_ANNOUNCE_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [pending]);

  // ── Search and filter ──

  const changeQuery = (next: string) => {
    setQuery(next);
    setKept(NONE_KEPT);
    announce(null);
  };
  const changeFilter = (next: JournalHexFilter) => {
    setHexFilter(next);
    setKept(NONE_KEPT);
    announce(null);
  };
  const clearSearch = () => {
    changeQuery('');
    moveFocusTo('search');
  };
  const clearAll = () => {
    setQuery('');
    setHexFilter('all');
    setKept(NONE_KEPT);
    announce(null);
    moveFocusTo('search');
  };

  // ── Entries ──
  // The handlers given to each entry's card stay the same from one render to
  // the next, so a card is only drawn again when its own entry changes.

  // Writes go through the functional form of onChange, so that they act on
  // the entries as they are when the update runs.
  const updateEntries = useCallback(
    (update: (list: JournalEntry[]) => JournalEntry[]) =>
      onChange((prev) => ({ journalEntries: update(getJournalEntries(prev)) })),
    [onChange],
  );
  const keepInView = useCallback((id: string) => setKept((k) => (k.has(id) ? k : new Set(k).add(id))), []);

  const addEntry = () => {
    // Made out here, so a repeated run of the updater adds the same entry.
    const entry = createJournalEntry(character);
    updateEntries((list) => [...list, entry]);
    keepInView(entry.id);
    moveFocusTo(`text:${entry.id}`);
  };

  const setText = useCallback(
    (id: string, text: string) => {
      updateEntries((list) => list.map((e) => (e.id === id ? { ...e, text } : e)));
      keepInView(id);
    },
    [updateEntries, keepInView],
  );

  const setHex = useCallback(
    (id: string, hex: HexCoord | '') => {
      updateEntries((list) => list.map((e) => (e.id === id ? withEntryHex(e, hex) : e)));
      keepInView(id);
      announce(hex ? `Hex ${hex} saved.` : 'Hex removed.');
    },
    [updateEntries, keepInView, announce],
  );

  // Focus goes to the entry listed after the deleted one, or else the one
  // before it, or else the heading.
  const deleteEntry = useCallback(
    (id: string) => {
      const items = itemsRef.current;
      const i = items.findIndex((item) => item.entry.id === id);
      const next = items[i + 1] ?? items[i - 1];
      updateEntries((all) => all.filter((e) => e.id !== id));
      moveFocusTo(next ? `entry:${next.entry.id}` : 'heading');
      announce('Entry deleted.');
    },
    [updateEntries, moveFocusTo, announce],
  );

  const showControls = entries.length > 0 || query !== '' || hexFilter !== 'all';

  return (
    // scroll-mt keeps an element focus moves to clear of the sticky header.
    <section
      ref={rootRef}
      aria-labelledby={headingId}
      className="bg-[#2a2a3e] rounded-lg p-4 [&_[data-journal-focus]]:scroll-mt-28"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-[#5a3a28] pb-2">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          data-journal-focus="heading"
          aria-describedby={summaryId}
          className={`text-[#c4a35a] text-xl font-bold ${focusRing}`}
        >
          Journal
        </h2>
        <button type="button" onClick={addEntry} className={buttonClasses}>
          Add Entry
        </button>
      </div>

      {showControls && (
        <div
          role="search"
          aria-label="Search and filter the journal"
          className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,13rem)] gap-3 mb-3"
        >
          <div className="min-w-0">
            <label htmlFor={searchId} className={labelClasses}>
              Search
            </label>
            <div className="relative">
              <input
                id={searchId}
                type="search"
                data-journal-focus="search"
                value={query}
                onChange={(e) => changeQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && query !== '') {
                    e.preventDefault();
                    changeQuery('');
                  }
                }}
                placeholder="Text, place, hex or date"
                enterKeyHint="search"
                autoComplete="off"
                className={`${fieldClasses} w-full pr-9 [&::-webkit-search-cancel-button]:appearance-none`}
              />
              {query !== '' && (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Clear search"
                  title="Clear search"
                  className="absolute inset-y-0 right-0 w-9 flex items-center justify-center text-[#f5e6c8]/80 hover:text-[#f5e6c8] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a35a]/60"
                >
                  <span aria-hidden="true">✕</span>
                </button>
              )}
            </div>
          </div>
          <div className="min-w-0">
            <label htmlFor={filterId} className={labelClasses}>
              Filter by hex
            </label>
            <select
              id={filterId}
              value={hexFilter}
              onChange={(e) => changeFilter(toJournalHexFilter(e.target.value))}
              className={`${fieldClasses} w-full`}
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3 text-sm text-[#f5e6c8]/80">
        <p id={summaryId}>
          {summary}
          {entries.length === 0 && ' Add one to start recording your adventures.'}
        </p>
        {list.items.length > 1 && <p className="text-xs">Newest first</p>}
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>

      {list.items.length === 0 && entries.length > 0 && (
        <div className="bg-[#1a1a2e] rounded p-3 text-sm text-[#f5e6c8]/80">
          No entries match.{' '}
          <button type="button" onClick={clearAll} className={linkClasses}>
            Clear search and filter
          </button>
        </div>
      )}

      {list.items.length > 0 && (
        // role="list" keeps the list's semantics in Safari, which drops them
        // for unstyled lists.
        <ol role="list" className="space-y-2">
          {list.items.map(({ entry, shown, ranges, matches }) => (
            <li key={entry.id}>
              <JournalEntryCard
                entry={entry}
                shown={shown}
                ranges={ranges}
                matches={matches}
                onTextChange={setText}
                onHexChange={setHex}
                onDelete={deleteEntry}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** `text`, with the parts in `ranges` marked. */
function Highlighted({ text, ranges }: { text: string; ranges: readonly TextRange[] }) {
  if (ranges.length === 0) return text;
  return highlightSegments(text, ranges).map((segment, i) =>
    segment.match ? (
      <mark key={i} className={markClasses}>
        {segment.text}
      </mark>
    ) : (
      <span key={i}>{segment.text}</span>
    ),
  );
}

const JournalEntryCard = memo(function JournalEntryCard({
  entry,
  shown,
  ranges,
  matches,
  onTextChange,
  onHexChange,
  onDelete,
}: {
  entry: JournalEntry;
  shown: JournalEntryText;
  ranges: JournalEntryMatches;
  matches: boolean;
  onTextChange: (id: string, text: string) => void;
  onHexChange: (id: string, hex: HexCoord | '') => void;
  onDelete: (id: string) => void;
}) {
  const headingId = useId();
  const hex = getEntryHex(entry);
  const [editingHex, setEditingHex] = useState(false);
  const hexButtonRef = useRef<HTMLButtonElement>(null);
  const focusAfterRender = useFocusAfterRender();
  const closeHexEditor = () => {
    setEditingHex(false);
    focusAfterRender(hexButtonRef);
  };

  const { excerpts, moreMatches } = matchExcerpts(shown.text, ranges.text);

  return (
    <article
      aria-labelledby={headingId}
      tabIndex={-1}
      data-journal-focus={`entry:${entry.id}`}
      className={`bg-[#1a1a2e] rounded p-3 ${focusRing}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            id={headingId}
            className={`${entry.fairyDate ? 'text-[#c9b3f0]' : 'text-[#c4a35a]'} text-sm font-semibold break-words`}
          >
            <Highlighted text={shown.date} ranges={ranges.date} />
          </h3>
          {shown.location && (
            <p className="text-[#f5e6c8]/80 text-xs break-words">
              <Highlighted text={shown.location} ranges={ranges.location} />
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDelete(entry.id)}
          aria-describedby={headingId}
          className="shrink-0 text-red-400 hover:text-red-300 text-sm px-2 py-0.5 rounded hover:bg-red-400/10 transition-colors"
        >
          Delete
        </button>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {hex && (
          <span className="text-[#f5e6c8]/80 tabular-nums">
            <Highlighted text={shown.hex} ranges={ranges.hex} />
          </span>
        )}
        <button
          ref={hexButtonRef}
          type="button"
          onClick={() => (editingHex ? closeHexEditor() : setEditingHex(true))}
          aria-expanded={editingHex}
          aria-describedby={headingId}
          className={linkClasses}
        >
          {hex ? 'Change hex' : 'Set hex'}
        </button>
      </div>

      {editingHex && (
        <HexEditor
          hex={hex}
          onSave={(next) => {
            if (next !== hex) onHexChange(entry.id, next);
            closeHexEditor();
          }}
          onCancel={closeHexEditor}
        />
      )}

      {excerpts.length > 0 && (
        <div className="mt-2 text-xs text-[#f5e6c8]/80">
          <p className="text-[#c4a35a] font-semibold">Found in the text:</p>
          <ul className="space-y-0.5">
            {excerpts.map((excerpt) => (
              <li key={excerpt.start} className="break-words">
                {excerpt.cutStart && '…'}
                {excerpt.segments.map((segment, j) =>
                  segment.match ? (
                    <mark key={j} className={markClasses}>
                      {segment.text}
                    </mark>
                  ) : (
                    <span key={j}>{segment.text}</span>
                  ),
                )}
                {excerpt.cutEnd && '…'}
              </li>
            ))}
          </ul>
          {moreMatches > 0 && (
            <p>
              and {moreMatches.toLocaleString('en-US')} more {moreMatches === 1 ? 'match' : 'matches'}
            </p>
          )}
        </div>
      )}

      <textarea
        data-journal-focus={`text:${entry.id}`}
        value={shown.text}
        onChange={(e) => onTextChange(entry.id, e.target.value)}
        aria-label={`Entry for ${shown.date}`}
        placeholder="What happened today?"
        rows={3}
        className={`${fieldClasses} w-full resize-y mt-2`}
      />

      {!matches && (
        <p className="mt-1 text-xs italic text-[#f5e6c8]/80">
          This entry doesn&apos;t match the search or filter. It stays here until you change them.
        </p>
      )}
    </article>
  );
});

/**
 * Change or clear an entry's hex: a hex on the map, typed as on the map's
 * "Go to hex" (303 is 0303), or nothing.
 */
function HexEditor({
  hex,
  onSave,
  onCancel,
}: {
  hex: HexCoord | '';
  onSave: (hex: HexCoord | '') => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<string>(hex);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const typed = value.trim();
    if (typed === '') {
      onSave('');
      return;
    }
    const next = parseTypedHex(typed);
    if (!next) {
      setError(`No hex "${typed}" on the map.`);
      return;
    }
    onSave(next);
  };

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      className="mt-2 bg-[#2a2a3e] rounded p-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={inputId} className="text-[#c4a35a] text-xs font-semibold">
          Hex
        </label>
        <input
          id={inputId}
          // Focus goes straight to the field when the editor opens.
          autoFocus
          type="text"
          inputMode="numeric"
          enterKeyHint="done"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          className={`${error ? `${fieldBase} border-[#ff8a6a]` : fieldClasses} w-24`}
        />
        <button type="submit" className={buttonClasses}>
          Save
        </button>
        <button type="button" onClick={onCancel} className="text-[#f5e6c8]/80 hover:text-[#f5e6c8] rounded px-2 py-1">
          Cancel
        </button>
      </div>
      <p id={hintId} className="text-[#f5e6c8]/80 text-xs mt-1">
        Its number on the map, like 0606. Leave it blank for no hex.
      </p>
      <div aria-live="polite">
        {error && (
          <p id={errorId} className={errorClasses}>
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
