// Tests for the NPC tracker (npcs.ts): the order NPCs are listed in, the
// search, the quest checklist, an NPC's hex, and the journal entries that are
// their notes. Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCharacter } from './gamedata';
import { createJournalEntry, parseJournalQuery, sortJournalNewestFirst, withoutEntry } from './journal';
import { describeEntryNpcs, entryNpcNames } from './npc-names';
import { enterFairy } from './livedTime';
import { CURRENT_SCHEMA_VERSION, migrateCharacter } from './migrations';
import {
  addNpc,
  addQuest,
  changeNpc,
  countQuests,
  createNpc,
  createNpcNote,
  deleteNpc,
  deleteQuest,
  describeNpcList,
  describeQuestCount,
  getNpcHex,
  getNpcQuests,
  getNpcs,
  listNpcs,
  matchesNpcSearch,
  npcLabel,
  npcSearchText,
  npcText,
  notesByNpc,
  setQuestDone,
  sortNpcs,
  withNpcHex,
} from './npcs';
import type { CalendarDate, Character, JournalEntry, Npc } from './types';

const date = (day: number, month: number, year: number): CalendarDate => ({ day, month, year });

function character(extra: Partial<Character> = {}): Character {
  return { ...createDefaultCharacter(), ...extra };
}

function npc(fields: Partial<Npc> = {}): Npc {
  return {
    id: 'n1',
    name: 'Sister Ysolde',
    affiliation: 'The Church of Lankshorn',
    location: 'Lankshorn',
    hex: '1106',
    goals: 'Find the lost reliquary.',
    quests: [],
    ...fields,
  };
}

/** An entry about these NPCs, on this date. */
function note(c: Character, ids: string[], text: string, on: CalendarDate = c.currentDate): JournalEntry {
  return { ...createJournalEntry({ ...c, currentDate: on }), text, npcIds: ids };
}

/** An NPC's notes, as the tab groups them (notesByNpc). */
const notesOf = (c: Character, id: string) => notesByNpc(c).get(id) ?? [];

/** `c` with an entry added at the end, as the journal's Add Entry does. */
function write(c: Character, entry: JournalEntry): Character {
  return { ...c, journalEntries: [...c.journalEntries, entry] };
}

// ── Reading the saved list ───────────────────────────────────────────

describe('the saved list', () => {
  test('a character with no NPCs lists none', () => {
    assert.deepEqual(getNpcs(character()), []);
  });

  test('a saved value that is not a list lists none, rather than throwing', () => {
    assert.deepEqual(getNpcs(character({ npcs: undefined as unknown as Npc[] })), []);
    assert.deepEqual(getNpcs(character({ npcs: 'Ysolde' as unknown as Npc[] })), []);
  });

  test('an NPC whose quests or hex are not what they should be reads as having none', () => {
    assert.deepEqual(getNpcQuests(npc({ quests: undefined as unknown as Npc['quests'] })), []);
    assert.equal(getNpcHex(npc({ hex: undefined })), '');
    assert.equal(getNpcHex(npc({ hex: '9999' })), '', 'a hex that is not on the map');
    assert.equal(getNpcHex(npc({ hex: '1106' })), '1106');
  });

  test('a field that held something other than text reads as text, or as nothing', () => {
    assert.equal(npcText('Lankshorn'), 'Lankshorn');
    assert.equal(npcText(12), '12');
    assert.equal(npcText(undefined), '');
    assert.equal(npcText({ place: 'Lankshorn' }), '');
  });

  test('an NPC with no name is named as one in a sentence', () => {
    assert.equal(npcLabel(npc()), 'Sister Ysolde');
    assert.equal(npcLabel(npc({ name: '   ' })), 'Unnamed NPC');
  });
});

// ── Order ────────────────────────────────────────────────────────────

