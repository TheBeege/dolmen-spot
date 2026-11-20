// Tests for the journal (journal.ts): the order entries are listed in, the
// hex they're stamped with, the hex filter and search. Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCharacter } from './gamedata';
import { editReturnDate, enterFairy, returnFromFairy, setDaysInFairy } from './livedTime';
import {
  countEntriesByHex,
  createJournalEntry,
  describeJournalList,
  findMatchRanges,
  foldForSearch,
  getEntryDisplayText,
  getEntryMatches,
  getEntryPlace,
  hexFilterOptions,
  highlightSegments,
  listJournal,
  matchExcerpts,
  matchesHexFilter,
  matchesSearch,
  parseJournalQuery,
  sortJournalNewestFirst,
  toJournalHexFilter,
  withEntryHex,
  type TextRange,
} from './journal';
import type { CalendarDate, Character, CharacterMapData, JournalEntry } from './types';

const date = (day: number, month: number, year: number): CalendarDate => ({ day, month, year });

function character(extra: Partial<Character> = {}): Character {
  return { ...createDefaultCharacter(), ...extra };
}

/** `c` after a change made with one of livedTime's functions, which must apply. */
function apply(c: Character, patch: Partial<Character> | null): Character {
  assert.ok(patch, 'the change applies');
  return { ...c, ...patch };
}

/** `c` with a new entry, as the Journal tab's Add Entry makes it (then typed in). */
function write(c: Character, text: string): Character {
  return { ...c, journalEntries: [...c.journalEntries, { ...createJournalEntry(c), text }] };
}

const on = (c: Character, currentDate: CalendarDate): Character => ({ ...c, currentDate });

// The entries as listed: their text, or [entered] / [returned] for the ones
// the app writes on entering and leaving Fairy.
const label = (e: JournalEntry) => (e.fairyEvent ? `[${e.fairyEvent.kind}]` : e.text);
const listed = (c: Character) => sortJournalNewestFirst(c.journalEntries, c).map(label);
const last = (c: Character) => c.journalEntries[c.journalEntries.length - 1];

/** An entry as saved before Fairy time was tracked: a date, no Fairy references. */
const oldEntry = (text: string, dated: CalendarDate, extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id: `old-${text}`,
  date: dated,
  location: '',
  text,
  ...extra,
});

