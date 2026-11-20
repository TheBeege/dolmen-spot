import type { Character } from './types';
import { createDefaultCharacter } from './gamedata';
import { migrateCharacter } from './migrations';

/**
 * Saving and loading characters in localStorage, without ever losing them.
 *
 * Characters live under `dolmenwood-characters` as a JSON array. The rules:
 *
 * 1. Loading never overwrites data it couldn't read. Each character is
 *    migrated on its own, so one bad entry can't take down the rest. Anything
 *    unreadable (the whole value, or single characters) is first copied into
 *    a recovery backup under its own `dolmenwood-recovery-<time>` key, read
 *    back and compared. Only then may the main key be rewritten.
 * 2. If that copy can't be made (e.g. storage is full), saving is paused:
 *    the app runs in memory and writes nothing until a later save attempt
 *    manages to make the copy.
 * 3. No write ever throws. Failures are reported through `getStatus()` so the
 *    UI can warn the player and offer an export.
 *
 * The store takes its Storage as a parameter so this logic can be tested
 * under Node with a fake localStorage.
 */

export const CHARACTERS_KEY = 'dolmenwood-characters';
export const ACTIVE_CHARACTER_KEY = 'dolmenwood-active-character';
export const RECOVERY_KEY_PREFIX = 'dolmenwood-recovery-';

/** The parts of the DOM `Storage` interface this module uses. */
export type StorageLike = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

/** Saved data that couldn't be loaded, preserved exactly as it was stored. */
export type RecoveryEntry =
  /** One element of the saved character list. `value` is untouched by migration. */
  | { kind: 'character'; index: number; error: string; value: unknown }
  /** The whole saved value, verbatim, when it isn't a readable list of characters. */
  | { kind: 'all-characters'; error: string; raw: string; activeCharacterId: string | null };

/** What a `dolmenwood-recovery-*` key holds. */
export interface RecoveryRecord {
  format: 'dolmen-spot-recovery';
  version: 1;
  savedAt: string;
  entries: RecoveryEntry[];
}

/** A recovery key found in storage. `record` is null if its text isn't a valid record. */
export interface StoredBackup {
  key: string;
  raw: string;
  record: RecoveryRecord | null;
}

export interface StorageStatus {
  /** Unreadable data that is safely backed up in this browser. */
  backups: StoredBackup[];
  /** Unreadable data we could NOT back up. It's still in the main key, untouched. Saving is paused while this is non-empty. */
  unsavedRecovery: RecoveryEntry[];
  /** Storage couldn't be read at all. Saving is paused for this visit. */
  storageUnreadable: boolean;
  /** Set while character saves are failing: the error, and when the failures started. */
  saveError: { message: string; since: string } | null;
}

export const NO_STORAGE_PROBLEMS: StorageStatus = Object.freeze({
  backups: [],
  unsavedRecovery: [],
  storageUnreadable: false,
  saveError: null,
});

export function isSavingPaused(status: StorageStatus): boolean {
  return status.storageUnreadable || status.unsavedRecovery.length > 0;
}

export interface CharacterStore {
  /** Read, migrate and (best-effort) re-save characters. Never throws; always returns at least one character. */
  load(): { characters: Character[]; activeId: string };
  /** Best-effort save. Never throws. Skipped while saving is paused or when nothing changed. */
  saveCharacters(characters: Character[]): void;
  /** Best-effort save of the active character id. Never throws. */
  saveActiveId(id: string): void;
  getStatus(): StorageStatus;
  subscribe(listener: () => void): () => void;
  /** JSON text of everything preserved (backed up or not), for the player to download. */
  recoveryDownload(): string;
  /** Remove backups the player no longer needs (after downloading them). */
  deleteBackups(keys: string[]): void;
}

export interface StoreOptions {
  /** Test seam: the per-character migration. Defaults to `migrateCharacter`. */
  migrate?: (data: unknown) => Character;
  /** Test seam: the clock used for backup timestamps. */
  now?: () => Date;
}

export function createNewAdventurer(): Character {
  const character = createDefaultCharacter();
  character.name = 'New Adventurer';
  return character;
}

/**
 * Parse an imported character file (local or cloud). Throws if it isn't a
 * character, before anything is added, so a bad file changes nothing.
 */
export function parseImportedCharacter(json: string, migrate: (data: unknown) => Character = migrateCharacter): Character {
  const data: unknown = JSON.parse(json);
  if (!isPlainObject(data)) throw new Error('Not a character file');
  const character = migrate(data);
  character.id = crypto.randomUUID();
  return character;
}

