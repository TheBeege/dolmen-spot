import { KindredInfo, ClassInfo, Character, CalendarDate, KindredId, ClassId, AdvancementRow, ClassAdvancementTable, SkillProgressionTable } from './types';
import { CURRENT_SCHEMA_VERSION } from './migrations';

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

// ──────────────────────────────────────────────────────────
// Class Advancement Tables (levels 1-15)
// Source: docs/rules/03-classes.md
// ──────────────────────────────────────────────────────────

function mkRow(level: number, xp: number, hpDice: string, attackBonus: number, doom: number, ray: number, hold: number, blast: number, spell: number): AdvancementRow {
  return { level, xp, hpDice, attackBonus, saves: { doom, ray, hold, blast, spell } };
}

export const CLASS_ADVANCEMENT: Record<ClassId, ClassAdvancementTable> = {
  bard: {
    classId: 'bard', hpAfterTen: 1,
    rows: [
      mkRow(1,       0, '1d6', 0, 13,14,13,15,15), mkRow(2,   1750, '+1d6', 0, 13,14,13,15,15),
      mkRow(3,    3500, '+1d6', 1, 12,13,12,14,14), mkRow(4,   7000, '+1d6', 1, 12,13,12,14,14),
      mkRow(5,   14000, '+1d6', 2, 11,12,11,13,13), mkRow(6,  28000, '+1d6', 2, 11,12,11,13,13),
      mkRow(7,   56000, '+1d6', 3, 10,11,10,12,12), mkRow(8, 112000, '+1d6', 3, 10,11,10,12,12),
      mkRow(9,  220000, '+1d6', 4,  9,10, 9,11,11), mkRow(10,340000, '+1d6', 4,  9,10, 9,11,11),
      mkRow(11, 460000, '+1',   5,  8, 9, 8,10,10), mkRow(12,580000, '+1',   5,  8, 9, 8,10,10),
      mkRow(13, 700000, '+1',   6,  7, 8, 7, 9, 9), mkRow(14,820000, '+1',   6,  7, 8, 7, 9, 9),
      mkRow(15, 940000, '+1',   7,  6, 7, 6, 8, 8),
    ],
  },
  cleric: {
    classId: 'cleric', hpAfterTen: 1,
    rows: [
      mkRow(1,       0, '1d6', 0, 11,12,13,16,14), mkRow(2,   1500, '+1d6', 0, 11,12,13,16,14),
      mkRow(3,    3000, '+1d6', 1, 10,11,12,15,13), mkRow(4,   6000, '+1d6', 1, 10,11,12,15,13),
      mkRow(5,   12000, '+1d6', 2,  9,10,11,14,12), mkRow(6,  24000, '+1d6', 2,  9,10,11,14,12),
      mkRow(7,   48000, '+1d6', 3,  8, 9,10,13,11), mkRow(8,  96000, '+1d6', 3,  8, 9,10,13,11),
      mkRow(9,  190000, '+1d6', 4,  7, 8, 9,12,10), mkRow(10,290000, '+1d6', 4,  7, 8, 9,12,10),
      mkRow(11, 390000, '+1',   5,  6, 7, 8,11, 9), mkRow(12,490000, '+1',   5,  6, 7, 8,11, 9),
      mkRow(13, 590000, '+1',   6,  5, 6, 7,10, 8), mkRow(14,690000, '+1',   6,  5, 6, 7,10, 8),
      mkRow(15, 790000, '+1',   7,  4, 5, 6, 9, 7),
    ],
  },
  enchanter: {
    classId: 'enchanter', hpAfterTen: 1,
    rows: [
      mkRow(1,       0, '1d6', 0, 11,12,13,16,14), mkRow(2,   1750, '+1d6', 0, 11,12,13,16,14),
      mkRow(3,    3500, '+1d6', 1, 10,11,12,15,13), mkRow(4,   7000, '+1d6', 1, 10,11,12,15,13),
      mkRow(5,   14000, '+1d6', 2,  9,10,11,14,12), mkRow(6,  28000, '+1d6', 2,  9,10,11,14,12),
      mkRow(7,   56000, '+1d6', 3,  8, 9,10,13,11), mkRow(8, 112000, '+1d6', 3,  8, 9,10,13,11),
      mkRow(9,  220000, '+1d6', 4,  7, 8, 9,12,10), mkRow(10,340000, '+1d6', 4,  7, 8, 9,12,10),
      mkRow(11, 460000, '+1',   5,  6, 7, 8,11, 9), mkRow(12,580000, '+1',   5,  6, 7, 8,11, 9),
      mkRow(13, 700000, '+1',   6,  5, 6, 7,10, 8), mkRow(14,820000, '+1',   6,  5, 6, 7,10, 8),
      mkRow(15, 940000, '+1',   7,  4, 5, 6, 9, 7),
    ],
  },
  fighter: {
    classId: 'fighter', hpAfterTen: 2,
    rows: [
      mkRow(1,       0, '1d8', 1, 12,13,14,15,16), mkRow(2,   2000, '+1d8', 1, 12,13,14,15,16),
      mkRow(3,    4000, '+1d8', 2, 11,12,13,14,15), mkRow(4,   8000, '+1d8', 3, 10,11,12,13,14),
      mkRow(5,   16000, '+1d8', 3, 10,11,12,13,14), mkRow(6,  32000, '+1d8', 4,  9,10,11,12,13),
      mkRow(7,   64000, '+1d8', 5,  8, 9,10,11,12), mkRow(8, 128000, '+1d8', 5,  8, 9,10,11,12),
      mkRow(9,  260000, '+1d8', 6,  7, 8, 9,10,11), mkRow(10,380000, '+1d8', 7,  6, 7, 8, 9,10),
      mkRow(11, 500000, '+2',   7,  6, 7, 8, 9,10), mkRow(12,620000, '+2',   8,  5, 6, 7, 8, 9),
      mkRow(13, 740000, '+2',   9,  4, 5, 6, 7, 8), mkRow(14,860000, '+2',   9,  4, 5, 6, 7, 8),
      mkRow(15, 980000, '+2',  10,  3, 4, 5, 6, 7),
    ],
  },
  friar: {
    classId: 'friar', hpAfterTen: 1,
    rows: [
      mkRow(1,       0, '1d4', 0, 11,12,13,16,14), mkRow(2,   1750, '+1d4', 0, 11,12,13,16,14),
      mkRow(3,    3500, '+1d4', 0, 11,12,13,16,14), mkRow(4,   7000, '+1d4', 1, 10,11,12,15,13),
      mkRow(5,   14000, '+1d4', 1, 10,11,12,15,13), mkRow(6,  28000, '+1d4', 1, 10,11,12,15,13),
      mkRow(7,   56000, '+1d4', 2,  9,10,11,14,12), mkRow(8, 112000, '+1d4', 2,  9,10,11,14,12),
      mkRow(9,  220000, '+1d4', 2,  9,10,11,14,12), mkRow(10,340000, '+1d4', 3,  8, 9,10,13,11),
      mkRow(11, 460000, '+1',   3,  8, 9,10,13,11), mkRow(12,580000, '+1',   3,  8, 9,10,13,11),
      mkRow(13, 700000, '+1',   4,  7, 8, 9,12,10), mkRow(14,820000, '+1',   4,  7, 8, 9,12,10),
      mkRow(15, 940000, '+1',   4,  7, 8, 9,12,10),
    ],
  },
  hunter: {
    classId: 'hunter', hpAfterTen: 2,
    rows: [
      mkRow(1,       0, '1d8', 1, 12,13,14,15,16), mkRow(2,    2250, '+1d8', 1, 12,13,14,15,16),
      mkRow(3,    4500, '+1d8', 2, 11,12,13,14,15), mkRow(4,    9000, '+1d8', 3, 10,11,12,13,14),
      mkRow(5,   18000, '+1d8', 3, 10,11,12,13,14), mkRow(6,   36000, '+1d8', 4,  9,10,11,12,13),
      mkRow(7,   72000, '+1d8', 5,  8, 9,10,11,12), mkRow(8,  144000, '+1d8', 5,  8, 9,10,11,12),
      mkRow(9,  290000, '+1d8', 6,  7, 8, 9,10,11), mkRow(10, 420000, '+1d8', 7,  6, 7, 8, 9,10),
      mkRow(11, 550000, '+2',   7,  6, 7, 8, 9,10), mkRow(12, 680000, '+2',   8,  5, 6, 7, 8, 9),
      mkRow(13, 810000, '+2',   9,  4, 5, 6, 7, 8), mkRow(14, 940000, '+2',   9,  4, 5, 6, 7, 8),
      mkRow(15,1070000, '+2',  10,  3, 4, 5, 6, 7),
    ],
  },
  knight: {
    classId: 'knight', hpAfterTen: 2,
    rows: [
      mkRow(1,       0, '1d8', 1, 12,13,12,15,15), mkRow(2,    2250, '+1d8', 1, 12,13,12,15,15),
      mkRow(3,    4500, '+1d8', 2, 11,12,11,14,14), mkRow(4,    9000, '+1d8', 3, 10,11,10,13,13),
      mkRow(5,   18000, '+1d8', 3, 10,11,10,13,13), mkRow(6,   36000, '+1d8', 4,  9,10, 9,12,12),
      mkRow(7,   72000, '+1d8', 5,  8, 9, 8,11,11), mkRow(8,  144000, '+1d8', 5,  8, 9, 8,11,11),
      mkRow(9,  290000, '+1d8', 6,  7, 8, 7,10,10), mkRow(10, 420000, '+1d8', 7,  6, 7, 6, 9, 9),
      mkRow(11, 550000, '+2',   7,  6, 7, 6, 9, 9), mkRow(12, 680000, '+2',   8,  5, 6, 5, 8, 8),
      mkRow(13, 810000, '+2',   9,  4, 5, 4, 7, 7), mkRow(14, 940000, '+2',   9,  4, 5, 4, 7, 7),
      mkRow(15,1070000, '+2',  10,  3, 4, 3, 6, 6),
    ],
  },
  magician: {
    classId: 'magician', hpAfterTen: 1,
    rows: [
      mkRow(1,       0, '1d4', 0, 14,14,13,16,14), mkRow(2,    2500, '+1d4', 0, 14,14,13,16,14),
      mkRow(3,    5000, '+1d4', 0, 14,14,13,16,14), mkRow(4,   10000, '+1d4', 1, 13,13,12,15,13),
      mkRow(5,   20000, '+1d4', 1, 13,13,12,15,13), mkRow(6,   40000, '+1d4', 1, 13,13,12,15,13),
      mkRow(7,   80000, '+1d4', 2, 12,12,11,14,12), mkRow(8,  160000, '+1d4', 2, 12,12,11,14,12),
      mkRow(9,  320000, '+1d4', 2, 12,12,11,14,12), mkRow(10, 470000, '+1d4', 3, 11,11,10,13,11),
      mkRow(11, 620000, '+1',   3, 11,11,10,13,11), mkRow(12, 770000, '+1',   3, 11,11,10,13,11),
      mkRow(13, 920000, '+1',   4, 10,10, 9,12,10), mkRow(14,1070000, '+1',   4, 10,10, 9,12,10),
      mkRow(15,1220000, '+1',   4, 10,10, 9,12,10),
    ],
  },
  thief: {
    classId: 'thief', hpAfterTen: 1,
    rows: [
      mkRow(1,       0, '1d4', 0, 13,14,13,15,15), mkRow(2,    1200, '+1d4', 0, 13,14,13,15,15),
      mkRow(3,    2400, '+1d4', 1, 12,13,12,14,14), mkRow(4,    4800, '+1d4', 1, 12,13,12,14,14),
      mkRow(5,    9600, '+1d4', 2, 11,12,11,13,13), mkRow(6,   19200, '+1d4', 2, 11,12,11,13,13),
      mkRow(7,   38400, '+1d4', 3, 10,11,10,12,12), mkRow(8,   76800, '+1d4', 3, 10,11,10,12,12),
      mkRow(9,  150000, '+1d4', 4,  9,10, 9,11,11), mkRow(10, 270000, '+1d4', 4,  9,10, 9,11,11),
      mkRow(11, 390000, '+1',   5,  8, 9, 8,10,10), mkRow(12, 510000, '+1',   5,  8, 9, 8,10,10),
      mkRow(13, 630000, '+1',   6,  7, 8, 7, 9, 9), mkRow(14, 750000, '+1',   6,  7, 8, 7, 9, 9),
      mkRow(15, 870000, '+1',   7,  6, 7, 6, 8, 8),
    ],
  },
};

