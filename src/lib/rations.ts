// Rations as inventory items, and when they spoil.
//
// A day's rations is one inventory item of kind 'ration' (InventoryItem.ration):
// fresh or preserved, and stamped with the lived day it was acquired on. It's a
// general item, so it takes 1 slot and weighs 20 coins (a preserved day also
// costs 2 gp rather than 1). Because it's an ordinary item, calculateEncumbrance
// (character-sheet.ts) counts it without being told about rations at all.
//
// Spoilage (Player's Book p117, p163) is measured on the character's lived-time
// clock rather than Dolmenwood's calendar, so days spent in Fairy count as days
// the food was carried, and a corrected Fairy return date can't make food
// suddenly spoil or come back: src/lib/livedTime.ts explains the clock.
//
//   fresh rations      keep 1 week     or 1 day in dank conditions
//   preserved rations  keep 2 months   or 1 week in dank conditions
//
// The sheet warns about a ration that has spoiled; it never deletes one. The
// player decides whether the food is eaten, thrown away or kept, as at a table.

import { RATIONS, RATION_FRESHNESS } from './gamedata';
import { pluralize } from './grammar';
import { getLivedDays } from './livedTime';
import { newId } from './ids';
import type { Character, InventoryItem, RationFreshness } from './types';

/** The item fields the rules fix for a ration: its name, slots and weight. */
export function rationItemFields(freshness: RationFreshness): Pick<InventoryItem, 'name' | 'slots' | 'weight'> {
  const { name, slots, weight } = RATIONS[freshness];
  return { name, slots, weight };
}

/**
 * A day's rations, acquired on `acquiredLivedDay` (the lived day the character
 * got it, which spoilage counts from). `id` is passed in by callers whose
 * updater must stay pure (useCharacter's), so two calls give the same item.
 */
export function createRationItem(
  freshness: RationFreshness,
  acquiredLivedDay: number,
  id: string = newId(),
): InventoryItem {
  return {
    id,
    ...rationItemFields(freshness),
    notes: '',
    equipped: false,
    kind: 'ration',
    ration: { freshness, acquiredLivedDay: wholeDay(acquiredLivedDay) },
  };
}

