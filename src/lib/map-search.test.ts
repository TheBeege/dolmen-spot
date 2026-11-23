// Tests for the map's search: what it finds, in what order, and how many it
// lists (map-search.ts). Run with `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP_SEARCH_LIMIT, buildSearchIndex, searchMap } from './map-search';
import type { MapSearchHit } from './map-search';
import type { CharacterMapData, FairyDoor, LeyLine, MapPOI } from './types';

const poi = (id: string, hex: string, name: string, kind?: MapPOI['kind']): MapPOI =>
  (kind === undefined ? { id, hex, name, notes: '' } : { id, hex, name, notes: '', kind });
const door = (id: string, hex: string, name: string, roadName?: string): FairyDoor => ({
  id,
  hex,
  name,
  notes: '',
  destination: roadName === undefined ? { kind: 'wild' } : { kind: 'roaded', pairedDoorId: 'other-end', roadName },
});
const path = (id: string, hexes: string[], name: string, type: string, kind: LeyLine['kind'] = 'leyLine'): LeyLine =>
  ({ id, hexes, name, type, kind, color: '#c4a35a', notes: '' });

const mapOf = (parts: Partial<CharacterMapData>): Partial<CharacterMapData> => parts;

/** Search `md` the way the box does: over every item's index. */
const find = (md: Partial<CharacterMapData>, query: string, limit?: number) =>
  searchMap(buildSearchIndex(md), query, limit);

const names = (results: { hits: MapSearchHit[] }) => results.hits.map((hit) => hit.name);

// A map like the kitchen-sink fixture's, with a keep added and a second town: a
// town, a ring of stones, a tomb, another town, a point of interest with no
// kind, an inn, the castle, three fairy doors (two of them on one fairy road)
// and three paths.
const md = mapOf({
  pois: [
    poi('p1', '1106', 'Lankshorn', 'town'),
    poi('p2', '1107', 'The Weeping Stones', 'stones'),
    poi('p3', '0909', 'Barrow of the Antler King', 'barrow'),
    poi('p4', '1309', 'Prigwort', 'town'),
    poi('p5', '0606', 'Abandoned mill'),
    poi('p6', '1106', 'The Blue Heron', 'inn'),
    poi('p7', '0808', 'Hoarblight Keep', 'keep'),
  ],
  fairyDoors: [
    door('d1', '1007', 'The Thornhole', 'The Silver Way'),
    door('d2', '1404', 'Hollow Oak', 'The Silver Way'),
    door('d3', '0703', 'Mushroom ring'),
  ],
  leyLines: [
    path('l1', ['0909', '1008'], 'The Antler Line', 'Ley line'),
    path('l2', ['0606', '0706'], 'Old Drune Road', 'Ancient road', 'other'),
    path('l3', ['1309'], 'The Whispering Ley', 'Ley line'),
  ],
});