// ──────────────────────────────────────────────────────────
// Kindred-Class Advancement Tables
// Source: docs/rules/04-kindred-classes.md
// ──────────────────────────────────────────────────────────

export const KINDRED_CLASS_ADVANCEMENT: Record<KindredId, ClassAdvancementTable | null> = {
  breggle: {
    classId: 'breggle', hpAfterTen: 2,
    rows: [
      mkRow(1,       0, '1d6', 1, 12,13,14,15,16), mkRow(2,    2000, '+1d6', 1, 12,13,14,15,16),
      mkRow(3,    4000, '+1d6', 2, 11,12,13,14,15), mkRow(4,    8000, '+1d6', 3, 10,11,12,13,14),
      mkRow(5,   16000, '+1d6', 3, 10,11,12,13,14), mkRow(6,   32000, '+1d6', 4,  9,10,11,12,13),
      mkRow(7,   64000, '+1d6', 5,  8, 9,10,11,12), mkRow(8,  128000, '+1d6', 5,  8, 9,10,11,12),
      mkRow(9,  260000, '+1d6', 6,  7, 8, 9,10,11), mkRow(10, 380000, '+1d6', 7,  6, 7, 8, 9,10),
      mkRow(11, 500000, '+2',   7,  6, 7, 8, 9,10), mkRow(12, 620000, '+2',   8,  5, 6, 7, 8, 9),
      mkRow(13, 740000, '+2',   9,  4, 5, 6, 7, 8), mkRow(14, 860000, '+2',   9,  4, 5, 6, 7, 8),
      mkRow(15, 980000, '+2',  10,  3, 4, 5, 6, 7),
    ],
  },
  elf: {
    classId: 'elf', hpAfterTen: 1,
    rows: [
      mkRow(1,       0, '1d6', 1, 11,12,13,16,14), mkRow(2,    3500, '+1d6', 1, 11,12,13,16,14),
      mkRow(3,    7000, '+1d6', 2, 10,11,12,15,13), mkRow(4,   14000, '+1d6', 3,  9,10,11,14,12),
      mkRow(5,   28000, '+1d6', 3,  9,10,11,14,12), mkRow(6,   56000, '+1d6', 4,  8, 9,10,13,11),
      mkRow(7,  112000, '+1d6', 5,  7, 8, 9,12,10), mkRow(8,  224000, '+1d6', 5,  7, 8, 9,12,10),
      mkRow(9,  450000, '+1d6', 6,  6, 7, 8,11, 9), mkRow(10, 620000, '+1d6', 7,  5, 6, 7,10, 8),
      mkRow(11, 790000, '+1',   7,  5, 6, 7,10, 8), mkRow(12, 960000, '+1',   8,  4, 5, 6, 9, 7),
      mkRow(13,1130000, '+1',   9,  3, 4, 5, 8, 6), mkRow(14,1300000, '+1',   9,  3, 4, 5, 8, 6),
      mkRow(15,1470000, '+1',  10,  2, 3, 4, 7, 5),
    ],
  },
  grimalkin: {
    classId: 'grimalkin', hpAfterTen: 1,
    rows: [
      mkRow(1,       0, '1d6', 0, 11,11,13,15,14), mkRow(2,    2500, '+1d6', 0, 11,11,13,15,14),
      mkRow(3,    5000, '+1d6', 1, 10,10,12,14,13), mkRow(4,   10000, '+1d6', 1, 10,10,12,14,13),
      mkRow(5,   20000, '+1d6', 2,  9, 9,11,13,12), mkRow(6,   40000, '+1d6', 2,  9, 9,11,13,12),
      mkRow(7,   80000, '+1d6', 3,  8, 8,10,12,11), mkRow(8,  160000, '+1d6', 3,  8, 8,10,12,11),
      mkRow(9,  320000, '+1d6', 4,  7, 7, 9,11,10), mkRow(10, 450000, '+1d6', 4,  7, 7, 9,11,10),
      mkRow(11, 580000, '+1',   5,  6, 6, 8,10, 9), mkRow(12, 710000, '+1',   5,  6, 6, 8,10, 9),
      mkRow(13, 840000, '+1',   6,  5, 5, 7, 9, 8), mkRow(14, 970000, '+1',   6,  5, 5, 7, 9, 8),
      mkRow(15,1100000, '+1',   7,  4, 4, 6, 8, 7),
    ],
  },
  human: null,
  mossling: {
    classId: 'mossling', hpAfterTen: 2,
    rows: [
      mkRow(1,       0, '1d6', 0,  8, 9,10,13,12), mkRow(2,    2200, '+1d6', 0,  8, 9,10,13,12),
      mkRow(3,    4400, '+1d6', 1,  7, 8, 9,12,11), mkRow(4,    8800, '+1d6', 1,  7, 8, 9,12,11),
      mkRow(5,   17600, '+1d6', 2,  6, 7, 8,11,10), mkRow(6,   35200, '+1d6', 2,  6, 7, 8,11,10),
      mkRow(7,   70400, '+1d6', 3,  5, 6, 7,10, 9), mkRow(8,  140800, '+1d6', 3,  5, 6, 7,10, 9),
      mkRow(9,  280000, '+1d6', 4,  4, 5, 6, 9, 8), mkRow(10, 400000, '+1d6', 4,  4, 5, 6, 9, 8),
      mkRow(11, 520000, '+2',   5,  3, 4, 5, 8, 7), mkRow(12, 640000, '+2',   5,  3, 4, 5, 8, 7),
      mkRow(13, 760000, '+2',   6,  2, 3, 4, 7, 6), mkRow(14, 880000, '+2',   6,  2, 3, 4, 7, 6),
      mkRow(15,1000000, '+2',   7,  2, 2, 3, 6, 5),
    ],
  },
  woodgrue: {
    classId: 'woodgrue', hpAfterTen: 1,
    rows: [
      mkRow(1,       0, '1d6', 0, 13,12,14,16,14), mkRow(2,    2000, '+1d6', 0, 13,12,14,16,14),
      mkRow(3,    4000, '+1d6', 1, 12,11,13,15,13), mkRow(4,    8000, '+1d6', 1, 12,11,13,15,13),
      mkRow(5,   16000, '+1d6', 2, 11,10,12,14,12), mkRow(6,   32000, '+1d6', 2, 11,10,12,14,12),
      mkRow(7,   64000, '+1d6', 3, 10, 9,11,13,11), mkRow(8,  128000, '+1d6', 3, 10, 9,11,13,11),
      mkRow(9,  260000, '+1d6', 4,  9, 8,10,12,10), mkRow(10, 380000, '+1d6', 4,  9, 8,10,12,10),
      mkRow(11, 500000, '+1',   5,  8, 7, 9,11, 9), mkRow(12, 620000, '+1',   5,  8, 7, 9,11, 9),
      mkRow(13, 740000, '+1',   6,  7, 6, 8,10, 8), mkRow(14, 860000, '+1',   6,  7, 6, 8,10, 8),
      mkRow(15, 980000, '+1',   7,  6, 5, 7, 9, 7),
    ],
  },
};

