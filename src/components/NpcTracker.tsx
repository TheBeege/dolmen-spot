'use client';

// The NPCs tab: the people the character has met, where they are, what they
// want, the quests they've given and the notes written about them.
//
// A note is not kept on the NPC. It's a journal entry that names them
// (JournalEntry.npcIds), so it's dated and placed like any other entry, shows
// in the Journal tab too, and one entry can be about several NPCs. Adding a
// note here writes that entry and nothing else; deleting one is the Journal
// tab's own delete, by entry id. Deleting an NPC leaves their notes in the
// journal, where they still read (an entry naming an NPC who is gone names no
// one, and the load repair keeps it).
//
// The list's order, its search, the quest count and the notes grouping live in
// src/lib/npcs.ts, where they're tested.

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Character, CharacterUpdater, HexCoord, JournalEntry, Npc } from '@/lib/types';
import { readHexInput } from '@/lib/hex';
import { newId } from '@/lib/ids';
import {
  getEntryDisplayText,
  getJournalEntries,
  parseJournalQuery,
  withoutEntry,
  type SearchTerm,
} from '@/lib/journal';
import {
  addNpc,
  addQuest,
  changeNpc,
  createNpc,
  createNpcNote,
  deleteNpc,
  deleteQuest,
  describeNpcList,
  describeQuestCount,
  entryNpcNames,
  getNpcHex,
  getNpcQuests,
  getNpcs,
  listNpcs,
  notesByNpc,
  npcLabel,
  npcText,
  setQuestDone,
  withNpcHex,
} from '@/lib/npcs';
import { readNpcDrafts, saveNpcDrafts, type NpcDraft, type NpcDrafts, type NpcEditing } from '@/lib/npc-drafts';
import { greenButtonClasses, labelClasses, quietButtonClasses } from '@/components/FairyFields';
import HexField from '@/components/HexField';

interface NpcTrackerProps {
  character: Character;
  onChange: (updates: CharacterUpdater) => void;
}

// Inputs are 16 px, so iOS doesn't zoom the page when they get focus, and
// placeholders are bright enough to read (AA contrast).
const fieldClasses =
  'w-full bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] placeholder:text-[#9c948b] rounded px-2 py-1 text-base focus:outline-none focus:border-[#c4a35a]';
// The dimmest text tones (globals.css), each solid and over AA on either the
// card (#2a2a3e) or the page (#1a1a2e) they sit on.
const fadedText = 'text-[#a1988f]';
const faintText = 'text-[#9c948b]';
const linkClasses = 'text-[#c4a35a] hover:underline rounded px-1 py-1';
const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a35a]/60';
const cardClasses = 'bg-[#1a1a2e] rounded p-3';
// A quiet button that can be unavailable: a disabled one is faded, which the
// sheet allows only for controls that are disabled (never for text).
const actionButtonClasses = `${quietButtonClasses} disabled:opacity-40 disabled:cursor-not-allowed`;
// Bright enough to read on both tones, hover included.
const dangerText = 'text-[#ff9a85] hover:text-[#ffd0c4] transition-colors';
const dangerLinkClasses = `${dangerText} rounded px-1 py-1`;
const dangerBoxClasses = `${dangerText} border border-[#5a3a28] hover:border-[#ff9a85]/60 rounded px-3 py-1`;

// The message region is emptied first, so that the same message twice in a row
// is read both times.
const MESSAGE_ANNOUNCE_DELAY_MS = 100;

const BLANK_DRAFT: NpcDraft = { name: '', affiliation: '', location: '', goals: '', hex: '' };

function draftOf(npc: Npc): NpcDraft {
  return {
    name: npcText(npc.name),
    affiliation: npcText(npc.affiliation),
    location: npcText(npc.location),
    goals: npcText(npc.goals),
    hex: getNpcHex(npc),
  };
}

/** The fields of a draft, without its hex, which is set apart from them (withNpcHex). */
function fieldsOf(draft: NpcDraft): Pick<Npc, 'name' | 'affiliation' | 'location' | 'goals'> {
  return { name: draft.name, affiliation: draft.affiliation, location: draft.location, goals: draft.goals };
}