describe('what the search finds', () => {
  test('an empty or blank query finds nothing', () => {
    for (const query of ['', ' ', '\t\n']) {
      assert.deepEqual(find(md, query), { hits: [], total: 0 }, JSON.stringify(query));
    }
  });

  test('a query with no match finds nothing', () => {
    assert.deepEqual(find(md, 'xyzzy'), { hits: [], total: 0 });
    // Not a hex number: the map searches names only.
    assert.deepEqual(find(md, '1106'), { hits: [], total: 0 });
  });

  test('the case of the query or the name makes no difference', () => {
    assert.deepEqual(names(find(md, 'LANKS')) , ['Lankshorn']);
    assert.deepEqual(names(find(md, 'lankshorn')), ['Lankshorn']);
    assert.deepEqual(names(find(md, 'hOLLOW oAK')), ['Hollow Oak']);
  });

  test('part of a word matches', () => {
    assert.deepEqual(names(find(md, 'lank')), ['Lankshorn'], 'a name starts with it');
    assert.deepEqual(names(find(md, 'nksh')), ['Lankshorn'], 'in the middle of a word');
    assert.deepEqual(names(find(md, 'blight')), ['Hoarblight Keep'], 'in the middle of a longer name');
    // In the middle of a word, not only at its start: "horn" is in "Thornhole".
    assert.deepEqual(names(find(md, 'horn')), ['Lankshorn', 'The Thornhole']);
  });

  test("a point of interest's kind name finds it", () => {
    // By kind alone: every tower. A name that has the query in it, even in the
    // middle of a word, still ranks above one that matches only by kind.
    const towers = mapOf({ pois: [poi('t1', '0303', 'The Redoubt', 'tower'), poi('t2', '0404', 'Watchtower', 'other')] });
    assert.deepEqual(names(find(towers, 'tower')), ['Watchtower', 'The Redoubt'], 'the name, then the kind');
    // And a kind nobody has finds nothing.
    assert.deepEqual(find(towers, 'grove'), { hits: [], total: 0 });
  });

  test("a plain point of interest isn't matched on the words 'point of interest'", () => {
    assert.deepEqual(find(md, 'point of interest'), { hits: [], total: 0 });
  });

  test("a fairy door is found by its name, and by its road's", () => {
    assert.deepEqual(names(find(md, 'thornhole')), ['The Thornhole']);
    assert.deepEqual(names(find(md, 'silver')), ['Hollow Oak', 'The Thornhole'], 'both ends of the Silver Way');
    assert.deepEqual(names(find(md, 'silver way')), ['Hollow Oak', 'The Thornhole'], 'the road as a whole');
  });

  test('a path is found by its name, and by its type', () => {
    assert.deepEqual(names(find(md, 'antler')), ['Barrow of the Antler King', 'The Antler Line'], 'a place and a path');
    assert.deepEqual(names(find(md, 'ancient')), ['Old Drune Road'], 'by type');
    assert.deepEqual(names(find(md, 'ancient road')), ['Old Drune Road']);
  });

  test('each result says what it is and the hex to go to', () => {
    assert.deepEqual(find(md, 'blue heron').hits, [
      { type: 'poi', id: 'p6', name: 'The Blue Heron', kindLabel: 'Inn', hex: '1106' },
    ]);
    assert.deepEqual(find(md, 'silver').hits[0], { type: 'door', id: 'd2', name: 'Hollow Oak', kindLabel: 'Fairy door', hex: '1404' });
    assert.deepEqual(find(md, 'ancient').hits[0], { type: 'path', id: 'l2', name: 'Old Drune Road', kindLabel: 'Ancient road', hex: '0606' });
    assert.deepEqual(find(md, 'weeping').hits[0].kindLabel, 'Standing stones');
    assert.deepEqual(find(md, 'abandoned').hits[0].kindLabel, 'Point of interest');
  });

  test('a nameless item is listed as Unnamed, and can be found as such', () => {
    const unnamed = mapOf({ pois: [poi('u1', '0303', '', 'cave'), poi('u2', '0304', 'Named', 'cave')] });
    assert.deepEqual(names(find(unnamed, 'cave')), ['Named', 'Unnamed']);
    assert.deepEqual(names(find(unnamed, 'unnamed')), ['Unnamed']);
  });

  test('a path drawn on no hex yet is still found, with no hex to go to', () => {
    const bare = mapOf({ leyLines: [path('b1', [], 'Unplotted Ley', 'Ley line')] });
    assert.deepEqual(find(bare, 'unplotted').hits, [{ type: 'path', id: 'b1', name: 'Unplotted Ley', kindLabel: 'Ley line', hex: '' }]);
  });

  test('a path goes to its first hex that is on the map', () => {
    // A save can hold a hex the manifest doesn't have (the map changed under
    // it): the first one that is on the map is the one to go to.
    const odd = mapOf({ leyLines: [path('b3', ['9999', '', '1106', '0909'], 'Odd Road', 'Ancient road', 'other')] });
    assert.deepEqual(find(odd, 'odd road').hits[0].hex, '1106');
    const none = mapOf({ leyLines: [path('b4', ['9999'], 'Lost Road', 'Ancient road', 'other')] });
    assert.deepEqual(find(none, 'lost road').hits[0].hex, '');
  });

  test('a blank type is searched and shown as a ley line', () => {
    const blank = mapOf({ leyLines: [path('b2', ['0303'], 'Nameless Type', '')] });
    assert.deepEqual(find(blank, 'ley line').hits[0].kindLabel, 'Ley line');
    assert.deepEqual(names(find(blank, 'ley')), ['Nameless Type']);
  });

  test('missing map data finds nothing rather than throwing', () => {
    for (const none of [undefined, null, {}]) {
      assert.deepEqual(searchMap(buildSearchIndex(none), 'tower'), { hits: [], total: 0 });
    }
  });
});

describe('the order of the results', () => {
  const towers = mapOf({
    pois: [
      poi('a', '0303', 'Watchtower', 'other'), // the query is in it, not at a word's start
      poi('b', '0304', 'Tower of the Moon', 'other'), // starts with it
      poi('c', '0305', 'Tower', 'other'), // is it
      poi('d', '0306', 'The Old Tower', 'other'), // starts one of its words
      poi('e', '0307', 'The Redoubt', 'tower'), // by kind alone
      poi('f', '0308', 'A Ruin', 'ruin'), // no match
    ],
  });

  test('a name matches before a kind, and a word before part of one', () => {
    assert.deepEqual(names(find(towers, 'tower')), ['Tower', 'Tower of the Moon', 'The Old Tower', 'Watchtower', 'The Redoubt']);
  });

  test('names that rank the same come in alphabetical order, whatever the map order', () => {
    const same = mapOf({ pois: [poi('z', '0303', 'Zebra Camp', 'camp'), poi('a', '0304', 'Antler Camp', 'camp')] });
    assert.deepEqual(names(find(same, 'camp')), ['Antler Camp', 'Zebra Camp']);
    const reversed = mapOf({ pois: [poi('a', '0304', 'Antler Camp', 'camp'), poi('z', '0303', 'Zebra Camp', 'camp')] });
    assert.deepEqual(names(find(reversed, 'camp')), ['Antler Camp', 'Zebra Camp']);
  });

  test('the same name on two hexes comes in hex order', () => {
    const twins = mapOf({ pois: [poi('late', '1201', 'Waystone', 'stones'), poi('early', '0501', 'Waystone', 'stones')] });
    assert.deepEqual(find(twins, 'waystone').hits.map((hit) => hit.hex), ['0501', '1201']);
  });

  test('a query of several words is one phrase, not several', () => {
    // "the silver" is in neither door's name on its own...
    assert.deepEqual(find(md, 'the hollow').hits.map((hit) => hit.name), [], 'not across a name and its road');
    assert.deepEqual(names(find(md, 'the antler line')), ['The Antler Line']);
  });
});

