// Tests for the character store (storage.ts). Run with `npm test`.
//
// They run the real migrations against a fake localStorage that can fail on
// demand, and assert on the exact stored strings before and after: no case
// may lose data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCharacter } from './gamedata';
import { CURRENT_SCHEMA_VERSION, migrateCharacter } from './migrations';
import {
  ACTIVE_CHARACTER_KEY as ACTIVE,
  BACKUP_RETRY_MS,
  CHARACTERS_KEY as CHARS,
  DISMISSED_BACKUPS_KEY as DISMISSED,
  DISMISSED_NEWER_KEY as DISMISSED_NEWER,
  IMPORT_MESSAGES,
  ImportError,
  RECOVERY_KEY_PREFIX as PREFIX,
  changesNotSaved,
  characterFileJson,
  createCharacterStore,
  createNewAdventurer,
  isSavingPaused,
  parseImportedCharacter,
  parseImportedCharacters,
  type RecoveryEntry,
  type RecoveryRecord,
  type StorageLike,
} from './storage';
import { SAVE_DATA_FORMAT } from './save-data-file';
import type { Character } from './types';

// The store logs the failures it handles; keep them out of the test output.
console.warn = () => {};
console.error = () => {};

const quotaError = (key: string) =>
  new DOMException(`Failed to execute 'setItem' on 'Storage': Setting the value of '${key}' exceeded the quota.`, 'QuotaExceededError');

/** In-memory localStorage that can fail on demand. Sizes count UTF-16 code units, as browsers do. */
class FakeStorage implements StorageLike {
  readonly map: Map<string, string>;
  quota: number;
  failSet: ((key: string, value: string) => Error | null) | null = null;
  failGet: ((key: string) => Error | null) | null = null;
  /** Stores something other than what it was given, like a bad write. */
  mangle: ((key: string, value: string) => string) | null = null;
  readonly setCalls: string[] = [];

  constructor(initial: Record<string, string> = {}, { quota = Infinity }: { quota?: number } = {}) {
    this.map = new Map(Object.entries(initial));
    this.quota = quota;
  }

  get length() {
    return this.map.size;
  }

  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }

  getItem(key: string) {
    const err = this.failGet?.(key);
    if (err) throw err;
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.setCalls.push(key);
    const err = this.failSet?.(key, value);
    if (err) throw err;
    let size = key.length + value.length;
    for (const [k, v] of this.map) if (k !== key) size += k.length + v.length;
    if (size > this.quota) throw quotaError(key);
    this.map.set(key, this.mangle ? this.mangle(key, value) : value);
  }

  removeItem(key: string) {
    this.map.delete(key);
  }

  snapshot() {
    return Object.fromEntries(this.map);
  }

  size() {
    let size = 0;
    for (const [k, v] of this.map) size += k.length + v.length;
    return size;
  }

  recoveryKeys() {
    return [...this.map.keys()].filter((k) => k.startsWith(PREFIX)).sort();
  }

  records(): RecoveryRecord[] {
    return this.recoveryKeys().map((k) => JSON.parse(this.map.get(k) ?? '') as RecoveryRecord);
  }

  writesTo(prefix: string) {
    return this.setCalls.filter((k) => k.startsWith(prefix)).length;
  }
}

/** A clock the test moves by hand. */
class Clock {
  private time = Date.parse('2026-11-20T10:00:00.000Z');
  now = () => new Date(this.time);
  advance(ms: number) {
    this.time += ms;
  }
}

interface DownloadFile {
  format: string;
  backups: Array<RecoveryRecord | { key: string; damagedBackup: string }>;
  notBackedUp: RecoveryEntry[];
}

type WholeEntry = Extract<RecoveryEntry, { kind: 'all-characters' }>;
type ElementEntry = Extract<RecoveryEntry, { kind: 'character' }>;

function asWhole(entry: RecoveryEntry | undefined): WholeEntry {
  if (!entry || entry.kind !== 'all-characters') throw new assert.AssertionError({ message: `not a whole-value entry: ${JSON.stringify(entry)}` });
  return entry;
}

function asElement(entry: RecoveryEntry | undefined): ElementEntry {
  if (!entry || entry.kind !== 'character') throw new assert.AssertionError({ message: `not a list-entry entry: ${JSON.stringify(entry)}` });
  return entry;
}

function makeChar(name: string, extra: Partial<Character> = {}): Character {
  return { ...createDefaultCharacter(), name, otherNotes: `${name}'s notes`, level: 3, ...extra };
}

/** A save from before versioning: no schemaVersion, the old default skill targets, few fields. */
function legacyChar(name: string): Record<string, unknown> {
  return {
    id: `legacy-${name}`,
    name,
    level: 2,
    otherNotes: `${name} remembers the goat`,
    skillTargets: { listen: 5, search: 5, survival: 5 },
    abilityScores: { strength: 13, intelligence: 9, wisdom: 10, dexterity: 15, constitution: 12, charisma: 8 },
  };
}

/** A migration with a bug: throws for the named characters, after scribbling on its input. */
function brokenFor(...bad: string[]) {
  return (data: unknown): Character => {
    const d = data as Record<string, unknown>;
    if (typeof d.name === 'string' && bad.includes(d.name)) {
      d.name = 'MUTATED';
      d.otherNotes = null;
      throw new TypeError('v12 bug');
    }
    return migrateCharacter(data);
  };
}

const names = (list: Character[]) => list.map((c) => c.name);

function stored(ls: FakeStorage): Array<Record<string, unknown>> {
  return JSON.parse(ls.getItem(CHARS) ?? 'null') as Array<Record<string, unknown>>;
}

const isImportError = (message: string | RegExp) => (err: unknown) =>
  err instanceof ImportError && (typeof message === 'string' ? err.message === message : message.test(err.message));

// ------------------------------------------------------------------ loading

test('normal load: nothing is rewritten, edits save, identical saves are no-ops', () => {
  const a = makeChar('Aldric');
  const b = makeChar('Brannoc');
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([a, b]), [ACTIVE]: b.id });
  const before = ls.snapshot();
  const s = createCharacterStore(ls, { now: new Clock().now });
  const { characters, activeId } = s.load();
  assert.deepEqual(names(characters), ['Aldric', 'Brannoc']);
  assert.equal(activeId, b.id);
  assert.deepEqual(ls.snapshot(), before);
  assert.deepEqual(ls.setCalls, []);
  assert.equal(changesNotSaved(s.getStatus()), false);
  assert.deepEqual(s.getStatus().setAside, []);
  assert.deepEqual(s.getStatus().backups, []);

  // The page's first save effects after loading write nothing.
  s.saveCharacters(characters);
  s.saveActiveId(b.id);
  assert.deepEqual(ls.setCalls, []);

  const edited = characters.map((c) => (c.id === a.id ? { ...c, name: 'Aldric the Bold' } : c));
  s.saveCharacters(edited);
  assert.equal(ls.getItem(CHARS), JSON.stringify(edited));
  const calls = ls.setCalls.length;
  s.saveCharacters(edited);
  assert.equal(ls.setCalls.length, calls, 'an identical save writes nothing');
  s.saveActiveId(a.id);
  assert.equal(ls.getItem(ACTIVE), a.id);
  assert.equal(s.getStatus().hasUnsavedChanges, false);
});

test('first visit, empty value and empty list: one fresh character, saved once', () => {
  const initials: Array<Record<string, string>> = [{}, { [CHARS]: '' }, { [CHARS]: '[]' }];
  for (const initial of initials) {
    const ls = new FakeStorage(initial);
    const s = createCharacterStore(ls);
    const { characters, activeId } = s.load();
    assert.deepEqual(names(characters), ['New Adventurer']);
    assert.equal(ls.getItem(CHARS), JSON.stringify(characters));
    assert.equal(ls.getItem(ACTIVE), activeId);
    assert.deepEqual(ls.recoveryKeys(), []);
    s.saveCharacters(characters);
    s.saveActiveId(activeId);
    assert.deepEqual(ls.setCalls, [CHARS, ACTIVE], 'one write of each key');
  }
});

test('a save from before versioning migrates, keeps every field and is written back once', () => {
  const old = legacyChar('Old Timer');
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([old]), [ACTIVE]: 'legacy-Old Timer' });
  const { characters, activeId } = createCharacterStore(ls).load();
  const [m] = characters;
  assert.equal(m.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(activeId, 'legacy-Old Timer');
  for (const [k, v] of Object.entries(old)) {
    if (k !== 'skillTargets') assert.deepEqual((m as unknown as Record<string, unknown>)[k], v, `field ${k} kept`);
  }
  assert.deepEqual(m.skillTargets, { listen: 6, search: 6, survival: 6 });
  assert.equal(ls.getItem(CHARS), JSON.stringify(characters));

  const before = ls.snapshot();
  const calls = ls.setCalls.length;
  createCharacterStore(ls).load();
  assert.deepEqual(ls.snapshot(), before);
  assert.equal(ls.setCalls.length, calls, 'already current: nothing rewritten');
});

test('a stale active id falls back to the first character without rewriting anything', () => {
  const a = makeChar('Aldric');
  const b = makeChar('Brannoc');
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([a, b]), [ACTIVE]: 'ghost-id' });
  const before = ls.snapshot();
  const s = createCharacterStore(ls);
  const { characters, activeId } = s.load();
  assert.equal(activeId, a.id);
  s.saveCharacters(characters);
  s.saveActiveId(activeId);
  assert.deepEqual(ls.snapshot(), before);
  assert.deepEqual(ls.setCalls, []);
});

// ------------------------------------------------- whole value unreadable

test('corrupted JSON: a verified backup holds the exact text before a fresh sheet is saved', () => {
  const raw = '[{"name":"Aldric","level":3,"otherNotes":"half a save…';
  const ls = new FakeStorage({ [CHARS]: raw, [ACTIVE]: 'aldric-id', 'dolmenwood-cloud-metadata': '{}' });
  const s = createCharacterStore(ls, { now: new Clock().now });
  const { characters } = s.load();

  assert.equal(ls.recoveryKeys().length, 1);
  const [record] = ls.records();
  assert.equal(record.format, 'dolmen-spot-recovery');
  assert.equal(record.version, 1);
  const entry = asWhole(record.entries[0]);
  assert.equal(entry.raw, raw, 'raw text kept exactly');
  assert.equal(entry.activeCharacterId, 'aldric-id');
  assert.match(entry.error, /SyntaxError/);
  assert.ok(ls.setCalls.indexOf(ls.recoveryKeys()[0]) < ls.setCalls.indexOf(CHARS), 'backup written before the list');

  assert.deepEqual(names(characters), ['New Adventurer']);
  assert.equal(ls.getItem(CHARS), JSON.stringify(characters));
  assert.equal(ls.getItem(ACTIVE), 'aldric-id', 'the old active id is left alone');
  assert.equal(ls.getItem('dolmenwood-cloud-metadata'), '{}', 'unrelated keys untouched');

  const st = s.getStatus();
  assert.equal(st.backups.length, 1);
  assert.equal(st.backups[0].createdThisSession, true);
  assert.equal(changesNotSaved(st), false);
  const download = JSON.parse(s.recoveryDownload()) as DownloadFile;
  assert.equal(download.format, 'dolmen-spot-recovery-download');
  assert.equal(asWhole((download.backups[0] as RecoveryRecord).entries[0]).raw, raw);
});

