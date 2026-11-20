'use client';

import { useState, useEffect, useCallback } from 'react';
import { Character } from '@/lib/types';
import { downloadFile, localFileStamp } from '@/lib/download';
import { createNewAdventurer, getCharacterStore, ImportError, parseImportedCharacters } from '@/lib/storage';

interface CharacterSession {
  characters: Character[];
  activeId: string | null;
}

export function useCharacter() {
  // One state value, so every change below is a single functional update.
  const [session, setSession] = useState<CharacterSession>({ characters: [], activeId: null });
  const [loaded, setLoaded] = useState(false);
  const { characters, activeId } = session;

  useEffect(() => {
    // load() never throws and never overwrites saved data it couldn't read.
    // While changes aren't being saved it hands back this tab's characters,
    // so remounting (e.g. after visiting the changelog) keeps unsaved work.
    setSession(getCharacterStore().load());
    setLoaded(true);
  }, []);

  // Persist every change. Saving is a side effect, so it lives here rather
  // than inside the state updaters below, which React may call more than
  // once. Neither call throws: problems are reported through the store's
  // status, and the storage banner warns the player.
  useEffect(() => {
    if (loaded) getCharacterStore().saveCharacters(characters);
  }, [characters, loaded]);

  useEffect(() => {
    if (loaded && activeId) getCharacterStore().saveActiveId(activeId);
  }, [activeId, loaded]);

  const activeCharacter = characters.find(c => c.id === activeId) ?? null;

  const updateCharacter = useCallback((updates: Partial<Character>) => {
    setSession(prev => ({
      ...prev,
      characters: prev.characters.map(c =>
        c.id === prev.activeId ? { ...c, ...updates } : c
      ),
    }));
  }, []);

  const createCharacter = useCallback(() => {
    const newChar = createNewAdventurer();
    setSession(prev => ({ characters: [...prev.characters, newChar], activeId: newChar.id }));
    return newChar;
  }, []);

  const deleteCharacter = useCallback((id: string) => {
    // Made out here so a repeated call of the updater gives the same result.
    const replacement = createNewAdventurer();
    setSession(prev => {
      const remaining = prev.characters.filter(c => c.id !== id);
      const next = remaining.length > 0 ? remaining : [replacement];
      return { characters: next, activeId: prev.activeId === id ? next[0].id : prev.activeId };
    });
  }, []);

  const switchCharacter = useCallback((id: string) => {
    setSession(prev => ({ ...prev, activeId: id }));
  }, []);

  const exportCharacter = useCallback(() => {
    if (!activeCharacter) return;
    downloadFile(`${activeCharacter.name || 'character'}.dolmenwood.json`, JSON.stringify(activeCharacter, null, 2));
  }, [activeCharacter]);

  // One file with every character. Import Character accepts it.
  const exportAllCharacters = useCallback(() => {
    downloadFile(`dolmen-spot-characters-${localFileStamp()}.dolmenwood.json`, JSON.stringify(characters, null, 2));
  }, [characters]);

  const importCharacter = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      let imported: Character[];
      try {
        // Throws on a bad file before anything is added.
        imported = parseImportedCharacters(String(e.target?.result ?? ''), { allowMany: true });
      } catch (err) {
        alert(err instanceof ImportError ? err.message : 'Invalid character file.');
        return;
      }
      setSession(prev => ({ characters: [...prev.characters, ...imported], activeId: imported[0].id }));
    };
    reader.readAsText(file);
  }, []);

  const getCharacterJson = useCallback((): string | null => {
    if (!activeCharacter) return null;
    return JSON.stringify(activeCharacter, null, 2);
  }, [activeCharacter]);

  const importCharacterFromJson = useCallback((json: string): string => {
    // Throws (an ImportError for a bad file) before anything is added.
    const [data] = parseImportedCharacters(json);
    setSession(prev => ({ characters: [...prev.characters, data], activeId: data.id }));
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
    exportAllCharacters,
    importCharacter,
    getCharacterJson,
    importCharacterFromJson,
  };
}