// ──────────────────────────────────────────────────────────
// Helper functions for advancement tables
// ──────────────────────────────────────────────────────────

export function getAdvancementTable(kindred: KindredId | '', classId: ClassId | ''): ClassAdvancementTable | null {
  // If using a kindred-class, use kindred advancement table
  if (kindred && kindred !== 'human' && !classId) {
    return KINDRED_CLASS_ADVANCEMENT[kindred] ?? null;
  }
  // Standard class
  if (classId) {
    return CLASS_ADVANCEMENT[classId] ?? null;
  }
  return null;
}

export function getAdvancementRow(kindred: KindredId | '', classId: ClassId | '', level: number): AdvancementRow | null {
  const table = getAdvancementTable(kindred, classId);
  if (!table) return null;
  const clamped = Math.max(1, Math.min(level, 15));
  return table.rows.find(r => r.level === clamped) ?? null;
}

// ──────────────────────────────────────────────────────────
// Class Skill Tables
// Source: docs/rules/03-classes.md
// ──────────────────────────────────────────────────────────

export const CLASS_SKILL_TABLES: Partial<Record<ClassId, SkillProgressionTable>> = {
  bard: {
    skills: ['Decipher', 'Listen', 'Monster Lore', 'Legerdemain'],
    rows: {
      1:  { Decipher: 6, Listen: 5, 'Monster Lore': 6, Legerdemain: 5 },
      2:  { Decipher: 5, Listen: 5, 'Monster Lore': 6, Legerdemain: 5 },
      3:  { Decipher: 5, Listen: 5, 'Monster Lore': 5, Legerdemain: 4 },
      4:  { Decipher: 5, Listen: 5, 'Monster Lore': 4, Legerdemain: 4 },
      5:  { Decipher: 5, Listen: 4, 'Monster Lore': 4, Legerdemain: 4 },
      6:  { Decipher: 4, Listen: 4, 'Monster Lore': 4, Legerdemain: 3 },
      7:  { Decipher: 4, Listen: 4, 'Monster Lore': 3, Legerdemain: 3 },
      8:  { Decipher: 4, Listen: 4, 'Monster Lore': 3, Legerdemain: 3 },
      9:  { Decipher: 4, Listen: 3, 'Monster Lore': 3, Legerdemain: 3 },
      10: { Decipher: 3, Listen: 3, 'Monster Lore': 3, Legerdemain: 2 },
      11: { Decipher: 3, Listen: 3, 'Monster Lore': 2, Legerdemain: 2 },
      12: { Decipher: 3, Listen: 3, 'Monster Lore': 2, Legerdemain: 2 },
      13: { Decipher: 2, Listen: 3, 'Monster Lore': 2, Legerdemain: 2 },
      14: { Decipher: 2, Listen: 2, 'Monster Lore': 2, Legerdemain: 2 },
      15: { Decipher: 2, Listen: 2, 'Monster Lore': 2, Legerdemain: 2 },
    },
  },
  hunter: {
    skills: ['Alertness', 'Stalking', 'Survival', 'Tracking'],
    rows: {
      1:  { Alertness: 6, Stalking: 6, Survival: 5, Tracking: 5 },
      2:  { Alertness: 6, Stalking: 6, Survival: 4, Tracking: 5 },
      3:  { Alertness: 6, Stalking: 6, Survival: 4, Tracking: 4 },
      4:  { Alertness: 6, Stalking: 5, Survival: 4, Tracking: 4 },
      5:  { Alertness: 5, Stalking: 5, Survival: 4, Tracking: 4 },
      6:  { Alertness: 5, Stalking: 5, Survival: 3, Tracking: 4 },
      7:  { Alertness: 5, Stalking: 5, Survival: 3, Tracking: 3 },
      8:  { Alertness: 5, Stalking: 4, Survival: 3, Tracking: 3 },
      9:  { Alertness: 4, Stalking: 4, Survival: 3, Tracking: 3 },
      10: { Alertness: 4, Stalking: 3, Survival: 2, Tracking: 2 },
      11: { Alertness: 4, Stalking: 3, Survival: 2, Tracking: 2 },
      12: { Alertness: 4, Stalking: 3, Survival: 2, Tracking: 2 },
      13: { Alertness: 3, Stalking: 3, Survival: 2, Tracking: 2 },
      14: { Alertness: 3, Stalking: 2, Survival: 2, Tracking: 2 },
      15: { Alertness: 2, Stalking: 2, Survival: 2, Tracking: 2 },
    },
  },
  thief: {
    skills: ['Climb Wall', 'Decipher', 'Disarm Mech.', 'Legerdemain', 'Listen', 'Pick Lock', 'Search', 'Stealth'],
    rows: {
      1:  { 'Climb Wall': 4, Decipher: 6, 'Disarm Mech.': 6, Legerdemain: 6, Listen: 6, 'Pick Lock': 5, Search: 6, Stealth: 5 },
      2:  { 'Climb Wall': 4, Decipher: 6, 'Disarm Mech.': 5, Legerdemain: 6, Listen: 6, 'Pick Lock': 5, Search: 5, Stealth: 5 },
      3:  { 'Climb Wall': 4, Decipher: 6, 'Disarm Mech.': 5, Legerdemain: 5, Listen: 5, 'Pick Lock': 5, Search: 5, Stealth: 5 },
      4:  { 'Climb Wall': 3, Decipher: 5, 'Disarm Mech.': 5, Legerdemain: 5, Listen: 5, 'Pick Lock': 5, Search: 5, Stealth: 5 },
      5:  { 'Climb Wall': 3, Decipher: 5, 'Disarm Mech.': 5, Legerdemain: 5, Listen: 5, 'Pick Lock': 4, Search: 5, Stealth: 4 },
      6:  { 'Climb Wall': 3, Decipher: 5, 'Disarm Mech.': 4, Legerdemain: 5, Listen: 5, 'Pick Lock': 4, Search: 4, Stealth: 4 },
      7:  { 'Climb Wall': 3, Decipher: 5, 'Disarm Mech.': 4, Legerdemain: 4, Listen: 4, 'Pick Lock': 4, Search: 4, Stealth: 4 },
      8:  { 'Climb Wall': 2, Decipher: 4, 'Disarm Mech.': 4, Legerdemain: 4, Listen: 4, 'Pick Lock': 4, Search: 4, Stealth: 4 },
      9:  { 'Climb Wall': 2, Decipher: 4, 'Disarm Mech.': 4, Legerdemain: 4, Listen: 4, 'Pick Lock': 3, Search: 4, Stealth: 3 },
      10: { 'Climb Wall': 2, Decipher: 4, 'Disarm Mech.': 3, Legerdemain: 4, Listen: 4, 'Pick Lock': 3, Search: 3, Stealth: 3 },
      11: { 'Climb Wall': 2, Decipher: 4, 'Disarm Mech.': 3, Legerdemain: 3, Listen: 3, 'Pick Lock': 3, Search: 3, Stealth: 3 },
      12: { 'Climb Wall': 2, Decipher: 3, 'Disarm Mech.': 3, Legerdemain: 3, Listen: 3, 'Pick Lock': 2, Search: 3, Stealth: 3 },
      13: { 'Climb Wall': 2, Decipher: 3, 'Disarm Mech.': 3, Legerdemain: 3, Listen: 3, 'Pick Lock': 2, Search: 2, Stealth: 2 },
      14: { 'Climb Wall': 2, Decipher: 3, 'Disarm Mech.': 2, Legerdemain: 3, Listen: 2, 'Pick Lock': 2, Search: 2, Stealth: 2 },
      15: { 'Climb Wall': 2, Decipher: 2, 'Disarm Mech.': 2, Legerdemain: 2, Listen: 2, 'Pick Lock': 2, Search: 2, Stealth: 2 },
    },
  },
};