test('a lone surrogate in a corrupted value survives the backup exactly', () => {
  const raw = '[{"name":"\ud800 broken';
  const ls = new FakeStorage({ [CHARS]: raw });
  createCharacterStore(ls).load();
  const text = ls.getItem(ls.recoveryKeys()[0]) ?? '';
  assert.match(text, /\\ud800/);
  assert.equal(asWhole((JSON.parse(text) as RecoveryRecord).entries[0]).raw, raw);
});

test('values that are not a list are backed up verbatim before a fresh sheet is saved', () => {
  for (const raw of ['{"name":"Aldric","level":4}', '"hello"', '"[]"', '42', 'null', 'true', ' ']) {
    const ls = new FakeStorage({ [CHARS]: raw });
    const { characters } = createCharacterStore(ls).load();
    assert.equal(ls.recoveryKeys().length, 1, raw);
    const entry = asWhole(ls.records()[0].entries[0]);
    assert.equal(entry.raw, raw);
    assert.equal(ls.getItem(CHARS), JSON.stringify(characters));
  }
});

test('loading again never duplicates a backup, and only the tab that made it calls it new', () => {
  const raw = '{{{not json';
  const ls = new FakeStorage({ [CHARS]: raw });
  // The list write fails, so the corrupted value is seen again by every load.
  ls.failSet = (k) => (k === CHARS ? quotaError(k) : null);
  const first = createCharacterStore(ls);
  first.load();
  first.load();
  const second = createCharacterStore(ls);
  second.load();
  assert.equal(ls.recoveryKeys().length, 1);
  assert.equal(ls.getItem(CHARS), raw);
  assert.equal(first.getStatus().backups[0].createdThisSession, true);
  assert.equal(second.getStatus().backups[0].createdThisSession, false);
});

test('no room for the backup: nothing is written, saving pauses, and the backup is retried (throttled)', () => {
  const raw = '[{"name":"Aldric","otherNotes":"truncat';
  const clock = new Clock();
  const ls = new FakeStorage({ [CHARS]: raw, [ACTIVE]: 'aldric-id' });
  ls.failSet = (k) => (k.startsWith(PREFIX) ? quotaError(k) : null);
  const before = ls.snapshot();
  const s = createCharacterStore(ls, { now: clock.now });
  const { characters } = s.load();
  assert.deepEqual(names(characters), ['New Adventurer'], 'runs in memory');
  assert.deepEqual(ls.snapshot(), before, 'original untouched');
  let st = s.getStatus();
  assert.equal(isSavingPaused(st), true);
  assert.equal(asWhole(st.unsavedRecovery[0]).raw, raw);
  assert.equal(st.hasUnsavedChanges, false);

  const edited = [{ ...characters[0], name: 'Typed while paused' }];
  const attempts = ls.writesTo(PREFIX);
  for (let i = 0; i < 20; i++) s.saveCharacters(edited);
  s.saveActiveId('someone-else');
  assert.equal(ls.writesTo(PREFIX), attempts, 'no retries within the interval');
  assert.deepEqual(ls.snapshot(), before, 'nothing written while paused');
  assert.equal(s.getStatus().hasUnsavedChanges, true);
  clock.advance(BACKUP_RETRY_MS);
  s.saveCharacters(edited);
  assert.equal(ls.writesTo(PREFIX), attempts + 1, 'one retry once the interval has passed');
  assert.deepEqual(ls.snapshot(), before);

  // Room again: the next retry makes the backup and verifies it, and only then is the list saved.
  ls.failSet = null;
  clock.advance(BACKUP_RETRY_MS);
  s.saveCharacters(edited);
  st = s.getStatus();
  assert.equal(isSavingPaused(st), false);
  assert.equal(asWhole(ls.records()[0].entries[0]).raw, raw);
  assert.equal(ls.getItem(CHARS), JSON.stringify(edited));
  assert.equal(st.hasUnsavedChanges, false);
});

test('no room for the backup under a real size quota: the stored value stays untouched', () => {
  const raw = '[' + '{"name":"Aldric","otherNotes":"' + 'x'.repeat(5000) + '"},';
  const clock = new Clock();
  const ls = new FakeStorage({ [CHARS]: raw, [ACTIVE]: 'a' }, { quota: 8000 });
  const before = ls.snapshot();
  const s = createCharacterStore(ls, { now: clock.now });
  s.load();
  assert.deepEqual(ls.snapshot(), before);
  assert.equal(isSavingPaused(s.getStatus()), true);
  ls.quota = 20000;
  clock.advance(BACKUP_RETRY_MS);
  s.saveCharacters([createNewAdventurer()]);
  assert.equal(asWhole(ls.records()[0].entries[0]).raw, raw);
  assert.equal(isSavingPaused(s.getStatus()), false);
});

test('a backup that reads back differently does not count, and is removed', () => {
  const ls = new FakeStorage({ [CHARS]: 'garbage{' });
  ls.mangle = (k, v) => (k.startsWith(PREFIX) ? v.slice(0, -5) : v);
  const before = ls.snapshot();
  const s = createCharacterStore(ls);
  s.load();
  assert.deepEqual(ls.snapshot(), before);
  assert.equal(isSavingPaused(s.getStatus()), true);
});

// ------------------------------------------------- characters set aside

test('a character whose migration throws stays in the list as parsed, is backed up, and the rest load', () => {
  const good1 = makeChar('Aldric');
  const bad = legacyChar('Brannoc');
  const good2 = legacyChar('Cwen');
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([good1, bad, good2]), [ACTIVE]: 'legacy-Brannoc' });
  const s = createCharacterStore(ls, { migrate: brokenFor('Brannoc') });
  const { characters, activeId } = s.load();
  assert.deepEqual(names(characters), ['Aldric', 'Cwen']);
  assert.equal(activeId, good1.id, 'falls back from the set-aside character');

  // Kept in the list, untouched by the migration that scribbled on its copy.
  const list = stored(ls);
  assert.deepEqual(list.map((c) => c.name), ['Aldric', 'Cwen', 'Brannoc']);
  assert.equal(JSON.stringify(list[2]), JSON.stringify(bad));
  assert.equal(ls.getItem(ACTIVE), 'legacy-Brannoc', 'the active key still names it');

  // ...and backed up.
  const entry = asElement(ls.records()[0].entries[0]);
  assert.equal(entry.index, 1);
  assert.match(entry.error, /TypeError: v12 bug/);
  assert.equal(JSON.stringify(entry.value), JSON.stringify(bad));
  const st = s.getStatus();
  assert.equal(st.setAside.length, 1);
  assert.equal(st.setAside[0].backupKey, ls.recoveryKeys()[0]);
  assert.equal(changesNotSaved(st), false);

  // Every later save keeps it.
  s.saveCharacters([{ ...characters[0], otherNotes: 'edited' }, characters[1]]);
  assert.deepEqual(stored(ls).map((c) => c.name), ['Aldric', 'Cwen', 'Brannoc']);
  assert.equal(JSON.stringify(stored(ls)[2]), JSON.stringify(bad));
  s.saveCharacters([characters[1]]);
  assert.deepEqual(stored(ls).map((c) => c.name), ['Cwen', 'Brannoc'], 'even after deleting the others');
});

test('characters set aside by a broken migration come back once it is fixed', () => {
  const a = makeChar('Aldric');
  const b = makeChar('Brannoc');
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([a, b]), [ACTIVE]: b.id });

  // Release N: the migration throws for everyone. A new sheet is started, but
  // not saved until the player changes it.
  const broken = createCharacterStore(ls, { migrate: brokenFor('Aldric', 'Brannoc') });
  const r1 = broken.load();
  assert.deepEqual(names(r1.characters), ['New Adventurer']);
  assert.equal(broken.getStatus().startedNewSheet, true);
  assert.deepEqual(stored(ls).map((c) => c.name), ['Aldric', 'Brannoc']);
  broken.saveCharacters([{ ...r1.characters[0], name: 'Stopgap' }]);
  assert.deepEqual(stored(ls).map((c) => c.name), ['Stopgap', 'Aldric', 'Brannoc'], 'saved once changed');

  // Same release, next visit: nothing new is backed up, and nothing is lost.
  createCharacterStore(ls, { migrate: brokenFor('Aldric', 'Brannoc') }).load();
  assert.equal(ls.recoveryKeys().length, 1);
  assert.deepEqual(stored(ls).map((c) => c.name), ['Stopgap', 'Aldric', 'Brannoc']);

  // Release N+1: fixed.
  const fixed = createCharacterStore(ls).load();
  assert.deepEqual(names(fixed.characters), ['Stopgap', 'Aldric', 'Brannoc']);
  assert.equal(fixed.activeId, b.id, 'the old active character opens again');
  assert.deepEqual(stored(ls).map((c) => c.name), ['Stopgap', 'Aldric', 'Brannoc']);
});

test('a migration that throws on its own output on the next load sets the character aside, not loses it', () => {
  const c = makeChar('Aldric', { schemaVersion: 10 });
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([c]) });
  const migrate = (data: unknown): Character => {
    const d = data as Record<string, unknown>;
    if (d.__seen) throw new Error('second run');
    const m = migrateCharacter(d);
    (m as unknown as Record<string, unknown>).__seen = true;
    return m;
  };
  assert.deepEqual(names(createCharacterStore(ls, { migrate }).load().characters), ['Aldric']);
  const second = createCharacterStore(ls, { migrate }).load();
  assert.deepEqual(names(second.characters), ['New Adventurer']);
  assert.deepEqual(stored(ls).map((x) => x.name), ['Aldric'], 'still in the list, and the new sheet not saved');
  assert.ok(createCharacterStore(ls).load().characters.some((x) => x.name === 'Aldric'), 'and back once the migration is fixed');
});

test('when every saved character is set aside, the new sheet is only saved once it changes', () => {
  const a = makeChar('Aldric');
  const b = makeChar('Brannoc');
  const raw = JSON.stringify([a, b]);
  const ls = new FakeStorage({ [CHARS]: raw, [ACTIVE]: a.id });
  const s = createCharacterStore(ls, { migrate: brokenFor('Aldric', 'Brannoc') });
  const { characters, activeId } = s.load();
  assert.deepEqual(names(characters), ['New Adventurer']);
  assert.equal(s.getStatus().startedNewSheet, true);
  // The page's first save effects, with the sheet untouched, write nothing.
  s.saveCharacters(characters);
  s.saveActiveId(activeId);
  assert.equal(ls.getItem(CHARS), raw);
  assert.equal(ls.getItem(ACTIVE), a.id);
  assert.equal(s.getStatus().hasUnsavedChanges, false);
  // Fixed before the player touched it: exactly the old list comes back.
  const fixed = createCharacterStore(ls).load();
  assert.deepEqual(names(fixed.characters), ['Aldric', 'Brannoc']);
  assert.equal(fixed.activeId, a.id);
});

