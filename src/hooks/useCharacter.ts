'use client';

import { useState, useEffect, useCallback } from 'react';
import { Character } from '@/lib/types';
import { createDefaultCharacter } from '@/lib/gamedata';
import { migrateCharacter } from '@/lib/migrations';

const STORAGE_KEY = 'dolmenwood-characters';
const ACTIVE_KEY = 'dolmenwood-active-character';

function loadCharacters(): Character[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data) as unknown[];
    const migrated = parsed.map(migrateCharacter);
    // Persist migrated data so migration only runs once per schema change
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return [];
  }
}

function saveCharacters(characters: Character[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(characters));
}

function loadActiveId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_KEY);
}

function saveActiveId(id: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACTIVE_KEY, id);
}

export function useCharacter() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const chars = loadCharacters();
    const id = loadActiveId();
    if (chars.length === 0) {
      const newChar = createDefaultCharacter();
      newChar.name = 'New Adventurer';
      setCharacters([newChar]);
      setActiveId(newChar.id);
      saveCharacters([newChar]);
      saveActiveId(newChar.id);
    } else {
      setCharacters(chars);
      setActiveId(id && chars.find(c => c.id === id) ? id : chars[0].id);
    }
    setLoaded(true);
  }, []);

  const activeCharacter = characters.find(c => c.id === activeId) ?? null;

  const updateCharacter = useCallback((updates: Partial<Character>) => {
    setCharacters(prev => {
      const next = prev.map(c =>
        c.id === activeId ? { ...c, ...updates } : c
      );
      saveCharacters(next);
      return next;
    });
  }, [activeId]);

  const createCharacter = useCallback(() => {
    const newChar = createDefaultCharacter();
    newChar.name = 'New Adventurer';
    setCharacters(prev => {
      const next = [...prev, newChar];
      saveCharacters(next);
      return next;
    });
    setActiveId(newChar.id);
    saveActiveId(newChar.id);
    return newChar;
  }, []);

  const deleteCharacter = useCallback((id: string) => {
    setCharacters(prev => {
      const next = prev.filter(c => c.id !== id);
      if (next.length === 0) {
        const newChar = createDefaultCharacter();
        newChar.name = 'New Adventurer';
        next.push(newChar);
      }
      saveCharacters(next);
      if (activeId === id) {
        setActiveId(next[0].id);
        saveActiveId(next[0].id);
      }
      return next;
    });
  }, [activeId]);

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
        const data = migrateCharacter(JSON.parse(e.target?.result as string));
        data.id = crypto.randomUUID();
        setCharacters(prev => {
          const next = [...prev, data];
          saveCharacters(next);
          return next;
        });
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
    const data = migrateCharacter(JSON.parse(json));
    data.id = crypto.randomUUID();
    setCharacters(prev => {
      const next = [...prev, data];
      saveCharacters(next);
      return next;
    });
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
