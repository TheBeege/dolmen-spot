// When rations spoil, and what the sheet says about it. Rations are inventory
// items (src/lib/rations.ts): a day's rations is fresh or preserved, and it is
// stamped with the lived day it was acquired on, which spoilage counts from.
//
// The rules (Player's Book p116, p186): fresh rations keep 1 week, preserved
// ones 2 months, or 1 day and 1 week in dank conditions. The calendar and the
// lived-time clock are in src/lib/livedTime.ts. Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, createDefaultCharacter, daysBetween, RATIONS } from './gamedata';
import { getLivedDays } from './livedTime';
import {
  countRations,
  createRationItem,
  describeRationShelfLife,
  describeRationSpoilage,
  findRationToSpend,
  getRationItems,
  getRationSpoilage,
  isRationItem,
  rationItemFields,
  rationSlots,
  rationSpoilage,
  rationWeight,
  removeOneRation,
  todayLivedDay,
} from './rations';
import type { Character, InventoryItem } from './types';

/** A character on a given Dolmenwood date, with these fields. */
function on(date: Character['currentDate'], fields: Partial<Character> = {}): Character {
  return { ...createDefaultCharacter(), currentDate: date, ...fields };
}

const START = { day: 1, month: 0, year: 1 }; // Year 1, 1 Grimvold: lived day 0

/** A character whose lived day is `days` days after the start of the clock. */
function livedDaysLater(days: number, fields: Partial<Character> = {}): Character {
  return on(addDays(START, days), fields);
}

const fresh = (acquiredLivedDay: number): InventoryItem => createRationItem('fresh', acquiredLivedDay, 'r-fresh');
const preserved = (acquiredLivedDay: number): InventoryItem => createRationItem('preserved', acquiredLivedDay, 'r-preserved');

describe('a day\'s rations is an item with the rules\' slots and weight', () => {
  test('fresh takes 1 slot, preserved 2, and both weigh 20 coins', () => {
    // Player's Book p116: "Rations (preserved, 1 day) | 2 | 20" and
    // "Rations (fresh, 1 day) | 1 | 20"; the slots table on p171 agrees.
    assert.deepEqual(rationItemFields('fresh'), { name: 'Rations (fresh, 1 day)', slots: 1, weight: 20 });
    assert.deepEqual(rationItemFields('preserved'), { name: 'Rations (preserved, 1 day)', slots: 2, weight: 20 });
    assert.equal(RATIONS.fresh.slots, 1);
    assert.equal(RATIONS.preserved.slots, 2);
    assert.equal(RATIONS.fresh.weight, 20);
    assert.equal(RATIONS.preserved.weight, 20);
  });

  test('a new ration is a stowed item of kind \'ration\', acquired on the day given', () => {
    const item = createRationItem('preserved', 12, 'id-1');
    assert.deepEqual(item, {
      id: 'id-1',
      name: 'Rations (preserved, 1 day)',
      slots: 2,
      weight: 20,
      notes: '',
      equipped: false,
      kind: 'ration',
      ration: { freshness: 'preserved', acquiredLivedDay: 12 },
    });
    assert.ok(isRationItem(item));
    assert.equal(isRationItem({ ...item, kind: undefined }), false);
    assert.equal(isRationItem({ ...item, ration: undefined }), false);
  });

  test('two rations made without an id get different ones', () => {
    const ids = [createRationItem('fresh', 0).id, createRationItem('fresh', 0).id, createRationItem('fresh', 0).id];
    assert.equal(new Set(ids).size, 3);
  });

  test('an acquisition day that isn\'t a whole day counts as one', () => {
    assert.equal(createRationItem('fresh', 3.9).ration?.acquiredLivedDay, 3);
    assert.equal(createRationItem('fresh', -5).ration?.acquiredLivedDay, 0);
    assert.equal(createRationItem('fresh', Number.NaN).ration?.acquiredLivedDay, 0);
  });
});