// ──────────────────────────────────────────────────────────
// Kindred-Class Skill Tables
// Source: docs/rules/04-kindred-classes.md
// ──────────────────────────────────────────────────────────

export const KINDRED_CLASS_SKILL_TABLES: Partial<Record<KindredId, SkillProgressionTable>> = {
  grimalkin: {
    skills: ['Pick Lock'],
    rows: {
      1: { 'Pick Lock': 6 }, 2: { 'Pick Lock': 6 },
      3: { 'Pick Lock': 5 }, 4: { 'Pick Lock': 5 },
      5: { 'Pick Lock': 4 }, 6: { 'Pick Lock': 4 },
      7: { 'Pick Lock': 3 }, 8: { 'Pick Lock': 3 },
      9: { 'Pick Lock': 2 }, 10: { 'Pick Lock': 2 },
      11: { 'Pick Lock': 2 }, 12: { 'Pick Lock': 2 },
      13: { 'Pick Lock': 2 }, 14: { 'Pick Lock': 2 },
      15: { 'Pick Lock': 2 },
    },
  },
  woodgrue: {
    skills: ['Stealth'],
    rows: {
      1: { Stealth: 6 }, 2: { Stealth: 6 },
      3: { Stealth: 5 }, 4: { Stealth: 5 },
      5: { Stealth: 4 }, 6: { Stealth: 4 },
      7: { Stealth: 3 }, 8: { Stealth: 3 },
      9: { Stealth: 2 }, 10: { Stealth: 2 },
      11: { Stealth: 2 }, 12: { Stealth: 2 },
      13: { Stealth: 2 }, 14: { Stealth: 2 },
      15: { Stealth: 2 },
    },
  },
};

