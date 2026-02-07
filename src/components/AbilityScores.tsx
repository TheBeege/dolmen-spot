'use client';

import { useState } from 'react';
import { Character, AbilityScores as AbilityScoresType, SaveTargets, SkillTargets } from '@/lib/types';
import { getAbilityModifier, formatModifier } from '@/lib/gamedata';

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

const BASE_SKILLS: { key: string; label: string }[] = [
  { key: 'listen', label: 'Listen' },
  { key: 'search', label: 'Search' },
  { key: 'survival', label: 'Survival' },
];

export default function AbilityScores({ character, onChange }: AbilityScoresProps) {
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');

  const handleAbilityChange = (key: keyof AbilityScoresType, value: string) => {
    const parsed = parseInt(value, 10);
    if (value === '') {
      onChange({
        abilityScores: {
          ...character.abilityScores,
          [key]: 0,
        },
      });
      return;
    }
    if (isNaN(parsed)) return;
    const clamped = Math.max(3, Math.min(18, parsed));
    onChange({
      abilityScores: {
        ...character.abilityScores,
        [key]: clamped,
      },
    });
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

  const handleSkillChange = (key: string, value: string) => {
    const parsed = parseInt(value, 10);
    if (value === '') {
      onChange({
        skillTargets: {
          ...character.skillTargets,
          [key]: 0,
        },
      });
      return;
    }
    if (isNaN(parsed)) return;
    onChange({
      skillTargets: {
        ...character.skillTargets,
        [key]: parsed,
      },
    });
  };

  const handleAddSkill = () => {
    const trimmed = newSkillName.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase().replace(/\s+/g, '_');
    if (key in character.skillTargets) return;
    onChange({
      skillTargets: {
        ...character.skillTargets,
        [key]: 1,
      },
    });
    setNewSkillName('');
    setShowAddSkill(false);
  };

  const handleRemoveSkill = (key: string) => {
    const { [key]: _, ...rest } = character.skillTargets;
    onChange({
      skillTargets: rest as SkillTargets,
    });
  };

  const customSkillKeys = Object.keys(character.skillTargets).filter(
    (key) => !BASE_SKILLS.some((bs) => bs.key === key)
  );

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
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h2 className="text-lg font-bold text-[#c4a35a] mb-2 border-b border-[#5a3a28] pb-1">
          Skill Targets
        </h2>
        <div className="flex flex-wrap gap-4 mt-3">
          {BASE_SKILLS.map((skill) => (
            <div key={skill.key} className="flex flex-col items-center gap-1">
              <label className="text-xs font-semibold text-[#c4a35a] uppercase tracking-wide">
                {skill.label}
              </label>
              <input
                type="number"
                value={character.skillTargets[skill.key] || ''}
                onChange={(e) => handleSkillChange(skill.key, e.target.value)}
                className={inputClasses}
                aria-label={`${skill.label} skill target`}
              />
            </div>
          ))}
          {customSkillKeys.map((key) => {
            const displayName = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            return (
              <div key={key} className="flex flex-col items-center gap-1 relative group">
                <label className="text-xs font-semibold text-[#c4a35a] uppercase tracking-wide">
                  {displayName}
                </label>
                <input
                  type="number"
                  value={character.skillTargets[key] || ''}
                  onChange={(e) => handleSkillChange(key, e.target.value)}
                  className={inputClasses}
                  aria-label={`${displayName} skill target`}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveSkill(key)}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-900 text-red-300 text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Remove ${displayName}`}
                  title={`Remove ${displayName}`}
                >
                  x
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-3">
          {showAddSkill ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddSkill();
                  if (e.key === 'Escape') {
                    setShowAddSkill(false);
                    setNewSkillName('');
                  }
                }}
                placeholder="Skill name..."
                className="bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-sm focus:outline-none focus:border-[#c4a35a] transition-colors placeholder-[#5a4a3a]"
                autoFocus
                aria-label="New skill name"
              />
              <button
                type="button"
                onClick={handleAddSkill}
                className="text-xs px-2 py-1 bg-[#5a3a28] text-[#f5e6c8] rounded hover:bg-[#7a5a38] transition-colors"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddSkill(false);
                  setNewSkillName('');
                }}
                className="text-xs px-2 py-1 text-[#8a7a6a] hover:text-[#f5e6c8] transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddSkill(true)}
              className="text-xs px-3 py-1 border border-[#5a3a28] text-[#c4a35a] rounded hover:bg-[#5a3a28] hover:text-[#f5e6c8] transition-colors"
            >
              + Add Skill
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
