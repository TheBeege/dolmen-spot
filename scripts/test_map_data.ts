// Tests for the fairy-door pairing logic in src/lib/map-data.ts. Run with:
//   npm run test:map-data
import {
  deleteFairyDoor,
  isValidDestination,
  pairableDoors,
  partnerUpdates,
  upsertFairyDoor,
} from '../src/lib/map-data.ts';
import type { FairyDoor, FairyDoorDestination } from '../src/lib/types.ts';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function section(name: string): void {
  console.log(`\n${name}`);
}

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

section('pairableDoors');
{
  const doors = [door('A'), door('B', road('C')), door('C', road('B')), door('D', road('gone')), door('E')];
  check('a new door can pair with unclaimed wild doors and doors whose partner is gone', ids(pairableDoors(doors, null)) === 'A,D,E');
  check('a door never pairs with itself', !pairableDoors(doors, 'A').some((d) => d.id === 'A'));
  check('a door can keep (or re-pick) its own partner', ids(pairableDoors(doors, 'B')) === 'A,C,D,E');
  const claimed = [door('W'), door('X', road('W'))];
  check('a wild door another door points at is only pairable by that door',
    ids(pairableDoors(claimed, null)) === '' && ids(pairableDoors(claimed, 'X')) === 'W');
}

section('partnerUpdates');
{
  const doors = [door('S'), door('P'), door('Q', road('R')), door('R', road('Q'))];
  check('wild → roaded(P): P points back at self',
    JSON.stringify(partnerUpdates('S', wild, road('P', 'Silver'), doors)) === JSON.stringify([{ ...door('P'), destination: road('S', 'Silver') }]));
  const swap = partnerUpdates('S', wild, road('Q', 'Moon'), doors);
  check('pairing with a door that was paired elsewhere frees its old partner',
    destOf(swap, 'R') === JSON.stringify(wild) && destOf(swap, 'Q') === JSON.stringify(road('S', 'Moon')));
  const linked = [door('S', road('P')), door('P', road('S'))];
  check('roaded(P) → wild: P goes wild', destOf(partnerUpdates('S', road('P'), wild, linked), 'P') === JSON.stringify(wild));
  const moved = partnerUpdates('S', road('P'), road('T'), [...linked, door('T')]);
  check('roaded(P) → roaded(T): P goes wild, T points back',
    destOf(moved, 'P') === JSON.stringify(wild) && destOf(moved, 'T') === JSON.stringify(road('S')));
  check('self is never in the updates', !partnerUpdates('S', wild, road('P'), doors).some((d) => d.id === 'S'));
}

section('upsertFairyDoor');
{
  const doors = [door('A'), door('B', road('C')), door('C', road('B'))];
  const added = upsertFairyDoor(doors, door('N', road('A', 'Silver')));
  check('adding a roaded door links both ends', destOf(added, 'A') === JSON.stringify(road('N', 'Silver')) && symmetric(added));
  const stolen = upsertFairyDoor(doors, door('N', road('B')));
  check('a partner that is no longer pairable is refused: the new door is saved wild',
    destOf(stolen, 'N') === JSON.stringify(wild) && destOf(stolen, 'B') === JSON.stringify(road('C')) && symmetric(stolen));
  const deletedPartner = upsertFairyDoor(deleteFairyDoor(doors, 'A'), door('N', road('A')));
  check('a partner deleted before saving is refused (no road to a missing door)',
    destOf(deletedPartner, 'N') === JSON.stringify(wild) && symmetric(deletedPartner));
  const repointed = upsertFairyDoor(added, { ...door('N'), destination: road('C', 'Moon') });
  check('re-pointing an existing door is refused if the target is taken, keeping the old road',
    destOf(repointed, 'N') === JSON.stringify(road('A', 'Silver')) && symmetric(repointed));
  const renamed = upsertFairyDoor(added, { ...added.find((d) => d.id === 'N')!, name: 'Renamed' });
  check('saving an unchanged destination leaves the pair alone', destOf(renamed, 'A') === JSON.stringify(road('N', 'Silver')) && renamed.find((d) => d.id === 'N')!.name === 'Renamed');
}

section('deleteFairyDoor and isValidDestination');
{
  const doors = [door('A', road('B')), door('B', road('A')), door('C')];
  const after = deleteFairyDoor(doors, 'A');
  check('deleting a door removes it and sends its partner wild', ids(after) === 'B,C' && destOf(after, 'B') === JSON.stringify(wild));
  check('wild is always valid; a road needs a pairable partner',
    isValidDestination(doors, 'C', wild) && !isValidDestination(doors, 'C', road('A')) && isValidDestination(after, 'C', road('B')));
}

console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
