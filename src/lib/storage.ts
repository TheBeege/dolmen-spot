import type { Character } from './types';
import { createDefaultCharacter } from './gamedata';
import { migrateCharacter } from './migrations';

/**
 * Saving and loading characters in localStorage without losing any.
 *
 * The saved list lives under `dolmenwood-characters` as a JSON array. The
 * rules, each covered by storage.test.ts:
 *
 * 1. Each saved character is migrated on its own, from a copy. A character
 *    whose migration throws is *set aside*: it stays in the saved list as
 *    parsed (untouched by migration), every later save appends it again, and
 *    the next load tries it again, so a fixed migration brings it back. It is
 *    also copied to a backup (best-effort).
 * 2. Saved data that can never become a character (the whole value isn't a
 *    readable list, or an entry isn't an object) is only removed once a
 *    verified copy of it exists under a `dolmenwood-recovery-*` key. Until
 *    then an unreadable entry stays in the list, and an unreadable whole value
 *    pauses saving.
 * 3. Before each write, the saved list is compared with what this tab last
 *    read or wrote. If another tab changed it, this tab stops saving instead
 *    of overwriting that tab's work.
 * 4. While changes aren't being saved, this tab's characters survive a
 *    remount (load() hands them back) and `hasUnsavedChanges` asks the browser
 *    to warn before the tab closes.
 * 5. Nothing here throws. Problems are reported through getStatus().
 *
 * The store takes its Storage as a parameter so it can be tested under Node.
 */

export const CHARACTERS_KEY = 'dolmenwood-characters';
export const ACTIVE_CHARACTER_KEY = 'dolmenwood-active-character';
export const RECOVERY_KEY_PREFIX = 'dolmenwood-recovery-';
/** Backup keys whose notice the player dismissed, as a JSON array. Deliberately outside RECOVERY_KEY_PREFIX. */
export const DISMISSED_BACKUPS_KEY = 'dolmenwood-dismissed-backups';
export const RECOVERY_FORMAT = 'dolmen-spot-recovery';
export const RECOVERY_DOWNLOAD_FORMAT = 'dolmen-spot-recovery-download';
/** While saving is paused for want of a backup, try the backup again at most this often. */
export const BACKUP_RETRY_MS = 5_000;

/** The parts of the DOM `Storage` interface this module uses. */
export type StorageLike = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

/** Saved data that couldn't be loaded, kept as it was. */
export type RecoveryEntry =
  /** One entry of the saved list, as parsed and untouched by migration. */
  | { kind: 'character'; index: number; error: string; value: unknown }
  /** The whole saved value, as the exact stored text, when it isn't a readable list. */
  | { kind: 'all-characters'; error: string; raw: string; activeCharacterId: string | null };

/** What a `dolmenwood-recovery-*` key holds. */
export interface RecoveryRecord {
  format: typeof RECOVERY_FORMAT;
  version: 1;
  savedAt: string;
  entries: RecoveryEntry[];
}

/** A recovery key found in storage. */
export interface StoredBackup {
  key: string;
  raw: string;
  /** null if the key's text isn't a valid record: a damaged backup. */
  record: RecoveryRecord | null;
  /** Made by this tab since it opened, rather than left from an earlier visit. */
  createdThisSession: boolean;
  /** The player dismissed the notice about it. */
  dismissed: boolean;
}

/** A saved entry this load couldn't open. It stays in the saved list. */
export interface SetAsideEntry {
  index: number;
  error: string;
  /** As parsed, untouched by migration. */
  value: unknown;
  /** The backup that also holds it, or null if none could be made. */
  backupKey: string | null;
}