// ──────────────────────────────────────────────────────────
// Detect Magic Progression
// Source: docs/rules/03-classes.md, docs/rules/04-kindred-classes.md
// ──────────────────────────────────────────────────────────

export const DETECT_MAGIC_PROGRESSION: Record<string, Record<number, number>> = {
  enchanter: { 1:5, 2:5, 3:5, 4:5, 5:4, 6:4, 7:3, 8:3, 9:2, 10:2, 11:2, 12:2, 13:2, 14:2, 15:2 },
  magician:  { 1:6, 2:6, 3:5, 4:5, 5:5, 6:4, 7:4, 8:4, 9:3, 10:3, 11:3, 12:3, 13:3, 14:3, 15:3 },
  elf:       { 1:5, 2:5, 3:5, 4:5, 5:4, 6:4, 7:3, 8:3, 9:2, 10:2, 11:2, 12:2, 13:2, 14:2, 15:2 },
};

export function getDetectMagicTarget(classOrKindred: string, level: number): number | null {
  const table = DETECT_MAGIC_PROGRESSION[classOrKindred];
  if (!table) return null;
  const clamped = Math.max(1, Math.min(level, 15));
  return table[clamped] ?? null;
}

// ──────────────────────────────────────────────────────────
// Spells Per Day
// Source: docs/rules/03-classes.md, docs/rules/04-kindred-classes.md
// '-' in the source = 0 here
// ──────────────────────────────────────────────────────────