describe('the order NPCs are listed in', () => {
  const names = (npcs: Npc[]) => sortNpcs(npcs).map((n) => n.name);

  test('by name, whatever the case', () => {
    const npcs = [npc({ id: 'a', name: 'ysolde' }), npc({ id: 'b', name: 'Brindle' }), npc({ id: 'c', name: 'Alder' })];
    assert.deepEqual(names(npcs), ['Alder', 'Brindle', 'ysolde']);
  });

  test('by name folded, so an accented name sorts with its letter', () => {
    const npcs = [npc({ id: 'a', name: 'Zoe' }), npc({ id: 'b', name: 'Élora' }), npc({ id: 'c', name: 'Everard' })];
    assert.deepEqual(names(npcs), ['Élora', 'Everard', 'Zoe']);
  });

  test('two with the same name by affiliation, then by the order they were added', () => {
    const npcs = [
      npc({ id: 'a', name: 'The Miller', affiliation: 'Prigwort' }),
      npc({ id: 'b', name: 'The Miller', affiliation: 'Lankshorn' }),
      npc({ id: 'c', name: 'The Miller', affiliation: 'Lankshorn' }),
    ];
    assert.deepEqual(sortNpcs(npcs).map((n) => n.id), ['b', 'c', 'a']);
  });

  test('an NPC with no name yet goes last, where it is being filled in', () => {
    const npcs = [npc({ id: 'a', name: '' }), npc({ id: 'b', name: 'Zoe' }), npc({ id: 'c', name: 'Alder' })];
    assert.deepEqual(sortNpcs(npcs).map((n) => n.id), ['c', 'b', 'a']);
  });

  test('sorting leaves the saved list as it was', () => {
    const npcs = [npc({ id: 'b', name: 'Zoe' }), npc({ id: 'a', name: 'Alder' })];
    sortNpcs(npcs);
    assert.deepEqual(npcs.map((n) => n.id), ['b', 'a']);
  });
});

// ── Search ───────────────────────────────────────────────────────────

describe('search', () => {
  const matches = (n: Npc, query: string, notes: JournalEntry[] = []) =>
    matchesNpcSearch(n, parseJournalQuery(query), notes);

  test('finds an NPC by their name, whatever the case', () => {
    assert.ok(matches(npc(), 'ysolde'));
    assert.ok(matches(npc(), 'YSOLDE'));
    assert.ok(!matches(npc(), 'brindle'));
  });

  test('finds them by their affiliation, where they are, their goals, a quest or their hex', () => {
    const n = npc({ quests: [{ id: 'q1', text: 'Bring holy water to the barrow', done: false }] });
    for (const query of ['church', 'lankshorn', 'reliquary', 'barrow', '1106', 'hex 1106']) {
      assert.ok(matches(n, query), `“${query}” finds them`);
    }
  });

  test('every word has to be there, in any part and any order', () => {
    assert.ok(matches(npc(), 'ysolde reliquary'));
    assert.ok(!matches(npc(), 'ysolde brindle'));
  });

  test('a phrase in quotes has to be there whole', () => {
    assert.ok(matches(npc(), '"lost reliquary"'));
    assert.ok(!matches(npc(), '"reliquary lost"'));
  });

  test('accents and case are folded, as the journal folds them', () => {
    assert.ok(matches(npc({ name: 'Élora' }), 'elora'));
    assert.ok(matches(npc({ name: 'Élora' }), 'ÉLORA'));
  });

  test('a number is matched whole: 1106 is not found by 1, nor by 06', () => {
    assert.ok(!matches(npc(), '1'));
    assert.ok(!matches(npc(), '06'));
  });

  test('the text searched is what the tab shows', () => {
    const text = npcSearchText(npc({ quests: [{ id: 'q1', text: 'Find the bell', done: false }] }));
    for (const part of ['Sister Ysolde', 'The Church of Lankshorn', 'Lankshorn', 'Hex 1106', 'Find the lost reliquary.', 'Find the bell']) {
      assert.ok(text.includes(part), `“${part}” is searched`);
    }
  });

  test('finds them by what was written about them: the notes their card shows', () => {
    const c = character();
    const withNote = write(c, note(c, ['n1'], 'She asked after the bell of St Clewd.'));
    const about = notesOf(withNote, 'n1');
    assert.ok(matches(npc(), 'clewd', about));
    assert.ok(matches(npc(), '"bell of St Clewd"', about), 'with the Journal’s phrases');
    assert.ok(!matches(npc(), 'clewd'), 'and not without the note');
  });

  test('a note finds the NPC it is about, and not one whose card it is not on', () => {
    const c = character({ npcs: [npc({ id: 'a' }), npc({ id: 'b', name: 'Old Mother Brindle' })] });
    const withNotes = write(c, note(c, ['a'], 'She asked after the bell of St Clewd.'));
    const notes = notesByNpc(withNotes);
    const list = listNpcs(withNotes.npcs, parseJournalQuery('clewd'), new Set(), notes);
    assert.deepEqual(list.items.map((n) => n.id), ['a']);
    assert.deepEqual({ matching: list.matching, total: list.total }, { matching: 1, total: 2 });
  });

  test('no search lists every NPC, in order', () => {
    const list = listNpcs([npc({ id: 'b', name: 'Zoe' }), npc({ id: 'a', name: 'Alder' })], []);
    assert.deepEqual(list.items.map((n) => n.id), ['a', 'b']);
    assert.deepEqual({ matching: list.matching, total: list.total }, { matching: 2, total: 2 });
  });

  test('a search lists those that match, and counts the rest', () => {
    const npcs = [npc({ id: 'a', name: 'Alder' }), npc({ id: 'b', name: 'Zoe' }), npc({ id: 'c', name: 'Zoe the Younger' })];
    const list = listNpcs(npcs, parseJournalQuery('zoe'));
    assert.deepEqual(list.items.map((n) => n.id), ['b', 'c']);
    assert.deepEqual({ matching: list.matching, total: list.total }, { matching: 2, total: 3 });
  });

  test('an NPC being edited stays listed when the search changes', () => {
    const npcs = [npc({ id: 'a', name: 'Alder' }), npc({ id: 'b', name: 'Zoe' })];
    const list = listNpcs(npcs, parseJournalQuery('alder'), new Set(['b']));
    assert.deepEqual(list.items.map((n) => n.id), ['a', 'b'], 'in order, not moved to the end');
    assert.equal(list.matching, 1);
  });
});

