'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Character,
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
  CalendarDate,
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
  findArcaneSpell,
  getStudyConfig,
  weeksElapsed,
  addDays,
  formatCalendarDate,
} from '@/lib/gamedata';

interface SpellsAndMagicProps {
  character: Character;
  onChange: (updates: Partial<Character>) => void;
}

const inputClasses =
  'bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a]';

const sectionHeadingClasses =
  'text-lg font-bold text-[#c4a35a] mb-2 border-b border-[#5a3a28] pb-1';

const buttonClasses =
  'bg-[#5a3a28] hover:bg-[#6b4a35] text-[#f5e6c8] text-sm font-semibold px-3 py-1 rounded transition-colors';

const selectClasses =
  'bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a]';

export default function SpellsAndMagic({ character, onChange }: SpellsAndMagicProps) {
  const profile = getCharacterMagicProfile(character.kindred, character.class, character.level);
  const hasNoMagic = profile.systems.length === 1 && profile.systems[0] === 'none';
  const hasSpells = profile.systems.includes('arcane') || profile.systems.includes('holy');
  const hasGlamours = profile.systems.includes('glamours');
  const hasRunes = profile.systems.includes('runes');
  const hasKnacks = profile.systems.includes('knacks');

  // ── Spell Slot Helpers ──────────────────────────────────

  const updateSpell = (id: string, updates: Partial<SpellSlot>) => {
    const updatedSpells = character.spells.map((spell) =>
      spell.id === id ? { ...spell, ...updates } : spell
    );
    onChange({ spells: updatedSpells });
  };

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

  const deleteSpell = (id: string) => {
    onChange({ spells: character.spells.filter((spell) => spell.id !== id) });
  };

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

  // ── Breggle pre-magic check ─────────────────────────────
  const isBregglesPreMagic =
    character.kindred === 'breggle' && !character.class && character.level < 4;

  return (
    <div className="bg-[#2a2a3e] rounded-lg p-4">
      <h2 className="text-[#c4a35a] text-xl font-bold mb-4 border-b border-[#5a3a28] pb-2">
        Spells & Magic
      </h2>

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

      {/* Divine Resistance flag */}
      {profile.hasDivineResistance && (
        <div className="bg-[#1a1a2e] border border-[#c4a35a]/30 rounded p-3 mb-4">
          <span className="text-[#c4a35a] font-semibold text-sm">Divine Resistance:</span>{' '}
          <span className="text-[#f5e6c8] text-sm">
            Immune to holy magic effects (blessings and curses). Holy healing works at half effect.
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
        <SpellReference spellType={profile.spellType} />
      )}
      {hasGlamours && <GlamourReference />}
      {hasRunes && <RuneReference level={character.level} />}

    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Sub-sections (internal to this file)
// ════════════════════════════════════════════════════════════

// ── Inventory helpers (read-only) ─────────────────────────────
function getAllInventoryItems(c: Character): InventoryItem[] {
  return [...c.equippedItems, ...c.stowedItems];
}
function getSpellbooks(c: Character): InventoryItem[] {
  return getAllInventoryItems(c).filter((i) => i.kind === 'spellbook');
}
function getScrollItems(c: Character): InventoryItem[] {
  return getAllInventoryItems(c).filter((i) => i.kind === 'scroll' && !!i.scrollSpell?.name);
}
function isSpellInAnyBook(c: Character, name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return getSpellbooks(c).some((b) =>
    (b.spellbookContents ?? []).some((e) => e.name.trim().toLowerCase() === n),
  );
}
function isSpellOnScroll(c: Character, name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return getScrollItems(c).some((s) => s.scrollSpell?.name.trim().toLowerCase() === n);
}

function isStartingBookApplied(c: Character): boolean {
  if (!c.startingSpellBook) return false;
  // Check the stamped flag rather than name-matching the inventory item.
  // This means renaming the in-inventory book won't reopen the starter
  // dropdown and let the player create duplicates.
  return getAllInventoryItems(c).some((i) => i.kind === 'spellbook' && i.isStartingBook);
}

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
const KNOWN_SOURCE_LABEL: Record<KnownSpellSource, string> = {
  starting: 'Starting',
  studied: 'Studied',
  mentor: 'Mentor',
  research: 'Researched',
  rewrite: 'Rewritten',
  manual: 'Manual',
};

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
  onChange: (updates: Partial<Character>) => void;
}) {
  const spellsPerDay = profile.spellsPerDay;
  const isArcane = profile.spellType === 'arcane';
  const isMagician = character.class === 'magician';
  const maxRank = profile.maxSpellRank || 6;

  // Count prepared spells by rank
  const preparedByRank: Record<number, number> = {};
  for (const spell of character.spells) {
    if (spell.prepared) {
      preparedByRank[spell.rank] = (preparedByRank[spell.rank] || 0) + 1;
    }
  }

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
          <label className="text-[#f5e6c8] text-sm font-semibold block mb-1">
            Starting Spell Book:
          </label>
          <select
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
            <ApplyStartingBookButton character={character} onChange={onChange} />
          )}
        </div>
      )}

      {/* Memorised (Holy) / Available Spells (Arcane) list */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-[#c4a35a] text-sm font-semibold">
            {isArcane ? 'Available Spells' : 'Prepared Spells'}
          </h4>
        </div>

        {/* Memorised spell slots */}
        {character.spells.map((spell) => (
          <div
            key={spell.id}
            className={`flex items-center gap-2 bg-[#1a1a2e] p-2 rounded mb-1 ${
              spell.cast ? 'opacity-50' : ''
            }`}
          >
            {isArcane ? (
              <>
                <span className="text-[#c4a35a] font-semibold shrink-0">R{spell.rank}</span>
                <span className="text-[#f5e6c8] flex-1 min-w-[100px]">{spell.name}</span>
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={spell.name}
                  onChange={(e) => updateSpell(spell.id, { name: e.target.value })}
                  placeholder="Spell name"
                  className={`${inputClasses} flex-1 min-w-0`}
                />
                <input
                  type="number"
                  min={1}
                  max={maxRank}
                  value={spell.rank}
                  onChange={(e) =>
                    updateSpell(spell.id, {
                      rank: Math.min(maxRank, Math.max(1, parseInt(e.target.value) || 1)),
                    })
                  }
                  title="Rank"
                  className={`${inputClasses} w-14 text-center`}
                />
              </>
            )}
            <label className="flex items-center gap-1 text-[#f5e6c8] text-sm shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={spell.prepared}
                onChange={(e) => updateSpell(spell.id, { prepared: e.target.checked })}
                className="accent-[#c4a35a]"
              />
              Prep
            </label>
            <label className="flex items-center gap-1 text-[#f5e6c8] text-sm shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={spell.cast}
                onChange={(e) => updateSpell(spell.id, { cast: e.target.checked })}
                className="accent-[#c4a35a]"
              />
              Cast
            </label>
            <input
              type="text"
              value={spell.notes}
              onChange={(e) => updateSpell(spell.id, { notes: e.target.value })}
              placeholder="Notes"
              className={`${inputClasses} flex-1 min-w-0`}
            />
            <button
              onClick={() => deleteSpell(spell.id)}
              className="text-red-400 hover:text-red-300 text-sm font-bold px-2 py-1 rounded hover:bg-red-400/10 transition-colors shrink-0"
              title="Delete spell"
            >
              X
            </button>
          </div>
        ))}

        {/* Arcane: auto-listed scrolls from inventory */}
        {isArcane && <InventoryScrollsList character={character} onChange={onChange} />}

        {/* Empty state */}
        {character.spells.length === 0
          && (!isArcane || getScrollItems(character).length === 0) && (
            <p className="text-[#f5e6c8]/40 text-sm italic mb-2">
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
          <KnownSpellsBlock character={character} maxRank={maxRank} onChange={onChange} />
          <SpellStudyBlock character={character} maxRank={maxRank} onChange={onChange} />
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Auto-listed scrolls (arcane Available Spells section)
// ════════════════════════════════════════════════════════════
function InventoryScrollsList({
  character,
  onChange,
}: {
  character: Character;
  onChange: (updates: Partial<Character>) => void;
}) {
  const scrolls = getScrollItems(character).filter((s) => s.scrollSpell?.name);
  if (scrolls.length === 0) return null;

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
      <div className="text-[#c4a35a]/70 text-xs font-semibold mt-2 mb-1">
        Scrolls in inventory · one-shot
      </div>
      {scrolls.map((s) => (
        <div
          key={s.id}
          className="flex flex-wrap items-center gap-2 bg-[#1a1a2e] border border-[#5a3a28]/40 p-2 rounded mb-1"
        >
          <span className="text-[#c4a35a] text-sm shrink-0" title="One-shot scroll">📜</span>
          <span className="text-[#c4a35a] font-semibold shrink-0">R{s.scrollSpell!.rank}</span>
          <span className="text-[#f5e6c8] flex-1 min-w-[120px]">{s.scrollSpell!.name}</span>
          <button
            type="button"
            onClick={() => castScroll(s.id)}
            className="bg-[#5a3a28] hover:bg-[#6b4a35] text-[#f5e6c8] text-xs font-semibold px-3 py-1 rounded shrink-0"
            title="Cast from scroll (consumes it)"
          >
            Cast
          </button>
        </div>
      ))}
    </>
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
  onChange: (updates: Partial<Character>) => void;
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
  onChange,
}: {
  character: Character;
  maxRank: number;
  onChange: (updates: Partial<Character>) => void;
}) {
  const [sort, setSort] = useState<KnownSort>('rank-asc');
  const [avail, setAvail] = useState<AvailFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | KnownSpellSource>('all');
  const [search, setSearch] = useState('');
  const [rankChips, setRankChips] = useState<Set<number>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addSource, setAddSource] = useState<KnownSpellSource>('manual');

  const ranks = Array.from({ length: maxRank }, (_, i) => i + 1);

  const decorated = useMemo(() => {
    return character.knownSpells.map((k) => ({
      ...k,
      inBook: isSpellInAnyBook(character, k.name),
      onScroll: isSpellOnScroll(character, k.name),
    }));
    // Narrow deps: this only reads knownSpells + inventory, not the rest of
    // the character (notes, abilities, etc.). Re-running on every keystroke
    // in unrelated fields was wasteful.
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

  const handleAdd = () => {
    const matched = findArcaneSpell(addName);
    if (!matched) return;
    const newSpell: KnownSpell = {
      id: crypto.randomUUID(),
      name: matched.name,
      rank: matched.rank,
      source: addSource,
      learnedAt: { ...character.currentDate },
    };
    onChange({ knownSpells: [...character.knownSpells, newSpell] });
    setAddName('');
    setShowAdd(false);
  };

  const handleDelete = (id: string) => {
    onChange({ knownSpells: character.knownSpells.filter((k) => k.id !== id) });
  };

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
        <span className="text-[#f5e6c8]/50 text-xs">{decorated.length} learned</span>
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
          title="Sort"
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
          title="Filter by availability"
        >
          <option value="all">All</option>
          <option value="in-hand">📕 In hand</option>
          <option value="no-book">⚠ No book</option>
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as 'all' | KnownSpellSource)}
          className={`${selectClasses} text-xs`}
          title="Filter by source"
        >
          <option value="all">Any source</option>
          {KNOWN_SOURCES.map((s) => (
            <option key={s} value={s}>{KNOWN_SOURCE_LABEL[s]}</option>
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
        <p className="text-[#f5e6c8]/40 text-xs italic mb-2">
          {decorated.length === 0
            ? 'No known spells yet. Add one manually or finish a study.'
            : 'No matches.'}
        </p>
      )}
      <div className="space-y-1">
        {filtered.map((k) => (
          <div
            key={k.id}
            className="flex flex-wrap items-center gap-2 bg-[#2a2a3e]/60 px-2 py-1 rounded text-sm"
          >
            <span
              className="shrink-0 text-xs"
              title={k.inBook ? 'Spell book is in inventory' : 'No spell book in inventory contains this spell'}
            >
              {k.inBook ? '📕' : '⚠'}
            </span>
            {k.onScroll && (
              <span className="shrink-0 text-xs" title="Also available as a scroll">📜</span>
            )}
            <span className="text-[#c4a35a] font-semibold shrink-0">R{k.rank}</span>
            <span className="text-[#f5e6c8] flex-1 min-w-[100px]">{k.name}</span>
            <span className="text-[#f5e6c8]/40 text-xs shrink-0">
              {KNOWN_SOURCE_LABEL[k.source]}
            </span>
            <button
              type="button"
              onClick={() => handleDelete(k.id)}
              className="text-red-400 hover:text-red-300 text-xs px-1 shrink-0"
              title="Remove from known spells"
            >
              X
            </button>
          </div>
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
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              className={`${selectClasses} flex-1 min-w-[180px] text-sm`}
            >
              <option value="">-- Select spell --</option>
              {[1, 2, 3, 4, 5, 6]
                .filter((r) => r <= maxRank)
                .map((rank) => (
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
            >
              {KNOWN_SOURCES.map((s) => (
                <option key={s} value={s}>{KNOWN_SOURCE_LABEL[s]}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!addName}
              className={`${buttonClasses} text-xs ${!addName ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setAddName(''); }}
              className="text-[#f5e6c8]/50 hover:text-[#f5e6c8] text-xs"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Spell Study Block (Arcane only)
// ════════════════════════════════════════════════════════════
function SpellStudyBlock({
  character,
  maxRank,
  onChange,
}: {
  character: Character;
  maxRank: number;
  onChange: (updates: Partial<Character>) => void;
}) {
  const study = character.spellStudy ?? { active: null, queue: [] };
  const active = study.active;
  const queue = study.queue;

  const [draftName, setDraftName] = useState('');
  const [draftSource, setDraftSource] = useState<StudySource>('book');
  const [draftBookId, setDraftBookId] = useState('');
  const [draftNotes, setDraftNotes] = useState('');

  const availableBooks = useMemo(
    () => getSpellbooks(character).filter((b) => (b.spellbookContents?.length ?? 0) < 3),
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

  // Pool of spells the player can study, depending on the source.
  // - Book: spells present in any inventory spellbook minus already-known.
  //         (You can't learn a spell from a book you don't possess.)
  // - Rewrite: spells you already know (RAW p78 — rewriting is for lost
  //   spell books, i.e. recovering spells you previously learned).
  // - Mentor / Research: any arcane spell at or below caster's max rank.
  const studyPool = useMemo(() => {
    if (draftSource === 'book') {
      const inBooks = new Map<string, number>();
      for (const book of getSpellbooks(character)) {
        for (const entry of book.spellbookContents ?? []) {
          if (!entry.name) continue;
          inBooks.set(entry.name, entry.rank);
        }
      }
      return Array.from(inBooks.entries())
        .map(([name, rank]) => ({ name, rank }))
        .filter((s) => !knownNames.has(s.name.toLowerCase()) && s.rank <= maxRank)
        .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    }
    if (draftSource === 'rewrite') {
      return character.knownSpells
        .filter((k) => k.rank <= maxRank)
        .map((k) => ({ name: k.name, rank: k.rank }))
        .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    }
    return ARCANE_SPELLS.filter((s) => s.rank <= maxRank);
    // knownNames is a memo of character.knownSpells; depending on
    // character.knownSpells alone is enough.
  }, [character.equippedItems, character.stowedItems, character.knownSpells, draftSource, maxRank]);

  // Reset selection if it falls outside the new pool when source changes.
  const draftRank = useMemo(() => {
    const match = studyPool.find((s) => s.name === draftName);
    return match?.rank ?? findArcaneSpell(draftName)?.rank ?? 1;
  }, [draftName, studyPool]);

  const config = getStudyConfig(draftSource, draftRank);

  const elapsedWeeks = active ? weeksElapsed(active.startedOn, character.currentDate) : 0;
  const studyReady = active ? elapsedWeeks >= active.weeksRequired : false;

  const handleAddToQueue = () => {
    const trimmed = draftName.trim();
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
      const promoted: ActiveSpellStudy = { ...entry, startedOn: { ...character.currentDate } };
      onChange({ spellStudy: { active: promoted, queue } });
    } else {
      onChange({ spellStudy: { active, queue: [...queue, entry] } });
    }
    setDraftName('');
    setDraftBookId('');
    setDraftNotes('');
  };

  // Promote the head of the queue to active. Caller passes the calendar
  // date the new study should be considered to have started on.
  const promoteNext = (
    remainingQueue: SpellStudyEntry[],
    startedOn: CalendarDate,
  ): { active: ActiveSpellStudy | null; queue: SpellStudyEntry[] } => {
    if (remainingQueue.length === 0) return { active: null, queue: [] };
    const [head, ...rest] = remainingQueue;
    return { active: { ...head, startedOn: { ...startedOn } }, queue: rest };
  };

  const completeStudy = (passed: boolean) => {
    if (!active) return;

    let updatedKnown = character.knownSpells;
    let updatedFailed = character.failedStudies;
    let updatedEquipped = character.equippedItems;
    let updatedStowed = character.stowedItems;

    if (passed) {
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
            learnedAt: { ...character.currentDate },
          },
        ];
      }
      // Write into target spellbook if specified
      if (active.targetSpellbookId) {
        const writeInto = (items: InventoryItem[]) =>
          items.map((i) => {
            if (i.id !== active.targetSpellbookId) return i;
            const contents = i.spellbookContents ?? [];
            if (contents.length >= 3) return i;
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

    // Stamp the next study's start at the actual handoff (start + weeks*7),
    // not at currentDate. The player may have advanced past completion before
    // clicking Complete; without this the next study would lose that gap.
    const handoffDate = addDays(active.startedOn, active.weeksRequired * 7);
    const next = promoteNext(queue, handoffDate);
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
    const next = promoteNext(queue, character.currentDate);
    onChange({ spellStudy: next });
  };

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
    <div className="mb-4 bg-[#1a1a2e] border border-[#5a3a28]/60 rounded p-3">
      <h4 className="text-[#c4a35a] text-sm font-semibold mb-2">Spell Study</h4>

      {/* Active study */}
      {active ? (
        <div className={`bg-[#2a2a3e]/60 border rounded p-2 mb-2 ${studyReady ? 'border-[#c4a35a]' : 'border-[#5a3a28]/60'}`}>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[#c4a35a] font-semibold">R{active.rank}</span>
            <span className="text-[#f5e6c8] font-semibold">{active.spellName}</span>
            <span className="text-[#f5e6c8]/60 text-xs">({active.source})</span>
            <span className="ml-auto text-[#f5e6c8]/60 text-xs">
              started {formatCalendarDate(active.startedOn)}
            </span>
          </div>
          <div className="text-[#f5e6c8] text-sm mb-2">
            Progress:{' '}
            <span className={studyReady ? 'text-[#c4a35a] font-semibold' : ''}>
              {elapsedWeeks} / {active.weeksRequired} weeks
            </span>
            {active.goldCost > 0 && (
              <span className="text-[#f5e6c8]/50 text-xs ml-2">(cost: {active.goldCost}gp)</span>
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
                    <span className="text-[#f5e6c8]/50 text-xs self-center">
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
                    <span className="text-[#f5e6c8]/50 text-xs self-center">
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
                  className="text-[#f5e6c8]/50 hover:text-[#f5e6c8] text-xs underline self-center"
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
                className="text-[#f5e6c8]/50 hover:text-[#f5e6c8] text-xs underline"
              >
                Abandon
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[#f5e6c8]/40 text-xs italic mb-2">No spell currently in study.</p>
      )}

      {/* Queue */}
      {queue.length > 0 && (
        <div className="mb-3">
          <div className="text-[#c4a35a] text-xs font-semibold mb-1">Queue</div>
          <div className="space-y-1">
            {queue.map((q, i) => (
              <div key={q.id} className="flex items-center gap-2 bg-[#2a2a3e]/40 rounded px-2 py-1 text-sm">
                <span className="text-[#c4a35a] text-xs">{i + 1}.</span>
                <span className="text-[#c4a35a] font-semibold">R{q.rank}</span>
                <span className="text-[#f5e6c8] flex-1">{q.spellName}</span>
                <span className="text-[#f5e6c8]/50 text-xs">{q.source} · {q.weeksRequired}w</span>
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
              </div>
            ))}
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
          <div className="text-[#f5e6c8]/50 text-xs italic mb-2">
            Mentor must be at least 3 Levels higher than you (L{character.level + 3}+).
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <select
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className={`${selectClasses} flex-1 min-w-[180px] text-sm`}
          >
            <option value="">
              {draftSource === 'book' && studyPool.length === 0
                ? '-- No unknown spells in your books --'
                : '-- Select spell --'}
            </option>
            {draftSource === 'book'
              ? studyPool.map((s) => (
                  <option key={s.name} value={s.name}>
                    {`R${s.rank} · ${s.name}`}
                  </option>
                ))
              : [1, 2, 3, 4, 5, 6]
                  .filter((r) => r <= maxRank)
                  .map((rank) => (
                    <optgroup key={rank} label={`Rank ${rank}`}>
                      {ARCANE_SPELLS.filter((s) => s.rank === rank).map((s) => (
                        <option key={s.name} value={s.name}>{s.name}</option>
                      ))}
                    </optgroup>
                  ))}
          </select>
          {draftName && (
            <span className="text-[#c4a35a] text-xs shrink-0">R{draftRank}</span>
          )}
        </div>
        {draftSource === 'book' && (
          <div className="text-[#f5e6c8]/50 text-xs italic mb-2">
            Only spells in your inventory spell books are shown.
          </div>
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
            <label className="text-[#f5e6c8]/60 text-xs">Write into book on success:</label>
            <select
              value={draftBookId}
              onChange={(e) => setDraftBookId(e.target.value)}
              className={`${selectClasses} text-xs flex-1 min-w-[140px]`}
            >
              <option value="">(none — known list only)</option>
              {availableBooks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({(b.spellbookContents?.length ?? 0)}/3)
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
            disabled={!draftName.trim()}
            className={`${buttonClasses} text-sm ${!draftName.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {active ? '+ Queue Study' : '+ Start Study'}
          </button>
          {draftName.trim() && knownNames.has(draftName.trim().toLowerCase()) && (
            <span className="text-[#c47a3a] text-xs italic">Already known — usually unnecessary.</span>
          )}
          {draftName.trim() && draftSource === 'book' && failedBlockSet.has(draftName.trim().toLowerCase()) && (
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
  onChange: (updates: Partial<Character>) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
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

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={noOptions}
        className={`${buttonClasses} ${noOptions ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={noOptions ? 'No known spells with a book in hand' : ''}
      >
        + Memorise ▾
      </button>
      {open && !noOptions && (
        <div className="absolute left-0 top-full mt-1 bg-[#2a2a3e] border border-[#5a3a28] rounded shadow-lg z-50 min-w-64 max-h-96 overflow-y-auto">
          <div className="px-3 py-1 text-[#c4a35a] text-xs font-semibold border-b border-[#5a3a28]/40">
            Known · In hand
          </div>
          {knownAvailable.map((k) => {
            const cap = capFor(k.rank);
            const atCap = isAtCap(k.rank);
            const hasNoSlots = cap === 0;
            return (
              <button
                key={k.id}
                type="button"
                disabled={atCap}
                onClick={() => memoriseKnown(k)}
                className={`block w-full text-left px-3 py-1.5 text-sm ${
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
                  <span className="text-[#f5e6c8]/40 text-xs ml-2">
                    {hasNoSlots ? '(no slots yet)' : `(R${k.rank} full)`}
                  </span>
                )}
              </button>
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
  const maxGlamours = profile.glamourCount;
  const currentCount = character.glamours.length;
  const isOver = currentCount > maxGlamours;
  const pickedIds = new Set(character.glamours.map((g) => g.glamourId));
  const availableGlamours = GLAMOURS.filter((g) => !pickedIds.has(g.id));

  return (
    <div className="mb-4">
      <h3 className={sectionHeadingClasses}>Glamours</h3>

      <div className={`text-sm mb-2 ${isOver ? 'text-red-400' : 'text-[#f5e6c8]/70'}`}>
        {currentCount}/{maxGlamours} glamours known
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

      {availableGlamours.length > 0 && currentCount < maxGlamours && (
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

      {currentCount >= maxGlamours && availableGlamours.length > 0 && (
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
        <p className="text-[#f5e6c8]/40 text-sm italic mb-2">No runes granted yet.</p>
      )}

      {character.runes.map((rune) => {
        const freq = getRuneUsageFrequency(rune.magnitude, level);
        return (
          <div key={rune.id} className="bg-[#1a1a2e] p-2 rounded mb-1">
            <div className="flex items-center gap-2">
              <span className="text-[#c4a35a] font-semibold text-sm">{rune.name}</span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${
                  rune.magnitude === 'lesser'
                    ? 'bg-green-900/40 text-green-400'
                    : rune.magnitude === 'greater'
                    ? 'bg-blue-900/40 text-blue-400'
                    : 'bg-purple-900/40 text-purple-400'
                }`}
              >
                {rune.magnitude}
              </span>
              <span className="text-[#f5e6c8]/50 text-xs">{freq}</span>
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-[#f5e6c8]/70 text-xs">Uses:</span>
                <button
                  onClick={() =>
                    updateRune(rune.id, { usesRemaining: Math.max(0, rune.usesRemaining - 1) })
                  }
                  className="text-[#f5e6c8] bg-[#5a3a28] hover:bg-[#6b4a35] w-6 h-6 rounded text-sm flex items-center justify-center transition-colors"
                >
                  -
                </button>
                <span className="text-[#f5e6c8] text-sm w-6 text-center">
                  {rune.usesRemaining}
                </span>
                <button
                  onClick={() => updateRune(rune.id, { usesRemaining: rune.usesRemaining + 1 })}
                  className="text-[#f5e6c8] bg-[#5a3a28] hover:bg-[#6b4a35] w-6 h-6 rounded text-sm flex items-center justify-center transition-colors"
                >
                  +
                </button>
              </div>
              <button
                onClick={() => deleteRune(rune.id)}
                className="text-red-400 hover:text-red-300 text-sm font-bold px-2 py-1 rounded hover:bg-red-400/10 transition-colors shrink-0"
                title="Remove rune"
              >
                X
              </button>
            </div>
            <p className="text-[#f5e6c8]/50 text-xs mt-1">
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
  onChange: (updates: Partial<Character>) => void;
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

function SpellReference({ spellType }: { spellType: 'arcane' | 'holy' | null }) {
  if (!spellType) return null;

  const isArcane = spellType === 'arcane';
  const spells = isArcane ? ARCANE_SPELLS : HOLY_SPELLS;
  const maxRank = isArcane ? 6 : 5;

  return (
    <details className="mb-2">
      <summary className="text-[#c4a35a] text-sm font-semibold cursor-pointer hover:text-[#d4b36a] transition-colors">
        {isArcane ? 'Arcane' : 'Holy'} Spell Reference
      </summary>
      <div className="bg-[#1a1a2e] rounded p-3 mt-1 text-sm">
        {Array.from({ length: maxRank }, (_, i) => i + 1).map((rank) => {
          const rankSpells = spells.filter((s) => s.rank === rank);
          return (
            <div key={rank} className="mb-2">
              <div className="text-[#c4a35a] font-semibold text-xs mb-1">Rank {rank}</div>
              <div className="text-[#f5e6c8]/70 text-xs">
                {rankSpells.map((s, i) => (
                  <span key={s.name}>
                    {s.name}
                    {'saint' in s && (
                      <span className="text-[#f5e6c8]/40">
                        {' '}
                        ({(s as { saint: string }).saint})
                      </span>
                    )}
                    {i < rankSpells.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

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
            <tr className="text-[#f5e6c8]/50">
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
        <div className="text-[#f5e6c8]/40 text-xs mt-2">
          Modifiers: +1 (L3-5), +2 (L6-9), +3 (L10+). Duplicate = usage frequency doubles.
        </div>

        <div className="mt-3 text-[#f5e6c8]/70 text-xs">
          <div className="text-[#c4a35a] font-semibold mb-1">Usage Frequency:</div>
          <table className="w-full">
            <thead>
              <tr className="text-[#f5e6c8]/50">
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
              <span className="text-[#f5e6c8]/50 text-xs">
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
