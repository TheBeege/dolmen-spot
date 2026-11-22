/**
 * Character-sheet values that are derived from a Character rather than stored
 * on it, plus the labels the sheet shows next to them.
 *
 * The tab components and the PDF export (src/lib/pdf/) both read from here, so
 * a printed sheet always shows exactly what the app shows. Each helper was
 * lifted verbatim out of the component that used to compute it inline; the
 * underlying rules tables and formulas stay in gamedata.ts (see AGENTS.md and
 * docs/rules/ before changing any of them).
 */
import type {
  AbilityScores,
  Character,
  CharacterContainer,
  FeatureProfile,
  InventoryItem,
  KnownSpellSource,
  SaveTargets,
  SpellSlot,
  SpellStudyEntry,
} from './types';
import {
  BREGGLE_GAZE_PER_DAY,
  EQUIPPED_SLOT_LIMIT,
  MAX_LOAD_WEIGHT,
  STOWED_SLOT_LIMIT,
  calculateAttackBonus,
  calculateSkillTargets,
  getAbilityModifier,
  getCharacterLanguages,
  getCharacterMagicProfile,
  getCoinSlots,
  getCoinWeight,
  getSpeedBySlots,
  getSpeedByWeight,
  getTotalCoinCount,
  hasUnknownKindredOrClass,
  isKnownClassId,
  isKnownKindredId,
  type MagicSystem,
} from './gamedata';

// ── Labels ───────────────────────────────────────────────────

export const ABILITY_SCORE_INFO: {
  key: keyof AbilityScores;
  label: string;
  abbr: string;
  note: string;
}[] = [
  { key: 'strength', label: 'Strength', abbr: 'STR', note: 'Melee atk/dmg' },
  { key: 'intelligence', label: 'Intelligence', abbr: 'INT', note: 'Languages' },
  { key: 'wisdom', label: 'Wisdom', abbr: 'WIS', note: 'Magic resistance' },
  { key: 'dexterity', label: 'Dexterity', abbr: 'DEX', note: 'AC / missile atk' },
  { key: 'constitution', label: 'Constitution', abbr: 'CON', note: 'HP / level' },
  { key: 'charisma', label: 'Charisma', abbr: 'CHA', note: 'Reactions' },
];

export const SAVE_TARGET_INFO: { key: keyof SaveTargets; label: string }[] = [
  { key: 'doom', label: 'Doom' },
  { key: 'ray', label: 'Ray' },
  { key: 'hold', label: 'Hold' },
  { key: 'blast', label: 'Blast' },
  { key: 'spell', label: 'Spell' },
];

export const KNOWN_SPELL_SOURCE_LABELS: Record<KnownSpellSource, string> = {
  starting: 'Starting',
  studied: 'Studied',
  mentor: 'Mentor',
  research: 'Researched',
  rewrite: 'Rewritten',
  manual: 'Manual',
};

// ── Character ────────────────────────────────────────────────

/**
 * True for a non-human kindred the app knows, with no class: the character
 * plays its kindred-class. A kindred id the app doesn't know (from a newer
 * version, or an edited file) has no kindred-class to play.
 */
export function isKindredClass(character: Pick<Character, 'kindred' | 'class'>): boolean {
  return !character.class && character.kindred !== 'human' && isKnownKindredId(character.kindred);
}

/** True when the sheet has a class, or a non-human kindred playing its kindred-class. */
export function hasClassOrKindredClass(character: Pick<Character, 'kindred' | 'class'>): boolean {
  return !!character.class || isKindredClass(character);
}

export function formatXpPercent(val: number): string {
  return val >= 0 ? `+${val}%` : `${val}%`;
}

// ── Combat ───────────────────────────────────────────────────

/**
 * Attack bonus from the advancement table, or null when there's nothing to
 * look it up from (the Combat tab then offers no "Sync").
 */
export function getCalculatedAttackBonus(character: Pick<Character, 'kindred' | 'class' | 'level'>): number | null {
  const hasAutoCalcData = hasClassOrKindredClass(character) && character.level >= 1;
  return hasAutoCalcData ? calculateAttackBonus(character.kindred, character.class, character.level) : null;
}

// ── Skills ───────────────────────────────────────────────────

