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
  const scroll: InventoryItem = {
    id: 'scroll-1',
    name: 'Scroll of Dweomerlight',
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
  test('a shard’s spell is not text the sheet prints', () => {
    const c = characterWithShard();
    // The spell is really on the character, so its absence below means something.
    assert.equal(c.equippedItems[0].shard!.spell!.name, SHARD_SPELL.name);
    assert.ok(!sheetText(createDefaultCharacter()).includes(SHARD_SPELL.name), 'nothing else holds the name');
    const text = sheetText(c);
    assert.ok(!text.includes(SHARD_SPELL.name), 'the shard’s spell is a reference, not printed text');
    assert.ok(!text.includes('leyLineId'), 'nor the line it was charged on');
    assert.ok(!text.includes(SHARD_LINE.name), 'nor the line’s name');
  });

  test('what the sheet does print about the item is still there', () => {
    const text = sheetText(characterWithShard());
    assert.ok(text.includes('Dwemer shard'), 'the item’s own name still prints');
    assert.ok(text.includes('Hums when it is near the line'), 'so do its notes');
  });

  test('a scroll’s spell still counts: it prints on the sheet', () => {
    assert.ok(sheetText(characterWithShard()).includes('Dweomerlight'), 'the scroll’s spell name is text the sheet prints');
  });

  test('a field that is merely called shard is left alone', () => {
    // The guard is on a shard's state, not on the word: a future field of that
    // name without castsLeft/castsPerCharge is text the sheet may print.
    const c: Character = { ...createDefaultCharacter(), equippedItems: [] };
    const withLookalike = { ...c, shard: { note: 'a shard of flint' } } as unknown as Character;
    assert.ok(sheetText(withLookalike).includes('a shard of flint'));
  });

  test('the notes, the journal, the NPCs and the map are still left out', () => {
    const text = sheetText(createDefaultCharacter());
    for (const field of ['journalEntries', 'npcs', 'mapData', 'otherNotes', 'currentLocationHex']) {
      assert.ok(!text.includes(`"${field}"`), field);
    }
  });
});