describe('order: newest first, as the character lived them', () => {
  test('without Fairy time, by date; a calendar moved back puts entries by their dates', () => {
    let c = character({ currentDate: date(5, 0, 1) });
    c = write(c, '5 Grimvold, first');
    c = write(c, '5 Grimvold, second');
    c = write(on(c, date(9, 0, 1)), '9 Grimvold');
    c = write(on(c, date(7, 0, 1)), '7 Grimvold, after moving the calendar back');
    c = write(on(c, date(1, 1, 1)), '1 Lymewald');
    assert.deepEqual(listed(c), [
      '1 Lymewald',
      '9 Grimvold',
      '7 Grimvold, after moving the calendar back',
      '5 Grimvold, second',
      '5 Grimvold, first',
    ]);
  });

  test('entries on the same day: the newest written first', () => {
    let c = character({ currentDate: date(12, 3, 2) });
    for (const text of ['a', 'b', 'c', 'd']) c = write(c, text);
    assert.deepEqual(listed(c), ['d', 'c', 'b', 'a']);
  });

  test('the saved list keeps its order', () => {
    let c = character({ currentDate: date(9, 0, 1) });
    c = write(c, 'later');
    c = write(on(c, date(2, 0, 1)), 'earlier');
    const saved = c.journalEntries.map(label);
    sortJournalNewestFirst(c.journalEntries, c);
    assert.deepEqual(c.journalEntries.map(label), saved);
  });

  // 10 Grimvold, Year 1: an entry, then into Fairy; an entry on Fairy day 1
  // and day 3; back in Dolmenwood two years later, on 10 Grimvold, Year 3;
  // an entry that day and the next.
  function fairyTrip(): Character {
    let c = character({ currentDate: date(10, 0, 1) });
    c = write(c, 'before');
    c = apply(c, enterFairy(c));
    c = write(c, 'Fairy day 1');
    c = apply(c, setDaysInFairy(c, 2));
    c = write(c, 'Fairy day 3');
    c = apply(c, returnFromFairy(c, date(10, 0, 3)));
    c = write(c, 'back, same day');
    return write(on(c, date(11, 0, 3)), 'back, next day');
  }

  test('a Fairy visit: before, entering, the days in Fairy in order, the return, then after it', () => {
    assert.deepEqual(listed(fairyTrip()), [
      'back, next day',
      'back, same day',
      '[returned]',
      'Fairy day 3',
      'Fairy day 1',
      '[entered]',
      'before',
    ]);
  });

  test('each entry is placed in its part of the timeline, on the day the character lived it', () => {
    const c = fairyTrip();
    const places = Object.fromEntries(c.journalEntries.map((e) => [label(e), getEntryPlace(e, c)]));
    // Part 0 is Dolmenwood before the visit, 1 the visit, 2 Dolmenwood after
    // it. 9 days were lived before 10 Grimvold, Year 1, then 2 in Fairy; the
    // two years that passed in Dolmenwood meanwhile weren't lived.
    assert.deepEqual(places, {
      before: { part: 0, livedDay: 9, step: 0 },
      '[entered]': { part: 1, livedDay: 9, step: 0 },
      'Fairy day 1': { part: 1, livedDay: 9, step: 1 },
      'Fairy day 3': { part: 1, livedDay: 11, step: 1 },
      '[returned]': { part: 1, livedDay: 11, step: 2 },
      'back, same day': { part: 2, livedDay: 11, step: 0 },
      'back, next day': { part: 2, livedDay: 12, step: 0 },
    });
  });

  test('a return on the day they entered (no time passed in Dolmenwood) still lists after the Fairy days', () => {
    let c = character({ currentDate: date(3, 2, 1) });
    c = write(c, 'before');
    c = apply(c, enterFairy(c));
    c = apply(c, setDaysInFairy(c, 3));
    c = write(c, 'Fairy day 4');
    c = apply(c, returnFromFairy(c, date(3, 2, 1)));
    c = write(c, 'back');
    // Every entry is dated 3 Haggryme, Year 1.
    assert.ok(c.journalEntries.every((e) => e.date.day === 3 && e.date.month === 2 && e.date.year === 1));
    assert.deepEqual(listed(c), ['back', '[returned]', 'Fairy day 4', '[entered]', 'before']);
  });

  test('editing the return date, later or back to the day they entered, keeps the order', () => {
    const c = fairyTrip();
    const before = listed(c);
    const later = apply(c, editReturnDate(c, date(1, 5, 4)));
    assert.deepEqual(listed(later), before);
    const backDate = later.journalEntries.find((e) => e.text === 'back, next day')!.date;
    assert.deepEqual(backDate, date(2, 5, 4), 'entries since the return moved with it');
    const sameDay = apply(later, editReturnDate(later, date(10, 0, 1)));
    assert.deepEqual(listed(sameDay), before);
    assert.deepEqual(sameDay.journalEntries.find((e) => e.fairyEvent?.kind === 'returned')!.date, date(10, 0, 1));
  });

  test('two visits, each with its own days, in the order lived', () => {
    let c = fairyTrip();
    c = apply(c, enterFairy(c));
    c = apply(c, setDaysInFairy(c, 6));
    c = write(c, 'second visit, day 7');
    c = apply(c, returnFromFairy(c, date(11, 0, 3)));
    assert.deepEqual(listed(c).slice(0, 4), ['[returned]', 'second visit, day 7', '[entered]', 'back, next day']);
  });

  test('days taken back after writing: an entry on a day never reached counts as the latest day', () => {
    let c = character({ currentDate: date(1, 0, 1) });
    c = apply(c, enterFairy(c));
    c = apply(c, setDaysInFairy(c, 4));
    c = write(c, 'written on day 5');
    c = apply(c, setDaysInFairy(c, 1));
    c = write(c, 'written on day 2');
    assert.deepEqual(listed(c), ['written on day 2', 'written on day 5', '[entered]']);
    c = apply(c, returnFromFairy(c, date(1, 1, 1)));
    c = write(c, 'back');
    // Nothing written in Fairy is listed after the return.
    assert.deepEqual(listed(c), ['back', '[returned]', 'written on day 2', 'written on day 5', '[entered]']);
  });

  test('the calendar moved back, then into Fairy: what was written before entering stays before it', () => {
    let c = character({ currentDate: date(10, 0, 1) });
    c = write(c, 'A, 10 Grimvold');
    c = write(on(c, date(20, 0, 1)), 'B, 20 Grimvold (the calendar went too far)');
    c = on(c, date(12, 0, 1)); // it's really 12 Grimvold
    c = apply(c, enterFairy(c));
    c = write(c, 'Fairy day 1');
    c = apply(c, setDaysInFairy(c, 3));
    c = write(c, 'Fairy day 4');
    assert.deepEqual(listed(c), ['Fairy day 4', 'Fairy day 1', '[entered]', 'B, 20 Grimvold (the calendar went too far)', 'A, 10 Grimvold']);
    c = apply(c, returnFromFairy(c, date(10, 1, 1)));
    c = write(c, 'C, back');
    assert.deepEqual(listed(c), [
      'C, back',
      '[returned]',
      'Fairy day 4',
      'Fairy day 1',
      '[entered]',
      'B, 20 Grimvold (the calendar went too far)',
      'A, 10 Grimvold',
    ]);
  });

  test('the order comes from the timeline, wherever entries sit in the saved list', () => {
    const c = fairyTrip();
    const forward = listed(c);
    // An imported journal whose list is in reverse: same-day entries are on
    // both sides of entering and returning, and still go on the right side.
    assert.deepEqual(listed({ ...c, journalEntries: [...c.journalEntries].reverse() }), forward);
    const byText = (t: string) => c.journalEntries.find((e) => label(e) === t)!;
    const shuffled = { ...c, journalEntries: ['Fairy day 3', 'back, same day', 'before', '[returned]', 'Fairy day 1', '[entered]'].map(byText) };
    assert.deepEqual(listed(shuffled), ['back, same day', '[returned]', 'Fairy day 3', 'Fairy day 1', '[entered]', 'before']);
  });

  test("entries the timeline can't place exactly go by their date", () => {
    // A journal from before Fairy time was tracked: dated entries with no
    // Fairy references, two of them in what later became time away and one
    // after the return; and one from a Fairy visit that no longer exists.
    let c = character({
      currentDate: date(10, 0, 1),
      journalEntries: [
        oldEntry('old, 5 Grimvold Y1', date(5, 0, 1)),
        oldEntry('old, 1 Lymewald Y2', date(1, 1, 2)),
        oldEntry('old, 1 Chysting Y2', date(1, 6, 2)),
        oldEntry('old, 1 Lymewald Y3', date(1, 1, 3)),
        oldEntry('lost visit, 20 Grimvold Y1', date(20, 0, 1), { fairyDate: { visitId: 'gone', day: 3 } }),
      ],
    });
    c = apply(c, enterFairy(c));
    c = write(c, 'Fairy day 1');
    c = apply(c, setDaysInFairy(c, 2));
    c = apply(c, returnFromFairy(c, date(10, 0, 3)));
    c = write(c, 'back');
    assert.deepEqual(listed(c), [
      // Dated after the return: Dolmenwood after the visit, by date.
      'old, 1 Lymewald Y3',
      'back',
      '[returned]',
      'Fairy day 1',
      '[entered]',
      // Dated while the character was away: written before entering, so
      // last in the stretch before the visit, by date.
      'old, 1 Chysting Y2',
      'old, 1 Lymewald Y2',
      'lost visit, 20 Grimvold Y1',
      'old, 5 Grimvold Y1',
    ]);
  });
});

