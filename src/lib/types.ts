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
}

export interface SpellSlot {
  id: string;
  name: string;
  rank: number;
  prepared: boolean;
  cast: boolean;
  notes: string;
}

export interface Coins {
  copper: number;
  silver: number;
  gold: number;
  pellucidium: number;
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
  tinyItems: string;
  coins: Coins;

  encumbranceMethod: 'weight' | 'slots';

  spells: SpellSlot[];
  spellNotes: string;

  classTraits: string;
  kindredTraits: string;
  languages: string;
  combatTalents: string;
  otherNotes: string;

  currentDate: CalendarDate;
  currentLocation: string;
  journalEntries: JournalEntry[];
}

export interface JournalEntry {
  id: string;
  date: CalendarDate;
  location: string;
  text: string;
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