test('a set-aside character stays safe in the list even when no backup can be made', () => {
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([makeChar('Aldric'), legacyChar('Brannoc')]) });
  ls.failSet = (k) => (k.startsWith(PREFIX) ? quotaError(k) : null);
  const s = createCharacterStore(ls, { migrate: brokenFor('Brannoc') });
  const { characters } = s.load();
  assert.deepEqual(names(characters), ['Aldric']);
  assert.equal(isSavingPaused(s.getStatus()), false, 'no need to pause: the list keeps it');
  assert.equal(s.getStatus().setAside[0].backupKey, null);
  assert.deepEqual(stored(ls).map((c) => c.name), ['Aldric', 'Brannoc']);
  s.saveCharacters([{ ...characters[0], otherNotes: 'edited' }]);
  assert.deepEqual(stored(ls).map((c) => c.name), ['Aldric', 'Brannoc']);
  const download = JSON.parse(s.recoveryDownload()) as DownloadFile;
  assert.equal(asElement(download.notBackedUp[0]).index, 1);
});

// ------------------------------------------------ saved by a newer version

/** A character as a newer version of Dolmen Spot might save it: a reshaped field and a new one. */
function fromNewerVersion(name: string): Record<string, unknown> {
  return {
    ...makeChar(name),
    schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    abilityScores: [{ key: 'strength', value: 17 }, { key: 'charisma', value: 15 }],
    currentDate: { day: 3, month: 2, year: 5, era: 'Second Age' },
  };
}

test('a character saved by a newer version is set aside as it is: not migrated, repaired, written back or backed up', () => {
  const future = fromNewerVersion('Future');
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([future]), [ACTIVE]: String(future.id) });
  const before = ls.snapshot();
  const s = createCharacterStore(ls);
  const { characters } = s.load();
  assert.deepEqual(names(characters), ['New Adventurer'], 'a new sheet, not saved');
  s.saveCharacters(characters);
  assert.deepEqual(ls.snapshot(), before, 'storage exactly as it was');
  const [entry] = s.getStatus().setAside;
  assert.equal(entry.reason, 'newer-version');
  assert.equal(entry.backupKey, null);
  assert.match(entry.error, /newer version/);
  assert.deepEqual(entry.value, future);
  assert.equal(changesNotSaved(s.getStatus()), false);
  assert.deepEqual((JSON.parse(s.recoveryDownload()) as DownloadFile).notBackedUp, [], "it isn't unreadable data");
});

test('a character from a newer version is carried unchanged through every save', () => {
  const future = fromNewerVersion('Future');
  const a = makeChar('Aldric');
  const quirk = { name: 'Quirk', level: 1, schemaVersion: '10' };
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([future, a, quirk]), [ACTIVE]: a.id });
  const s = createCharacterStore(ls);
  const { characters } = s.load();
  assert.deepEqual(names(characters), ['Aldric', 'Quirk'], 'a schemaVersion of digits, "10", loads');
  assert.equal(characters[1].schemaVersion, CURRENT_SCHEMA_VERSION, 'migrated from version 10, all the way');
  s.saveCharacters([{ ...characters[0], otherNotes: 'edited' }, makeChar('Brannoc')]);
  const list = stored(ls);
  assert.deepEqual(list.map((c) => c.name), ['Aldric', 'Brannoc', 'Future']);
  assert.equal(JSON.stringify(list[2]), JSON.stringify(future), 'byte for byte as parsed');
});

test('rolling forward to the newer version opens it exactly as it was saved', () => {
  const future = fromNewerVersion('Future');
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([makeChar('Aldric'), future]) });
  // This version: set aside and carried, while the player keeps playing.
  const current = createCharacterStore(ls);
  const r = current.load();
  current.saveCharacters([{ ...r.characters[0], otherNotes: 'edited in this version' }]);
  // The newer version, simulated: it understands one more schema and migrates nothing here.
  const newer = createCharacterStore(ls, { currentSchemaVersion: CURRENT_SCHEMA_VERSION + 1, migrate: (d) => d as Character });
  const { characters } = newer.load();
  assert.deepEqual(names(characters), ['Aldric', 'Future']);
  assert.deepEqual(characters[1], future, 'nothing repaired or dropped');
  assert.equal(characters[0].otherNotes, 'edited in this version');
  assert.deepEqual(newer.getStatus().setAside, []);
});

test('importing a file from a newer version is refused, alone or in a list', () => {
  const future = JSON.stringify(fromNewerVersion('Future'));
  assert.throws(() => parseImportedCharacters(future), isImportError(IMPORT_MESSAGES.newerVersion));
  assert.throws(() => parseImportedCharacter(future), isImportError(IMPORT_MESSAGES.newerVersion));
  assert.throws(
    () => parseImportedCharacters(`[${JSON.stringify(makeChar('A'))},${future}]`, { allowMany: true }),
    isImportError(IMPORT_MESSAGES.newerVersion),
  );
  assert.equal(
    parseImportedCharacter('{"name":"Quirk","schemaVersion":"12"}').schemaVersion,
    CURRENT_SCHEMA_VERSION,
    'a schemaVersion of digits is read as its number, and migrated from it',
  );
  assert.throws(
    () => parseImportedCharacter(JSON.stringify({ ...fromNewerVersion('Future'), schemaVersion: String(CURRENT_SCHEMA_VERSION + 1) })),
    isImportError(IMPORT_MESSAGES.newerVersion),
    'so digits above this version are from a newer version',
  );
});

test('a schemaVersion of digits above this version\'s ("99") is from a newer version: set aside unchanged on every visit', () => {
  const today = makeChar('Today');
  const later = { ...fromNewerVersion('Later'), schemaVersion: '99' };
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([today, later]), [ACTIVE]: today.id });
  for (let visit = 1; visit <= 3; visit++) {
    const s = createCharacterStore(ls);
    const { characters } = s.load();
    assert.deepEqual(names(characters), ['Today'], `visit ${visit}`);
    const [entry] = s.getStatus().setAside;
    assert.equal(entry.reason, 'newer-version');
    assert.deepEqual(entry.value, later, 'not migrated or repaired');
    s.saveCharacters([{ ...characters[0], otherNotes: `visit ${visit}` }]);
    assert.equal(JSON.stringify(stored(ls)[1]), JSON.stringify(later), 'carried byte for byte, its version still the string "99"');
  }
  assert.deepEqual(ls.recoveryKeys(), []);
  assert.throws(() => parseImportedCharacter(JSON.stringify(later)), isImportError(IMPORT_MESSAGES.newerVersion));
});

test('a schemaVersion that is not a finite number is not "newer": the character loads, the same on every visit', () => {
  const today = makeChar('Today');
  const ls = new FakeStorage({ [CHARS]: `[${JSON.stringify(today)},{"id":"inf","name":"Inf","level":1,"schemaVersion":1e999}]` });
  for (let visit = 1; visit <= 3; visit++) {
    const s = createCharacterStore(ls);
    assert.deepEqual(names(s.load().characters), ['Today', 'Inf'], `visit ${visit}`);
    assert.deepEqual(s.getStatus().setAside, []);
  }
  assert.deepEqual(ls.recoveryKeys(), []);
  assert.equal(parseImportedCharacter('{"name":"Inf","level":1,"schemaVersion":1e999}').name, 'Inf', 'and import takes it');
  assert.throws(() => parseImportedCharacter('{"name":"Big","level":1,"schemaVersion":1e300}'), isImportError(IMPORT_MESSAGES.newerVersion));
  // Nor is a string that isn't just digits, however large a number it spells.
  for (const version of ['1e300', '99.5', '0x99', 'ninety-nine', '']) {
    assert.equal(parseImportedCharacter(JSON.stringify({ name: 'Odd', level: 1, schemaVersion: version })).name, 'Odd', version);
  }
});

test('dismissing the newer-version notice is remembered per character until it opens', () => {
  const a = makeChar('Aldric');
  const future = fromNewerVersion('Future');
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([a, future]), [ACTIVE]: a.id });
  const s = createCharacterStore(ls);
  s.load();
  assert.equal(s.getStatus().setAside[0].dismissed, false);
  s.dismissNewerVersion();
  assert.equal(s.getStatus().setAside[0].dismissed, true);
  assert.deepEqual(JSON.parse(ls.getItem(DISMISSED_NEWER) ?? 'null'), [future.id]);

  const nextVisit = createCharacterStore(ls);
  nextVisit.load();
  assert.equal(nextVisit.getStatus().setAside[0].dismissed, true, 'still dismissed on the next visit');

  // Rolled forward, it opens, so the dismissal is forgotten...
  const newer = createCharacterStore(ls, { currentSchemaVersion: CURRENT_SCHEMA_VERSION + 1, migrate: (d) => d as Character });
  assert.deepEqual(names(newer.load().characters), ['Aldric', 'Future']);
  assert.equal(ls.getItem(DISMISSED_NEWER), null);
  // ...and a later rollback tells the player again.
  const rolledBack = createCharacterStore(ls);
  rolledBack.load();
  assert.equal(rolledBack.getStatus().setAside[0].dismissed, false);
});

test('while every character is set aside, every visit reports the new sheet, dismissed or not, until one opens', () => {
  // A rollback: the only character is from a newer version, and its notice was dismissed.
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([fromNewerVersion('Future')]) });
  const first = createCharacterStore(ls);
  first.load();
  first.dismissNewerVersion();
  for (let visit = 2; visit <= 3; visit++) {
    const s = createCharacterStore(ls);
    s.load();
    assert.equal(s.getStatus().startedNewSheet, true, `visit ${visit}: the banner's one-line reminder needs this`);
    assert.deepEqual(s.getStatus().setAside.map((e) => [e.reason, e.dismissed]), [['newer-version', true]]);
  }
  const rolledForward = createCharacterStore(ls, { currentSchemaVersion: CURRENT_SCHEMA_VERSION + 1, migrate: (d) => d as Character });
  rolledForward.load();
  assert.equal(rolledForward.getStatus().startedNewSheet, false, 'it opens, so there is no new sheet to explain');

  // Every migration fails, and the earlier-backup line was dismissed.
  const ls2 = new FakeStorage({ [CHARS]: JSON.stringify([legacyChar('Broken')]) });
  const s1 = createCharacterStore(ls2, { migrate: brokenFor('Broken') });
  s1.load();
  s1.dismissBackups(ls2.recoveryKeys());
  const s2 = createCharacterStore(ls2, { migrate: brokenFor('Broken') });
  s2.load();
  assert.equal(s2.getStatus().startedNewSheet, true);
  assert.equal(s2.getStatus().backups[0].dismissed, true);
  assert.deepEqual(s2.getStatus().setAside.map((e) => e.reason), ['migration-failed']);
  const fixed = createCharacterStore(ls2);
  assert.deepEqual(names(fixed.load().characters), ['Broken']);
  assert.equal(fixed.getStatus().startedNewSheet, false, 'fixed, it opens');
});