describe('the hex an entry is written in', () => {
  const marked: CharacterMapData = {
    pois: [
      { id: 'p1', hex: '1106', name: '  ', notes: '' },
      { id: 'p2', hex: '1106', name: 'Old Mill', notes: '' },
    ],
    fairyDoors: [
      { id: 'd1', hex: '1106', name: 'Door in the Oak', notes: '', destination: { kind: 'wild' } },
      { id: 'd2', hex: '0303', name: 'Door in the Stone', notes: '', destination: { kind: 'wild' } },
    ],
    leyLines: [],
  };

  test("a new entry is stamped with the map's current hex, the location and the date", () => {
    const c = character({ currentDate: date(4, 0, 1), currentLocation: 'Prigwort', currentLocationHex: '1106' });
    const { id, ...entry } = createJournalEntry(c);
    assert.ok(typeof id === 'string' && id.length > 0);
    assert.deepEqual(entry, { date: date(4, 0, 1), location: 'Prigwort', hex: '1106', text: '' });
  });

  test("with no current hex (or one that isn't on the map), the entry has none", () => {
    for (const currentLocationHex of ['', '9999', 'zz']) {
      const entry = createJournalEntry(character({ currentLocationHex }));
      assert.equal('hex' in entry, false, currentLocationHex);
    }
  });

  test('"Entered Fairy" is stamped with the hex the party left from', () => {
    let c = character({ currentLocation: 'The Ring', currentLocationHex: '0606' });
    c = apply(c, enterFairy(c));
    assert.equal(last(c).fairyEvent?.kind, 'entered');
    assert.equal(last(c).hex, '0606');
    assert.equal(last(c).location, 'The Ring');
  });

  test("in Fairy, the map's hex is where the party left from, so an entry written there has none", () => {
    let c = character({ currentLocation: 'The Ring', currentLocationHex: '0606' });
    c = apply(c, enterFairy(c));
    const inFairy = createJournalEntry(c);
    assert.ok(inFairy.fairyDate);
    assert.equal('hex' in inFairy, false);
    assert.equal(inFairy.location, 'The Ring', 'the location typed is kept');
  });

  test('"Returned from Fairy", by default in the map\'s current hex, with the location as typed', () => {
    let c = character({ currentLocation: 'The Ring', currentLocationHex: '0606' });
    c = apply(c, enterFairy(c));
    const patch = returnFromFairy(c, date(5, 0, 1));
    assert.ok(patch);
    assert.equal('currentLocationHex' in patch, false, "the map's current hex doesn't move");
    c = apply(c, patch);
    assert.deepEqual([last(c).fairyEvent?.kind, last(c).hex, last(c).location], ['returned', '0606', 'The Ring']);
    const after = createJournalEntry(c);
    assert.equal(after.hex, '0606');
    assert.ok(after.sinceReturnFrom);
  });

  test("back in another hex: the map's current hex moves there, and the location is the place marked on it", () => {
    let c = character({ currentLocation: 'The Ring', currentLocationHex: '0606', mapData: marked });
    c = apply(c, enterFairy(c));
    c = apply(c, returnFromFairy(c, date(5, 0, 1), '1106'));
    assert.equal(c.currentLocationHex, '1106');
    assert.deepEqual([last(c).hex, last(c).location], ['1106', 'Old Mill'], 'the first named point of interest');
    assert.equal(c.currentLocation, 'The Ring', "the location typed on Adventuring isn't changed");
    assert.equal(createJournalEntry(c).hex, '1106', 'new entries are stamped with the new hex');
  });

  test('back in a hex with only a fairy door marked, or nothing: its name, or no location', () => {
    let c = character({ currentLocation: 'The Ring', currentLocationHex: '0606', mapData: marked });
    c = apply(c, enterFairy(c));
    assert.equal(last(apply(c, returnFromFairy(c, date(5, 0, 1), '0303'))).location, 'Door in the Stone');
    assert.equal(last(apply(c, returnFromFairy(c, date(5, 0, 1), '0707'))).location, '');
  });

  test("back in no hex: the entry has none, and the map's current hex is cleared", () => {
    for (const cameBackIn of ['', '9999']) {
      let c = character({ currentLocation: 'The Ring', currentLocationHex: '0606' });
      c = apply(c, enterFairy(c));
      c = apply(c, returnFromFairy(c, date(5, 0, 1), cameBackIn));
      assert.equal('hex' in last(c), false, cameBackIn);
      assert.equal(last(c).location, '');
      assert.equal(c.currentLocationHex, '');
    }
  });

  test('withEntryHex sets, changes and clears the hex, leaving the rest', () => {
    const e = oldEntry('x', date(1, 0, 1), { location: 'Lankshorn' });
    assert.deepEqual(withEntryHex(e, '0303'), { ...e, hex: '0303' });
    assert.deepEqual(withEntryHex(withEntryHex(e, '0303'), '1001'), { ...e, hex: '1001' });
    assert.deepEqual(withEntryHex(withEntryHex(e, '0303'), ''), e);
    assert.equal('hex' in withEntryHex({ ...e, hex: '0303' }, ''), false);
  });
});

