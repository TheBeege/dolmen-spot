import { KindredInfo, ClassInfo, Character, CalendarDate, KindredId, ClassId } from './types';

// Kindred-class restrictions from the Player's Book.
// 'forbidden' = cannot take this class at all.
// 'rare' = unusual but allowed (no mechanical restriction, just flavour).
// Classes not listed for a kindred are freely available.
export const KINDRED_CLASS_RESTRICTIONS: Record<KindredId, Partial<Record<ClassId, 'forbidden' | 'rare'>>> = {
  breggle: {
    cleric: 'rare',
    friar: 'rare',
    enchanter: 'rare',
  },
  elf: {
    cleric: 'forbidden',
    friar: 'forbidden',
    knight: 'rare',
  },
  grimalkin: {
    cleric: 'forbidden',
    friar: 'forbidden',
    knight: 'rare',
  },
  human: {
    enchanter: 'rare',
  },
  mossling: {
    cleric: 'rare',
    friar: 'rare',
    knight: 'rare',
    enchanter: 'rare',
  },
  woodgrue: {
    cleric: 'forbidden',
    friar: 'forbidden',
    knight: 'rare',
  },
};

export function getAvailableClasses(kindred: KindredId | ''): { class: ClassInfo; restriction?: 'rare' }[] {
  if (!kindred) return CLASSES.map(c => ({ class: c }));
  const restrictions = KINDRED_CLASS_RESTRICTIONS[kindred] || {};
  return CLASSES.filter(c => restrictions[c.id] !== 'forbidden')
    .map(c => ({ class: c, restriction: restrictions[c.id] === 'rare' ? 'rare' as const : undefined }));
}

export const KINDREDS: KindredInfo[] = [
  {
    id: 'breggle',
    name: 'Breggle',
    description: 'Goat-headed folk whose horn length indicates their social standing.',
    creatureType: 'Mortal',
    size: 'Medium',
    nativeLanguages: ['Woldish', 'Gaffe', 'Caprice'],
  },
  {
    id: 'elf',
    name: 'Elf',
    description: 'Ageless fairies who have crossed into the mortal world for reasons they seldom reveal.',
    creatureType: 'Fairy',
    size: 'Medium',
    nativeLanguages: ['Woldish', 'Sylvan', 'High Elfish'],
  },
  {
    id: 'grimalkin',
    name: 'Grimalkin',
    description: 'Mercurial feline fairies who shift between three different forms.',
    creatureType: 'Fairy',
    size: 'Small',
    nativeLanguages: ['Woldish', 'Mewl'],
  },
  {
    id: 'human',
    name: 'Human',
    description: 'The most numerous and varied folk of Dolmenwood.',
    creatureType: 'Mortal',
    size: 'Medium',
    nativeLanguages: ['Woldish'],
  },
  {
    id: 'mossling',
    name: 'Mossling',
    description: 'Gnarled, woody humanoids whose fertile flesh hosts mosses, moulds, and fungi.',
    creatureType: 'Mortal',
    size: 'Small',
    nativeLanguages: ['Woldish', 'Mulch'],
  },
  {
    id: 'woodgrue',
    name: 'Woodgrue',
    description: 'Bat-faced demi-fey goblins, known for their love of music, revelry, and arson.',
    creatureType: 'Demi-Fey',
    size: 'Small',
    nativeLanguages: ['Woldish', 'Sylvan'],
  },
];

