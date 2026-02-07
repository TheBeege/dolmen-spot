'use client';

import { Character } from '@/lib/types';
import { KINDREDS, MOON_SIGNS, ALIGNMENTS, getAvailableClasses } from '@/lib/gamedata';

interface CharacterInfoProps {
  character: Character;
  onChange: (updates: Partial<Character>) => void;
}

const inputClasses =
  'w-full bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a]';

const labelClasses = 'block text-[#c4a35a] text-sm font-semibold mb-1';

export default function CharacterInfo({ character, onChange }: CharacterInfoProps) {
  const selectedKindred = KINDREDS.find((k) => k.id === character.kindred);
  const availableClasses = getAvailableClasses(character.kindred);
  const selectedClassEntry = availableClasses.find((c) => c.class.id === character.class);

  // If the selected kindred changes and the current class is now forbidden, clear it
  const handleKindredChange = (kindred: Character['kindred']) => {
    const newAvailable = getAvailableClasses(kindred);
    const classStillValid = !character.class || newAvailable.some(c => c.class.id === character.class);
    onChange({
      kindred,
      ...(classStillValid ? {} : { class: '' }),
    });
  };

  return (
    <div className="bg-[#2a2a3e] rounded-lg p-4">
      <h2 className="text-[#c4a35a] text-xl font-bold mb-4 border-b border-[#5a3a28] pb-2">
        Character Info
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Name */}
        <div>
          <label className={labelClasses}>Name</label>
          <input
            type="text"
            value={character.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Enter character name"
            className={inputClasses}
          />
        </div>

        {/* Level */}
        <div>
          <label className={labelClasses}>Level</label>
          <input
            type="number"
            min={1}
            max={15}
            value={character.level}
            onChange={(e) => onChange({ level: parseInt(e.target.value) || 1 })}
            className={inputClasses}
          />
        </div>

        {/* Kindred */}
        <div>
          <label className={labelClasses}>Kindred</label>
          <select
            value={character.kindred}
            onChange={(e) => handleKindredChange(e.target.value as Character['kindred'])}
            className={inputClasses}
          >
            <option value="">-- Select Kindred --</option>
            {KINDREDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
          {selectedKindred && (
            <p className="text-[#f5e6c8]/60 text-xs mt-1 italic">
              {selectedKindred.description}
            </p>
          )}
        </div>

        {/* Class (optional) */}
        <div>
          <label className={labelClasses}>
            Class
            <span className="text-[#f5e6c8]/40 font-normal ml-1">(optional)</span>
          </label>
          <select
            value={character.class}
            onChange={(e) => onChange({ class: e.target.value as Character['class'] })}
            className={inputClasses}
          >
            <option value="">-- Kindred-Class (no separate class) --</option>
            {availableClasses.map(({ class: c, restriction }) => (
              <option key={c.id} value={c.id}>
                {c.name}{restriction === 'rare' ? ' (rare)' : ''}
              </option>
            ))}
          </select>
          {selectedClassEntry ? (
            <p className="text-[#f5e6c8]/60 text-xs mt-1 italic">
              {selectedClassEntry.class.description}
              {selectedClassEntry.restriction === 'rare' && (
                <span className="text-[#c4a35a]"> — Unusual combination for this kindred.</span>
              )}
            </p>
          ) : character.kindred && !character.class ? (
            <p className="text-[#f5e6c8]/60 text-xs mt-1 italic">
              Playing as a {selectedKindred?.name} kindred-class (see appendix).
            </p>
          ) : null}
        </div>

        {/* Background */}
        <div>
          <label className={labelClasses}>Background</label>
          <input
            type="text"
            value={character.background}
            onChange={(e) => onChange({ background: e.target.value })}
            placeholder="Enter background"
            className={inputClasses}
          />
        </div>

        {/* Alignment */}
        <div>
          <label className={labelClasses}>Alignment</label>
          <select
            value={character.alignment}
            onChange={(e) => onChange({ alignment: e.target.value as Character['alignment'] })}
            className={inputClasses}
          >
            <option value="">-- Select Alignment --</option>
            {ALIGNMENTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {/* Affiliation */}
        <div>
          <label className={labelClasses}>Affiliation</label>
          <input
            type="text"
            value={character.affiliation}
            onChange={(e) => onChange({ affiliation: e.target.value })}
            placeholder="Enter affiliation"
            className={inputClasses}
          />
        </div>

        {/* Moon Sign */}
        <div>
          <label className={labelClasses}>Moon Sign</label>
          <select
            value={character.moonSign}
            onChange={(e) => onChange({ moonSign: e.target.value })}
            className={inputClasses}
          >
            <option value="">-- Select Moon Sign --</option>
            {MOON_SIGNS.map((sign) => (
              <option key={sign} value={sign}>
                {sign}
              </option>
            ))}
          </select>
        </div>

        {/* XP / Next Level XP */}
        <div>
          <label className={labelClasses}>XP / Next Level XP</label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              min={0}
              value={character.xp}
              onChange={(e) => onChange({ xp: parseInt(e.target.value) || 0 })}
              placeholder="Current XP"
              className={inputClasses}
            />
            <span className="text-[#f5e6c8]/40 shrink-0">/</span>
            <input
              type="number"
              min={0}
              value={character.xpNextLevel}
              onChange={(e) => onChange({ xpNextLevel: parseInt(e.target.value) || 0 })}
              placeholder="Next Level"
              className={inputClasses}
            />
          </div>
        </div>

        {/* XP Modifier */}
        <div>
          <label className={labelClasses}>XP Modifier (%)</label>
          <input
            type="number"
            value={character.xpModifier}
            onChange={(e) => onChange({ xpModifier: parseInt(e.target.value) || 0 })}
            className={inputClasses}
          />
        </div>
      </div>
    </div>
  );
}