describe('the hex filter', () => {
  const entries = [
    oldEntry('a', date(1, 0, 1), { hex: '0606' }),
    oldEntry('b', date(2, 0, 1)),
    oldEntry('c', date(3, 0, 1), { hex: '0303' }),
    oldEntry('d', date(4, 0, 1), { hex: '0606' }),
    // Only a broken save could hold this; it counts as no hex.
    oldEntry('e', date(5, 0, 1), { hex: '9999' }),
  ];

  test('all entries, the ones with no hex, or the ones in one hex', () => {
    const pick = (filter: string) => entries.filter((e) => matchesHexFilter(e, filter)).map((e) => e.text);
    assert.deepEqual(pick('all'), ['a', 'b', 'c', 'd', 'e']);
    assert.deepEqual(pick('none'), ['b', 'e']);
    assert.deepEqual(pick('0606'), ['a', 'd']);
    assert.deepEqual(pick('1001'), []);
  });

  test('counts per hex, and of entries with none', () => {
    const { byHex, withoutHex } = countEntriesByHex(entries);
    assert.deepEqual([...byHex], [['0606', 2], ['0303', 1]]);
    assert.equal(withoutHex, 2);
  });

  test('its choices: all, no hex, then each hex with entries in hex order, with counts', () => {
    assert.deepEqual(hexFilterOptions(entries, 'all'), [
      { value: 'all', label: 'All hexes (5)' },
      { value: 'none', label: 'No hex (2)' },
      { value: '0303', label: 'Hex 0303 (1)' },
      { value: '0606', label: 'Hex 0606 (2)' },
    ]);
  });

  test('the chosen hex stays a choice after its last entry leaves it', () => {
    assert.deepEqual(hexFilterOptions(entries, '1001').map((o) => o.label), [
      'All hexes (5)',
      'No hex (2)',
      'Hex 0303 (1)',
      'Hex 0606 (2)',
      'Hex 1001 (0)',
    ]);
  });

  test('a select value that is not a choice means all entries', () => {
    assert.equal(toJournalHexFilter('none'), 'none');
    assert.equal(toJournalHexFilter('0606'), '0606');
    for (const value of ['all', '', '9999', '606', 'constructor']) assert.equal(toJournalHexFilter(value), 'all', value);
  });
});

