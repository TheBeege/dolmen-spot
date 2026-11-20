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
  getEntryLivedDay,
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
import type { CalendarDate, Character, JournalEntry } from './types';

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

/** An entry as saved before Fairy time was tracked: a date, no Fairy references. */
const oldEntry = (text: string, on: CalendarDate, extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id: `old-${text}`,
  date: on,
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

  test('each entry is placed on the day the character lived it, not on the jumped calendar', () => {
    const c = fairyTrip();
    const days = Object.fromEntries(c.journalEntries.map((e) => [label(e), getEntryLivedDay(e, c)]));
    // 9 days lived before 10 Grimvold, Year 1; then 2 days in Fairy. The two
    // years that passed in Dolmenwood meanwhile weren't lived.
    assert.deepEqual(days, {
      before: 9,
      '[entered]': 9,
      'Fairy day 1': 9,
      'Fairy day 3': 11,
      '[returned]': 11,
      'back, same day': 11,
      'back, next day': 12,
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
    const back = c.journalEntries.find((e) => e.text === 'back')!;
    assert.equal(getEntryLivedDay(back, c), getEntryLivedDay(c.journalEntries.find((e) => e.text === 'Fairy day 4')!, c));
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
    assert.deepEqual(sameDay.journalEntries.find(e => e.fairyEvent?.kind === 'returned')!.date, date(10, 0, 1));
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

  test('the order comes from when entries were lived, wherever they sit in the saved list', () => {
    const c = fairyTrip();
    const byText = (t: string) => c.journalEntries.find((e) => label(e) === t)!;
    // An imported journal whose list is out of order, with no two entries on the same lived day.
    const shuffled = { ...c, journalEntries: ['Fairy day 3', 'back, next day', 'before', 'Fairy day 1'].map(byText) };
    assert.deepEqual(listed(shuffled), ['back, next day', 'Fairy day 3', 'Fairy day 1', 'before']);
  });

  test("entries the clock can't place exactly fall back to their date, then to the order written", () => {
    // A journal from before Fairy time was tracked: dated entries with no
    // Fairy references, two of them in what later became time away.
    let c = character({
      currentDate: date(10, 0, 1),
      journalEntries: [
        oldEntry('old, 5 Grimvold Y1', date(5, 0, 1)),
        oldEntry('old, 1 Lymewald Y2', date(1, 1, 2)),
        oldEntry('old, 1 Chysting Y2', date(1, 6, 2)),
        // Written in a Fairy visit that no longer exists.
        oldEntry('lost visit, 20 Grimvold Y1', date(20, 0, 1), { fairyDate: { visitId: 'gone', day: 3 } }),
      ],
    });
    c = apply(c, enterFairy(c));
    c = write(c, 'Fairy day 1');
    c = apply(c, setDaysInFairy(c, 2));
    c = apply(c, returnFromFairy(c, date(10, 0, 3)));
    c = write(c, 'back');
    assert.deepEqual(listed(c), [
      'back',
      '[returned]',
      // Dated while the character was away: placed at the return, by date.
      'old, 1 Chysting Y2',
      'old, 1 Lymewald Y2',
      'lost visit, 20 Grimvold Y1',
      'Fairy day 1',
      '[entered]',
      'old, 5 Grimvold Y1',
    ]);
  });
});

describe('the hex an entry is written in', () => {
  test('a new entry is stamped with the map’s current hex, the location and the date', () => {
    const c = character({ currentDate: date(4, 0, 1), currentLocation: 'Prigwort', currentLocationHex: '1106' });
    const { id, ...entry } = createJournalEntry(c);
    assert.ok(typeof id === 'string' && id.length > 0);
    assert.deepEqual(entry, { date: date(4, 0, 1), location: 'Prigwort', hex: '1106', text: '' });
  });

  test('with no current hex (or one that isn’t on the map), the entry has none', () => {
    for (const currentLocationHex of ['', '9999', 'zz']) {
      const entry = createJournalEntry(character({ currentLocationHex }));
      assert.equal('hex' in entry, false, currentLocationHex);
    }
  });

  test('entries written in Fairy and after coming back are stamped too', () => {
    let c = character({ currentLocationHex: '0606' });
    c = apply(c, enterFairy(c));
    const inFairy = createJournalEntry(c);
    assert.equal(inFairy.hex, '0606');
    assert.ok(inFairy.fairyDate);
    c = apply(c, returnFromFairy(c, date(5, 0, 1)));
    const after = createJournalEntry({ ...c, currentLocationHex: '0707' });
    assert.equal(after.hex, '0707');
    assert.ok(after.sinceReturnFrom);
  });

  test('the entries written on entering and leaving Fairy carry the current hex, if any', () => {
    let c = character({ currentLocation: 'The Ring', currentLocationHex: '0606' });
    c = apply(c, enterFairy(c));
    const entered = c.journalEntries[c.journalEntries.length - 1];
    assert.equal(entered.fairyEvent?.kind, 'entered');
    assert.equal(entered.hex, '0606');
    assert.equal(entered.location, 'The Ring');
    const noHex = { ...c, currentLocationHex: '' };
    c = apply(noHex, returnFromFairy(noHex, date(9, 0, 1)));
    const returned = c.journalEntries[c.journalEntries.length - 1];
    assert.equal(returned.fairyEvent?.kind, 'returned');
    assert.equal('hex' in returned, false);
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
  test('folding ignores case and accents, and treats curly quotes like straight ones', () => {
    assert.equal(foldForSearch('Café ÉLAN Œuvre Straße Øster Łódź ﬁre'), 'cafe elan oeuvre strasse oster lodz fire');
    assert.equal(foldForSearch('Café'), 'cafe', 'an accent typed as its own character');
    assert.equal(foldForSearch('İstanbul'), 'istanbul');
    assert.equal(foldForSearch('Hag’s Addle “Mossy” – far'), 'hag\'s addle "mossy" - far');
  });

  test('a search is split into words, folded, without repeats', () => {
    assert.deepEqual(parseJournalQuery('  Goblin   KING goblin\tcafé '), ['goblin', 'king', 'cafe']);
    assert.deepEqual(parseJournalQuery('   '), []);
    assert.deepEqual(parseJournalQuery('́'), [], 'only an accent is no search');
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
    for (const q of ['goblin', 'hag\'s', 'addle', '0606', 'hex 0606', 'grimvold', 'hayme', 'year 1', '3 grimvold']) {
      assert.ok(finds(q), q);
    }
  });

  test('every word must match, each anywhere, in any order', () => {
    assert.ok(finds('king goblin'));
    assert.ok(finds('goblin 0606 grimvold addle'));
    assert.ok(!finds('goblin troll'));
  });

  test('ignoring case and accents, both ways', () => {
    assert.ok(finds('CAFE'));
    assert.ok(finds('café'));
    const plain = oldEntry('y', date(3, 0, 1), { text: 'Cafe' });
    assert.ok(matchesSearch(plain, c, parseJournalQuery('Café')));
  });

  test('a Fairy date is searched as it is listed', () => {
    let f = character({ currentDate: date(10, 0, 2) });
    f = apply(f, enterFairy(f));
    f = apply(f, setDaysInFairy(f, 4));
    f = write(f, 'Court of the Queen');
    const e = f.journalEntries[f.journalEntries.length - 1];
    const text = getEntryDisplayText(e, f);
    assert.equal(text.date, 'Fairy visit 1, day 5 (entered 10 Grimvold, Year 2)');
    assert.ok(matchesSearch(e, f, parseJournalQuery('fairy visit 1 day 5')));
  });

  test('no search matches everything', () => {
    assert.ok(matchesSearch(entry, c, []));
  });

  test("an entry's matches, part by part; asked again with the same words, the same object", () => {
    const words = parseJournalQuery('goblin 0606 hag’s grimvold');
    const matches = getEntryMatches(entry, c, words);
    const marked = (part: keyof typeof matches) => matches[part].map((r) => shown[part].slice(r.start, r.end));
    assert.deepEqual(marked('text'), ['goblin']);
    assert.deepEqual(marked('location'), ['Hag’s']);
    assert.deepEqual(marked('hex'), ['0606']);
    assert.deepEqual(marked('date'), ['Grimvold']);
    assert.equal(getEntryMatches(entry, c, words), matches);
    assert.notEqual(getEntryMatches(entry, c, parseJournalQuery('goblin 0606 hag’s grimvold')), matches, 'new words, worked out again');
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
    assert.deepEqual(at('Café!', 'CAFÉ'), ['Café']);
    assert.deepEqual(at('Die Straße', 'strasse'), ['Straße']);
    assert.deepEqual(at('Die Straße', 'ss'), ['ß']);
    assert.deepEqual(at('🐐 goat 🐐 Goat', 'goat'), ['goat', 'Goat']);
  });

  test('overlapping and touching matches are joined', () => {
    assert.deepEqual(findMatchRanges('goblinking', parseJournalQuery('goblin king')), [{ start: 0, end: 10 }]);
    assert.deepEqual(findMatchRanges('aaaa', ['aa']), [{ start: 0, end: 4 }]);
    assert.deepEqual(findMatchRanges('anything', []), []);
  });

  test('highlightSegments cuts text into matching and other parts', () => {
    const text = 'a goat and a Goat';
    const ranges = findMatchRanges(text, ['goat']);
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
    const ranges = findMatchRanges(text, ['goblin']);
    const { excerpts, moreMatches } = matchExcerpts(text, ranges);
    assert.equal(excerpts.length, 3);
    let shown = 0;
    let previousEnd = 0;
    for (const x of excerpts) {
      assert.ok(x.start >= previousEnd, 'no overlap');
      assert.ok(x.end - x.start <= 160, `${x.end - x.start} characters`);
      assert.equal(x.segments.map((seg) => seg.text).join(''), text.slice(x.start, x.end));
      const matches = x.segments.filter((seg) => seg.match).length;
      assert.ok(matches >= 1, 'each holds a match');
      shown += matches;
      previousEnd = x.end;
    }
    assert.equal(shown + moreMatches, 20);
    // Where two excerpts meet, each keeps whole words: one ends after "moon.", the next starts at "Danced".
    assert.ok(text.slice(excerpts[0].start, excerpts[0].end).endsWith('moon.'));
    assert.ok(text.slice(excerpts[1].start).startsWith('Danced'));
  });

  test('a cut never splits a character in two', () => {
    const text = `${'🐐'.repeat(30)}goat${'🐐'.repeat(30)}`;
    const [excerpt] = matchExcerpts(text, findMatchRanges(text, ['goat']), { context: 5 }).excerpts;
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
    assert.equal(say('0606', ''), '2 of 4 entries are in hex 0606');
    assert.equal(say('0303', ''), '1 of 4 entries is in hex 0303');
    assert.equal(say('none', ''), '1 of 4 entries has no hex');
    assert.equal(say('all', '  ford   again '), '1 of 4 entries matches “ford again”');
    assert.equal(say('all', 'goblin'), '2 of 4 entries match “goblin”');
    assert.equal(say('all', 'troll'), '0 of 4 entries match “troll”');
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
