'use client';

import { useState, useCallback, lazy, Suspense } from 'react';
import Link from 'next/link';
import { useCharacter } from '@/hooks/useCharacter';
import { useCloudStorage } from '@/hooks/useCloudStorage';
import CharacterInfo from '@/components/CharacterInfo';
import AbilityScores from '@/components/AbilityScores';
import CombatStats from '@/components/CombatStats';
import Inventory from '@/components/Inventory';
import SpellsAndMagic from '@/components/SpellsAndMagic';
import TraitsAndNotes from '@/components/TraitsAndNotes';
import Adventuring from '@/components/Adventuring';
import HexMap from '@/components/HexMap';
import ReferencePanel from '@/components/ReferencePanel';
import CloudStatusBadge from '@/components/CloudStatusBadge';

const CloudStorageModal = lazy(() => import('@/components/CloudStorageModal'));

type Tab = 'character' | 'abilities' | 'combat' | 'inventory' | 'spells' | 'traits' | 'calendar' | 'map' | 'reference';

const TABS: { id: Tab; label: string; shortLabel: string }[] = [
  { id: 'character', label: 'Character', shortLabel: 'Char' },
  { id: 'abilities', label: 'Abilities & Saves', shortLabel: 'Stats' },
  { id: 'combat', label: 'Combat', shortLabel: 'Combat' },
  { id: 'inventory', label: 'Inventory', shortLabel: 'Inv' },
  { id: 'spells', label: 'Spells & Magic', shortLabel: 'Magic' },
  { id: 'traits', label: 'Traits & Notes', shortLabel: 'Traits' },
  { id: 'calendar', label: 'Adventuring', shortLabel: 'Adv' },
  { id: 'map', label: 'Map', shortLabel: 'Map' },
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
    getCharacterJson,
    importCharacterFromJson,
  } = useCharacter();

  const cloud = useCloudStorage();

  const [activeTab, setActiveTab] = useState<Tab>('character');
  const [showCharList, setShowCharList] = useState(false);
  const [showCloudModal, setShowCloudModal] = useState(false);

  const handleCloudSave = useCallback(async (providerId: 'google-drive' | 'onedrive') => {
    if (!activeCharacter) return;
    const json = getCharacterJson();
    if (!json) return;
    await cloud.saveCharacter(providerId, activeCharacter.id, json, activeCharacter.name);
  }, [activeCharacter, getCharacterJson, cloud]);

  const handleCloudLoad = useCallback(async (providerId: 'google-drive' | 'onedrive', fileId: string, fileName: string) => {
    const json = await cloud.loadCharacter(providerId, fileId);
    const newCharId = importCharacterFromJson(json);
    cloud.setMetadata(newCharId, providerId, fileId, fileName);
  }, [cloud, importCharacterFromJson]);

  if (!loaded || !activeCharacter) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#c4a35a] mb-2">Dolmen Spot</h1>
          <p className="text-[#f5e6c8]/60">Loading character sheet...</p>
        </div>
      </div>
    );
  }

  const cloudMetadata = cloud.getMetadata(activeCharacter.id);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-[#1a1a2e] border-b border-[#5a3a28] sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-[#c4a35a] tracking-wide">
                Dolmen Spot
              </span>
              <div className="hidden sm:block text-[#f5e6c8]/40 text-xs">|</div>
              <button
                onClick={() => setShowCharList(!showCharList)}
                className="text-sm text-[#f5e6c8] hover:text-[#c4a35a] transition-colors flex items-center gap-1"
              >
                <span className="font-semibold truncate max-w-[150px]">
                  {activeCharacter.name || 'Unnamed'}
                </span>
                <CloudStatusBadge metadata={cloudMetadata} />
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
                onClick={() => setShowCloudModal(true)}
                className="text-xs px-2 py-1 bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded transition-colors flex items-center gap-1"
                title="Save / Load character"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
                <span className="hidden sm:inline">Save / Load</span>
              </button>
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
        <h1 className="sr-only">
          {TABS.find(t => t.id === activeTab)?.label ?? 'Dolmen Spot'}
        </h1>
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
          <Adventuring character={activeCharacter} onChange={updateCharacter} />
        )}
        {activeTab === 'map' && (
          <HexMap character={activeCharacter} onChange={updateCharacter} />
        )}
        {activeTab === 'reference' && (
          <ReferencePanel />
        )}
      </main>

      {/* Cloud Storage Modal */}
      {showCloudModal && (
        <Suspense fallback={null}>
          <CloudStorageModal
            open={showCloudModal}
            onClose={() => setShowCloudModal(false)}
            providers={cloud.providers}
            authStates={cloud.authStates}
            onConnect={cloud.connect}
            onDisconnect={cloud.disconnect}
            onListFiles={cloud.listFiles}
            onSave={handleCloudSave}
            onLoad={handleCloudLoad}
            onDelete={cloud.deleteFile}
            onExportLocal={exportCharacter}
            onImportLocal={importCharacter}
            loading={cloud.loading}
            error={cloud.error}
            onClearError={cloud.clearError}
            characterName={activeCharacter.name}
          />
        </Suspense>
      )}

      {/* Footer */}
      <footer className="bg-[#1a1a2e] border-t border-[#5a3a28] py-2 text-center">
        <p className="text-xs text-[#f5e6c8]/30">
          Dolmenwood is a trademark of Necrotic Gnome. This is an unofficial fan tool.
        </p>
        <p className="text-xs text-[#f5e6c8]/30 mt-1">
          Found a bug? <a href="https://github.com/TheBeege/dolmen-spot/issues" target="_blank" rel="noopener noreferrer" className="text-[#c4a35a]/50 hover:text-[#c4a35a] underline transition-colors">File an issue on GitHub</a>
        </p>
        <p className="text-xs text-[#f5e6c8]/30 mt-1">
          <Link href="/changelog" className="hover:text-[#c4a35a] transition-colors">Changelog</Link>
          {' · '}
          <Link href="/about" className="hover:text-[#c4a35a] transition-colors">About</Link>
        </p>
      </footer>
    </div>
  );
}