export function isSkillOutOfSync(stored: number | undefined, calculated: number | undefined): boolean {
  return stored === undefined || stored !== calculated;
}

/**
 * Which skills the sheet lists: auto-calculated ones (from kindred/class/level)
 * and custom ones the player added, each sorted by key. With a kindred or class
 * the app doesn't know, the calculated targets are only a guess, so none is
 * reported out of sync (and none offered to sync).
 */
export function getSkillTargetLayout(character: Pick<Character, 'kindred' | 'class' | 'level' | 'skillTargets'>) {
  const calculated = calculateSkillTargets(character.kindred, character.class, character.level);
  const autoKeys = Array.from(calculated.autoSkillKeys).sort();
  const customKeys = Object.keys(character.skillTargets)
    .filter(key => !calculated.autoSkillKeys.has(key))
    .sort();
  const outOfSyncKeys = hasUnknownKindredOrClass(character)
    ? []
    : autoKeys.filter(key => isSkillOutOfSync(character.skillTargets[key], calculated.targets[key]));
  return { calculated, autoKeys, customKeys, outOfSyncKeys };
}

// ── Inventory & encumbrance ──────────────────────────────────

export interface Encumbrance {
  coinWeight: number;
  coinSlots: number;
  totalCoinCount: number;
  itemEquippedWeight: number;
  itemStowedWeight: number;
  totalWeight: number;
  totalEquippedSlots: number;
  itemStowedSlots: number;
  totalStowedSlots: number;
  /** Speed from the active encumbrance method (slots or weight). */
  speed: number;
  equippedSlotsOverLimit: boolean;
  stowedSlotsOverLimit: boolean;
  overMaxLoad: boolean;
}

export function calculateEncumbrance(
  character: Pick<Character, 'equippedItems' | 'stowedItems' | 'coins' | 'encumbranceMethod'>,
): Encumbrance {
  const { equippedItems, stowedItems, coins, encumbranceMethod } = character;
  const coinWeight = getCoinWeight(coins);
  const coinSlots = getCoinSlots(coins);
  const totalCoinCount = getTotalCoinCount(coins);

  const itemEquippedWeight = equippedItems.reduce((sum, item) => sum + item.weight, 0);
  const itemStowedWeight = stowedItems.reduce((sum, item) => sum + item.weight, 0);
  const totalWeight = itemEquippedWeight + itemStowedWeight + coinWeight;

  const totalEquippedSlots = equippedItems.reduce((sum, item) => sum + item.slots, 0);
  const itemStowedSlots = stowedItems.reduce((sum, item) => sum + item.slots, 0);
  const totalStowedSlots = itemStowedSlots + coinSlots;

  const speed =
    encumbranceMethod === 'slots'
      ? getSpeedBySlots(totalEquippedSlots, totalStowedSlots)
      : getSpeedByWeight(totalWeight);

  return {
    coinWeight,
    coinSlots,
    totalCoinCount,
    itemEquippedWeight,
    itemStowedWeight,
    totalWeight,
    totalEquippedSlots,
    itemStowedSlots,
    totalStowedSlots,
    speed,
    equippedSlotsOverLimit: totalEquippedSlots > EQUIPPED_SLOT_LIMIT,
    stowedSlotsOverLimit: totalStowedSlots > STOWED_SLOT_LIMIT,
    overMaxLoad: totalWeight > MAX_LOAD_WEIGHT,
  };
}

/**
 * What the sheet says under a Speed of 0 (over the maximum load); null when the
 * character can move. Stowing an item helps only when the equipped slots are
 * over their maximum and there's still room in the stowed slots.
 */
export function getOverloadNote(enc: Encumbrance, method: Character['encumbranceMethod']): string | null {
  if (enc.speed !== 0) return null;
  const stowingHelps = method === 'slots' && enc.equippedSlotsOverLimit && enc.totalStowedSlots < STOWED_SLOT_LIMIT;
  return `Over maximum load: can't move until items are ${stowingHelps ? 'stowed or dropped' : 'dropped'}.`;
}

/** Stowed items in a container, or the loose ones when `containerId` is undefined. */
export function getContainerItems(stowedItems: InventoryItem[], containerId: string | undefined): InventoryItem[] {
  return stowedItems.filter((item) =>
    containerId ? item.containerId === containerId : !item.containerId
  );
}