describe('search', () => {
  test('folding ignores case and accents, and treats curly quotes and dashes like straight ones', () => {
    assert.equal(foldForSearch('Café ÉLAN Œuvre Straße Øster Łódź ﬁre'), 'cafe elan oeuvre strasse oster lodz fire');
    assert.equal(foldForSearch('Cafe\u0301'), 'cafe', 'an accent typed as its own character');
    assert.equal(foldForSearch('İstanbul'), 'istanbul');
    assert.equal(foldForSearch('Þorn Guðrún'), 'thorn gudrun');
    assert.equal(foldForSearch('ΟΔΟΣ'), foldForSearch('οδος'), "Greek's final sigma");
    assert.equal(foldForSearch('Hag’s Addle “Mossy” „Low“ ‚x‘'), 'hag\'s addle "mossy" "low" \'x\'');
    assert.equal(foldForSearch('a–b a—b a‑b a−b'), 'a-b a-b a-b a-b');
  });

  test('marks that make letters of their own are kept: か is not が, nor a Devanagari or Thai sign dropped', () => {
    const finds = (text: string, query: string) =>
      matchesSearch(oldEntry('t', date(1, 0, 1), { text }), character(), parseJournalQuery(query));
    assert.ok(!finds('が', 'か'));
    assert.ok(!finds('か\u3099', 'か'), 'written with a separate voicing mark');
    assert.ok(finds('が', 'が') && finds('か\u3099', 'が') && finds('が', 'か\u3099'));
    assert.ok(!finds('パン', 'ハン'));
    assert.ok(!finds('हिंदी', 'हद'));
    assert.ok(!finds('ไก่', 'ไก'));
    assert.ok(finds('ไก่', 'ไก่'));
  });

  test('a search is made of words and quoted phrases, folded, without repeats', () => {
    assert.deepEqual(parseJournalQuery('  Goblin   KING goblin\tcafé '), [['goblin'], ['king'], ['cafe']]);
    assert.deepEqual(parseJournalQuery('"goblin king"'), [['goblin', 'king']]);
    assert.deepEqual(parseJournalQuery('ford “goblin  king,” year'), [['ford'], ['goblin', 'king'], ['year']]);
    assert.deepEqual(parseJournalQuery('"goblin king'), [['goblin', 'king']], 'a quote left open runs to the end');
    assert.deepEqual(parseJournalQuery('"king" king'), [['king']]);
    assert.deepEqual(parseJournalQuery('   '), []);
    assert.deepEqual(parseJournalQuery('\u0301'), [], 'only an accent is no search');
  });

  test("punctuation comes off a word's ends, and stays inside it", () => {
    assert.deepEqual(parseJournalQuery('3 Grimvold, Year 2'), [['3'], ['grimvold'], ['year'], ['2']]);
    assert.deepEqual(parseJournalQuery('(Hayme) king. "x"'), [['hayme'], ['king'], ['x']]);
    assert.deepEqual(parseJournalQuery("Hag's goblin-king 'tis"), [["hag's"], ['goblin-king'], ['tis']]);
    assert.deepEqual(parseJournalQuery('( ) .* -- ""'), [], 'nothing but punctuation is no search');
  });

  test('symbols such as emoji are kept, and found however they are drawn', () => {
    assert.deepEqual(parseJournalQuery('🧙 (⚔) 💰! ©'), [['🧙'], ['⚔'], ['💰'], ['©']]);
    const finds = (text: string, query: string) =>
      matchesSearch(oldEntry('t', date(1, 0, 1), { text }), character(), parseJournalQuery(query));
    assert.ok(finds('Met a 🧙\u200d♂\ufe0f at the ford', '🧙'), 'part of a longer emoji');
    assert.ok(finds('A fight ⚔\ufe0f at dawn', '⚔'), 'drawn in colour, found plain');
    assert.ok(finds('A fight ⚔ at dawn', '⚔\ufe0f'), 'drawn plain, found in colour');
    assert.ok(!finds('A fight at dawn', '⚔'));
  });

  const c = character({ currentDate: date(3, 0, 1) });
  const entry = oldEntry('x', date(3, 0, 1), { text: 'Met the goblin king at the Café', location: 'Hag’s Addle', hex: '0606' });
  const shown = getEntryDisplayText(entry, c);
  const finds = (query: string) => matchesSearch(entry, c, parseJournalQuery(query));

  test('what is searched: the text, location, hex and date as listed', () => {
    assert.deepEqual(shown, {
      date: '3 Grimvold (Hayme), Year 1',
      location: 'Hag’s Addle',
      hex: 'Hex 0606',
      text: 'Met the goblin king at the Café',
    });
    for (const q of ['goblin', "hag's", 'addle', '0606', 'hex 0606', 'grimvold', 'hayme', 'year 1', '3 grimvold', '3 Grimvold, Year 1', '(Hayme)']) {
      assert.ok(finds(q), q);
    }
  });

  test('every term must match, each anywhere, in any order', () => {
    assert.ok(finds('king goblin'));
    assert.ok(finds('goblin 0606 grimvold addle'));
    assert.ok(!finds('goblin troll'));
  });

  test('a phrase must match as written, with any spaces or line breaks between its words', () => {
    const text = (t: string) => matchesSearch(oldEntry('t', date(1, 0, 1), { text: t }), c, parseJournalQuery('"goblin king"'));
    assert.ok(text('the goblin king'));
    assert.ok(text('the Goblin  King'));
    assert.ok(text('the goblin\nking'));
    assert.ok(!text('the king goblin'));
    assert.ok(!text('the goblin, the king'));
    assert.ok(!text('the goblinking'));
    assert.ok(finds('"goblin king" "at the café"'));
  });

  test('a number matches only a whole number', () => {
    const on = (dated: CalendarDate, extra: Partial<JournalEntry> = {}) =>
      (query: string) => matchesSearch(oldEntry('t', dated, extra), c, parseJournalQuery(query));
    // 11 Grimvold (Chime), Year 12, in hex 0101
    const elevenTwelve = on(date(11, 0, 12), { hex: '0101' });
    assert.ok(!elevenTwelve('1'), '1 is not in 11, 12 or 0101');
    assert.ok(!elevenTwelve('year 1'));
    assert.ok(!elevenTwelve('"year 1"'));
    assert.ok(elevenTwelve('"year 12"') && elevenTwelve('11') && elevenTwelve('0101'));
    assert.ok(!elevenTwelve('101') && !elevenTwelve('2'));
    // 13 Grimvold (Hayme), Year 1
    const thirteen = on(date(13, 0, 1));
    assert.ok(!thirteen('3 grimvold') && !thirteen('"3 grimvold"'));
    assert.ok(thirteen('year 1') && thirteen('"year 1"') && thirteen('13 grimvold'));
    // Days in Fairy, by visit and day. Every visit begins on 3 Lymewald,
    // Year 2, a date with no 1 or 5 in it, so only the Fairy dates can match.
    let f = character({ currentDate: date(3, 1, 2) });
    for (let visit = 1; visit <= 11; visit += 1) {
      const which = visit === 1 ? 'first' : visit === 11 ? 'eleventh' : '';
      f = apply(f, enterFairy(f));
      f = apply(f, setDaysInFairy(f, 14));
      if (which) f = write(f, `${which} visit, fifteenth day`);
      f = apply(f, setDaysInFairy(f, 4));
      if (which) f = write(f, `${which} visit, fifth day`);
      f = apply(f, returnFromFairy(f, f.currentDate));
    }
    const found = (query: string) => f.journalEntries.filter((e) => matchesSearch(e, f, parseJournalQuery(query))).map(label);
    assert.deepEqual(found('fairy visit 1, day 5'), ['first visit, fifth day']);
    assert.deepEqual(found('"visit 11, day 15"'), ['eleventh visit, fifteenth day']);
  });

  test('ignoring case and accents, both ways', () => {
    assert.ok(finds('CAFE'));
    assert.ok(finds('café'));
    const plain = oldEntry('y', date(3, 0, 1), { text: 'Cafe' });
    assert.ok(matchesSearch(plain, c, parseJournalQuery('Café')));
  });

  test('a Fairy date is searched as it is listed', () => {
    let f = character({ currentDate: date(3, 0, 2) });
    f = apply(f, enterFairy(f));
    f = apply(f, setDaysInFairy(f, 4));
    f = write(f, 'Court of the Queen');
    const e = last(f);
    assert.equal(getEntryDisplayText(e, f).date, 'Fairy visit 1, day 5 (entered 3 Grimvold, Year 2)');
    assert.ok(matchesSearch(e, f, parseJournalQuery('fairy visit 1 day 5')));
    assert.ok(matchesSearch(e, f, parseJournalQuery('3 Grimvold, Year 2')), "the app's short date, as written");
  });

  test('no search matches everything', () => {
    assert.ok(matchesSearch(entry, c, []));
  });

  test("an entry's matches, part by part; asked again with the same terms, the same object", () => {
    const terms = parseJournalQuery('goblin 0606 hag’s grimvold');
    const matches = getEntryMatches(entry, c, terms);
    const markedIn = (part: keyof typeof matches) => matches[part].map((r) => shown[part].slice(r.start, r.end));
    assert.deepEqual(markedIn('text'), ['goblin']);
    assert.deepEqual(markedIn('location'), ['Hag’s']);
    assert.deepEqual(markedIn('hex'), ['0606']);
    assert.deepEqual(markedIn('date'), ['Grimvold']);
    assert.equal(getEntryMatches(entry, c, terms), matches);
    assert.notEqual(getEntryMatches(entry, c, parseJournalQuery('goblin 0606 hag’s grimvold')), matches, 'new terms, worked out again');
    assert.deepEqual(getEntryMatches(entry, c, []), { date: [], location: [], hex: [], text: [] });
  });

  test("an entry's date is read again when the Fairy visits change", () => {
    const visit = { id: 'v', enteredOn: date(2, 0, 1), returnedOn: date(9, 0, 1), daysInFairy: 3 };
    const e = oldEntry('in Fairy', date(2, 0, 1), { fairyDate: { visitId: 'v', day: 2 } });
    const before = character({ fairyVisits: [visit] });
    assert.equal(getEntryDisplayText(e, before).date, 'Fairy visit 1, day 2 (entered 2 Grimvold, Year 1)');
    const earlier = { id: 'w', enteredOn: date(1, 0, 1), returnedOn: date(1, 0, 1), daysInFairy: 0 };
    const after = { ...before, fairyVisits: [earlier, visit] };
    assert.equal(getEntryDisplayText(e, after).date, 'Fairy visit 2, day 2 (entered 2 Grimvold, Year 1)');
    assert.ok(matchesSearch(e, after, parseJournalQuery('visit 2')));
  });

  test('matches are found in the text as written, so accented letters and ß are marked whole', () => {
    const at = (text: string, query: string) =>
      findMatchRanges(text, parseJournalQuery(query)).map((r) => text.slice(r.start, r.end));
    assert.deepEqual(at('Café or cafe', 'cafe'), ['Café', 'cafe']);
    assert.deepEqual(at('Cafe\u0301!', 'CAFÉ'), ['Cafe\u0301']);
    assert.deepEqual(at('Cafe\u0301\u0323 x', 'cafe'), ['Cafe\u0301\u0323'], 'every accent after the letter');
    assert.deepEqual(at('Die Straße', 'strasse'), ['Straße']);
    assert.deepEqual(at('Die Straße', 'ss'), ['ß']);
    assert.deepEqual(at('🐐 goat 🐐 Goat', 'goat'), ['goat', 'Goat']);
    assert.deepEqual(at('A fight ⚔\ufe0f!', '⚔'), ['⚔\ufe0f'], 'an emoji with the selector that draws it');
    assert.deepEqual(at('Year 1, Year 12', 'year 1'), ['Year', '1', 'Year']);
    assert.deepEqual(at('Year 1, Year 12', '"year 1"'), ['Year 1']);
    assert.deepEqual(at('the goblin\nking', '"goblin king"'), ['goblin\nking']);
  });

  test('overlapping and touching matches are joined', () => {
    assert.deepEqual(findMatchRanges('goblinking', parseJournalQuery('goblin king')), [{ start: 0, end: 10 }]);
    assert.deepEqual(findMatchRanges('aaaa', [['aa']]), [{ start: 0, end: 4 }]);
    assert.deepEqual(findMatchRanges('anything', []), []);
  });

  test('highlightSegments cuts text into matching and other parts', () => {
    const text = 'a goat and a Goat';
    const ranges = findMatchRanges(text, [['goat']]);
    assert.deepEqual(highlightSegments(text, ranges), [
      { text: 'a ', match: false },
      { text: 'goat', match: true },
      { text: ' and a ', match: false },
      { text: 'Goat', match: true },
    ]);
    assert.deepEqual(highlightSegments(text, ranges, 4, 10), [
      { text: 'at', match: true },
      { text: ' and', match: false },
    ]);
  });
});

