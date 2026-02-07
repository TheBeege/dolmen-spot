'use client';

import { Character } from '@/lib/types';
import { getAbilityModifier, formatModifier } from '@/lib/gamedata';

interface CombatStatsProps {
  character: Character;
  onChange: (updates: Partial<Character>) => void;
}

export default function CombatStats({ character, onChange }: CombatStatsProps) {
  const conMod = getAbilityModifier(character.abilityScores.constitution);
  const dexMod = getAbilityModifier(character.abilityScores.dexterity);
  const strMod = getAbilityModifier(character.abilityScores.strength);
  const wisMod = getAbilityModifier(character.abilityScores.wisdom);

  const hpPercentage =
    character.maxHp > 0
      ? Math.max(0, Math.min(100, (character.currentHp / character.maxHp) * 100))
      : 0;

  const adjustHp = (delta: number) => {
    const newHp = Math.max(
      -character.maxHp,
      Math.min(character.maxHp, character.currentHp + delta)
    );
    onChange({ currentHp: newHp });
  };

  return (
    <div className="space-y-4">
      {/* Hit Points - Prominent Display */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h3 className="text-[#c4a35a] text-sm font-semibold uppercase tracking-wider mb-3">
          Hit Points
        </h3>

        {/* HP Bar */}
        <div className="mb-4">
          <div className="bg-[#1a1a2e] rounded-full h-6 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${hpPercentage}%`,
                backgroundColor:
                  hpPercentage > 50
                    ? '#8b2500'
                    : hpPercentage > 25
                      ? '#a85000'
                      : '#cc0000',
              }}
            />
          </div>
        </div>

        {/* Large HP Display with +/- Buttons */}
        <div className="flex items-center justify-center gap-4 mb-4">
          <button
            type="button"
            onClick={() => adjustHp(-1)}
            className="bg-[#5a3a28] hover:bg-[#8b6b52] text-[#f5e6c8] rounded px-3 py-1 text-xl font-bold transition-colors"
          >
            -
          </button>

          <div className="text-center">
            <div className="flex items-baseline justify-center gap-2">
              <span
                className={`text-3xl font-bold ${
                  character.currentHp <= 0
                    ? 'text-red-400'
                    : hpPercentage <= 25
                      ? 'text-orange-400'
                      : 'text-[#f5e6c8]'
                }`}
              >
                {character.currentHp}
              </span>
              <span className="text-[#8b8b9e] text-xl">/</span>
              <span className="text-3xl font-bold text-[#f5e6c8]">
                {character.maxHp}
              </span>
            </div>
            <span className="text-[#8b8b9e] text-xs">Current / Maximum</span>
          </div>

          <button
            type="button"
            onClick={() => adjustHp(1)}
            className="bg-[#5a3a28] hover:bg-[#8b6b52] text-[#f5e6c8] rounded px-3 py-1 text-xl font-bold transition-colors"
          >
            +
          </button>
        </div>

        {/* HP Number Inputs */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[#8b8b9e] text-xs block mb-1">Current HP</label>
            <input
              type="number"
              value={character.currentHp}
              onChange={(e) =>
                onChange({ currentHp: parseInt(e.target.value) || 0 })
              }
              className="w-full bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-center"
            />
          </div>
          <div>
            <label className="text-[#8b8b9e] text-xs block mb-1">Max HP</label>
            <input
              type="number"
              value={character.maxHp}
              onChange={(e) =>
                onChange({ maxHp: parseInt(e.target.value) || 1 })
              }
              min={1}
              className="w-full bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-center"
            />
          </div>
        </div>

        <p className="text-[#8b8b9e] text-xs mt-2">
          CON modifier: {formatModifier(conMod)} applied per Hit Die
        </p>
      </div>

      {/* Other Combat Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Armour Class */}
        <div className="bg-[#2a2a3e] rounded-lg p-4">
          <h3 className="text-[#c4a35a] text-sm font-semibold uppercase tracking-wider mb-3">
            Armour Class
          </h3>
          <div className="flex items-center gap-3 mb-2">
            <input
              type="number"
              value={character.armorClass}
              onChange={(e) =>
                onChange({ armorClass: parseInt(e.target.value) || 10 })
              }
              className="w-20 bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-center text-xl font-bold"
            />
            <div className="text-[#8b8b9e] text-xs">
              <p>DEX mod: {formatModifier(dexMod)}</p>
              <p>10 = unarmoured</p>
            </div>
          </div>
        </div>

        {/* Attack Bonus */}
        <div className="bg-[#2a2a3e] rounded-lg p-4">
          <h3 className="text-[#c4a35a] text-sm font-semibold uppercase tracking-wider mb-3">
            Attack Bonus
          </h3>
          <div className="flex items-center gap-3 mb-2">
            <input
              type="number"
              value={character.attackBonus}
              onChange={(e) =>
                onChange({ attackBonus: parseInt(e.target.value) || 0 })
              }
              className="w-20 bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-center text-xl font-bold"
            />
            <div className="text-[#8b8b9e] text-xs">
              <p>Melee: {formatModifier(strMod)} (STR)</p>
              <p>Missile: {formatModifier(dexMod)} (DEX)</p>
            </div>
          </div>
        </div>

        {/* Speed */}
        <div className="bg-[#2a2a3e] rounded-lg p-4">
          <h3 className="text-[#c4a35a] text-sm font-semibold uppercase tracking-wider mb-3">
            Speed
          </h3>
          <div className="flex items-center gap-3 mb-2">
            <input
              type="number"
              value={character.speed}
              onChange={(e) => {
                const speed = parseInt(e.target.value) || 0;
                onChange({
                  speed,
                  travelPointsPerDay: Math.floor(speed / 5),
                });
              }}
              step={10}
              min={0}
              className="w-20 bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-center text-xl font-bold"
            />
            <div className="text-[#8b8b9e] text-xs">
              <p>ft per round</p>
              <p>
                Travel:{' '}
                <span className="text-[#f5e6c8] font-semibold">
                  {Math.floor(character.speed / 5)}
                </span>{' '}
                pts/day
              </p>
            </div>
          </div>
        </div>

        {/* Magic Resistance */}
        <div className="bg-[#2a2a3e] rounded-lg p-4">
          <h3 className="text-[#c4a35a] text-sm font-semibold uppercase tracking-wider mb-3">
            Magic Resistance
          </h3>
          <div className="flex items-center gap-3 mb-2">
            <input
              type="number"
              value={character.magicResistance}
              onChange={(e) =>
                onChange({ magicResistance: parseInt(e.target.value) || 0 })
              }
              className="w-20 bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-center text-xl font-bold"
            />
            <div className="text-[#8b8b9e] text-xs">
              <p>WIS mod: {formatModifier(wisMod)}</p>
              <p>
                {character.magicResistance === wisMod
                  ? 'Auto from WIS'
                  : 'Manual override'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
