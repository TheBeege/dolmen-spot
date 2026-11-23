// Tests for the Dwemer shard's state and the two things a player does with it:
// spending a cast and recharging it on a ley line (shards.ts). The shard is a
// house feature — the Player's Book has no entry for it — so the type comments
// in types.ts are the spec these hold to. Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SHARD_LINE_DELETED,
  castsLabel,
  chargeShard,
  chargeShardOnLine,
  newShardState,
  shardLeyLineLabel,
  shardRefs,
  spendCast,
  withCastsPerCharge,
} from './shards';
import { createDefaultCharacter } from './gamedata';
import type { Character, InventoryItem, LeyLine, ShardState } from './types';

const DWEO = { name: 'Dweomerlight', rank: 2 };
const FIREBALL = { name: 'Fireball', rank: 3 };

const line = (over: Partial<LeyLine> = {}): LeyLine => ({
  id: 'line-1',
  kind: 'leyLine',
  type: 'Ley line',
  name: 'The Antler Line',
  color: '#c4a35a',
  hexes: ['0909', '1008'],
  notes: '',
  ...over,
});

const shard = (over: Partial<ShardState> = {}): ShardState => ({
  castsLeft: 0,
  castsPerCharge: 1,
  ...over,
});

function shardItem(over: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'shard-1',
    name: 'Dwemer shard',
    slots: 0,
    weight: 1,
    notes: '',
    equipped: true,
    kind: 'shard',
    shard: shard(),
    ...over,
  };
}

describe('a new shard', () => {
  test('holds no spell, and has no charge on it', () => {
    const fresh = newShardState();
    assert.equal(fresh.spell, undefined, 'absent until the player learns which');
    assert.equal(fresh.castsLeft, 0, '0 = spent');
    assert.equal(fresh.castsPerCharge, 1, 'one cast per charge, before the player says otherwise');
    assert.equal(fresh.leyLineId, undefined);
  });
});

describe('spendCast', () => {
  test('spends one of the casts left', () => {
    assert.equal(spendCast(shard({ castsLeft: 2, castsPerCharge: 3 })).castsLeft, 1);
  });

  test('never goes below none, however many times it is pressed', () => {
    let s = shard({ castsLeft: 1, castsPerCharge: 1 });
    s = spendCast(s);
    assert.equal(s.castsLeft, 0);
    s = spendCast(s);
    assert.equal(s.castsLeft, 0, 'a spent shard stays spent until it is charged');
    s = spendCast(s);
    assert.equal(s.castsLeft, 0);
  });

  test('a count that is not a number spends nothing rather than turning into NaN', () => {
    const bad = shard({ castsLeft: Number.NaN, castsPerCharge: 2 });
    assert.equal(spendCast(bad).castsLeft, 0);
    const notANumber = shard({ castsLeft: 'two' as unknown as number, castsPerCharge: 2 });
    assert.equal(spendCast(notANumber).castsLeft, 0);
  });

  test('leaves everything else alone', () => {
    const before = shard({ castsLeft: 1, castsPerCharge: 2, spell: DWEO, leyLineId: 'line-1' });
    assert.deepEqual(spendCast(before), { ...before, castsLeft: 0 });
  });
});

describe('withCastsPerCharge', () => {
  test('sets the casts one charge gives', () => {
    assert.equal(withCastsPerCharge(shard(), 3).castsPerCharge, 3);
  });

  test('is never below one: a charge that gave no casts would be no charge', () => {
    assert.equal(withCastsPerCharge(shard(), 0).castsPerCharge, 1);
    assert.equal(withCastsPerCharge(shard(), -4).castsPerCharge, 1);
    assert.equal(withCastsPerCharge(shard(), 0.4).castsPerCharge, 1);
  });

  test('a number that is not one keeps the least a charge can give', () => {
    assert.equal(withCastsPerCharge(shard(), Number.NaN).castsPerCharge, 1);
    assert.equal(withCastsPerCharge(shard(), Number.POSITIVE_INFINITY).castsPerCharge, 1);
  });

  test('a casts-left count that is not a number comes out as none', () => {
    const bad = shard({ castsLeft: Number.NaN });
    assert.equal(withCastsPerCharge(bad, 3).castsLeft, 0);
  });

  test('brings the casts left down with it, so a shard never shows more than a charge gives', () => {
    const lowered = withCastsPerCharge(shard({ castsLeft: 5, castsPerCharge: 5 }), 2);
    assert.equal(lowered.castsPerCharge, 2);
    assert.equal(lowered.castsLeft, 2);
  });

  test('leaves the casts left alone when they already fit the new charge', () => {
    assert.equal(withCastsPerCharge(shard({ castsLeft: 1, castsPerCharge: 5 }), 3).castsLeft, 1);
  });
});

