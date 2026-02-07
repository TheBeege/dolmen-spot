'use client';

import { Character, AbilityScores as AbilityScoresType, SaveTargets } from '@/lib/types';
import { getAbilityModifier, formatModifier, calculateXpModifier } from '@/lib/gamedata';
import SkillsPanel from './SkillsPanel';

interface AbilityScoresProps {
  character: Character;
  onChange: (updates: Partial<Character>) => void;
}

const ABILITIES: {
  key: keyof AbilityScoresType;
  label: string;
  abbr: string;
  note: string;
}[] = [
  { key: 'strength', label: 'Strength', abbr: 'STR', note: 'Melee atk/dmg' },
  { key: 'intelligence', label: 'Intelligence', abbr: 'INT', note: 'Languages' },
  { key: 'wisdom', label: 'Wisdom', abbr: 'WIS', note: 'Magic resistance' },
  { key: 'dexterity', label: 'Dexterity', abbr: 'DEX', note: 'AC / missile atk' },
  { key: 'constitution', label: 'Constitution', abbr: 'CON', note: 'HP / level' },
  { key: 'charisma', label: 'Charisma', abbr: 'CHA', note: 'Reactions' },
];

const SAVES: { key: keyof SaveTargets; label: string }[] = [
  { key: 'doom', label: 'Doom' },
  { key: 'ray', label: 'Ray' },
  { key: 'hold', label: 'Hold' },
  { key: 'blast', label: 'Blast' },
  { key: 'spell', label: 'Spell' },
];

export default function AbilityScores({ character, onChange }: AbilityScoresProps) {

  const handleAbilityChange = (key: keyof AbilityScoresType, value: string) => {
    const newScores = { ...character.abilityScores };
    if (value === '') {
      newScores[key] = 0;
    } else {
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) return;
      // Only clamp at the upper bound while typing; allow low values
      // so the user can type multi-digit numbers without the intermediate
      // single digit being forced to 3.
      newScores[key] = Math.min(18, Math.max(0, parsed));
    }

    const xpMod = calculateXpModifier(character.class, character.kindred, newScores);
    onChange({
      abilityScores: newScores,
      xpModifier: xpMod.total,
    });
  };

  const handleAbilityBlur = (key: keyof AbilityScoresType) => {
    const current = character.abilityScores[key];
    if (current < 3) {
      onChange({
        abilityScores: {
          ...character.abilityScores,
          [key]: 3,
        },
      });
    }
  };

  const handleSaveChange = (key: keyof SaveTargets, value: string) => {
    const parsed = parseInt(value, 10);
    if (value === '') {
      onChange({
        saveTargets: {
          ...character.saveTargets,
          [key]: 0,
        },
      });
      return;
    }
    if (isNaN(parsed)) return;
    onChange({
      saveTargets: {
        ...character.saveTargets,
        [key]: parsed,
      },
    });
  };

  const inputClasses =
    'bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 w-16 text-center focus:outline-none focus:border-[#c4a35a] transition-colors';

  return (
    <div className="space-y-6">
      {/* Ability Scores */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h2 className="text-lg font-bold text-[#c4a35a] mb-2 border-b border-[#5a3a28] pb-1">
          Ability Scores
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-3">
          {ABILITIES.map((ability) => {
            const score = character.abilityScores[ability.key];
            const mod = getAbilityModifier(score);
            const modStr = formatModifier(mod);
            return (
              <div
                key={ability.key}
                className="bg-[#1a1a2e] border border-[#5a3a28] rounded-lg p-3 flex flex-col items-center"
              >
                <span className="text-xs font-bold tracking-widest text-[#c4a35a] uppercase">
                  {ability.abbr}
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    min={3}
                    max={18}
                    value={score || ''}
                    onChange={(e) => handleAbilityChange(ability.key, e.target.value)}
                    onBlur={() => handleAbilityBlur(ability.key)}
                    className="bg-[#2a2a3e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 w-14 text-center text-xl font-bold focus:outline-none focus:border-[#c4a35a] transition-colors"
                    aria-label={`${ability.label} score`}
                  />
                  <span
                    className={`text-lg font-semibold ${
                      mod > 0
                        ? 'text-green-400'
                        : mod < 0
                        ? 'text-red-400'
                        : 'text-[#f5e6c8]'
                    }`}
                  >
                    {modStr}
                  </span>
                </div>
                <span className="text-[10px] text-[#8a7a6a] mt-1 italic">{ability.note}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Save Targets */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h2 className="text-lg font-bold text-[#c4a35a] mb-2 border-b border-[#5a3a28] pb-1">
          Save Targets
        </h2>
        <div className="grid grid-cols-5 gap-3 mt-3">
          {SAVES.map((save) => (
            <div key={save.key} className="flex flex-col items-center gap-1">
              <label className="text-xs font-semibold text-[#c4a35a] uppercase tracking-wide">
                {save.label}
              </label>
              <input
                type="number"
                value={character.saveTargets[save.key] || ''}
                onChange={(e) => handleSaveChange(save.key, e.target.value)}
                className={inputClasses}
                aria-label={`${save.label} save target`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Skill Targets */}
      <SkillsPanel character={character} onChange={onChange} />
    </div>
  );
}