export interface StorageStatus {
  backups: StoredBackup[];
  /**
   * Entries this load couldn't open: characters whose migration threw (kept
   * until they load) and entries that aren't characters (kept until a backup
   * holds them). They stay in the saved list and are tried again on every load.
   */
  setAside: SetAsideEntry[];
  /** The unreadable whole saved value, while no verified backup of it exists. Saving is paused while this is non-empty. */
  unsavedRecovery: RecoveryEntry[];
  /** Storage couldn't be read at all. Nothing is written this visit. */
  storageUnreadable: boolean;
  /** Saves are failing: the first error, and when the failures began. */
  saveError: { message: string; since: string } | null;
  /** Another tab changed the saved characters, so this tab stopped saving. */
  conflict: { since: string } | null;
  /** This tab holds changes that aren't in storage. */
  hasUnsavedChanges: boolean;
  /** What the player downloaded this session, as far as it still applies. */
  downloaded: { backupKeys: string[]; coversUnsavedRecovery: boolean } | null;
}

export const NO_STORAGE_PROBLEMS: StorageStatus = Object.freeze({
  backups: [],
  setAside: [],
  unsavedRecovery: [],
  storageUnreadable: false,
  saveError: null,
  conflict: null,
  hasUnsavedChanges: false,
  downloaded: null,
});

/** Saving is paused: nothing about the saved characters is written. */
export function isSavingPaused(status: StorageStatus): boolean {
  return status.storageUnreadable || status.conflict !== null || status.unsavedRecovery.length > 0;
}

/** Changes made now won't reach storage (paused, or saves failing). */
export function changesNotSaved(status: StorageStatus): boolean {
  return isSavingPaused(status) || status.saveError !== null;
}

export interface Session {
  characters: Character[];
  activeId: string;
}

export interface CharacterStore {
  /**
   * Read, migrate and (best-effort) re-save the characters. While changes
   * aren't being saved, returns this tab's session instead, so a remount
   * keeps unsaved work. Never throws; always returns at least one character.
   */
  load(): Session;
  /** Best-effort save of the whole list. Never throws. */
  saveCharacters(characters: Character[]): void;
  /** Best-effort save of the active character id. Never throws. */
  saveActiveId(id: string): void;
  getStatus(): StorageStatus;
  subscribe(listener: () => void): () => void;
  /** JSON text of everything preserved, for the player to download. Remembers what it included. */
  recoveryDownload(): string;
  /** Delete backups, but only ones downloaded this session and unchanged since. */
  deleteBackups(keys: string[]): { deleted: string[]; kept: string[] };
  /**
   * Stop protecting the unreadable whole saved value (once it has been
   * downloaded this session) and save the current characters over it.
   * Returns false, changing nothing, if that isn't allowed.
   */
  releaseUnsavedRecovery(): boolean;
  /** Remember (best-effort) that the player dismissed the notice about these backups. */
  dismissBackups(keys: string[]): void;
}

export interface StoreOptions {
  /** Test seam: the per-character migration. Defaults to `migrateCharacter`. */
  migrate?: (data: unknown) => Character;
  /** Test seam: the clock. */
  now?: () => Date;
  /** Test seam: randomness for backup key suffixes. */
  random?: () => number;
}

export function createNewAdventurer(): Character {
  const character = createDefaultCharacter();
  character.name = 'New Adventurer';
  return character;
}

/** A character file the import can't use. `message` is written for the player. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

export const IMPORT_MESSAGES = {
  notCharacter: "That file isn't a Dolmen Spot character file.",
  recoveryFile:
    "That's a recovery file from the storage warning, not a character file. It holds saved data Dolmen Spot couldn't read, " +
    "so it can't be imported. Keep it, or attach it to a bug report.",
  several: 'That file holds several characters. Use Import Character on the Local File tab to add them.',
  empty: 'That file has no characters in it.',
  notOpened: "That character couldn't be opened by this version of Dolmen Spot.",
} as const;

/** Keys every character file has had since the first version, besides `name`. */
const CHARACTER_KEYS = ['schemaVersion', 'level', 'abilityScores', 'kindred', 'class'];