test('a newer-version dismissal is kept in memory when it cannot be written', () => {
  const future = fromNewerVersion('Future');
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([makeChar('Aldric'), future]) });
  ls.failSet = (k) => (k === DISMISSED_NEWER ? quotaError(k) : null);
  const s = createCharacterStore(ls);
  s.load();
  assert.doesNotThrow(() => s.dismissNewerVersion());
  assert.equal(s.getStatus().setAside[0].dismissed, true);
  s.load(); // a remount on the same visit
  assert.equal(s.getStatus().setAside[0].dismissed, true);
});

// ------------------------------------------- entries that aren't characters

test('entries that are not characters are removed only after a verified backup holds them', () => {
  const items: unknown[] = [makeChar('Aldric'), null, 42, 'Brannoc', [], { name: 'Bare', level: 1 }];
  const ls = new FakeStorage({ [CHARS]: JSON.stringify(items) });
  const s = createCharacterStore(ls);
  const { characters } = s.load();
  assert.deepEqual(names(characters), ['Aldric', 'Bare']);
  const entries = ls.records()[0].entries.map(asElement);
  assert.deepEqual(entries.map((e) => e.index), [1, 2, 3, 4]);
  assert.deepEqual(entries.map((e) => e.value), [null, 42, 'Brannoc', []]);
  assert.deepEqual(stored(ls).map((c) => c.name), ['Aldric', 'Bare']);
  assert.deepEqual(s.getStatus().setAside, []);
});

test('entries that are not characters stay in the list while no backup can be made', () => {
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([makeChar('Aldric'), null, 'x']) });
  ls.failSet = (k) => (k.startsWith(PREFIX) ? quotaError(k) : null);
  const s = createCharacterStore(ls);
  const { characters } = s.load();
  assert.deepEqual(names(characters), ['Aldric']);
  assert.equal(isSavingPaused(s.getStatus()), false);
  assert.deepEqual(s.getStatus().setAside.map((e) => e.value), [null, 'x']);
  s.saveCharacters([{ ...characters[0], otherNotes: 'edited' }]);
  assert.deepEqual((JSON.parse(ls.getItem(CHARS) ?? '[]') as unknown[]).slice(1), [null, 'x']);

  // Room again: the next load backs them up, and only then removes them.
  ls.failSet = null;
  createCharacterStore(ls).load();
  assert.deepEqual(ls.records()[0].entries.map((e) => asElement(e).value), [null, 'x']);
  assert.deepEqual(stored(ls).map((c) => c.name), ['Aldric']);
});

// ------------------------------------------------------------ saves failing

test('quota on the write-back after migrating: the stored list stays, the migrated one stays in memory', () => {
  const raw = JSON.stringify([legacyChar('Old Timer'), legacyChar('Grey')]);
  const ls = new FakeStorage({ [CHARS]: raw, [ACTIVE]: 'legacy-Grey' });
  ls.failSet = (k) => (k === CHARS ? quotaError(k) : null);
  const before = ls.snapshot();
  const s = createCharacterStore(ls, { now: new Clock().now });
  const { characters, activeId } = s.load();
  assert.equal(characters[0].schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(activeId, 'legacy-Grey');
  assert.deepEqual(ls.snapshot(), before);
  let st = s.getStatus();
  assert.match(st.saveError?.message ?? '', /QuotaExceededError/);
  assert.equal(isSavingPaused(st), false);
  s.saveCharacters(characters);
  assert.equal(s.getStatus().hasUnsavedChanges, false, 'nothing the player made is unsaved yet');

  const edited = [{ ...characters[0], otherNotes: 'new note' }, characters[1]];
  assert.doesNotThrow(() => s.saveCharacters(edited));
  assert.deepEqual(ls.snapshot(), before);
  assert.equal(s.getStatus().hasUnsavedChanges, true);

  ls.failSet = null;
  s.saveCharacters(edited);
  assert.equal(ls.getItem(CHARS), JSON.stringify(edited));
  st = s.getStatus();
  assert.equal(st.saveError, null);
  assert.equal(st.hasUnsavedChanges, false);
});

test('a real size quota on the write-back behaves the same', () => {
  const raw = JSON.stringify([legacyChar('Old Timer')]);
  // Room for the old value but not its (larger) migrated form.
  const ls = new FakeStorage({ [CHARS]: raw }, { quota: CHARS.length + raw.length + 50 });
  const before = ls.snapshot();
  const s = createCharacterStore(ls);
  const { characters } = s.load();
  assert.equal(characters[0].schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(ls.snapshot(), before);
  assert.ok(s.getStatus().saveError);
});

test('failing saves never throw, never change what is stored, and keep the time of the first failure', () => {
  const a = makeChar('Aldric');
  const clock = new Clock();
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([a]), [ACTIVE]: a.id });
  const s = createCharacterStore(ls, { now: clock.now });
  const { characters } = s.load();
  const before = ls.snapshot();
  ls.failSet = (k) => quotaError(k);
  let notified = 0;
  const unsubscribe = s.subscribe(() => notified++);

  assert.doesNotThrow(() => s.saveCharacters([{ ...characters[0], otherNotes: 'edit 1' }]));
  const first = s.getStatus().saveError;
  assert.match(first?.message ?? '', /QuotaExceededError/);
  assert.ok(notified >= 1, 'listeners told');
  clock.advance(60_000);
  assert.doesNotThrow(() => s.saveCharacters([{ ...characters[0], otherNotes: 'edit 2' }]));
  assert.equal(s.getStatus().saveError, first, 'same failure streak, same since');
  assert.doesNotThrow(() => s.saveActiveId('someone-else'));
  assert.deepEqual(ls.snapshot(), before);

  // A non-quota failure is handled the same way.
  ls.failSet = () => new DOMException('denied', 'SecurityError');
  assert.doesNotThrow(() => s.saveCharacters([{ ...characters[0], otherNotes: 'edit 3' }]));
  assert.deepEqual(ls.snapshot(), before);

  ls.failSet = null;
  const e4 = [{ ...characters[0], otherNotes: 'edit 4' }];
  s.saveCharacters(e4);
  assert.equal(ls.getItem(CHARS), JSON.stringify(e4));
  assert.equal(s.getStatus().saveError, null);
  unsubscribe();
});

// ----------------------------------------------------------------- remount

test('remounting while saves fail keeps the unsaved edits and the time they started failing', () => {
  const a = makeChar('Aldric');
  const clock = new Clock();
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([a]), [ACTIVE]: a.id });
  const s = createCharacterStore(ls, { now: clock.now });
  const { characters } = s.load();
  ls.failSet = (k) => (k === CHARS ? quotaError(k) : null);
  s.saveCharacters([{ ...characters[0], otherNotes: 'unsaved edit' }]);
  const since = s.getStatus().saveError?.since;
  clock.advance(60_000);
  const again = s.load(); // e.g. back from the changelog
  assert.equal(again.characters[0].otherNotes, 'unsaved edit');
  assert.equal(s.getStatus().saveError?.since, since);
  assert.equal(s.getStatus().hasUnsavedChanges, true);
});

test('remounting while saving is paused keeps the edits and the same character', () => {
  const raw = '[{"name":"Aldric","otherNotes":"truncated';
  const ls = new FakeStorage({ [CHARS]: raw });
  ls.failSet = (k) => (k.startsWith(PREFIX) ? quotaError(k) : null);
  const s = createCharacterStore(ls);
  const first = s.load();
  const edited = [{ ...first.characters[0], name: 'Typed for an hour' }];
  s.saveCharacters(edited);
  const second = s.load();
  assert.deepEqual(second.characters, edited);
  assert.equal(second.activeId, first.activeId);
  assert.equal(ls.getItem(CHARS), raw);
  assert.deepEqual(ls.recoveryKeys(), []);
});

test('remounting when storage is unreadable keeps the session', () => {
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([makeChar('Aldric')]) });
  ls.failGet = () => new DOMException('The operation is insecure.', 'SecurityError');
  const s = createCharacterStore(ls);
  const first = s.load();
  const edited = [{ ...first.characters[0], name: 'Ephemeral' }];
  s.saveCharacters(edited);
  assert.deepEqual(s.load().characters, edited);
});

test('remounting with everything saved reads storage again, picking up another tab\'s changes', () => {
  const a = makeChar('Aldric');
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([a]), [ACTIVE]: a.id });
  const A = createCharacterStore(ls);
  A.load();
  const B = createCharacterStore(ls);
  const b = B.load();
  B.saveCharacters([...b.characters, makeChar('From B')]);
  const again = A.load();
  assert.deepEqual(names(again.characters), ['Aldric', 'From B']);
  A.saveCharacters([...again.characters, makeChar('From A')]);
  assert.equal(A.getStatus().conflict, null);
  assert.deepEqual(stored(ls).map((c) => c.name), ['Aldric', 'From B', 'From A']);
});

// --------------------------------------------------------------- two tabs

test('two tabs: a save never overwrites what another tab saved since this tab last read or wrote', () => {
  const x = makeChar('Xan');
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([x]), [ACTIVE]: x.id });
  const A = createCharacterStore(ls);
  const B = createCharacterStore(ls);
  const a = A.load();
  const b = B.load();
  const bWork = [...b.characters, makeChar('Created in B')];
  B.saveCharacters(bWork);
  A.saveCharacters([{ ...a.characters[0], otherNotes: 'edit in A' }]);
  assert.equal(ls.getItem(CHARS), JSON.stringify(bWork), "B's work is still there");
  const st = A.getStatus();
  assert.ok(st.conflict);
  assert.equal(isSavingPaused(st), true);
  assert.equal(st.hasUnsavedChanges, true);

  // A writes nothing more, and a remount keeps A's edits in memory.
  A.saveCharacters([{ ...a.characters[0], otherNotes: 'more' }]);
  A.saveActiveId('other');
  assert.equal(ls.getItem(CHARS), JSON.stringify(bWork));
  assert.equal(ls.getItem(ACTIVE), x.id);
  assert.equal(A.load().characters[0].otherNotes, 'more');
  // Reloading A's tab sees B's work.
  assert.deepEqual(names(createCharacterStore(ls).load().characters), ['Xan', 'Created in B']);
});

test("two tabs: a paused tab that can back up again doesn't overwrite the other tab's work", () => {
  const raw = '[{"name":"Aldric","otherNotes":"truncated';
  const clock = new Clock();
  const ls = new FakeStorage({ [CHARS]: raw });
  ls.failSet = (k) => (k.startsWith(PREFIX) ? quotaError(k) : null);
  const A = createCharacterStore(ls, { now: clock.now });
  const a = A.load();
  assert.equal(isSavingPaused(A.getStatus()), true);

  // Room frees up. Tab B opens, backs up, starts fresh, and the player works there.
  ls.failSet = null;
  const B = createCharacterStore(ls, { now: clock.now });
  const b = B.load();
  const bWork = [{ ...b.characters[0], name: 'Brannoc', otherNotes: 'an hour of work in tab B' }];
  B.saveCharacters(bWork);

  // Back in tab A, one keystroke after the retry interval.
  clock.advance(BACKUP_RETRY_MS);
  A.saveCharacters([{ ...a.characters[0], name: 'x' }]);
  assert.equal(ls.getItem(CHARS), JSON.stringify(bWork));
  assert.ok(A.getStatus().conflict);
});