describe('chargeShard', () => {
  test('a charge fills the casts, records the line and sets the spell', () => {
    const charged = chargeShard(shard({ castsPerCharge: 3 }), 'line-1', DWEO);
    assert.equal(charged.castsLeft, 3, 'castsLeft = castsPerCharge');
    assert.equal(charged.leyLineId, 'line-1');
    assert.deepEqual(charged.spell, DWEO);
  });

  test('a charge with one cast per charge leaves exactly one', () => {
    assert.equal(chargeShard(shard({ castsPerCharge: 1 }), 'line-1', DWEO).castsLeft, 1);
  });

  test('recharging a spent shard fills it again, and replaces the spell it held', () => {
    const spent = shard({ castsLeft: 0, castsPerCharge: 2, spell: FIREBALL, leyLineId: 'gone' });
    const charged = chargeShard(spent, 'line-1', DWEO);
    assert.equal(charged.castsLeft, 2);
    assert.deepEqual(charged.spell, DWEO, 'the spell resolved for this charge, not the last one');
    assert.equal(charged.leyLineId, 'line-1');
  });

  test('a charge of a shard saved with no charge per charge gives one', () => {
    assert.equal(chargeShard(shard({ castsPerCharge: 0 }), 'line-1', DWEO).castsLeft, 1);
  });
});

describe('castsLabel', () => {
  test('says the casts left on the charge and what a charge gives', () => {
    assert.equal(castsLabel(shard({ castsLeft: 2, castsPerCharge: 3 })), '2 of 3');
    assert.equal(castsLabel(shard({ castsLeft: 0, castsPerCharge: 3 })), '0 of 3');
    assert.equal(castsLabel(shard({ castsLeft: 1, castsPerCharge: 1 })), '1 of 1');
    assert.equal(castsLabel(shard({ castsLeft: 4, castsPerCharge: 2 })), '4 of 2', 'loading allows more left than a charge gives');
  });
});

describe('shardLeyLineLabel', () => {
  const lines = [line(), line({ id: 'line-2', name: '  The Whispering Ley  ' }), line({ id: 'line-3', name: '   ' })];

  test('names the line it was last charged on, by its name', () => {
    assert.equal(shardLeyLineLabel(shard({ leyLineId: 'line-1' }), lines), 'The Antler Line');
  });

  test('trims the name, and says so when the line has none', () => {
    assert.equal(shardLeyLineLabel(shard({ leyLineId: 'line-2' }), lines), 'The Whispering Ley');
    assert.equal(shardLeyLineLabel(shard({ leyLineId: 'line-3' }), lines), 'an unnamed ley line');
  });

  test('a line deleted since says so, rather than naming one that is not there', () => {
    assert.equal(shardLeyLineLabel(shard({ leyLineId: 'deleted' }), lines), SHARD_LINE_DELETED);
    assert.equal(shardLeyLineLabel(shard({ leyLineId: 'deleted' }), []), 'a ley line since deleted');
  });

  test('a shard never charged on a line says nothing', () => {
    assert.equal(shardLeyLineLabel(shard(), lines), null);
  });
});

describe('shardRefs', () => {
  test('finds the shards in both lists, equipped ones first, and nothing else', () => {
    const c: Character = {
      ...createDefaultCharacter(),
      equippedItems: [
        { id: 'e1', name: 'Dagger', slots: 1, weight: 10, notes: '', equipped: true },
        shardItem({ id: 'e2' }),
      ],
      stowedItems: [
        shardItem({ id: 's1', name: 'Spare shard', equipped: false }),
        { id: 's2', name: 'Rope', slots: 1, weight: 50, notes: '', equipped: false },
      ],
    };
    assert.deepEqual(
      shardRefs(c).map((r) => [r.item.id, r.equipped, r.label]),
      [
        ['e2', true, 'Dwemer shard'],
        ['s1', false, 'Spare shard'],
      ],
    );
  });

  test('a shard with no name still has one to name its controls with', () => {
    const c: Character = { ...createDefaultCharacter(), equippedItems: [shardItem({ name: '  ' })] };
    assert.equal(shardRefs(c)[0].label, 'Dwemer shard');
  });

  test('two shards that share a name say which is which', () => {
    const c: Character = {
      ...createDefaultCharacter(),
      equippedItems: [shardItem({ id: 'a' }), shardItem({ id: 'b' })],
      stowedItems: [shardItem({ id: 'c', equipped: false })],
    };
    assert.deepEqual(shardRefs(c).map((r) => r.label), ['Dwemer shard 1', 'Dwemer shard 2', 'Dwemer shard 3']);
  });

  test('a character with none finds none', () => {
    assert.deepEqual(shardRefs(createDefaultCharacter()), []);
  });
});

