'use client';

import { Character, CalendarDate, JournalEntry } from '@/lib/types';
import { MONTHS, DAY_NAMES, getDayName, formatCalendarDate, FESTIVALS, CELESTIAL_EVENTS } from '@/lib/gamedata';

interface CalendarProps {
  character: Character;
  onChange: (updates: Partial<Character>) => void;
}

const inputClasses =
  'bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a]';

const labelClasses = 'block text-[#c4a35a] text-sm font-semibold mb-1';

const buttonClasses =
  'bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-3 py-1 transition-colors';

const SEASON_COLORS: Record<string, string> = {
  Winter: '#a0c4e8',
  Spring: '#8fb368',
  Summer: '#c4a35a',
  Autumn: '#c47a3a',
};

function advanceDay(date: CalendarDate, delta: number): CalendarDate {
  let { day, month } = date;
  day += delta;

  if (delta > 0) {
    while (day > MONTHS[month].days) {
      day -= MONTHS[month].days;
      month = (month + 1) % 12;
    }
  } else {
    while (day < 1) {
      month = (month - 1 + 12) % 12;
      day += MONTHS[month].days;
    }
  }

  return { day, month };
}

function getFestivalsForMonth(month: number): { day: number; name: string }[] {
  return (FESTIVALS.festivals || []).filter((f) => f.month === month);
}

function getCelestialEventsForMonth(month: number): { day: number; name: string }[] {
  return CELESTIAL_EVENTS.filter((e) => e.month === month);
}

export default function Calendar({ character, onChange }: CalendarProps) {
  const { currentDate, currentLocation, journalEntries } = character;
  const currentMonth = MONTHS[currentDate.month];
  const seasonColor = SEASON_COLORS[currentMonth.season] || '#f5e6c8';

  const handlePreviousDay = () => {
    onChange({ currentDate: advanceDay(currentDate, -1) });
  };

  const handleNextDay = () => {
    onChange({ currentDate: advanceDay(currentDate, 1) });
  };

  const handleMonthChange = (newMonth: number) => {
    const maxDay = MONTHS[newMonth].days;
    const clampedDay = Math.min(currentDate.day, maxDay);
    onChange({ currentDate: { day: clampedDay, month: newMonth } });
  };

  const handleDayChange = (newDay: number) => {
    const maxDay = currentMonth.days;
    const clampedDay = Math.max(1, Math.min(newDay, maxDay));
    onChange({ currentDate: { ...currentDate, day: clampedDay } });
  };

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

  const festivalsThisMonth = getFestivalsForMonth(currentDate.month);
  const celestialThisMonth = getCelestialEventsForMonth(currentDate.month);

  return (
    <div className="space-y-4">
      {/* Current Date Display */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h2 className="text-[#c4a35a] text-xl font-bold mb-4 border-b border-[#5a3a28] pb-2">
          Calendar
        </h2>

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
        </div>

        <div className="flex items-center justify-center gap-3 mb-4">
          <button onClick={handlePreviousDay} className={buttonClasses}>
            Previous Day
          </button>
          <button onClick={handleNextDay} className={buttonClasses}>
            Next Day
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
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
        </div>
      </div>

      {/* Current Location */}
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

      {/* Calendar Info for Current Month */}
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <h3 className="text-[#c4a35a] text-lg font-bold mb-3">
          {currentMonth.name} — {currentMonth.season}
        </h3>
        <div className="text-[#f5e6c8] text-sm mb-2">
          {currentMonth.days} days &middot; {currentMonth.description}
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
          {(['Winter', 'Spring', 'Summer', 'Autumn'] as const).map((season) => (
            <div
              key={season}
              className={`flex-1 text-center rounded py-2 text-sm font-semibold transition-colors ${
                currentMonth.season === season
                  ? 'ring-2 ring-[#c4a35a]'
                  : 'opacity-40'
              }`}
              style={{
                backgroundColor: currentMonth.season === season
                  ? SEASON_COLORS[season]
                  : `${SEASON_COLORS[season]}33`,
                color: currentMonth.season === season ? '#1a1a2e' : SEASON_COLORS[season],
              }}
            >
              {season}
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
