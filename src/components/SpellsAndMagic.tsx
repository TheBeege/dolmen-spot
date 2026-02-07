'use client';

import { Character, SpellSlot, CharacterGlamour, CharacterRune, CharacterKnack } from '@/lib/types';
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

      {/* Starting Spell Book (Magician only) */}
      {isMagician && (
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
        </div>
      )}

      {/* Spell Slots list */}
      {character.spells.length === 0 && (
        <p className="text-[#f5e6c8]/40 text-sm italic mb-2">No spells added yet.</p>
      )}

      {character.spells.map((spell) => (
        <div
          key={spell.id}
          className={`flex items-center gap-2 bg-[#1a1a2e] p-2 rounded mb-1 ${
            spell.cast ? 'opacity-50' : ''
          }`}
        >
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
            max={profile.maxSpellRank || 6}
            value={spell.rank}
            onChange={(e) =>
              updateSpell(spell.id, {
                rank: Math.min(profile.maxSpellRank || 6, Math.max(1, parseInt(e.target.value) || 1)),
              })
            }
            title="Rank"
            className={`${inputClasses} w-14 text-center`}
          />
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

      <div className="flex gap-2 mt-2">
        <button onClick={addSpell} className={buttonClasses}>
          + Add Spell
        </button>
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
