'use client';

import { Fragment, memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Character,
  CharacterUpdater,
  SpellSlot,
  CharacterGlamour,
  CharacterRune,
  CharacterKnack,
  InventoryItem,
  KnownSpell,
  KnownSpellSource,
  SpellStudyEntry,
  StudySource,
  ActiveSpellStudy,
  SpellType,
} from '@/lib/types';
import {
  getCharacterMagicProfile,
  getRuneUsageFrequency,
  getRuneRollModifier,
  ARCANE_SPELLS,
  HOLY_SPELLS,
  GLAMOURS,
  FAIRY_RUNES,
  MOSSLING_KNACKS,
  MAGICIAN_STARTING_SPELL_BOOKS,
  SPELLBOOK_CAPACITY,
  FEATURE_NOTES,
  findArcaneSpell,
  findSpell,
  getLearnableSpellRanks,
  getSpellSummary,
  getStudyConfig,
} from '@/lib/gamedata';
import {
  countPreparedByRank,
  getMagicSections,
  getScrollItems,
  getSpellbooks,
  isSpellInAnyBook,
  isSpellOnScroll,
  isStartingBookApplied,
  rankAboveLearnableNote,
  KNOWN_SPELL_SOURCE_LABELS,
} from '@/lib/character-sheet';
import {
  formatFairyDate,
  formatRecordDate,
  getCurrentTimelinePoint,
  getFairyVisits,
  getStudyProgress,
  getStudyStart,
} from '@/lib/livedTime';
import {
  ChosenSpellSummary,
  SpellInfo,
  SpellSummaryPanel,
  useSpellDisclosures,
  type SpellDisclosure,
} from '@/components/SpellInfo';

interface SpellsAndMagicProps {
  character: Character;
  onChange: (updates: CharacterUpdater) => void;
}

const inputClasses =
  'bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a]';

const sectionHeadingClasses =
  'text-lg font-bold text-[#c4a35a] mb-2 border-b border-[#5a3a28] pb-1';

const buttonClasses =
  'bg-[#5a3a28] hover:bg-[#6b4a35] text-[#f5e6c8] text-sm font-semibold px-3 py-1 rounded transition-colors';

const selectClasses =
  'bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a]';

// The part of a spell or rune row (a flex-wrap row) holding its name, with a
// spell's Rank and info button or a rune's magnitude. It takes the width its
// contents need, so on a narrow screen the row's other controls wrap below it
// instead of squeezing the name; only a name too long for the whole row wraps
// onto a second line.
const rowNameClasses = 'flex flex-auto min-w-0 items-center gap-2';
// The rest of such a row: kept to the right, and wrapping onto further lines
// itself only if it can't fit on one.
const rowControlsClasses = 'ml-auto flex flex-wrap items-center justify-end gap-2 min-w-0';
// A spell's summary panel in such a row. It comes straight after the info
// button in the page, so a screen reader reaches it next, but shows on a line
// of its own below the rest of the row.
const rowPanelClasses = 'basis-full order-last';

// What to put in brackets after each info button's name in a list of spells
// ("What Fireball does (memorised)"): `label`, numbered where the same spell
// is in the list more than once ("memorised, 2 of 2"), so that every row's
// button has a name of its own.
function spellRowContexts(spellType: SpellType, names: readonly string[], label: string): string[] {
  const keys = names.map((name) => findSpell(spellType, name)?.name ?? name.trim().toLowerCase());
  const totals = new Map<string, number>();
  for (const key of keys) totals.set(key, (totals.get(key) ?? 0) + 1);
  const seen = new Map<string, number>();
  return keys.map((key) => {
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    const total = totals.get(key) ?? 1;
    return total > 1 ? `${label}, ${n} of ${total}` : label;
  });
}

// Spells can only be learned of a Rank the character can memorise at their
// Level (Player's Book p78), so the pickers for learning one offer only those
// Ranks. This says why, when the class has higher ones. (In these messages a
// non-breaking space keeps "Level 1" and "Rank 1" together on a narrow screen.)
function learnableRanksHint(level: number, learnableRanks: readonly number[]): string {
  const highest = learnableRanks[learnableRanks.length - 1];
  // Defensive: no arcane class reaches this today (a breggle below Level 4
  // doesn't render the section).
  if (!highest) return `At Level ${level} you can't learn spells yet.`;
  return highest === 1
    ? `At Level ${level} you can learn only Rank 1 spells.`
    : `At Level ${level} you can learn spells up to Rank ${highest}.`;
}

// Whether the pickers hide any Rank the class has: learnableRanksHint says
// why. Compare the highest Rank the character can learn (0 if none) with the
// class's highest, rather than counting the Ranks, so a table with a gap in it
// can't produce a hint naming a Rank the character can't learn.
function offersUnlearnableRanks(learnableRanks: readonly number[], maxRank: number): boolean {
  return (learnableRanks[learnableRanks.length - 1] ?? 0) < maxRank;
}

