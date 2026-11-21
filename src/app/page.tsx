'use client';

import { useState, useCallback, useRef, lazy, Suspense } from 'react';
import Link from 'next/link';
import { useCharacter } from '@/hooks/useCharacter';
import { useCloudStorage } from '@/hooks/useCloudStorage';
import { useFocusAfterRender } from '@/hooks/useFocusAfterRender';
import { getKindredClassLabel } from '@/lib/gamedata';
import CharacterInfo from '@/components/CharacterInfo';
import AbilityScores from '@/components/AbilityScores';
import CombatStats from '@/components/CombatStats';
import Inventory from '@/components/Inventory';
import SpellsAndMagic from '@/components/SpellsAndMagic';
import TraitsAndNotes from '@/components/TraitsAndNotes';
import Adventuring from '@/components/Adventuring';
import Journal, { type JournalOpening } from '@/components/Journal';
import HexMap from '@/components/HexMap';
import ReferencePanel from '@/components/ReferencePanel';
import TabBar, { panelElementId, tabElementId, type TabBarTab } from '@/components/TabBar';
import CloudStatusBadge from '@/components/CloudStatusBadge';
import ExportPdfButton from '@/components/ExportPdfButton';
import StorageBanner, { StorageAnnouncer, StorageReminder } from '@/components/StorageBanner';
import { ImportError } from '@/lib/storage';
import { isInFairy } from '@/lib/livedTime';
import type { HexCoord } from '@/lib/types';

const CloudStorageModal = lazy(() => import('@/components/CloudStorageModal'));

type Tab = 'character' | 'abilities' | 'combat' | 'inventory' | 'spells' | 'traits' | 'calendar' | 'journal' | 'map' | 'reference';