describe('spoilage: fresh rations', () => {
  test('keep 1 week in ordinary conditions', () => {
    for (const age of [0, 1, 5, 6]) {
      const s = rationSpoilage('fresh', 0, age, false);
      assert.equal(s.keepsDays, 7, `age ${age}`);
      assert.equal(s.daysLeft, 7 - age, `age ${age}`);
      assert.equal(s.spoiled, false, `age ${age}`);
      assert.equal(s.spoiledDaysAgo, 0, `age ${age}`);
    }
  });

  test('the boundary is exactly a week: a week old has spoiled, a day less has not', () => {
    const dayBefore = rationSpoilage('fresh', 0, 6, false);
    assert.equal(dayBefore.spoiled, false);
    assert.equal(dayBefore.daysLeft, 1);
    const atTheLimit = rationSpoilage('fresh', 0, 7, false);
    assert.equal(atTheLimit.spoiled, true);
    assert.equal(atTheLimit.daysLeft, 0);
    assert.equal(atTheLimit.spoiledDaysAgo, 0, 'spoiled today');
    const aDayAfter = rationSpoilage('fresh', 0, 8, false);
    assert.equal(aDayAfter.spoiled, true);
    assert.equal(aDayAfter.spoiledDaysAgo, 1);
    assert.equal(aDayAfter.daysLeft, 0);
  });

  test('keep 1 day in dank conditions: spoiled the next day', () => {
    assert.deepEqual(
      [0, 1, 2].map((age) => {
        const s = rationSpoilage('fresh', 0, age, true);
        return [s.keepsDays, s.spoiled, s.spoiledDaysAgo];
      }),
      [[1, false, 0], [1, true, 0], [1, true, 1]],
    );
  });
});

describe('spoilage: preserved rations', () => {
  test('keep 2 months in ordinary conditions, counted as 60 days', () => {
    assert.equal(rationSpoilage('preserved', 0, 0, false).keepsDays, 60);
    assert.equal(rationSpoilage('preserved', 0, 59, false).daysLeft, 1);
    assert.equal(rationSpoilage('preserved', 0, 59, false).spoiled, false);
    assert.equal(rationSpoilage('preserved', 0, 60, false).spoiled, true);
    assert.equal(rationSpoilage('preserved', 0, 61, false).spoiledDaysAgo, 1);
  });

  test('keep 1 week in dank conditions', () => {
    assert.equal(rationSpoilage('preserved', 0, 0, true).keepsDays, 7);
    assert.equal(rationSpoilage('preserved', 0, 6, true).spoiled, false);
    assert.equal(rationSpoilage('preserved', 0, 7, true).spoiled, true);
    assert.equal(rationSpoilage('preserved', 0, 8, true).spoiledDaysAgo, 1);
  });

  test('dank conditions are the shorter of the two, both ways round', () => {
    for (const freshness of ['fresh', 'preserved'] as const) {
      for (const age of [0, 1, 6, 7, 30, 60, 61, 200]) {
        const dry = rationSpoilage(freshness, 0, age, false);
        const dank = rationSpoilage(freshness, 0, age, true);
        assert.ok(dank.keepsDays < dry.keepsDays, `${freshness} at ${age}`);
        // Food that has spoiled in ordinary conditions has spoiled in dank ones too.
        assert.ok(!dry.spoiled || dank.spoiled, `${freshness} at ${age}`);
      }
    }
  });
});

describe('the age is measured from the day it was acquired', () => {
  test('not from the start of the clock', () => {
    // Acquired on lived day 100, today is lived day 103.
    assert.equal(rationSpoilage('fresh', 100, 103, false).ageDays, 3);
    assert.equal(rationSpoilage('fresh', 100, 103, false).daysLeft, 4);
  });

  test('an acquisition after today counts as brand new, never as negative age', () => {
    const s = rationSpoilage('fresh', 10, 4, false);
    assert.equal(s.ageDays, 0);
    assert.equal(s.daysLeft, 7);
    assert.equal(s.spoiled, false);
  });

  test('a clock rewound to before the acquisition doesn\'t spoil anything', () => {
    const character = on(addDays(START, 5), { stowedItems: [fresh(20)] });
    assert.equal(getRationSpoilage(character, fresh(20))?.spoiled, false);
  });
});

