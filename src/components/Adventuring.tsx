'use client';

import { useState } from 'react';
import { Character, CharacterUpdater, JournalEntry, ActiveLightSource } from '@/lib/types';
import {
  MONTHS,
  formatCalendarDate,
  FESTIVALS,
  FESTIVAL_DESCRIPTIONS,
  CELESTIAL_EVENTS,
  TERRAIN_TABLE,
  SLEEP_MATRIX,
  SLEEP_DIFFICULTY_DESCRIPTION,
  HUNGER_EFFECTS_MORTAL,
  HUNGER_EFFECTS_FAIRY,
  LIGHT_SOURCE_TYPES,
  HEALING_RATES,
  FORAGING_YIELDS,
  getHungerEffects,
  getMoonPhaseLabel,
  weeksElapsed,
  addDays,
} from '@/lib/gamedata';

interface AdventuringProps {
  character: Character;
  onChange: (updates: CharacterUpdater) => void;
}

const inputClasses =
  'bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a]';

const labelClasses = 'block text-[#c4a35a] text-sm font-semibold mb-1';

const buttonClasses =
  'bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-3 py-1 transition-colors';

const smallButtonClasses =
  'bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-2 py-0.5 text-sm transition-colors';

const SEASON_COLORS: Record<string, string> = {
  Winter: '#a0c4e8',
  Spring: '#8fb368',
  Summer: '#c4a35a',
  Autumn: '#c47a3a',
};

const SLEEP_DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#8fb368',
  moderate: '#c4a35a',
  difficult: '#c47a3a',
  impossible: '#b33a1a',
};

function getFestivalsForMonth(month: number): { day: number; name: string }[] {
  return (FESTIVALS.festivals || []).filter((f) => f.month === month);
}

function getCelestialEventsForMonth(month: number): { day: number; name: string }[] {
  return CELESTIAL_EVENTS.filter((e) => e.month === month);
}

