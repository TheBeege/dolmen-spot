// Tests for the fairy-door pairing rules in map-data.ts, naming the place on
// a hex, and the kinds of POIs and paths. Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POI_KINDS,
  POI_KIND_LABELS,
  POI_KIND_NAMES,
  deleteFairyDoor,
  getPlaceNameOn,
  isPathKind,
  isPoiKind,
  isValidDestination,
  pairableDoors,
  partnerUpdates,
  pathKindFromType,
  poiKindOf,
  poiLabel,
  upsertFairyDoor,
  withMapLists,
  withPoiKind,
} from './map-data';
import type { FairyDoor, FairyDoorDestination, MapPOI, PoiKind } from './types';

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

describe('withMapLists', () => {
  test('fills in missing lists and keeps everything else', () => {
    const pois = [{ id: 'p', hex: '0303', name: 'P', notes: '' }];
    const draft = { name: '', type: '', color: '#c4a35a', notes: '', hexes: [], kind: 'leyLine' as const };
    const md = withMapLists({ pois, draftLeyLine: draft });
    assert.deepEqual(md, { pois, fairyDoors: [], leyLines: [], draftLeyLine: draft });
    assert.equal(md.pois, pois, 'an existing list is kept as it is');
    assert.deepEqual(withMapLists(undefined), { pois: [], fairyDoors: [], leyLines: [] });
  });
});

describe('getPlaceNameOn', () => {
  const poi = (hex: string, name: string) => ({ id: `${hex}-${name}`, hex, name, notes: '' });
  const named = (hex: string, name: string): FairyDoor => ({ ...door(`${hex}-${name}`), hex, name });
  const md = {
    pois: [poi('0606', ' '), poi('0606', ' Old Mill '), poi('0707', 'Inn')],
    fairyDoors: [named('0606', 'Oak Door'), named('0303', 'Stone Door')],
    leyLines: [],
  };
  test('the first named point of interest on the hex, else its first named fairy door', () => {
    assert.equal(getPlaceNameOn(md, '0606'), 'Old Mill');
    assert.equal(getPlaceNameOn(md, '0303'), 'Stone Door');
  });
  test('nothing for a hex with nothing named on it, no hex, or no map data', () => {
    assert.equal(getPlaceNameOn(md, '1106'), '');
    assert.equal(getPlaceNameOn(md, ''), '');
    assert.equal(getPlaceNameOn(undefined, '0606'), '');
  });
});

describe('kinds of points of interest and paths', () => {
  test('there are 15 POI kinds, "other" among them; nothing else is one', () => {
    assert.equal(Object.keys(POI_KIND_LABELS).length, 15);
    assert.ok(Object.keys(POI_KIND_LABELS).every(isPoiKind) && isPoiKind('other'));
    for (const v of ['castle', 'Town', '', 'constructor', '__proto__', 'toString', 3, null, undefined, {}]) {
      assert.equal(isPoiKind(v), false, String(v));
    }
  });

  test('a path is a ley line or another path, nothing else', () => {
    assert.ok(isPathKind('leyLine') && isPathKind('other'));
    for (const v of ['ley line', 'LeyLine', 'road', '', null, 1]) assert.equal(isPathKind(v), false, String(v));
  });

  test('a type that names a ley line, or a blank one (shown as "Ley line"), makes a ley line', () => {
    const leyLines = ['Ley line', 'Leyline', 'ley-line', 'LEY LINES', 'Ley', 'The Leys', 'Drune ley line (dormant)', '', '   '];
    assert.deepEqual(leyLines.map(pathKindFromType), leyLines.map(() => 'leyLine'));
  });

  test('any other type makes another path, even with "ley" inside a word', () => {
    const others = ['Ancient Road', 'Ward', 'Fairy road', 'Valley road', 'Leyton road', 'Parsley path', 'Old road', '3'];
    assert.deepEqual(others.map(pathKindFromType), others.map(() => 'other'));
  });
});

describe("a point of interest's kind", () => {
  const poi = (patch: Partial<MapPOI> = {}): MapPOI => ({ id: 'p1', hex: '0606', name: 'Hoarblight Keep', notes: 'Cold.', ...patch });

  test('all 15 kinds are offered, each once, towns first and "other" last', () => {
    assert.equal(POI_KINDS.length, 15);
    assert.equal(new Set(POI_KINDS).size, 15);
    assert.ok(POI_KINDS.every(isPoiKind));
    assert.equal(POI_KINDS[0], 'town');
    assert.equal(POI_KINDS.at(-1), 'other');
  });

  test('every kind has a name for its marker', () => {
    assert.deepEqual(Object.keys(POI_KIND_NAMES).sort(), [...POI_KINDS].sort());
    for (const k of POI_KINDS) assert.ok(POI_KIND_NAMES[k].trim() !== '', k);
  });

  test("a point of interest without a kind, or one that isn't a kind, is 'other'", () => {
    assert.equal(poiKindOf(poi()), 'other');
    assert.equal(poiKindOf(poi({ kind: 'tower' })), 'tower');
    assert.equal(poiKindOf(poi({ kind: 'castle' as PoiKind })), 'other');
    assert.equal(poiKindOf(poi({ kind: '__proto__' as PoiKind })), 'other');
  });

  test("its marker's label names its kind, then it", () => {
    assert.equal(poiLabel(poi({ kind: 'tower' })), 'Tower: Hoarblight Keep');
    assert.equal(poiLabel(poi({ kind: 'stones', name: 'The Weeping Stones' })), 'Standing stones: The Weeping Stones');
    assert.equal(poiLabel(poi()), 'Point of interest: Hoarblight Keep');
    assert.equal(poiLabel(poi({ kind: 'inn', name: '' })), 'Inn: Unnamed');
  });

  test('choosing a kind sets it; choosing "other" removes the field', () => {
    const tower = withPoiKind(poi(), 'tower');
    assert.deepEqual(tower, { ...poi(), kind: 'tower' });
    assert.deepEqual(withPoiKind(tower, 'inn'), { ...poi(), kind: 'inn' });
    const other = withPoiKind(tower, 'other');
    assert.deepEqual(other, poi());
    assert.equal(Object.hasOwn(other, 'kind'), false, 'no kind key, not kind: undefined');
    assert.equal(Object.hasOwn(withPoiKind(poi(), 'other'), 'kind'), false);
  });

  test('choosing a kind keeps the rest of the point of interest, and leaves the original alone', () => {
    const original = { ...poi({ kind: 'cave' }), extra: 'kept' } as MapPOI;
    const changed = withPoiKind(original, 'lair');
    assert.deepEqual(changed, { ...original, kind: 'lair' });
    assert.equal(original.kind, 'cave');
  });
});