const TABS: TabBarTab<Tab>[] = [
  { id: 'character', label: 'Character', shortLabel: 'Char' },
  { id: 'abilities', label: 'Abilities & Saves', shortLabel: 'Stats' },
  { id: 'combat', label: 'Combat', shortLabel: 'Combat' },
  { id: 'inventory', label: 'Inventory', shortLabel: 'Inv' },
  { id: 'spells', label: 'Spells & Magic', shortLabel: 'Magic' },
  { id: 'traits', label: 'Traits & Notes', shortLabel: 'Traits' },
  { id: 'calendar', label: 'Adventuring', shortLabel: 'Adv' },
  { id: 'journal', label: 'Journal', shortLabel: 'Journal' },
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
    exportAllCharacters,
    importCharacter,
    getCharacterJson,
    importCharacterFromJson,
  } = useCharacter();

  const cloud = useCloudStorage();

  const [activeTab, setActiveTab] = useState<Tab>('character');
  const [showCharList, setShowCharList] = useState(false);
  const [showCloudModal, setShowCloudModal] = useState(false);
  // Set while another tab's button opens the Journal (see JournalOpening).
  const [journalOpening, setJournalOpening] = useState<JournalOpening | null>(null);

  // Picking a character, or adding one, closes the list it was picked from,
  // so focus goes back to the button that opened it. Deleting one moves focus
  // to the row that takes its place. Either way it doesn't drop to the page.
  const switcherRef = useRef<HTMLButtonElement>(null);
  const characterListRef = useRef<HTMLDivElement>(null);
  const focusAfterRender = useFocusAfterRender();

  // The header's height, as --sticky-header-height on the page, sets the
  // page's scroll padding (globals.css): whatever is scrolled to or focused
  // stops below the header, however many rows its tabs take.
  const trackHeaderHeight = useCallback((header: HTMLElement | null) => {
    if (!header) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      root.style.setProperty('--sticky-header-height', `${header.offsetHeight}px`);
    });
    observer.observe(header, { box: 'border-box' });
    return () => {
      observer.disconnect();
      root.style.removeProperty('--sticky-header-height');
    };
  }, []);

  const selectTab = (tab: Tab) => {
    setJournalOpening(null);
    setActiveTab(tab);
  };
  const openJournal = useCallback((hex: HexCoord | null) => {
    setJournalOpening({ hex });
    setActiveTab('journal');
  }, []);
  const handleJournalOpened = useCallback(() => setJournalOpening(null), []);

  const handleCloudSave = useCallback(async (providerId: 'google-drive' | 'onedrive') => {
    if (!activeCharacter) return;
    const json = getCharacterJson();
    if (!json) return;
    await cloud.saveCharacter(providerId, activeCharacter.id, json, activeCharacter.name);
  }, [activeCharacter, getCharacterJson, cloud]);

  const handleCloudLoad = useCallback(async (providerId: 'google-drive' | 'onedrive', fileId: string, fileName: string) => {
    const json = await cloud.loadCharacter(providerId, fileId);
    let newCharId: string;
    try {
      newCharId = importCharacterFromJson(json);
    } catch (err) {
      // Nothing was added. Say why, then let the modal stay open.
      alert(err instanceof ImportError ? err.message : 'Invalid character file.');
      throw err;
    }
    cloud.setMetadata(newCharId, providerId, fileId, fileName);
  }, [cloud, importCharacterFromJson]);

  if (!loaded || !activeCharacter) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        {/* First in both layouts, so React keeps the same live region once loaded */}
        <StorageAnnouncer />
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
      <StorageAnnouncer />
      {/* Header */}
      <header ref={trackHeaderHeight} className="bg-[#1a1a2e] border-b border-[#5a3a28] sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-3 py-2">
          {/* The character and the buttons share the title's line while the
              character gets at least 10rem (basis-40); otherwise they wrap onto
              a line of their own below it. In rem, so it holds at any text size.
              There the name shrinks (min-w-0, truncate) to leave the buttons
              room; the title truncates only if it can't fit on a line alone. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-lg font-bold text-[#c4a35a] tracking-wide whitespace-nowrap min-w-0 truncate">
              Dolmen Spot
            </span>
            <div className="hidden sm:block text-[#f5e6c8]/40 text-xs">|</div>
            <div className="flex items-center gap-2 min-w-0 flex-1 basis-40">
              <button
                ref={switcherRef}
                type="button"
                onClick={() => setShowCharList(!showCharList)}
                aria-expanded={showCharList}
                className="text-sm text-[#f5e6c8] hover:text-[#c4a35a] transition-colors flex items-center gap-1 min-w-0"
              >
                {/* Below md the In Fairy badge sits under the name, so the name keeps
                    its room; the cloud icon and chevron then line up with the name.
                    The 150px cap is a fixed width (on this box below md, on the name
                    from md up) so a long name leaves no empty space after it. Below md
                    the name shrinks with this box when space runs short; from md up
                    the box keeps its size and the kindred/class text gives way. */}
                <span className="flex flex-col items-start min-w-0 max-w-[150px] md:max-w-none md:shrink-0 md:flex-row md:items-center md:gap-1">
                  <span className="font-semibold truncate min-w-0 max-w-full md:max-w-[150px]">
                    {activeCharacter.name || 'Unnamed'}
                  </span>
                  {isInFairy(activeCharacter) && (
                    // Under 320px there's no room for the words, so a star stands in for them.
                    <span
                      className="shrink-0 whitespace-nowrap text-[10px] leading-tight font-semibold uppercase tracking-wider text-[#c9b3f0] border border-[#8a6fb0]/70 bg-[#8a6fb0]/15 rounded-full px-1.5 py-px"
                      title="This character is in Fairy. Dolmenwood's calendar is paused for them."
                    >
                      <span aria-hidden="true" className="min-[320px]:hidden">✦</span>
                      <span className="max-[320px]:sr-only">In Fairy</span>
                    </span>
                  )}
                </span>
                {cloudMetadata && (
                  <span className="shrink-0 self-start mt-0.5 md:self-auto md:mt-0">
                    <CloudStatusBadge metadata={cloudMetadata} />
                  </span>
                )}
                {/* Shrinks first when space runs short, before the name does. */}
                <span className="hidden sm:inline text-[#f5e6c8]/70 text-xs truncate min-w-0 shrink-[4] self-start mt-0.5 md:self-auto md:mt-0">
                  {getKindredClassLabel(activeCharacter)}
                </span>
                <svg className="w-3 h-3 ml-1 shrink-0 self-start mt-1 md:self-auto md:mt-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <div className="flex items-center gap-2 shrink-0 ml-auto">
                <ExportPdfButton character={activeCharacter} />
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
                    focusAfterRender(switcherRef);
                  }}
                  className="text-xs px-2 py-0.5 bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded transition-colors"
                >
                  + New
                </button>
              </div>
              <div ref={characterListRef} className="space-y-1 max-h-48 overflow-y-auto">
                {characters.map((c, i) => (
                  <div
                    key={c.id}
                    className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors ${
                      c.id === activeCharacter.id
                        ? 'bg-[#c4a35a]/20 border border-[#c4a35a]/40'
                        : 'hover:bg-[#1a1a2e]'
                    }`}
                  >
                    <button
                      data-character-id={c.id}
                      onClick={() => {
                        switchCharacter(c.id);
                        setShowCharList(false);
                        focusAfterRender(switcherRef);
                      }}
                      className="text-left flex-1 min-w-0"
                    >
                      <div className="text-sm text-[#f5e6c8] truncate">
                        {c.name || 'Unnamed'}
                      </div>
                      <div className="text-xs text-[#f5e6c8]/70">
                        {[getKindredClassLabel(c), `Lv.${c.level}`].filter(Boolean).join(' ')}
                        {isInFairy(c) && <span className="text-[#c9b3f0]"> <span className="whitespace-nowrap">&middot; In Fairy</span></span>}
                      </div>
                    </button>
                    {characters.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete ${c.name || 'this character'}?`)) {
                            // This row goes, so focus the one that moves up into
                            // its place (or, for the last, the one before it).
                            const next = characters[i + 1] ?? characters[i - 1];
                            deleteCharacter(c.id);
                            if (next) {
                              characterListRef.current
                                ?.querySelector<HTMLElement>(`[data-character-id="${CSS.escape(next.id)}"]`)
                                ?.focus();
                            }
                          }
                        }}
                        className="text-[#ff9a85] hover:text-[#ffd0c4] text-xs ml-2 shrink-0"
                        title="Delete character"
                        aria-label={`Delete ${c.name || 'this character'}`}
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
          <TabBar tabs={TABS} activeTab={activeTab} onSelect={selectTab} label="Character sheet sections" />
        </div>

        {/* One line, only while changes aren't being saved */}
        <StorageReminder />
      </header>

      {/* Only when saved data couldn't be read or saving fails; scrolls away with the page */}
      <StorageBanner
        characterCount={characters.length}
        onExportCharacter={exportCharacter}
        onExportAll={exportAllCharacters}
      />

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-3 py-4">
        <h1 className="sr-only">
          {TABS.find(t => t.id === activeTab)?.label ?? 'Dolmen Spot'}
        </h1>
        {/* A panel for every tab, so that each tab's aria-controls points at
            one; only the active tab's is drawn. tabIndex lets the keyboard
            reach a panel that starts with text rather than a control. */}
        {TABS.map(({ id }) => (
          <div
            key={id}
            role="tabpanel"
            id={panelElementId(id)}
            aria-labelledby={tabElementId(id)}
            hidden={id !== activeTab}
            tabIndex={0}
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c4a35a]"
          >
            {id === activeTab && (
              <>
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
                  <Adventuring character={activeCharacter} onChange={updateCharacter} onOpenJournal={() => openJournal(null)} />
                )}
                {activeTab === 'journal' && (
                  // Keyed by character so the search, filter and open editors reset
                  // when switching characters instead of carrying over.
                  <Journal
                    key={activeCharacter.id}
                    character={activeCharacter}
                    onChange={updateCharacter}
                    opening={journalOpening}
                    onOpened={handleJournalOpened}
                  />
                )}
                {activeTab === 'map' && (
                  // Keyed by character so selections, open forms and the view reset
                  // when switching characters instead of carrying over.
                  <HexMap key={activeCharacter.id} character={activeCharacter} onChange={updateCharacter} onOpenJournal={openJournal} />
                )}
                {activeTab === 'reference' && (
                  <ReferencePanel />
                )}
              </>
            )}
          </div>
        ))}
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
            saving={cloud.saving}
            listing={cloud.listing}
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