describe('excerpts of the text around matches', () => {
  const words = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `w${from + i}`).join(' ');
  const excerptText = (text: string, query: string, options?: { context?: number; max?: number }) => {
    const { excerpts, moreMatches } = matchExcerpts(text, findMatchRanges(text, parseJournalQuery(query)), options);
    return {
      excerpts: excerpts.map(
        (x) => `${x.cutStart ? '…' : ''}${x.segments.map((s) => (s.match ? `[${s.text}]` : s.text)).join('')}${x.cutEnd ? '…' : ''}`,
      ),
      moreMatches,
    };
  };

  test('a short text is shown whole', () => {
    assert.deepEqual(excerptText('The goat ate my hat.', 'goat'), { excerpts: ['The [goat] ate my hat.'], moreMatches: 0 });
  });

  test('a long text is cut around the match, at word breaks', () => {
    const text = `${words(20)} goat ${words(20, 21)}`;
    assert.deepEqual(excerptText(text, 'goat', { context: 12 }), {
      excerpts: ['…w18 w19 w20 [goat] w21 w22 w23…'],
      moreMatches: 0,
    });
  });

  test('nearby matches share an excerpt; past the limit, the rest are counted', () => {
    const text = `goat ${words(30)} goat goat ${words(30, 31)} goat ${words(30, 61)} goat`;
    assert.deepEqual(excerptText(text, 'goat', { context: 8, max: 2 }), {
      excerpts: ['[goat] w1 w2…', '…w29 w30 [goat] [goat] w31 w32…'],
      moreMatches: 2,
    });
  });

  test('dense matches are split into short excerpts that never overlap', () => {
    const text = 'Danced with a goblin under the moon. '.repeat(20).trim();
    const ranges = findMatchRanges(text, [['goblin']]);
    const { excerpts, moreMatches } = matchExcerpts(text, ranges);
    assert.equal(excerpts.length, 3);
    let shownMatches = 0;
    let previousEnd = 0;
    for (const x of excerpts) {
      assert.ok(x.start >= previousEnd, 'no overlap');
      assert.ok(x.end - x.start <= 160, `${x.end - x.start} characters`);
      assert.equal(x.segments.map((seg) => seg.text).join(''), text.slice(x.start, x.end));
      const matches = x.segments.filter((seg) => seg.match).length;
      assert.ok(matches >= 1, 'each holds a match');
      shownMatches += matches;
      previousEnd = x.end;
    }
    assert.equal(shownMatches + moreMatches, 20);
    // Where two excerpts meet, each keeps whole words: one ends after "moon.",
    // the next starts at "Danced". Nothing is left out there, so neither is
    // marked as cut; the last one is, since text follows it.
    assert.ok(text.slice(excerpts[0].start, excerpts[0].end).endsWith('moon.'));
    assert.ok(text.slice(excerpts[1].start).startsWith('Danced'));
    assert.deepEqual(
      excerpts.map((x) => [x.cutStart, x.cutEnd]),
      [
        [false, false],
        [false, false],
        [false, true],
      ],
    );
  });

  test('a cut never splits a character in two', () => {
    const text = `${'🐐'.repeat(30)}goat${'🐐'.repeat(30)}`;
    const [excerpt] = matchExcerpts(text, findMatchRanges(text, [['goat']]), { context: 5 }).excerpts;
    const joined = excerpt.segments.map((s) => s.text).join('');
    assert.ok(joined.startsWith('🐐') && joined.endsWith('🐐'), joined);
    assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(joined), 'no lone surrogates');
  });

  test('no matches, no excerpts', () => {
    const none: TextRange[] = [];
    assert.deepEqual(matchExcerpts('text', none), { excerpts: [], moreMatches: 0 });
  });
});

