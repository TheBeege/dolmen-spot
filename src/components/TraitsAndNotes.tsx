'use client';

import { useState } from 'react';
import { Character, CharacterUpdater, Retainer, Trophy } from '@/lib/types';
import {
  getCharacterLanguages,
  getCharacterFeatureProfile,
  getAbilityModifier,
  BREGGLE_HORN_PROGRESSION,
  BREGGLE_GAZE_PER_DAY,
  GRIMALKIN_FORMS,
  MAD_REVELRY_MELODIES,
  FIGHTER_COMBAT_TALENTS,
  getFighterTalentCount,
  CLERIC_HOLY_ORDERS,
  TURNING_UNDEAD_TABLE,
  NOBLE_HOUSES,
  SYMBIOTIC_FLESH_TABLE,
} from '@/lib/gamedata';

interface TraitsAndNotesProps {
  character: Character;
  onChange: (updates: CharacterUpdater) => void;
}

const inputClasses =
  'w-full bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a]';

const labelClasses = 'block text-[#c4a35a] text-sm font-semibold mb-1';

const sectionHeadingClasses =
  'text-lg font-bold text-[#c4a35a] mb-2 border-b border-[#5a3a28] pb-1';

const chipClasses =
  'inline-flex items-center gap-1 bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded-full px-2 py-0.5 text-xs';

const btnClasses =
  'px-2 py-1 text-xs rounded border border-[#5a3a28] bg-[#1a1a2e] text-[#c4a35a] hover:bg-[#3a3a4e] disabled:opacity-40 disabled:cursor-not-allowed';

const cardClasses =
  'bg-[#1a1a2e] border border-[#5a3a28] rounded p-3 mb-2';

// ── Fighter Combat Talents ─────────────────────────────────