describe('the list in a line', () => {
  test('says how many there are, and how many match a search', () => {
    assert.equal(describeNpcList({ matching: 0, total: 0 }, ''), 'No NPCs yet.');
    assert.equal(describeNpcList({ matching: 1, total: 1 }, ''), '1 NPC');
    assert.equal(describeNpcList({ matching: 3, total: 3 }, ''), '3 NPCs');
    assert.equal(describeNpcList({ matching: 1, total: 3 }, 'ysolde'), '1 of 3 NPCs match “ysolde”');
    assert.equal(describeNpcList({ matching: 0, total: 3 }, ' "a b" '), '0 of 3 NPCs match "a b"');
  });
});

// ── Adding, changing and deleting ────────────────────────────────────

describe('adding, changing and deleting an NPC', () => {
  test('a new NPC is empty, with an id of its own and no quests', () => {
    const a = createNpc();
    const b = createNpc();
    assert.notEqual(a.id, b.id);
    assert.notEqual(a.id, '');
    assert.deepEqual(a, { id: a.id, name: '', affiliation: '', location: '', goals: '', quests: [] });
  });

  test('a new one is added at the end', () => {
    const saved = [npc({ id: 'a' })];
    const added = addNpc(saved, npc({ id: 'b' }));
    assert.deepEqual(added.map((n) => n.id), ['a', 'b']);
    assert.deepEqual(saved.map((n) => n.id), ['a'], 'the saved list is not changed in place');
  });

  test('changing one leaves the others alone', () => {
    const saved = [npc({ id: 'a', goals: 'One' }), npc({ id: 'b', goals: 'Two' })];
    const changed = changeNpc(saved, 'b', (n) => ({ ...n, goals: 'Changed' }));
    assert.deepEqual(changed.map((n) => n.goals), ['One', 'Changed']);
    assert.equal(saved[1].goals, 'Two');
  });

  test('changing an id that is gone changes nothing', () => {
    const saved = [npc({ id: 'a' })];
    assert.deepEqual(changeNpc(saved, 'gone', (n) => ({ ...n, name: 'Nobody' })), saved);
  });

  test('deleting one leaves their notes in the journal', () => {
    const c = character({ npcs: [npc({ id: 'a' }), npc({ id: 'b', name: 'Brindle' })] });
    const withNote = write(c, note(c, ['a'], 'Asked about the reliquary.'));
    const left = { ...withNote, npcs: deleteNpc(getNpcs(withNote), 'a') };
    assert.deepEqual(left.npcs.map((n) => n.id), ['b']);
    assert.deepEqual(left.journalEntries.map((e) => e.text), ['Asked about the reliquary.']);
    assert.deepEqual(left.journalEntries[0].npcIds, ['a'], 'the note still names them');
  });
});

// ── A hex ────────────────────────────────────────────────────────────