describe('the list', () => {
  let c = character({ currentDate: date(1, 0, 1), currentLocationHex: '0606' });
  c = write(c, 'goblins at the ford');
  c = write(on({ ...c, currentLocationHex: '0303' }, date(2, 0, 1)), 'a quiet day');
  c = write(on({ ...c, currentLocationHex: '' }, date(3, 0, 1)), 'more goblins');
  c = write(on({ ...c, currentLocationHex: '0606' }, date(4, 0, 1)), 'the ford again');
  const texts = (list: ReturnType<typeof listJournal>) => list.items.map((i) => i.entry.text);

  test('filter and search together, newest first', () => {
    const all = listJournal(c.journalEntries, c, 'all', []);
    assert.deepEqual(texts(all), ['the ford again', 'more goblins', 'a quiet day', 'goblins at the ford']);
    assert.deepEqual([all.matching, all.total], [4, 4]);
    const inHex = listJournal(c.journalEntries, c, '0606', []);
    assert.deepEqual(texts(inHex), ['the ford again', 'goblins at the ford']);
    const both = listJournal(c.journalEntries, c, '0606', parseJournalQuery('GOBLIN'));
    assert.deepEqual(texts(both), ['goblins at the ford']);
    assert.deepEqual([both.matching, both.total], [1, 4]);
    assert.deepEqual(texts(listJournal(c.journalEntries, c, 'none', parseJournalQuery('goblins'))), ['more goblins']);
  });

  test('entries being worked on stay listed, marked as not matching', () => {
    const quiet = c.journalEntries.find((e) => e.text === 'a quiet day')!;
    const list = listJournal(c.journalEntries, c, '0606', parseJournalQuery('goblin'), new Set([quiet.id]));
    assert.deepEqual(
      list.items.map((i) => [i.entry.text, i.matches]),
      [
        ['a quiet day', false],
        ['goblins at the ford', true],
      ],
    );
    assert.equal(list.matching, 1, 'only matching entries are counted');
  });

  test('the summary line', () => {
    const say = (filter: string, query: string) =>
      describeJournalList(listJournal(c.journalEntries, c, filter, parseJournalQuery(query)), filter, query);
    assert.equal(say('all', ''), '4 entries');
    assert.equal(say('all', '   '), '4 entries');
    assert.equal(say('all', '( )'), '4 entries', 'nothing to search for');
    assert.equal(say('0606', ''), '2 of 4 entries are in hex 0606');
    assert.equal(say('0303', ''), '1 of 4 entries is in hex 0303');
    assert.equal(say('none', ''), '1 of 4 entries has no hex');
    assert.equal(say('all', '  ford   again '), '1 of 4 entries matches “ford again”');
    assert.equal(say('all', 'goblin'), '2 of 4 entries match “goblin”');
    assert.equal(say('all', 'troll'), '0 of 4 entries match “troll”');
    assert.equal(say('all', '"the ford"'), '2 of 4 entries match "the ford"', 'a search with quotes is shown as typed');
    assert.equal(say('0606', 'goblin'), '1 of 4 entries is in hex 0606 and matches “goblin”');
    assert.equal(say('none', 'quiet'), '0 of 4 entries have no hex and match “quiet”');
    assert.equal(describeJournalList({ matching: 0, total: 0 }, 'all', ''), 'No journal entries yet.');
    assert.equal(describeJournalList({ matching: 1, total: 1 }, '0606', ''), '1 of 1 entry is in hex 0606');
    assert.equal(
      describeJournalList({ matching: 0, total: 2 }, 'all', 'x'.repeat(70)),
      `0 of 2 entries match “${'x'.repeat(60)}…”`,
    );
  });
});
