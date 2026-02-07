'use client';

import { useState, useRef } from 'react';
import { useCharacter } from '@/hooks/useCharacter';
import CharacterInfo from '@/components/CharacterInfo';
import AbilityScores from '@/components/AbilityScores';
import CombatStats from '@/components/CombatStats';
import Inventory from '@/components/Inventory';
import SpellsAndMagic from '@/components/SpellsAndMagic';
import TraitsAndNotes from '@/components/TraitsAndNotes';
import Calendar from '@/components/Calendar';
import ReferencePanel from '@/components/ReferencePanel';

type Tab = 'character' | 'abilities' | 'combat' | 'inventory' | 'spells' | 'traits' | 'calendar' | 'reference';

const TABS: { id: Tab; label: string; shortLabel: string }[] = [
  { id: 'character', label: 'Character', shortLabel: 'Char' },
  { id: 'abilities', label: 'Abilities & Saves', shortLabel: 'Stats' },
  { id: 'combat', label: 'Combat', shortLabel: 'Combat' },
  { id: 'inventory', label: 'Inventory', shortLabel: 'Inv' },
  { id: 'spells', label: 'Spells & Magic', shortLabel: 'Magic' },
  { id: 'traits', label: 'Traits & Notes', shortLabel: 'Traits' },
  { id: 'calendar', label: 'Calendar & Journal', shortLabel: 'Cal' },
  { id: 'reference', label: 'Reference', shortLabel: 'Ref' },
];

export default function Home() {
  const {
    characters,
    activeCharacter,
    loaded,
    updateCharacter,
    createCharacter,
    deleteCharacter,
    switchCharacter,
    exportCharacter,
    importCharacter,
  } = useCharacter();

  const [activeTab, setActiveTab] = useState<Tab>('character');
  const [showCharList, setShowCharList] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!loaded || !activeCharacter) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#c4a35a] mb-2">Dolmenwood</h1>
          <p className="text-[#f5e6c8]/60">Loading character sheet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-[#1a1a2e] border-b border-[#5a3a28] sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-[#c4a35a] tracking-wide">
                Dolmenwood
              </h1>
              <div className="hidden sm:block text-[#f5e6c8]/40 text-xs">|</div>
              <button
                onClick={() => setShowCharList(!showCharList)}
                className="text-sm text-[#f5e6c8] hover:text-[#c4a35a] transition-colors flex items-center gap-1"
              >
                <span className="font-semibold truncate max-w-[150px]">
                  {activeCharacter.name || 'Unnamed'}
                </span>
                <span className="text-[#f5e6c8]/40 text-xs">
                  {activeCharacter.kindred && activeCharacter.class
                    ? `${activeCharacter.kindred} ${activeCharacter.class}`
                    : ''}
                </span>
                <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={exportCharacter}
                className="text-xs px-2 py-1 bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded transition-colors"
                title="Export character"
              >
                Export
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs px-2 py-1 bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded transition-colors"
                title="Import character"
              >
                Import
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importCharacter(file);
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          {/* Character Switcher Dropdown */}
          {showCharList && (
            <div className="mt-2 bg-[#2a2a3e] rounded-lg border border-[#5a3a28] p-2 shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#c4a35a] font-semibold">Characters</span>
                <button
                  onClick={() => {
                    createCharacter();
                    setShowCharList(false);
                  }}
                  className="text-xs px-2 py-0.5 bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded transition-colors"
                >
                  + New
                </button>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {characters.map(c => (
                  <div
                    key={c.id}
                    className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors ${
                      c.id === activeCharacter.id
                        ? 'bg-[#c4a35a]/20 border border-[#c4a35a]/40'
                        : 'hover:bg-[#1a1a2e]'
                    }`}
                  >
                    <button
                      onClick={() => {
                        switchCharacter(c.id);
                        setShowCharList(false);
                      }}
                      className="text-left flex-1 min-w-0"
                    >
                      <div className="text-sm text-[#f5e6c8] truncate">
                        {c.name || 'Unnamed'}
                      </div>
                      <div className="text-xs text-[#f5e6c8]/40">
                        {c.kindred || '???'} {c.class || '???'} Lv.{c.level}
                      </div>
                    </button>
                    {characters.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete ${c.name || 'this character'}?`)) {
                            deleteCharacter(c.id);
                          }
                        }}
                        className="text-[#8b2500] hover:text-[#b33a1a] text-xs ml-2 shrink-0"
                        title="Delete character"
                      >
                        Del
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="max-w-6xl mx-auto px-3">
          <nav className="flex gap-0.5 overflow-x-auto scrollbar-hide pb-0.5 -mb-px">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold whitespace-nowrap rounded-t transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'text-[#c4a35a] border-[#c4a35a] bg-[#2a2a3e]/50'
                    : 'text-[#f5e6c8]/60 border-transparent hover:text-[#f5e6c8] hover:border-[#5a3a28]'
                }`}
              >
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-3 py-4">
        {activeTab === 'character' && (
          <CharacterInfo character={activeCharacter} onChange={updateCharacter} />
        )}
        {activeTab === 'abilities' && (
          <AbilityScores character={activeCharacter} onChange={updateCharacter} />
        )}
        {activeTab === 'combat' && (
          <CombatStats character={activeCharacter} onChange={updateCharacter} />
        )}
        {activeTab === 'inventory' && (
          <Inventory character={activeCharacter} onChange={updateCharacter} />
        )}
        {activeTab === 'spells' && (
          <SpellsAndMagic character={activeCharacter} onChange={updateCharacter} />
        )}
        {activeTab === 'traits' && (
          <TraitsAndNotes character={activeCharacter} onChange={updateCharacter} />
        )}
        {activeTab === 'calendar' && (
          <Calendar character={activeCharacter} onChange={updateCharacter} />
        )}
        {activeTab === 'reference' && (
          <ReferencePanel />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-[#1a1a2e] border-t border-[#5a3a28] py-2 text-center">
        <p className="text-xs text-[#f5e6c8]/30">
          Dolmenwood is a trademark of Necrotic Gnome. This is an unofficial fan tool.
        </p>
      </footer>
    </div>
  );
}