// --------------------------------------------------------------- backups

test('damaged or unknown backup records are listed as damaged and never break backing up', () => {
  const damaged: Record<string, string> = {
    [`${PREFIX}a`]: JSON.stringify({ format: 'dolmen-spot-recovery', version: 1, savedAt: 'x', entries: [null] }),
    [`${PREFIX}b`]: JSON.stringify({ format: 'dolmen-spot-recovery', version: 2, savedAt: 'x', entries: [] }),
    [`${PREFIX}c`]: JSON.stringify({ format: 'dolmen-spot-recovery', version: 1, entries: [] }),
    [`${PREFIX}d`]: '{"format":"dolmen-spot-recov',
    [`${PREFIX}e`]: JSON.stringify({ format: 'dolmen-spot-recovery', version: 1, savedAt: 'x', entries: [{ kind: 'character', error: 'e' }] }),
    [`${PREFIX}f`]: JSON.stringify({ format: 'dolmen-spot-recovery', version: 1, savedAt: 'x', entries: [{ kind: 'all-characters', error: 'e', raw: 7 }] }),
  };
  const ls = new FakeStorage({ [CHARS]: 'corrupt{', ...damaged });
  const s = createCharacterStore(ls);
  assert.doesNotThrow(() => s.load());
  const st = s.getStatus();
  assert.equal(isSavingPaused(st), false, 'a new backup was made regardless');
  assert.deepEqual(st.backups.filter((b) => b.record === null).map((b) => b.key), Object.keys(damaged));
  for (const [key, text] of Object.entries(damaged)) assert.equal(ls.getItem(key), text, 'damaged keys left alone');
  const download = JSON.parse(s.recoveryDownload()) as DownloadFile;
  assert.deepEqual(
    download.backups.filter((b) => 'damagedBackup' in b),
    Object.entries(damaged).map(([key, text]) => ({ key, damagedBackup: text })),
  );
});

test('backups are only reused for exactly the same data', () => {
  const ls = new FakeStorage({ [CHARS]: 'bad{' });
  ls.failSet = (k) => (k === CHARS ? quotaError(k) : null);
  createCharacterStore(ls).load();
  ls.map.set(CHARS, 'bad{ ');
  createCharacterStore(ls).load();
  assert.equal(ls.recoveryKeys().length, 2, 'one character different');

  const list = '[{"name":"V","level":1}]';
  const wholeCopy = JSON.stringify({
    format: 'dolmen-spot-recovery', version: 1, savedAt: 'x',
    entries: [{ kind: 'all-characters', raw: list, error: 'e', activeCharacterId: null }],
  });
  const ls2 = new FakeStorage({ [CHARS]: list, [`${PREFIX}x`]: wholeCopy });
  createCharacterStore(ls2, { migrate: () => { throw new Error('x'); } }).load();
  assert.equal(ls2.recoveryKeys().length, 2, "a copy of the whole list isn't a copy of the entry");
});

test('backups made in the same millisecond get different keys', () => {
  const fixed = () => new Date('2026-11-20T12:00:00.000Z');
  const ls = new FakeStorage({ [CHARS]: 'first{' });
  createCharacterStore(ls, { now: fixed, random: () => 0.5 }).load();
  ls.map.set(CHARS, 'second{');
  createCharacterStore(ls, { now: fixed, random: () => 0.5 }).load();
  const keys = ls.recoveryKeys();
  assert.equal(keys.length, 2);
  assert.ok(keys.every((k) => k.startsWith(`${PREFIX}2026-11-20T12:00:00.000Z-`)), keys.join());
  assert.deepEqual(ls.records().map((r) => asWhole(r.entries[0]).raw).sort(), ['first{', 'second{']);
});

test('Delete removes only backups downloaded this session and unchanged since', () => {
  const ls = new FakeStorage({ [CHARS]: 'bad{', [`${PREFIX}old`]: 'damaged text' });
  const s = createCharacterStore(ls);
  s.load();
  const keys = ls.recoveryKeys();
  assert.equal(keys.length, 2);
  assert.deepEqual(s.deleteBackups(keys).deleted, [], 'nothing before a download');
  assert.equal(ls.recoveryKeys().length, 2);

  s.recoveryDownload();
  assert.deepEqual(s.getStatus().downloaded?.backupKeys, keys);
  ls.map.set(`${PREFIX}old`, 'changed after the download');
  const result = s.deleteBackups([...keys, CHARS]);
  assert.deepEqual(result.deleted, [keys[0]]);
  assert.deepEqual(result.kept, [`${PREFIX}old`]);
  assert.equal(ls.getItem(`${PREFIX}old`), 'changed after the download');
  assert.ok(ls.getItem(CHARS), 'never touches the character list');
  assert.deepEqual(s.getStatus().backups.map((b) => b.key), [`${PREFIX}old`]);
});

test('deleting a downloaded backup lets a paused backup try again at once', () => {
  const clock = new Clock();
  const oldRecord = JSON.stringify({
    format: 'dolmen-spot-recovery', version: 1, savedAt: '2026-11-01T10:00:00.000Z',
    entries: [{ kind: 'all-characters', raw: 'x'.repeat(4000), error: 'e', activeCharacterId: null }],
  });
  const raw = '[{"name":"Aldric"' + 'y'.repeat(3000);
  const initial = { [CHARS]: raw, [`${PREFIX}old`]: oldRecord };
  const ls = new FakeStorage(initial);
  ls.quota = ls.size() + raw.length; // no room for a copy of raw until the old backup goes
  const s = createCharacterStore(ls, { now: clock.now });
  const { characters } = s.load();
  assert.equal(isSavingPaused(s.getStatus()), true);
  s.recoveryDownload();
  assert.deepEqual(s.deleteBackups([`${PREFIX}old`]).deleted, [`${PREFIX}old`]);
  s.saveCharacters(characters); // no clock change needed
  assert.equal(isSavingPaused(s.getStatus()), false);
  assert.equal(ls.getItem(CHARS), JSON.stringify(characters));
  assert.equal(asWhole(ls.records()[0].entries[0]).raw, raw);
});

test('Start saving again works only after a download, and saves the current characters over the unreadable value', () => {
  const raw = '[{"name":"Aldric","otherNotes":"truncated';
  const ls = new FakeStorage({ [CHARS]: raw, [ACTIVE]: 'aldric-id' });
  ls.failSet = (k) => (k.startsWith(PREFIX) ? quotaError(k) : null);
  const s = createCharacterStore(ls);
  const { characters } = s.load();
  const edited = [{ ...characters[0], name: 'Brannoc' }];
  s.saveCharacters(edited);
  assert.equal(s.releaseUnsavedRecovery(), false, 'not before the download');
  assert.equal(ls.getItem(CHARS), raw);

  const download = JSON.parse(s.recoveryDownload()) as DownloadFile;
  assert.equal(asWhole(download.notBackedUp[0]).raw, raw);
  assert.equal(s.getStatus().downloaded?.coversUnsavedRecovery, true);
  assert.equal(s.releaseUnsavedRecovery(), true);
  assert.equal(ls.getItem(CHARS), JSON.stringify(edited));
  assert.equal(ls.getItem(ACTIVE), edited[0].id);
  const st = s.getStatus();
  assert.equal(changesNotSaved(st), false);
  assert.equal(st.hasUnsavedChanges, false);
  assert.equal(s.releaseUnsavedRecovery(), false, 'nothing left to release');
});

test("Start saving again still won't overwrite another tab's save", () => {
  const raw = '[{"name":"Aldric","otherNotes":"truncated';
  const ls = new FakeStorage({ [CHARS]: raw });
  ls.failSet = (k) => (k.startsWith(PREFIX) ? quotaError(k) : null);
  const A = createCharacterStore(ls);
  A.load();
  A.recoveryDownload();
  ls.failSet = null;
  const B = createCharacterStore(ls);
  const bWork = [{ ...B.load().characters[0], name: 'Saved in B' }];
  B.saveCharacters(bWork);
  assert.equal(A.releaseUnsavedRecovery(), true);
  assert.equal(ls.getItem(CHARS), JSON.stringify(bWork));
  assert.ok(A.getStatus().conflict);
});

test('dismissing a backup is remembered per key, best-effort', () => {
  const clock = new Clock();
  const ls = new FakeStorage({ [CHARS]: 'bad{' });
  const s1 = createCharacterStore(ls, { now: clock.now });
  s1.load();
  const [key] = ls.recoveryKeys();
  s1.dismissBackups([key, `${PREFIX}gone`]);
  assert.equal(s1.getStatus().backups[0].dismissed, true);
  assert.deepEqual(JSON.parse(ls.getItem(DISMISSED) ?? ''), [key], 'only existing keys are kept');
  const nextVisit = createCharacterStore(ls);
  nextVisit.load();
  assert.equal(nextVisit.getStatus().backups[0].dismissed, true, 'remembered on the next visit');

  // A newer backup isn't dismissed.
  clock.advance(1000);
  ls.map.set(CHARS, 'worse{');
  const s2 = createCharacterStore(ls, { now: clock.now });
  s2.load();
  assert.deepEqual(s2.getStatus().backups.map((b) => b.dismissed), [true, false]);

  // When the dismissal can't be stored, it lasts for this session only.
  const newer = ls.recoveryKeys()[1];
  ls.failSet = (k) => (k === DISMISSED ? quotaError(k) : null);
  s2.dismissBackups([newer]);
  assert.deepEqual(s2.getStatus().backups.map((b) => b.dismissed), [true, true]);
  ls.failSet = null;
  const s3 = createCharacterStore(ls);
  s3.load();
  assert.deepEqual(s3.getStatus().backups.map((b) => b.dismissed), [true, false]);

  // A damaged list of dismissals is ignored.
  ls.map.set(DISMISSED, '{nope');
  const s4 = createCharacterStore(ls);
  assert.doesNotThrow(() => s4.load());
  assert.deepEqual(s4.getStatus().backups.map((b) => b.dismissed), [false, false]);
});

// ------------------------------------------------------- odd environments

test('unreadable or missing storage: run in memory and write nothing', () => {
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([makeChar('Aldric')]), [ACTIVE]: 'x' });
  ls.failGet = () => new DOMException('The operation is insecure.', 'SecurityError');
  const before = ls.snapshot();
  const s = createCharacterStore(ls);
  const { characters } = s.load();
  assert.deepEqual(names(characters), ['New Adventurer']);
  assert.equal(s.getStatus().storageUnreadable, true);
  s.saveCharacters([{ ...characters[0], name: 'Ephemeral' }]);
  s.saveActiveId('y');
  s.dismissBackups(['k']);
  assert.deepEqual(ls.setCalls, []);
  assert.deepEqual(ls.snapshot(), before);
  assert.equal(s.getStatus().hasUnsavedChanges, true);

  const none = createCharacterStore(null);
  assert.equal(none.load().characters.length, 1);
  assert.equal(none.getStatus().storageUnreadable, true);
  assert.doesNotThrow(() => none.saveCharacters([]));
});