describe('chargeShardOnLine', () => {
  /** A character with a shard of each kind, and two lines: one with a spell, one without. */
  function character(): Character {
    return {
      ...createDefaultCharacter(),
      equippedItems: [shardItem({ id: 'eq-shard', shard: shard({ castsLeft: 0, castsPerCharge: 3, spell: FIREBALL }) })],
      stowedItems: [
        { id: 'st-other', name: 'Rope', slots: 1, weight: 50, notes: '', equipped: false },
        shardItem({ id: 'st-shard', equipped: false, shard: shard({ castsPerCharge: 2 }) }),
      ],
      mapData: {
        pois: [],
        fairyDoors: [],
        leyLines: [line({ id: 'known', spell: DWEO }), line({ id: 'blank', name: 'The Whispering Ley' })],
      },
    };
  }

  test('charges the shard and records the line, in one write', () => {
    const c = character();
    const ref = shardRefs(c).find((r) => r.item.id === 'eq-shard')!;
    const patch = chargeShardOnLine(ref, 'known', FIREBALL)(c);
    const charged = patch.equippedItems!.find((i) => i.id === 'eq-shard')!;
    assert.deepEqual(charged.shard, {
      castsLeft: 3,
      castsPerCharge: 3,
      spell: DWEO,
      leyLineId: 'known',
    });
    // A line that already had a spell keeps it.
    assert.deepEqual(patch.mapData!.leyLines!.find((l) => l.id === 'known')!.spell, DWEO);
  });

  test('a line that holds no spell learns the one the player recorded, and the shard takes it', () => {
    const c = character();
    const ref = shardRefs(c).find((r) => r.item.id === 'st-shard')!;
    const patch = chargeShardOnLine(ref, 'blank', FIREBALL)(c);
    const charged = patch.stowedItems!.find((i) => i.id === 'st-shard')!;
    assert.deepEqual(charged.shard, { castsLeft: 2, castsPerCharge: 2, spell: FIREBALL, leyLineId: 'blank' });
    assert.deepEqual(patch.mapData!.leyLines!.find((l) => l.id === 'blank')!.spell, FIREBALL);
    // The other line is untouched.
    assert.equal(patch.mapData!.leyLines!.find((l) => l.id === 'known')!.spell!.name, 'Dweomerlight');
  });

  test('a stowed shard is charged where it is, not moved to the equipped list', () => {
    const c = character();
    const ref = shardRefs(c).find((r) => r.item.id === 'st-shard')!;
    const patch = chargeShardOnLine(ref, 'known', FIREBALL)(c);
    assert.equal(patch.equippedItems, undefined, 'the equipped list is not rewritten');
    assert.equal(patch.stowedItems!.find((i) => i.id === 'st-shard')!.shard!.castsLeft, 2);
  });

  test('only the charged shard and its line change', () => {
    const c = character();
    const ref = shardRefs(c).find((r) => r.item.id === 'st-shard')!;
    const patch = chargeShardOnLine(ref, 'blank', FIREBALL)(c);
    assert.deepEqual(patch.stowedItems![0], c.stowedItems[0], 'the rope is left alone');
    assert.equal(patch.stowedItems!.length, c.stowedItems.length);
    assert.equal(patch.equippedItems, undefined);
    assert.equal(patch.mapData!.leyLines!.length, 2);
    assert.equal(patch.mapData!.pois.length, 0);
  });

  test('a line deleted under the click changes nothing', () => {
    const c = character();
    const ref = shardRefs(c).find((r) => r.item.id === 'eq-shard')!;
    assert.deepEqual(chargeShardOnLine(ref, 'gone', FIREBALL)(c), {});
  });

  test('a shard deleted under the click changes nothing', () => {
    const c = character();
    const ref = shardRefs(c).find((r) => r.item.id === 'eq-shard')!;
    const without = { ...c, equippedItems: c.equippedItems.filter((i) => i.id !== 'eq-shard') };
    assert.deepEqual(chargeShardOnLine(ref, 'known', FIREBALL)(without), {});
  });

  test('a shard saved without its state is charged as a fresh one', () => {
    const c: Character = { ...character(), equippedItems: [shardItem({ id: 'bare', shard: undefined })] };
    const ref = shardRefs(c)[0];
    const patch = chargeShardOnLine(ref, 'known', FIREBALL)(c);
    assert.deepEqual(patch.equippedItems![0].shard, {
      castsLeft: 1,
      castsPerCharge: 1,
      spell: DWEO,
      leyLineId: 'known',
    });
  });
});