/**
 * Parse an imported character file (local or cloud) into characters with new
 * ids. A file holds one character, or (with `allowMany`) a list of them.
 * Throws an ImportError, before anything is added, if any of it isn't a
 * character: a bad file changes nothing.
 */
export function parseImportedCharacters(
  json: string,
  { allowMany = false, migrate = migrateCharacter }: { allowMany?: boolean; migrate?: (data: unknown) => Character } = {},
): Character[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ImportError(IMPORT_MESSAGES.notCharacter);
  }
  const many = Array.isArray(data);
  const items: unknown[] = Array.isArray(data) ? data : [data];
  if (many && !allowMany) throw new ImportError(IMPORT_MESSAGES.several);
  if (items.length === 0) throw new ImportError(IMPORT_MESSAGES.empty);
  items.forEach((item, i) => {
    if (isRecoveryFile(item)) throw new ImportError(IMPORT_MESSAGES.recoveryFile);
    if (!looksLikeCharacter(item)) {
      throw new ImportError(many ? `Entry ${i + 1} in that file isn't a character, so nothing was imported.` : IMPORT_MESSAGES.notCharacter);
    }
  });
  return items.map((item) => {
    let character: Character;
    try {
      character = migrate(JSON.parse(JSON.stringify(item)));
    } catch {
      throw new ImportError(IMPORT_MESSAGES.notOpened);
    }
    character.id = crypto.randomUUID();
    return character;
  });
}

/** One character from a file (see parseImportedCharacters). */
export function parseImportedCharacter(json: string, migrate: (data: unknown) => Character = migrateCharacter): Character {
  return parseImportedCharacters(json, { migrate })[0];
}

function isRecoveryFile(data: unknown): boolean {
  if (!isPlainObject(data)) return false;
  if (typeof data.format === 'string' && data.format.startsWith(RECOVERY_FORMAT)) return true;
  // Downloads made before the format tag existed.
  return 'backups' in data && 'notBackedUp' in data;
}

function looksLikeCharacter(data: unknown): boolean {
  return isPlainObject(data) && typeof data.name === 'string' && CHARACTER_KEYS.some((k) => k in data);
}

