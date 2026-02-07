'use client';

import { useState } from 'react';
import { Character } from '@/lib/types';
import { getCharacterLanguages } from '@/lib/gamedata';

interface TraitsAndNotesProps {
  character: Character;
  onChange: (updates: Partial<Character>) => void;
}

const inputClasses =
  'w-full bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a]';

const labelClasses = 'block text-[#c4a35a] text-sm font-semibold mb-1';

const sectionHeadingClasses =
  'text-lg font-bold text-[#c4a35a] mb-2 border-b border-[#5a3a28] pb-1';

const chipClasses =
  'inline-flex items-center gap-1 bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded-full px-2 py-0.5 text-xs';

export default function TraitsAndNotes({ character, onChange }: TraitsAndNotesProps) {
  const [bonusLangValue, setBonusLangValue] = useState('');

  const langInfo = getCharacterLanguages(
    character.kindred,
    character.class,
    character.abilityScores.intelligence,
  );

  // Parse current languages string to figure out bonus languages
  const currentLangs = character.languages
    .split(',')
    .map(l => l.trim())
    .filter(Boolean);

  const requiredLangs = [...langInfo.nativeLanguages, ...langInfo.classLanguages];
  const bonusLangs = currentLangs.filter(l => !requiredLangs.includes(l));
  const bonusUsed = bonusLangs.length;

  // Filter available languages to exclude already-known
  const allKnown = new Set(currentLangs);
  const availableCommon = langInfo.availableCommon.filter(l => !allKnown.has(l));
  const availableObscure = langInfo.availableObscure.filter(l => !allKnown.has(l));

  const handleAddBonusLang = (lang: string) => {
    if (!lang || allKnown.has(lang)) return;
    const newLangs = [...currentLangs, lang].join(', ');
    onChange({ languages: newLangs });
    setBonusLangValue('');
  };

  const handleRemoveBonusLang = (lang: string) => {
    const newLangs = currentLangs.filter(l => l !== lang).join(', ');
    onChange({ languages: newLangs });
  };

  return (
    <div className="bg-[#2a2a3e] rounded-lg p-4">
      <h2 className="text-[#c4a35a] text-xl font-bold mb-4 border-b border-[#5a3a28] pb-2">
        Traits & Notes
      </h2>

      <div className="space-y-4">
        {/* Class Traits */}
        <div>
          <h3 className={sectionHeadingClasses}>Class Traits</h3>
          <textarea
            value={character.classTraits}
            onChange={(e) => onChange({ classTraits: e.target.value })}
            placeholder="Class abilities, features, and special traits..."
            rows={6}
            className={`${inputClasses} resize-y`}
          />
        </div>

        {/* Kindred Traits */}
        <div>
          <h3 className={sectionHeadingClasses}>Kindred Traits</h3>
          <textarea
            value={character.kindredTraits}
            onChange={(e) => onChange({ kindredTraits: e.target.value })}
            placeholder="Kindred abilities, innate traits, and racial features..."
            rows={6}
            className={`${inputClasses} resize-y`}
          />
        </div>

        {/* Languages - Structured */}
        <div>
          <h3 className={sectionHeadingClasses}>Languages</h3>

          {/* Native Languages */}
          {langInfo.nativeLanguages.length > 0 && (
            <div className="mb-2">
              <label className={labelClasses}>Native Languages</label>
              <div className="flex flex-wrap gap-1">
                {langInfo.nativeLanguages.map(lang => (
                  <span key={lang} className={chipClasses}>
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Class Languages */}
          {langInfo.classLanguages.length > 0 && (
            <div className="mb-2">
              <label className={labelClasses}>Class Languages</label>
              <div className="flex flex-wrap gap-1">
                {langInfo.classLanguages.map(lang => (
                  <span key={lang} className={chipClasses}>
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Bonus Languages */}
          <div className="mb-2">
            <label className={labelClasses}>
              Bonus Languages
              <span className="text-[#f5e6c8]/40 font-normal ml-1">
                ({bonusUsed} of {langInfo.bonusSlots} slots used)
              </span>
            </label>

            {bonusLangs.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {bonusLangs.map(lang => (
                  <span key={lang} className={chipClasses}>
                    {lang}
                    <button
                      type="button"
                      onClick={() => handleRemoveBonusLang(lang)}
                      className="ml-0.5 text-red-400 hover:text-red-300"
                      aria-label={`Remove ${lang}`}
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            )}

            {langInfo.bonusSlots > 0 && bonusUsed < langInfo.bonusSlots && (
              <div className="flex items-center gap-2">
                <select
                  value={bonusLangValue}
                  onChange={(e) => {
                    if (e.target.value) handleAddBonusLang(e.target.value);
                  }}
                  className={`${inputClasses} max-w-xs`}
                >
                  <option value="">-- Add Language --</option>
                  {availableCommon.length > 0 && (
                    <optgroup label="Common">
                      {availableCommon.map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </optgroup>
                  )}
                  {availableObscure.length > 0 && (
                    <optgroup label="Obscure">
                      {availableObscure.map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            )}

            {langInfo.bonusSlots === 0 && (
              <p className="text-[#f5e6c8]/40 text-xs italic">
                INT modifier does not grant bonus languages.
              </p>
            )}
          </div>

          {/* Raw languages display for reference */}
          <details className="mt-1">
            <summary className="text-xs text-[#f5e6c8]/40 cursor-pointer hover:text-[#f5e6c8]/60">
              Edit raw
            </summary>
            <input
              type="text"
              value={character.languages}
              onChange={(e) => onChange({ languages: e.target.value })}
              placeholder="Common, Sylvan, Woldish..."
              className={`${inputClasses} mt-1`}
            />
          </details>
        </div>

        {/* Combat Talents */}
        <div>
          <h3 className={sectionHeadingClasses}>Combat Talents</h3>
          <textarea
            value={character.combatTalents}
            onChange={(e) => onChange({ combatTalents: e.target.value })}
            placeholder="Special combat abilities, weapon proficiencies, fighting styles..."
            rows={4}
            className={`${inputClasses} resize-y`}
          />
        </div>

        {/* Other Notes */}
        <div>
          <h3 className={sectionHeadingClasses}>Other Notes</h3>
          <textarea
            value={character.otherNotes}
            onChange={(e) => onChange({ otherNotes: e.target.value })}
            placeholder="Any other notes, allies, enemies, backstory details..."
            rows={6}
            className={`${inputClasses} resize-y`}
          />
        </div>
      </div>
    </div>
  );
}