test('an invalid clock never makes the store throw', () => {
  const ls = new FakeStorage({ [CHARS]: 'b{' });
  const s = createCharacterStore(ls, { now: () => new Date(NaN) });
  assert.doesNotThrow(() => s.load());
  assert.doesNotThrow(() => s.saveCharacters([createNewAdventurer()]));
  assert.doesNotThrow(() => s.recoveryDownload());
});

// ------------------------------------------------------------------ imports

test('imports: anything that is not a character file is rejected before anything is added', () => {
  const cases: Array<[string, string]> = [
    ['not json', IMPORT_MESSAGES.notCharacter],
    ['', IMPORT_MESSAGES.notCharacter],
    ['null', IMPORT_MESSAGES.notCharacter],
    ['42', IMPORT_MESSAGES.notCharacter],
    ['"x"', IMPORT_MESSAGES.notCharacter],
    ['{}', IMPORT_MESSAGES.notCharacter],
    ['{"foo":1}', IMPORT_MESSAGES.notCharacter],
    ['{"name":"x","version":"0.1.0","dependencies":{}}', IMPORT_MESSAGES.notCharacter],
    [JSON.stringify({ provider: 'onedrive', fileId: 'f' }), IMPORT_MESSAGES.notCharacter],
    [JSON.stringify({ name: 42, level: 1 }), IMPORT_MESSAGES.notCharacter],
    ['[]', IMPORT_MESSAGES.several],
    [JSON.stringify([makeChar('A')]), IMPORT_MESSAGES.several],
  ];
  for (const [json, message] of cases) {
    assert.throws(() => parseImportedCharacters(json), isImportError(message), json);
  }
});

test('imports: recovery files are recognised and explained, including our own download', () => {
  const ls = new FakeStorage({ [CHARS]: '[{"name":"Aldric","otherNotes":"trunc' });
  const s = createCharacterStore(ls);
  s.load();
  const files = [
    s.recoveryDownload(),
    ls.getItem(ls.recoveryKeys()[0]) ?? '',
    JSON.stringify({ app: 'Dolmen Spot', about: '', backups: [], notBackedUp: [] }),
  ];
  for (const json of files) {
    for (const allowMany of [false, true]) {
      assert.throws(() => parseImportedCharacters(json, { allowMany }), isImportError(IMPORT_MESSAGES.recoveryFile));
    }
    assert.throws(() => parseImportedCharacter(json), isImportError(IMPORT_MESSAGES.recoveryFile));
  }
  assert.throws(() => parseImportedCharacters(`[${files[0]}]`, { allowMany: true }), isImportError(IMPORT_MESSAGES.recoveryFile));
});

test("imports: the error screen's save-data file is explained as what it is", () => {
  const file = JSON.stringify({
    format: SAVE_DATA_FORMAT,
    app: 'Dolmen Spot',
    about: 'Everything Dolmen Spot had saved in this browser',
    downloadedAt: '2026-11-20T12:00:00.000Z',
    error: 'Error: x',
    localStorage: { [CHARS]: JSON.stringify([makeChar('Saved')]) },
  });
  assert.throws(() => parseImportedCharacter(file), isImportError(IMPORT_MESSAGES.errorScreenFile));
  assert.throws(() => parseImportedCharacters(file, { allowMany: true }), isImportError(IMPORT_MESSAGES.errorScreenFile));
  assert.throws(() => parseImportedCharacters(`[${file}]`, { allowMany: true }), isImportError(IMPORT_MESSAGES.errorScreenFile));
  assert.equal(
    IMPORT_MESSAGES.errorScreenFile,
    "That's a save-data file from Dolmen Spot's error screen, not a character file, so it can't be imported. Keep it, or attach it to a bug report.",
    'the message the error screen\'s own module defines',
  );
});

test('imports: one character, or a list when allowed, each migrated with a new id', () => {
  const old = legacyChar('Imported');
  const [one] = parseImportedCharacters(JSON.stringify(old));
  assert.equal(one.name, 'Imported');
  assert.equal(one.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.notEqual(one.id, old.id);
  assert.equal(parseImportedCharacter(JSON.stringify(old)).name, 'Imported');

  const list = parseImportedCharacters(JSON.stringify([makeChar('A'), legacyChar('B')]), { allowMany: true });
  assert.deepEqual(names(list), ['A', 'B']);
  assert.notEqual(list[0].id, list[1].id);
  assert.throws(
    () => parseImportedCharacters(JSON.stringify([makeChar('A'), { foo: 1 }]), { allowMany: true }),
    isImportError(/^Entry 2 in that file isn't a character, so nothing was imported\.$/),
  );
  assert.throws(() => parseImportedCharacters('[]', { allowMany: true }), isImportError(IMPORT_MESSAGES.empty));
  assert.throws(
    () => parseImportedCharacters(JSON.stringify(old), { migrate: () => { throw new Error('x'); } }),
    isImportError(IMPORT_MESSAGES.notOpened),
  );
});

// ------------------------------------------------- hostile or broken data

/** `n` arrays nested around a 0. */
function nested(n: number): string {
  return `${'['.repeat(n)}0${']'.repeat(n)}`;
}

/**
 * A character holding `n` nested arrays in its field `x`, so it nests n + 1
 * levels deep, counting itself. The limit is 100 levels, measured from the character.
 */
function deepChar(name: string, n: number): string {
  return `{"name":${JSON.stringify(name)},"level":1,"x":${nested(n)}}`;
}

type TextEntry = Extract<RecoveryEntry, { kind: 'character-text' }>;

function asText(entry: RecoveryEntry | undefined): TextEntry {
  if (!entry || entry.kind !== 'character-text') throw new assert.AssertionError({ message: `not a text entry: ${JSON.stringify(entry)}` });
  return entry;
}

test('imports measure depth from each character: 100 levels deep is accepted, 101 refused, alone or in a list', () => {
  assert.equal(parseImportedCharacter(deepChar('At the limit', 99)).name, 'At the limit');
  assert.throws(() => parseImportedCharacter(deepChar('Past the limit', 100)), isImportError(IMPORT_MESSAGES.notCharacter));
  const atLimit = parseImportedCharacters(`[${deepChar('A', 99)},${deepChar('B', 99)}]`, { allowMany: true });
  assert.deepEqual(names(atLimit), ['A', 'B'], 'the list adds no depth');
  assert.throws(
    () => parseImportedCharacters(`[${deepChar('A', 99)},${deepChar('B', 100)}]`, { allowMany: true }),
    isImportError(/^Entry 2 in that file isn't a character/),
  );
  assert.throws(
    () => parseImportedCharacter(deepChar('Grows', 99), (d) => ({ ...migrateCharacter(d), x: [JSON.parse(nested(99))] }) as Character),
    isImportError(IMPORT_MESSAGES.notOpened),
    'a migration that nests it deeper still is refused, so it never reaches storage',
  );
});

test('loading measures depth from each saved character: 100 levels deep loads, 101 sets aside only that one', () => {
  const a = makeChar('Aldric');
  const ok = new FakeStorage({ [CHARS]: `[${JSON.stringify(a)},${deepChar('At the limit', 99)}]`, [ACTIVE]: a.id });
  const s = createCharacterStore(ok);
  assert.deepEqual(names(s.load().characters), ['Aldric', 'At the limit']);
  assert.deepEqual(s.getStatus().setAside, []);
  assert.deepEqual(ok.recoveryKeys(), []);

  const text = deepChar('Past the limit', 100);
  const bad = new FakeStorage({ [CHARS]: `[${JSON.stringify(a)},${text}]`, [ACTIVE]: a.id });
  const s2 = createCharacterStore(bad);
  assert.deepEqual(names(s2.load().characters), ['Aldric']);
  assert.equal(isSavingPaused(s2.getStatus()), false, 'the other characters keep saving');
  assert.deepEqual(bad.records()[0].entries, [
    { kind: 'character-text', index: 1, error: 'Nested more than 100 levels deep', name: 'Past the limit', raw: text },
  ]);
  assert.deepEqual(stored(bad).map((c) => c.name), ['Aldric'], 'it leaves the list once a backup holds its text');
  assert.deepEqual(s2.getStatus().setAside, []);

  // A migration that nests a character deeper than the limit sets it aside, unchanged, rather than save it.
  const grows = new FakeStorage({ [CHARS]: `[${JSON.stringify(a)},${deepChar('Grows', 99)}]`, [ACTIVE]: a.id });
  const before = grows.getItem(CHARS);
  const s3 = createCharacterStore(grows, {
    migrate: (d) => (((d as Record<string, unknown>).name === 'Grows' ? { ...migrateCharacter(d), x: [JSON.parse(nested(99))] } : migrateCharacter(d)) as Character),
  });
  assert.deepEqual(names(s3.load().characters), ['Aldric']);
  assert.deepEqual(s3.getStatus().setAside.map((e) => [e.reason, e.error]), [['migration-failed', 'Error: Migrated character is nested more than 100 levels deep']]);
  assert.equal(grows.getItem(CHARS), before);
});

test('when every saved entry moves to a backup, a new sheet is started, and saved once it changes', () => {
  const raw = `[${deepChar('Deepo', 100)}]`;
  const ls = new FakeStorage({ [CHARS]: raw });
  const s = createCharacterStore(ls);
  const { characters } = s.load();
  assert.deepEqual(names(characters), ['New Adventurer']);
  assert.equal(s.getStatus().startedNewSheet, true);
  assert.equal(ls.getItem(CHARS), raw, 'not written yet, so every load until the first change finds the same');
  assert.equal(ls.recoveryKeys().length, 1);
  const again = createCharacterStore(ls); // a remount, or StrictMode's second load
  again.load();
  assert.equal(again.getStatus().startedNewSheet, true);
  assert.equal(ls.recoveryKeys().length, 1, 'the same backup holds it');
  s.saveCharacters([{ ...characters[0], name: 'Edited' }]);
  assert.deepEqual(stored(ls).map((c) => c.name), ['Edited'], 'the first change saves the sheet, and the backed-up entry leaves the list');
  const junk = createCharacterStore(new FakeStorage({ [CHARS]: '[null,42]' }));
  junk.load();
  assert.equal(junk.getStatus().startedNewSheet, true, 'entries that are not characters, likewise');
  const first = createCharacterStore(new FakeStorage({}));
  first.load();
  assert.equal(first.getStatus().startedNewSheet, false, 'a first visit');
  const replaced = createCharacterStore(new FakeStorage({ [CHARS]: 'bad{' }));
  replaced.load();
  assert.equal(replaced.getStatus().startedNewSheet, false, 'a replaced whole value has its own wording');
});

test('each too-deep entry gets its own backup: one already backed up never stands in for another', () => {
  const a = makeChar('Aldric');
  const first = `{"name":"First","level":1,"x":${nested(5_000)}}`;
  const second = `{"name":"Second","level":1,"x":${nested(6_000)}}`;
  const ls = new FakeStorage({ [CHARS]: `[${JSON.stringify(a)},${first}]`, [ACTIVE]: a.id });
  // Backup keys start with the time, so the backups list in the order they
  // were made only if the loads are at least a millisecond apart.
  const clock = new Clock();
  createCharacterStore(ls, { now: clock.now }).load();
  clock.advance(1000);
  ls.map.set(CHARS, `[${JSON.stringify(a)},${second}]`); // another tab, or an older version, wrote a different one
  createCharacterStore(ls, { now: clock.now }).load();
  assert.deepEqual(ls.records().map((r) => asText(r.entries[0]).raw), [first, second]);
  assert.deepEqual(stored(ls).map((c) => c.name), ['Aldric']);
});

test('backups measure depth from each character too: 100 levels deep is a valid record, 101 a damaged one', () => {
  const record = (n: number) =>
    `{"format":"dolmen-spot-recovery","version":1,"savedAt":"2026-11-20T10:00:00.000Z","entries":` +
    `[{"kind":"character","index":0,"error":"TypeError: v12 bug","value":${deepChar('Wendeline', n)}}]}`;
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([makeChar('A')]), [`${PREFIX}a`]: record(99), [`${PREFIX}b`]: record(100) });
  const s = createCharacterStore(ls);
  s.load();
  const [atLimit, past] = s.getStatus().backups;
  assert.equal(asElement(atLimit.record?.entries[0]).index, 0, 'valid: the record adds no depth');
  assert.equal(past.record, null);
  const file = JSON.parse(s.recoveryDownload()) as DownloadFile;
  assert.deepEqual(file.backups[1], { key: `${PREFIX}b`, damagedBackup: record(100) }, 'still downloadable, as its exact text');
});

test('backup records keep only their known fields, in the status and in the download', () => {
  const record = {
    format: 'dolmen-spot-recovery', version: 1, savedAt: '2026-11-20T10:00:00.000Z', extra: 'record-level',
    entries: [
      { kind: 'character', index: 0, error: 'e', value: { name: 'Wendeline' }, junk: { deep: [1, 2] } },
      { kind: 'all-characters', error: 'e', raw: 'old', activeCharacterId: null, junk: 1 },
      { kind: 'character-text', index: 1, error: 'e', name: 'Deep', raw: '{"name":"Deep"}', junk: true },
    ],
  };
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([makeChar('A')]), [`${PREFIX}a`]: JSON.stringify(record) });
  const s = createCharacterStore(ls);
  s.load();
  const known = {
    format: 'dolmen-spot-recovery', version: 1, savedAt: '2026-11-20T10:00:00.000Z',
    entries: [
      { kind: 'character', index: 0, error: 'e', value: { name: 'Wendeline' } },
      { kind: 'all-characters', error: 'e', raw: 'old', activeCharacterId: null },
      { kind: 'character-text', index: 1, error: 'e', name: 'Deep', raw: '{"name":"Deep"}' },
    ],
  };
  assert.deepEqual(s.getStatus().backups[0].record, known);
  assert.deepEqual((JSON.parse(s.recoveryDownload()) as DownloadFile).backups[0], known);
  assert.equal(s.getStatus().backups[0].raw, JSON.stringify(record), 'the stored text itself is untouched');
});

