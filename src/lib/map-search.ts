// What the map's search box finds in the character's own map data, and in
// what order. Pure, so the box and its tests share one definition.
//
// What's searchable is names, on purpose: a point of interest's name and the
// name of its kind ("tower"), a fairy door's name and its road's, and a path's
// name and its type ("Ancient road"). Hex numbers are not — the toolbar's
// "Go to hex" already reaches any hex by its coordinate.
import { isValidHex } from './hex';
import { DEFAULT_LEY_LINE_TYPE, POI_KIND_NAMES, poiKindOf, withMapLists } from './map-data';
import type { CharacterMapData, HexCoord } from './types';

/** The most results the box lists. Matches beyond it are counted, not listed. */
export const MAP_SEARCH_LIMIT = 8;

/** What a result is: a point of interest, a fairy door, or a path on the map. */
export type MapSearchType = 'poi' | 'door' | 'path';

/** An item's name as the box shows it when it hasn't one. */
const UNNAMED = 'Unnamed';

/** One result: the item found, and where selecting it goes. */
export interface MapSearchHit {
  type: MapSearchType;
  /** The item's id in the character's map data. */
  id: string;
  /** Its name — "Lankshorn", or UNNAMED for a nameless item. */
  name: string;
  /** What it is, as the box shows it: its kind's name ("Tower"), "Fairy door", or a path's type ("Ancient road"). */
  kindLabel: string;
  /** The hex selecting it goes to; '' for a path drawn on no hex yet. */
  hex: HexCoord | '';
}

/** An item to search, with the text it's matched on. */
export interface MapSearchEntry {
  hit: MapSearchHit;
  /**
   * The lower-cased text the query is looked for in. The first is the name;
   * the rest say what the item is (a kind, a road's name, a path's type),
   * which a match in ranks below a match in the name.
   */
  fields: readonly string[];
}

/** The result of a search: the matches to list, best first, and how many there were. */
export interface MapSearchResults {
  /** The hits to list: at most the limit, each with a name no other result has. */
  hits: MapSearchHit[];
  /** How many items matched in all, listed or not. */
  total: number;
}

/**
 * How good a match is, best first: 0 the text is the query, 1 it starts with
 * it, 2 it starts one of its words, 3 it's in it, 4 and 5 the same in what the
 * item is — a kind's name, a road's, a path's type.
 */
const RANK = { exact: 0, prefix: 1, word: 2, inName: 3, inWhatItIs: 4, inWhatItIsAtAll: 5 } as const;

/** True if `query` starts a word of `text` (both lower-cased): its start, or after anything but a letter or digit. */
function startsAWord(text: string, query: string): boolean {
  const first = text.indexOf(query);
  if (first === 0) return true;
  for (let at = first; at > 0; at = text.indexOf(query, at + 1)) {
    if (!/[a-z0-9]/.test(text[at - 1])) return true;
  }
  return false;
}

/** How well `query` matches `text` (both lower-cased), as one of RANK's levels; null if it isn't in it. */
function rankIn(text: string, query: string): number | null {
  if (text === query) return RANK.exact;
  if (text.startsWith(query)) return RANK.prefix;
  if (startsAWord(text, query)) return RANK.word;
  return text.includes(query) ? RANK.inName : null;
}

/** How well `query` matches what an item is (already lower-cased); null if it isn't in it. */
function rankInWhatItIs(text: string, query: string): number | null {
  const rank = text === '' ? null : rankIn(text, query);
  if (rank === null) return null;
  return rank === RANK.inName ? RANK.inWhatItIsAtAll : RANK.inWhatItIs;
}

/** The best rank of `query` in `entry`; null if the entry doesn't match at all. */
function rankOf(entry: MapSearchEntry, query: string): number | null {
  const [name = '', ...whatItIs] = entry.fields;
  const byName = rankIn(name, query);
  if (byName !== null) return byName;
  let best: number | null = null;
  for (const field of whatItIs) {
    const rank = rankInWhatItIs(field, query);
    if (rank !== null && (best === null || rank < best)) best = rank;
  }
  return best;
}

/** `value` trimmed, or `fallback` if it's blank (or, defensively, not a string). */
function textOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