// A lived day as a whole number no less than 0.
function wholeDay(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** Whether an item is a ration: of kind 'ration' and with a state to read. */
export function isRationItem(item: InventoryItem): boolean {
  return item.kind === 'ration' && item.ration != null;
}

/**
 * Every ration the character carries, equipped first, then stowed, each in the
 * order it's stored (the Inventory groups the stowed ones by container when it
 * shows them). A character loaded from a save may hold items that aren't well
 * formed, so this only reads what it checks.
 */
export function getRationItems(character: Pick<Character, 'equippedItems' | 'stowedItems'>): InventoryItem[] {
  const equipped = Array.isArray(character.equippedItems) ? character.equippedItems : [];
  const stowed = Array.isArray(character.stowedItems) ? character.stowedItems : [];
  return [...equipped, ...stowed].filter((item) => item != null && isRationItem(item));
}

/** How many rations of each kind the character carries. */
export function countRations(
  items: readonly InventoryItem[],
): Record<RationFreshness, number> {
  const count: Record<RationFreshness, number> = { fresh: 0, preserved: 0 };
  for (const item of items) {
    const state = item.ration?.freshness;
    if (state === 'fresh' || state === 'preserved') count[state] += 1;
  }
  return count;
}

/** The slots the rations take, which is what the encumbrance totals add up. */
export function rationSlots(items: readonly InventoryItem[]): number {
  return items.reduce((sum, item) => sum + (typeof item.slots === 'number' ? item.slots : 0), 0);
}

/** The weight of the rations, in coins (10 coins = 1 pound). */
export function rationWeight(items: readonly InventoryItem[]): number {
  return items.reduce((sum, item) => sum + (typeof item.weight === 'number' ? item.weight : 0), 0);
}

export interface RationSpoilage {
  freshness: RationFreshness;
  /** How long it keeps under the conditions that apply, in days (1 week, 2 months, or the dank figures). */
  keepsDays: number;
  /** The conditions the length is for. */
  dank: boolean;
  /** Whole days since it was acquired: 0 on the day the character got it. */
  ageDays: number;
  /** Days it still has: 0 or less once it has spoiled. */
  daysLeft: number;
  spoiled: boolean;
  /** Days since it spoiled: 0 when it spoiled today, 0 when it's still edible. */
  spoiledDaysAgo: number;
}

/**
 * How old a ration is and whether it has spoiled, on the lived-day clock.
 *
 * The length comes from the rules: a ration keeps for `keepsDays` whole days
 * after the day it was acquired, so one acquired today (age 0) has its full
 * length left, and one exactly `keepsDays` old is spoiled — a week's rations a
 * week old have spoiled. An acquisition after "today", which a date rewound
 * behind it leaves behind, counts as brand new rather than as a negative age.
 */
export function rationSpoilage(
  freshness: RationFreshness,
  acquiredLivedDay: number,
  todayLivedDay: number,
  dank: boolean,
): RationSpoilage {
  const keepsDays = dank ? RATIONS[freshness].keepsDaysDank : RATIONS[freshness].keepsDays;
  const ageDays = Math.max(0, wholeDay(todayLivedDay) - wholeDay(acquiredLivedDay));
  const daysLeft = keepsDays - ageDays;
  const spoiled = daysLeft <= 0;
  return {
    freshness,
    keepsDays,
    dank,
    ageDays,
    daysLeft: spoiled ? 0 : daysLeft,
    spoiled,
    spoiledDaysAgo: spoiled ? Math.abs(daysLeft) : 0,
  };
}

/** Today on the lived-day clock, which is what spoilage is measured against. */
export function todayLivedDay(character: Pick<Character, 'currentDate' | 'fairyVisits'>): number {
  return wholeDay(getLivedDays(character));
}

/**
 * When this ration spoils, read against the character's own clock and their
 * current storage conditions (Character.dankConditions). Null for an item that
 * isn't a well-formed ration.
 */
export function getRationSpoilage(
  character: Pick<Character, 'currentDate' | 'fairyVisits' | 'dankConditions'>,
  item: InventoryItem,
): RationSpoilage | null {
  const state = item.ration;
  if (!state || (state.freshness !== 'fresh' && state.freshness !== 'preserved')) return null;
  return rationSpoilage(state.freshness, state.acquiredLivedDay, todayLivedDay(character), character.dankConditions === true);
}

/**
 * The ration of this kind that will spoil soonest, which is the one to eat, or
 * null when the character has none of that kind. Two acquired on the same day
 * spoil on the same day, so the first one found wins: the equipped one, and then
 * the one that comes first in the stowed list (see getRationItems).
 */
export function findRationToSpend(
  character: Pick<Character, 'equippedItems' | 'stowedItems'>,
  freshness: RationFreshness,
): InventoryItem | null {
  let soonest: InventoryItem | null = null;
  for (const item of getRationItems(character)) {
    if (item.ration?.freshness !== freshness) continue;
    const older = soonest == null || (item.ration?.acquiredLivedDay ?? 0) < (soonest.ration?.acquiredLivedDay ?? 0);
    if (older) soonest = item;
  }
  return soonest;
}

/**
 * The character's items with one ration of `freshness` taken out: the one that
 * would spoil soonest (see findRationToSpend). Both lists are left alone if the
 * character has none of that kind, so this can't lose an item.
 */
export function removeOneRation(
  equippedItems: InventoryItem[],
  stowedItems: InventoryItem[],
  freshness: RationFreshness,
): { equippedItems: InventoryItem[]; stowedItems: InventoryItem[] } {
  const soonest = findRationToSpend({ equippedItems, stowedItems }, freshness);
  if (!soonest) return { equippedItems, stowedItems };
  return {
    equippedItems: equippedItems.filter((item) => item !== soonest),
    stowedItems: stowedItems.filter((item) => item !== soonest),
  };
}

/** A ration's state as the sheet names it: "Fresh", "Preserved". */
export function rationFreshnessLabel(freshness: RationFreshness): string {
  return freshness === 'fresh' ? 'Fresh' : 'Preserved';
}

/**
 * What the sheet says about a ration's spoilage, in a phrase: "3 days left",
 * "1 day left", "Spoiled today", "Spoiled 2 days ago".
 */
export function describeRationSpoilage(spoilage: RationSpoilage): string {
  if (spoilage.spoiled) {
    const { spoiledDaysAgo } = spoilage;
    if (spoiledDaysAgo === 0) return 'Spoiled today';
    return `Spoiled ${pluralize(spoiledDaysAgo, 'day')} ago`;
  }
  return `${pluralize(spoilage.daysLeft, 'day')} left`;
}

/**
 * How long a ration of this kind keeps, in a phrase: "about 2 months", "1 week",
 * "1 day". The rules give months rather than days, so the two-month figure is
 * named rather than counted out, and it says "about" because the sheet counts it
 * as 60 days: two Dolmenwood months run 56 to 62, so the day countdown beside it
 * can differ from a calendar's by a couple of days. (RATIONS.keepsDays says why.)
 */
export function rationShelfLifeLabel(freshness: RationFreshness, dank: boolean): string {
  if (freshness === 'preserved' && !dank) return 'about 2 months';
  const days = dank ? RATIONS[freshness].keepsDaysDank : RATIONS[freshness].keepsDays;
  // The guard is for a shelf life the rules don't give today: one that isn't a
  // week or a day reads as its count of days.
  return RATION_SHELF_LIFE_LABELS[days] ?? pluralize(days, 'day');
}

const RATION_SHELF_LIFE_LABELS: Partial<Record<number, string>> = { 1: '1 day', 7: '1 week' };

/** How long this ration keeps under the conditions that apply to it. */
export function describeRationShelfLife(spoilage: RationSpoilage): string {
  return rationShelfLifeLabel(spoilage.freshness, spoilage.dank);
}

/**
 * The character's food in a line, for the printed sheet, which prints one row
 * per item and no spoilage: "3 fresh, 2 preserved (1 spoiled)". Null when the
 * character carries none. The kinds come out in the order the sheet offers them,
 * and a kind with none is left out.
 */
export function rationStockSummary(
  character: Pick<Character, 'equippedItems' | 'stowedItems' | 'currentDate' | 'fairyVisits' | 'dankConditions'>,
): string | null {
  const items = getRationItems(character);
  if (items.length === 0) return null;
  const counts = countRations(items);
  const kinds = RATION_FRESHNESS.filter((freshness) => counts[freshness] > 0)
    .map((freshness) => `${counts[freshness]} ${freshness}`)
    .join(', ');
  const spoiled = items.filter((item) => getRationSpoilage(character, item)?.spoiled).length;
  return spoiled > 0 ? `${kinds} (${spoiled} spoiled)` : kinds;
}
