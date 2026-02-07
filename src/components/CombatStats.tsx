'use client';

import { Character, SaveTargets } from '@/lib/types';
import {
  getAbilityModifier,
  formatModifier,
  ARMOUR_TABLE,
  calculateAC,
  calculateAttackBonus,
  calculateSaveTargets,
  calculateMagicResistance,
  calculateMeleeModifier,
  calculateMissileModifier,
  calculateXpToNextLevel,
  getArmourRestrictionWarning,
  getSpeedBySlots,
  getSpeedByWeight,
} from '@/lib/gamedata';

interface CombatStatsProps {
  character: Character;
  onChange: (updates: Partial<Character>) => void;
}

const inputClasses =
  'bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a]';

const SAVE_LABELS: { key: keyof SaveTargets; label: string }[] = [
  { key: 'doom', label: 'Doom' },
  { key: 'ray', label: 'Ray' },
  { key: 'hold', label: 'Hold' },
  { key: 'blast', label: 'Blast' },
  { key: 'spell', label: 'Spell' },
];

// Armour options for the dropdown (exclude Shield row)
const ARMOUR_OPTIONS = ARMOUR_TABLE.filter(a => a.name !== 'Shield');

export default function CombatStats({ character, onChange }: CombatStatsProps) {
  const conMod = getAbilityModifier(character.abilityScores.constitution);

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

  // Determine if we have enough data for auto-calc
  const hasClassOrKindredClass = !!(character.class || (character.kindred && character.kindred !== 'human' && !character.class));
  const hasAutoCalcData = hasClassOrKindredClass && character.level >= 1;

  // --- AC ---
  const calcAC = calculateAC(
    character.equippedArmourName,
    character.hasShield,
    character.abilityScores.dexterity,
    character.kindred,
    character.class,
    character.level,
  );
  const acOutOfSync = calcAC.ac !== character.armorClass;
  const armourWarning = getArmourRestrictionWarning(character.class, character.equippedArmourName, character.hasShield);

  // --- Attack Bonus ---
  const calcAttack = hasAutoCalcData ? calculateAttackBonus(character.kindred, character.class, character.level) : null;
  const attackOutOfSync = calcAttack !== null && calcAttack !== character.attackBonus;
  const meleeModifier = calculateMeleeModifier(character.attackBonus, character.abilityScores.strength);
  const missileModifier = calculateMissileModifier(character.attackBonus, character.abilityScores.dexterity, character.class);

  // --- Saves ---
  const calcSaves = hasAutoCalcData ? calculateSaveTargets(character.kindred, character.class, character.level) : null;
  const savesOutOfSync = calcSaves !== null && SAVE_LABELS.some(
    s => calcSaves[s.key] !== character.saveTargets[s.key]
  );

  // --- Magic Resistance ---
  const calcMR = calculateMagicResistance(character.abilityScores.wisdom, character.kindred);
  const mrOutOfSync = calcMR.value !== character.magicResistance;

  // --- Speed ---
  const totalEquippedSlots = character.equippedItems.reduce((sum, item) => sum + item.slots, 0);
  const totalStowedSlots = character.stowedItems.reduce((sum, item) => sum + item.slots, 0);
  const totalWeight =
    character.equippedItems.reduce((sum, item) => sum + item.weight, 0) +
    character.stowedItems.reduce((sum, item) => sum + item.weight, 0);
  const calcSpeed = character.encumbranceMethod === 'slots'
    ? getSpeedBySlots(totalEquippedSlots, totalStowedSlots)
    : getSpeedByWeight(totalWeight);
  const speedOutOfSync = calcSpeed !== character.speed;

  // --- XP ---
  const calcXpNext = hasAutoCalcData ? calculateXpToNextLevel(character.kindred, character.class, character.level) : null;
  const xpNextOutOfSync = calcXpNext !== null && calcXpNext !== character.xpNextLevel;
  const xpProgress = character.xpNextLevel > 0
    ? Math.max(0, Math.min(100, (character.xp / character.xpNextLevel) * 100))
    : 0;

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

      {/* Armour Class */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h3 className="text-[#c4a35a] text-sm font-semibold uppercase tracking-wider mb-3">
          Armour Class
        </h3>

        {/* Armour Picker */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[#8b8b9e] text-xs block mb-1">Armour</label>
            <select
              value={character.equippedArmourName}
              onChange={(e) => onChange({ equippedArmourName: e.target.value })}
              className={`${inputClasses} w-full`}
            >
              {ARMOUR_OPTIONS.map(a => (
                <option key={a.name} value={a.name === 'Unarmoured' ? '' : a.name}>
                  {a.name} (AC {a.ac})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-[#f5e6c8] cursor-pointer pb-1">
              <input
                type="checkbox"
                checked={character.hasShield}
                onChange={(e) => onChange({ hasShield: e.target.checked })}
                className="accent-[#c4a35a]"
              />
              Shield (+1)
            </label>
          </div>
        </div>

        {armourWarning && (
          <p className="text-[#b33a1a] text-xs mb-2">{armourWarning}</p>
        )}

        {/* AC Display with Sync */}
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl font-bold text-[#f5e6c8]">{character.armorClass}</span>
          <div className="flex-1">
            {acOutOfSync && (
              <button
                type="button"
                onClick={() => onChange({ armorClass: calcAC.ac })}
                className="text-xs px-2 py-1 bg-[#5a3a28] text-[#c4a35a] rounded hover:bg-[#7a5a38] transition-colors"
              >
                Sync to {calcAC.ac}
              </button>
            )}
            {calcAC.notes.length > 0 && (
              <p className="text-[#8b8b9e] text-xs mt-1">{calcAC.notes.join(', ')}</p>
            )}
          </div>
        </div>

        <details>
          <summary className="text-xs text-[#f5e6c8]/40 cursor-pointer hover:text-[#f5e6c8]/60">
            Manual override
          </summary>
          <input
            type="number"
            value={character.armorClass}
            onChange={(e) => onChange({ armorClass: parseInt(e.target.value) || 10 })}
            className={`${inputClasses} w-20 text-center mt-1`}
          />
        </details>
      </div>

      {/* Attack Bonus */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h3 className="text-[#c4a35a] text-sm font-semibold uppercase tracking-wider mb-3">
          Attack Bonus
        </h3>

        <div className="flex items-center gap-3 mb-3">
          <span className="text-3xl font-bold text-[#f5e6c8]">{formatModifier(character.attackBonus)}</span>
          <div className="flex-1">
            {calcAttack !== null && attackOutOfSync && (
              <button
                type="button"
                onClick={() => onChange({ attackBonus: calcAttack })}
                className="text-xs px-2 py-1 bg-[#5a3a28] text-[#c4a35a] rounded hover:bg-[#7a5a38] transition-colors"
              >
                Sync to {formatModifier(calcAttack)}
              </button>
            )}
          </div>
        </div>

        {/* Derived melee/missile modifiers */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-[#1a1a2e] rounded p-2 text-center">
            <span className="text-[#8b8b9e] text-xs block">Melee</span>
            <span className="text-[#f5e6c8] font-bold">{formatModifier(meleeModifier)}</span>
            <span className="text-[#8b8b9e] text-xs block">ATK {formatModifier(character.attackBonus)} + STR {formatModifier(getAbilityModifier(character.abilityScores.strength))}</span>
          </div>
          <div className="bg-[#1a1a2e] rounded p-2 text-center">
            <span className="text-[#8b8b9e] text-xs block">Missile</span>
            <span className="text-[#f5e6c8] font-bold">{formatModifier(missileModifier)}</span>
            <span className="text-[#8b8b9e] text-xs block">
              ATK {formatModifier(character.attackBonus)} + DEX {formatModifier(getAbilityModifier(character.abilityScores.dexterity))}
              {character.class === 'hunter' ? ' +1 Hunter' : ''}
            </span>
          </div>
        </div>

        <details className="mt-2">
          <summary className="text-xs text-[#f5e6c8]/40 cursor-pointer hover:text-[#f5e6c8]/60">
            Manual override
          </summary>
          <input
            type="number"
            value={character.attackBonus}
            onChange={(e) => onChange({ attackBonus: parseInt(e.target.value) || 0 })}
            className={`${inputClasses} w-20 text-center mt-1`}
          />
        </details>
      </div>

      {/* Saving Throws */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[#c4a35a] text-sm font-semibold uppercase tracking-wider">
            Saving Throws
          </h3>
          {calcSaves && savesOutOfSync && (
            <button
              type="button"
              onClick={() => onChange({ saveTargets: calcSaves })}
              className="text-xs px-2 py-1 bg-[#5a3a28] text-[#c4a35a] rounded hover:bg-[#7a5a38] transition-colors"
            >
              Sync All
            </button>
          )}
        </div>

        <div className="grid grid-cols-5 gap-2">
          {SAVE_LABELS.map(s => {
            const stored = character.saveTargets[s.key];
            const calc = calcSaves?.[s.key];
            const isOff = calc !== undefined && calc !== stored;
            return (
              <div key={s.key} className="bg-[#1a1a2e] rounded p-2 text-center">
                <span className="text-[#8b8b9e] text-xs block">{s.label}</span>
                <span className={`text-lg font-bold ${isOff ? 'text-[#c4a35a]' : 'text-[#f5e6c8]'}`}>
                  {stored}
                </span>
                {isOff && calc !== undefined && (
                  <span className="text-[#8b8b9e] text-xs block">{calc}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Save-related notes */}
        {character.kindred && (
          <div className="text-[#8b8b9e] text-xs mt-2 space-y-1">
            {(character.kindred === 'elf' || character.kindred === 'grimalkin') && (
              <p>+2 to saves vs magic (Fairy heritage)</p>
            )}
            {character.kindred === 'mossling' && (
              <p>+2 to all saves (+4 vs fungal effects)</p>
            )}
            {calcMR.value !== 0 && (
              <p>Magic Resistance {formatModifier(calcMR.value)} applies to saves vs magic</p>
            )}
          </div>
        )}

        <details className="mt-2">
          <summary className="text-xs text-[#f5e6c8]/40 cursor-pointer hover:text-[#f5e6c8]/60">
            Manual override
          </summary>
          <div className="grid grid-cols-5 gap-2 mt-1">
            {SAVE_LABELS.map(s => (
              <div key={s.key}>
                <label className="text-[#8b8b9e] text-xs block text-center">{s.label}</label>
                <input
                  type="number"
                  value={character.saveTargets[s.key]}
                  onChange={(e) => onChange({
                    saveTargets: { ...character.saveTargets, [s.key]: parseInt(e.target.value) || 0 }
                  })}
                  className={`${inputClasses} w-full text-center text-sm`}
                />
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* Bottom Row: Magic Resistance, Speed, XP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Magic Resistance */}
        <div className="bg-[#2a2a3e] rounded-lg p-4">
          <h3 className="text-[#c4a35a] text-sm font-semibold uppercase tracking-wider mb-3">
            Magic Resistance
          </h3>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl font-bold text-[#f5e6c8]">{formatModifier(character.magicResistance)}</span>
            <div className="flex-1">
              {mrOutOfSync && (
                <button
                  type="button"
                  onClick={() => onChange({ magicResistance: calcMR.value })}
                  className="text-xs px-2 py-1 bg-[#5a3a28] text-[#c4a35a] rounded hover:bg-[#7a5a38] transition-colors"
                >
                  Sync to {formatModifier(calcMR.value)}
                </button>
              )}
              {calcMR.notes.length > 0 && (
                <p className="text-[#8b8b9e] text-xs mt-1">{calcMR.notes.join(', ')}</p>
              )}
            </div>
          </div>
          <details>
            <summary className="text-xs text-[#f5e6c8]/40 cursor-pointer hover:text-[#f5e6c8]/60">
              Manual override
            </summary>
            <input
              type="number"
              value={character.magicResistance}
              onChange={(e) => onChange({ magicResistance: parseInt(e.target.value) || 0 })}
              className={`${inputClasses} w-20 text-center mt-1`}
            />
          </details>
        </div>

        {/* Speed & Travel */}
        <div className="bg-[#2a2a3e] rounded-lg p-4">
          <h3 className="text-[#c4a35a] text-sm font-semibold uppercase tracking-wider mb-3">
            Speed &amp; Travel
          </h3>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl font-bold text-[#f5e6c8]">{character.speed}</span>
            <div className="flex-1">
              <p className="text-[#8b8b9e] text-xs">ft/round ({character.encumbranceMethod})</p>
              <p className="text-[#8b8b9e] text-xs">
                Travel: <span className="text-[#f5e6c8] font-semibold">{Math.floor(character.speed / 5)}</span> pts/day
              </p>
              {speedOutOfSync && (
                <button
                  type="button"
                  onClick={() => onChange({ speed: calcSpeed, travelPointsPerDay: Math.floor(calcSpeed / 5) })}
                  className="text-xs px-2 py-1 bg-[#5a3a28] text-[#c4a35a] rounded hover:bg-[#7a5a38] transition-colors mt-1"
                >
                  Sync to {calcSpeed} ft
                </button>
              )}
            </div>
          </div>
          <p className="text-[#8b8b9e] text-xs">Speed is calculated from encumbrance on the Inventory tab.</p>
          <details className="mt-1">
            <summary className="text-xs text-[#f5e6c8]/40 cursor-pointer hover:text-[#f5e6c8]/60">
              Manual override
            </summary>
            <input
              type="number"
              value={character.speed}
              onChange={(e) => {
                const speed = parseInt(e.target.value) || 0;
                onChange({ speed, travelPointsPerDay: Math.floor(speed / 5) });
              }}
              step={10}
              min={0}
              className={`${inputClasses} w-20 text-center mt-1`}
            />
          </details>
        </div>
      </div>

      {/* XP Progress */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h3 className="text-[#c4a35a] text-sm font-semibold uppercase tracking-wider mb-3">
          XP Progress
        </h3>

        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <label className="text-[#8b8b9e] text-xs block mb-1">Current XP</label>
            <input
              type="number"
              value={character.xp}
              onChange={(e) => onChange({ xp: parseInt(e.target.value) || 0 })}
              min={0}
              className={`${inputClasses} w-full text-center`}
            />
          </div>
          <div>
            <label className="text-[#8b8b9e] text-xs block mb-1">XP to Next Level</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={character.xpNextLevel}
                onChange={(e) => onChange({ xpNextLevel: parseInt(e.target.value) || 0 })}
                min={0}
                className={`${inputClasses} w-full text-center`}
              />
              {calcXpNext !== null && xpNextOutOfSync && (
                <button
                  type="button"
                  onClick={() => onChange({ xpNextLevel: calcXpNext })}
                  className="text-xs px-2 py-1 bg-[#5a3a28] text-[#c4a35a] rounded hover:bg-[#7a5a38] transition-colors shrink-0"
                >
                  Sync
                </button>
              )}
            </div>
          </div>
        </div>

        {/* XP Progress Bar */}
        {character.xpNextLevel > 0 && (
          <div className="mb-2">
            <div className="bg-[#1a1a2e] rounded-full h-4 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 bg-[#c4a35a]"
                style={{ width: `${xpProgress}%` }}
              />
            </div>
            <p className="text-[#8b8b9e] text-xs mt-1 text-center">
              {character.xp.toLocaleString()} / {character.xpNextLevel.toLocaleString()} XP ({Math.floor(xpProgress)}%)
            </p>
          </div>
        )}
        {calcXpNext === null && hasAutoCalcData && (
          <p className="text-[#8b8b9e] text-xs">Maximum level reached.</p>
        )}

        {character.xpModifier !== 0 && (
          <p className="text-[#8b8b9e] text-xs">
            XP modifier: {character.xpModifier > 0 ? '+' : ''}{character.xpModifier}% (set on Character Info tab)
          </p>
        )}
      </div>
    </div>
  );
}