describe('the cap', () => {
  const many = mapOf({ pois: Array.from({ length: 12 }, (_, i) => poi(`p${i}`, `010${i % 9}`, `Camp ${i}`, 'camp')) });

  test('it lists the limit and counts the rest', () => {
    const results = find(many, 'camp');
    assert.equal(results.hits.length, MAP_SEARCH_LIMIT);
    assert.equal(results.total, 12);
  });

  test('a limit of its own is respected', () => {
    const results = find(many, 'camp', 3);
    assert.deepEqual(names(results), ['Camp 0', 'Camp 1', 'Camp 10'], 'the first three, best first');
    assert.equal(results.total, 12);
  });

  test('fewer matches than the cap are all listed', () => {
    const results = find(many, 'camp 11');
    assert.deepEqual(names(results), ['Camp 11']);
    assert.equal(results.total, 1);
  });

  test('the limit can be switched off', () => {
    assert.equal(find(many, 'camp', 0).total, 12);
    assert.equal(find(many, 'camp', 0).hits.length, 0);
  });
});

describe('names the search makes its own', () => {
  test('two items alike are told apart, so no two results read the same', () => {
    const twins = mapOf({ pois: [poi('a', '0303', 'Waystone', 'stones'), poi('b', '0303', 'Waystone', 'stones')] });
    const results = find(twins, 'waystone');
    assert.deepEqual(names(results), ['Waystone', 'Waystone (2)']);
    assert.equal(new Set(results.hits.map((hit) => `${hit.name} ${hit.kindLabel} ${hit.hex}`)).size, 2);
  });

  test('items that only look alike are left alone', () => {
    const pair = mapOf({
      pois: [poi('a', '0303', 'Waystone', 'stones'), poi('b', '0304', 'Waystone', 'stones')],
    });
    assert.deepEqual(names(find(pair, 'waystone')), ['Waystone', 'Waystone']);
  });

  test('a number a real name already has is skipped, so no two results read alike', () => {
    // Three places called Waystone on one hex, and one really called
    // "Waystone (2)": the duplicates must not take that name.
    const crowd = mapOf({
      pois: [
        poi('a', '0303', 'Waystone', 'stones'),
        poi('b', '0303', 'Waystone', 'stones'),
        poi('c', '0303', 'Waystone', 'stones'),
        poi('d', '0303', 'Waystone (2)', 'stones'),
      ],
    });
    const results = find(crowd, 'waystone');
    assert.deepEqual(names(results), ['Waystone', 'Waystone (3)', 'Waystone (4)', 'Waystone (2)']);
    assert.equal(new Set(results.hits.map((hit) => `${hit.kindLabel} ${hit.name} ${hit.hex}`)).size, 4);
  });

  test('names that differ only in case keep a fixed order', () => {
    // The matcher folds case and so does the sort, so these two are left to the
    // hex they're on, in either map order — no locale can reorder them.
    const cases = mapOf({ pois: [poi('b', '0304', 'antler camp', 'camp'), poi('a', '0303', 'Antler camp', 'camp')] });
    assert.deepEqual(find(cases, 'camp').hits.map((hit) => hit.hex), ['0303', '0304']);
  });
});

describe('the index', () => {
  test('it holds every item once, in the map data order', () => {
    const index = buildSearchIndex(md);
    assert.equal(index.length, 7 + 3 + 3);
    assert.deepEqual(index.slice(0, 2).map((entry) => entry.hit.id), ['p1', 'p2']);
    assert.deepEqual(index.slice(-1).map((entry) => entry.hit.id), ['l3']);
  });

  test('a field is lower-cased and blank ones are left out', () => {
    const index = buildSearchIndex(md);
    const plain = index.find((entry) => entry.hit.id === 'p5')!;
    assert.deepEqual(plain.fields, ['abandoned mill'], 'a point of interest without a kind');
    const roaded = index.find((entry) => entry.hit.id === 'd1')!;
    assert.deepEqual(roaded.fields, ['the thornhole', 'the silver way']);
    const wild = index.find((entry) => entry.hit.id === 'd3')!;
    assert.deepEqual(wild.fields, ['mushroom ring'], 'a wild door has no road to match');
  });
});
