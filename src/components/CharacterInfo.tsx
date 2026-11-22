'use client';

import { useState } from 'react';
import { Character, CharacterUpdater, KindredId, ClassId } from '@/lib/types';
import {
  KINDREDS,
  isKnownClassId,
  isKnownKindredId,
  MOON_SIGNS,
  ALIGNMENTS,
  getAvailableClasses,
  calculateXpModifier,
  getAlignmentWarning,
  canHaveMoonSign,
  MOON_PHASES,
  STARTING_EQUIPMENT,
  rollD6,
  getCharacterLanguages,
} from '@/lib/gamedata';
import { formatXpPercent } from '@/lib/character-sheet';
import { withIndefiniteArticle } from '@/lib/grammar';

interface CharacterInfoProps {
  character: Character;
  onChange: (updates: CharacterUpdater) => void;
}

const inputClasses =
  'w-full bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a] placeholder:text-[#9c948b]';

const labelClasses = 'block text-[#c4a35a] text-sm font-semibold mb-1';

export default function CharacterInfo({ character, onChange }: CharacterInfoProps) {
  const [equipOpen, setEquipOpen] = useState(false);
  const [equipResults, setEquipResults] = useState<{ armour?: string; weapons: string[] } | null>(null);
  const [xpOverrideOpen, setXpOverrideOpen] = useState(false);

  const selectedKindred = KINDREDS.find((k) => k.id === character.kindred);
  const availableClasses = getAvailableClasses(character.kindred);
  const selectedClassEntry = availableClasses.find((c) => c.class.id === character.class);
  // Ids the app doesn't know (e.g. from a hand-edited save) stay as stored; the
  // dropdowns show them, and nothing is calculated from them.
  const isUnknownKindred = !!character.kindred && !isKnownKindredId(character.kindred);
  const isUnknownClass = !!character.class && !isKnownClassId(character.class);

  // null when there's nothing to calculate from; the stored modifier then stands.
  const calculated = calculateXpModifier(character.class, character.kindred, character.abilityScores);
  const xpOutOfSync = calculated !== null && character.xpModifier !== calculated.total;

  const alignmentWarning = getAlignmentWarning(character.class, character.alignment);
  const hasMoonSign = canHaveMoonSign(character.kindred);
  // The visible "Moon Sign" label names whichever moon sign control is shown.
  const moonSignId = 'character-info-moon-sign';

  function buildLanguageString(kindredId: KindredId | '', classId: ClassId | '', currentLanguages: string): string {
    const info = getCharacterLanguages(kindredId, classId, 10);
    const required = [...info.nativeLanguages, ...info.classLanguages];

    // Preserve any bonus languages the user previously added
    const current = currentLanguages.split(',').map(l => l.trim()).filter(Boolean);
    const bonus = current.filter(l => !required.includes(l));

    return [...required, ...bonus].join(', ');
  }

  const handleKindredChange = (kindred: Character['kindred']) => {
    const newAvailable = getAvailableClasses(kindred);
    // A class id the app doesn't know is kept: it's never renamed or dropped.
    const classStillValid = !character.class || isUnknownClass || newAvailable.some(c => c.class.id === character.class);
    const effectiveClass = classStillValid ? character.class : '';

    const newXp = calculateXpModifier(effectiveClass, kindred, character.abilityScores);
    const fairy = !canHaveMoonSign(kindred);

    const newLanguages = buildLanguageString(kindred, effectiveClass, character.languages);

    onChange({
      kindred,
      ...(classStillValid ? {} : { class: '' as const }),
      ...(newXp ? { xpModifier: newXp.total } : {}),
      ...(fairy ? { moonSign: '', moonPhase: '' as const } : {}),
      languages: newLanguages,
    });
  };

  const handleClassChange = (classId: Character['class']) => {
    const newXp = calculateXpModifier(classId, character.kindred, character.abilityScores);
    const newLanguages = buildLanguageString(character.kindred, classId, character.languages);

    onChange({
      class: classId,
      ...(newXp ? { xpModifier: newXp.total } : {}),
      languages: newLanguages,
    });
  };

  const handleRollEquipment = () => {
    if (!isKnownClassId(character.class)) return;
    const table = STARTING_EQUIPMENT[character.class];
    // Roll armour
    const armourRoll = rollD6();
    const armourEntry = table.armour.find(e => e.roll.includes(armourRoll));
    // Roll weapons
    const weapons: string[] = [];
    for (let i = 0; i < table.weaponRolls; i++) {
      const wRoll = rollD6();
      const wEntry = table.weapons.find(e => e.roll.includes(wRoll));
      weapons.push(`[${wRoll}] ${wEntry?.result ?? 'Unknown'}`);
    }
    setEquipResults({
      armour: `[${armourRoll}] ${armourEntry?.result ?? 'Unknown'}`,
      weapons,
    });
  };

  const equipTable = isKnownClassId(character.class) ? STARTING_EQUIPMENT[character.class] : null;
  const isSmallKindred = selectedKindred?.size === 'Small';

  return (
    <div className="bg-[#2a2a3e] rounded-lg p-4">
      <h2 className="text-[#c4a35a] text-xl font-bold mb-4 border-b border-[#5a3a28] pb-2">
        Character Info
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Name */}
        <div>
          <label htmlFor="character-info-name" className={labelClasses}>Name</label>
          <input
            id="character-info-name"
            type="text"
            value={character.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Enter character name"
            className={inputClasses}
          />
        </div>

        {/* Level */}
        <div>
          <label htmlFor="character-info-level" className={labelClasses}>Level</label>
          <input
            id="character-info-level"
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
          <label htmlFor="character-info-kindred" className={labelClasses}>Kindred</label>
          <select
            id="character-info-kindred"
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
            {isUnknownKindred && (
              <option value={character.kindred}>{character.kindred} (unknown kindred)</option>
            )}
          </select>
          {selectedKindred && (
            <p className="text-[#f5e6c8]/60 text-xs mt-1 italic">
              {selectedKindred.description}
            </p>
          )}
          {isUnknownKindred && (
            <p className="text-yellow-400 text-xs mt-1">
              Dolmen Spot doesn&apos;t recognise this kindred, so it can&apos;t calculate kindred-based values. Choose a kindred from the list.
            </p>
          )}
        </div>

        {/* Class */}
        <div>
          <label htmlFor="character-info-class" className={labelClasses}>
            Class
            {character.kindred === 'human' ? (
              <span className="text-red-400 font-normal ml-1">(required)</span>
            ) : (
              <span className="text-[#9c948b] font-normal ml-1">(optional)</span>
            )}
          </label>
          <select
            id="character-info-class"
            value={character.class}
            onChange={(e) => handleClassChange(e.target.value as Character['class'])}
            className={inputClasses}
          >
            <option value="">-- Kindred-Class (no separate class) --</option>
            {availableClasses.map(({ class: c, restriction }) => (
              <option key={c.id} value={c.id}>
                {c.name}{restriction === 'rare' ? ' (rare)' : ''}
              </option>
            ))}
            {isUnknownClass && (
              <option value={character.class}>{character.class} (unknown class)</option>
            )}
          </select>
          {isUnknownClass ? (
            <p className="text-yellow-400 text-xs mt-1">
              Dolmen Spot doesn&apos;t recognise this class, so it can&apos;t calculate class-based values. Choose a class from the list.
            </p>
          ) : selectedClassEntry ? (
            <p className="text-[#f5e6c8]/60 text-xs mt-1 italic">
              {selectedClassEntry.class.description}
              {selectedClassEntry.restriction === 'rare' && (
                <span className="text-[#c4a35a]"> — Unusual combination for this kindred.</span>
              )}
            </p>
          ) : character.kindred === 'human' && !character.class ? (
            <p className="text-red-400 text-xs mt-1">
              Humans must select a class.
            </p>
          ) : selectedKindred && !character.class ? (
            // Only a known kindred has a kindred-class (an unknown one gets its own note above).
            <p className="text-[#f5e6c8]/60 text-xs mt-1 italic">
              Playing as {withIndefiniteArticle(selectedKindred.name)} kindred-class (see appendix).
            </p>
          ) : null}
        </div>

        {/* Background */}
        <div>
          <label htmlFor="character-info-background" className={labelClasses}>Background</label>
          <input
            id="character-info-background"
            type="text"
            value={character.background}
            onChange={(e) => onChange({ background: e.target.value })}
            placeholder="Enter background"
            className={inputClasses}
          />
        </div>

        {/* Alignment */}
        <div>
          <label htmlFor="character-info-alignment" className={labelClasses}>Alignment</label>
          <select
            id="character-info-alignment"
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
          {alignmentWarning && (
            <p className={`text-xs mt-1 ${
              alignmentWarning.severity === 'warning'
                ? 'text-yellow-400'
                : 'text-[#a1988f] italic'
            }`}>
              {alignmentWarning.text}
            </p>
          )}
        </div>

        {/* Affiliation */}
        <div>
          <label htmlFor="character-info-affiliation" className={labelClasses}>Affiliation</label>
          <input
            id="character-info-affiliation"
            type="text"
            value={character.affiliation}
            onChange={(e) => onChange({ affiliation: e.target.value })}
            placeholder="Enter affiliation"
            className={inputClasses}
          />
        </div>

        {/* Moon Sign & Phase */}
        <div>
          <label htmlFor={moonSignId} className={labelClasses}>Moon Sign</label>
          {hasMoonSign ? (
            <div className="grid grid-cols-2 gap-2">
              <select
                id={moonSignId}
                value={character.moonSign}
                onChange={(e) => onChange({ moonSign: e.target.value })}
                className={inputClasses}
              >
                <option value="">-- Sign --</option>
                {MOON_SIGNS.map((sign) => (
                  <option key={sign} value={sign}>
                    {sign}
                  </option>
                ))}
              </select>
              <select
                value={character.moonPhase}
                onChange={(e) => onChange({ moonPhase: e.target.value as Character['moonPhase'] })}
                className={inputClasses}
                aria-label="Moon phase"
              >
                <option value="">-- Phase --</option>
                {MOON_PHASES.map((phase) => (
                  <option key={phase} value={phase.toLowerCase()}>
                    {phase}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <select
                id={moonSignId}
                value=""
                disabled
                className={`${inputClasses} opacity-50 cursor-not-allowed`}
              >
                <option value="">-- N/A --</option>
              </select>
              <p className="text-[#a1988f] text-xs mt-1 italic">
                Fairies cannot have moon signs.
              </p>
            </div>
          )}
        </div>

        {/* XP / Next Level XP */}
        <div>
          <label htmlFor="character-info-xp" className={labelClasses}>XP / Next Level XP</label>
          <div className="flex gap-2 items-center">
            <input
              id="character-info-xp"
              type="number"
              min={0}
              value={character.xp}
              onChange={(e) => onChange({ xp: parseInt(e.target.value) || 0 })}
              placeholder="Current XP"
              className={inputClasses}
            />
            <span className="text-[#9c948b] shrink-0">/</span>
            <input
              type="number"
              min={0}
              value={character.xpNextLevel}
              onChange={(e) => onChange({ xpNextLevel: parseInt(e.target.value) || 0 })}
              placeholder="Next Level"
              className={inputClasses}
              aria-label="Next Level"
            />
          </div>
        </div>

        {/* XP Modifier */}
        <div>
          {/* Calculated, the override field lives in a collapsed <details>; a
              label pointing into it would name nothing until it is opened, so
              the heading is plain text and the override gets its own label. */}
          {calculated ? (
            <span className={labelClasses}>XP Modifier</span>
          ) : (
            <label htmlFor="character-info-xp-modifier" className={labelClasses}>XP Modifier</label>
          )}
          {calculated ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-[#f5e6c8]">
                <span className="bg-[#1a1a2e] border border-[#5a3a28] rounded px-2 py-1">
                  Prime: {formatXpPercent(calculated.primeBonus)}
                </span>
                {calculated.humanBonus > 0 && (
                  <>
                    <span className="text-[#9c948b]">+</span>
                    <span className="bg-[#1a1a2e] border border-[#5a3a28] rounded px-2 py-1">
                      Human: {formatXpPercent(calculated.humanBonus)}
                    </span>
                  </>
                )}
                <span className="text-[#9c948b]">=</span>
                <span className={`font-bold text-lg ${
                  calculated.total > 0 ? 'text-green-400' : calculated.total < 0 ? 'text-red-400' : 'text-[#f5e6c8]'
                }`}>
                  {formatXpPercent(calculated.total)}
                </span>
              </div>

              {xpOutOfSync && (
                <button
                  type="button"
                  onClick={() => onChange({ xpModifier: calculated.total })}
                  className="text-xs px-2 py-1 bg-[#5a3a28] text-[#dbc07a] rounded hover:bg-[#4a2f20] transition-colors"
                >
                  Sync to {formatXpPercent(calculated.total)}
                </button>
              )}

              <details
                open={xpOverrideOpen}
                onToggle={(e) => setXpOverrideOpen((e.target as HTMLDetailsElement).open)}
              >
                <summary className="text-xs text-[#9c948b] cursor-pointer hover:text-[#f5e6c8]/60">
                  Manual override
                </summary>
                <label htmlFor="character-info-xp-modifier" className="block text-[#f5e6c8]/60 text-xs mt-1">
                  Manual XP modifier
                </label>
                <input
                  id="character-info-xp-modifier"
                  type="number"
                  value={character.xpModifier}
                  onChange={(e) => onChange({ xpModifier: parseInt(e.target.value) || 0 })}
                  className={inputClasses}
                />
              </details>
            </div>
          ) : (
            // Same id as the override above: only one of the two branches renders.
            <input
              id="character-info-xp-modifier"
              type="number"
              value={character.xpModifier}
              onChange={(e) => onChange({ xpModifier: parseInt(e.target.value) || 0 })}
              className={inputClasses}
            />
          )}
        </div>
      </div>

      {/* Starting Equipment Roller */}
      {equipTable && (
        <details
          open={equipOpen}
          onToggle={(e) => setEquipOpen((e.target as HTMLDetailsElement).open)}
          className="mt-4 border border-[#5a3a28] rounded-lg"
        >
          <summary className="cursor-pointer px-3 py-2 text-[#c4a35a] text-sm font-semibold hover:bg-[#1a1a2e]/50 rounded-lg">
            Starting Equipment
          </summary>
          <div className="p-3 space-y-3">
            {/* Armour table */}
            <div>
              <h4 className="text-xs font-semibold text-[#c4a35a] uppercase mb-1">
                Armour (d6)
              </h4>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 text-xs">
                {equipTable.armour.map((entry, i) => (
                  <div key={i} className="bg-[#1a1a2e] border border-[#5a3a28] rounded px-2 py-1 text-center">
                    <span className="text-[#c4a35a]">{entry.roll.join('-')}</span>
                    <br />
                    <span className="text-[#f5e6c8]">{entry.result}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Weapons table */}
            <div>
              <h4 className="text-xs font-semibold text-[#c4a35a] uppercase mb-1">
                Weapons (d6{equipTable.weaponRolls > 1 ? ` x${equipTable.weaponRolls}` : ''})
              </h4>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 text-xs">
                {equipTable.weapons.map((entry, i) => (
                  <div key={i} className="bg-[#1a1a2e] border border-[#5a3a28] rounded px-2 py-1 text-center">
                    <span className="text-[#c4a35a]">{entry.roll.join('-')}</span>
                    <br />
                    <span className="text-[#f5e6c8]">{entry.result}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Class items */}
            {equipTable.classItems.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[#c4a35a] uppercase mb-1">
                  Class Items
                </h4>
                <p className="text-xs text-[#f5e6c8]">
                  {equipTable.classItems.join(', ')}
                </p>
              </div>
            )}

            {/* Small kindred notes */}
            {isSmallKindred && equipTable.smallKindredNotes && (
              <p className="text-xs text-yellow-400/80 italic">
                {equipTable.smallKindredNotes}
              </p>
            )}

            {/* Roll button & results */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleRollEquipment}
                className="text-sm px-3 py-1 bg-[#5a3a28] text-[#dbc07a] rounded hover:bg-[#4a2f20] transition-colors font-semibold"
              >
                Roll All
              </button>
              {equipResults && (
                <div className="text-xs text-[#f5e6c8] space-y-0.5">
                  <div>Armour: <span className="text-[#c4a35a]">{equipResults.armour}</span></div>
                  {equipResults.weapons.map((w, i) => (
                    <div key={i}>Weapon {i + 1}: <span className="text-[#c4a35a]">{w}</span></div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