function FighterTalents({ character, onChange }: TraitsAndNotesProps) {
  const totalSlots = getFighterTalentCount(character.level);
  const selections = character.selectedCombatTalents;

  const updateTalent = (index: number, talentId: string) => {
    const next = [...selections];
    next[index] = { talentId, specification: '' };
    onChange({ selectedCombatTalents: next });
  };

  const updateSpec = (index: number, specification: string) => {
    const next = [...selections];
    next[index] = { ...next[index], specification };
    onChange({ selectedCombatTalents: next });
  };

  // Ensure array is the right length
  while (selections.length < totalSlots) {
    selections.push({ talentId: '', specification: '' });
  }

  if (totalSlots === 0) {
    return (
      <div className={cardClasses}>
        <p className="text-[#f5e6c8]/50 text-sm italic">Combat talents unlock at Level 2.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {selections.slice(0, totalSlots).map((sel, i) => {
        const talent = FIGHTER_COMBAT_TALENTS.find(t => t.id === sel.talentId);
        const needsSpec = sel.talentId === 'slayer' || sel.talentId === 'weapon-specialist';
        return (
          <div key={i} className={cardClasses}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[#c4a35a] text-xs font-semibold">Slot {i + 1}</span>
              <select
                value={sel.talentId}
                onChange={(e) => updateTalent(i, e.target.value)}
                className={`${inputClasses} max-w-xs text-sm`}
              >
                <option value="">-- Select Talent --</option>
                {FIGHTER_COMBAT_TALENTS.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            {talent && (
              <p className="text-[#f5e6c8]/60 text-xs mb-1">{talent.description}</p>
            )}
            {needsSpec && (
              <input
                type="text"
                value={sel.specification}
                onChange={(e) => updateSpec(i, e.target.value)}
                placeholder={sel.talentId === 'slayer' ? 'Creature type...' : 'Weapon type...'}
                className={`${inputClasses} text-sm mt-1`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Cleric/Friar Turning Undead ────────────────────────────

function TurningUndead() {
  const [undeadHD, setUndeadHD] = useState('');

  return (
    <div className={cardClasses}>
      <label className={labelClasses}>Turning the Undead</label>
      <p className="text-[#f5e6c8]/50 text-xs mb-2">
        Present holy symbol, roll 2d6 within 30&apos;. {TURNING_UNDEAD_TABLE.frequency}.
      </p>
      <div className="flex items-center gap-2 mb-2">
        <label className="text-[#f5e6c8]/60 text-xs">Undead HD:</label>
        <input
          type="number"
          value={undeadHD}
          onChange={(e) => setUndeadHD(e.target.value)}
          className={`${inputClasses} w-16 text-sm`}
          min={1}
        />
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs">
        {TURNING_UNDEAD_TABLE.results.map(r => (
          <div key={r.range} className="flex justify-between bg-[#2a2a3e] rounded px-2 py-1">
            <span className="text-[#c4a35a] font-semibold">{r.range}</span>
            <span className="text-[#f5e6c8]/80">{r.effect}</span>
          </div>
        ))}
      </div>
      <p className="text-[#f5e6c8]/40 text-xs mt-1">
        {TURNING_UNDEAD_TABLE.levelModifier}
      </p>
    </div>
  );
}

// ── Cleric Holy Order ──────────────────────────────────────

function HolyOrderSelector({ character, onChange }: TraitsAndNotesProps) {
  if (character.level < 2) {
    return (
      <div className={cardClasses}>
        <p className="text-[#f5e6c8]/50 text-sm italic">Holy orders are available at Level 2+.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {CLERIC_HOLY_ORDERS.map(order => {
        const selected = character.holyOrder === order.id;
        return (
          <button
            key={order.id}
            type="button"
            onClick={() => onChange({ holyOrder: selected ? '' : order.id })}
            className={`w-full text-left ${cardClasses} cursor-pointer transition-colors ${selected ? 'border-[#c4a35a] bg-[#2a2a3e]' : 'hover:border-[#c4a35a]/50'}`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full border ${selected ? 'bg-[#c4a35a] border-[#c4a35a]' : 'border-[#5a3a28]'}`} />
              <span className="text-[#c4a35a] font-semibold text-sm">{order.name}</span>
              <span className="text-[#f5e6c8]/40 text-xs">({order.title})</span>
            </div>
            <p className="text-[#f5e6c8]/60 text-xs mt-1 ml-5">{order.bonus}</p>
          </button>
        );
      })}
    </div>
  );
}

// ── Knight Liege House ─────────────────────────────────────

function KnightLiegeHouse({ character, onChange }: TraitsAndNotesProps) {
  // Filter to non-ruling houses. Further filter by alignment match if set.
  const lowerHouses = NOBLE_HOUSES.filter(h => !h.ruling);
  const matchingHouses = character.alignment
    ? lowerHouses.filter(h => h.alignment === character.alignment)
    : lowerHouses;

  return (
    <div>
      <label className={labelClasses}>Liege House</label>
      {character.alignment && matchingHouses.length === 0 && (
        <p className="text-red-400 text-xs mb-1">No houses match your alignment ({character.alignment}).</p>
      )}
      <select
        value={character.liegeHouse}
        onChange={(e) => onChange({ liegeHouse: e.target.value })}
        className={`${inputClasses} text-sm`}
      >
        <option value="">-- Select House --</option>
        {(character.alignment ? matchingHouses : lowerHouses).map(h => (
          <option key={h.name} value={h.name}>{h.name} ({h.alignment}) - {h.head}</option>
        ))}
      </select>
      <details className="mt-2">
        <summary className="text-xs text-[#f5e6c8]/40 cursor-pointer hover:text-[#f5e6c8]/60">
          The Code of Chivalry
        </summary>
        <div className="text-[#f5e6c8]/60 text-xs mt-1 space-y-0.5">
          <p>Honour, Service, Glory, Protecting the weak, Hierarchy</p>
          <p className="text-[#f5e6c8]/40 italic">Must match liege&apos;s alignment. Cannot use missile weapons. Scorn light armour.</p>
        </div>
      </details>
    </div>
  );
}

// ── Hunter Trophies ────────────────────────────────────────

function HunterTrophies({ character, onChange }: TraitsAndNotesProps) {
  const [newCreature, setNewCreature] = useState('');

  const addTrophy = () => {
    if (!newCreature.trim()) return;
    const trophy: Trophy = { id: crypto.randomUUID(), creatureType: newCreature.trim() };
    onChange({ trophies: [...character.trophies, trophy] });
    setNewCreature('');
  };

  const removeTrophy = (id: string) => {
    onChange({ trophies: character.trophies.filter(t => t.id !== id) });
  };

  return (
    <div>
      <label className={labelClasses}>
        Trophies <span className="text-[#f5e6c8]/40 font-normal">+1 Attack/Save per creature type</span>
      </label>
      {character.trophies.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {character.trophies.map(t => (
            <span key={t.id} className={chipClasses}>
              {t.creatureType}
              <button type="button" onClick={() => removeTrophy(t.id)} className="ml-0.5 text-red-400 hover:text-red-300">x</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={newCreature}
          onChange={(e) => setNewCreature(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTrophy()}
          placeholder="Creature type..."
          className={`${inputClasses} text-sm flex-1`}
        />
        <button type="button" onClick={addTrophy} className={btnClasses}>Add</button>
      </div>
    </div>
  );
}

// ── Hunter Animal Companion ────────────────────────────────

function AnimalCompanionCard({ character, onChange }: TraitsAndNotesProps) {
  const companion = character.animalCompanion;

  if (!companion) {
    return (
      <div>
        <label className={labelClasses}>Animal Companion</label>
        <button
          type="button"
          onClick={() => onChange({ animalCompanion: { name: '', type: '', hp: 1, notes: '' } })}
          className={btnClasses}
        >
          + Add Companion
        </button>
      </div>
    );
  }

  const update = (field: string, value: string | number) => {
    onChange({ animalCompanion: { ...companion, [field]: value } });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className={labelClasses}>Animal Companion</label>
        <button
          type="button"
          onClick={() => onChange({ animalCompanion: null })}
          className="text-red-400 text-xs hover:text-red-300"
        >
          Remove
        </button>
      </div>
      <div className={cardClasses}>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-[#f5e6c8]/50 text-xs">Name</label>
            <input type="text" value={companion.name} onChange={(e) => update('name', e.target.value)} className={`${inputClasses} text-sm`} />
          </div>
          <div>
            <label className="text-[#f5e6c8]/50 text-xs">Type</label>
            <input type="text" value={companion.type} onChange={(e) => update('type', e.target.value)} className={`${inputClasses} text-sm`} placeholder="Wolf, hawk..." />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-[#f5e6c8]/50 text-xs">HP</label>
            <input type="number" value={companion.hp} onChange={(e) => update('hp', parseInt(e.target.value) || 0)} className={`${inputClasses} text-sm`} min={0} />
          </div>
        </div>
        <div>
          <label className="text-[#f5e6c8]/50 text-xs">Notes</label>
          <input type="text" value={companion.notes} onChange={(e) => update('notes', e.target.value)} className={`${inputClasses} text-sm`} />
        </div>
      </div>
    </div>
  );
}

// ── Breggle Horns & Gaze ───────────────────────────────────

function BreggleFeatures({ character, onChange }: TraitsAndNotesProps) {
  const profile = getCharacterFeatureProfile(character.kindred, character.class, character.level);
  const maxGaze = BREGGLE_GAZE_PER_DAY[Math.min(character.level, 15)] ?? 0;

  return (
    <div className="space-y-3">
      {/* Horn Progression */}
      <div>
        <label className={labelClasses}>Horn Progression</label>
        <div className="grid grid-cols-5 gap-1 text-xs">
          {BREGGLE_HORN_PROGRESSION.map(h => (
            <div
              key={h.level}
              className={`text-center rounded px-1 py-1 ${h.level === character.level ? 'bg-[#c4a35a]/20 border border-[#c4a35a]' : 'bg-[#2a2a3e]'}`}
            >
              <div className="text-[#c4a35a] font-semibold">L{h.level}</div>
              <div className="text-[#f5e6c8]/70">{h.length}</div>
              <div className="text-[#f5e6c8]/50">{h.damage}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Gaze */}
      {profile.hasGaze && (
        <div>
          <label className={labelClasses}>
            Breggle Gaze <span className="text-[#f5e6c8]/40 font-normal">(Level 4+)</span>
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onChange({ gazeUsesRemaining: Math.max(0, character.gazeUsesRemaining - 1) })}
              disabled={character.gazeUsesRemaining <= 0}
              className={btnClasses}
            >
              -
            </button>
            <span className="text-[#f5e6c8] font-semibold">
              {character.gazeUsesRemaining} / {maxGaze}
            </span>
            <button
              type="button"
              onClick={() => onChange({ gazeUsesRemaining: Math.min(maxGaze, character.gazeUsesRemaining + 1) })}
              disabled={character.gazeUsesRemaining >= maxGaze}
              className={btnClasses}
            >
              +
            </button>
            <button
              type="button"
              onClick={() => onChange({ gazeUsesRemaining: maxGaze })}
              className={`${btnClasses} ml-auto`}
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Grimalkin Form Switcher ────────────────────────────────

function GrimalkinForms({ character, onChange }: TraitsAndNotesProps) {
  const forms = ['estray', 'chester', 'wilder'] as const;

  return (
    <div>
      <label className={labelClasses}>Current Form</label>
      <div className="grid grid-cols-3 gap-2">
        {forms.map(formId => {
          const form = GRIMALKIN_FORMS[formId];
          const active = character.currentForm === formId;
          const wilderDisabled = formId === 'wilder' && character.wilderUsedToday;

          return (
            <button
              key={formId}
              type="button"
              disabled={wilderDisabled}
              onClick={() => {
                const updates: Partial<Character> = { currentForm: formId };
                if (formId === 'wilder') updates.wilderUsedToday = true;
                onChange(updates);
              }}
              className={`${cardClasses} text-center cursor-pointer transition-colors ${active ? 'border-[#c4a35a] bg-[#2a2a3e]' : 'hover:border-[#c4a35a]/50'} ${wilderDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <div className="text-[#c4a35a] font-semibold text-sm">{form.name}</div>
              <div className="text-[#f5e6c8]/50 text-xs">{form.description}</div>
              {form.ac && (
                <div className="text-[#f5e6c8]/60 text-xs mt-1">
                  AC {form.ac} | Spd {form.speed}&apos;
                </div>
              )}
              {form.attacks && (
                <div className="text-[#f5e6c8]/40 text-xs">{form.attacks}</div>
              )}
            </button>
          );
        })}
      </div>
      {character.currentForm === 'wilder' && 'notes' in GRIMALKIN_FORMS.wilder && (
        <p className="text-yellow-400/70 text-xs mt-1">{GRIMALKIN_FORMS.wilder.notes}</p>
      )}
      {character.wilderUsedToday && character.currentForm !== 'wilder' && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[#f5e6c8]/40 text-xs">Wilder used today.</span>
          <button
            type="button"
            onClick={() => onChange({ wilderUsedToday: false })}
            className={btnClasses}
          >
            New Day
          </button>
        </div>
      )}
    </div>
  );
}

// ── Woodgrue Mad Revelry ───────────────────────────────────

function MadRevelryPanel({ character, onChange }: TraitsAndNotesProps) {
  const maxUses = character.level; // 1x/day per level
  const [selectedMelody, setSelectedMelody] = useState('');

  const melody = MAD_REVELRY_MELODIES.find(m => m.id === selectedMelody);

  return (
    <div>
      <label className={labelClasses}>
        Mad Revelry <span className="text-[#f5e6c8]/40 font-normal">{character.madRevelryUsesRemaining}/{maxUses} uses</span>
      </label>
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => onChange({ madRevelryUsesRemaining: Math.max(0, character.madRevelryUsesRemaining - 1) })}
          disabled={character.madRevelryUsesRemaining <= 0}
          className={btnClasses}
        >
          Use
        </button>
        <span className="text-[#f5e6c8] font-semibold text-sm">
          {character.madRevelryUsesRemaining} / {maxUses}
        </span>
        <button
          type="button"
          onClick={() => onChange({ madRevelryUsesRemaining: maxUses })}
          className={`${btnClasses} ml-auto`}
        >
          Reset
        </button>
      </div>
      <select
        value={selectedMelody}
        onChange={(e) => setSelectedMelody(e.target.value)}
        className={`${inputClasses} text-sm mb-1`}
      >
        <option value="">-- Select Melody --</option>
        {MAD_REVELRY_MELODIES.map(m => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      {melody && (
        <p className="text-[#f5e6c8]/60 text-xs mt-1">{melody.effect}</p>
      )}
      <p className="text-[#f5e6c8]/40 text-xs mt-1">
        30&apos; range, affects all living creatures (including allies). Save vs Spell. Fairies/demi-fey +2 to save.
      </p>
    </div>
  );
}

// ── Mossling Features ──────────────────────────────────────

function MosslingFeatures({ character, onChange }: TraitsAndNotesProps) {
  const profile = getCharacterFeatureProfile(character.kindred, character.class, character.level);
  const maxFungal = Math.floor(character.level / 2);

  const addTrait = (roll: number) => {
    onChange({ symbioticFleshTraits: [...character.symbioticFleshTraits, roll] });
  };

  const removeTrait = (index: number) => {
    const next = [...character.symbioticFleshTraits];
    next.splice(index, 1);
    onChange({ symbioticFleshTraits: next });
  };

  return (
    <div className="space-y-3">
      {/* Symbiotic Flesh */}
      <div>
        <label className={labelClasses}>
          Symbiotic Flesh <span className="text-[#f5e6c8]/40 font-normal">(1 trait per level)</span>
        </label>
        {character.symbioticFleshTraits.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {character.symbioticFleshTraits.map((roll, i) => {
              const entry = SYMBIOTIC_FLESH_TABLE.find(e => e.roll === roll);
              return (
                <span key={i} className={chipClasses}>
                  [{roll}] {entry?.trait ?? '???'}
                  <button type="button" onClick={() => removeTrait(i)} className="ml-0.5 text-red-400 hover:text-red-300">x</button>
                </span>
              );
            })}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <select
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (val) addTrait(val);
                e.target.value = '';
              }}
              className={`${inputClasses} text-sm`}
              defaultValue=""
            >
              <option value="">-- Roll d20 / Pick Trait --</option>
              {SYMBIOTIC_FLESH_TABLE.map(e => (
                <option key={e.roll} value={e.roll}>[{e.roll}] {e.trait}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Fungal Symbiosis */}
      {profile.hasFungalSymbiosis && (
        <div>
          <label className={labelClasses}>
            Fungal Symbiosis <span className="text-[#f5e6c8]/40 font-normal">(Level 4+)</span>
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onChange({ fungalSymbiosisUsesRemaining: Math.max(0, character.fungalSymbiosisUsesRemaining - 1) })}
              disabled={character.fungalSymbiosisUsesRemaining <= 0}
              className={btnClasses}
            >
              -
            </button>
            <span className="text-[#f5e6c8] font-semibold">
              {character.fungalSymbiosisUsesRemaining} / {maxFungal}
            </span>
            <button
              type="button"
              onClick={() => onChange({ fungalSymbiosisUsesRemaining: Math.min(maxFungal, character.fungalSymbiosisUsesRemaining + 1) })}
              disabled={character.fungalSymbiosisUsesRemaining >= maxFungal}
              className={btnClasses}
            >
              +
            </button>
            <button
              type="button"
              onClick={() => onChange({ fungalSymbiosisUsesRemaining: maxFungal })}
              className={`${btnClasses} ml-auto`}
            >
              Reset
            </button>
          </div>
          <p className="text-[#f5e6c8]/40 text-xs mt-1">
            Spend 1 Turn to bond with non-hostile monstrous fungus (3+ levels below you). Save vs Spell.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Retainers ──────────────────────────────────────────────

function RetainersSection({ character, onChange }: TraitsAndNotesProps) {
  const chaMod = getAbilityModifier(character.abilityScores.charisma);
  const maxRetainers = Math.max(1, 4 + chaMod);
  const baseLoyalty = 7 + chaMod;

  const addRetainer = () => {
    const retainer: Retainer = {
      id: crypto.randomUUID(),
      name: '',
      class: '',
      level: 1,
      hp: 1,
      loyalty: baseLoyalty,
      notes: '',
    };
    onChange({ retainers: [...character.retainers, retainer] });
  };

  const updateRetainer = (id: string, field: keyof Retainer, value: string | number) => {
    const next = character.retainers.map(r =>
      r.id === id ? { ...r, [field]: value } : r
    );
    onChange({ retainers: next });
  };

  const removeRetainer = (id: string) => {
    onChange({ retainers: character.retainers.filter(r => r.id !== id) });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className={labelClasses}>
          Retainers <span className="text-[#f5e6c8]/40 font-normal">({character.retainers.length} of {maxRetainers})</span>
        </label>
        <button
          type="button"
          onClick={addRetainer}
          disabled={character.retainers.length >= maxRetainers}
          className={btnClasses}
        >
          + Add
        </button>
      </div>
      {character.retainers.length === 0 && (
        <p className="text-[#f5e6c8]/40 text-xs italic">No retainers hired. Max = 4 + CHA modifier (min 1).</p>
      )}
      {character.retainers.map(r => (
        <div key={r.id} className={cardClasses}>
          <div className="flex items-center justify-between mb-2">
            <input
              type="text"
              value={r.name}
              onChange={(e) => updateRetainer(r.id, 'name', e.target.value)}
              placeholder="Name..."
              className={`${inputClasses} text-sm flex-1 mr-2`}
            />
            <button
              type="button"
              onClick={() => removeRetainer(r.id)}
              className="text-red-400 text-xs hover:text-red-300"
            >
              Remove
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div>
              <label className="text-[#f5e6c8]/50">Class</label>
              <input type="text" value={r.class} onChange={(e) => updateRetainer(r.id, 'class', e.target.value)} className={`${inputClasses} text-xs`} />
            </div>
            <div>
              <label className="text-[#f5e6c8]/50">Level</label>
              <input type="number" value={r.level} onChange={(e) => updateRetainer(r.id, 'level', parseInt(e.target.value) || 1)} className={`${inputClasses} text-xs`} min={1} />
            </div>
            <div>
              <label className="text-[#f5e6c8]/50">HP</label>
              <input type="number" value={r.hp} onChange={(e) => updateRetainer(r.id, 'hp', parseInt(e.target.value) || 0)} className={`${inputClasses} text-xs`} min={0} />
            </div>
            <div>
              <label className="text-[#f5e6c8]/50">Loyalty</label>
              <input type="number" value={r.loyalty} onChange={(e) => updateRetainer(r.id, 'loyalty', parseInt(e.target.value) || 0)} className={`${inputClasses} text-xs`} min={1} max={12} />
            </div>
          </div>
          <div className="mt-1">
            <input type="text" value={r.notes} onChange={(e) => updateRetainer(r.id, 'notes', e.target.value)} placeholder="Notes..." className={`${inputClasses} text-xs`} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────

export default function TraitsAndNotes({ character, onChange }: TraitsAndNotesProps) {
  const [bonusLangValue, setBonusLangValue] = useState('');

  const profile = getCharacterFeatureProfile(character.kindred, character.class, character.level);

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

  const hasClassFeatures = profile.hasCombatTalents || profile.hasHolyOrder || profile.hasTurning || profile.hasChivalricCode || profile.hasTrophies || profile.hasCompanion;
  const hasKindredFeatures = profile.hasHorns || profile.hasFormShift || profile.hasMadRevelry || profile.hasSymbioticFlesh;

  return (
    <div className="bg-[#2a2a3e] rounded-lg p-4">
      <h2 className="text-[#c4a35a] text-xl font-bold mb-4 border-b border-[#5a3a28] pb-2">
        Traits & Notes
      </h2>

      <div className="space-y-4">
        {/* ── Class Features ─────────────────────── */}
        {hasClassFeatures && (
          <div>
            <h3 className={sectionHeadingClasses}>Class Features</h3>
            <div className="space-y-3">
              {profile.hasCombatTalents && (
                <div>
                  <label className={labelClasses}>
                    Combat Talents <span className="text-[#f5e6c8]/40 font-normal">({getFighterTalentCount(character.level)} slots)</span>
                  </label>
                  <FighterTalents character={character} onChange={onChange} />
                </div>
              )}

              {profile.hasHolyOrder && (
                <div>
                  <label className={labelClasses}>Holy Order</label>
                  <HolyOrderSelector character={character} onChange={onChange} />
                </div>
              )}

              {profile.hasTurning && (
                <TurningUndead />
              )}

              {profile.hasChivalricCode && (
                <KnightLiegeHouse character={character} onChange={onChange} />
              )}

              {profile.hasTrophies && (
                <HunterTrophies character={character} onChange={onChange} />
              )}

              {profile.hasCompanion && (
                <AnimalCompanionCard character={character} onChange={onChange} />
              )}
            </div>
          </div>
        )}

        {/* ── Kindred Features ───────────────────── */}
        {hasKindredFeatures && (
          <div>
            <h3 className={sectionHeadingClasses}>Kindred Features</h3>
            <div className="space-y-3">
              {profile.hasHorns && (
                <BreggleFeatures character={character} onChange={onChange} />
              )}

              {profile.hasFormShift && (
                <GrimalkinForms character={character} onChange={onChange} />
              )}

              {profile.hasMadRevelry && (
                <MadRevelryPanel character={character} onChange={onChange} />
              )}

              {profile.hasSymbioticFlesh && (
                <MosslingFeatures character={character} onChange={onChange} />
              )}
            </div>
          </div>
        )}

        {/* ── Retainers ─────────────────────────── */}
        <div>
          <h3 className={sectionHeadingClasses}>Retainers</h3>
          <RetainersSection character={character} onChange={onChange} />
        </div>

        {/* ── Languages (unchanged) ──────────────── */}
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

        {/* ── Free-form Notes ────────────────────── */}
        <div>
          <h3 className={sectionHeadingClasses}>Notes</h3>
          <div className="space-y-3">
            <div>
              <label className={labelClasses}>Class Notes</label>
              <textarea
                value={character.classTraits}
                onChange={(e) => onChange({ classTraits: e.target.value })}
                placeholder="Additional class abilities, features, and special traits..."
                rows={3}
                className={`${inputClasses} resize-y`}
              />
            </div>
            <div>
              <label className={labelClasses}>Kindred Notes</label>
              <textarea
                value={character.kindredTraits}
                onChange={(e) => onChange({ kindredTraits: e.target.value })}
                placeholder="Additional kindred abilities, innate traits..."
                rows={3}
                className={`${inputClasses} resize-y`}
              />
            </div>
            <div>
              <label className={labelClasses}>Combat Notes</label>
              <textarea
                value={character.combatTalents}
                onChange={(e) => onChange({ combatTalents: e.target.value })}
                placeholder="Combat notes, weapon proficiencies, fighting styles..."
                rows={3}
                className={`${inputClasses} resize-y`}
              />
            </div>
            <div>
              <label className={labelClasses}>Other Notes</label>
              <textarea
                value={character.otherNotes}
                onChange={(e) => onChange({ otherNotes: e.target.value })}
                placeholder="Any other notes, allies, enemies, backstory details..."
                rows={4}
                className={`${inputClasses} resize-y`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
