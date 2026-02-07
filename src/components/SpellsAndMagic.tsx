'use client';

import { Character, SpellSlot } from '@/lib/types';

interface SpellsAndMagicProps {
  character: Character;
  onChange: (updates: Partial<Character>) => void;
}

const inputClasses =
  'bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a]';

const sectionHeadingClasses =
  'text-lg font-bold text-[#c4a35a] mb-2 border-b border-[#5a3a28] pb-1';

export default function SpellsAndMagic({ character, onChange }: SpellsAndMagicProps) {
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

  return (
    <div className="bg-[#2a2a3e] rounded-lg p-4">
      <h2 className="text-[#c4a35a] text-xl font-bold mb-4 border-b border-[#5a3a28] pb-2">
        Spells & Magic
      </h2>

      {/* Spell Slots */}
      <div className="mb-4">
        <h3 className={sectionHeadingClasses}>Spell Slots</h3>

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
            {/* Name */}
            <input
              type="text"
              value={spell.name}
              onChange={(e) => updateSpell(spell.id, { name: e.target.value })}
              placeholder="Spell name"
              className={`${inputClasses} flex-1 min-w-0`}
            />

            {/* Rank */}
            <input
              type="number"
              min={1}
              max={6}
              value={spell.rank}
              onChange={(e) =>
                updateSpell(spell.id, { rank: Math.min(6, Math.max(1, parseInt(e.target.value) || 1)) })
              }
              title="Rank"
              className={`${inputClasses} w-14 text-center`}
            />

            {/* Prepared */}
            <label className="flex items-center gap-1 text-[#f5e6c8] text-sm shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={spell.prepared}
                onChange={(e) => updateSpell(spell.id, { prepared: e.target.checked })}
                className="accent-[#c4a35a]"
              />
              Prep
            </label>

            {/* Cast */}
            <label className="flex items-center gap-1 text-[#f5e6c8] text-sm shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={spell.cast}
                onChange={(e) => updateSpell(spell.id, { cast: e.target.checked })}
                className="accent-[#c4a35a]"
              />
              Cast
            </label>

            {/* Notes */}
            <input
              type="text"
              value={spell.notes}
              onChange={(e) => updateSpell(spell.id, { notes: e.target.value })}
              placeholder="Notes"
              className={`${inputClasses} flex-1 min-w-0`}
            />

            {/* Delete */}
            <button
              onClick={() => deleteSpell(spell.id)}
              className="text-red-400 hover:text-red-300 text-sm font-bold px-2 py-1 rounded hover:bg-red-400/10 transition-colors shrink-0"
              title="Delete spell"
            >
              X
            </button>
          </div>
        ))}

        <button
          onClick={addSpell}
          className="mt-2 bg-[#5a3a28] hover:bg-[#6b4a35] text-[#f5e6c8] text-sm font-semibold px-3 py-1 rounded transition-colors"
        >
          + Add Spell
        </button>
      </div>

      {/* Spell Notes */}
      <div className="mb-4">
        <h3 className={sectionHeadingClasses}>Spell Notes</h3>
        <textarea
          value={character.spellNotes}
          onChange={(e) => onChange({ spellNotes: e.target.value })}
          placeholder="General spell notes, components, restrictions..."
          rows={4}
          className={`${inputClasses} w-full resize-y`}
        />
      </div>

      {/* Magic Reference */}
      <div>
        <h3 className={sectionHeadingClasses}>Magic Reference</h3>
        <ul className="text-[#f5e6c8] text-sm space-y-1">
          <li>
            <span className="text-[#c4a35a] font-semibold">Arcane:</span> Memorize from spell books.
            Ranks 1-6.
          </li>
          <li>
            <span className="text-[#c4a35a] font-semibold">Holy:</span> Pray for spells daily. Ranks
            1-5.
          </li>
          <li>
            <span className="text-[#c4a35a] font-semibold">Fairy:</span> Glamours and Runes.
          </li>
          <li>
            <span className="text-[#c4a35a] font-semibold">Mossling:</span> Knacks.
          </li>
        </ul>
      </div>
    </div>
  );
}
