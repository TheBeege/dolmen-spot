export type Alignment = 'Lawful' | 'Neutral' | 'Chaotic';
export type CreatureType = 'Mortal' | 'Fairy' | 'Demi-Fey';
export type Size = 'Small' | 'Medium';

export type KindredId = 'breggle' | 'elf' | 'grimalkin' | 'human' | 'mossling' | 'woodgrue';
export type ClassId = 'bard' | 'cleric' | 'enchanter' | 'fighter' | 'friar' | 'hunter' | 'knight' | 'magician' | 'thief';

export interface AbilityScores {
  strength: number;
  intelligence: number;
  wisdom: number;
  dexterity: number;
  constitution: number;
  charisma: number;
}

export interface SaveTargets {
  doom: number;
  ray: number;
  hold: number;
  blast: number;
  spell: number;
}

export interface SkillTargets {
  listen: number;
  search: number;
  survival: number;
  [key: string]: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  slots: number;
  weight: number;
  notes: string;
  equipped: boolean;
  containerId?: string;  // links stowed item to a CharacterContainer
}

export interface CharacterContainer {
  id: string;         // UUID
  name: string;       // "Backpack", "Sack", "Belt Pouch", etc.
  capacity: number;   // max weight in coins
}

export interface SpellSlot {
  id: string;
  name: string;
  rank: number;
  prepared: boolean;
  cast: boolean;
  notes: string;
}

export interface CharacterGlamour {
  id: string;          // UUID
  glamourId: number;   // References GLAMOURS[].id (1-20)
  name: string;        // Denormalized for display
  notes: string;
}

export interface CharacterRune {
  id: string;          // UUID
  runeId: number;      // References FAIRY_RUNES[].id
  name: string;
  magnitude: 'lesser' | 'greater' | 'mighty';
  usesRemaining: number;
  notes: string;
}

export interface CharacterKnack {
  knackId: number;     // References MOSSLING_KNACKS[].id (1-6)
  name: string;
  notes: string;
}

export interface Coins {
  copper: number;
  silver: number;
  gold: number;
  pellucidium: number;
}

export interface ActiveLightSource {
  id: string;
  type: 'torch' | 'lantern' | 'candle';
  minutesRemaining: number;
}

export interface CalendarDate {
  day: number;
  month: number; // 0-11
}

export interface Character {
  schemaVersion: number;
  id: string;
  name: string;
  kindred: KindredId | '';
  class: ClassId | '';
  background: string;
  alignment: Alignment | '';
  affiliation: string;
  moonSign: string;
  level: number;
  xp: number;
  xpNextLevel: number;
  xpModifier: number;

  abilityScores: AbilityScores;

  maxHp: number;
  currentHp: number;
  armorClass: number;
  attackBonus: number;
  speed: number;
  travelPointsPerDay: number;
  magicResistance: number;

  saveTargets: SaveTargets;
  skillTargets: SkillTargets;

  equippedItems: InventoryItem[];
  stowedItems: InventoryItem[];
  containers: CharacterContainer[];
  tinyItems: string;
  coins: Coins;

  encumbranceMethod: 'weight' | 'slots';
  equippedArmourName: string;  // Maps to ARMOUR_TABLE[].name, '' = Unarmoured
  hasShield: boolean;

  spells: SpellSlot[];
  spellNotes: string;
  glamours: CharacterGlamour[];
  runes: CharacterRune[];
  knack: CharacterKnack | null;
  startingSpellBook: string;

  classTraits: string;
  kindredTraits: string;
  languages: string;
  combatTalents: string;
  otherNotes: string;

  retainers: Retainer[];
  gazeUsesRemaining: number;
  currentForm: 'estray' | 'chester' | 'wilder';
  wilderUsedToday: boolean;
  madRevelryUsesRemaining: number;
  trophies: Trophy[];
  animalCompanion: AnimalCompanion | null;
  liegeHouse: string;
  selectedCombatTalents: CombatTalentSelection[];
  holyOrder: string;
  symbioticFleshTraits: number[];
  fungalSymbiosisUsesRemaining: number;

  currentDate: CalendarDate;
  currentLocation: string;
  journalEntries: JournalEntry[];

  exhaustionLevel: number;
  hungerDays: number;
  thirstDays: number;
  rations: { fresh: number; preserved: number };
  activeLightSources: ActiveLightSource[];
  travelDaysWithoutRest: number;
  forcedMarchActive: boolean;
  travelPointsRemaining: number;
}

export interface JournalEntry {
  id: string;
  date: CalendarDate;
  location: string;
  text: string;
}

export interface Retainer {
  id: string;
  name: string;
  class: string;
  level: number;
  hp: number;
  loyalty: number;
  notes: string;
}

export interface Trophy {
  id: string;
  creatureType: string;
}

export interface AnimalCompanion {
  name: string;
  type: string;
  hp: number;
  notes: string;
}

export interface CombatTalentSelection {
  talentId: string;
  specification: string; // For Slayer (creature type) or Weapon Specialist (weapon type)
}

export interface FeatureProfile {
  hasHorns: boolean;
  hasGaze: boolean;
  hasFormShift: boolean;
  hasMadRevelry: boolean;
  hasTrophies: boolean;
  hasCompanion: boolean;
  hasChivalricCode: boolean;
  hasCombatTalents: boolean;
  hasHolyOrder: boolean;
  hasSymbioticFlesh: boolean;
  hasFungalSymbiosis: boolean;
  hasTurning: boolean;
  hasRetainers: boolean;
}

export interface AdvancementRow {
  level: number;
  xp: number;
  hpDice: string;
  attackBonus: number;
  saves: SaveTargets;
}

export interface ClassAdvancementTable {
  classId: ClassId | KindredId;
  rows: AdvancementRow[];
  hpAfterTen: number;
}

export interface SkillProgressionTable {
  skills: string[];
  rows: Record<number, Record<string, number>>;
}

export interface KindredInfo {
  id: KindredId;
  name: string;
  description: string;
  creatureType: CreatureType;
  size: Size;
  nativeLanguages: string[];
}

export interface ClassInfo {
  id: ClassId;
  name: string;
  description: string;
  primeAbilities: string;
  hitDice: string;
  combatAptitude: string;
  armour: string;
  weapons: string;
  allowedKindreds?: string;
}