export function createCharacterStore(storage: StorageLike | null, options: StoreOptions = {}): CharacterStore {
  const migrate = options.migrate ?? migrateCharacter;
  const now = options.now ?? (() => new Date());

  let status: StorageStatus = NO_STORAGE_PROBLEMS;
  const listeners = new Set<() => void>();
  // Exactly what the characters key holds (as far as we know), so unchanged
  // lists aren't rewritten. Skipping no-op writes also stops an idle tab from
  // clobbering another tab's changes.
  let lastSavedJson: string | null = null;

  function setStatus(patch: Partial<StorageStatus>) {
    const changed = (Object.keys(patch) as (keyof StorageStatus)[]).some((k) => patch[k] !== status[k]);
    if (!changed) return;
    status = { ...status, ...patch };
    listeners.forEach((listener) => listener());
  }

  function listBackups(store: StorageLike): StoredBackup[] {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith(RECOVERY_KEY_PREFIX)) keys.push(key);
    }
    return keys.sort().map((key) => {
      const raw = store.getItem(key) ?? '';
      return { key, raw, record: parseRecord(raw) };
    });
  }

  function refreshBackups() {
    if (!storage) return;
    try {
      setStatus({ backups: listBackups(storage) });
    } catch (err) {
      console.warn('Could not list recovery backups', err);
    }
  }

  /**
   * Copy unreadable entries into a new recovery key, then read it back and
   * check it's identical. True only if every entry is verifiably stored,
   * either now or by an earlier load (so reloading doesn't pile up copies).
   * Only ever writes a key that doesn't exist yet.
   */
  function preserve(entries: RecoveryEntry[]): boolean {
    if (!storage) return false;
    try {
      const saved = new Set(listBackups(storage).flatMap((b) => b.record?.entries.map(entryIdentity) ?? []));
      const toSave = entries.filter((e) => !saved.has(entryIdentity(e)));
      if (toSave.length > 0) {
        const record: RecoveryRecord = { format: 'dolmen-spot-recovery', version: 1, savedAt: now().toISOString(), entries: toSave };
        const json = JSON.stringify(record);
        let key = RECOVERY_KEY_PREFIX + record.savedAt;
        for (let n = 2; storage.getItem(key) !== null; n++) key = `${RECOVERY_KEY_PREFIX}${record.savedAt}-${n}`;
        storage.setItem(key, json);
        if (storage.getItem(key) !== json) {
          // A copy we can't trust doesn't count. Remove it (it's ours) and report failure.
          try { storage.removeItem(key); } catch { /* ignore */ }
          return false;
        }
      }
      refreshBackups();
      return true;
    } catch (err) {
      console.warn('Could not back up unreadable character data', err);
      return false;
    }
  }

  /** Best-effort write of the character list. Records failures in the status instead of throwing. */
  function writeCharacters(characters: Character[]) {
    if (!storage) return;
    try {
      const json = JSON.stringify(characters);
      if (json !== lastSavedJson) storage.setItem(CHARACTERS_KEY, json);
      lastSavedJson = json;
      setStatus({ saveError: null });
    } catch (err) {
      console.warn('Could not save characters', err);
      // Keep the time of the first failure, so the warning can say since when.
      if (!status.saveError) setStatus({ saveError: { message: describeError(err), since: now().toISOString() } });
    }
  }

  function writeActiveId(id: string) {
    if (!storage) return;
    try {
      if (storage.getItem(ACTIVE_CHARACTER_KEY) !== id) storage.setItem(ACTIVE_CHARACTER_KEY, id);
    } catch (err) {
      // Minor: at worst the next visit opens the first character instead.
      console.warn('Could not save the active character', err);
    }
  }

  function loadUnsafe(): { characters: Character[]; activeId: string } {
    lastSavedJson = null;
    setStatus({ ...NO_STORAGE_PROBLEMS });

    let raw: string | null;
    let storedActiveId: string | null;
    try {
      if (!storage) throw new Error('localStorage is not available');
      raw = storage.getItem(CHARACTERS_KEY);
      storedActiveId = storage.getItem(ACTIVE_CHARACTER_KEY);
    } catch (err) {
      return runWithoutStorage(err);
    }
    refreshBackups();
    lastSavedJson = raw;

    const { characters, unreadable } = readCharacters(raw, storedActiveId, migrate);

    if (unreadable.length > 0 && !preserve(unreadable)) {
      // No safe copy, so nothing may be written. Run in memory; saveCharacters
      // retries the copy and resumes saving once it succeeds.
      setStatus({ unsavedRecovery: unreadable });
      const inMemory = characters.length > 0 ? characters : [createNewAdventurer()];
      return { characters: inMemory, activeId: pickActiveId(inMemory, storedActiveId) };
    }

    if (characters.length === 0) {
      // First visit, or nothing readable left (and that's backed up now).
      const fresh = createNewAdventurer();
      writeCharacters([fresh]);
      writeActiveId(fresh.id);
      return { characters: [fresh], activeId: fresh.id };
    }

    // Re-save migrated data so migration only runs once. Best-effort: if this
    // fails, the original stays as it is and is simply migrated again next load.
    writeCharacters(characters);
    return { characters, activeId: pickActiveId(characters, storedActiveId) };
  }

  /** Storage can't be read, so we can't know what's there: write nothing for this visit. */
  function runWithoutStorage(err: unknown) {
    console.error('Could not read saved characters; saving is off for this visit', err);
    setStatus({ storageUnreadable: true });
    const fresh = createNewAdventurer();
    return { characters: [fresh], activeId: fresh.id };
  }

  return {
    load() {
      try {
        return loadUnsafe();
      } catch (err) {
        // Last-resort safety net for anything unexpected: never write after a failed load.
        return runWithoutStorage(err);
      }
    },

    saveCharacters(characters) {
      if (status.storageUnreadable) return;
      if (status.unsavedRecovery.length > 0) {
        // Paused: the main key still holds data we couldn't back up. Try again;
        // keep it paused (writing nothing) until the copy succeeds.
        if (!preserve(status.unsavedRecovery)) return;
        setStatus({ unsavedRecovery: [] });
      }
      writeCharacters(characters);
    },

    saveActiveId(id) {
      if (isSavingPaused(status)) return;
      writeActiveId(id);
    },

    getStatus: () => status,

    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    recoveryDownload() {
      return JSON.stringify({
        app: 'Dolmen Spot',
        about: 'Saved data that Dolmen Spot could not read. Keep this file, or attach it to a bug report at https://github.com/TheBeege/dolmen-spot/issues',
        downloadedAt: now().toISOString(),
        backups: status.backups.map((b) => b.record ?? { key: b.key, unreadableBackup: b.raw }),
        notBackedUp: status.unsavedRecovery,
      }, null, 2);
    },

    deleteBackups(keys) {
      if (!storage) return;
      for (const key of keys) {
        if (!key.startsWith(RECOVERY_KEY_PREFIX)) continue;
        try { storage.removeItem(key); } catch (err) { console.warn('Could not delete backup', key, err); }
      }
      refreshBackups();
    },
  };
}