function getContainerUsedWeight(stowedItems: InventoryItem[], containerId: string): number {
  return stowedItems
    .filter((item) => item.containerId === containerId)
    .reduce((sum, item) => sum + item.weight, 0);
}

/** How full a container is. `container` is null for the loose-items group. */
export function getContainerLoad(container: CharacterContainer | null, stowedItems: InventoryItem[]) {
  const containerId = container?.id;
  const usedWeight = containerId ? getContainerUsedWeight(stowedItems, containerId) : 0;
  const capacity = container?.capacity ?? 0;
  const fillPercent = capacity > 0 ? Math.min(100, (usedWeight / capacity) * 100) : 0;
  const isOverCapacity = capacity > 0 && usedWeight > capacity;
  return { usedWeight, capacity, fillPercent, isOverCapacity };
}

// ── Magic ────────────────────────────────────────────────────

type InventoryHolder = Pick<Character, 'equippedItems' | 'stowedItems'>;

function getAllInventoryItems(c: InventoryHolder): InventoryItem[] {
  return [...c.equippedItems, ...c.stowedItems];
}

export function getSpellbooks(c: InventoryHolder): InventoryItem[] {
  return getAllInventoryItems(c).filter((i) => i.kind === 'spellbook');
}

export function getScrollItems(c: InventoryHolder): InventoryItem[] {
  return getAllInventoryItems(c).filter((i) => i.kind === 'scroll' && !!i.scrollSpell?.name);
}

export function isSpellInAnyBook(c: InventoryHolder, name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return getSpellbooks(c).some((b) =>
    (b.spellbookContents ?? []).some((e) => e.name.trim().toLowerCase() === n),
  );
}

export function isSpellOnScroll(c: InventoryHolder, name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return getScrollItems(c).some((s) => s.scrollSpell?.name.trim().toLowerCase() === n);
}

export function isStartingBookApplied(c: Pick<Character, 'startingSpellBook' | 'equippedItems' | 'stowedItems'>): boolean {
  if (!c.startingSpellBook) return false;
  // Check the stamped flag rather than name-matching the inventory item.
  // This means renaming the in-inventory book won't reopen the starter
  // dropdown and let the player create duplicates.
  return getAllInventoryItems(c).some((i) => i.kind === 'spellbook' && i.isStartingBook);
}

/** Number of prepared spells at each rank, keyed by rank. */
export function countPreparedByRank(spells: SpellSlot[]): Record<number, number> {
  const preparedByRank: Record<number, number> = {};
  for (const spell of spells) {
    if (spell.prepared) {
      preparedByRank[spell.rank] = (preparedByRank[spell.rank] || 0) + 1;
    }
  }
  return preparedByRank;
}

/**
 * Which magic sections the Spells & Magic tab (and the PDF) shows. A character's
 * magic comes from their class, or their kindred-class when they have none; if
 * that id is one the app doesn't know, `unknownNote` says so and no section
 * (and no "no magical abilities") is shown.
 */
export function getMagicSections(character: Pick<Character, 'kindred' | 'class' | 'level'>) {
  const profile = getCharacterMagicProfile(character.kindred, character.class, character.level);
  const unknown = character.class
    ? (isKnownClassId(character.class) ? null : 'class')
    : (character.kindred && !isKnownKindredId(character.kindred) ? 'kindred' : null);
  const has = (system: MagicSystem) => !unknown && profile.systems.includes(system);
  return {
    profile,
    unknownNote: unknown ? `Dolmen Spot doesn't recognise this ${unknown}, so it can't show its magic.` : null,
    hasNoMagic: !unknown && profile.systems.length === 1 && profile.systems[0] === 'none',
    hasSpells: has('arcane') || has('holy'),
    hasGlamours: has('glamours'),
    hasRunes: has('runes'),
    hasKnacks: has('knacks'),
    // Breggle kindred-class arcane magic unlocks at Level 4.
    isBregglesPreMagic: character.kindred === 'breggle' && !character.class && character.level < 4,
  };
}