test('a file Import accepts at the depth limit loads again on the next visit, with every character', () => {
  const chars = [makeChar('Aldric'), makeChar('Brannoc'), makeChar('Cwen')];
  const ls = new FakeStorage({ [CHARS]: JSON.stringify(chars), [ACTIVE]: chars[0].id });
  const s = createCharacterStore(ls);
  const { characters } = s.load();
  s.saveCharacters([...characters, ...parseImportedCharacters(deepChar('Shared by a friend', 99), { allowMany: true })]);
  const next = createCharacterStore(ls);
  assert.deepEqual(names(next.load().characters), ['Aldric', 'Brannoc', 'Cwen', 'Shared by a friend']);
  assert.deepEqual(next.getStatus().setAside, []);
  assert.deepEqual(ls.recoveryKeys(), []);
});

test('a character just inside the depth limit that is set aside is backed up once, however often it loads', () => {
  const ls = new FakeStorage({ [CHARS]: `[${JSON.stringify(makeChar('Good'))},${deepChar('Deep', 99)}]` });
  for (let visit = 0; visit < 3; visit++) createCharacterStore(ls, { migrate: brokenFor('Deep') }).load();
  const s = createCharacterStore(ls, { migrate: brokenFor('Deep') });
  s.load();
  assert.equal(ls.recoveryKeys().length, 1);
  assert.ok(s.getStatus().backups[0].record, 'its backup is valid, so the next load finds it');
  assert.equal(s.getStatus().setAside[0].backupKey, ls.recoveryKeys()[0]);
});

test('entries nested thousands of levels deep: only they are set aside, backed up as their exact text, then dropped', () => {
  const good = makeChar('Aldric');
  const character = `{"name":"Deep","level":1,"x":${nested(12_000)}}`;
  const notCharacter = nested(12_000);
  const ls = new FakeStorage({ [CHARS]: `[${JSON.stringify(good)},${character},${notCharacter}]`, [ACTIVE]: good.id });
  ls.failSet = (k) => (k === CHARS ? quotaError(k) : null); // the list can't be rewritten on this visit
  const s = createCharacterStore(ls);
  const loaded = s.load();
  assert.deepEqual(names(loaded.characters), ['Aldric']);
  assert.equal(s.getStatus().unsavedRecovery.length, 0, 'not the whole value');
  assert.deepEqual(ls.records()[0].entries.map(asText).map((e) => [e.index, e.name, e.raw]), [[1, 'Deep', character], [2, null, notCharacter]]);
  assert.doesNotThrow(() => s.recoveryDownload());

  // The next visit finds the same backup, and drops both from the list.
  ls.failSet = null;
  const next = createCharacterStore(ls);
  const again = next.load();
  assert.equal(ls.recoveryKeys().length, 1, 'no second backup');
  assert.equal(ls.getItem(CHARS), JSON.stringify(again.characters));
  next.saveCharacters([{ ...again.characters[0], otherNotes: 'edited' }]);
  assert.equal(stored(ls)[0].otherNotes, 'edited');
});

test('with no room for a backup, a too-deep entry stays in the list as its exact text, through every save', () => {
  const good = makeChar('Aldric');
  const text = `{ "name" : "Deep",\n  "level": 1.0, "x": ${nested(12_000)} }`;
  const ls = new FakeStorage({ [CHARS]: `[\n${JSON.stringify(good)} ,\n ${text}\n]`, [ACTIVE]: good.id });
  ls.failSet = (k) => (k.startsWith(PREFIX) ? quotaError(k) : null);
  const s = createCharacterStore(ls);
  const loaded = s.load();
  const [aside] = s.getStatus().setAside;
  assert.deepEqual([aside.reason, aside.text, aside.backupKey], ['too-deep', text, null]);
  assert.equal(isSavingPaused(s.getStatus()), false);
  const edited = { ...loaded.characters[0], otherNotes: 'edited' };
  s.saveCharacters([edited]);
  assert.equal(ls.getItem(CHARS), `[${JSON.stringify(edited)},${text}]`, 'byte for byte, never serialised again');
  const file = JSON.parse(s.recoveryDownload()) as DownloadFile;
  assert.equal(asText(file.notBackedUp[0]).raw, text);
});

test('a too-deep entry keeps its exact text, whatever the other entries hold', () => {
  const tricky = makeChar('Tricky', { otherNotes: 'brackets ] } [ { , a quote " a backslash \\ and   🐐' });
  const text = `{"name":"Deep \\"] }\\\\","level":1,"x":${nested(150)}}`;
  const raw = `[ ${JSON.stringify(tricky)},"a string, not a character ] [",\t${text} ]`;
  const ls = new FakeStorage({ [CHARS]: raw });
  const s = createCharacterStore(ls);
  assert.deepEqual(names(s.load().characters), ['Tricky']);
  const [record] = ls.records();
  assert.equal(asElement(record.entries[0]).value, 'a string, not a character ] [');
  const deep = asText(record.entries[1]);
  assert.equal(deep.raw, text);
  assert.equal(deep.name, 'Deep "] }\\');
});

test('a save that cannot be serialised is reported, not thrown', () => {
  const a = makeChar('Aldric');
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([a]), [ACTIVE]: a.id });
  const s = createCharacterStore(ls);
  const { characters } = s.load();
  const before = ls.snapshot();
  assert.doesNotThrow(() => s.saveCharacters([{ ...characters[0], otherNotes: BigInt(1) as unknown as string }]));
  assert.ok(s.getStatus().saveError);
  assert.equal(s.getStatus().hasUnsavedChanges, true);
  assert.deepEqual(ls.snapshot(), before);
  assert.equal(s.unsavedCharactersJson(), null, "doesn't throw either");
});

test('a clock that jumps back does not stall the paused backup retry', () => {
  const clock = new Clock();
  const ls = new FakeStorage({ [CHARS]: 'bad{' });
  ls.failSet = (k) => (k.startsWith(PREFIX) ? quotaError(k) : null);
  const s = createCharacterStore(ls, { now: clock.now });
  const { characters } = s.load();
  ls.failSet = null; // room again
  clock.advance(-60 * 60 * 1000); // the clock is corrected back an hour
  clock.advance(10_000);
  s.saveCharacters(characters);
  assert.equal(isSavingPaused(s.getStatus()), false, 'retried at once, not an hour later');
  assert.equal(asWhole(ls.records()[0].entries[0]).raw, 'bad{');
});

// ------------------------------------------- unsaved changes, two tabs, release

test('unsaved changes are measured from the last list this tab saved', () => {
  const a = makeChar('Aldric');
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([a]), [ACTIVE]: a.id });
  const s = createCharacterStore(ls);
  const r = s.load();
  const saved = [{ ...r.characters[0], otherNotes: 'saved edit' }];
  s.saveCharacters(saved);
  // Another tab saves, so this tab's next change stops at the conflict...
  ls.map.set(CHARS, JSON.stringify([makeChar('From another tab')]));
  s.saveCharacters([{ ...saved[0], otherNotes: 'unsaved edit' }]);
  assert.ok(s.getStatus().conflict);
  assert.equal(s.getStatus().hasUnsavedChanges, true);
  // ...and undoing that change leaves nothing this tab hasn't saved.
  s.saveCharacters(saved);
  assert.equal(s.getStatus().hasUnsavedChanges, false);
});

test('once another tab has changed the characters, this tab writes nothing more this visit, even if the list matches again', () => {
  const x = makeChar('Xan');
  const original = JSON.stringify([x]);
  const ls = new FakeStorage({ [CHARS]: original, [ACTIVE]: x.id });
  const s = createCharacterStore(ls);
  const r = s.load();
  ls.map.set(CHARS, JSON.stringify([makeChar('From another tab')]));
  s.saveCharacters([{ ...r.characters[0], otherNotes: 'edit' }]);
  assert.ok(s.getStatus().conflict);
  ls.map.set(CHARS, original); // the other tab puts the list back
  const calls = ls.setCalls.length;
  s.saveCharacters([{ ...r.characters[0], otherNotes: 'another edit' }]);
  assert.equal(ls.setCalls.length, calls, 'still stopped: the banner asks for a reload');
  assert.equal(ls.getItem(CHARS), original);
});