export const CLASSES: ClassInfo[] = [
  {
    id: 'bard',
    name: 'Bard',
    description: 'Musicians and poets drawn to a life of wandering and adventure.',
    primeAbilities: 'Charisma & Dexterity',
    hitDice: '1d6',
    combatAptitude: 'Semi-martial',
    armour: 'Light and Medium, no shields',
    weapons: 'Small and Medium',
  },
  {
    id: 'cleric',
    name: 'Cleric',
    description: 'Holy warriors in the service of the Pluritine Church.',
    primeAbilities: 'Wisdom',
    hitDice: '1d6',
    combatAptitude: 'Semi-martial',
    armour: 'Any, including shields',
    weapons: 'Any',
    allowedKindreds: 'Mortals only',
  },
  {
    id: 'enchanter',
    name: 'Enchanter',
    description: 'Wanderers who wield the magic of Fairy, currying favour with fairy nobles.',
    primeAbilities: 'Charisma & Intelligence',
    hitDice: '1d6',
    combatAptitude: 'Semi-martial',
    armour: 'Light and Medium, no shields',
    weapons: 'Small and Medium',
  },
  {
    id: 'fighter',
    name: 'Fighter',
    description: 'Mercenaries, soldiers, and ruffians who turn their talents to the adventuring life.',
    primeAbilities: 'Strength',
    hitDice: '1d8',
    combatAptitude: 'Martial',
    armour: 'Any, including shields',
    weapons: 'Any',
  },
  {
    id: 'friar',
    name: 'Friar',
    description: 'Wandering ascetics who spread the gospel of the Pluritine Church.',
    primeAbilities: 'Intelligence & Wisdom',
    hitDice: '1d4',
    combatAptitude: 'Non-martial',
    armour: 'None',
    weapons: 'Club, dagger, holy water, oil, sling, staff, torch',
    allowedKindreds: 'Mortals only',
  },
  {
    id: 'hunter',
    name: 'Hunter',
    description: 'Expert trackers, stalkers, and killers, at home in the wild woods.',
    primeAbilities: 'Constitution & Dexterity',
    hitDice: '1d8',
    combatAptitude: 'Martial',
    armour: 'Light, shields',
    weapons: 'Any',
  },
  {
    id: 'knight',
    name: 'Knight',
    description: 'Warriors who serve a noble, doing their bidding and upholding their honour.',
    primeAbilities: 'Charisma & Strength',
    hitDice: '1d8',
    combatAptitude: 'Martial',
    armour: 'Medium and Heavy, shields',
    weapons: 'Any melee weapons',
  },
  {
    id: 'magician',
    name: 'Magician',
    description: 'Connoisseurs of secret arcane lore who wield powerful magic.',
    primeAbilities: 'Intelligence',
    hitDice: '1d4',
    combatAptitude: 'Non-martial',
    armour: 'None',
    weapons: 'Dagger, holy water, oil, staff, torch',
  },
  {
    id: 'thief',
    name: 'Thief',
    description: 'Rogues who live by skills of deception and stealth.',
    primeAbilities: 'Dexterity',
    hitDice: '1d4',
    combatAptitude: 'Semi-martial',
    armour: 'Light, no shields',
    weapons: 'Small and Medium',
  },
];

export const MOON_SIGNS = [
  'The Drune', 'The Witch', 'The Hart', 'The Owl',
  'The Serpent', 'The Wolf', 'The Toad', 'The Spider',
  'The Cat', 'The Raven', 'The Fox', 'The Hare',
];

export const ALIGNMENTS = ['Lawful', 'Neutral', 'Chaotic'] as const;

export const ABILITY_MODIFIER_TABLE: Record<number, number> = {
  3: -3, 4: -2, 5: -2, 6: -1, 7: -1, 8: -1,
  9: 0, 10: 0, 11: 0, 12: 0,
  13: 1, 14: 1, 15: 1, 16: 2, 17: 2, 18: 3,
};

export function getAbilityModifier(score: number): number {
  if (score <= 3) return -3;
  if (score <= 5) return -2;
  if (score <= 8) return -1;
  if (score <= 12) return 0;
  if (score <= 15) return 1;
  if (score <= 17) return 2;
  return 3;
}

export function formatModifier(mod: number): string {
  if (mod >= 0) return `+${mod}`;
  return `${mod}`;
}

// Dolmenwood Calendar
export const MONTHS = [
  { name: 'Grimvold', season: 'Winter', days: 30, description: 'The Onset of Winter' },
  { name: 'Lymewald', season: 'Winter', days: 28, description: 'Deep Winter' },
  { name: 'Haggryme', season: 'Winter', days: 30, description: 'The Fading of Winter' },
  { name: 'Symswald', season: 'Spring', days: 29, description: 'The Onset of Spring' },
  { name: 'Harchment', season: 'Spring', days: 29, description: 'High Spring' },
  { name: 'Iggwyld', season: 'Spring', days: 30, description: 'The Fading of Spring' },
  { name: 'Chysting', season: 'Summer', days: 31, description: 'The Onset of Summer' },
  { name: 'Lillipythe', season: 'Summer', days: 29, description: 'High Summer' },
  { name: 'Haelhold', season: 'Summer', days: 28, description: 'The Fading of Summer' },
  { name: 'Reedwryme', season: 'Autumn', days: 30, description: 'The Onset of Autumn' },
  { name: 'Obthryme', season: 'Autumn', days: 28, description: 'Deep Autumn' },
  { name: 'Braghold', season: 'Autumn', days: 30, description: 'The Fading of Autumn' },
];