export const SPELLS_PER_DAY: Record<string, Record<number, number[]>> = {
  cleric: {
    1:  [0,0,0,0,0],     2:  [1,0,0,0,0],     3:  [2,0,0,0,0],
    4:  [2,1,0,0,0],     5:  [2,2,0,0,0],     6:  [2,2,1,0,0],
    7:  [3,2,2,0,0],     8:  [3,2,2,1,0],     9:  [3,3,2,2,0],
    10: [3,3,3,2,1],     11: [4,3,3,3,2],     12: [4,4,3,3,2],
    13: [4,4,4,3,3],     14: [4,4,4,4,3],     15: [5,4,4,4,4],
  },
  friar: {
    1:  [1,0,0,0,0],     2:  [2,0,0,0,0],     3:  [2,1,0,0,0],
    4:  [2,2,0,0,0],     5:  [3,2,1,0,0],     6:  [3,2,2,0,0],
    7:  [3,3,2,1,0],     8:  [4,3,2,2,0],     9:  [4,3,3,2,1],
    10: [4,4,3,3,2],     11: [5,4,3,3,2],     12: [5,4,4,3,3],
    13: [6,5,4,3,3],     14: [6,5,4,4,3],     15: [6,5,5,4,4],
  },
  magician: {
    1:  [1,0,0,0,0,0],   2:  [2,0,0,0,0,0],   3:  [2,1,0,0,0,0],
    4:  [2,2,0,0,0,0],   5:  [2,2,1,0,0,0],   6:  [3,2,2,0,0,0],
    7:  [3,3,2,1,0,0],   8:  [3,3,3,2,0,0],   9:  [3,3,3,2,1,0],
    10: [4,4,3,3,2,0],   11: [4,4,4,3,3,1],   12: [4,4,4,4,3,2],
    13: [5,5,4,4,4,2],   14: [5,5,5,4,4,3],   15: [5,5,5,5,4,3],
  },
  breggle: {
    1:  [0,0,0,0,0],     2:  [0,0,0,0,0],     3:  [0,0,0,0,0],
    4:  [1,0,0,0,0],     5:  [2,0,0,0,0],     6:  [2,1,0,0,0],
    7:  [2,2,0,0,0],     8:  [2,2,0,0,0],     9:  [3,2,0,0,0],
    10: [3,2,1,0,0],     11: [3,3,2,0,0],     12: [3,3,2,0,0],
    13: [4,3,2,1,0],     14: [4,3,2,2,0],     15: [4,4,3,2,1],
  },
};