/** The first hex of `hexes` that's on the map, or '' if there's none: where selecting a path goes. */
function firstHexOn(hexes: readonly HexCoord[] | undefined): HexCoord | '' {
  return hexes?.find(isValidHex) ?? '';
}

/**
 * Every item of `md` the box can find, ready to search: its points of interest,
 * fairy doors and paths. A point of interest without a kind is matched on its
 * name alone: "point of interest" would find every plain marker.
 */
export function buildSearchIndex(md: Partial<CharacterMapData> | null | undefined): MapSearchEntry[] {
  const { pois, fairyDoors, leyLines } = withMapLists(md);
  const index: MapSearchEntry[] = [];
  const add = (hit: MapSearchHit, whatItIs: string) => {
    const kind = whatItIs.trim().toLowerCase();
    index.push({ hit, fields: kind === '' ? [hit.name.toLowerCase()] : [hit.name.toLowerCase(), kind] });
  };

  for (const poi of pois) {
    const kind = poiKindOf(poi);
    add(
      {
        type: 'poi',
        id: poi.id,
        name: textOr(poi.name, UNNAMED),
        kindLabel: POI_KIND_NAMES[kind],
        hex: isValidHex(poi.hex) ? poi.hex : '',
      },
      kind === 'other' ? '' : POI_KIND_NAMES[kind],
    );
  }
  for (const door of fairyDoors) {
    add(
      { type: 'door', id: door.id, name: textOr(door.name, UNNAMED), kindLabel: 'Fairy door', hex: isValidHex(door.hex) ? door.hex : '' },
      door.destination.kind === 'roaded' ? door.destination.roadName : '',
    );
  }
  for (const path of leyLines) {
    const type = textOr(path.type, DEFAULT_LEY_LINE_TYPE);
    add({ type: 'path', id: path.id, name: textOr(path.name, UNNAMED), kindLabel: type, hex: firstHexOn(path.hexes) }, type);
  }
  return index;
}

/** A match on its way to being sorted. */
interface Match {
  hit: MapSearchHit;
  rank: number;
}

/** Text order, for names that rank the same. */
const byText = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' });

/** Best match first: by rank, then by name, then by where the item is, so that the order never wobbles. */
function compareMatches(a: Match, b: Match): number {
  return (
    a.rank - b.rank ||
    byText(a.hit.name, b.hit.name) ||
    byText(a.hit.hex, b.hit.hex) ||
    byText(a.hit.kindLabel, b.hit.kindLabel) ||
    byText(a.hit.type, b.hit.type) ||
    byText(a.hit.id, b.hit.id)
  );
}

/**
 * The matches with a name each: two items of the same kind, with the same name,
 * on the same hex (which one search can find) get " (2)", " (3)"… after the
 * first, so that no two results are announced the same way.
 */
function withUniqueNames(hits: readonly MapSearchHit[]): MapSearchHit[] {
  const seen = new Map<string, number>();
  return hits.map((hit) => {
    const key = [hit.kindLabel, hit.name, hit.hex].join('\u0000');
    const nth = (seen.get(key) ?? 0) + 1;
    seen.set(key, nth);
    return nth === 1 ? hit : { ...hit, name: `${hit.name} (${nth})` };
  });
}

/**
 * The items of `index` that `query` matches, best first, at most `limit` of
 * them. A blank query (or spaces) matches nothing. A query is looked for
 * anywhere in a name or in what an item is, whatever its case: "tower" finds
 * "Watchtower", the kind "Tower" and the type "Tower of stone" alike.
 */
export function searchMap(index: readonly MapSearchEntry[], query: string, limit = MAP_SEARCH_LIMIT): MapSearchResults {
  const wanted = query.trim().toLowerCase();
  if (wanted === '') return { hits: [], total: 0 };
  const matched: Match[] = [];
  for (const entry of index) {
    const rank = rankOf(entry, wanted);
    if (rank !== null) matched.push({ hit: entry.hit, rank });
  }
  matched.sort(compareMatches);
  const listed = limit > 0 ? matched.slice(0, limit) : [];
  return { hits: withUniqueNames(listed.map((m) => m.hit)), total: matched.length };
}
