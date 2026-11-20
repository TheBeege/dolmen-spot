'use client';

import { useState, useEffect, useCallback } from 'react';
import { Character } from '@/lib/types';
import { createNewAdventurer, getCharacterStore, parseImportedCharacter } from '@/lib/storage';

// Never throws; skipped while saving is paused (see lib/storage.ts).
function saveActiveId(id: string) {
  getCharacterStore().saveActiveId(id);
}

export function useCharacter() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // load() never throws, and never overwrites saved data it couldn't read.
    // Problems are reported through the store's status (see <StorageBanner>).
    const { characters: chars, activeId: id } = getCharacterStore().load();
    setCharacters(chars);
    setActiveId(id);
    setLoaded(true);
  }, []);

  // Persist every change. Saving is a side effect, so it lives here rather
  // than inside the state updaters below, which React may call more than
  // once. saveCharacters() never throws: a failed save is reported through
  // the store's status, and the banner warns the player.
  useEffect(() => {
    if (loaded) getCharacterStore().saveCharacters(characters);
  }, [characters, loaded]);

  const activeCharacter = characters.find(c => c.id === activeId) ?? null;

  const updateCharacter = useCallback((updates: Partial<Character>) => {
    setCharacters(prev => prev.map(c =>
      c.id === activeId ? { ...c, ...updates } : c
    ));
  }, [activeId]);

  const createCharacter = useCallback(() => {
    const newChar = createNewAdventurer();
    setCharacters(prev => [...prev, newChar]);
    setActiveId(newChar.id);
    saveActiveId(newChar.id);
    return newChar;
  }, []);

  const deleteCharacter = useCallback((id: string) => {
    const next = characters.filter(c => c.id !== id);
    if (next.length === 0) next.push(createNewAdventurer());
    setCharacters(next);
    if (activeId === id) {
      setActiveId(next[0].id);
      saveActiveId(next[0].id);
    }
  }, [characters, activeId]);

  const switchCharacter = useCallback((id: string) => {
    setActiveId(id);
    saveActiveId(id);
  }, []);

  const exportCharacter = useCallback(() => {
    if (!activeCharacter) return;
    const blob = new Blob([JSON.stringify(activeCharacter, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeCharacter.name || 'character'}.dolmenwood.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeCharacter]);

  const importCharacter = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        // Throws on a bad file before anything is added.
        const data = parseImportedCharacter(e.target?.result as string);
        setCharacters(prev => [...prev, data]);
        setActiveId(data.id);
        saveActiveId(data.id);
      } catch {
        alert('Invalid character file.');
      }
    };
    reader.readAsText(file);
  }, []);

  const getCharacterJson = useCallback((): string | null => {
    if (!activeCharacter) return null;
    return JSON.stringify(activeCharacter, null, 2);
  }, [activeCharacter]);

  const importCharacterFromJson = useCallback((json: string): string => {
    // Throws on a bad file before anything is added.
    const data = parseImportedCharacter(json);
    setCharacters(prev => [...prev, data]);
    setActiveId(data.id);
    saveActiveId(data.id);
    return data.id;
  }, []);

  return {
    characters,
    activeCharacter,
    activeId,
    loaded,
    updateCharacter,
    createCharacter,
    deleteCharacter,
    switchCharacter,
    exportCharacter,
    importCharacter,
    getCharacterJson,
    importCharacterFromJson,
  };
}