// ── What has been typed, kept across a tab switch ────────────────────
//
// Picking another tab unmounts this one (src/app/page.tsx), so a half-written
// note or a half-filled form would go with it, silently. What has been typed
// is kept in sessionStorage instead, used below and forgotten when the
// character is deleted (src/lib/npc-drafts.ts).

/** Everything a card can do, passed as one object so the card takes one prop for them. */
interface NpcActions {
  edit: (id: string) => void;
  save: (id: string | null, draft: NpcDraft, hex: HexCoord | '') => void;
  cancelEdit: (id: string | null) => void; // the NPC whose form was cancelled; null for a new one
  askDelete: (id: string) => void;
  cancelDelete: (id: string) => void;
  confirmDelete: (npc: Npc) => void;
  addQuest: (id: string, text: string) => void;
  setQuestDone: (id: string, questId: string, done: boolean) => void;
  deleteQuest: (id: string, questId: string) => void;
  changeDraft: (id: string, text: string) => void;
  addNote: (npc: Npc, text: string) => void;
  deleteNote: (npc: Npc, entry: JournalEntry) => void;
}

// An NPC with no notes gets the same empty list every render, so that a card
// without notes isn't re-rendered just because an empty array was made again.
const NO_NOTES: readonly JournalEntry[] = [];

