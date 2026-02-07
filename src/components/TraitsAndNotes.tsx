'use client';

import { Character } from '@/lib/types';

interface TraitsAndNotesProps {
  character: Character;
  onChange: (updates: Partial<Character>) => void;
}

const inputClasses =
  'w-full bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a]';

const labelClasses = 'block text-[#c4a35a] text-sm font-semibold mb-1';

const sectionHeadingClasses =
  'text-lg font-bold text-[#c4a35a] mb-2 border-b border-[#5a3a28] pb-1';

export default function TraitsAndNotes({ character, onChange }: TraitsAndNotesProps) {
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

        {/* Languages */}
        <div>
          <h3 className={sectionHeadingClasses}>Languages</h3>
          <input
            type="text"
            value={character.languages}
            onChange={(e) => onChange({ languages: e.target.value })}
            placeholder="Common, Sylvan, Woldish..."
            className={inputClasses}
          />
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
