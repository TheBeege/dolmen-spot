'use client';

import { useState } from 'react';
import { Character, SkillTargets } from '@/lib/types';
import {
  calculateSkillTargets,
  skillNameToKey,
  skillKeyToDisplayName,
} from '@/lib/gamedata';

interface SkillsPanelProps {
  character: Character;
  onChange: (updates: Partial<Character>) => void;
}

const inputClasses =
  'bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 w-16 text-center focus:outline-none focus:border-[#c4a35a] transition-colors';

export default function SkillsPanel({ character, onChange }: SkillsPanelProps) {
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');

  const hasClassOrKindredClass = !!(
    character.class ||
    (character.kindred && character.kindred !== 'human' && !character.class)
  );

  const calculated = calculateSkillTargets(
    character.kindred,
    character.class,
    character.level,
  );

  // Determine which stored skills are auto-calculated vs custom
  const autoKeys = Array.from(calculated.autoSkillKeys).sort();
  const customKeys = Object.keys(character.skillTargets)
    .filter(key => !calculated.autoSkillKeys.has(key))
    .sort();

  // Check if any auto-calculated skill is out of sync
  const outOfSyncKeys = autoKeys.filter(key => {
    const stored = character.skillTargets[key];
    const calc = calculated.targets[key];
    return stored === undefined || stored !== calc;
  });
  const hasOutOfSync = outOfSyncKeys.length > 0;

  const handleSyncAll = () => {
    const newTargets = { ...character.skillTargets };
    for (const key of autoKeys) {
      newTargets[key] = calculated.targets[key];
    }
    onChange({ skillTargets: newTargets });
  };

  const handleSkillChange = (key: string, value: string) => {
    const parsed = parseInt(value, 10);
    if (value === '') {
      onChange({
        skillTargets: { ...character.skillTargets, [key]: 0 },
      });
      return;
    }
    if (isNaN(parsed)) return;
    onChange({
      skillTargets: { ...character.skillTargets, [key]: parsed },
    });
  };

  const handleAddSkill = () => {
    const trimmed = newSkillName.trim();
    if (!trimmed) return;
    const key = skillNameToKey(trimmed);
    if (key in character.skillTargets) return;
    onChange({
      skillTargets: { ...character.skillTargets, [key]: 6 },
    });
    setNewSkillName('');
    setShowAddSkill(false);
  };

  const handleRemoveSkill = (key: string) => {
    const { [key]: _, ...rest } = character.skillTargets;
    onChange({ skillTargets: rest as SkillTargets });
  };

  return (
    <div className="bg-[#2a2a3e] rounded-lg p-4">
      <div className="flex items-center justify-between mb-2 border-b border-[#5a3a28] pb-1">
        <h2 className="text-lg font-bold text-[#c4a35a]">
          Skill Targets
        </h2>
        {hasClassOrKindredClass && hasOutOfSync && (
          <button
            type="button"
            onClick={handleSyncAll}
            className="text-xs px-2 py-1 bg-[#5a3a28] text-[#c4a35a] rounded hover:bg-[#7a5a38] transition-colors"
          >
            Sync All
          </button>
        )}
      </div>

      {/* Expertise Points */}
      {calculated.expertisePoints !== null && (
        <p className="text-[#8b8b9e] text-xs mb-3">
          Expertise Points: <span className="text-[#f5e6c8] font-semibold">{calculated.expertisePoints}</span>
          <span className="text-[#8b8b9e]"> (distribute among class skills)</span>
        </p>
      )}

      {/* Auto-calculated skills */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
        {autoKeys.map(key => {
          const stored = character.skillTargets[key];
          const calc = calculated.targets[key];
          const isOff = stored === undefined || stored !== calc;
          const displayName = skillKeyToDisplayName(key);
          return (
            <div key={key} className="flex flex-col items-center gap-1">
              <label className="text-xs font-semibold text-[#c4a35a] uppercase tracking-wide text-center leading-tight">
                {displayName}
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={stored ?? ''}
                  onChange={(e) => handleSkillChange(key, e.target.value)}
                  className={`${inputClasses} ${isOff ? 'border-[#c4a35a]' : ''}`}
                  aria-label={`${displayName} skill target`}
                />
                {isOff && (
                  <button
                    type="button"
                    onClick={() => handleSkillChange(key, String(calc))}
                    className="text-[10px] text-[#c4a35a] hover:text-[#f5e6c8] transition-colors"
                    title={`Sync to ${calc}`}
                  >
                    {calc}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom skills */}
      {customKeys.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[#5a3a28]/50">
          <span className="text-xs text-[#8b8b9e] mb-2 block">Custom Skills</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {customKeys.map(key => {
              const displayName = skillKeyToDisplayName(key);
              return (
                <div key={key} className="flex flex-col items-center gap-1 relative group">
                  <label className="text-xs font-semibold text-[#c4a35a] uppercase tracking-wide text-center leading-tight">
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
        </div>
      )}

      {/* Add skill form */}
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
  );
}