describe('an NPC’s hex', () => {
  test('is set when the player types one', () => {
    assert.equal(withNpcHex(npc({ hex: undefined }), '0606').hex, '0606');
  });

  test('is left off the NPC, not saved as an empty string, when it is cleared', () => {
    const cleared = withNpcHex(npc(), '');
    assert.equal(cleared.hex, undefined);
    assert.ok(!Object.hasOwn(cleared, 'hex'), 'the field is gone, as the load repair leaves it');
  });

  test('clearing it keeps everything else about the NPC', () => {
    const { hex: _hex, ...expected } = npc();
    assert.deepEqual(withNpcHex(npc(), ''), expected);
  });
});

// ── Quests ───────────────────────────────────────────────────────────

describe('the quest checklist', () => {
  test('a new quest is not done yet, and has an id of its own', () => {
    const a = addQuest(npc(), 'Find the bell');
    const b = addQuest(a, 'Return it');
    assert.deepEqual(getNpcQuests(a).map((q) => ({ text: q.text, done: q.done })), [{ text: 'Find the bell', done: false }]);
    const ids = getNpcQuests(b).map((q) => q.id);
    assert.equal(ids.length, 2);
    assert.notEqual(ids[0], ids[1]);
    assert.ok(ids.every((id) => id !== ''));
  });

  test('a quest with nothing but spaces in it is not added', () => {
    const before = npc();
    assert.equal(addQuest(before, '   '), before);
    assert.deepEqual(getNpcQuests(addQuest(before, '')).length, 0);
  });

  test('a quest is added with its text trimmed', () => {
    assert.deepEqual(getNpcQuests(addQuest(npc(), '  Find the bell  ')).map((q) => q.text), ['Find the bell']);
  });

  test('a quest is ticked done, and unticked again, without touching the others', () => {
    let n = addQuest(addQuest(npc(), 'One'), 'Two');
    const [first, second] = getNpcQuests(n);
    n = setQuestDone(n, second.id, true);
    assert.deepEqual(getNpcQuests(n).map((q) => [q.text, q.done]), [['One', false], ['Two', true]]);
    n = setQuestDone(n, second.id, false);
    assert.deepEqual(getNpcQuests(n).map((q) => q.done), [false, false]);
    assert.deepEqual(getNpcQuests(n).map((q) => q.id), [first.id, second.id]);
  });

  test('a quest is deleted, the rest keeping their places', () => {
    let n = addQuest(addQuest(npc(), 'One'), 'Two');
    const [first, second] = getNpcQuests(n);
    n = deleteQuest(n, first.id);
    assert.deepEqual(getNpcQuests(n).map((q) => q.id), [second.id]);
  });

  test('the count is how many are done out of how many there are', () => {
    let n = npc();
    assert.deepEqual(countQuests(n), { done: 0, total: 0 });
    assert.equal(describeQuestCount(n), 'No quests yet');
    n = addQuest(n, 'One');
    assert.equal(describeQuestCount(n), '0 of 1 quest done');
    n = setQuestDone(n, getNpcQuests(n)[0].id, true);
    assert.equal(describeQuestCount(n), '1 of 1 quest done');
    n = addQuest(addQuest(n, 'Two'), 'Three');
    n = setQuestDone(n, getNpcQuests(n)[1].id, true);
    assert.deepEqual(countQuests(n), { done: 2, total: 3 });
    assert.equal(describeQuestCount(n), '2 of 3 quests done');
  });

  test('a quest whose done is not true counts as not done', () => {
    const n = npc({ quests: [{ id: 'q1', text: 'One', done: 'yes' as unknown as boolean }] });
    assert.deepEqual(countQuests(n), { done: 0, total: 1 });
  });
});

// ── Notes ────────────────────────────────────────────────────────────

