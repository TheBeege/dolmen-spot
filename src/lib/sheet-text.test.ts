// Tests for the text the printable sheet says it may print, which picks the
// fonts it loads (pdf/sheet-text.ts, pdf/fonts.ts). Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetText } from './pdf/sheet-text';
import { createDefaultCharacter } from './gamedata';
import type { Character, InventoryItem } from './types';

/** The spell a shard is made to hold, spelled so that nothing else can hold it. */
const SHARD_SPELL = { name: 'Xylographical Dweomer', rank: 2 };
const SHARD_LINE = { id: 'ley-1', name: 'The Xylographical Line' };

function characterWithShard(): Character {
  const shard: InventoryItem = {
    id: 'shard-1',
    name: 'Dwemer shard',
    slots: 0,
    weight: 1,
    notes: 'Hums when it is near the line',
    equipped: true,
    kind: 'shard',
    shard: { spell: SHARD_SPELL, castsLeft: 2, castsPerCharge: 3, leyLineId: SHARD_LINE.id },
  };
  // Named for what it looks like, not for its spell: if the item's own name
  // held the spell, the assertion about a scroll's spell would pass whether or
  // not the spell itself reached the font probe.
  const scroll: InventoryItem = {
    id: 'scroll-1',
    name: 'Bent scroll',
    slots: 0,
    weight: 1,
    notes: '',
    equipped: true,
    kind: 'scroll',
    scrollSpell: { name: 'Dweomerlight', rank: 2 },
  };
  return {
    ...createDefaultCharacter(),
    equippedItems: [shard, scroll],
    mapData: {
      pois: [],
      fairyDoors: [],
      leyLines: [
        { id: SHARD_LINE.id, kind: 'leyLine', type: 'Ley line', name: SHARD_LINE.name, color: '#c4a35a', hexes: ['0909'], notes: '', spell: SHARD_SPELL },
      ],
    },
  };
}

describe('sheetText', () => {
  test('a shard’s spell and its casts are text the sheet prints', () => {
    const c = characterWithShard();
    // The spell is really on the character, so its presence below means something.
    assert.equal(c.equippedItems[0].shard!.spell!.name, SHARD_SPELL.name);
    const text = sheetText(c);
    assert.ok(text.includes(SHARD_SPELL.name), 'the sheet prints the spell a shard holds');
    assert.ok(text.includes('"castsLeft":2'), 'and the casts left on its charge');
    assert.ok(text.includes('"castsPerCharge":3'), 'and what a charge gives');
  });

  test('the line a shard was charged on is not: the sheet leaves the map out', () => {
    const text = sheetText(characterWithShard());
    assert.ok(!text.includes('leyLineId'), 'the line is a reference into the map, which is unprinted');
  });

  test('what the sheet does print about the item is still there', () => {
    const text = sheetText(characterWithShard());
    assert.ok(text.includes('Dwemer shard'), 'the item’s own name still prints');
    assert.ok(text.includes('Hums when it is near the line'), 'so do its notes');
  });

  test('a scroll’s spell still counts: it prints on the sheet', () => {
    const printed = JSON.parse(sheetText(characterWithShard()));
    assert.equal(printed.equippedItems[1].scrollSpell.name, 'Dweomerlight', 'the scroll’s spell reaches the probe');
    assert.ok(sheetText(characterWithShard()).includes('Dweomerlight'), 'and no other field of the character names it');
  });

  test('the notes, the journal, the NPCs and the map are still left out', () => {
    const text = sheetText(createDefaultCharacter());
    for (const field of ['journalEntries', 'npcs', 'mapData', 'otherNotes', 'currentLocationHex']) {
      assert.ok(!text.includes(`"${field}"`), field);
    }
  });
});