export function createCharacterStore(storage: StorageLike | null, options: StoreOptions = {}): CharacterStore {
  const migrate = options.migrate ?? migrateCharacter;
  const now = options.now ?? (() => new Date());
  const random = options.random ?? Math.random;

  let status: StorageStatus = NO_STORAGE_PROBLEMS;
  const listeners = new Set<() => void>();

  /** This tab's characters and active id: what load() returned, updated by every save. */
  let session: Session | null = null;
  /** The saved list as this tab last read or wrote it (null: the key was empty). Writes check the key still holds it. */
  let lastKnownJson: string | null = null;
  /** Entries kept in the saved list that couldn't be loaded. Every write appends them. */
  let carried: unknown[] = [];
  /** The list (with carried entries) as last stored, or as load() returned it. Anything else is unsaved. */
  let baselineJson: string | null = null;
  /** Backup keys made by this tab. */
  const createdKeys = new Set<string>();
  /** Backup key -> its text when downloaded, and the identities of downloaded entries no backup held. */
  const downloadedTexts = new Map<string, string>();
  const downloadedIds = new Set<string>();
  /** Dismissals that couldn't be (or weren't) written to storage. */
  const dismissedInMemory = new Set<string>();
  let lastBackupAttempt = -Infinity;

  function setStatus(patch: Partial<StorageStatus>) {
    const changed = (Object.keys(patch) as (keyof StorageStatus)[]).some((k) => patch[k] !== status[k]);
    if (!changed) return;
    status = { ...status, ...patch };
    listeners.forEach((listener) => listener());
  }

  function isoNow(): string {
    const date = now();
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
  }

  function serialize(characters: Character[]): string {
    return JSON.stringify(carried.length > 0 ? [...characters, ...carried] : characters);
  }

  function readBackups(store: StorageLike): StoredBackup[] {
    const dismissed = readDismissed(store);
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith(RECOVERY_KEY_PREFIX)) keys.push(key);
    }
    return keys.sort().map((key) => {
      const raw = store.getItem(key) ?? '';
      return {
        key,
        raw,
        record: parseRecord(raw),
        createdThisSession: createdKeys.has(key),
        dismissed: dismissed.has(key) || dismissedInMemory.has(key),
      };
    });
  }

  function refreshBackups() {
    if (!storage) return;
    try {
      const next = readBackups(storage);
      const same = next.length === status.backups.length && next.every((b, i) => {
        const old = status.backups[i];
        return b.key === old.key && b.raw === old.raw && b.createdThisSession === old.createdThisSession && b.dismissed === old.dismissed;
      });
      if (!same) setStatus({ backups: next });
    } catch (err) {
      console.warn('Could not list recovery backups', err);
    }
    refreshDownloaded();
  }

  function refreshDownloaded() {
    if (downloadedTexts.size === 0 && downloadedIds.size === 0) return;
    const backupKeys = status.backups.filter((b) => downloadedTexts.get(b.key) === b.raw).map((b) => b.key);
    const coversUnsavedRecovery =
      status.unsavedRecovery.length > 0 && status.unsavedRecovery.every((e) => downloadedIds.has(entryIdentity(e)));
    const old = status.downloaded;
    if (old && old.coversUnsavedRecovery === coversUnsavedRecovery && old.backupKeys.join('\n') === backupKeys.join('\n')) return;
    setStatus({ downloaded: { backupKeys, coversUnsavedRecovery } });
  }

  function newBackupKey(savedAt: string): string {
    if (!storage) throw new Error('localStorage is not available');
    // A random suffix keeps two tabs backing up in the same millisecond apart.
    for (let attempt = 0; attempt < 100; attempt++) {
      const suffix = random().toString(36).slice(2, 8) || '0';
      const key = `${RECOVERY_KEY_PREFIX}${savedAt}-${suffix}${attempt > 0 ? `-${attempt}` : ''}`;
      if (storage.getItem(key) === null) return key;
    }
    throw new Error('Could not find a free backup key');
  }

  /**
   * Make sure a verified backup holds each entry: reuse an existing backup
   * that has it, or write a new key, read it back and compare. Returns, for
   * each entry identity held, the key of the backup that holds it. Only ever
   * writes a key that doesn't exist yet.
   */
  function preserve(entries: RecoveryEntry[]): Map<string, string> {
    const held = new Map<string, string>();
    if (!storage || entries.length === 0) return held;
    try {
      for (const backup of readBackups(storage)) {
        for (const entry of backup.record?.entries ?? []) {
          const id = entryIdentity(entry);
          if (!held.has(id)) held.set(id, backup.key);
        }
      }
      const toSave = entries.filter((e) => !held.has(entryIdentity(e)));
      if (toSave.length > 0) {
        const savedAt = isoNow();
        const record: RecoveryRecord = { format: RECOVERY_FORMAT, version: 1, savedAt, entries: toSave };
        const json = JSON.stringify(record);
        const key = newBackupKey(savedAt);
        storage.setItem(key, json);
        if (storage.getItem(key) === json) {
          createdKeys.add(key);
          for (const e of toSave) held.set(entryIdentity(e), key);
        } else {
          // A copy we can't trust doesn't count. Remove it (it's ours).
          try { storage.removeItem(key); } catch { /* ignore */ }
        }
      }
    } catch (err) {
      console.warn('Could not back up unreadable character data', err);
    }
    refreshBackups();
    return held;
  }

  /** Write the list unless another tab changed it. True if storage now holds it. Never throws. */
  function writeList(json: string): boolean {
    if (!storage) return false;
    try {
      if (json !== lastKnownJson) {
        if (storage.getItem(CHARACTERS_KEY) !== lastKnownJson) {
          console.warn('Another tab changed the saved characters, so this tab has stopped saving');
          if (!status.conflict) setStatus({ conflict: { since: isoNow() } });
          return false;
        }
        storage.setItem(CHARACTERS_KEY, json);
        lastKnownJson = json;
      }
      if (status.saveError) setStatus({ saveError: null });
      return true;
    } catch (err) {
      console.warn('Could not save characters', err);
      // Keep the time of the first failure, so the warning can say since when.
      if (!status.saveError) setStatus({ saveError: { message: describeError(err), since: isoNow() } });
      return false;
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

  function noteSaved(json: string, written: boolean) {
    if (written) baselineJson = json;
    setStatus({ hasUnsavedChanges: !written && json !== baselineJson });
  }

  function startSession(characters: Character[], activeId: string): Session {
    session = { characters, activeId };
    baselineJson = serialize(characters);
    setStatus({ hasUnsavedChanges: false });
    return { ...session };
  }

  /** While paused for want of a backup, try it again (throttled). True once it exists. */
  function retryPausedBackup(): boolean {
    const at = now().getTime();
    if (Number.isFinite(at) && at - lastBackupAttempt < BACKUP_RETRY_MS) return false;
    lastBackupAttempt = Number.isFinite(at) ? at : Date.now();
    const held = preserve(status.unsavedRecovery);
    if (!status.unsavedRecovery.every((e) => held.has(entryIdentity(e)))) return false;
    setStatus({ unsavedRecovery: [] });
    refreshDownloaded();
    return true;
  }

  function loadFromStorage(): Session {
    // Problems are found again by each load. Backups, downloads and dismissals carry over.
    setStatus({ setAside: [], unsavedRecovery: [], storageUnreadable: false, saveError: null, conflict: null, hasUnsavedChanges: false });
    carried = [];

    let raw: string | null;
    let storedActiveId: string | null;
    try {
      if (!storage) throw new Error('localStorage is not available');
      raw = storage.getItem(CHARACTERS_KEY);
      storedActiveId = storage.getItem(ACTIVE_CHARACTER_KEY);
    } catch (err) {
      return runWithoutStorage(err);
    }
    lastKnownJson = raw;
    lastBackupAttempt = now().getTime();
    refreshBackups();

    const { characters, whole, unreadable } = readCharacters(raw, storedActiveId, migrate);
    const held = preserve(whole ? [whole] : unreadable);

    if (whole && !held.has(entryIdentity(whole))) {
      // Writing would destroy the only copy. Run in memory with saving paused;
      // saveCharacters retries the backup and resumes once it exists.
      setStatus({ unsavedRecovery: [whole] });
      refreshDownloaded();
      const fresh = createNewAdventurer();
      return startSession([fresh], fresh.id);
    }

    // Characters that failed to migrate stay in the list until they load.
    // Anything else unreadable stays until a backup holds it.
    const kept = unreadable.filter((e) => isPlainObject(e.value) || !held.has(entryIdentity(e)));
    carried = kept.map((e) => e.value);
    setStatus({
      setAside: kept.map((e) => ({ index: e.index, error: e.error, value: e.value, backupKey: held.get(entryIdentity(e)) ?? null })),
    });

    if (characters.length === 0) {
      // First visit, or nothing loadable (and that's safe now). A stored active
      // id is left alone: it may name a set-aside character that loads later.
      const fresh = createNewAdventurer();
      if (writeList(serialize([fresh])) && storedActiveId === null) writeActiveId(fresh.id);
      return startSession([fresh], fresh.id);
    }

    // Re-save migrated data so migration only runs once. Best-effort: if this
    // fails, the stored list stays as it was and is simply migrated again next load.
    writeList(serialize(characters));
    return startSession(characters, pickActiveId(characters, storedActiveId));
  }

  /** Storage can't be read, so we can't know what's there: write nothing this visit. */
  function runWithoutStorage(err: unknown): Session {
    console.error('Could not read saved characters; saving is off for this visit', err);
    setStatus({ storageUnreadable: true });
    if (session) return { ...session };
    const fresh = createNewAdventurer();
    return startSession([fresh], fresh.id);
  }

  return {
    load() {
      try {
        if (session && (changesNotSaved(status) || status.hasUnsavedChanges)) return { ...session };
        return loadFromStorage();
      } catch (err) {
        // Last-resort safety net for anything unexpected: never write after a failed load.
        return runWithoutStorage(err);
      }
    },

    saveCharacters(characters) {
      if (!session) return;
      session = { ...session, characters };
      const json = serialize(characters);
      let written = false;
      if (!status.storageUnreadable && !status.conflict && (status.unsavedRecovery.length === 0 || retryPausedBackup())) {
        written = writeList(json);
      }
      noteSaved(json, written);
    },

    saveActiveId(id) {
      if (!session || id === session.activeId) return;
      session = { ...session, activeId: id };
      if (!isSavingPaused(status)) writeActiveId(id);
    },

    getStatus: () => status,

    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    recoveryDownload() {
      const notBackedUp: RecoveryEntry[] = [
        ...status.unsavedRecovery,
        ...status.setAside
          .filter((e) => e.backupKey === null)
          .map((e): RecoveryEntry => ({ kind: 'character', index: e.index, error: e.error, value: e.value })),
      ];
      for (const b of status.backups) downloadedTexts.set(b.key, b.raw);
      for (const e of notBackedUp) downloadedIds.add(entryIdentity(e));
      refreshDownloaded();
      return JSON.stringify({
        format: RECOVERY_DOWNLOAD_FORMAT,
        version: 1,
        app: 'Dolmen Spot',
        about: "Saved data Dolmen Spot couldn't read. This isn't a character file: keep it, or attach it to a bug report at https://github.com/TheBeege/dolmen-spot/issues",
        downloadedAt: isoNow(),
        backups: status.backups.map((b) => b.record ?? { key: b.key, damagedBackup: b.raw }),
        notBackedUp,
      }, null, 2);
    },

    deleteBackups(keys) {
      const deleted: string[] = [];
      const kept: string[] = [];
      for (const key of keys) {
        if (!key.startsWith(RECOVERY_KEY_PREFIX)) continue;
        try {
          const downloadedText = downloadedTexts.get(key);
          if (!storage || downloadedText === undefined || storage.getItem(key) !== downloadedText) {
            kept.push(key);
            continue;
          }
          storage.removeItem(key);
          downloadedTexts.delete(key);
          deleted.push(key);
        } catch (err) {
          console.warn('Could not delete backup', key, err);
          kept.push(key);
        }
      }
      // Space may have been freed: let a paused backup try again on the next save.
      lastBackupAttempt = -Infinity;
      refreshBackups();
      return { deleted, kept };
    },

    releaseUnsavedRecovery() {
      if (!session || status.unsavedRecovery.length === 0 || status.storageUnreadable || status.conflict) return false;
      if (!status.unsavedRecovery.every((e) => downloadedIds.has(entryIdentity(e)))) return false;
      setStatus({ unsavedRecovery: [] });
      refreshDownloaded();
      const json = serialize(session.characters);
      const written = writeList(json);
      if (written) writeActiveId(session.activeId);
      noteSaved(json, written);
      return true;
    },

    dismissBackups(keys) {
      for (const key of keys) dismissedInMemory.add(key);
      if (storage && !isSavingPaused(status)) {
        try {
          const existing = new Set(status.backups.map((b) => b.key));
          const merged = [...new Set([...readDismissed(storage), ...keys])].filter((k) => existing.has(k));
          storage.setItem(DISMISSED_BACKUPS_KEY, JSON.stringify(merged));
        } catch (err) {
          console.warn('Could not remember the dismissed backups', err);
        }
      }
      refreshBackups();
    },
  };
}

/**
 * Parse and migrate the stored list. Never throws: anything that can't be
 * loaded comes back as `whole` (the exact stored text) or in `unreadable`
 * (entries as parsed, untouched by migration).
 */
function readCharacters(
  raw: string | null,
  storedActiveId: string | null,
  migrate: (data: unknown) => Character,
): { characters: Character[]; whole: RecoveryEntry | null; unreadable: Array<RecoveryEntry & { kind: 'character' }> } {
  const characters: Character[] = [];
  const unreadable: Array<RecoveryEntry & { kind: 'character' }> = [];
  if (raw === null || raw === '') return { characters, whole: null, unreadable };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { characters, unreadable, whole: { kind: 'all-characters', error: describeError(err), raw, activeCharacterId: storedActiveId } };
  }
  if (!Array.isArray(parsed)) {
    return { characters, unreadable, whole: { kind: 'all-characters', error: 'Saved data is not a list of characters', raw, activeCharacterId: storedActiveId } };
  }

  parsed.forEach((item: unknown, index) => {
    try {
      if (!isPlainObject(item)) throw new Error('Not a character object');
      // Migrations mutate their input, so give them a copy and keep `item` as parsed.
      characters.push(migrate(JSON.parse(JSON.stringify(item))));
    } catch (err) {
      unreadable.push({ kind: 'character', index, error: describeError(err), value: item });
    }
  });
  return { characters, whole: null, unreadable };
}

