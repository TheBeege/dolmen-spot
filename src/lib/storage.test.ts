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
  IMPORT_MESSAGES,
  ImportError,
  RECOVERY_KEY_PREFIX as PREFIX,
  changesNotSaved,
  createCharacterStore,
  createNewAdventurer,
  isSavingPaused,
  parseImportedCharacter,
  parseImportedCharacters,
  type RecoveryEntry,
  type RecoveryRecord,
  type StorageLike,
} from './storage';
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
  assert.deepEqual(names(characters), ['Aldric', 'Quirk'], 'a string schemaVersion still loads as before');
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
  assert.doesNotThrow(() => parseImportedCharacter('{"name":"Quirk","schemaVersion":"12"}'), 'a string schemaVersion keeps its old handling');
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

test('an entry nested too deeply to save again makes the whole value unreadable: backed up exactly, nothing throws', () => {
  let deep = '0';
  for (let i = 0; i < 12_000; i++) deep = `[${deep}]`;
  const good = makeChar('Aldric');
  const raw = `[${JSON.stringify(good)},{"name":"Deep","level":1,"x":${deep}}]`;
  const ls = new FakeStorage({ [CHARS]: raw, [ACTIVE]: good.id });
  const s = createCharacterStore(ls);
  const loaded = s.load();
  assert.equal(s.getStatus().storageUnreadable, false, 'not mistaken for blocked storage');
  assert.equal(asWhole(ls.records()[0].entries[0]).raw, raw, 'backed up exactly');
  assert.deepEqual(names(loaded.characters), ['New Adventurer']);
  assert.equal(ls.getItem(CHARS), JSON.stringify(loaded.characters));
  assert.doesNotThrow(() => s.saveCharacters([{ ...loaded.characters[0], name: 'After' }]));
  assert.doesNotThrow(() => s.recoveryDownload());
  assert.deepEqual(stored(ls).map((c) => c.name), ['After']);
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