test('storage that was unreadable at load stays off for the visit, even if it starts working', () => {
  const ls = new FakeStorage({});
  ls.failGet = () => new DOMException('The operation is insecure.', 'SecurityError');
  const s = createCharacterStore(ls);
  const { characters } = s.load();
  assert.equal(s.getStatus().storageUnreadable, true);
  ls.failGet = null; // readable again, and empty
  s.saveCharacters([{ ...characters[0], name: 'Typed' }]);
  s.saveActiveId('other');
  assert.deepEqual(ls.setCalls, [], 'nothing written: a reload starts saving');
});

test("a first visit whose save failed still notices another tab's save", () => {
  const ls = new FakeStorage({});
  ls.failSet = (k) => (k === CHARS ? quotaError(k) : null);
  const s = createCharacterStore(ls);
  const r = s.load();
  ls.failSet = null;
  const other = JSON.stringify([makeChar('Other tab')]);
  ls.map.set(CHARS, other);
  s.saveCharacters([{ ...r.characters[0], name: 'Edit in this tab' }]);
  assert.equal(ls.getItem(CHARS), other, 'not overwritten');
  assert.ok(s.getStatus().conflict);
});

test("storage that becomes unreadable after a good load: a remount keeps this tab's characters", () => {
  const a = makeChar('Aldric');
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([a]), [ACTIVE]: a.id });
  const s = createCharacterStore(ls);
  const { characters } = s.load();
  s.saveCharacters([{ ...characters[0], name: 'Aldric the Saved' }]);
  ls.failGet = () => new DOMException('The operation is insecure.', 'SecurityError');
  const again = s.load();
  assert.deepEqual(names(again.characters), ['Aldric the Saved']);
  assert.equal(s.getStatus().storageUnreadable, true);
});

test("Start Saving Again leaves the active character alone if the list couldn't be written", () => {
  const raw = '[{"name":"Aldric","otherNotes":"truncated';
  const ls = new FakeStorage({ [CHARS]: raw, [ACTIVE]: 'aldric-id' });
  ls.failSet = (k) => (k.startsWith(PREFIX) ? quotaError(k) : null);
  const s = createCharacterStore(ls);
  s.load();
  s.recoveryDownload();
  ls.failSet = (k) => (k === CHARS || k.startsWith(PREFIX) ? quotaError(k) : null);
  assert.equal(s.releaseUnsavedRecovery(), true);
  assert.equal(ls.getItem(CHARS), raw, 'the list write failed');
  assert.equal(ls.getItem(ACTIVE), 'aldric-id', 'so the active id is left as it was');
  assert.ok(s.getStatus().saveError);
});

test('a recovery is remembered, so it can be announced, until the next problem', () => {
  const a = makeChar('Aldric');
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([a]), [ACTIVE]: a.id });
  const s = createCharacterStore(ls);
  const { characters } = s.load();
  assert.equal(s.getStatus().savingRecovered, false);
  ls.failSet = (k) => quotaError(k);
  s.saveCharacters([{ ...characters[0], otherNotes: 'one' }]);
  assert.equal(s.getStatus().savingRecovered, false);
  ls.failSet = null;
  s.saveCharacters([{ ...characters[0], otherNotes: 'two' }]);
  assert.equal(s.getStatus().savingRecovered, true);
  ls.failSet = (k) => quotaError(k);
  s.saveCharacters([{ ...characters[0], otherNotes: 'three' }]);
  assert.equal(s.getStatus().savingRecovered, false);
});

test('"saving again" is news only until the next load (a remount says nothing about it)', () => {
  const a = makeChar('Aldric');
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([a]), [ACTIVE]: a.id });
  const s = createCharacterStore(ls);
  const { characters } = s.load();
  ls.failSet = (k) => quotaError(k);
  s.saveCharacters([{ ...characters[0], otherNotes: 'one' }]);
  ls.failSet = null;
  s.saveCharacters([{ ...characters[0], otherNotes: 'two' }]);
  assert.equal(s.getStatus().savingRecovered, true);
  s.load();
  assert.equal(s.getStatus().savingRecovered, false);

  // The live region that announced it forgets it as it goes (so a remounted one starts empty).
  ls.failSet = (k) => quotaError(k);
  s.saveCharacters([{ ...characters[0], otherNotes: 'three' }]);
  ls.failSet = null;
  s.saveCharacters([{ ...characters[0], otherNotes: 'four' }]);
  assert.equal(s.getStatus().savingRecovered, true);
  s.clearSavingRecovered();
  assert.equal(s.getStatus().savingRecovered, false);
});

test('a load that fails part-way leaves the tab as it was', () => {
  const a = makeChar('Aldric');
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([a, legacyChar('Broken')]), [ACTIVE]: a.id });
  let poisoned = false;
  const broken = brokenFor('Broken', 'Another');
  // A migration whose result can't be serialised makes the load fail after it has read everything.
  const migrate = (d: unknown): Character => (poisoned ? { ...broken(d), otherNotes: BigInt(1) as unknown as string } : broken(d));
  const s = createCharacterStore(ls, { migrate });
  const first = s.load();
  // Another tab sets a second character aside; then this tab remounts, and its load fails.
  ls.map.set(CHARS, JSON.stringify([a, legacyChar('Broken'), legacyChar('Another')]));
  poisoned = true;
  const again = s.load();
  assert.deepEqual(again, first, 'the same session');
  assert.equal(s.getStatus().storageUnreadable, true, 'and nothing more is written this visit');
  s.saveCharacters(again.characters);
  assert.equal(s.getStatus().hasUnsavedChanges, false, 'it still carries what its session carried');
});

test('a status listener that throws is logged, not passed on', () => {
  const s = createCharacterStore(new FakeStorage({}));
  s.subscribe(() => { throw new Error('a bug in a listener'); });
  assert.doesNotThrow(() => {
    const { characters } = s.load();
    s.saveCharacters([{ ...characters[0], name: 'Edited' }]);
  });
});

// ------------------------------------------------------ for other screens

test("unsavedCharactersJson: this tab's characters, importable, only while storage may not have them", () => {
  const a = makeChar('Aldric');
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([a]), [ACTIVE]: a.id });
  const s = createCharacterStore(ls);
  assert.equal(s.unsavedCharactersJson(), null, 'nothing loaded yet');
  const { characters } = s.load();
  assert.equal(s.unsavedCharactersJson(), null, 'everything is saved');
  ls.failSet = (k) => quotaError(k);
  const edited = [{ ...characters[0], name: 'Aldric (unsaved)' }, makeChar('Brannoc')];
  s.saveCharacters(edited);
  const json = s.unsavedCharactersJson();
  assert.ok(json);
  assert.deepEqual(JSON.parse(json), edited);
  assert.deepEqual(names(parseImportedCharacters(json, { allowMany: true })), ['Aldric (unsaved)', 'Brannoc'], 'Import Character accepts it');

  // Blocked storage counts too, even before any change.
  const blocked = new FakeStorage({ [CHARS]: JSON.stringify([a]) });
  blocked.failGet = () => new DOMException('denied', 'SecurityError');
  const b = createCharacterStore(blocked);
  b.load();
  assert.ok(b.unsavedCharactersJson());
});

test('unsavedCharactersJson leaves out set-aside entries, so it always imports', () => {
  const a = makeChar('Aldric');
  const ls = new FakeStorage({ [CHARS]: JSON.stringify([a, fromNewerVersion('Future'), legacyChar('Broken')]), [ACTIVE]: a.id });
  const s = createCharacterStore(ls, { migrate: brokenFor('Broken') });
  const { characters } = s.load();
  ls.failSet = (k) => quotaError(k);
  s.saveCharacters([{ ...characters[0], otherNotes: 'unsaved' }]);
  const json = s.unsavedCharactersJson();
  assert.ok(json);
  assert.deepEqual(names(parseImportedCharacters(json, { allowMany: true })), ['Aldric']);
});

test('everything an export writes imports again, even characters only a hand edit could make', () => {
  const odd: Array<Record<string, unknown>> = [
    { ...makeChar('x'), name: 5 },
    { ...makeChar('x'), name: null },
    { ...makeChar('x'), name: { first: 'Odd' } },
    { ...makeChar('Formatted'), format: 'dolmen-spot-recovery-download' },
    { ...makeChar('Error screen'), format: SAVE_DATA_FORMAT },
    { ...makeChar('Old download'), backups: [], notBackedUp: [] },
    JSON.parse(deepChar('Deep but loadable', 99)) as Record<string, unknown>,
    { name: 'Infinite', level: 1, schemaVersion: 'INFINITY' },
  ];
  const ls = new FakeStorage({ [CHARS]: JSON.stringify(odd).replace('"INFINITY"', '1e999') });
  const s = createCharacterStore(ls);
  const { characters } = s.load();
  assert.equal(characters.length, odd.length, 'the store loads every one');
  const expected = ['5', '', '', 'Formatted', 'Error screen', 'Old download', 'Deep but loadable', 'Infinite'];
  // Export All Characters, and each Export Character (or cloud save).
  assert.deepEqual(names(parseImportedCharacters(characterFileJson(characters), { allowMany: true })), expected);
  assert.deepEqual(characters.map((c) => parseImportedCharacter(characterFileJson(c)).name), expected);
  // The copy error screens offer.
  ls.failSet = (k) => quotaError(k);
  s.saveCharacters(characters.map((c) => ({ ...c, otherNotes: 'unsaved' })));
  assert.deepEqual(names(parseImportedCharacters(s.unsavedCharactersJson() ?? '', { allowMany: true })), expected);
});

test('a download covers only the backups it was asked for, and only those can be deleted', () => {
  const clock = new Clock();
  const ls = new FakeStorage({ [CHARS]: 'old{' });
  createCharacterStore(ls, { now: clock.now }).load(); // an earlier visit's backup
  const [earlierKey] = ls.recoveryKeys();
  clock.advance(1000);
  ls.map.set(CHARS, 'new{');
  const s = createCharacterStore(ls, { now: clock.now });
  s.load();
  const thisVisit = s.getStatus().backups.filter((b) => b.createdThisSession).map((b) => b.key);
  assert.equal(thisVisit.length, 1);
  const rawOf = (file: DownloadFile) => file.backups.map((b) => asWhole((b as RecoveryRecord).entries[0]).raw);

  const notice = JSON.parse(s.recoveryDownload({ backupKeys: thisVisit, notBackedUp: true })) as DownloadFile;
  assert.deepEqual(rawOf(notice), ['new{']);
  assert.deepEqual(s.getStatus().downloaded?.backupKeys, thisVisit);
  assert.deepEqual(s.deleteBackups([earlierKey, ...thisVisit]), { deleted: thisVisit, kept: [earlierKey] });

  const calm = JSON.parse(s.recoveryDownload({ backupKeys: [earlierKey], notBackedUp: false })) as DownloadFile;
  assert.deepEqual(rawOf(calm), ['old{']);
  assert.deepEqual(calm.notBackedUp, []);
});
