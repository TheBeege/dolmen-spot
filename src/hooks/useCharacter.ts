'use client';

import { useState, useEffect, useCallback } from 'react';
import { Character, CharacterUpdater } from '@/lib/types';
import { downloadFile, localFileStamp } from '@/lib/download';
import { characterFileJson, createNewAdventurer, getCharacterStore, ImportError, parseImportedCharacters } from '@/lib/storage';

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

  // `updates` may be either a partial-character object or a function that
  // receives the current character and returns one. The functional form is
  // necessary when multiple in-tick writes need to compose without losing
  // each other — the second writer otherwise reads a stale snapshot. Either
  // way the updater stays pure (React may call it twice), and the save
  // happens in the effect above.
  const updateCharacter = useCallback((updates: CharacterUpdater) => {
    setSession(prev => ({
      ...prev,
      characters: prev.characters.map(c => {
        if (c.id !== prev.activeId) return c;
        const patch = typeof updates === 'function' ? updates(c) : updates;
        return { ...c, ...patch };
      }),
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
    downloadFile(`${activeCharacter.name || 'character'}.dolmenwood.json`, characterFileJson(activeCharacter));
  }, [activeCharacter]);

  // One file with every character. Import Character accepts it.
  const exportAllCharacters = useCallback(() => {
    downloadFile(`dolmen-spot-characters-${localFileStamp()}.dolmenwood.json`, characterFileJson(characters));
  }, [characters]);

  /** Add the characters in a file. Resolves to false, with nothing added, if the file was refused. */
  const importCharacter = useCallback((file: File): Promise<boolean> => new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = (e) => {
      let imported: Character[];
      try {
        // Throws on a bad file before anything is added.
        imported = parseImportedCharacters(String(e.target?.result ?? ''), { allowMany: true });
      } catch (err) {
        alert(err instanceof ImportError ? err.message : 'Invalid character file.');
        resolve(false);
        return;
      }
      setSession(prev => ({ characters: [...prev.characters, ...imported], activeId: imported[0].id }));
      resolve(true);
    };
    reader.onerror = () => {
      alert("That file couldn't be read.");
      resolve(false);
    };
    reader.readAsText(file);
  }), []);

  const getCharacterJson = useCallback((): string | null => {
    if (!activeCharacter) return null;
    return characterFileJson(activeCharacter);
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