export default function SpellsAndMagic({ character, onChange }: SpellsAndMagicProps) {
  const {
    profile,
    unknownNote,
    hasNoMagic,
    hasSpells,
    hasGlamours,
    hasRunes,
    hasKnacks,
    isBregglesPreMagic,
  } = getMagicSections(character);

  // ── Spell Slot Helpers ──────────────────────────────────

  // These two never change (onChange doesn't), so memoised spell rows that
  // are passed them re-render only when their own spell changes.
  const updateSpell = useCallback((id: string, updates: Partial<SpellSlot>) => {
    onChange((prev) => ({
      spells: prev.spells.map((spell) => (spell.id === id ? { ...spell, ...updates } : spell)),
    }));
  }, [onChange]);

  const addSpell = () => {
    const newSpell: SpellSlot = {
      id: crypto.randomUUID(),
      name: '',
      rank: 1,
      prepared: false,
      cast: false,
      notes: '',
    };
    onChange({ spells: [...character.spells, newSpell] });
  };

  const deleteSpell = useCallback((id: string) => {
    onChange((prev) => ({ spells: prev.spells.filter((spell) => spell.id !== id) }));
  }, [onChange]);

  const resetAllCast = () => {
    onChange({ spells: character.spells.map((s) => ({ ...s, cast: false })) });
  };

  // ── Glamour Helpers ─────────────────────────────────────

  const addGlamour = (glamourId: number) => {
    const ref = GLAMOURS.find((g) => g.id === glamourId);
    if (!ref) return;
    const newGlamour: CharacterGlamour = {
      id: crypto.randomUUID(),
      glamourId: ref.id,
      name: ref.name,
      notes: '',
    };
    onChange({ glamours: [...character.glamours, newGlamour] });
  };

  const updateGlamour = (id: string, updates: Partial<CharacterGlamour>) => {
    onChange({
      glamours: character.glamours.map((g) => (g.id === id ? { ...g, ...updates } : g)),
    });
  };

  const deleteGlamour = (id: string) => {
    onChange({ glamours: character.glamours.filter((g) => g.id !== id) });
  };

  // ── Rune Helpers ────────────────────────────────────────

  const addRune = (runeId: number) => {
    const ref = FAIRY_RUNES.find((r) => r.id === runeId);
    if (!ref) return;
    const newRune: CharacterRune = {
      id: crypto.randomUUID(),
      runeId: ref.id,
      name: ref.name,
      magnitude: ref.magnitude,
      usesRemaining: 1,
      notes: '',
    };
    onChange({ runes: [...character.runes, newRune] });
  };

  const updateRune = (id: string, updates: Partial<CharacterRune>) => {
    onChange({
      runes: character.runes.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    });
  };

  const deleteRune = (id: string) => {
    onChange({ runes: character.runes.filter((r) => r.id !== id) });
  };

  // ── Knack Helpers ───────────────────────────────────────

  const selectKnack = (knackId: number) => {
    const ref = MOSSLING_KNACKS.find((k) => k.id === knackId);
    if (!ref) return;
    const newKnack: CharacterKnack = { knackId: ref.id, name: ref.name, notes: '' };
    onChange({ knack: newKnack });
  };

  const clearKnack = () => {
    if (confirm('Change knack? This will clear the current knack selection.')) {
      onChange({ knack: null });
    }
  };

  return (
    <div className="bg-[#2a2a3e] rounded-lg p-4">
      <h2 className="text-[#c4a35a] text-xl font-bold mb-4 border-b border-[#5a3a28] pb-2">
        Spells & Magic
      </h2>

      {/* A class or kindred the app doesn't know: say so rather than guess */}
      {unknownNote && (
        <p className="text-yellow-400 text-sm mb-4">{unknownNote}</p>
      )}

      {/* No magic message */}
      {hasNoMagic && (
        <p className="text-[#f5e6c8]/50 italic mb-4">
          This character has no magical abilities.
        </p>
      )}

      {/* Breggle pre-magic message */}
      {isBregglesPreMagic && (
        <div className="bg-[#1a1a2e] border border-[#5a3a28] rounded p-3 mb-4">
          <p className="text-[#f5e6c8]/60 text-sm italic">
            Breggle arcane magic unlocks at Level 4. Current level: {character.level}.
          </p>
        </div>
      )}

      {/* Resistance to Divine Aid (enchanters and elves) */}
      {profile.hasDivineResistance && (
        <div className="bg-[#1a1a2e] border border-[#c4a35a]/30 rounded p-3 mb-4">
          <span className="text-[#c4a35a] font-semibold text-sm">Resistance to Divine Aid:</span>{' '}
          <span className="text-[#f5e6c8] text-sm">
            {FEATURE_NOTES.resistanceToDivineAid}
          </span>
        </div>
      )}

      {/* ── SPELLS PER DAY + SPELL SLOTS (Arcane/Holy) ── */}
      {hasSpells && !isBregglesPreMagic && (
        <SpellCasterSection
          character={character}
          profile={profile}
          updateSpell={updateSpell}
          addSpell={addSpell}
          deleteSpell={deleteSpell}
          resetAllCast={resetAllCast}
          onChange={onChange}
        />
      )}

      {/* ── GLAMOURS ── */}
      {hasGlamours && (
        <GlamourSection
          character={character}
          profile={profile}
          addGlamour={addGlamour}
          updateGlamour={updateGlamour}
          deleteGlamour={deleteGlamour}
        />
      )}

      {/* ── RUNES ── */}
      {hasRunes && (
        <RuneSection
          character={character}
          addRune={addRune}
          updateRune={updateRune}
          deleteRune={deleteRune}
        />
      )}

      {/* ── KNACKS ── */}
      {hasKnacks && (
        <KnackSection
          character={character}
          selectKnack={selectKnack}
          clearKnack={clearKnack}
          onChange={onChange}
        />
      )}

      {/* ── SPELL NOTES ── */}
      {!hasNoMagic && (
        <div className="mb-4">
          <h3 className={sectionHeadingClasses}>Magic Notes</h3>
          <textarea
            value={character.spellNotes}
            onChange={(e) => onChange({ spellNotes: e.target.value })}
            placeholder="General magic notes, components, restrictions..."
            rows={3}
            className={`${inputClasses} w-full resize-y`}
          />
        </div>
      )}

      {/* Notes textarea for non-magic characters too */}
      {hasNoMagic && (
        <div className="mb-4">
          <h3 className={sectionHeadingClasses}>Magic Notes</h3>
          <textarea
            value={character.spellNotes}
            onChange={(e) => onChange({ spellNotes: e.target.value })}
            placeholder="Notes about magical items, potions, scrolls..."
            rows={3}
            className={`${inputClasses} w-full resize-y`}
          />
        </div>
      )}

      {/* ── REFERENCE PANELS ── */}
      {hasSpells && !isBregglesPreMagic && (
        <SpellReference spellType={profile.spellType} maxRank={profile.maxSpellRank} />
      )}
      {hasGlamours && <GlamourReference />}
      {hasRunes && <RuneReference level={character.level} />}

    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Sub-sections (internal to this file)
// ════════════════════════════════════════════════════════════

// Explicit ordering for sort + iteration. Using an array (rather than
// Object.keys on the label record) so we don't depend on insertion order
// if the labels are ever alphabetised.
const KNOWN_SOURCES: KnownSpellSource[] = [
  'starting',
  'studied',
  'mentor',
  'research',
  'rewrite',
  'manual',
];
const KNOWN_SOURCE_ORDER: Record<KnownSpellSource, number> = KNOWN_SOURCES
  .reduce((acc, src, i) => { acc[src] = i; return acc; }, {} as Record<KnownSpellSource, number>);

function SpellCasterSection({
  character,
  profile,
  updateSpell,
  addSpell,
  deleteSpell,
  resetAllCast,
  onChange,
}: {
  character: Character;
  profile: ReturnType<typeof getCharacterMagicProfile>;
  updateSpell: (id: string, updates: Partial<SpellSlot>) => void;
  addSpell: () => void;
  deleteSpell: (id: string) => void;
  resetAllCast: () => void;
  onChange: (updates: CharacterUpdater) => void;
}) {
  const spellsPerDay = profile.spellsPerDay;
  const isArcane = profile.spellType === 'arcane';
  const spellType: SpellType = isArcane ? 'arcane' : 'holy';
  const isMagician = character.class === 'magician';
  const maxRank = profile.maxSpellRank || 6;
  // spellsPerDay is a row of the table, the same array until the Level or
  // class changes, so the known-spell and study blocks get a new list only then.
  const learnableRanks = useMemo(
    () => getLearnableSpellRanks({ spellType, spellsPerDay }),
    [spellType, spellsPerDay],
  );
  const spellInfo = useSpellDisclosures();
  const startingBookId = useId();

  // Count prepared spells by rank
  const preparedByRank = countPreparedByRank(character.spells);
  const memorisedContexts = spellRowContexts(
    spellType,
    character.spells.map((s) => s.name),
    isArcane ? 'memorised' : 'prepared',
  );

  return (
    <div className="mb-4">
      <h3 className={sectionHeadingClasses}>
        {isArcane ? 'Arcane' : 'Holy'} Spells
      </h3>

      {/* Spells Per Day summary grid */}
      {spellsPerDay && (
        <div className="mb-3">
          <div className="text-[#f5e6c8] text-sm mb-1 font-semibold">Spells Per Day:</div>
          <div className="flex flex-wrap gap-2">
            {spellsPerDay.map((max, i) => {
              const rank = i + 1;
              const prepared = preparedByRank[rank] || 0;
              const isOver = prepared > max;
              return (
                <div
                  key={rank}
                  className={`bg-[#1a1a2e] border rounded px-2 py-1 text-sm ${
                    isOver ? 'border-red-500/60 text-red-400' : 'border-[#5a3a28] text-[#f5e6c8]'
                  }`}
                >
                  <span className="text-[#c4a35a] font-semibold">R{rank}:</span>{' '}
                  {prepared}/{max}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Starting Spell Book (Magician only). Hidden once the chosen book
          has been added to inventory + known spells. */}
      {isMagician && !isStartingBookApplied(character) && (
        <div className="mb-3">
          <label htmlFor={startingBookId} className="text-[#f5e6c8] text-sm font-semibold block mb-1">
            Starting Spell Book:
          </label>
          <select
            id={startingBookId}
            value={character.startingSpellBook}
            onChange={(e) => onChange({ startingSpellBook: e.target.value })}
            className={`${selectClasses} w-full`}
          >
            <option value="">-- Select Starting Book --</option>
            {MAGICIAN_STARTING_SPELL_BOOKS.map((book) => (
              <option key={book.roll} value={book.name}>
                {book.roll}. {book.name} ({book.spells.join(', ')})
              </option>
            ))}
          </select>
          {character.startingSpellBook && (
            <>
              <StartingBookSpells bookName={character.startingSpellBook} />
              <ApplyStartingBookButton character={character} onChange={onChange} />
            </>
          )}
        </div>
      )}

      {/* Memorised (Holy) / Available Spells (Arcane) list */}
      <div className="mb-2" data-spell-list="">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-[#c4a35a] text-sm font-semibold">
            {isArcane ? 'Available Spells' : 'Prepared Spells'}
          </h4>
        </div>

        {/* Memorised spell slots */}
        {character.spells.map((spell, i) => (
          <MemorisedSpellRow
            key={spell.id}
            spell={spell}
            spellType={spellType}
            context={memorisedContexts[i]}
            maxRank={maxRank}
            onUpdate={updateSpell}
            onDelete={deleteSpell}
            {...spellInfo(spell.id)}
          />
        ))}

        {/* Arcane: auto-listed scrolls from inventory */}
        {isArcane && <InventoryScrollsList character={character} onChange={onChange} />}

        {/* Empty state */}
        {character.spells.length === 0
          && (!isArcane || getScrollItems(character).length === 0) && (
            <p className="text-[#f5e6c8]/60 text-sm italic mb-2">
              {isArcane
                ? 'Nothing available yet. Memorise a known spell or add a scroll to your inventory.'
                : 'No spells added yet.'}
            </p>
          )}

        <div className="flex flex-wrap gap-2 mt-2">
          {isArcane ? (
            <MemorisePicker
              character={character}
              spellsPerDay={spellsPerDay}
              preparedByRank={preparedByRank}
              onChange={onChange}
            />
          ) : (
            <button onClick={addSpell} className={buttonClasses}>
              + Add Spell
            </button>
          )}
          {character.spells.length > 0 && (
            <button
              onClick={resetAllCast}
              className={`${buttonClasses} bg-[#3a2a18] hover:bg-[#4a3a28]`}
            >
              Reset All Cast
            </button>
          )}
        </div>
      </div>

      {/* Arcane-only repertoire & study blocks. Below Available Spells
          since those are referenced far less often during play. */}
      {isArcane && (
        <>
          <KnownSpellsBlock character={character} maxRank={maxRank} learnableRanks={learnableRanks} onChange={onChange} />
          <SpellStudyBlock character={character} maxRank={maxRank} learnableRanks={learnableRanks} onChange={onChange} />
        </>
      )}
    </div>
  );
}

// One memorised (arcane) or prepared (holy) spell. From the sm breakpoint
// it's one line, with the name and the Notes field sharing the free space
// equally, so the columns line up from row to row. Below it the name takes
// the first line, and the controls wrap onto the next ones in groups.
// Memoised, so typing in one row's Notes re-renders only that row.
const MemorisedSpellRow = memo(function MemorisedSpellRow({
  spell,
  spellType,
  context,
  maxRank,
  onUpdate,
  onDelete,
  ...info
}: {
  spell: SpellSlot;
  spellType: SpellType;
  /** For the info button's name: see spellRowContexts. */
  context: string;
  maxRank: number;
  onUpdate: (id: string, updates: Partial<SpellSlot>) => void;
  onDelete: (id: string) => void;
} & SpellDisclosure) {
  // A cast spell's name and controls fade. Its info button and summary
  // don't, so they stay readable.
  const fade = spell.cast ? 'opacity-50' : '';
  const name = spell.name.trim();
  return (
    <div data-spell-row="" className="bg-[#1a1a2e] p-2 rounded mb-1">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex grow basis-full sm:basis-0 min-w-0 items-center gap-2">
          {spellType === 'arcane' ? (
            <>
              <span className={`text-[#c4a35a] font-semibold shrink-0 ${fade}`}>R{spell.rank}</span>
              <span className="text-[#f5e6c8] min-w-0">
                <SpellInfo spellType="arcane" name={spell.name} context={context} labelClassName={fade} {...info}>
                  {spell.name}
                </SpellInfo>
              </span>
            </>
          ) : (
            <>
              <input
                type="text"
                value={spell.name}
                onChange={(e) => onUpdate(spell.id, { name: e.target.value })}
                placeholder="Spell name"
                className={`${inputClasses} flex-1 min-w-0 ${fade}`}
              />
              {/* The button appears once the name matches a holy spell; its
                  space is kept either way so the row doesn't shift as you type.
                  Only the button shows the hover card: a card over the name
                  would get in the way of typing it. */}
              <SpellInfo spellType="holy" name={spell.name} context={context} {...info} className="w-6 h-6 shrink-0" />
            </>
          )}
        </div>
        <SpellSummaryPanel spellType={spellType} name={spell.name} {...info} className={rowPanelClasses} />
        {spellType === 'holy' && (
          <input
            type="number"
            min={1}
            max={maxRank}
            value={spell.rank}
            onChange={(e) =>
              onUpdate(spell.id, {
                rank: Math.min(maxRank, Math.max(1, parseInt(e.target.value) || 1)),
              })
            }
            aria-label={name ? `Rank of ${name}` : 'Rank'}
            title="Rank"
            className={`${inputClasses} w-14 text-center ${fade}`}
          />
        )}
        {/* From sm, this group and the next dissolve into the row (display: contents) */}
        <div className="flex items-center gap-2 sm:contents">
          <label className={`flex items-center gap-1 text-[#f5e6c8] text-sm shrink-0 cursor-pointer ${fade}`}>
            <input
              type="checkbox"
              checked={spell.prepared}
              onChange={(e) => onUpdate(spell.id, { prepared: e.target.checked })}
              className="accent-[#c4a35a]"
            />
            Prep
          </label>
          <label className={`flex items-center gap-1 text-[#f5e6c8] text-sm shrink-0 cursor-pointer ${fade}`}>
            <input
              type="checkbox"
              checked={spell.cast}
              onChange={(e) => onUpdate(spell.id, { cast: e.target.checked })}
              className="accent-[#c4a35a]"
            />
            Cast
          </label>
        </div>
        {/* Below sm, wide enough to type in before it wraps to a line of its own */}
        <div className="flex flex-1 min-w-28 items-center gap-2 sm:contents">
          {/* The span takes the free space rather than the input, whose
              padding would make it wider than the name's share */}
          <span className="flex-1 min-w-0">
            <input
              type="text"
              value={spell.notes}
              onChange={(e) => onUpdate(spell.id, { notes: e.target.value })}
              placeholder="Notes"
              className={`${inputClasses} block w-full ${fade}`}
            />
          </span>
          <button
            onClick={() => onDelete(spell.id)}
            className={`text-red-400 hover:text-red-300 text-sm font-bold px-2 py-1 rounded hover:bg-red-400/10 transition-colors shrink-0 ${fade}`}
            title="Delete spell"
          >
            X
          </button>
        </div>
      </div>
    </div>
  );
});

// ════════════════════════════════════════════════════════════
// Auto-listed scrolls (arcane Available Spells section)
// ════════════════════════════════════════════════════════════
function InventoryScrollsList({
  character,
  onChange,
}: {
  character: Character;
  onChange: (updates: CharacterUpdater) => void;
}) {
  const spellInfo = useSpellDisclosures();
  const scrolls = getScrollItems(character).filter((s) => s.scrollSpell?.name);
  if (scrolls.length === 0) return null;
  const contexts = spellRowContexts('arcane', scrolls.map((s) => s.scrollSpell!.name), 'scroll');

  const castScroll = (scrollId: string) => {
    const scroll = scrolls.find((s) => s.id === scrollId);
    if (!scroll || !scroll.scrollSpell) return;
    if (!confirm(`Cast ${scroll.scrollSpell.name} from scroll? The scroll will be consumed.`)) return;
    const strip = (items: InventoryItem[]) => items.filter((i) => i.id !== scrollId);
    onChange({
      equippedItems: strip(character.equippedItems),
      stowedItems: strip(character.stowedItems),
    });
  };

  return (
    <>
      <div className="text-[#c4a35a] text-xs font-semibold mt-2 mb-1">
        Scrolls in inventory · one-shot
      </div>
      {scrolls.map((s, i) => {
        const info = spellInfo(s.id);
        return (
          <div
            key={s.id}
            data-spell-row=""
            className="flex flex-wrap items-center gap-2 bg-[#1a1a2e] border border-[#5a3a28]/40 p-2 rounded mb-1"
          >
            <span className={rowNameClasses}>
              <span className="text-[#c4a35a] text-sm shrink-0" title="One-shot scroll">📜</span>
              <span className="text-[#c4a35a] font-semibold shrink-0">R{s.scrollSpell!.rank}</span>
              <span className="text-[#f5e6c8] min-w-0">
                <SpellInfo spellType="arcane" name={s.scrollSpell!.name} context={contexts[i]} {...info}>
                  {s.scrollSpell!.name}
                </SpellInfo>
              </span>
            </span>
            <SpellSummaryPanel spellType="arcane" name={s.scrollSpell!.name} {...info} className={rowPanelClasses} />
            <button
              type="button"
              onClick={() => castScroll(s.id)}
              className="ml-auto bg-[#5a3a28] hover:bg-[#6b4a35] text-[#f5e6c8] text-xs font-semibold px-3 py-1 rounded shrink-0"
              title="Cast from scroll (consumes it)"
            >
              Cast
            </button>
          </div>
        );
      })}
    </>
  );
}

// The chosen starting book's spells, each with what it does, since the
// dropdown's options can only list their names.
function StartingBookSpells({ bookName }: { bookName: string }) {
  const spellInfo = useSpellDisclosures();
  const book = MAGICIAN_STARTING_SPELL_BOOKS.find((b) => b.name === bookName);
  if (!book) return null;
  return (
    <div data-spell-list="" className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-[#f5e6c8]">
      <span className="text-[#f5e6c8]/70">Spells:</span>
      {book.spells.map((name) => {
        const info = spellInfo(name);
        return (
          <Fragment key={name}>
            <SpellInfo spellType="arcane" name={name} context="starting book" {...info}>{name}</SpellInfo>
            <SpellSummaryPanel spellType="arcane" name={name} {...info} className="basis-full" />
          </Fragment>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Apply Starting Book — auto-create the inventory spellbook +
// known spells when the player picks a Magician starter
// ════════════════════════════════════════════════════════════
function ApplyStartingBookButton({
  character,
  onChange,
}: {
  character: Character;
  onChange: (updates: CharacterUpdater) => void;
}) {
  const book = MAGICIAN_STARTING_SPELL_BOOKS.find((b) => b.name === character.startingSpellBook);
  if (!book) return null;

  const handleApply = () => {
    const contents = book.spells
      .map((name) => {
        const ref = findArcaneSpell(name);
        return ref ? { name: ref.name, rank: ref.rank } : { name, rank: 1 };
      });
    const newBook: InventoryItem = {
      id: crypto.randomUUID(),
      name: book.name,
      slots: 1,
      weight: 10,
      notes: '',
      equipped: true,
      kind: 'spellbook',
      spellbookContents: contents,
      isStartingBook: true,
    };
    const existingKnown = new Set(character.knownSpells.map((k) => k.name.toLowerCase()));
    const newKnown: KnownSpell[] = contents
      .filter((c) => !existingKnown.has(c.name.toLowerCase()))
      .map((c) => ({
        id: crypto.randomUUID(),
        name: c.name,
        rank: c.rank,
        source: 'starting' as const,
      }));
    onChange({
      equippedItems: [...character.equippedItems, newBook],
      knownSpells: [...character.knownSpells, ...newKnown],
    });
  };

  return (
    <button
      type="button"
      onClick={handleApply}
      className={`${buttonClasses} text-xs mt-2`}
    >
      Add to inventory &amp; known spells
    </button>
  );
}

// ════════════════════════════════════════════════════════════
// Known Spells Block (Arcane only)
// ════════════════════════════════════════════════════════════

type KnownSort = 'rank-asc' | 'rank-desc' | 'name' | 'source' | 'avail';
type AvailFilter = 'all' | 'in-hand' | 'no-book';

function KnownSpellsBlock({
  character,
  maxRank,
  learnableRanks,
  onChange,
}: {
  character: Character;
  maxRank: number;
  /** The Ranks the character can learn at their Level: see getLearnableSpellRanks. */
  learnableRanks: readonly number[];
  onChange: (updates: CharacterUpdater) => void;
}) {
  const [sort, setSort] = useState<KnownSort>('rank-asc');
  const [avail, setAvail] = useState<AvailFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | KnownSpellSource>('all');
  const [search, setSearch] = useState('');
  const [rankChips, setRankChips] = useState<Set<number>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addSource, setAddSource] = useState<KnownSpellSource>('manual');
  const spellInfo = useSpellDisclosures();
  const addSummaryId = useId();
  const addHintId = useId();

  const ranks = Array.from({ length: maxRank }, (_, i) => i + 1);

  // The picker offers only the Ranks the character can learn. A choice it no
  // longer offers (made before switching to a lower-Level character, say)
  // counts as no choice. Adding one by hand is held to the same rules: this is
  // the form's default source, so exempting it would let any Rank be recorded
  // as learned. The consequence is that a spell a Referee grants above these
  // Ranks can't be recorded through this form.
  const addChoice = findArcaneSpell(addName);
  const addSelected = addChoice && learnableRanks.includes(addChoice.rank) ? addChoice.name : '';
  const addHint = offersUnlearnableRanks(learnableRanks, maxRank)
    ? learnableRanksHint(character.level, learnableRanks)
    : null;
  const addDescribedBy = [
    addHint ? addHintId : null,
    getSpellSummary('arcane', addSelected) ? addSummaryId : null,
  ].filter(Boolean).join(' ');

  const decorated = useMemo(() => {
    return character.knownSpells.map((k) => ({
      ...k,
      inBook: isSpellInAnyBook(character, k.name),
      onScroll: isSpellOnScroll(character, k.name),
    }));
    // Narrow deps: this only reads knownSpells + inventory, not the rest of
    // the character (notes, abilities, etc.). Re-running on every keystroke
    // in unrelated fields was wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.knownSpells, character.equippedItems, character.stowedItems]);

  const filtered = decorated
    .filter((k) => (rankChips.size === 0 ? true : rankChips.has(k.rank)))
    .filter((k) => {
      if (avail === 'all') return true;
      if (avail === 'in-hand') return k.inBook;
      if (avail === 'no-book') return !k.inBook;
      return true;
    })
    .filter((k) => (sourceFilter === 'all' ? true : k.source === sourceFilter))
    .filter((k) => (search.trim() === '' ? true : k.name.toLowerCase().includes(search.trim().toLowerCase())))
    .sort((a, b) => {
      if (sort === 'rank-asc') return a.rank - b.rank || a.name.localeCompare(b.name);
      if (sort === 'rank-desc') return b.rank - a.rank || a.name.localeCompare(b.name);
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'source') return KNOWN_SOURCE_ORDER[a.source] - KNOWN_SOURCE_ORDER[b.source];
      if (sort === 'avail') return Number(b.inBook) - Number(a.inBook) || a.name.localeCompare(b.name);
      return 0;
    });

  const knownContexts = spellRowContexts('arcane', filtered.map((k) => k.name), 'known');

  const handleAdd = () => {
    if (!addChoice || !addSelected) return;
    const now = getCurrentTimelinePoint(character);
    const newSpell: KnownSpell = {
      id: crypto.randomUUID(),
      name: addChoice.name,
      rank: addChoice.rank,
      source: addSource,
      learnedAt: now.date,
      learnedInFairy: now.fairyDate,
      sinceReturnFrom: now.sinceReturnFrom,
    };
    onChange({ knownSpells: [...character.knownSpells, newSpell] });
    setAddName('');
    setShowAdd(false);
  };

  const handleDelete = useCallback((id: string) => {
    onChange((prev) => ({ knownSpells: prev.knownSpells.filter((k) => k.id !== id) }));
  }, [onChange]);

  const toggleRankChip = (r: number) => {
    setRankChips((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r); else next.add(r);
      return next;
    });
  };

  return (
    <div className="mb-4 bg-[#1a1a2e] border border-[#5a3a28]/60 rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[#c4a35a] text-sm font-semibold">Known Spells</h4>
        <span className="text-[#f5e6c8]/60 text-xs">{decorated.length} learned</span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search known spells..."
          className={`${inputClasses} flex-1 min-w-[140px] text-sm`}
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as KnownSort)}
          className={`${selectClasses} text-xs`}
          title="Sort known spells"
          aria-label="Sort known spells"
        >
          <option value="rank-asc">Rank ↑</option>
          <option value="rank-desc">Rank ↓</option>
          <option value="name">Name A-Z</option>
          <option value="source">Source</option>
          <option value="avail">Availability</option>
        </select>
        <select
          value={avail}
          onChange={(e) => setAvail(e.target.value as AvailFilter)}
          className={`${selectClasses} text-xs`}
          title="Filter known spells by availability"
          aria-label="Filter known spells by availability"
        >
          <option value="all">All</option>
          <option value="in-hand">📕 In hand</option>
          <option value="no-book">⚠ No book</option>
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as 'all' | KnownSpellSource)}
          className={`${selectClasses} text-xs`}
          title="Filter known spells by source"
          aria-label="Filter known spells by source"
        >
          <option value="all">Any source</option>
          {KNOWN_SOURCES.map((s) => (
            <option key={s} value={s}>{KNOWN_SPELL_SOURCE_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {/* Rank chips */}
      <div className="flex flex-wrap gap-1 mb-2">
        {ranks.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => toggleRankChip(r)}
            aria-pressed={rankChips.has(r)}
            className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
              rankChips.has(r)
                ? 'bg-[#c4a35a] text-[#1a1a2e]'
                : 'bg-[#2a2a3e] text-[#f5e6c8] hover:bg-[#3a3a5e]'
            }`}
          >
            R{r}
          </button>
        ))}
        {rankChips.size > 0 && (
          <button
            type="button"
            onClick={() => setRankChips(new Set())}
            className="px-2 py-0.5 rounded text-xs text-[#f5e6c8]/60 hover:text-[#f5e6c8]"
          >
            Clear
          </button>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 && (
        <p className="text-[#f5e6c8]/60 text-xs italic mb-2">
          {decorated.length === 0
            ? 'No known spells yet. Add one manually or finish a study.'
            : 'No matches.'}
        </p>
      )}
      <div className="space-y-1" data-spell-list="">
        {filtered.map((k, i) => (
          <KnownSpellRow
            key={k.id}
            spell={k}
            context={knownContexts[i]}
            learnedOn={k.learnedAt ? formatRecordDate(character, k.learnedAt, k.learnedInFairy) : undefined}
            learnedInFairyOn={k.learnedInFairy ? formatFairyDate(character, k.learnedInFairy, k.learnedAt) : undefined}
            rankNote={learnableRanks.includes(k.rank) ? undefined : rankAboveLearnableNote(k.rank, character.level)}
            onDelete={handleDelete}
            {...spellInfo(k.id)}
          />
        ))}
      </div>

      {/* Add manual */}
      <div className="mt-2">
        {!showAdd ? (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className={`${buttonClasses} text-xs`}
          >
            + Add known spell (manual)
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 bg-[#2a2a3e]/60 p-2 rounded">
            <select
              value={addSelected}
              onChange={(e) => setAddName(e.target.value)}
              aria-label="Known spell to add"
              aria-describedby={addDescribedBy || undefined}
              className={`${selectClasses} flex-1 min-w-[180px] text-sm`}
            >
              <option value="">-- Select spell --</option>
              {learnableRanks.map((rank) => (
                <optgroup key={rank} label={`Rank ${rank}`}>
                  {ARCANE_SPELLS.filter((s) => s.rank === rank).map((s) => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select
              value={addSource}
              onChange={(e) => setAddSource(e.target.value as KnownSpellSource)}
              className={`${selectClasses} text-xs`}
              title="How was this spell learned?"
              aria-label="How was this spell learned?"
            >
              {KNOWN_SOURCES.map((s) => (
                <option key={s} value={s}>{KNOWN_SPELL_SOURCE_LABELS[s]}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!addSelected}
              className={`${buttonClasses} text-xs ${!addSelected ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setAddName(''); }}
              className="text-[#f5e6c8]/60 hover:text-[#f5e6c8] text-xs"
            >
              Cancel
            </button>
            {addHint && (
              <p id={addHintId} className="basis-full text-[#f5e6c8]/60 text-xs italic">{addHint}</p>
            )}
            <ChosenSpellSummary spellType="arcane" name={addSelected} id={addSummaryId} className="basis-full" />
          </div>
        )}
      </div>
    </div>
  );
}

// One known spell. Memoised, so the list doesn't re-render as you type
// elsewhere on the tab.
const KnownSpellRow = memo(function KnownSpellRow({
  spell,
  context,
  learnedOn,
  learnedInFairyOn,
  rankNote,
  onDelete,
  ...info
}: {
  spell: KnownSpell & { inBook: boolean; onScroll: boolean };
  /** For the info button's name: see spellRowContexts. */
  context: string;
  /** When it was learned, as the calendar shows it. */
  learnedOn: string | undefined;
  /** When it was learned, if that was in Fairy. */
  learnedInFairyOn: string | undefined;
  /** Set when its Rank is above what the character can learn at their Level. */
  rankNote: string | undefined;
  onDelete: (id: string) => void;
} & SpellDisclosure) {
  return (
    <div data-spell-row="" className="flex flex-wrap items-center gap-2 bg-[#2a2a3e]/60 px-2 py-1 rounded text-sm">
      <span className={rowNameClasses}>
        <span
          className="shrink-0 text-xs"
          title={spell.inBook ? 'Spell book is in inventory' : 'No spell book in inventory contains this spell'}
        >
          {spell.inBook ? '📕' : '⚠'}
        </span>
        {spell.onScroll && (
          <span className="shrink-0 text-xs" title="Also available as a scroll">📜</span>
        )}
        <span className="text-[#c4a35a] font-semibold shrink-0">R{spell.rank}</span>
        <span className="text-[#f5e6c8] min-w-0">
          <SpellInfo spellType="arcane" name={spell.name} context={context} {...info}>{spell.name}</SpellInfo>
        </span>
      </span>
      <SpellSummaryPanel spellType="arcane" name={spell.name} {...info} className={`${rowPanelClasses} mb-1`} />
      <span className={rowControlsClasses}>
        <span
          className="text-[#f5e6c8]/60 text-xs"
          title={learnedOn ? `Learned on ${learnedOn}` : undefined}
        >
          {KNOWN_SPELL_SOURCE_LABELS[spell.source]}
        </span>
        <button
          type="button"
          onClick={() => onDelete(spell.id)}
          className="text-red-400 hover:text-red-300 text-xs px-1"
          title="Remove from known spells"
        >
          X
        </button>
      </span>
      {learnedInFairyOn && (
        <span className="basis-full text-[#c9b3f0]/80 text-xs pl-5">
          Learned on {learnedInFairyOn}
        </span>
      )}
      {rankNote && (
        <span className="basis-full text-red-400 text-xs pl-5">{rankNote}</span>
      )}
    </div>
  );
});

// ════════════════════════════════════════════════════════════
// Spell Study Block (Arcane only)
// ════════════════════════════════════════════════════════════
function SpellStudyBlock({
  character,
  maxRank,
  learnableRanks,
  onChange,
}: {
  character: Character;
  maxRank: number;
  /** The Ranks the character can learn at their Level: see getLearnableSpellRanks. */
  learnableRanks: readonly number[];
  onChange: (updates: CharacterUpdater) => void;
}) {
  const study = character.spellStudy ?? { active: null, queue: [] };
  const active = study.active;
  const queue = study.queue;

  const [draftName, setDraftName] = useState('');
  const [draftSource, setDraftSource] = useState<StudySource>('book');
  const [draftBookId, setDraftBookId] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const spellInfo = useSpellDisclosures();
  const draftSummaryId = useId();
  const draftHintId = useId();
  const targetBookId = useId();

  const availableBooks = useMemo(
    () => getSpellbooks(character).filter((b) => (b.spellbookContents?.length ?? 0) < SPELLBOOK_CAPACITY),
    // Narrow deps: only reads inventory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [character.equippedItems, character.stowedItems],
  );

  const knownNames = useMemo(
    () => new Set(character.knownSpells.map((k) => k.name.toLowerCase())),
    [character.knownSpells],
  );
  const failedBlockSet = useMemo(() => {
    const blocked = new Set<string>();
    for (const f of character.failedStudies) {
      if (character.level <= f.failedAtLevel) blocked.add(f.spellName.toLowerCase());
    }
    return blocked;
  }, [character.failedStudies, character.level]);

  // Pool of spells the player can study, depending on the source. Learning a
  // spell is only possible at a Rank the character can memorise at their
  // Level (RAW p78), so book, mentor and research offer only those Ranks.
  // - Book: spells present in any inventory spellbook minus already-known.
  //         (You can't learn a spell from a book you don't possess.)
  // - Rewrite: spells you already know (RAW p78 — rewriting is for lost
  //   spell books, i.e. recovering spells you previously learned). That
  //   isn't learning them, so their Rank doesn't matter.
  // - Mentor / Research: any arcane spell of a learnable Rank.
  const studyPool = useMemo(() => {
    if (draftSource === 'book') {
      const inBooks = new Map<string, number>();
      for (const book of getSpellbooks(character)) {
        for (const entry of book.spellbookContents ?? []) {
          if (!entry.name) continue;
          // The Rank handleAddToQueue gives the study
          inBooks.set(entry.name, findArcaneSpell(entry.name)?.rank ?? entry.rank);
        }
      }
      return Array.from(inBooks.entries())
        .map(([name, rank]) => ({ name, rank }))
        .filter((s) => !knownNames.has(s.name.toLowerCase()) && learnableRanks.includes(s.rank))
        .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    }
    if (draftSource === 'rewrite') {
      // Once each, though a spell can be on the known list twice. Any Rank:
      // rewriting copies a spell the character has already learned.
      const known = new Map<string, { name: string; rank: number }>();
      for (const k of character.knownSpells) {
        const key = k.name.toLowerCase();
        if (!known.has(key)) known.set(key, { name: k.name, rank: k.rank });
      }
      return Array.from(known.values())
        .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    }
    return ARCANE_SPELLS.filter((s) => learnableRanks.includes(s.rank));
    // knownNames is a memo of character.knownSpells; depending on
    // character.knownSpells alone is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.equippedItems, character.stowedItems, character.knownSpells, draftSource, learnableRanks]);

  // The chosen spell, while the pool still has it. Changing the source clears
  // the choice, but a Level, inventory or known spell can change under it,
  // and so can the character, with this tab left open on another one.
  const selectedName = studyPool.some((s) => s.name === draftName) ? draftName : '';
  const draftRank = studyPool.find((s) => s.name === selectedName)?.rank ?? 1;
  const draftHint = draftSource !== 'rewrite' && offersUnlearnableRanks(learnableRanks, maxRank)
    ? learnableRanksHint(character.level, learnableRanks)
    : null;
  const draftDescribedBy = [
    draftHint ? draftHintId : null,
    getSpellSummary('arcane', selectedName) ? draftSummaryId : null,
  ].filter(Boolean).join(' ');

  // A study that would teach the character a spell of a Rank they can't learn
  // at their Level gets a note (see rankAboveLearnableNote). Rewriting a spell
  // they already know isn't learning it.
  const rankNoteFor = (entry: SpellStudyEntry) => {
    const learnable = learnableRanks.includes(entry.rank);
    const rewritingKnown = entry.source === 'rewrite' && knownNames.has(entry.spellName.toLowerCase());
    return learnable || rewritingKnown ? undefined : rankAboveLearnableNote(entry.rank, character.level);
  };

  const config = getStudyConfig(draftSource, draftRank);

  // Counted in days the character has lived (time in Fairy included), and
  // clamped at 0 so rewinding the calendar reads as "not ready" rather than
  // "-3 / 6 weeks". See getStudyProgress.
  const progress = getStudyProgress(character);
  const elapsedWeeks = progress?.elapsedWeeks ?? 0;
  const studyReady = progress?.ready ?? false;
  const hasBeenToFairy = getFairyVisits(character).length > 0;

  const handleAddToQueue = () => {
    const trimmed = selectedName.trim();
    if (!trimmed) return;
    if (failedBlockSet.has(trimmed.toLowerCase()) && draftSource === 'book') {
      alert(`A previous attempt to study ${trimmed} failed. Wait until your next level-up before retrying from a book.`);
      return;
    }
    const matched = findArcaneSpell(trimmed);
    const rank = matched?.rank ?? draftRank;
    const cfg = getStudyConfig(draftSource, rank);
    const entry: SpellStudyEntry = {
      id: crypto.randomUUID(),
      spellName: matched?.name ?? trimmed,
      rank,
      source: draftSource,
      weeksRequired: cfg.weeksRequired,
      goldCost: cfg.goldCost,
      // targetSpellbookId only applies to mentor/research/rewrite (book source
      // already has the spell in the source book).
      targetSpellbookId: draftSource !== 'book' && draftBookId ? draftBookId : undefined,
      notes: draftNotes.trim() || undefined,
    };
    if (!active) {
      // Promote directly to active
      const promoted: ActiveSpellStudy = { ...entry, ...getStudyStart(character) };
      onChange({ spellStudy: { active: promoted, queue } });
    } else {
      onChange({ spellStudy: { active, queue: [...queue, entry] } });
    }
    setDraftName('');
    setDraftBookId('');
    setDraftNotes('');
  };

  // Promote the head of the queue to active. Caller passes when the new
  // study should be considered to have started (see getStudyStart).
  const promoteNext = (
    remainingQueue: SpellStudyEntry[],
    start: ReturnType<typeof getStudyStart>,
  ): { active: ActiveSpellStudy | null; queue: SpellStudyEntry[] } => {
    if (remainingQueue.length === 0) return { active: null, queue: [] };
    const [head, ...rest] = remainingQueue;
    return { active: { ...head, ...start }, queue: rest };
  };

  const completeStudy = (passed: boolean) => {
    if (!active || !progress) return;

    const now = getCurrentTimelinePoint(character);
    let updatedKnown = character.knownSpells;
    let updatedFailed = character.failedStudies;
    let updatedEquipped = character.equippedItems;
    let updatedStowed = character.stowedItems;

    if (passed) {
      // Deliberately not re-gated on the current Level: this study may have
      // started at a higher Level and the Level can go down, and refusing it
      // would strand weeks of the player's study. The note the new known spell
      // gets from rankAboveLearnableNote warns instead.
      // Add to known if not already present
      const exists = updatedKnown.some((k) => k.name.toLowerCase() === active.spellName.toLowerCase());
      if (!exists) {
        updatedKnown = [
          ...updatedKnown,
          {
            id: crypto.randomUUID(),
            name: active.spellName,
            rank: active.rank,
            source: active.source === 'book' ? 'studied'
              : active.source === 'mentor' ? 'mentor'
              : active.source === 'research' ? 'research'
              : 'rewrite',
            learnedAt: now.date,
            learnedInFairy: now.fairyDate,
            sinceReturnFrom: now.sinceReturnFrom,
          },
        ];
      }
      // Write into target spellbook if specified
      if (active.targetSpellbookId) {
        const writeInto = (items: InventoryItem[]) =>
          items.map((i) => {
            if (i.id !== active.targetSpellbookId) return i;
            const contents = i.spellbookContents ?? [];
            if (contents.length >= SPELLBOOK_CAPACITY) return i;
            const alreadyThere = contents.some((e) => e.name.toLowerCase() === active.spellName.toLowerCase());
            if (alreadyThere) return i;
            return {
              ...i,
              spellbookContents: [...contents, { name: active.spellName, rank: active.rank }],
            };
          });
        updatedEquipped = writeInto(updatedEquipped);
        updatedStowed = writeInto(updatedStowed);
      }
    } else if (active.source === 'book') {
      // Only book studies block retry until next level (RAW p78).
      // Research failure (the 1-in-6 roll) just loses time and money;
      // mentor and rewrite never fail.
      // Note: we deliberately do not deduct gold for research failure.
      // The app doesn't auto-track expenses anywhere else, so we surface
      // the loss in the UI ("time + money lost") and let the player
      // adjust their coin pouch by hand.
      updatedFailed = [
        ...updatedFailed,
        { spellName: active.spellName, failedAtLevel: character.level },
      ];
    }

    // Stamp the next study's start at the actual handoff (start + weeks*7
    // lived days), not now. The player may have lived past completion before
    // clicking Complete; without this the next study would lose that gap.
    // The handoff can fall inside a Fairy visit, so its date comes from the
    // lived-time timeline rather than from adding days to startedOn.
    const next = promoteNext(queue, getStudyStart(character, progress.completesOnLivedDay));
    onChange({
      knownSpells: updatedKnown,
      failedStudies: updatedFailed,
      equippedItems: updatedEquipped,
      stowedItems: updatedStowed,
      spellStudy: next,
    });
  };

  const cancelActive = () => {
    if (!confirm('Abandon current study? Time spent so far is lost.')) return;
    // Abandon means the next study really does start fresh today.
    const next = promoteNext(queue, getStudyStart(character));
    onChange({ spellStudy: next });
  };

  const queueContexts = spellRowContexts('arcane', queue.map((q) => q.spellName), 'queued');
  const activeRankNote = active ? rankNoteFor(active) : undefined;

  const removeFromQueue = (id: string) => {
    onChange({ spellStudy: { active, queue: queue.filter((q) => q.id !== id) } });
  };

  const moveInQueue = (index: number, delta: number) => {
    const newIdx = index + delta;
    if (newIdx < 0 || newIdx >= queue.length) return;
    const next = [...queue];
    [next[index], next[newIdx]] = [next[newIdx], next[index]];
    onChange({ spellStudy: { active, queue: next } });
  };

  return (
    <div data-spell-list="" className="mb-4 bg-[#1a1a2e] border border-[#5a3a28]/60 rounded p-3">
      <h4 className="text-[#c4a35a] text-sm font-semibold mb-2">Spell Study</h4>

      {/* Active study */}
      {active ? (
        <div className={`bg-[#2a2a3e]/60 border rounded p-2 mb-2 ${studyReady ? 'border-[#c4a35a]' : 'border-[#5a3a28]/60'}`}>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[#c4a35a] font-semibold">R{active.rank}</span>
            <span className="text-[#f5e6c8] font-semibold">
              <SpellInfo spellType="arcane" name={active.spellName} context="studying" {...spellInfo(active.id)}>
                {active.spellName}
              </SpellInfo>
            </span>
            <SpellSummaryPanel
              spellType="arcane"
              name={active.spellName}
              {...spellInfo(active.id)}
              className={rowPanelClasses}
            />
            <span className="text-[#f5e6c8]/60 text-xs">({active.source})</span>
            <span className="ml-auto text-[#f5e6c8]/60 text-xs">
              started on {formatRecordDate(character, active.startedOn, active.startedInFairy)}
            </span>
            {activeRankNote && (
              <span className="basis-full text-red-400 text-xs">{activeRankNote}</span>
            )}
          </div>
          <div className="text-[#f5e6c8] text-sm mb-2">
            Progress:{' '}
            <span className={studyReady ? 'text-[#c4a35a] font-semibold' : ''}>
              {elapsedWeeks} / {active.weeksRequired} weeks
            </span>
            {active.goldCost > 0 && (
              <span className="text-[#f5e6c8]/60 text-xs ml-2">(cost: {active.goldCost}gp)</span>
            )}
            {hasBeenToFairy && (
              <div className="text-[#f5e6c8]/80 text-xs mt-0.5">
                Counts days you&apos;ve lived, including days in Fairy. Time that passes in Dolmenwood while you&apos;re away doesn&apos;t count.
              </div>
            )}
          </div>
          {active.notes && (
            <div className="text-[#f5e6c8]/60 text-xs italic mb-2">{active.notes}</div>
          )}
          {studyReady && (() => {
            const activeCheck = getStudyConfig(active.source, active.rank).completionCheck;
            return (
              <div className="flex flex-wrap gap-2">
                {activeCheck === 'int' && (
                  <>
                    <button
                      type="button"
                      onClick={() => completeStudy(true)}
                      className="bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-3 py-1 text-sm font-semibold"
                    >
                      ✓ INT Check Passed
                    </button>
                    <button
                      type="button"
                      onClick={() => completeStudy(false)}
                      className="bg-[#5a2a28] hover:bg-[#6b3a35] text-[#f5e6c8] rounded px-3 py-1 text-sm"
                    >
                      ✗ INT Check Failed
                    </button>
                    <span className="text-[#f5e6c8]/60 text-xs self-center">
                      Failed studies block retry until next level.
                    </span>
                  </>
                )}
                {activeCheck === 'd6' && (
                  <>
                    <button
                      type="button"
                      onClick={() => completeStudy(true)}
                      className="bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-3 py-1 text-sm font-semibold"
                    >
                      ✓ Roll 2-6: Success
                    </button>
                    <button
                      type="button"
                      onClick={() => completeStudy(false)}
                      className="bg-[#5a2a28] hover:bg-[#6b3a35] text-[#f5e6c8] rounded px-3 py-1 text-sm"
                    >
                      ✗ Roll 1: Failure
                    </button>
                    <span className="text-[#f5e6c8]/60 text-xs self-center">
                      Research has a minimum 1-in-6 failure chance (time + money lost).
                    </span>
                  </>
                )}
                {activeCheck === null && (
                  <button
                    type="button"
                    onClick={() => completeStudy(true)}
                    className="bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-3 py-1 text-sm font-semibold"
                  >
                    Complete Study
                  </button>
                )}
                <button
                  type="button"
                  onClick={cancelActive}
                  className="text-[#f5e6c8]/60 hover:text-[#f5e6c8] text-xs underline self-center"
                >
                  Abandon
                </button>
              </div>
            );
          })()}
          {!studyReady && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={cancelActive}
                className="text-[#f5e6c8]/60 hover:text-[#f5e6c8] text-xs underline"
              >
                Abandon
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[#f5e6c8]/60 text-xs italic mb-2">No spell currently in study.</p>
      )}

      {/* Queue */}
      {queue.length > 0 && (
        <div className="mb-3">
          <div className="text-[#c4a35a] text-xs font-semibold mb-1">Queue</div>
          <div className="space-y-1">
            {queue.map((q, i) => {
              const info = spellInfo(q.id);
              const context = queueContexts[i];
              const rankNote = rankNoteFor(q);
              return (
                <div key={q.id} data-spell-row="" className="bg-[#2a2a3e]/40 rounded px-2 py-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={rowNameClasses}>
                      <span className="text-[#c4a35a] text-xs">{i + 1}.</span>
                      <span className="text-[#c4a35a] font-semibold">R{q.rank}</span>
                      <span className="text-[#f5e6c8] min-w-0">
                        <SpellInfo spellType="arcane" name={q.spellName} context={context} {...info}>{q.spellName}</SpellInfo>
                      </span>
                    </span>
                    <SpellSummaryPanel spellType="arcane" name={q.spellName} {...info} className={rowPanelClasses} />
                    <span className={rowControlsClasses}>
                      <span className="text-[#f5e6c8]/60 text-xs">{q.source} · {q.weeksRequired}w</span>
                      <button
                        type="button"
                        onClick={() => moveInQueue(i, -1)}
                        disabled={i === 0}
                        className="text-[#f5e6c8]/60 hover:text-[#f5e6c8] disabled:opacity-30 text-xs px-1"
                        title="Move up"
                      >▲</button>
                      <button
                        type="button"
                        onClick={() => moveInQueue(i, 1)}
                        disabled={i === queue.length - 1}
                        className="text-[#f5e6c8]/60 hover:text-[#f5e6c8] disabled:opacity-30 text-xs px-1"
                        title="Move down"
                      >▼</button>
                      <button
                        type="button"
                        onClick={() => removeFromQueue(q.id)}
                        className="text-red-400 hover:text-red-300 text-xs px-1"
                        title="Remove from queue"
                      >
                        X
                      </button>
                    </span>
                    {rankNote && (
                      <span className="basis-full text-red-400 text-xs">{rankNote}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add to queue */}
      <div className="bg-[#2a2a3e]/40 rounded p-2">
        <div className="text-[#c4a35a] text-xs font-semibold mb-2">
          {active ? 'Queue another study' : 'Start a study'}
        </div>
        {/* Source first — it filters the spell list */}
        <div className="flex flex-wrap items-center gap-3 mb-2 text-sm">
          <span className="text-[#f5e6c8]/60 text-xs">Source:</span>
          {(['book', 'mentor', 'research', 'rewrite'] as const).map((src) => (
            <label key={src} className="flex items-center gap-1 cursor-pointer text-[#f5e6c8]">
              <input
                type="radio"
                name="study-source"
                checked={draftSource === src}
                onChange={() => {
                  setDraftSource(src);
                  setDraftName('');
                  if (src === 'book') setDraftBookId('');
                }}
                className="accent-[#c4a35a]"
              />
              <span className="capitalize">{src}</span>
            </label>
          ))}
        </div>
        {draftSource === 'mentor' && (
          <div className="text-[#f5e6c8]/60 text-xs italic mb-2">
            Mentor must be at least 3 Levels higher than you (L{character.level + 3}+).
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <select
            value={selectedName}
            onChange={(e) => setDraftName(e.target.value)}
            aria-label="Spell to study"
            aria-describedby={draftDescribedBy || undefined}
            className={`${selectClasses} flex-1 min-w-[180px] text-sm`}
          >
            <option value="">
              {draftSource === 'book' && studyPool.length === 0
                ? '-- No spells in your books you can learn --'
                : draftSource === 'rewrite' && studyPool.length === 0
                  ? '-- No known spells to rewrite --'
                  : '-- Select spell --'}
            </option>
            {draftSource === 'book' || draftSource === 'rewrite'
              ? studyPool.map((s) => (
                  <option key={s.name} value={s.name}>
                    {`R${s.rank} · ${s.name}`}
                  </option>
                ))
              : learnableRanks.map((rank) => (
                  <optgroup key={rank} label={`Rank ${rank}`}>
                    {studyPool.filter((s) => s.rank === rank).map((s) => (
                      <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                  </optgroup>
                ))}
          </select>
          {selectedName && (
            <span className="text-[#c4a35a] text-xs shrink-0">R{draftRank}</span>
          )}
          <ChosenSpellSummary spellType="arcane" name={selectedName} id={draftSummaryId} className="basis-full" />
        </div>
        {draftSource === 'book' && (
          <div className="text-[#f5e6c8]/60 text-xs italic mb-2">
            Only spells in your inventory spell books are shown.
          </div>
        )}
        {draftHint && (
          <div id={draftHintId} className="text-[#f5e6c8]/60 text-xs italic mb-2">{draftHint}</div>
        )}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-[#f5e6c8]/60 text-xs">
            → {config.weeksRequired} week{config.weeksRequired === 1 ? '' : 's'}
            {config.goldCost > 0 ? `, ${config.goldCost}gp` : ''}
            {config.completionCheck === 'int' && ', INT check on completion'}
            {config.completionCheck === 'd6' && ', 1-in-6 chance of failure'}
          </span>
        </div>
        {/* Target book only makes sense for sources where the spell isn't
            already in one of your books. For source='book' the spell lives
            in the book you're studying from. */}
        {draftSource !== 'book' && (
          <div className="flex flex-wrap items-center gap-2 mb-2 text-sm">
            <label htmlFor={targetBookId} className="text-[#f5e6c8]/60 text-xs">Write into book on success:</label>
            <select
              id={targetBookId}
              value={draftBookId}
              onChange={(e) => setDraftBookId(e.target.value)}
              className={`${selectClasses} text-xs flex-1 min-w-[140px]`}
            >
              <option value="">(none — known list only)</option>
              {availableBooks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({(b.spellbookContents?.length ?? 0)}/{SPELLBOOK_CAPACITY})
                </option>
              ))}
            </select>
          </div>
        )}
        <input
          type="text"
          value={draftNotes}
          onChange={(e) => setDraftNotes(e.target.value)}
          placeholder="Notes (mentor name, source book, ...)"
          className={`${inputClasses} w-full text-sm mb-2`}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAddToQueue}
            disabled={!selectedName}
            className={`${buttonClasses} text-sm ${!selectedName ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {active ? '+ Queue Study' : '+ Start Study'}
          </button>
          {/* Rewriting is only for spells already known */}
          {selectedName && draftSource !== 'rewrite' && knownNames.has(selectedName.toLowerCase()) && (
            <span className="text-[#c47a3a] text-xs italic">Already known — usually unnecessary.</span>
          )}
          {selectedName && draftSource === 'book' && failedBlockSet.has(selectedName.toLowerCase()) && (
            <span className="text-red-400 text-xs italic">Previously failed — retry blocked until next level.</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Memorise picker — pulls from Known Spells (in-hand) + Scrolls
// ════════════════════════════════════════════════════════════
function MemorisePicker({
  character,
  spellsPerDay,
  preparedByRank,
  onChange,
}: {
  character: Character;
  spellsPerDay: number[] | null;
  preparedByRank: Record<number, number>;
  onChange: (updates: CharacterUpdater) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const spellInfo = useSpellDisclosures();

  // Close on a press or focus outside the menu (Tab past its end, say), or on
  // Escape, which also puts focus back on the button. Focus is watched across
  // the page because Safari doesn't focus a button you click, so a menu
  // opened with the mouse may never have had focus to lose. A spell's hover
  // card counts as part of the menu, and while one shows, the first Escape
  // dismisses only the card (SpellInfo).
  useEffect(() => {
    if (!open) return;
    const outside = (target: EventTarget | null) =>
      target instanceof Element && !containerRef.current?.contains(target) && !target.closest('[data-hover-card]');
    const onMouseDownOrFocus = (e: Event) => {
      if (outside(e.target)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('mousedown', onMouseDownOrFocus);
    document.addEventListener('focusin', onMouseDownOrFocus);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDownOrFocus);
      document.removeEventListener('focusin', onMouseDownOrFocus);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const knownAvailable = character.knownSpells
    .filter((k) => isSpellInAnyBook(character, k.name))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

  // Per-rank capacity: spellsPerDay is indexed by rank-1.
  // Once preparedByRank[rank] >= cap, the corresponding option is disabled.
  const capFor = (rank: number) => spellsPerDay?.[rank - 1] ?? 0;
  const isAtCap = (rank: number) => (preparedByRank[rank] ?? 0) >= capFor(rank);

  const memoriseKnown = (k: KnownSpell) => {
    if (isAtCap(k.rank)) return;
    const newSlot: SpellSlot = {
      id: crypto.randomUUID(),
      name: k.name,
      rank: k.rank,
      prepared: true,
      cast: false,
      notes: '',
    };
    onChange({ spells: [...character.spells, newSlot] });
    setOpen(false);
  };

  const noOptions = knownAvailable.length === 0;
  const menuContexts = spellRowContexts('arcane', knownAvailable.map((k) => k.name), 'menu');

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        disabled={noOptions}
        aria-expanded={open && !noOptions}
        aria-controls={open && !noOptions ? menuId : undefined}
        className={`${buttonClasses} ${noOptions ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={noOptions ? 'No known spells with a book in hand' : ''}
      >
        + Memorise <span aria-hidden="true">▾</span>
      </button>
      {open && !noOptions && (
        // As wide as its longest row, but no wider than the screen less the
        // page's side padding, so it doesn't run off a narrow screen with a
        // large font. Hover cards keep off the whole menu.
        <div
          id={menuId}
          data-spell-list="whole"
          className="absolute left-0 top-full mt-1 bg-[#2a2a3e] border border-[#5a3a28] rounded shadow-lg z-50 w-max min-w-[min(16rem,calc(100vw_-_3rem))] max-w-[calc(100vw_-_3rem)] max-h-96 overflow-y-auto"
        >
          <div className="px-3 py-1 text-[#c4a35a] text-xs font-semibold border-b border-[#5a3a28]/40">
            Known · In hand
          </div>
          {knownAvailable.map((k, i) => {
            const cap = capFor(k.rank);
            const atCap = isAtCap(k.rank);
            const hasNoSlots = cap === 0;
            const info = spellInfo(k.id);
            return (
              <div key={k.id}>
                <div className="flex items-center pr-2">
                  <button
                    type="button"
                    disabled={atCap}
                    onClick={() => memoriseKnown(k)}
                    className={`flex-1 min-w-0 break-words text-left px-3 py-1.5 text-sm ${
                      atCap
                        ? 'text-[#f5e6c8]/30 cursor-not-allowed'
                        : 'text-[#f5e6c8] hover:bg-[#3a3a5e]'
                    }`}
                    title={
                      hasNoSlots
                        ? `No Rank ${k.rank} slots at your level yet`
                        : atCap
                          ? `Rank ${k.rank} slots full (${preparedByRank[k.rank] ?? 0}/${cap})`
                          : ''
                    }
                  >
                    <span className="text-[#c4a35a] mr-2">R{k.rank}</span>
                    {k.name}
                    {atCap && (
                      <span className="text-[#f5e6c8]/40 text-xs ml-2 whitespace-nowrap">
                        {hasNoSlots ? '(no slots yet)' : `(R${k.rank} full)`}
                      </span>
                    )}
                  </button>
                  <SpellInfo spellType="arcane" name={k.name} context={menuContexts[i]} {...info} />
                </div>
                <SpellSummaryPanel spellType="arcane" name={k.name} {...info} className="mx-3 mb-2 contain-inline-size" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GlamourSection({
  character,
  profile,
  addGlamour,
  updateGlamour,
  deleteGlamour,
}: {
  character: Character;
  profile: ReturnType<typeof getCharacterMagicProfile>;
  addGlamour: (glamourId: number) => void;
  updateGlamour: (id: string, updates: Partial<CharacterGlamour>) => void;
  deleteGlamour: (id: string) => void;
}) {
  // null when the maximum depends on a kindred the app doesn't know
  const maxGlamours = profile.glamourCount;
  const currentCount = character.glamours.length;
  const isOver = maxGlamours !== null && currentCount > maxGlamours;
  const atMax = maxGlamours !== null && currentCount >= maxGlamours;
  const pickedIds = new Set(character.glamours.map((g) => g.glamourId));
  const availableGlamours = GLAMOURS.filter((g) => !pickedIds.has(g.id));

  return (
    <div className="mb-4">
      <h3 className={sectionHeadingClasses}>Glamours</h3>

      <div className={`text-sm mb-2 ${isOver ? 'text-red-400' : 'text-[#f5e6c8]/70'}`}>
        {maxGlamours === null ? currentCount : `${currentCount}/${maxGlamours}`} glamours known
        {isOver && ' (over maximum!)'}
      </div>

      {character.glamours.map((glamour) => {
        const ref = GLAMOURS.find((g) => g.id === glamour.glamourId);
        return (
          <div key={glamour.id} className="bg-[#1a1a2e] p-2 rounded mb-1">
            <div className="flex items-center gap-2">
              <span className="text-[#c4a35a] font-semibold text-sm flex-1">
                {glamour.name}
              </span>
              <button
                onClick={() => deleteGlamour(glamour.id)}
                className="text-red-400 hover:text-red-300 text-sm font-bold px-2 py-1 rounded hover:bg-red-400/10 transition-colors shrink-0"
                title="Remove glamour"
              >
                X
              </button>
            </div>
            {ref && (
              <p className="text-[#f5e6c8]/50 text-xs mt-1">{ref.description}</p>
            )}
            <input
              type="text"
              value={glamour.notes}
              onChange={(e) => updateGlamour(glamour.id, { notes: e.target.value })}
              placeholder="Notes"
              className={`${inputClasses} w-full mt-1 text-sm`}
            />
          </div>
        );
      })}

      {availableGlamours.length > 0 && !atMax && (
        <select
          value=""
          onChange={(e) => {
            const id = parseInt(e.target.value);
            if (id) addGlamour(id);
          }}
          className={`${selectClasses} mt-2 w-full text-sm`}
        >
          <option value="">+ Add Glamour...</option>
          {availableGlamours.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      )}

      {atMax && availableGlamours.length > 0 && (
        <p className="text-[#f5e6c8]/40 text-xs italic mt-2">
          Maximum glamours known. Remove one to add another.
        </p>
      )}
    </div>
  );
}

function RuneSection({
  character,
  addRune,
  updateRune,
  deleteRune,
}: {
  character: Character;
  addRune: (runeId: number) => void;
  updateRune: (id: string, updates: Partial<CharacterRune>) => void;
  deleteRune: (id: string) => void;
}) {
  const level = character.level;

  // Group available runes by magnitude
  const lesserRunes = FAIRY_RUNES.filter((r) => r.magnitude === 'lesser');
  const greaterRunes = FAIRY_RUNES.filter((r) => r.magnitude === 'greater');
  const mightyRunes = FAIRY_RUNES.filter((r) => r.magnitude === 'mighty');

  return (
    <div className="mb-4">
      <h3 className={sectionHeadingClasses}>Fairy Runes</h3>

      {character.runes.length === 0 && (
        <p className="text-[#f5e6c8]/60 text-sm italic mb-2">No runes granted yet.</p>
      )}

      {character.runes.map((rune) => {
        const freq = getRuneUsageFrequency(rune.magnitude, level);
        return (
          <div key={rune.id} className="bg-[#1a1a2e] p-2 rounded mb-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={rowNameClasses}>
                <span className="text-[#c4a35a] font-semibold text-sm min-w-0 break-words">{rune.name}</span>
                <span
                  className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${
                    rune.magnitude === 'lesser'
                      ? 'bg-green-900/40 text-green-400'
                      : rune.magnitude === 'greater'
                      ? 'bg-blue-900/40 text-blue-400'
                      : 'bg-purple-900/40 text-purple-400'
                  }`}
                >
                  {rune.magnitude}
                </span>
                <span className="shrink-0 text-[#f5e6c8]/60 text-xs">{freq}</span>
              </span>
              <span className={rowControlsClasses}>
                <span className="flex items-center gap-1">
                  <span className="text-[#f5e6c8]/70 text-xs">Uses:</span>
                  <button
                    onClick={() =>
                      updateRune(rune.id, { usesRemaining: Math.max(0, rune.usesRemaining - 1) })
                    }
                    aria-label={`Spend a use of ${rune.name}`}
                    className="text-[#f5e6c8] bg-[#5a3a28] hover:bg-[#6b4a35] w-6 h-6 rounded text-sm flex items-center justify-center transition-colors"
                  >
                    -
                  </button>
                  <span className="text-[#f5e6c8] text-sm w-6 text-center">
                    {rune.usesRemaining}
                  </span>
                  <button
                    onClick={() => updateRune(rune.id, { usesRemaining: rune.usesRemaining + 1 })}
                    aria-label={`Regain a use of ${rune.name}`}
                    className="text-[#f5e6c8] bg-[#5a3a28] hover:bg-[#6b4a35] w-6 h-6 rounded text-sm flex items-center justify-center transition-colors"
                  >
                    +
                  </button>
                </span>
                <button
                  onClick={() => deleteRune(rune.id)}
                  className="text-red-400 hover:text-red-300 text-sm font-bold px-2 py-1 rounded hover:bg-red-400/10 transition-colors shrink-0"
                  title="Remove rune"
                >
                  X
                </button>
              </span>
            </div>
            <p className="text-[#f5e6c8]/60 text-xs mt-1">
              {FAIRY_RUNES.find((r) => r.id === rune.runeId)?.description}
            </p>
            <input
              type="text"
              value={rune.notes}
              onChange={(e) => updateRune(rune.id, { notes: e.target.value })}
              placeholder="Notes"
              className={`${inputClasses} w-full mt-1 text-sm`}
            />
          </div>
        );
      })}

      <select
        value=""
        onChange={(e) => {
          const id = parseInt(e.target.value);
          if (id) addRune(id);
        }}
        className={`${selectClasses} mt-2 w-full text-sm`}
      >
        <option value="">+ Add Rune...</option>
        <optgroup label="Lesser">
          {lesserRunes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Greater">
          {greaterRunes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Mighty">
          {mightyRunes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}

function KnackSection({
  character,
  selectKnack,
  clearKnack,
  onChange,
}: {
  character: Character;
  selectKnack: (knackId: number) => void;
  clearKnack: () => void;
  onChange: (updates: CharacterUpdater) => void;
}) {
  const knack = character.knack;
  const level = character.level;

  if (!knack) {
    return (
      <div className="mb-4">
        <h3 className={sectionHeadingClasses}>Mossling Knack</h3>
        <p className="text-[#f5e6c8]/60 text-sm mb-2">
          Choose your mossling knack (roll d6 or pick):
        </p>
        <select
          value=""
          onChange={(e) => {
            const id = parseInt(e.target.value);
            if (id) selectKnack(id);
          }}
          className={`${selectClasses} w-full`}
        >
          <option value="">-- Select Knack --</option>
          {MOSSLING_KNACKS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.id}. {k.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const refKnack = MOSSLING_KNACKS.find((k) => k.id === knack.knackId);
  if (!refKnack) return null;

  return (
    <div className="mb-4">
      <h3 className={sectionHeadingClasses}>Mossling Knack</h3>

      <div className="flex items-center gap-2 mb-2">
        <span className="text-[#c4a35a] font-semibold">{knack.name}</span>
        <button
          onClick={clearKnack}
          className="text-[#f5e6c8]/50 hover:text-[#f5e6c8] text-xs underline transition-colors"
        >
          Change
        </button>
      </div>

      <div className="space-y-1">
        {refKnack.tiers.map((tier) => {
          const isActive = level >= tier.level;
          return (
            <div
              key={tier.level}
              className={`bg-[#1a1a2e] p-2 rounded text-sm ${
                isActive ? 'text-[#f5e6c8]' : 'text-[#f5e6c8]/30'
              }`}
            >
              <span className={`font-semibold ${isActive ? 'text-[#c4a35a]' : 'text-[#c4a35a]/30'}`}>
                L{tier.level}:
              </span>{' '}
              {tier.description}
              {!isActive && (
                <span className="text-[#f5e6c8]/20 text-xs ml-1">(Level {tier.level})</span>
              )}
            </div>
          );
        })}
      </div>

      <input
        type="text"
        value={knack.notes}
        onChange={(e) => onChange({ knack: { ...knack, notes: e.target.value } })}
        placeholder="Knack notes"
        className={`${inputClasses} w-full mt-2 text-sm`}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Collapsible Reference Panels
// ════════════════════════════════════════════════════════════

// The spells of each Rank the character can ever cast: 1-6 for magicians,
// 1-5 for breggles, clerics and friars. Its list (and the list's info
// buttons) is only drawn while it's open.
const SpellReference = memo(function SpellReference({
  spellType,
  maxRank,
}: {
  spellType: SpellType | null;
  maxRank: number;
}) {
  const spellInfo = useSpellDisclosures();
  const [open, setOpen] = useState(false);
  if (!spellType) return null;

  const isArcane = spellType === 'arcane';
  const spells: readonly { name: string; rank: number; saint?: string }[] = isArcane ? ARCANE_SPELLS : HOLY_SPELLS;

  return (
    <details className="mb-2" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="text-[#c4a35a] text-sm font-semibold cursor-pointer hover:text-[#d4b36a] transition-colors">
        {isArcane ? 'Arcane' : 'Holy'} Spell Reference
      </summary>
      {open && (
        <div data-spell-list="" className="bg-[#1a1a2e] rounded p-3 mt-1 text-sm">
          {Array.from({ length: maxRank }, (_, i) => i + 1).map((rank) => (
            <div key={rank} className="mb-2">
              <div className="text-[#c4a35a] font-semibold text-xs mb-1">Rank {rank}</div>
              {/* An open summary takes a line of its own, under its spell. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[#f5e6c8]/80 text-xs">
                {spells.filter((s) => s.rank === rank).map((s) => {
                  const info = spellInfo(s.name);
                  return (
                    <Fragment key={s.name}>
                      <SpellInfo spellType={spellType} name={s.name} context="reference" {...info}>
                        {s.name}
                        {s.saint && <span className="text-[#f5e6c8]/60"> ({s.saint})</span>}
                      </SpellInfo>
                      <SpellSummaryPanel spellType={spellType} name={s.name} {...info} className="basis-full" />
                    </Fragment>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </details>
  );
});

function GlamourReference() {
  return (
    <details className="mb-2">
      <summary className="text-[#c4a35a] text-sm font-semibold cursor-pointer hover:text-[#d4b36a] transition-colors">
        Glamour Reference
      </summary>
      <div className="bg-[#1a1a2e] rounded p-3 mt-1 text-sm space-y-1">
        {GLAMOURS.map((g) => (
          <div key={g.id} className="text-xs">
            <span className="text-[#c4a35a]">{g.id}. {g.name}</span>
            <span className="text-[#f5e6c8]/50"> - {g.description}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function RuneReference({ level }: { level: number }) {
  const modifier = getRuneRollModifier(level);
  const frequencyId = useId();

  return (
    <details className="mb-2">
      <summary className="text-[#c4a35a] text-sm font-semibold cursor-pointer hover:text-[#d4b36a] transition-colors">
        Rune Roll Reference
      </summary>
      <div className="bg-[#1a1a2e] rounded p-3 mt-1 text-sm">
        <div className="text-[#f5e6c8]/70 text-xs mb-2">
          Roll 2d6{modifier > 0 ? ` + ${modifier} (Level ${level} modifier)` : ''}:
        </div>
        <table className="text-xs w-full">
          <tbody>
            <tr className="text-[#f5e6c8]/60">
              <td className="pr-2 py-0.5">2-</td>
              <td>No rune (fickle displeasure)</td>
            </tr>
            <tr className="text-green-400/70">
              <td className="pr-2 py-0.5">3-7</td>
              <td>1 lesser rune (random)</td>
            </tr>
            <tr className="text-blue-400/70">
              <td className="pr-2 py-0.5">8-11</td>
              <td>1 greater rune (random)</td>
            </tr>
            <tr className="text-purple-400/70">
              <td className="pr-2 py-0.5">12+</td>
              <td>1 mighty rune (random)</td>
            </tr>
          </tbody>
        </table>
        <div className="text-[#f5e6c8]/60 text-xs mt-2">
          Modifiers: +1 (L3-5), +2 (L6-9), +3 (L10+). Duplicate = usage frequency doubles.
        </div>

        <div className="mt-3 text-[#f5e6c8]/70 text-xs">
          <div id={frequencyId} className="text-[#c4a35a] font-semibold mb-1">Usage Frequency:</div>
          {/* Too wide for a narrow screen with a large font, so it scrolls
              sideways there; focusable so the keyboard can scroll it too. */}
          <div role="region" aria-labelledby={frequencyId} tabIndex={0} className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[#f5e6c8]/60">
                  <th className="text-left pr-2">Magnitude</th>
                  <th className="text-left pr-2">L1-4</th>
                  <th className="text-left pr-2">L5-9</th>
                  <th className="text-left">L10+</th>
                </tr>
              </thead>
              <tbody>
                <tr className="text-green-400/70">
                  <td className="pr-2">Lesser</td>
                  <td className="pr-2">1x/day</td>
                  <td className="pr-2">2x/day</td>
                  <td>3x/day</td>
                </tr>
                <tr className="text-blue-400/70">
                  <td className="pr-2">Greater</td>
                  <td className="pr-2">1x/level</td>
                  <td className="pr-2">1x/week</td>
                  <td>1x/day</td>
                </tr>
                <tr className="text-purple-400/70">
                  <td className="pr-2">Mighty</td>
                  <td className="pr-2">1x ever</td>
                  <td className="pr-2">1x ever</td>
                  <td>1x/year</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-3">
          <div className="text-[#c4a35a] font-semibold text-xs mb-1">All Runes:</div>
          {(['lesser', 'greater', 'mighty'] as const).map((mag) => (
            <div key={mag} className="mb-1">
              <span
                className={`text-xs font-semibold ${
                  mag === 'lesser' ? 'text-green-400' : mag === 'greater' ? 'text-blue-400' : 'text-purple-400'
                }`}
              >
                {mag.charAt(0).toUpperCase() + mag.slice(1)}:
              </span>{' '}
              <span className="text-[#f5e6c8]/60 text-xs">
                {FAIRY_RUNES.filter((r) => r.magnitude === mag)
                  .map((r) => r.name)
                  .join(', ')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