export function getSpellsPerDay(classOrKindred: string, level: number): number[] | null {
  const table = SPELLS_PER_DAY[classOrKindred];
  if (!table) return null;
  const clamped = Math.max(1, Math.min(level, 15));
  return table[clamped] ?? null;
}

// ──────────────────────────────────────────────────────────
// Friar AC Bonus (Armour of Faith)
// Source: docs/rules/03-classes.md
// ──────────────────────────────────────────────────────────

export const FRIAR_AC_BONUS: Record<number, number> = {
  1:2, 2:2, 3:2, 4:3, 5:3, 6:3, 7:4, 8:4, 9:4, 10:4, 11:5, 12:5, 13:5, 14:5, 15:5,
};

// ──────────────────────────────────────────────────────────
// Fighter Combat Talents
// Source: docs/rules/03-classes.md
// ──────────────────────────────────────────────────────────

export const FIGHTER_COMBAT_TALENTS = [
  { id: 'battle-rage', name: 'Battle Rage', description: '+2 Attack/Damage, -4 AC, cannot flee' },
  { id: 'cleave', name: 'Cleave', description: 'Kill foe in melee, extra attack vs adjacent foe at -2' },
  { id: 'defender', name: 'Defender', description: 'Foe in melee suffers -2 Attack vs characters other than fighter' },
  { id: 'last-stand', name: 'Last Stand', description: 'Continue acting 5 Rounds after death (0 HP), Save vs Doom on further damage' },
  { id: 'leader', name: 'Leader', description: 'Retainers/mercenaries within 60\' get +1 Morale/Loyalty; allies +2 save vs fear' },
  { id: 'main-gauche', name: 'Main Gauche', description: 'Small off-hand weapon gives +1 AC or +1 Attack (choose each round)' },
  { id: 'slayer', name: 'Slayer', description: '+1 Attack/Damage vs specific creature type (repeatable for different types)' },
  { id: 'weapon-specialist', name: 'Weapon Specialist', description: '+1 Attack/Damage with specific weapon type (repeatable for different weapons)' },
] as const;