describe('the calendar crossing a month and a year', () => {
  test('a ration kept across a month boundary ages by the days lived, not by the month', () => {
    // 25 Grimvold (30 days) to 5 Lymewald: 10 days, over a month boundary.
    const acquired = { day: 25, month: 0, year: 1 };
    const later = { day: 5, month: 1, year: 1 };
    assert.equal(daysBetween(acquired, later), 10);
    const character = on(acquired, { stowedItems: [preserved(0)] });
    const acquiredLivedDay = todayLivedDay(character);
    const then = on(later);
    const today = todayLivedDay(then);
    assert.equal(today - acquiredLivedDay, 10);
    assert.equal(rationSpoilage('preserved', acquiredLivedDay, today, false).daysLeft, 50);
    assert.equal(rationSpoilage('preserved', acquiredLivedDay, today, true).spoiled, true, 'a week in dank spoils it');
  });

  test('a year ending doesn\'t reset the count: a week either side of it ages by 7 days', () => {
    // Braghold is the last month, 30 days: 25 Braghold to 3 Grimvold of year 2.
    const acquired = { day: 25, month: 11, year: 1 };
    const later = { day: 3, month: 0, year: 2 };
    assert.equal(daysBetween(acquired, later), 8);
    const acquiredLivedDay = todayLivedDay(on(acquired));
    const today = todayLivedDay(on(later));
    assert.equal(today - acquiredLivedDay, 8);
    const s = rationSpoilage('fresh', acquiredLivedDay, today, false);
    assert.equal(s.ageDays, 8);
    assert.equal(s.spoiled, true, 'a week\'s fresh rations are spoiled a week later, whatever the year');
    assert.equal(s.spoiledDaysAgo, 1);
  });

  test('days lived in Fairy count, so food carried there ages', () => {
    const visited: Character = {
      ...livedDaysLater(0, {
        currentDate: { day: 1, month: 0, year: 1 },
        fairyVisits: [{
          id: 'v1',
          enteredOn: { day: 1, month: 0, year: 1 },
          returnedOn: { day: 1, month: 0, year: 1 }, // no Dolmenwood time passed
          daysInFairy: 9,
        }],
      }),
    };
    assert.equal(getLivedDays(visited), 9);
    const item = fresh(0);
    assert.equal(getRationSpoilage(visited, item)?.ageDays, 9);
    assert.equal(getRationSpoilage(visited, item)?.spoiledDaysAgo, 2);
  });
});