/** The stored active id if it still names a loaded character, else the first character. */
function pickActiveId(characters: Character[], storedActiveId: string | null): string {
  return (characters.find((c) => c.id === storedActiveId) ?? characters[0]).id;
}

/** Identifies the same unreadable data across loads, so it's only backed up once. */
function entryIdentity(entry: RecoveryEntry): string {
  return entry.kind === 'all-characters' ? `raw:${entry.raw}` : `value:${JSON.stringify(entry.value) ?? 'undefined'}`;
}

/** A valid version-1 record, or null for anything else (treated as a damaged backup). */
function parseRecord(raw: string): RecoveryRecord | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !isPlainObject(data) ||
    data.format !== RECOVERY_FORMAT ||
    data.version !== 1 ||
    typeof data.savedAt !== 'string' ||
    !Array.isArray(data.entries) ||
    !data.entries.every(isRecoveryEntry)
  ) {
    return null;
  }
  return data as unknown as RecoveryRecord;
}

function isRecoveryEntry(entry: unknown): entry is RecoveryEntry {
  if (!isPlainObject(entry) || typeof entry.error !== 'string') return false;
  if (entry.kind === 'all-characters') {
    return typeof entry.raw === 'string' && (entry.activeCharacterId === null || typeof entry.activeCharacterId === 'string');
  }
  return entry.kind === 'character' && Number.isInteger(entry.index) && 'value' in entry;
}

function readDismissed(store: StorageLike): Set<string> {
  try {
    const list: unknown = JSON.parse(store.getItem(DISMISSED_BACKUPS_KEY) ?? '[]');
    return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
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
    warnBeforeUnloadWhileUnsaved(browserStore);
  }
  return browserStore;
}

/** Ask the browser to confirm leaving while this tab holds changes storage doesn't have. */
function warnBeforeUnloadWhileUnsaved(store: CharacterStore) {
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    // Older browsers need returnValue set too.
    event.returnValue = '';
  };
  let listening = false;
  store.subscribe(() => {
    const unsaved = store.getStatus().hasUnsavedChanges;
    if (unsaved && !listening) window.addEventListener('beforeunload', onBeforeUnload);
    if (!unsaved && listening) window.removeEventListener('beforeunload', onBeforeUnload);
    listening = unsaved;
  });
}