export const FIGHTER_TALENT_LEVELS = [2, 6, 10, 14];

export function getFighterTalentCount(level: number): number {
  return FIGHTER_TALENT_LEVELS.filter(l => level >= l).length;
}

// ──────────────────────────────────────────────────────────
// Enchanter / Kindred-Class Glamour Counts
// Source: docs/rules/03-classes.md, docs/rules/04-kindred-classes.md
// ──────────────────────────────────────────────────────────

export const ENCHANTER_GLAMOUR_COUNT: Record<number, number> = {
  1:1, 2:2, 3:3, 4:3, 5:4, 6:5, 7:6, 8:6, 9:7, 10:7, 11:8, 12:8, 13:9, 14:9, 15:10,
};

export const KINDRED_GLAMOUR_COUNT: Record<string, Record<number, number>> = {
  elf: { 1:1, 2:2, 3:3, 4:3, 5:4, 6:5, 7:6, 8:6, 9:7, 10:7, 11:8, 12:8, 13:9, 14:9, 15:10 },
  grimalkin: { 1:1, 2:2, 3:3, 4:3, 5:4, 6:5, 7:6, 8:6, 9:7, 10:7, 11:8, 12:8, 13:9, 14:9, 15:10 },
};

// ──────────────────────────────────────────────────────────
// Breggle Gaze Per Day
// Source: docs/rules/04-kindred-classes.md
// ──────────────────────────────────────────────────────────

export const BREGGLE_GAZE_PER_DAY: Record<number, number> = {
  1:0, 2:0, 3:0, 4:1, 5:1, 6:2, 7:2, 8:3, 9:3, 10:4, 11:4, 12:4, 13:5, 14:5, 15:5,
};

// ──────────────────────────────────────────────────────────
// Breggle Horn Progression
// Source: docs/rules/02-kindreds.md, docs/rules/04-kindred-classes.md
// ──────────────────────────────────────────────────────────

export const BREGGLE_HORN_PROGRESSION: { level: number; length: string; damage: string }[] = [
  { level: 1,  length: '1"',  damage: '1d4' },
  { level: 2,  length: '2"',  damage: '1d4' },
  { level: 3,  length: '3"',  damage: '1d4+1' },
  { level: 4,  length: '4"',  damage: '1d4+1' },
  { level: 5,  length: '6"',  damage: '1d4+1' },
  { level: 6,  length: '8"',  damage: '1d6' },
  { level: 7,  length: '10"', damage: '1d6' },
  { level: 8,  length: '12"', damage: '1d6' },
  { level: 9,  length: '14"', damage: '1d6+1' },
  { level: 10, length: '16"', damage: '1d6+2' },
];

export function getBregggleHornData(level: number): { length: string; damage: string } {
  if (level >= 10) return { length: '16"', damage: '1d6+2' };
  const entry = BREGGLE_HORN_PROGRESSION.find(h => h.level === level);
  return entry ? { length: entry.length, damage: entry.damage } : { length: '1"', damage: '1d4' };
}

export function createDefaultCharacter(): Character {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
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
    skillTargets: { listen: 6, search: 6, survival: 6 },
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
