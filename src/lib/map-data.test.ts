// Tests for the fairy-door pairing rules in map-data.ts. Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteFairyDoor, isValidDestination, pairableDoors, partnerUpdates, upsertFairyDoor } from './map-data';
import type { FairyDoor, FairyDoorDestination } from './types';

const wild: FairyDoorDestination = { kind: 'wild' };
const road = (to: string, roadName = 'R'): FairyDoorDestination => ({ kind: 'roaded', pairedDoorId: to, roadName });
const door = (id: string, destination: FairyDoorDestination = wild): FairyDoor =>
  ({ id, hex: '0303', name: id, notes: '', destination });
const ids = (doors: readonly FairyDoor[]) => doors.map((d) => d.id).sort().join(',');
const destOf = (doors: readonly FairyDoor[], id: string) => JSON.stringify(doors.find((d) => d.id === id)?.destination);
/** Every roaded door's partner exists and points back. */
const symmetric = (doors: readonly FairyDoor[]) => doors.every((d) => {
  if (d.destination.kind !== 'roaded') return true;
  const p = doors.find((x) => x.id === (d.destination as { pairedDoorId: string }).pairedDoorId);
  return p !== undefined && p.destination.kind === 'roaded' && p.destination.pairedDoorId === d.id;
});

describe('pairableDoors', () => {
  const doors = [door('A'), door('B', road('C')), door('C', road('B')), door('D', road('gone')), door('E')];
  test('a new door can pair with unclaimed wild doors and doors whose partner is gone', () => {
    assert.equal(ids(pairableDoors(doors, null)), 'A,D,E');
  });
  test('a door never pairs with itself', () => {
    assert.ok(!pairableDoors(doors, 'A').some((d) => d.id === 'A'));
  });
  test('a door can keep (or re-pick) its own partner', () => {
    assert.equal(ids(pairableDoors(doors, 'B')), 'A,C,D,E');
  });
  const claimed = [door('W'), door('X', road('W'))];
  test('a wild door another door points at is only pairable by that door', () => {
    assert.ok(ids(pairableDoors(claimed, null)) === '' && ids(pairableDoors(claimed, 'X')) === 'W');
  });
});

describe('partnerUpdates', () => {
  const doors = [door('S'), door('P'), door('Q', road('R')), door('R', road('Q'))];
  test('wild → roaded(P): P points back at self', () => {
    assert.equal(
      JSON.stringify(partnerUpdates('S', wild, road('P', 'Silver'), doors)),
      JSON.stringify([{ ...door('P'), destination: road('S', 'Silver') }]),
    );
  });
  test('pairing with a door that was paired elsewhere frees its old partner', () => {
    const swap = partnerUpdates('S', wild, road('Q', 'Moon'), doors);
    assert.ok(destOf(swap, 'R') === JSON.stringify(wild) && destOf(swap, 'Q') === JSON.stringify(road('S', 'Moon')));
  });
  const linked = [door('S', road('P')), door('P', road('S'))];
  test('roaded(P) → wild: P goes wild', () => {
    assert.equal(destOf(partnerUpdates('S', road('P'), wild, linked), 'P'), JSON.stringify(wild));
  });
  test('roaded(P) → roaded(T): P goes wild, T points back', () => {
    const moved = partnerUpdates('S', road('P'), road('T'), [...linked, door('T')]);
    assert.ok(destOf(moved, 'P') === JSON.stringify(wild) && destOf(moved, 'T') === JSON.stringify(road('S')));
  });
  test('self is never in the updates', () => {
    assert.ok(!partnerUpdates('S', wild, road('P'), doors).some((d) => d.id === 'S'));
  });
});

describe('upsertFairyDoor', () => {
  const doors = [door('A'), door('B', road('C')), door('C', road('B'))];
  const added = upsertFairyDoor(doors, door('N', road('A', 'Silver')));
  test('adding a roaded door links both ends', () => {
    assert.ok(destOf(added, 'A') === JSON.stringify(road('N', 'Silver')) && symmetric(added));
  });
  test('a partner that is no longer pairable is refused: the new door is saved wild', () => {
    const stolen = upsertFairyDoor(doors, door('N', road('B')));
    assert.ok(destOf(stolen, 'N') === JSON.stringify(wild) && destOf(stolen, 'B') === JSON.stringify(road('C')) && symmetric(stolen));
  });
  test('a partner deleted before saving is refused (no road to a missing door)', () => {
    const deletedPartner = upsertFairyDoor(deleteFairyDoor(doors, 'A'), door('N', road('A')));
    assert.ok(destOf(deletedPartner, 'N') === JSON.stringify(wild) && symmetric(deletedPartner));
  });
  test('re-pointing an existing door is refused if the target is taken, keeping the old road', () => {
    const repointed = upsertFairyDoor(added, { ...door('N'), destination: road('C', 'Moon') });
    assert.ok(destOf(repointed, 'N') === JSON.stringify(road('A', 'Silver')) && symmetric(repointed));
  });
  test('saving an unchanged destination leaves the pair alone', () => {
    const renamed = upsertFairyDoor(added, { ...added.find((d) => d.id === 'N')!, name: 'Renamed' });
    assert.ok(destOf(renamed, 'A') === JSON.stringify(road('N', 'Silver')) && renamed.find((d) => d.id === 'N')!.name === 'Renamed');
  });
});

describe('deleteFairyDoor and isValidDestination', () => {
  const doors = [door('A', road('B')), door('B', road('A')), door('C')];
  const after = deleteFairyDoor(doors, 'A');
  test('deleting a door removes it and sends its partner wild', () => {
    assert.ok(ids(after) === 'B,C' && destOf(after, 'B') === JSON.stringify(wild));
  });
  test('wild is always valid; a road needs a pairable partner', () => {
    assert.ok(isValidDestination(doors, 'C', wild) && !isValidDestination(doors, 'C', road('A')) && isValidDestination(after, 'C', road('B')));
  });
});
