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
 * casts would be no charge at all. The casts left come down with it, so a
 * shard never shows more left than a charge gives: lowering what a charge
 * gives is not a way to keep casts the player has already spent a charge on.
 * (Loading still tolerates more left than a charge gives, for a save written
 * before this clamped and for one written by a newer release.)
 */
export function withCastsPerCharge(shard: ShardState, value: number): ShardState {
  const castsPerCharge = Math.max(1, Math.floor(value) || 1);
  return {
    ...shard,
    castsPerCharge,
    castsLeft: Math.min(shard.castsLeft, castsPerCharge),
  };
}

/**
 * The shard recharged on the ley line `leyLineId`: a full charge of casts, the
 * line it was charged on, and `spell`, the spell that line holds.
 *
 * The spell is resolved by the caller, not here. The line's spell is the
 * shard's and the shard's is the line's — a line learns its spell by charging
 * a shard on it (types.ts, LeyLine.spell) — so a charge always sets a spell:
 * the line's if it has one, and otherwise the one the player recorded for it
 * first (see `chargeShardOnLine`).
 */
export function chargeShard(shard: ShardState, leyLineId: string, spell: SpellbookEntry): ShardState {
  return {
    ...shard,
    spell,
    castsLeft: Math.max(1, Math.floor(shard.castsPerCharge) || 1),
    leyLineId,
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

/** A shard in the character's inventory: which list it's in, the item, and what to call it. */
export interface ShardRef {
  equipped: boolean;
  item: InventoryItem;
  /** The item's name, or "Dwemer shard" when it has none; two that share one say which they are. */
  label: string;
}

/** Every Dwemer shard the character carries, equipped ones first, in order. */
export function shardRefs(character: Character): ShardRef[] {
  const inList = (equipped: boolean) =>
    (items: InventoryItem[] | undefined): { equipped: boolean; item: InventoryItem; name: string }[] =>
      (items ?? [])
        .filter((item) => item.kind === 'shard')
        .map((item) => ({ equipped, item, name: item.name.trim() || 'Dwemer shard' }));
  const refs = [...inList(true)(character.equippedItems), ...inList(false)(character.stowedItems)];
  // A label reads alone ("Charge Dwemer shard on The Antler Line"), so two
  // shards that share a name say which they are.
  const totals = new Map<string, number>();
  for (const ref of refs) totals.set(ref.name, (totals.get(ref.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  return refs.map(({ equipped, item, name }) => {
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return { equipped, item, label: (totals.get(name) ?? 0) > 1 ? `${name} ${n}` : name };
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
    const charged: InventoryItem = {
      ...item,
      shard: chargeShard(item.shard ?? newShardState(), line.id, spell),
    };
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