export const DAY_NAMES = ['Colly', 'Chime', 'Hayme', 'Moot', 'Frisk', 'Eggfast', 'Sunning'];

export function getDayName(day: number): string {
  return DAY_NAMES[(day - 1) % 7];
}

export function formatCalendarDate(date: CalendarDate): string {
  const month = MONTHS[date.month];
  if (!month) return 'Unknown';
  const dayName = getDayName(date.day);
  return `${date.day} ${month.name} (${dayName})`;
}

export function getSeasonIcon(month: number): string {
  const season = MONTHS[month]?.season;
  switch (season) {
    case 'Winter': return '\u2744';
    case 'Spring': return '\u2618';
    case 'Summer': return '\u2600';
    case 'Autumn': return '\u2618';
    default: return '';
  }
}

export const FESTIVALS: Record<string, { month: number; day: number; name: string }[]> = {
  festivals: [
    { month: 0, day: 29, name: 'Hanglemas' },
    { month: 0, day: 30, name: "Dyboll's Day" },
    { month: 2, day: 29, name: "Yarl's Day" },
    { month: 2, day: 30, name: 'Day of Virgins' },
    { month: 3, day: 29, name: 'Hopfast' },
    { month: 4, day: 29, name: 'Smithing' },
    { month: 5, day: 29, name: 'Shortening' },
    { month: 5, day: 30, name: "Longshank's Day" },
    { month: 6, day: 29, name: 'Bradging' },
    { month: 6, day: 30, name: 'Copsewallow' },
    { month: 6, day: 31, name: 'Chalice' },
    { month: 7, day: 29, name: "Old Dobey's Day" },
    { month: 9, day: 29, name: "Shub's Eve" },
    { month: 9, day: 30, name: 'Druden Day / Festival of the Green Man' },
    { month: 11, day: 29, name: 'Day of Doors' },
    { month: 11, day: 30, name: 'Dolmenday - The Hunting of the Winter Hart' },
  ],
};

export const CELESTIAL_EVENTS: { month: number; day: number; name: string }[] = [
  { month: 0, day: 19, name: 'Winter Solstice' },
  { month: 3, day: 20, name: 'Vernal Equinox' },
  { month: 6, day: 18, name: 'Summer Solstice' },
  { month: 9, day: 19, name: 'Autumnal Equinox' },
];

// Equipment reference data
export const ARMOUR_TABLE = [
  { name: 'Unarmoured', ac: 10, weight: 0, bulk: 'None', cost: 0, slots: 0 },
  { name: 'Leather', ac: 12, weight: 200, bulk: 'Light', cost: 20, slots: 1 },
  { name: 'Bark', ac: 13, weight: 300, bulk: 'Light', cost: 30, slots: 1 },
  { name: 'Chainmail', ac: 14, weight: 400, bulk: 'Medium', cost: 40, slots: 2 },
  { name: 'Pinecone', ac: 15, weight: 400, bulk: 'Medium', cost: 50, slots: 2 },
  { name: 'Plate mail', ac: 16, weight: 500, bulk: 'Heavy', cost: 60, slots: 3 },
  { name: 'Full plate', ac: 17, weight: 700, bulk: 'Heavy', cost: 1000, slots: 3 },
  { name: 'Shield', ac: 1, weight: 100, bulk: 'None', cost: 10, slots: 1 },
];