describe('notes, which are journal entries', () => {
  test('a note is dated today, where the character is, and names the NPC', () => {
    const c = character({ currentDate: date(4, 2, 3), currentLocation: 'Lankshorn', currentLocationHex: '1106' });
    const entry = createNpcNote(c, 'n1', 'Asked about the reliquary.');
    assert.deepEqual(entry.date, date(4, 2, 3));
    assert.equal(entry.location, 'Lankshorn');
    assert.equal(entry.hex, '1106');
    assert.equal(entry.text, 'Asked about the reliquary.');
    assert.deepEqual(entry.npcIds, ['n1']);
    assert.ok(entry.id !== '');
  });

  test('a note written in Fairy is dated by the Fairy day, as any entry is', () => {
    const entered = { ...character(), fairyVisits: [] };
    const c = { ...entered, ...enterFairy(entered)! };
    const inFairy = { ...c, ...{ fairyVisits: c.fairyVisits.map((v) => ({ ...v, daysInFairy: 3 })) } };
    const entry = createNpcNote(inFairy, 'n1', 'The Queen’s librarian was there.');
    assert.equal(entry.fairyDate?.visitId, inFairy.fairyVisits[0].id);
    assert.equal(entry.fairyDate?.day, 4);
    assert.equal(entry.hex, undefined, 'an entry written in Fairy has no hex');
  });

  test('only the entries that name an NPC are their notes', () => {
    const c = character();
    const withNotes = [note(c, ['n1'], 'About Ysolde.'), { ...createJournalEntry(c), text: 'No one in particular.' }, note(c, ['n2'], 'About Brindle.')]
      .reduce(write, c);
    assert.deepEqual(notesOf(withNotes, 'n1').map((e) => e.text), ['About Ysolde.']);
    assert.deepEqual(notesOf(withNotes, 'n2').map((e) => e.text), ['About Brindle.']);
    assert.deepEqual(notesOf(withNotes, 'n3'), []);
  });

  test('an entry about two NPCs is one of each one’s notes', () => {
    const c = character();
    const withNote = write(c, note(c, ['n1', 'n2'], 'Both of them argued.'));
    assert.equal(notesOf(withNote, 'n1').length, 1);
    assert.equal(notesOf(withNote, 'n2').length, 1);
  });

  test('newest first, as the character lived them, not as the dates run', () => {
    const c = character({ currentDate: date(1, 0, 1) });
    let withNotes = write(c, note(c, ['n1'], 'First', date(1, 0, 1)));
    withNotes = write(withNotes, note(c, ['n1'], 'Second', date(10, 0, 1)));
    withNotes = write(withNotes, note(c, ['n1'], 'Third', date(5, 0, 1)));
    assert.deepEqual(notesOf(withNotes, 'n1').map((e) => e.text), ['Second', 'Third', 'First']);
    assert.deepEqual(
      notesOf(withNotes, 'n1').map((e) => e.id),
      sortJournalNewestFirst(withNotes.journalEntries, withNotes).map((e) => e.id),
      'the journal’s own order',
    );
  });

  test('a note written after a Fairy visit comes before one written before it', () => {
    let c = character({ currentDate: date(1, 0, 1) });
    c = write(c, note(c, ['n1'], 'Before Fairy', date(1, 0, 1)));
    c = { ...c, ...enterFairy(c)! };
    c = { ...c, ...{ fairyVisits: c.fairyVisits.map((v) => ({ ...v, daysInFairy: 5 })) } };
    // Home again, three Dolmenwood days later, on a date that has gone backwards.
    c = { ...c, fairyVisits: c.fairyVisits.map((v) => ({ ...v, returnedOn: date(2, 0, 1) })) };
    c = write(c, { ...note(c, ['n1'], 'After Fairy', date(2, 0, 1)), sinceReturnFrom: c.fairyVisits[0].id });
    assert.deepEqual(notesOf(c, 'n1').map((e) => e.text), ['After Fairy', 'Before Fairy']);
  });

  test('every NPC’s notes are grouped by the NPC, in one pass', () => {
    const c = character();
    const withNotes = [note(c, ['n1'], 'One'), note(c, ['n1'], 'Two'), note(c, ['n2'], 'Three')].reduce(write, c);
    const grouped = notesByNpc(withNotes);
    assert.deepEqual([...grouped.keys()].sort(), ['n1', 'n2']);
    assert.deepEqual(grouped.get('n1')?.map((e) => e.text), ['Two', 'One']);
    assert.deepEqual(grouped.get('n2')?.map((e) => e.text), ['Three']);
  });

  test('an entry that names no one is nobody’s note', () => {
    const c = character();
    const withNote = write(c, { ...createJournalEntry(c), text: 'A day of walking.' });
    assert.equal(notesByNpc(withNote).size, 0);
  });

  test('deleting a note is the one delete: the entry is gone from the journal too', () => {
    const c = character();
    const withNotes = [note(c, ['n1'], 'One'), note(c, ['n1'], 'Two')].reduce(write, c);
    const [newest, oldest] = notesOf(withNotes, 'n1');
    const left = withoutEntry(withNotes.journalEntries, newest.id);
    assert.deepEqual(left.map((e) => e.id), [oldest.id]);
    assert.deepEqual(notesOf({ ...withNotes, journalEntries: left }, 'n1').map((e) => e.text), ['One']);
  });
});