/**
 * Parse and migrate the stored list. Never throws: anything that can't be
 * loaded comes back in `unreadable`, exactly as it was stored.
 */
function readCharacters(
  raw: string | null,
  storedActiveId: string | null,
  migrate: (data: unknown) => Character,
): { characters: Character[]; unreadable: RecoveryEntry[] } {
  if (raw === null || raw === '') return { characters: [], unreadable: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { characters: [], unreadable: [{ kind: 'all-characters', error: describeError(err), raw, activeCharacterId: storedActiveId }] };
  }
  if (!Array.isArray(parsed)) {
    return { characters: [], unreadable: [{ kind: 'all-characters', error: 'Saved data is not a list of characters', raw, activeCharacterId: storedActiveId }] };
  }

  const characters: Character[] = [];
  const unreadable: RecoveryEntry[] = [];
  parsed.forEach((item: unknown, index) => {
    try {
      if (!isPlainObject(item)) throw new Error('Not a character object');
      // Migrations mutate their input, so give them a copy and keep `item` pristine.
      characters.push(migrate(JSON.parse(JSON.stringify(item))));
    } catch (err) {
      unreadable.push({ kind: 'character', index, error: describeError(err), value: item });
    }
  });
  return { characters, unreadable };
}

/** The stored active id if it still names a loaded character, else the first character. */
function pickActiveId(characters: Character[], storedActiveId: string | null): string {
  return (characters.find((c) => c.id === storedActiveId) ?? characters[0]).id;
}

/** Identifies the same unreadable data across loads (so it's only backed up once). */
function entryIdentity(entry: RecoveryEntry): string {
  return entry.kind === 'all-characters' ? `raw:${entry.raw}` : `value:${JSON.stringify(entry.value)}`;
}

function parseRecord(raw: string): RecoveryRecord | null {
  try {
    const record: unknown = JSON.parse(raw);
    if (isPlainObject(record) && record.format === 'dolmen-spot-recovery' && Array.isArray(record.entries)) {
      return record as unknown as RecoveryRecord;
    }
  } catch { /* not a record */ }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

let browserStore: CharacterStore | null = null;

/** The store backed by this browser's localStorage. Client-side only. */
export function getCharacterStore(): CharacterStore {
  if (typeof window === 'undefined') return createCharacterStore(null);
  if (!browserStore) {
    let storage: StorageLike | null = null;
    try {
      // Merely touching window.localStorage throws when the browser blocks site data.
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    browserStore = createCharacterStore(storage);
  }
  return browserStore;
}
