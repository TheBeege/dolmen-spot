import type { CharacterStore } from './storage';

/**
 * The character store this tab opened, if any. The error screen
 * (src/components/ErrorScreen.tsx) reads it from here instead of importing the
 * store, so it doesn't depend on the store's module or on the game data and
 * migrations that imports: the error screen must load even when the rest of
 * the app can't. Only a type is imported, so this module has no dependencies.
 */
let current: CharacterStore | null = null;

/** Called by getCharacterStore() once it has made this tab's store. */
export function setCurrentStore(store: CharacterStore): void {
  current = store;
}

/** This tab's store, or null if the app never opened one. */
export function currentStore(): CharacterStore | null {
  return current;
}