/**
 * The note on a known spell or a study of a Rank the character can't learn at
 * their Level (see getLearnableSpellRanks). Such an entry has three origins:
 * learned before the app checked learnable Ranks, when it offered every Rank of
 * the class; left above by a Level lowered since; or a spell a Referee granted,
 * which the manual add form records through its "Above your Level (Referee
 * grant)" group.
 */
export function rankAboveLearnableNote(rank: number, level: number): string {
  return `Rank ${rank} is above what you can learn at Level ${level}.`;
}

/**
 * The note on a spell study that would teach a spell of a Rank the character
 * can't learn at their Level, or undefined when it wouldn't. Finishing a study
 * adds the spell (the Level isn't re-checked then: a Level can go down while a
 * study runs), so the player is told before they finish it. Rewriting a spell
 * they already know isn't learning it, so it gets no note.
 *
 * Shared by the Spells & Magic tab's study card and queue and the Adventuring
 * tab's study panel, so both say the same thing.
 */
export function studyRankAboveLearnableNote(
  study: Pick<SpellStudyEntry, 'spellName' | 'rank' | 'source'>,
  character: Pick<Character, 'level' | 'knownSpells'>,
  learnableRanks: readonly number[],
): string | undefined {
  if (learnableRanks.includes(study.rank)) return undefined;
  const rewritingKnown = study.source === 'rewrite'
    && character.knownSpells.some((k) => k.name.toLowerCase() === study.spellName.toLowerCase());
  return rewritingKnown ? undefined : rankAboveLearnableNote(study.rank, character.level);
}

// ── Traits ───────────────────────────────────────────────────

export function hasAnyClassFeature(profile: FeatureProfile): boolean {
  return profile.hasCombatTalents || profile.hasHolyOrder || profile.hasTurning || profile.hasChivalricCode || profile.hasTrophies || profile.hasCompanion;
}

export function hasAnyKindredFeature(profile: FeatureProfile): boolean {
  return profile.hasHorns || profile.hasFormShift || profile.hasMadRevelry || profile.hasSymbioticFlesh;
}

export function getMaxGazeUses(level: number): number {
  return BREGGLE_GAZE_PER_DAY[Math.min(level, 15)] ?? 0;
}

export function getMaxFungalSymbiosisUses(level: number): number {
  return Math.floor(level / 2);
}

/**
 * Mad Revelry uses per day. Every woodgrue gets it once a day (Player's Book
 * p53); only the woodgrue kindred-class gets once per day per Level (p189).
 * See docs/rules/02-kindreds.md and docs/rules/04-kindred-classes.md.
 */
export function getMaxMadRevelryUses(character: Pick<Character, 'kindred' | 'class' | 'level'>): number {
  const isWoodgrueKindredClass = character.kindred === 'woodgrue' && !character.class;
  return isWoodgrueKindredClass ? Math.max(1, Math.min(character.level, 15)) : 1;
}

/** Max retainers = 4 + CHA modifier (min 1); initial Loyalty = 7 + CHA modifier. */
export function getRetainerLimits(charisma: number): { maxRetainers: number; baseLoyalty: number } {
  const chaMod = getAbilityModifier(charisma);
  return { maxRetainers: Math.max(1, 4 + chaMod), baseLoyalty: 7 + chaMod };
}

/**
 * Splits the stored languages string into native, class and bonus languages.
 * Native and class languages come from the kindred/class, whatever the string
 * says; everything else in the string counts as a bonus language.
 */
export function getLanguageBreakdown(character: Pick<Character, 'kindred' | 'class' | 'abilityScores' | 'languages'>) {
  const langInfo = getCharacterLanguages(
    character.kindred,
    character.class,
    character.abilityScores.intelligence,
  );

  // Parse current languages string to figure out bonus languages
  const currentLangs = character.languages
    .split(',')
    .map(l => l.trim())
    .filter(Boolean);

  const requiredLangs = [...langInfo.nativeLanguages, ...langInfo.classLanguages];
  const bonusLangs = currentLangs.filter(l => !requiredLangs.includes(l));

  // Filter available languages to exclude already-known
  const allKnown = new Set(currentLangs);
  const availableCommon = langInfo.availableCommon.filter(l => !allKnown.has(l));
  const availableObscure = langInfo.availableObscure.filter(l => !allKnown.has(l));

  return { langInfo, currentLangs, bonusLangs, allKnown, availableCommon, availableObscure };
}