export default function Adventuring({ character, onChange }: AdventuringProps) {
  const { currentDate, currentLocation, journalEntries } = character;
  const currentMonth = MONTHS[currentDate.month];
  const seasonColor = SEASON_COLORS[currentMonth.season] || '#f5e6c8';
  const season = currentMonth.season as 'Winter' | 'Spring' | 'Summer' | 'Autumn';

  // Ephemeral camping state (not persisted)
  const [campFire, setCampFire] = useState<'none' | 'campfire'>('none');
  const [campBedding, setCampBedding] = useState<'none' | 'bedrollOrTent' | 'bedrollAndTent'>('none');
  const [showTerrainTable, setShowTerrainTable] = useState(false);
  const [showSleepMatrix, setShowSleepMatrix] = useState(false);
  const [showHealingTable, setShowHealingTable] = useState(false);
  const [showHungerTables, setShowHungerTables] = useState(false);

  // ── Calendar Handlers ──────────────────────────────────────────────

  // Earliest representable campaign date. The Year input + this guard
  // are the only enforcement that the campaign date never drops below
  // Year 1; addDays itself stays math-pure so daysBetween invariants hold.
  const isAtCampaignStart =
    currentDate.year === 1 && currentDate.month === 0 && currentDate.day === 1;

  const handlePreviousDay = () => {
    if (isAtCampaignStart) return;
    onChange({ currentDate: addDays(currentDate, -1) });
  };

  const handleNextDay = () => {
    onChange({ currentDate: addDays(currentDate, 1) });
  };

  const handleMonthChange = (newMonth: number) => {
    const maxDay = MONTHS[newMonth].days;
    const clampedDay = Math.min(currentDate.day, maxDay);
    onChange({ currentDate: { ...currentDate, day: clampedDay, month: newMonth } });
  };

  const handleDayChange = (newDay: number) => {
    const maxDay = currentMonth.days;
    const clampedDay = Math.max(1, Math.min(newDay, maxDay));
    onChange({ currentDate: { ...currentDate, day: clampedDay } });
  };

  const handleYearChange = (newYear: number) => {
    onChange({ currentDate: { ...currentDate, year: Math.max(1, Math.floor(newYear) || 1) } });
  };

  // ── Journal Handlers ───────────────────────────────────────────────

  const handleAddJournalEntry = () => {
    const newEntry: JournalEntry = {
      id: crypto.randomUUID(),
      date: { ...currentDate },
      location: currentLocation,
      text: '',
    };
    onChange({ journalEntries: [...journalEntries, newEntry] });
  };

  const handleUpdateJournalEntry = (id: string, text: string) => {
    onChange({
      journalEntries: journalEntries.map((entry) =>
        entry.id === id ? { ...entry, text } : entry
      ),
    });
  };

  const handleDeleteJournalEntry = (id: string) => {
    onChange({
      journalEntries: journalEntries.filter((entry) => entry.id !== id),
    });
  };

  // ── Light Source Handlers ──────────────────────────────────────────

  const handleAddLightSource = (type: 'torch' | 'lantern' | 'candle') => {
    const source: ActiveLightSource = {
      id: crypto.randomUUID(),
      type,
      minutesRemaining: LIGHT_SOURCE_TYPES[type].minutes,
    };
    onChange({ activeLightSources: [...character.activeLightSources, source] });
  };

  const handleUpdateLightSource = (id: string, minutes: number) => {
    onChange({
      activeLightSources: character.activeLightSources.map((s) =>
        s.id === id ? { ...s, minutesRemaining: Math.max(0, minutes) } : s
      ),
    });
  };

  const handleRemoveLightSource = (id: string) => {
    onChange({
      activeLightSources: character.activeLightSources.filter((s) => s.id !== id),
    });
  };

  // ── Computed Values ────────────────────────────────────────────────

  const sleepDifficulty = SLEEP_MATRIX[campFire][campBedding][season];
  const festivalsThisMonth = getFestivalsForMonth(currentDate.month);
  const celestialThisMonth = getCelestialEventsForMonth(currentDate.month);
  const foragingYield = FORAGING_YIELDS[season];

  const moonPhaseLabel = getMoonPhaseLabel(currentDate);
  const todaysFestivals = (FESTIVALS.festivals || []).filter(
    (f) => f.month === currentDate.month && f.day === currentDate.day
  );
  const todaysCelestial = CELESTIAL_EVENTS.filter(
    (e) => e.month === currentDate.month && e.day === currentDate.day
  );
  const isWysenday = currentMonth.wysendays.some((w) => {
    // Check if today matches a festival that corresponds to a wysenday
    return todaysFestivals.some((f) => f.name.includes(w) || w.includes(f.name));
  });

  const exhaustionText = character.exhaustionLevel > 0
    ? `-${character.exhaustionLevel} to Attack & Damage`
    : 'None';

  const hungerText = getHungerEffects(character.hungerDays, character.kindred);
  const thirstText = character.thirstDays > 0
    ? `${getHungerEffects(character.thirstDays, character.kindred)} + -3 CON/day`
    : 'None';

  const forcedMarchTp = Math.floor(character.travelPointsPerDay * 1.5);

  return (
    <div className="space-y-4">
      {/* ── 5a. Calendar (existing) ──────────────────────────────── */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h2 className="text-[#c4a35a] text-xl font-bold mb-4 border-b border-[#5a3a28] pb-2">
          Calendar
        </h2>

        {/* Festival alert */}
        {todaysFestivals.length > 0 && (
          <div className="bg-[#c4a35a]/15 border border-[#c4a35a]/40 rounded-lg p-3 mb-4 text-center">
            {todaysFestivals.map((f) => {
              const descKey = Object.keys(FESTIVAL_DESCRIPTIONS).find(
                (k) => f.name.includes(k) || k.includes(f.name.split(' / ')[0])
              );
              return (
                <div key={f.name}>
                  <div className="text-[#c4a35a] font-bold text-lg">{f.name}</div>
                  {descKey && (
                    <div className="text-[#f5e6c8]/70 text-sm mt-1">{FESTIVAL_DESCRIPTIONS[descKey]}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Celestial event alert */}
        {todaysCelestial.length > 0 && (
          <div className="bg-[#a0c4e8]/15 border border-[#a0c4e8]/40 rounded-lg p-3 mb-4 text-center">
            {todaysCelestial.map((e) => (
              <div key={e.name} className="text-[#a0c4e8] font-bold">{e.name}</div>
            ))}
          </div>
        )}

        <div className="text-center mb-4">
          <div className="text-2xl font-bold text-[#c4a35a]">
            {formatCalendarDate(currentDate)}
          </div>
          <div className="text-[#f5e6c8]/60 text-sm mt-1">
            {currentMonth.description}
          </div>
          <div className="mt-1" style={{ color: seasonColor }}>
            {currentMonth.season}
          </div>
          {/* Moon info */}
          <div className="text-[#f5e6c8]/70 text-sm mt-1">
            {currentMonth.moonName} &middot; {moonPhaseLabel}
          </div>
          {/* Wysenday badge */}
          {isWysenday && (
            <span className="inline-block mt-2 bg-[#c4a35a]/20 text-[#c4a35a] text-xs font-semibold px-3 py-1 rounded-full border border-[#c4a35a]/40">
              Wysenday
            </span>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 mb-4">
          <button
            onClick={handlePreviousDay}
            disabled={isAtCampaignStart}
            title={isAtCampaignStart ? 'Already at Year 1, day 1' : ''}
            className={`${buttonClasses} ${isAtCampaignStart ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            Previous Day
          </button>
          <button onClick={handleNextDay} className={buttonClasses}>
            Next Day
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClasses}>Month</label>
            <select
              value={currentDate.month}
              onChange={(e) => handleMonthChange(parseInt(e.target.value))}
              className={`${inputClasses} w-full`}
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClasses}>Day</label>
            <input
              type="number"
              min={1}
              max={currentMonth.days}
              value={currentDate.day}
              onChange={(e) => handleDayChange(parseInt(e.target.value) || 1)}
              className={`${inputClasses} w-full`}
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelClasses}>Year</label>
            <input
              type="number"
              min={1}
              value={currentDate.year}
              onChange={(e) => handleYearChange(parseInt(e.target.value) || 1)}
              className={`${inputClasses} w-full`}
            />
          </div>
        </div>
      </div>

      {/* ── 5b. Current Location (existing) ──────────────────────── */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <label className={labelClasses}>Current Location</label>
        <input
          type="text"
          value={currentLocation}
          onChange={(e) => onChange({ currentLocation: e.target.value })}
          placeholder="Where is the party?"
          className={`${inputClasses} w-full`}
        />
      </div>

      {/* ── 5c. Condition Trackers ───────────────────────────────── */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h2 className="text-[#c4a35a] text-xl font-bold mb-4 border-b border-[#5a3a28] pb-2">
          Conditions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Exhaustion */}
          <div className="bg-[#1a1a2e] rounded p-3">
            <div className="text-[#c4a35a] text-sm font-semibold mb-2">Exhaustion</div>
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={() => onChange({ exhaustionLevel: Math.max(0, character.exhaustionLevel - 1) })}
                className={smallButtonClasses}
              >-</button>
              <span className="text-[#f5e6c8] text-lg font-bold w-8 text-center">
                {character.exhaustionLevel}
              </span>
              <button
                onClick={() => onChange({ exhaustionLevel: Math.min(4, character.exhaustionLevel + 1) })}
                className={smallButtonClasses}
              >+</button>
              <span className="text-[#f5e6c8]/60 text-xs">/4</span>
            </div>
            <div className="text-[#f5e6c8]/60 text-xs">{exhaustionText}</div>
          </div>

          {/* Hunger Days */}
          <div className="bg-[#1a1a2e] rounded p-3">
            <div className="text-[#c4a35a] text-sm font-semibold mb-2">Hunger (days)</div>
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={() => onChange({ hungerDays: Math.max(0, character.hungerDays - 1) })}
                className={smallButtonClasses}
              >-</button>
              <span className="text-[#f5e6c8] text-lg font-bold w-8 text-center">
                {character.hungerDays}
              </span>
              <button
                onClick={() => onChange({ hungerDays: character.hungerDays + 1 })}
                className={smallButtonClasses}
              >+</button>
            </div>
            <div className="text-[#f5e6c8]/60 text-xs">{hungerText}</div>
          </div>

          {/* Thirst Days */}
          <div className="bg-[#1a1a2e] rounded p-3">
            <div className="text-[#c4a35a] text-sm font-semibold mb-2">Thirst (days)</div>
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={() => onChange({ thirstDays: Math.max(0, character.thirstDays - 1) })}
                className={smallButtonClasses}
              >-</button>
              <span className="text-[#f5e6c8] text-lg font-bold w-8 text-center">
                {character.thirstDays}
              </span>
              <button
                onClick={() => onChange({ thirstDays: character.thirstDays + 1 })}
                className={smallButtonClasses}
              >+</button>
            </div>
            <div className="text-[#f5e6c8]/60 text-xs">{thirstText}</div>
          </div>

          {/* Spell Study (only visible when active) */}
          {character.spellStudy?.active && (() => {
            const active = character.spellStudy.active;
            // Clamp elapsed at 0 so a backward calendar nudge can't make
            // `remaining` balloon past `weeksRequired` via subtraction.
            const elapsed = Math.max(0, weeksElapsed(active.startedOn, currentDate));
            const remaining = Math.max(0, active.weeksRequired - elapsed);
            const ready = remaining === 0;
            return (
              <div className={`bg-[#1a1a2e] rounded p-3 ${ready ? 'ring-1 ring-[#c4a35a]' : ''}`}>
                <div className="text-[#c4a35a] text-sm font-semibold mb-2">🪄 Spell Study</div>
                <div className="text-[#f5e6c8] text-sm font-bold">
                  R{active.rank} {active.spellName}
                </div>
                <div className="text-[#f5e6c8]/60 text-xs">
                  {ready
                    ? 'Ready to complete (see Spells tab)'
                    : `${remaining} week${remaining === 1 ? '' : 's'} remaining`}
                </div>
                <div className="text-[#f5e6c8]/40 text-xs italic mt-1">
                  via {active.source}
                </div>
              </div>
            );
          })()}

          {/* Travel Days Without Rest */}
          <div className="bg-[#1a1a2e] rounded p-3">
            <div className="text-[#c4a35a] text-sm font-semibold mb-2">Travel Days w/o Rest</div>
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={() => onChange({ travelDaysWithoutRest: Math.max(0, character.travelDaysWithoutRest - 1) })}
                className={smallButtonClasses}
              >-</button>
              <span className="text-[#f5e6c8] text-lg font-bold w-8 text-center">
                {character.travelDaysWithoutRest}
              </span>
              <button
                onClick={() => onChange({ travelDaysWithoutRest: Math.min(6, character.travelDaysWithoutRest + 1) })}
                className={smallButtonClasses}
              >+</button>
              <span className="text-[#f5e6c8]/60 text-xs">/6</span>
            </div>
            {character.travelDaysWithoutRest >= 6 && (
              <div className="text-red-400 text-xs font-semibold">Must rest or gain exhaustion!</div>
            )}
            <button
              onClick={() => onChange({ travelDaysWithoutRest: 0 })}
              className={`${smallButtonClasses} mt-1`}
            >
              Rest Day
            </button>
          </div>
        </div>
      </div>

      {/* ── 5d. Rations ─────────────────────────────────────────── */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h2 className="text-[#c4a35a] text-xl font-bold mb-4 border-b border-[#5a3a28] pb-2">
          Rations
        </h2>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-[#1a1a2e] rounded p-3">
            <div className="text-[#c4a35a] text-sm font-semibold mb-2">Fresh</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onChange({ rations: { ...character.rations, fresh: Math.max(0, character.rations.fresh - 1) } })}
                className={smallButtonClasses}
              >-</button>
              <span className="text-[#f5e6c8] text-lg font-bold w-8 text-center">
                {character.rations.fresh}
              </span>
              <button
                onClick={() => onChange({ rations: { ...character.rations, fresh: character.rations.fresh + 1 } })}
                className={smallButtonClasses}
              >+</button>
            </div>
          </div>
          <div className="bg-[#1a1a2e] rounded p-3">
            <div className="text-[#c4a35a] text-sm font-semibold mb-2">Preserved</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onChange({ rations: { ...character.rations, preserved: Math.max(0, character.rations.preserved - 1) } })}
                className={smallButtonClasses}
              >-</button>
              <span className="text-[#f5e6c8] text-lg font-bold w-8 text-center">
                {character.rations.preserved}
              </span>
              <button
                onClick={() => onChange({ rations: { ...character.rations, preserved: character.rations.preserved + 1 } })}
                className={smallButtonClasses}
              >+</button>
            </div>
          </div>
        </div>
        <div className="text-[#f5e6c8]/60 text-xs">
          Foraging yield ({season}): <span className="text-[#c4a35a] font-semibold">{foragingYield}</span> rations (Survival check).
          Fresh rations spoil after 1 week without preservation.
        </div>
      </div>

      {/* ── 5e. Travel Points ────────────────────────────────────── */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h2 className="text-[#c4a35a] text-xl font-bold mb-4 border-b border-[#5a3a28] pb-2">
          Travel Points
        </h2>
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => onChange({ travelPointsRemaining: Math.max(0, character.travelPointsRemaining - 1) })}
            className={smallButtonClasses}
          >-</button>
          <span className="text-[#f5e6c8] text-2xl font-bold w-12 text-center">
            {character.travelPointsRemaining}
          </span>
          <button
            onClick={() => onChange({ travelPointsRemaining: character.travelPointsRemaining + 1 })}
            className={smallButtonClasses}
          >+</button>
          <span className="text-[#f5e6c8]/60 text-sm">TP remaining</span>
          <button
            onClick={() => onChange({
              travelPointsRemaining: character.forcedMarchActive
                ? forcedMarchTp
                : character.travelPointsPerDay,
            })}
            className={buttonClasses}
          >
            Reset
          </button>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={character.forcedMarchActive}
              onChange={(e) => onChange({ forcedMarchActive: e.target.checked })}
              className="accent-[#c4a35a]"
            />
            <span className="text-[#f5e6c8] text-sm">Forced March</span>
          </label>
          <span className="text-[#f5e6c8]/60 text-xs">
            ({character.travelPointsPerDay} TP normal, {forcedMarchTp} TP forced)
          </span>
        </div>
        {character.forcedMarchActive && (
          <div className="text-[#c47a3a] text-xs mb-3">
            Must rest a full day after forced march or gain exhaustion.
          </div>
        )}

        <button
          onClick={() => setShowTerrainTable(!showTerrainTable)}
          className="text-[#c4a35a] text-sm hover:underline"
        >
          {showTerrainTable ? 'Hide' : 'Show'} Terrain Costs
        </button>
        {showTerrainTable && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs text-[#f5e6c8]">
              <thead>
                <tr className="border-b border-[#5a3a28]">
                  <th className="text-left py-1 pr-2 text-[#c4a35a]">Terrain</th>
                  <th className="text-center py-1 px-2 text-[#c4a35a]">TP</th>
                  <th className="text-center py-1 px-2 text-[#c4a35a]">Lost</th>
                  <th className="text-left py-1 pl-2 text-[#c4a35a]">Mounts/Vehicles</th>
                </tr>
              </thead>
              <tbody>
                {TERRAIN_TABLE.map((row) => (
                  <tr key={row.terrain} className="border-b border-[#5a3a28]/50">
                    <td className="py-1 pr-2">{row.terrain}</td>
                    <td className="text-center py-1 px-2">{row.tpCost}</td>
                    <td className="text-center py-1 px-2">{row.lostChance}</td>
                    <td className="py-1 pl-2 text-[#f5e6c8]/60">{row.mountsVehicles}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 5f. Light Sources ────────────────────────────────────── */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h2 className="text-[#c4a35a] text-xl font-bold mb-4 border-b border-[#5a3a28] pb-2">
          Light Sources
        </h2>
        <div className="flex gap-2 mb-3">
          <button onClick={() => handleAddLightSource('torch')} className={buttonClasses}>
            + Torch
          </button>
          <button onClick={() => handleAddLightSource('lantern')} className={buttonClasses}>
            + Lantern
          </button>
          <button onClick={() => handleAddLightSource('candle')} className={buttonClasses}>
            + Candle
          </button>
        </div>

        {character.activeLightSources.length === 0 && (
          <div className="text-[#f5e6c8]/40 text-sm italic">No active light sources.</div>
        )}

        <div className="space-y-2">
          {character.activeLightSources.map((source) => {
            const burnedOut = source.minutesRemaining <= 0;
            return (
              <div
                key={source.id}
                className={`flex items-center gap-2 p-2 rounded ${
                  burnedOut ? 'bg-red-900/30 border border-red-400/30' : 'bg-[#1a1a2e]'
                }`}
              >
                <span className={`text-sm font-semibold w-16 ${burnedOut ? 'text-red-400' : 'text-[#c4a35a]'}`}>
                  {LIGHT_SOURCE_TYPES[source.type].label}
                </span>
                <button
                  onClick={() => handleUpdateLightSource(source.id, source.minutesRemaining - 10)}
                  className={smallButtonClasses}
                >-10</button>
                <button
                  onClick={() => handleUpdateLightSource(source.id, source.minutesRemaining - 1)}
                  className={smallButtonClasses}
                >-1</button>
                <span className={`text-sm font-bold w-16 text-center ${burnedOut ? 'text-red-400' : 'text-[#f5e6c8]'}`}>
                  {source.minutesRemaining} min
                </span>
                <button
                  onClick={() => handleUpdateLightSource(source.id, source.minutesRemaining + 1)}
                  className={smallButtonClasses}
                >+1</button>
                <button
                  onClick={() => handleUpdateLightSource(source.id, source.minutesRemaining + 10)}
                  className={smallButtonClasses}
                >+10</button>
                <button
                  onClick={() => handleRemoveLightSource(source.id)}
                  className="text-red-400 hover:text-red-300 text-sm ml-auto px-1"
                  title="Remove"
                >
                  X
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 5g. Camping Calculator ───────────────────────────────── */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h2 className="text-[#c4a35a] text-xl font-bold mb-4 border-b border-[#5a3a28] pb-2">
          Camping
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <div className={labelClasses}>Fire</div>
            <div className="flex gap-2">
              {([['none', 'No Fire'], ['campfire', 'Campfire']] as const).map(([val, label]) => (
                <label key={val} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="campFire"
                    checked={campFire === val}
                    onChange={() => setCampFire(val)}
                    className="accent-[#c4a35a]"
                  />
                  <span className="text-[#f5e6c8] text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className={labelClasses}>Bedding</div>
            <div className="flex flex-col gap-1">
              {([['none', 'None'], ['bedrollOrTent', 'Bedroll or Tent'], ['bedrollAndTent', 'Bedroll + Tent']] as const).map(([val, label]) => (
                <label key={val} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="campBedding"
                    checked={campBedding === val}
                    onChange={() => setCampBedding(val)}
                    className="accent-[#c4a35a]"
                  />
                  <span className="text-[#f5e6c8] text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="text-center mb-4">
          <div className="text-[#f5e6c8]/60 text-sm mb-1">
            Sleep Difficulty ({season})
          </div>
          <div
            className="text-2xl font-bold capitalize"
            style={{ color: SLEEP_DIFFICULTY_COLORS[sleepDifficulty] }}
          >
            {sleepDifficulty}
          </div>
          <div className="text-[#f5e6c8]/60 text-sm mt-1">
            {SLEEP_DIFFICULTY_DESCRIPTION[sleepDifficulty]}
          </div>
        </div>

        <div className="bg-[#1a1a2e] rounded p-3 mb-3">
          <div className="text-[#c4a35a] text-sm font-semibold mb-1">Camp Activities</div>
          <div className="text-[#f5e6c8]/60 text-xs space-y-1">
            <div><span className="text-[#f5e6c8]">Cooking</span> (WIS Check): +1 to sleep check. Nat 1 = Save vs Doom or food ruined.</div>
            <div><span className="text-[#f5e6c8]">Camaraderie</span> (CHA Check): +1 to sleep check. Nat 1 = Save vs Doom or ridicule (-1).</div>
          </div>
        </div>

        <button
          onClick={() => setShowSleepMatrix(!showSleepMatrix)}
          className="text-[#c4a35a] text-sm hover:underline"
        >
          {showSleepMatrix ? 'Hide' : 'Show'} Full Sleep Matrix
        </button>
        {showSleepMatrix && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs text-[#f5e6c8]">
              <thead>
                <tr className="border-b border-[#5a3a28]">
                  <th className="text-left py-1 pr-2 text-[#c4a35a]">Fire</th>
                  <th className="text-left py-1 pr-2 text-[#c4a35a]">Bedding</th>
                  {(['Winter', 'Spring', 'Summer', 'Autumn'] as const).map((s) => (
                    <th key={s} className="text-center py-1 px-1 text-[#c4a35a]">{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(['none', 'campfire'] as const).map((fire) =>
                  (['none', 'bedrollOrTent', 'bedrollAndTent'] as const).map((bedding) => (
                    <tr key={`${fire}-${bedding}`} className="border-b border-[#5a3a28]/50">
                      <td className="py-1 pr-2">{fire === 'none' ? 'No fire' : 'Campfire'}</td>
                      <td className="py-1 pr-2">
                        {bedding === 'none' ? 'None' : bedding === 'bedrollOrTent' ? 'Bedroll/Tent' : 'Both'}
                      </td>
                      {(['Winter', 'Spring', 'Summer', 'Autumn'] as const).map((s) => {
                        const diff = SLEEP_MATRIX[fire][bedding][s];
                        return (
                          <td
                            key={s}
                            className="text-center py-1 px-1 capitalize"
                            style={{ color: SLEEP_DIFFICULTY_COLORS[diff] }}
                          >
                            {diff}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 5h. Reference Tables ─────────────────────────────────── */}
      <div className="bg-[#2a2a3e] rounded-lg p-4 space-y-3">
        <h2 className="text-[#c4a35a] text-xl font-bold border-b border-[#5a3a28] pb-2">
          Reference
        </h2>

        {/* Healing */}
        <button
          onClick={() => setShowHealingTable(!showHealingTable)}
          className="text-[#c4a35a] text-sm hover:underline"
        >
          {showHealingTable ? 'Hide' : 'Show'} Healing Rates
        </button>
        {showHealingTable && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-[#f5e6c8]">
              <thead>
                <tr className="border-b border-[#5a3a28]">
                  <th className="text-left py-1 pr-2 text-[#c4a35a]">Method</th>
                  <th className="text-left py-1 text-[#c4a35a]">HP Restored</th>
                </tr>
              </thead>
              <tbody>
                {HEALING_RATES.map((row) => (
                  <tr key={row.method} className="border-b border-[#5a3a28]/50">
                    <td className="py-1 pr-2">{row.method}</td>
                    <td className="py-1">{row.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Hunger/Thirst Effects */}
        <button
          onClick={() => setShowHungerTables(!showHungerTables)}
          className="text-[#c4a35a] text-sm hover:underline"
        >
          {showHungerTables ? 'Hide' : 'Show'} Hunger & Thirst Effects
        </button>
        {showHungerTables && (
          <div className="space-y-3">
            <div>
              <div className="text-[#c4a35a] text-sm font-semibold mb-1">Mortal / Demi-Fey Hunger</div>
              <table className="w-full text-xs text-[#f5e6c8]">
                <thead>
                  <tr className="border-b border-[#5a3a28]">
                    <th className="text-left py-1 pr-2 text-[#c4a35a]">Days</th>
                    <th className="text-left py-1 text-[#c4a35a]">Effect</th>
                  </tr>
                </thead>
                <tbody>
                  {HUNGER_EFFECTS_MORTAL.map((row) => (
                    <tr key={row.days} className="border-b border-[#5a3a28]/50">
                      <td className="py-1 pr-2">{row.days}</td>
                      <td className="py-1">{row.effect}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <div className="text-[#c4a35a] text-sm font-semibold mb-1">Fairy Hunger (Elf, Grimalkin)</div>
              <table className="w-full text-xs text-[#f5e6c8]">
                <thead>
                  <tr className="border-b border-[#5a3a28]">
                    <th className="text-left py-1 pr-2 text-[#c4a35a]">Days</th>
                    <th className="text-left py-1 text-[#c4a35a]">Effect</th>
                  </tr>
                </thead>
                <tbody>
                  {HUNGER_EFFECTS_FAIRY.map((row) => (
                    <tr key={row.days} className="border-b border-[#5a3a28]/50">
                      <td className="py-1 pr-2">{row.days}</td>
                      <td className="py-1">{row.effect}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[#f5e6c8]/60 text-xs">
              Thirst: Same as hunger effects PLUS -3 CON per day. Death at 0 CON. Speed never below 10.
            </div>
          </div>
        )}
      </div>

      {/* ── 5i. Calendar Info + Season + Journal (existing) ──────── */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h3 className="text-[#c4a35a] text-lg font-bold mb-3">
          {currentMonth.name} — {currentMonth.season}
        </h3>
        <div className="text-[#f5e6c8] text-sm mb-2">
          {currentMonth.days} days &middot; {currentMonth.description}
        </div>
        <div className="text-[#f5e6c8]/60 text-sm mb-2">
          Moon: {currentMonth.moonName}
          {currentMonth.wysendays.length > 0 && (
            <span> &middot; Wysendays: {currentMonth.wysendays.join(', ')}</span>
          )}
        </div>

        {festivalsThisMonth.length > 0 && (
          <div className="mt-3">
            <div className="text-[#c4a35a] text-sm font-semibold mb-1">Festivals</div>
            <ul className="space-y-1">
              {festivalsThisMonth.map((f) => (
                <li key={`${f.day}-${f.name}`} className="text-[#c4a35a] italic text-sm">
                  Day {f.day} — {f.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {celestialThisMonth.length > 0 && (
          <div className="mt-3">
            <div className="text-[#c4a35a] text-sm font-semibold mb-1">Celestial Events</div>
            <ul className="space-y-1">
              {celestialThisMonth.map((e) => (
                <li key={`${e.day}-${e.name}`} className="text-[#c4a35a] italic text-sm">
                  Day {e.day} — {e.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {festivalsThisMonth.length === 0 && celestialThisMonth.length === 0 && (
          <div className="text-[#f5e6c8]/40 text-sm italic mt-2">
            No festivals or celestial events this month.
          </div>
        )}
      </div>

      {/* Season Display */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h3 className="text-[#c4a35a] text-lg font-bold mb-3">Season</h3>
        <div className="flex gap-2">
          {(['Winter', 'Spring', 'Summer', 'Autumn'] as const).map((s) => (
            <div
              key={s}
              className={`flex-1 text-center rounded py-2 text-sm font-semibold transition-colors ${
                currentMonth.season === s
                  ? 'ring-2 ring-[#c4a35a]'
                  : 'opacity-40'
              }`}
              style={{
                backgroundColor: currentMonth.season === s
                  ? SEASON_COLORS[s]
                  : `${SEASON_COLORS[s]}33`,
                color: currentMonth.season === s ? '#1a1a2e' : SEASON_COLORS[s],
              }}
            >
              {s}
            </div>
          ))}
        </div>
      </div>

      {/* Journal */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <div className="flex items-center justify-between mb-4 border-b border-[#5a3a28] pb-2">
          <h3 className="text-[#c4a35a] text-lg font-bold">Journal</h3>
          <button onClick={handleAddJournalEntry} className={buttonClasses}>
            Add Entry
          </button>
        </div>

        {journalEntries.length === 0 && (
          <div className="text-[#f5e6c8]/40 text-sm italic">
            No journal entries yet. Add one to start recording your adventures.
          </div>
        )}

        <div className="space-y-2">
          {journalEntries.map((entry) => (
            <div key={entry.id} className="bg-[#1a1a2e] rounded p-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-[#c4a35a] text-sm font-semibold">
                    {formatCalendarDate(entry.date)}
                  </div>
                  {entry.location && (
                    <div className="text-[#f5e6c8]/60 text-xs">
                      {entry.location}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteJournalEntry(entry.id)}
                  className="text-red-400 hover:text-red-300 text-sm px-2 py-0.5 rounded hover:bg-red-400/10 transition-colors"
                >
                  Delete
                </button>
              </div>
              <textarea
                value={entry.text}
                onChange={(e) => handleUpdateJournalEntry(entry.id, e.target.value)}
                placeholder="What happened today?"
                rows={3}
                className={`${inputClasses} w-full resize-y`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