// ── Who an entry is about (the Journal shows it) ──────────────────────

describe('the NPCs an entry is about', () => {
  const npcs: Npc[] = [npc({ id: 'n1' }), npc({ id: 'n2', name: 'Old Mother Brindle' })];

  test('are named in the order the entry names them', () => {
    const c = character();
    const entry = note(c, ['n2', 'n1'], 'Both of them argued.');
    assert.deepEqual(entryNpcNames(entry, npcs), ['Old Mother Brindle', 'Sister Ysolde']);
    assert.equal(describeEntryNpcs(entry, npcs), 'Old Mother Brindle, Sister Ysolde');
  });

  test('an NPC with no name yet is named as one in a sentence', () => {
    const c = character();
    assert.equal(describeEntryNpcs(note(c, ['n1'], 'Someone.'), [npc({ id: 'n1', name: '' })]), 'Unnamed NPC');
  });

  test('is no one when the entry names no one', () => {
    const c = character();
    const plain = { ...createJournalEntry(c), text: 'A day of walking.' };
    assert.deepEqual(entryNpcNames(plain, npcs), []);
    assert.equal(describeEntryNpcs(plain, npcs), '');
  });

  test('leaves out an NPC who is gone: the entry still names them, but names no one', () => {
    const c = character();
    const entry = note(c, ['gone'], 'About someone who has since been deleted.');
    assert.deepEqual(entryNpcNames(entry, npcs), []);
    assert.equal(describeEntryNpcs(entry, npcs), '');
  });

  test('names an NPC once, however many times the entry names them', () => {
    const c = character();
    assert.deepEqual(entryNpcNames(note(c, ['n1', 'n1'], 'Again.'), npcs), ['Sister Ysolde']);
  });
});

// ── What is written loads back unchanged ─────────────────────────────

describe('saved data', () => {
  /** A character with an NPC and a note about them, as the tab saves them. */
  function saved(): Character {
    const c = character({ currentDate: date(7, 3, 2), currentLocation: 'Lankshorn', currentLocationHex: '1106' });
    const withNpc: Character = {
      ...c,
      npcs: addNpc(getNpcs(c), withNpcHex(addQuest(addQuest(createNpc(), 'Find the bell'), 'Return it'), '0606')),
    };
    const target = getNpcs(withNpc)[0];
    const edited: Character = {
      ...withNpc,
      npcs: changeNpc(withNpc.npcs, target.id, (n) => ({ ...n, name: 'Brother Fenwick', affiliation: 'Pluritine Church' })),
    };
    const done = getNpcQuests(getNpcs(edited)[0])[0];
    const ticked: Character = {
      ...edited,
      npcs: changeNpc(edited.npcs, target.id, (n) => setQuestDone(n, done.id, true)),
    };
    return write(ticked, createNpcNote(ticked, target.id, 'He wants the bell of St Clewd.'));
  }

  test('the tab writes an NPC and a note the load repair accepts unchanged', () => {
    const c = saved();
    const loaded = migrateCharacter(JSON.parse(JSON.stringify({ ...c, schemaVersion: CURRENT_SCHEMA_VERSION })));
    // Deep equality, not a string comparison: the load repair writes an NPC's
    // fields in its own order, which no one reads.
    assert.deepEqual(loaded, { ...c, schemaVersion: CURRENT_SCHEMA_VERSION });
    assert.equal(loaded.npcs[0].hex, '0606');
    assert.equal(loaded.npcs[0].quests.length, 2);
    assert.equal(loaded.npcs[0].quests[0].done, true);
    assert.deepEqual(loaded.journalEntries[0].npcIds, [loaded.npcs[0].id]);
    assert.deepEqual(notesOf(loaded, loaded.npcs[0].id).map((e) => e.text), ['He wants the bell of St Clewd.']);
  });

  test('clearing an NPC’s hex loads back with no hex, not an empty one', () => {
    const c = { ...character({ npcs: [npc()] }) };
    const cleared = { ...c, npcs: changeNpc(c.npcs, 'n1', (n) => withNpcHex(n, '')) };
    const loaded = migrateCharacter(JSON.parse(JSON.stringify({ ...cleared, schemaVersion: CURRENT_SCHEMA_VERSION })));
    assert.ok(!Object.hasOwn(loaded.npcs[0], 'hex'));
    assert.deepEqual(loaded, { ...cleared, schemaVersion: CURRENT_SCHEMA_VERSION });
  });
});