export default function NpcTracker({ character, onChange }: NpcTrackerProps) {
  const npcs = getNpcs(character);
  const notes = notesByNpc(character);

  const [query, setQuery] = useState('');
  // What was typed before the tab was switched away from, read once, before
  // the first render (see "What has been typed" above). The tab is only ever
  // drawn once the player picks it, so the server never renders it and there's
  // nothing for the first client render to disagree with.
  const [opened] = useState<NpcDrafts | null>(() =>
    typeof window === 'undefined' ? null : readNpcDrafts(character.id),
  );
  const [editing, setEditing] = useState<NpcEditing | null>(opened?.editing ?? null);
  // What has been typed into the open form, so that it survives a tab switch
  // with the form; null while there's no form, or nothing has been typed.
  const [formDraft, setFormDraft] = useState<NpcDraft | null>(opened?.form ?? null);
  // The NPC whose delete is waiting to be confirmed: deleting one throws away
  // their goals and quests, so it's asked twice.
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  // What has been typed into each NPC's note composer, by NPC id: kept here so
  // that a note being written survives the list being searched or edited.
  const [drafts, setDrafts] = useState<Record<string, string>>(opened?.notes ?? {});

  // Kept up to date as more is typed, so that it's there when the player comes
  // back to this tab.
  useEffect(() => {
    saveNpcDrafts(character.id, { notes: drafts, editing, form: formDraft });
  }, [character.id, drafts, editing, formDraft]);

  // The search's terms, kept by their content, so a letter that doesn't change
  // them leaves the list as it is.
  const termsKey = useMemo(() => JSON.stringify(parseJournalQuery(query)), [query]);
  const terms = useMemo(() => JSON.parse(termsKey) as SearchTerm[], [termsKey]);

  // The NPC being edited stays listed whatever the search says, so the form
  // can't be filtered out from under itself.
  const editingId = editing?.kind === 'npc' ? editing.id : null;
  const keep = useMemo(() => new Set<string>(editingId ? [editingId] : []), [editingId]);
  const list = useMemo(() => listNpcs(npcs, terms, keep, notes), [npcs, terms, keep, notes]);
  const summary = describeNpcList(list, query);
  // One NPC leaves nothing to search, unless a search is what narrowed the
  // list to one: that box has to stay, since it is still filtering.
  const showSearch = npcs.length > 1 || query !== '';

  const headingId = useId();
  const summaryId = useId();
  const searchId = useId();
  const searchHintId = useId();
  const rootRef = useRef<HTMLElement>(null);

  // ── Focus ──
  // Focus for after an action that removes or adds the control that had it,
  // found by its data-npc-focus key once the change is on screen.
  const [focusRequest, setFocusRequest] = useState<{ key: string; seq: number } | null>(null);
  const moveFocusTo = useCallback((key: string) => setFocusRequest((r) => ({ key, seq: (r?.seq ?? 0) + 1 })), []);
  useEffect(() => {
    if (!focusRequest) return;
    // The control that had the focus went with the change. If its card went
    // too (an NPC saved out of an active search, say), focus goes to the
    // heading rather than falling out of the tab to <body>.
    const target =
      rootRef.current?.querySelector<HTMLElement>(`[data-npc-focus="${CSS.escape(focusRequest.key)}"]`) ??
      rootRef.current?.querySelector<HTMLElement>('[data-npc-focus="heading"]');
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest' });
  }, [focusRequest]);

  // ── Announcements ──
  // Screen-reader announcements, in a polite live region.
  const [announcement, setAnnouncement] = useState('');
  const [pendingMessage, setPendingMessage] = useState<{ text: string; seq: number } | null>(null);
  const announce = useCallback((text: string) => {
    setAnnouncement('');
    setPendingMessage((p) => ({ text, seq: (p?.seq ?? 0) + 1 }));
  }, []);
  useEffect(() => {
    if (!pendingMessage) return;
    const { text } = pendingMessage;
    const timer = setTimeout(() => setAnnouncement(text), MESSAGE_ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pendingMessage]);

  // ── Writing ──
  // Writes go through the functional form of onChange, so that they act on the
  // NPCs and entries as they are when the update runs.
  const writeNpcs = useCallback(
    (update: (list: Npc[]) => Npc[]) => onChange((prev) => ({ npcs: update(getNpcs(prev)) })),
    [onChange],
  );
  const writeEntries = useCallback(
    (update: (list: JournalEntry[]) => JournalEntry[]) =>
      onChange((prev) => ({ journalEntries: update(getJournalEntries(prev)) })),
    [onChange],
  );

  const startNew = () => {
    setConfirmingDelete(null);
    setFormDraft(null);
    setEditing({ kind: 'new' });
  };

  const save = useCallback(
    (id: string | null, draft: NpcDraft, hex: HexCoord | '') => {
      const fields = fieldsOf(draft);
      setFormDraft(null);
      if (id === null) {
        const npc = withNpcHex({ ...createNpc(), ...fields }, hex);
        writeNpcs((saved) => addNpc(saved, npc));
        setEditing(null);
        // A search would hide the new NPC, and focus goes to it.
        setQuery('');
        moveFocusTo(`npc:${npc.id}`);
        announce(`${npcLabel(npc)} added.`);
        return;
      }
      writeNpcs((saved) => changeNpc(saved, id, (npc) => withNpcHex({ ...npc, ...fields }, hex)));
      setEditing(null);
      moveFocusTo(`npc:${id}`);
      announce('NPC saved.');
    },
    [writeNpcs, moveFocusTo, announce],
  );

  const edit = useCallback((id: string) => {
    setConfirmingDelete(null);
    setFormDraft(null);
    setEditing({ kind: 'npc', id });
  }, []);

  // Cancelling takes the control that had the focus away with it, so focus
  // goes back to the card, or to the button that opens the new NPC's form.
  const cancelEdit = useCallback(
    (id: string | null) => {
      setEditing(null);
      setFormDraft(null);
      moveFocusTo(id === null ? 'new' : `npc:${id}`);
    },
    [moveFocusTo],
  );

  const askDelete = useCallback((id: string) => {
    setEditing(null);
    setFormDraft(null);
    setConfirmingDelete(id);
  }, []);

  const cancelDelete = useCallback(
    (id: string) => {
      setConfirmingDelete(null);
      moveFocusTo(`npc:${id}`);
    },
    [moveFocusTo],
  );

  // The NPC's card goes, so focus moves to the next one, or the one before it,
  // or else the heading.
  const confirmDelete = useCallback(
    (npc: Npc) => {
      const at = list.items.findIndex((item) => item.id === npc.id);
      const next = list.items[at + 1] ?? list.items[at - 1];
      writeNpcs((saved) => deleteNpc(saved, npc.id));
      setConfirmingDelete(null);
      setDrafts((current) => {
        const rest = { ...current };
        delete rest[npc.id];
        return rest;
      });
      // The last one gone leaves nothing to search, so what was typed goes with
      // it rather than leaving a box over "No NPCs yet."
      if (npcs.length === 1) setQuery('');
      moveFocusTo(next ? `npc:${next.id}` : 'heading');
      announce(`${npcLabel(npc)} deleted. Their notes stay in the Journal.`);
    },
    [list.items, npcs.length, writeNpcs, moveFocusTo, announce],
  );

  // Adding one empties the field, which disables the button that had the
  // focus: it goes back to the field, ready for the next quest.
  const questAdded = useCallback(
    (id: string, text: string) => {
      // Made out here, so a repeated run of the updater adds the same quest.
      const questId = newId();
      writeNpcs((list) => changeNpc(list, id, (npc) => addQuest(npc, text, questId)));
      moveFocusTo(`quest:${id}`);
    },
    [writeNpcs, moveFocusTo],
  );
  const questTicked = useCallback(
    (id: string, questId: string, done: boolean) =>
      writeNpcs((list) => changeNpc(list, id, (npc) => setQuestDone(npc, questId, done))),
    [writeNpcs],
  );
  const questDeleted = useCallback(
    (id: string, questId: string) => {
      writeNpcs((list) => changeNpc(list, id, (npc) => deleteQuest(npc, questId)));
      // The button went with the quest, so focus stays on its card.
      moveFocusTo(`npc:${id}`);
    },
    [writeNpcs, moveFocusTo],
  );

  const changeDraft = useCallback((id: string, text: string) => setDrafts((d) => ({ ...d, [id]: text })), []);

  // Every way of clearing the search takes away the control that had the
  // focus: the ✕ that clears it, the no-match panel's button, or the box
  // itself when a single NPC is left and there is nothing to search. So focus
  // goes back to the search, or — the box having gone — to the heading.
  const clearSearch = useCallback(() => {
    setQuery('');
    moveFocusTo('search');
  }, [moveFocusTo]);

  const addNote = useCallback(
    (npc: Npc, text: string) => {
      const trimmed = text.trim();
      if (trimmed === '') return;
      // Made out here, so a repeated run of the updater adds the same entry.
      const entry = createNpcNote(character, npc.id, trimmed);
      writeEntries((list) => [...list, entry]);
      setDrafts((d) => ({ ...d, [npc.id]: '' }));
      // The box empties, which disables the button that had the focus: a
      // textarea can't be submitted with Enter, so without this a keyboard
      // user is thrown out of the tab by every note they add.
      moveFocusTo(`note:${npc.id}`);
      announce(`Note added to ${npcLabel(npc)}. It is in the Journal too.`);
    },
    [character, writeEntries, moveFocusTo, announce],
  );

  // The Journal tab's delete, entry for entry: the note is one of its entries.
  // An entry naming several NPCs is one of each one's notes, so its delete
  // says how many cards it leaves.
  const deleteNote = useCallback(
    (npc: Npc, entry: JournalEntry) => {
      writeEntries((list) => withoutEntry(list, entry.id));
      // Its Delete went with it, on this card and on any other that showed it.
      moveFocusTo(`npc:${npc.id}`);
      const onCards = entryNpcNames(entry, npcs).length;
      announce(
        onCards > 1
          ? `${npcLabel(npc)}: note deleted. It was on ${onCards} NPCs' cards and in the Journal.`
          : `${npcLabel(npc)}: note deleted. It is gone from the Journal too.`,
      );
    },
    [npcs, writeEntries, moveFocusTo, announce],
  );

  // Kept as one object across renders, so that the memoised cards below don't
  // re-render whenever the tab does: every way of changing an NPC is called
  // already, and none of them changes with what has been typed into a card.
  const actions = useMemo<NpcActions>(
    () => ({
      edit,
      save,
      cancelEdit,
      askDelete,
      cancelDelete,
      confirmDelete,
      addQuest: questAdded,
      setQuestDone: questTicked,
      deleteQuest: questDeleted,
      changeDraft,
      addNote,
      deleteNote,
    }),
    [
      edit,
      save,
      cancelEdit,
      askDelete,
      cancelDelete,
      confirmDelete,
      questAdded,
      questTicked,
      questDeleted,
      changeDraft,
      addNote,
      deleteNote,
    ],
  );

  return (
    // The page's scroll padding keeps an element focus moves to clear of the
    // sticky header (globals.css); scroll-mt leaves a little room under it.
    <section
      ref={rootRef}
      aria-labelledby={headingId}
      className="bg-[#2a2a3e] rounded-lg p-4 [&_[data-npc-focus]]:scroll-mt-9"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-[#5a3a28] pb-2">
        <h2
          id={headingId}
          tabIndex={-1}
          data-npc-focus="heading"
          aria-describedby={summaryId}
          className={`text-[#c4a35a] text-xl font-bold ${focusRing}`}
        >
          NPCs
        </h2>
        <button
          type="button"
          onClick={startNew}
          disabled={editing?.kind === 'new'}
          data-npc-focus="new"
          className={greenButtonClasses}
        >
          New NPC
        </button>
      </div>

      {showSearch && (
        <div role="search" aria-label="Search the NPCs" className="mb-3">
          <label htmlFor={searchId} className={labelClasses}>
            Search
          </label>
          <div className="relative">
            <input
              id={searchId}
              type="search"
              data-npc-focus="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return;
                // While an input method is composing, Escape is its own (to
                // cancel what's being composed): the search stays.
                // preventDefault is what keeps it staying, since a native search
                // field clears itself on Escape. The NPCs form's own Escape
                // handler (NpcForm, below) is the other way round on purpose: a
                // form has no default action to stop, so while an IME composes
                // it simply does nothing.
                if (e.nativeEvent.isComposing) e.preventDefault();
                else if (query !== '') {
                  e.preventDefault();
                  clearSearch();
                }
              }}
              placeholder="Name, place, goal, quest or note"
              enterKeyHint="search"
              autoComplete="off"
              aria-describedby={searchHintId}
              className={`${fieldClasses} pr-9 [&::-webkit-search-cancel-button]:hidden`}
            />
            {query !== '' && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                title="Clear search"
                className="absolute inset-y-0 right-0 w-9 flex items-center justify-center text-[#a1988f] hover:text-[#f5e6c8] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a35a]/60"
              >
                <span aria-hidden="true">✕</span>
              </button>
            )}
          </div>
          <p id={searchHintId} className={`${fadedText} text-xs mt-1`}>
            {'Use "quotes" for an exact phrase.'}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3 text-sm">
        <p id={summaryId} className={`${fadedText} min-w-0 [overflow-wrap:anywhere]`}>
          {summary}
        </p>
        {list.items.length > 1 && <p className={`${faintText} text-xs`}>By name</p>}
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>

      {npcs.length === 0 && (
        <div className={`${cardClasses} text-sm ${fadedText}`}>
          Add an NPC to keep track of the people you meet: where they are, what they want, the quests they&rsquo;ve
          given you and the notes you write about them.
        </div>
      )}

      {npcs.length > 0 && list.items.length === 0 && (
        <div className={`${cardClasses} text-sm ${fadedText}`}>
          No NPCs match. <button type="button" onClick={clearSearch} className={linkClasses}>Clear search</button>
        </div>
      )}

      {editing?.kind === 'new' && (
        <div className="mb-2">
          <NpcForm
            heading="New NPC"
            submitLabel="Add NPC"
            initial={formDraft ?? BLANK_DRAFT}
            onDraftChange={setFormDraft}
            onSave={(draft, hex) => save(null, draft, hex)}
            onCancel={() => cancelEdit(null)}
          />
        </div>
      )}

      {list.items.length > 0 && (
        <ol role="list" className="space-y-2">
          {list.items.map((npc) => (
            <li key={npc.id}>
              <NpcCard
                npc={npc}
                notes={notes.get(npc.id) ?? NO_NOTES}
                character={character}
                editing={editingId === npc.id}
                confirmingDelete={confirmingDelete === npc.id}
                draft={drafts[npc.id] ?? ''}
                formDraft={editingId === npc.id ? formDraft : null}
                onFormDraftChange={setFormDraft}
                actions={actions}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ── One NPC ──────────────────────────────────────────────────────────

// Memoised, so that typing a note into one card re-renders only that card: the
// tab hands every card the same memoised actions, the same character and the
// same notes, and the draft is a string, so only the card being typed into
// gets a prop that changed.
const NpcCard = memo(function NpcCard({
  npc,
  notes,
  character,
  editing,
  confirmingDelete,
  draft,
  formDraft,
  onFormDraftChange,
  actions,
}: {
  npc: Npc;
  notes: readonly JournalEntry[];
  character: Character;
  editing: boolean;
  confirmingDelete: boolean;
  draft: string; // the note being written
  formDraft: NpcDraft | null; // what has been typed into this NPC's form, if it's open
  onFormDraftChange: (draft: NpcDraft) => void;
  actions: NpcActions;
}) {
  const headingId = useId();
  const questIds = useId();
  const composerId = useId();
  const [newQuest, setNewQuest] = useState('');

  const label = npcLabel(npc);
  const affiliation = npcText(npc.affiliation);
  const location = npcText(npc.location);
  const goals = npcText(npc.goals);
  const hex = getNpcHex(npc);
  const quests = getNpcQuests(npc);
  const count = describeQuestCount(npc);

  const addQuestRow = (e: FormEvent) => {
    e.preventDefault();
    if (newQuest.trim() === '') return;
    actions.addQuest(npc.id, newQuest);
    setNewQuest('');
  };

  const addNote = (e: FormEvent) => {
    e.preventDefault();
    actions.addNote(npc, draft);
  };

  return (
    <article
      aria-labelledby={headingId}
      tabIndex={-1}
      data-npc-focus={`npc:${npc.id}`}
      className={`${cardClasses} ${focusRing}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={headingId} className="text-[#c4a35a] text-base font-semibold min-w-0 [overflow-wrap:anywhere]">
          {label}
        </h3>
        <p className={`${fadedText} text-xs`}>{count}</p>
      </div>

      {editing ? (
        <div className="mt-2">
          <NpcForm
            heading={`Edit ${label}`}
            submitLabel="Save"
            initial={formDraft ?? draftOf(npc)}
            onDraftChange={onFormDraftChange}
            onSave={(next, nextHex) => actions.save(npc.id, next, nextHex)}
            onCancel={() => actions.cancelEdit(npc.id)}
          />
        </div>
      ) : (
        <>
          {(affiliation || location || hex) && (
            <dl className="mt-1 text-sm space-y-0.5">
              {affiliation && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className={`${fadedText} shrink-0`}>Affiliation</dt>
                  <dd className="text-[#f5e6c8] min-w-0 [overflow-wrap:anywhere]">{affiliation}</dd>
                </div>
              )}
              {(location || hex) && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className={`${fadedText} shrink-0`}>Where</dt>
                  <dd className="text-[#f5e6c8] min-w-0 [overflow-wrap:anywhere]">
                    {location}
                    {location && hex && ' · '}
                    {hex && <span className="tabular-nums">Hex {hex}</span>}
                  </dd>
                </div>
              )}
            </dl>
          )}

          {goals && (
            <p className="mt-1 text-sm text-[#f5e6c8] whitespace-pre-wrap [overflow-wrap:anywhere]">
              <span className={fadedText}>Goals: </span>
              {goals}
            </p>
          )}

          {/* ── Quests ── */}
          <div className="mt-3">
            <h4 className="text-[#c4a35a] text-sm font-semibold">Quests</h4>
            {quests.length > 0 ? (
              <ol role="list" className="mt-1 space-y-1">
                {quests.map((quest, index) => {
                  const inputId = `${questIds}-${index}`;
                  const text = npcText(quest.text);
                  const questName = text || 'untitled';
                  return (
                    <li key={quest.id || `quest-${index}`} className="flex items-start gap-2">
                      {/* The name is the quest's text, which two NPCs can share,
                          so the NPC is given as the description. */}
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={quest.done === true}
                        onChange={(e) => actions.setQuestDone(npc.id, quest.id, e.target.checked)}
                        aria-describedby={headingId}
                        className="mt-1 shrink-0 h-4 w-4 accent-[#c4a35a]"
                      />
                      <label
                        htmlFor={inputId}
                        className={`min-w-0 text-sm [overflow-wrap:anywhere] ${
                          quest.done === true ? `${fadedText} line-through` : 'text-[#f5e6c8]'
                        }`}
                      >
                        {text || 'Untitled quest'}
                      </label>
                      <button
                        type="button"
                        onClick={() => actions.deleteQuest(npc.id, quest.id)}
                        aria-label={`Delete quest ${questName} for ${label}`}
                        className={`${dangerLinkClasses} text-xs shrink-0 ml-auto`}
                      >
                        Delete
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className={`${faintText} text-xs mt-1`}>No quests yet.</p>
            )}
            <form onSubmit={addQuestRow} className="mt-2">
              <label htmlFor={`${questIds}-new`} className="sr-only">
                New quest for {label}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id={`${questIds}-new`}
                  type="text"
                  data-npc-focus={`quest:${npc.id}`}
                  value={newQuest}
                  onChange={(e) => setNewQuest(e.target.value)}
                  placeholder="A quest they gave you"
                  autoComplete="off"
                  className={`${fieldClasses} min-w-0 flex-1 basis-40`}
                />
                {/* The name says what it does; the description says whose. */}
                <button
                  type="submit"
                  className={actionButtonClasses}
                  disabled={newQuest.trim() === ''}
                  aria-describedby={headingId}
                >
                  Add quest
                </button>
              </div>
            </form>
          </div>

          {/* ── Notes ── */}
          <div className="mt-3">
            <h4 className="text-[#c4a35a] text-sm font-semibold">
              Notes {notes.length > 0 && <span className={`${fadedText} font-normal`}>({notes.length})</span>}
            </h4>
            {notes.length > 0 ? (
              <ol role="list" className="mt-1 space-y-2">
                {notes.map((entry, index) => {
                  const shown = getEntryDisplayText(entry, character);
                  // The name says which note this is: two can share a day, or
                  // start the same way, and one entry naming two NPCs is a note
                  // on both their cards. Its place on the card (newest first)
                  // tells apart the ones the rest of the name can't.
                  const excerpt = Array.from(shown.text.trim()).slice(0, 40).join('');
                  return (
                    <li key={entry.id} className="border border-[#5a3a28] rounded p-2">
                      <p className={`${entry.fairyDate ? 'text-[#c9b3f0]' : 'text-[#c4a35a]'} text-xs font-semibold [overflow-wrap:anywhere]`}>
                        {shown.date}
                      </p>
                      {(shown.location || shown.hex) && (
                        <p className={`${fadedText} text-xs [overflow-wrap:anywhere]`}>
                          {shown.location}
                          {shown.location && shown.hex && ' · '}
                          {shown.hex && <span className="tabular-nums">{shown.hex}</span>}
                        </p>
                      )}
                      <p className="mt-1 text-sm text-[#f5e6c8] whitespace-pre-wrap [overflow-wrap:anywhere]">
                        {shown.text || 'This entry has no text yet.'}
                      </p>
                      <div className="mt-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => actions.deleteNote(npc, entry)}
                          aria-label={
                            excerpt
                              ? `Delete note ${index + 1} of ${shown.date} for ${label}: ${excerpt}`
                              : `Delete note ${index + 1} of ${shown.date} for ${label}, which has no text`
                          }
                          className={`${dangerLinkClasses} text-xs`}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className={`${faintText} text-xs mt-1`}>No notes yet.</p>
            )}
            <form onSubmit={addNote} className="mt-2">
              <label htmlFor={composerId} className="block text-[#c4a35a] text-sm font-semibold mb-1">
                Write a note for {label}
              </label>
              <textarea
                id={composerId}
                data-npc-focus={`note:${npc.id}`}
                value={draft}
                onChange={(e) => actions.changeDraft(npc.id, e.target.value)}
                placeholder={`What happened with ${label}?`}
                rows={2}
                className={`${fieldClasses} resize-y`}
              />
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <p className={`${faintText} text-xs min-w-0`}>It is kept in the Journal too.</p>
                <button
                  type="submit"
                  className={actionButtonClasses}
                  disabled={draft.trim() === ''}
                  aria-describedby={headingId}
                >
                  Add note
                </button>
              </div>
            </form>
          </div>

          {confirmingDelete ? (
            <div className="mt-3 border border-[#5a3a28] rounded p-3">
              <p className="text-[#f5e6c8] text-sm">
                Delete <span className="text-[#c4a35a]">{label}</span>?
              </p>
              <p className={`${fadedText} text-xs mt-1`}>
                Their goals and quests go with them. Their notes are journal entries, so they stay in the Journal.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => actions.confirmDelete(npc)} className={`${dangerBoxClasses} text-sm font-semibold`}>
                  Delete NPC
                </button>
                <button type="button" onClick={() => actions.cancelDelete(npc.id)} className={quietButtonClasses} autoFocus>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            // "Edit" and "Delete" are the same words on every card, so each
            // one's description says which NPC it is: the heading. (Axe
            // doesn't check that names differ; screen readers still read both.)
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => actions.edit(npc.id)}
                aria-describedby={headingId}
                className={quietButtonClasses}
              >
                <span aria-hidden="true">✎ </span>
                Edit
              </button>
              <button type="button" onClick={() => actions.askDelete(npc.id)} aria-describedby={headingId} className={dangerBoxClasses}>
                Delete
              </button>
            </div>
          )}
        </>
      )}
    </article>
  );
});

// ── The form ─────────────────────────────────────────────────────────

/** Whether anything has been typed into a draft: a form with nothing in it has nothing to save. */
function hasAnything(draft: NpcDraft): boolean {
  return [draft.name, draft.affiliation, draft.location, draft.goals, draft.hex].some((field) => field.trim() !== '');
}

/**
 * An NPC's fields, for adding one or editing one. A form rather than the
 * Journal's write-as-you-type cards, because the hex is checked when it's
 * saved: a hex that isn't on the map is shown as an error instead of being
 * stored, and nothing else is written until the whole form is.
 *
 * What's typed is reported out as it changes (onDraftChange), so that the tab
 * can keep it while the player looks at another one.
 */
function NpcForm({
  heading,
  submitLabel,
  initial,
  onDraftChange,
  onSave,
  onCancel,
}: {
  heading: string;
  submitLabel: string;
  initial: NpcDraft;
  onDraftChange: (draft: NpcDraft) => void;
  onSave: (draft: NpcDraft, hex: HexCoord | '') => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<NpcDraft>(initial);
  const [hexError, setHexError] = useState<string | null>(null);
  const headingId = useId();
  const nameId = useId();
  const affiliationId = useId();
  const locationId = useId();
  const goalsId = useId();

  const change = (next: NpcDraft) => {
    setDraft(next);
    onDraftChange(next);
  };

  const set = (field: keyof NpcDraft) => (e: { target: { value: string } }) => {
    change({ ...draft, [field]: e.target.value });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // A form with nothing in it saves nothing: there is no NPC to make.
    if (!hasAnything(draft)) return;
    const reading = readHexInput(draft.hex);
    if (reading.error !== undefined) {
      setHexError(reading.error);
      return;
    }
    onSave(draft, reading.hex);
  };

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          onCancel();
        }
      }}
      aria-labelledby={headingId}
      className="border border-[#5a3a28] rounded p-3 space-y-2"
    >
      <h3 id={headingId} className="text-[#c4a35a] text-sm font-semibold">
        {heading}
      </h3>

      <div>
        <label htmlFor={nameId} className={labelClasses}>
          Name
        </label>
        <input
          id={nameId}
          type="text"
          value={draft.name}
          onChange={set('name')}
          autoComplete="off"
          autoFocus
          className={fieldClasses}
        />
      </div>

      <div>
        <label htmlFor={affiliationId} className={labelClasses}>
          Affiliation
        </label>
        <input
          id={affiliationId}
          type="text"
          value={draft.affiliation}
          onChange={set('affiliation')}
          placeholder="Who they are, or who they serve"
          autoComplete="off"
          className={fieldClasses}
        />
      </div>

      <div>
        <label htmlFor={locationId} className={labelClasses}>
          Where they are
        </label>
        <input
          id={locationId}
          type="text"
          value={draft.location}
          onChange={set('location')}
          placeholder="Lankshorn, or a hut past the mill"
          autoComplete="off"
          className={fieldClasses}
        />
      </div>

      <HexField
        label="Map hex"
        labelClassName="text-[#c4a35a] text-sm font-semibold"
        value={draft.hex}
        onChange={(value) => {
          change({ ...draft, hex: value });
          setHexError(null);
        }}
        error={hexError}
        hint="The hex they're found in, like 0606. Leave it blank for none."
      />

      <div>
        <label htmlFor={goalsId} className={labelClasses}>
          Goals
        </label>
        <textarea
          id={goalsId}
          value={draft.goals}
          onChange={set('goals')}
          placeholder="What do they want?"
          rows={2}
          className={`${fieldClasses} resize-y`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* As "Add note" and "Add quest" are: nothing to save until something
            has been typed. */}
        <button type="submit" className={greenButtonClasses} disabled={!hasAnything(draft)}>
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={quietButtonClasses}>
          Cancel
        </button>
      </div>
    </form>
  );
}