export const WEAPONS_TABLE = [
  { name: 'Battle axe', damage: '1d8', cost: 7, weight: 100, size: 'M' },
  { name: 'Club', damage: '1d4', cost: 3, weight: 20, size: 'M' },
  { name: 'Crossbow', damage: '1d8', cost: 30, weight: 50, size: 'M' },
  { name: 'Dagger', damage: '1d4', cost: 3, weight: 10, size: 'S' },
  { name: 'Hand axe', damage: '1d6', cost: 4, weight: 20, size: 'S' },
  { name: 'Lance', damage: '1d6', cost: 5, weight: 100, size: 'L' },
  { name: 'Longbow', damage: '1d6', cost: 40, weight: 40, size: 'L' },
  { name: 'Longsword', damage: '1d8', cost: 10, weight: 30, size: 'M' },
  { name: 'Mace', damage: '1d6', cost: 5, weight: 40, size: 'M' },
  { name: 'Polearm', damage: '1d10', cost: 7, weight: 140, size: 'L' },
  { name: 'Shortbow', damage: '1d6', cost: 25, weight: 20, size: 'M' },
  { name: 'Shortsword', damage: '1d6', cost: 7, weight: 20, size: 'M' },
  { name: 'Sling', damage: '1d4', cost: 2, weight: 10, size: 'S' },
  { name: 'Spear', damage: '1d6', cost: 3, weight: 30, size: 'M' },
  { name: 'Staff', damage: '1d4', cost: 2, weight: 40, size: 'M' },
  { name: 'Two-handed sword', damage: '1d10', cost: 15, weight: 140, size: 'L' },
  { name: 'War hammer', damage: '1d6', cost: 5, weight: 40, size: 'M' },
];

export const ADVENTURING_GEAR = [
  { name: 'Backpack', cost: 4 }, { name: 'Bedroll', cost: 2 },
  { name: 'Belt pouch', cost: 1 }, { name: 'Candles (10)', cost: 1 },
  { name: 'Cooking pots', cost: 3 }, { name: 'Crowbar', cost: 10 },
  { name: 'Grappling hook', cost: 20 }, { name: 'Hammer (small)', cost: 2 },
  { name: 'Holy symbol (wooden)', cost: 5 }, { name: 'Holy water (vial)', cost: 25 },
  { name: 'Iron spikes (12)', cost: 1 }, { name: 'Lantern (hooded)', cost: 5 },
  { name: 'Lantern (bullseye)', cost: 10 }, { name: 'Oil (flask)', cost: 1 },
  { name: 'Rations (fresh, 1 day)', cost: 1 }, { name: 'Rations (preserved, 1 day)', cost: 2 },
  { name: 'Rope (50\')', cost: 1 }, { name: 'Sack', cost: 1 },
  { name: 'Tinder box', cost: 3 }, { name: 'Torches (3)', cost: 1 },
  { name: 'Waterskin', cost: 1 }, { name: 'Thieves\' tools', cost: 25 },
  { name: 'Tent', cost: 20 }, { name: 'Fishing rod and tackle', cost: 4 },
];

export const COMMON_LANGUAGES = [
  'Woldish', 'Old Woldish', 'Caprice', 'Gaffe', 'Liturgic', 'Sylvan',
];

export const OBSCURE_LANGUAGES = [
  'Boggin', 'Deorling', 'Drunic', 'Dwelve', 'High Elfish', 'Merfolk', 'Mulch', 'Mewl', 'Wyrm',
];

export function createDefaultCharacter(): Character {
  return {
    id: crypto.randomUUID(),
    name: '',
    kindred: '',
    class: '',
    background: '',
    alignment: '',
    affiliation: '',
    moonSign: '',
    level: 1,
    xp: 0,
    xpNextLevel: 0,
    xpModifier: 0,
    abilityScores: {
      strength: 10,
      intelligence: 10,
      wisdom: 10,
      dexterity: 10,
      constitution: 10,
      charisma: 10,
    },
    maxHp: 1,
    currentHp: 1,
    armorClass: 10,
    attackBonus: 0,
    speed: 40,
    travelPointsPerDay: 8,
    magicResistance: 0,
    saveTargets: { doom: 14, ray: 14, hold: 13, blast: 16, spell: 14 },
    skillTargets: { listen: 5, search: 5, survival: 5 },
    equippedItems: [],
    stowedItems: [],
    tinyItems: '',
    coins: { copper: 0, silver: 0, gold: 10, pellucidium: 0 },
    encumbranceMethod: 'slots',
    spells: [],
    spellNotes: '',
    classTraits: '',
    kindredTraits: '',
    languages: 'Woldish',
    combatTalents: '',
    otherNotes: '',
    currentDate: { day: 1, month: 0 },
    currentLocation: '',
    journalEntries: [],
  };
}