describe('a ration\'s spoilage, and the character\'s conditions', () => {
  test('the kind comes from the item and the conditions from the character', () => {
    const item = preserved(0);
    const day3 = livedDaysLater(3);
    const dry = getRationSpoilage(day3, item);
    const dank = getRationSpoilage({ ...day3, dankConditions: true }, item);
    assert.equal(dry?.keepsDays, 60);
    assert.equal(dank?.keepsDays, 7);
    assert.equal(dry?.ageDays, 3);
    assert.equal(dank?.dank, true);
    assert.equal(dry?.dank, false);
  });

  test('an item that isn\'t a well-formed ration has no spoilage', () => {
    const day3 = livedDaysLater(3);
    for (const item of [
      { ...fresh(0), ration: undefined },
      { ...fresh(0), ration: { freshness: 'smoked' as never, acquiredLivedDay: 0 } },
    ]) {
      assert.equal(getRationSpoilage(day3, item), null, JSON.stringify(item.ration));
    }
  });

  test('the sheet says how long is left, and how long ago it spoiled', () => {
    const text = (freshness: 'fresh' | 'preserved', age: number, dank = false) =>
      describeRationSpoilage(rationSpoilage(freshness, 0, age, dank));
    assert.equal(text('fresh', 0), '7 days left');
    assert.equal(text('fresh', 1), '6 days left');
    assert.equal(text('fresh', 6), '1 day left');
    assert.equal(text('fresh', 7), 'Spoiled today');
    assert.equal(text('fresh', 8), 'Spoiled 1 day ago');
    assert.equal(text('fresh', 30), 'Spoiled 23 days ago', 'a week keeps, so 30 days old is 23 days spoiled');
    assert.equal(text('preserved', 59), '1 day left');
    assert.equal(text('preserved', 60), 'Spoiled today');
  });

  test('it also says how long the ration keeps, under the conditions that apply', () => {
    const life = (freshness: 'fresh' | 'preserved', dank: boolean) =>
      describeRationShelfLife(rationSpoilage(freshness, 0, 0, dank));
    assert.equal(life('fresh', false), '1 week');
    assert.equal(life('fresh', true), '1 day');
    assert.equal(life('preserved', false), '2 months');
    assert.equal(life('preserved', true), '1 week');
  });
});

describe('counting and spending rations', () => {
  const character: Character = livedDaysLater(10, {
    equippedItems: [fresh(9)],
    stowedItems: [fresh(2), fresh(5), preserved(1), { id: 'rope', name: 'Rope', slots: 1, weight: 200, notes: '', equipped: false }],
  });

  test('the character\'s rations are found in both lists, equipped first', () => {
    assert.deepEqual(getRationItems(character).map((i) => i.id), ['r-fresh', 'r-fresh', 'r-fresh', 'r-preserved']);
  });

  test('a character with no items, or items that aren\'t lists, has none', () => {
    assert.deepEqual(getRationItems({ equippedItems: [], stowedItems: [] }), []);
    assert.deepEqual(getRationItems({} as Character), []);
  });

  test('they are counted by kind, and their slots and weight totalled', () => {
    const items = getRationItems(character);
    assert.deepEqual(countRations(items), { fresh: 3, preserved: 1 });
    assert.equal(rationSlots(items), 3 * 1 + 2);
    assert.equal(rationWeight(items), 4 * 20);
  });

  test('eating one takes the one that would spoil soonest', () => {
    // Fresh: acquired on lived days 9, 2 and 5; oldest is day 2.
    assert.equal(findRationToSpend(character, 'fresh')?.ration?.acquiredLivedDay, 2);
    const after = removeOneRation(character.equippedItems, character.stowedItems, 'fresh');
    assert.deepEqual(
      { equipped: after.equippedItems.length, stowed: after.stowedItems.map((i) => i.id) },
      { equipped: 1, stowed: ['r-fresh', 'r-preserved', 'rope'] },
    );
    assert.deepEqual(countRations(getRationItems({ ...character, ...after })), { fresh: 2, preserved: 1 });
  });

  test('eating the last one of a kind leaves the other lists alone, and none to eat leaves them as they were', () => {
    const onlyOne = { equippedItems: [], stowedItems: [preserved(0)] };
    const eaten = removeOneRation(onlyOne.equippedItems, onlyOne.stowedItems, 'preserved');
    assert.deepEqual(eaten.stowedItems, []);
    assert.deepEqual(removeOneRation([], [], 'fresh'), { equippedItems: [], stowedItems: [] });
    const untouched = removeOneRation(onlyOne.equippedItems, onlyOne.stowedItems, 'fresh');
    assert.deepEqual(untouched.stowedItems, onlyOne.stowedItems);
  });

  test('an empty character has nothing to eat, and so does one with only the other kind', () => {
    assert.equal(findRationToSpend({ equippedItems: [], stowedItems: [] }, 'fresh'), null);
    assert.equal(findRationToSpend({ equippedItems: [], stowedItems: [preserved(0)] }, 'fresh'), null);
  });
});
