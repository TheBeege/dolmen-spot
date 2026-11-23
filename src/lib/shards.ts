/**
 * A Dwemer shard's state, and the two things a player does with one: spend a
 * cast, and recharge it on a ley line.
 *
 * The shard is a house feature: the Player's Book has no entry for it, so
 * these are the rules the type comments in types.ts state, and nothing more.
 * A shard holds one spell (a reference, not its own copy of the spell), casts
 * it a fixed number of times per charge, and is recharged on a hex of a ley
 * line. A line's own spell is learned by charging a shard on it, so the two
 * are set together (see `chargeShard`).
 *
 * Loading repairs everything here (migrations.ts's `sanitizeShard`), so these
 * helpers may assume whole numbers, but they still clamp: a save written by a
 * newer release, or a stray keystroke, shouldn't be able to make a shard cast
 * below none or charge below one cast.
 */
import type { Character, InventoryItem, LeyLine, ShardState, SpellbookEntry } from './types';
import { withMapLists } from './map-data';

/** What a shard the player has just gained holds: no spell, and no charge on it. */
export function newShardState(): ShardState {
  return { castsLeft: 0, castsPerCharge: 1 };
}

/**
 * The shard with one cast spent. Never below none: a spent shard stays spent
 * until it is charged again on a ley line.
 */
export function spendCast(shard: ShardState): ShardState {
  return { ...shard, castsLeft: Math.max(0, Math.floor(shard.castsLeft) - 1) };
}

/**
 * `castsPerCharge` as a whole number of at least one: a charge that gave no
 * casts would be no charge at all. `castsLeft` is left alone, even where the
 * player lowers this below it: loading tolerates a shard with more casts left
 * than a charge gives, and so does this.
 */
export function withCastsPerCharge(shard: ShardState, value: number): ShardState {
  return { ...shard, castsPerCharge: Math.max(1, Math.floor(value) || 1) };
}

/**
 * The shard recharged on `line`: a full charge of casts, the line it was
 * charged on, and the line's spell.
 *
 * The line's spell is the shard's, and the shard's is the line's: the line
 * learns its spell by charging a shard on it (types.ts, LeyLine.spell). So the
 * spell to use is the line's if it has one, and otherwise the one the caller
 * recorded for the line first (the map asks the player, and saves it on the
 * line, before calling this). A charge on a line that still holds no spell
 * keeps whatever spell the shard last held.
 */
export function chargeShard(shard: ShardState, line: Pick<LeyLine, 'id' | 'spell'>): ShardState {
  const spell = line.spell ?? shard.spell;
  return {
    ...shard,
    ...(spell ? { spell } : {}),
    castsLeft: Math.max(1, Math.floor(shard.castsPerCharge) || 1),
    leyLineId: line.id,
  };
}

/** "2 of 3": the casts left on the current charge, and what a charge gives. */
export function castsLabel(shard: ShardState): string {
  return `${shard.castsLeft} of ${shard.castsPerCharge}`;
}

/**
 * What a shard that points at no ley line the character still has says: its
 * `leyLineId` outlives a line the player deletes, and loading keeps it, so the
 * row says so rather than naming a line that isn't there.
 */
export const SHARD_LINE_DELETED = 'a ley line since deleted';

/**
 * The name of the ley line the shard was last charged on: the line's own name
 * if the character still has it, "a ley line since deleted" if not, and null
 * if the shard has never been charged.
 */
export function shardLeyLineLabel(shard: ShardState, leyLines: readonly LeyLine[]): string | null {
  if (!shard.leyLineId) return null;
  const line = leyLines.find((ll) => ll.id === shard.leyLineId);
  if (!line) return SHARD_LINE_DELETED;
  return line.name.trim() || 'an unnamed ley line';
}

/** A shard in the character's inventory: which list it's in, and the item. */
export interface ShardRef {
  equipped: boolean;
  item: InventoryItem;
  /** What the item is called, for naming controls: its name, or "Dwemer shard". */
  name: string;
  /** `name`, with its place among the shards added if two shards share a name. */
  label: string;
}

/** Every Dwemer shard the character carries, equipped ones first, in order. */
export function shardRefs(character: Character): ShardRef[] {
  const inList = (equipped: boolean) => (items: InventoryItem[] | undefined): ShardRef[] =>
    (items ?? [])
      .filter((item) => item.kind === 'shard')
      .map((item) => ({ equipped, item, name: item.name.trim() || 'Dwemer shard', label: '' }));
  const refs = [...inList(true)(character.equippedItems), ...inList(false)(character.stowedItems)];
  // Two shards can share a name, so a shared one says which it is.
  const totals = new Map<string, number>();
  for (const ref of refs) totals.set(ref.name, (totals.get(ref.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  return refs.map((ref) => {
    if ((totals.get(ref.name) ?? 0) < 2) return { ...ref, label: ref.name };
    const n = (seen.get(ref.name) ?? 0) + 1;
    seen.set(ref.name, n);
    return { ...ref, label: `${ref.name} ${n}` };
  });
}

/**
 * Charging a shard on a ley line, as one write to the character: the shard
 * gets a full charge, the line it was charged on, and the line's spell; and
 * the line, which learns its spell by having a shard charged on it, gets that
 * spell if it has none yet. The two stay in step in a single update.
 *
 * `recordedSpell` is the spell the player says the line holds, when the line
 * holds none. A line that already has one keeps it.
 *
 * Everything is looked up in `prev` rather than taken as given, so a shard or
 * line deleted between the click and the write changes nothing.
 */
export function chargeShardOnLine(
  shard: Pick<ShardRef, 'equipped' | 'item'>,
  lineId: string,
  recordedSpell: SpellbookEntry,
): (prev: Character) => Partial<Character> {
  return (prev) => {
    const map = withMapLists(prev.mapData);
    const line = map.leyLines.find((ll) => ll.id === lineId);
    if (!line) return {};
    const list = shard.equipped ? prev.equippedItems : prev.stowedItems;
    const item = (list ?? []).find((i) => i.id === shard.item.id);
    if (!item) return {};
    const spell = line.spell ?? recordedSpell;
    const charged: InventoryItem = { ...item, shard: chargeShard(item.shard ?? newShardState(), { id: line.id, spell }) };
    const replace = (items: InventoryItem[] | undefined) =>
      (items ?? []).map((i) => (i.id === charged.id ? charged : i));
    return {
      mapData: {
        ...map,
        leyLines: map.leyLines.map((ll) => (ll.id === line.id ? { ...ll, spell } : ll)),
      },
      ...(shard.equipped ? { equippedItems: replace(prev.equippedItems) } : { stowedItems: replace(prev.stowedItems) }),
    };
  };
}

