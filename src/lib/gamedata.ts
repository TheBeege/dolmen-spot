import { KindredInfo, ClassInfo, Character, CalendarDate, KindredId, ClassId, AbilityScores as AbilityScoresType, AdvancementRow, ClassAdvancementTable, SkillProgressionTable, Coins, FeatureProfile } from './types';
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

export const MOON_PHASES = ['Waxing', 'Full', 'Waning'] as const;

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
  { name: 'Grimvold', season: 'Winter', days: 30, description: 'The Onset of Winter', moonName: 'Grinning moon', wysendays: ['Hanglemas', "Dyboll's Day"] },
  { name: 'Lymewald', season: 'Winter', days: 28, description: 'Deep Winter', moonName: 'Dead moon', wysendays: [] as string[] },
  { name: 'Haggryme', season: 'Winter', days: 30, description: 'The Fading of Winter', moonName: 'Beast moon', wysendays: ["Yarl's Day", 'Day of Virgins'] },
  { name: 'Symswald', season: 'Spring', days: 29, description: 'The Onset of Spring', moonName: 'Squamous moon', wysendays: ['Hopfast'] },
  { name: 'Harchment', season: 'Spring', days: 29, description: 'High Spring', moonName: "Knight's moon", wysendays: ['Smithing'] },
  { name: 'Iggwyld', season: 'Spring', days: 30, description: 'The Fading of Spring', moonName: 'Rotting moon', wysendays: ['Shortening', "Longshank's Day"] },
  { name: 'Chysting', season: 'Summer', days: 31, description: 'The Onset of Summer', moonName: "Maiden's moon", wysendays: ['Bradging', 'Copsewallow', 'Chalice'] },
  { name: 'Lillipythe', season: 'Summer', days: 29, description: 'High Summer', moonName: "Witch's moon", wysendays: ["Old Dobey's Day"] },
  { name: 'Haelhold', season: 'Summer', days: 28, description: 'The Fading of Summer', moonName: "Robber's moon", wysendays: [] as string[] },
  { name: 'Reedwryme', season: 'Autumn', days: 30, description: 'The Onset of Autumn', moonName: 'Goat moon', wysendays: ["Shub's Eve", 'Druden Day'] },
  { name: 'Obthryme', season: 'Autumn', days: 28, description: 'Deep Autumn', moonName: 'Narrow moon', wysendays: [] as string[] },
  { name: 'Braghold', season: 'Autumn', days: 30, description: 'The Fading of Autumn', moonName: 'Black moon', wysendays: ['Day of Doors', 'Dolmenday'] },
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
    { month: 3, day: 2, name: 'Feast of Cats' },
    { month: 3, day: 29, name: 'Hopfast' },
    { month: 4, day: 29, name: 'Smithing' },
    { month: 5, day: 29, name: 'Shortening' },
    { month: 5, day: 30, name: "Longshank's Day" },
    { month: 6, day: 29, name: 'Bradging' },
    { month: 6, day: 30, name: 'Copsewallow' },
    { month: 6, day: 31, name: 'Chalice' },
    { month: 7, day: 29, name: "Old Dobey's Day" },
    { month: 9, day: 25, name: 'Feast of St Clewyd' },
    { month: 9, day: 29, name: "Shub's Eve" },
    { month: 9, day: 30, name: 'Druden Day / Festival of the Green Man' },
    { month: 11, day: 29, name: 'Day of Doors' },
    { month: 11, day: 30, name: 'Dolmenday - The Hunting of the Winter Hart' },
  ],
};

export const FESTIVAL_DESCRIPTIONS: Record<string, string> = {
  'Festival of the Green Man': 'Ancient worship relic. Manikins of moss and wood are hung by their ankles from branches in every village.',
  'The Hunting of the Winter Hart': 'A white fairy stag rushes through Dolmenwood. If caught, winter is banished for a year.',
  'Feast of Cats': 'Spring dances and fiddle tunes. All participants wear cat masks.',
  'Feast of St Clewyd': 'Patron saint of Dolmenwood. Unicorn-effigy bonfires and spiced pies.',
};

export const CELESTIAL_EVENTS: { month: number; day: number; name: string }[] = [
  { month: 0, day: 19, name: 'Winter Solstice' },
  { month: 3, day: 20, name: 'Vernal Equinox' },
  { month: 6, day: 18, name: 'Summer Solstice' },
  { month: 9, day: 19, name: 'Autumnal Equinox' },
];

// ──────────────────────────────────────────────────────────
// Moon Phase Calculator
// Lunar cycle: 29⅓ days (13 waxing / 3 full / 13 waning)
// ──────────────────────────────────────────────────────────

export function getDayOfYear(date: CalendarDate): number {
  let total = 0;
  for (let i = 0; i < date.month; i++) {
    total += MONTHS[i].days;
  }
  return total + date.day;
}

export function getMoonPhase(date: CalendarDate): { phase: 'waxing' | 'full' | 'waning'; dayInCycle: number } {
  const doy = getDayOfYear(date);
  // 29⅓ day cycle — use 88/3 for precision
  const cycleDay = ((doy - 1) % 29) + 1; // 1–29 within cycle (simplified from 29⅓)
  if (cycleDay <= 13) return { phase: 'waxing', dayInCycle: cycleDay };
  if (cycleDay <= 16) return { phase: 'full', dayInCycle: cycleDay };
  return { phase: 'waning', dayInCycle: cycleDay };
}

export function getMoonPhaseLabel(date: CalendarDate): string {
  const { phase } = getMoonPhase(date);
  switch (phase) {
    case 'waxing': return 'Waxing';
    case 'full': return 'Full';
    case 'waning': return 'Waning';
  }
}

// ──────────────────────────────────────────────────────────
// Noble Houses of Dolmenwood
// Source: docs/rules/09-appendices.md
// ──────────────────────────────────────────────────────────

export interface NobleHouse {
  name: string;
  alignment: 'Lawful' | 'Neutral' | 'Chaotic';
  head: string;
  seat: string;
  character: string;
  ruling?: boolean;
}

export const NOBLE_HOUSES: NobleHouse[] = [
  { name: 'House Brackenwold', alignment: 'Lawful', head: 'Duke Thespian III', seat: 'Castle Brackenwold', character: 'Ruling house of the Duchy', ruling: true },
  { name: 'House Guillefer', alignment: 'Neutral', head: 'Edwin Guillefer', seat: 'Hall of Sleep', character: 'Dreamy, poet, harpist' },
  { name: 'House Harrowmoor', alignment: 'Lawful', head: 'Lady Theatrice', seat: 'Harrowmoor Keep', character: 'Famed intellect, cool-headed' },
  { name: 'House Hogwarsh', alignment: 'Neutral', head: 'Baron Sagewine', seat: 'High-Hankle', character: 'Lax, debauched' },
  { name: 'House Malbleat', alignment: 'Chaotic', head: 'Lord Gryphius (breggle)', seat: 'Redwraith Manor', character: 'Cruel aesthete' },
  { name: 'House Mulbreck', alignment: 'Lawful', head: 'Lady Pulsephine', seat: 'Bogwitt Manor', character: 'Reclusive, mourning' },
  { name: 'House Murkin', alignment: 'Chaotic', head: 'Lord Simeone (breggle/human)', seat: 'Kolstoke Keep', character: 'Boorish, conquest-driven' },
  { name: 'House Nodlock', alignment: 'Neutral', head: 'Lord Harald', seat: 'Nodding Castle', character: 'Slovenly, volatile' },
  { name: 'House Ramius', alignment: 'Neutral', head: 'Lord Shadgore (breggle)', seat: 'Castle Everdusk', character: 'Brilliant, ambitious' },
];

// ──────────────────────────────────────────────────────────
// Religions of Dolmenwood
// Source: docs/rules/09-appendices.md
// ──────────────────────────────────────────────────────────

export interface Religion {
  name: string;
  type: string;
  deity: string;
  holySymbol: string;
  holyText: string;
  notes: string;
}

export const RELIGIONS: Religion[] = [
  {
    name: 'Pluritine Church',
    type: 'Monotheistic, evangelistic',
    deity: 'Nameless "One True God"',
    holySymbol: 'The Chapes (circle with 5 rays)',
    holyText: 'Pragmaphon',
    notes: 'Veneration of saints as intermediaries. Hierarchy: Archbishop > Bishop > Abbot > Commander > Vicar > Curate. Holy Orders: St Faxis (seekers), St Sedge (defenders), St Signis (lichwards).',
  },
  {
    name: 'Gwyrae (Old Religion)',
    type: 'Polytheistic nature worship (mostly dead)',
    deity: 'Dozens of "Wood Gods" — only the Green Man remains in memory',
    holySymbol: 'Cruciform oak',
    holyText: '—',
    notes: 'Suppressed by the Pluritine Church, survives in folk practices and witch covens.',
  },
  {
    name: 'Aud Frengd Hlerr',
    type: 'Ancestor veneration (Breggle)',
    deity: 'Semi-mythical ancestor Hraigl',
    holySymbol: 'Ring of horns',
    holyText: 'The Hlerrllaindr',
    notes: 'Compatible with other religions. More philosophy than religion.',
  },
  {
    name: 'Mogba',
    type: 'Polytheistic, nature/decay (Mossling)',
    deity: 'Mbombre, Blosquom, Splobgra',
    holySymbol: 'Toadstool with one or more eyes',
    holyText: 'Hwogm (oral tradition)',
    notes: 'World sits on cosmic puffball on back of toad Hwogra. Mould oracles serve as hermit-priests.',
  },
];

// ──────────────────────────────────────────────────────────
// Beverages & Inebriation
// Source: docs/rules/09-appendices.md
// ──────────────────────────────────────────────────────────

export interface Beverage {
  name: string;
  type: 'Beer' | 'Cider' | 'Mead' | 'Spirit' | 'Tea' | 'Wine';
  cost: string;
  alcoholic: boolean;
}

export const BEVERAGES: Beverage[] = [
  // Common (d8)
  { name: 'Barrowblaster', type: 'Beer', cost: '9cp', alcoholic: true },
  { name: "Keye's Balm", type: 'Beer', cost: '1sp', alcoholic: true },
  { name: 'Marrowhyte Dark', type: 'Beer', cost: '2sp', alcoholic: true },
  { name: "Pilston's Heartbreaker", type: 'Beer', cost: '4cp', alcoholic: true },
  { name: "Bard's Cordial", type: 'Spirit', cost: '2sp', alcoholic: true },
  { name: 'Old Swythener', type: 'Spirit', cost: '5cp', alcoholic: true },
  { name: 'Prigwort Tipple', type: 'Spirit', cost: '3sp', alcoholic: true },
  { name: "Mason's", type: 'Tea', cost: '1cp', alcoholic: false },
  // Uncommon (d20)
  { name: 'Cobsworth Pale', type: 'Beer', cost: '5sp', alcoholic: true },
  { name: "Halthwidden's", type: 'Beer', cost: '3sp', alcoholic: true },
  { name: 'Merryweather', type: 'Beer', cost: '4sp', alcoholic: true },
  { name: 'Tithelands Cider', type: 'Cider', cost: '2sp', alcoholic: true },
  { name: 'Glubwob', type: 'Mead', cost: '2sp', alcoholic: true },
  { name: 'Mead', type: 'Mead', cost: '12sp', alcoholic: true },
  { name: 'Distillation of Dusk', type: 'Spirit', cost: '7sp', alcoholic: true },
  { name: 'Ether of Blue', type: 'Spirit', cost: '5sp', alcoholic: true },
  { name: 'Pokey Nog', type: 'Spirit', cost: '5sp', alcoholic: true },
  { name: "Porrid's Full Moon", type: 'Spirit', cost: '1sp', alcoholic: true },
  { name: 'The Night Liqueur', type: 'Spirit', cost: '6sp', alcoholic: true },
  { name: "Wakelyke's Scarlet", type: 'Spirit', cost: '4cp', alcoholic: true },
  { name: 'Earl Yellow', type: 'Tea', cost: '5cp', alcoholic: false },
  { name: 'Buckston Fizz', type: 'Wine', cost: '12sp', alcoholic: true },
  { name: "Faggley's Iced", type: 'Wine', cost: '14sp', alcoholic: true },
  { name: 'Inkling Wine', type: 'Wine', cost: '11sp', alcoholic: true },
  // Rare (d12)
  { name: "Moon's Milk", type: 'Mead', cost: '2sp', alcoholic: true },
  { name: 'Nippers', type: 'Mead', cost: '5sp', alcoholic: true },
  { name: "Lord Oberon's Ambrosial", type: 'Spirit', cost: '1gp', alcoholic: true },
  { name: 'Prigwort Pure', type: 'Spirit', cost: '7sp', alcoholic: true },
  { name: 'Purple Aspintheon', type: 'Spirit', cost: '1gp', alcoholic: true },
  { name: "Tomfoy's", type: 'Tea', cost: '1sp', alcoholic: false },
  { name: 'Lady Mauve', type: 'Wine', cost: '3gp', alcoholic: true },
  { name: 'The Cold Prince', type: 'Wine', cost: '35sp', alcoholic: true },
  { name: "Underbrood's Vintage", type: 'Wine', cost: '5gp', alcoholic: true },
];

export const BEVERAGE_RARITY = {
  common: BEVERAGES.slice(0, 8),
  uncommon: BEVERAGES.slice(8, 24),
  rare: BEVERAGES.slice(24),
};

export const INEBRIATION_LEVELS = [
  { level: 'Tipsy', effect: 'Beverage effect noticeable. -1 Attack' },
  { level: 'Drunk', effect: 'Full beverage effect. -1 Attack/saves. +1d4 bonus HP' },
  { level: 'Groggy', effect: 'Full effect. -2 Attack/saves. Bonus HP remain' },
  { level: 'Unconscious', effect: 'Pass out' },
];

// ──────────────────────────────────────────────────────────
// Herbs & Fungi Catalog (detailed)
// Source: docs/rules/09-appendices.md, 06-equipment.md
// ──────────────────────────────────────────────────────────

export interface HerbEntry {
  name: string;
  cost: string;
  type: 'Herb' | 'Fungus';
  weight: number;
  effect: string;
}

export const HERBS_CATALOG: HerbEntry[] = [
  { name: 'Arrowhame', cost: '100gp', type: 'Herb', weight: 4, effect: 'Save vs Doom to cure magical disease' },
  { name: 'Blood Canker', cost: '50gp', type: 'Fungus', weight: 4, effect: 'Heal 1d3 HP; 2-in-6 lose 1 CON' },
  { name: "Bosun's Balm", cost: '50gp', type: 'Herb', weight: 4, effect: 'Halve armour encumbrance for 1 day' },
  { name: 'Fenob', cost: '40gp', type: 'Herb', weight: 4, effect: '+1 HP overnight healing' },
  { name: 'Gillywort', cost: '50gp', type: 'Herb', weight: 4, effect: 'Detect poison in liquid (3-in-6)' },
  { name: "Grue's Ear", cost: '200gp', type: 'Fungus', weight: 4, effect: 'Enhanced alertness (3-in-6 act in surprise)' },
  { name: 'Hogscap', cost: '125gp', type: 'Fungus', weight: 4, effect: 'Detect magic by touch for 1 Turn' },
  { name: 'Lankswith', cost: '15gp', type: 'Herb', weight: 4, effect: 'Cure common ailments overnight' },
  { name: 'Lilywhite', cost: '25gp', type: 'Herb', weight: 4, effect: '+1 to sleep CON check' },
  { name: 'Marshwick', cost: '200gp', type: 'Herb', weight: 4, effect: 'Save vs Doom to neutralise animal venom' },
  { name: 'Moonhaw', cost: '100gp', type: 'Fungus', weight: 4, effect: "See 10' in total darkness for 3 Turns" },
  { name: 'Ofteritch', cost: '150gp', type: 'Herb', weight: 4, effect: 'Save vs Doom to neutralise plant poison' },
  { name: 'Sallow Parsley', cost: '80gp', type: 'Herb', weight: 4, effect: '+2 HP on rest day' },
  { name: 'Smottlebread', cost: '25gp', type: 'Fungus', weight: 4, effect: '+2 to saves vs magic (1d6 Turns)' },
  { name: 'Spirithame', cost: '80gp', type: 'Herb', weight: 4, effect: 'Heal 1d2 HP (1 dose/day)' },
  { name: 'Tom-a-Merry', cost: '150gp', type: 'Fungus', weight: 4, effect: 'See invisible (1d6 Turns, -2 Attack/saves)' },
  { name: 'Wallowmost', cost: '150gp', type: 'Fungus', weight: 4, effect: 'Save vs Doom to neutralise fungal poison' },
  { name: 'Wayfarrow', cost: '100gp', type: 'Herb', weight: 4, effect: '3-in-6 no forced march penalty' },
  { name: "Witch's Oyster", cost: '50gp', type: 'Fungus', weight: 4, effect: 'Oracular vision (accuracy varies)' },
  { name: 'Wolfsbane', cost: '25gp', type: 'Herb', weight: 4, effect: 'Werewolves Save vs Doom to attack bearer' },
];

// ──────────────────────────────────────────────────────────
// Pipeleaf
// Source: Player's Book pages 128-129
// ──────────────────────────────────────────────────────────

export interface PipeleafEntry {
  name: string;
  cost: string;
  availability: string;
  effect: string;
}

export const PIPELEAF: PipeleafEntry[] = [
  { name: 'Barley Blend', cost: '4cp', availability: 'Always', effect: 'Aids digestion after a heavy meal' },
  { name: "Burglar's Blend", cost: '3cp', availability: '3-in-6', effect: 'Keeps one awake in the dead of night' },
  { name: "Crofter's Daughter", cost: '5cp', availability: 'Always', effect: "Makes one feel happy with one's lot" },
  { name: 'Dusty Abbot', cost: '2sp', availability: '1-in-6', effect: 'Elicits a state of jovial eloquence' },
  { name: 'Fatty Lumper', cost: '7cp', availability: '3-in-6', effect: 'Brings on a ravenous appetite' },
  { name: 'Flufftop', cost: '1sp', availability: '3-in-6', effect: 'Brings on a state of light-hearted whimsy' },
  { name: 'Gamgy Weed', cost: '5cp', availability: 'Always', effect: 'Causes a heavy sleepiness' },
  { name: "The Gibbet's Gift", cost: '7cp', availability: '3-in-6', effect: 'Aids following through with unpleasant decisions' },
  { name: 'Green Jenny', cost: '8cp', availability: '3-in-6', effect: 'Vision takes on a green tinge (excessive use)' },
  { name: 'Lanksbottom Leaf', cost: '6cp', availability: 'Always', effect: 'Brings on a state of merry arrogance' },
  { name: 'Mogglemoss', cost: '18cp', availability: '3-in-6', effect: 'Introspective state; obscure may become clear' },
  { name: "Mummer's Farce", cost: '8cp', availability: 'Always', effect: 'Inspires jollity and hijinks' },
  { name: 'Old Doby', cost: '6cp', availability: 'Always', effect: 'Calms the nerves and lightens the spirit' },
  { name: 'Pedlar Puff', cost: '7cp', availability: 'Always', effect: 'Enhances determination of foot-travellers' },
  { name: 'Shaggy Pony', cost: '7cp', availability: 'Always', effect: 'Aids deep and restful sleep' },
  { name: 'Special Shag', cost: '3sp', availability: '3-in-6', effect: 'Enhances good judgement in trying times' },
  { name: 'Speckled Wyrm', cost: '25cp', availability: '3-in-6', effect: 'Brings about a state of intent concentration' },
  { name: 'Wayside Wisp', cost: '25cp', availability: '1-in-6', effect: 'Brings on a state of wonder and glee' },
  { name: "Westling's Weed", cost: '2sp', availability: '1-in-6', effect: 'Inspires dreams of travel and adventure' },
  { name: "Witch's Shag", cost: '8cp', availability: '3-in-6', effect: 'Inspires a pleasant dizziness' },
];

export const PIPES = [
  { name: 'Bog-oak pipe', cost: '15gp', weight: 10 },
  { name: 'Cherry-wood pipe', cost: '5gp', weight: 10 },
  { name: 'Clay pipe', cost: '1gp', weight: 10 },
  { name: 'Gourd pipe (mossling style)', cost: '2gp', weight: 10 },
];

// ──────────────────────────────────────────────────────────
// Food & Lodgings Menu
// Source: Player's Book pages 124-125
// ──────────────────────────────────────────────────────────

export interface FoodMenuItem {
  name: string;
  cost: string;
  category: 'main' | 'side' | 'dessert' | 'lodging' | 'service';
}

export interface FoodMenuTier {
  tier: 'Poor' | 'Common' | 'Fancy';
  dailyAvailability: string;
  items: FoodMenuItem[];
}

export const FOOD_MENU: FoodMenuTier[] = [
  {
    tier: 'Poor',
    dailyAvailability: '1-2 mains + 1 side',
    items: [
      { name: 'Battered pizzle', cost: '1sp', category: 'main' },
      { name: 'Blood porridge', cost: '1sp', category: 'main' },
      { name: 'Bubble and squeak', cost: '1sp', category: 'main' },
      { name: "Dregger's pie", cost: '1sp', category: 'main' },
      { name: "Fisher's gruel", cost: '1sp', category: 'main' },
      { name: 'Roast wellington', cost: '1sp', category: 'main' },
      { name: 'Special pasty', cost: '1sp', category: 'main' },
      { name: 'Woad in the hole', cost: '1sp', category: 'main' },
      { name: 'Codswallop', cost: '5cp', category: 'side' },
      { name: "Pig's ear", cost: '5cp', category: 'side' },
      { name: 'Sourcroute', cost: '5cp', category: 'side' },
      { name: 'Wormskin', cost: '5cp', category: 'side' },
      { name: 'Common room floor, 1 night', cost: '2cp', category: 'lodging' },
      { name: 'Shared room (8 beds), 1 night', cost: '1sp', category: 'lodging' },
      { name: 'Shared room (4 beds), 1 night', cost: '2sp', category: 'lodging' },
      { name: 'Stabling and fodder, 1 night', cost: '2sp', category: 'service' },
    ],
  },
  {
    tier: 'Common',
    dailyAvailability: '2-3 mains + 1-2 sides',
    items: [
      { name: 'Mutton roast', cost: '3sp', category: 'main' },
      { name: 'Onion sandwich', cost: '3sp', category: 'main' },
      { name: "Pook's pudding", cost: '3sp', category: 'main' },
      { name: 'Puggle pie', cost: '3sp', category: 'main' },
      { name: 'Sausage and mash', cost: '3sp', category: 'main' },
      { name: 'Shanky', cost: '3sp', category: 'main' },
      { name: 'Snail skewers', cost: '3sp', category: 'main' },
      { name: 'Trottel mash', cost: '3sp', category: 'main' },
      { name: 'Pickled eggs', cost: '2sp', category: 'side' },
      { name: 'Coldlanks', cost: '2sp', category: 'side' },
      { name: 'Hameth sprats', cost: '2sp', category: 'side' },
      { name: 'Ruddy chad', cost: '2sp', category: 'side' },
      { name: 'Common room floor, 1 night', cost: '5cp', category: 'lodging' },
      { name: 'Shared room (2 beds), 1 night', cost: '4sp', category: 'lodging' },
      { name: 'Private room, 1 night', cost: '8sp', category: 'lodging' },
      { name: 'Bath in private room', cost: '5sp', category: 'service' },
      { name: 'Stabling and fodder, 1 night', cost: '4sp', category: 'service' },
    ],
  },
  {
    tier: 'Fancy',
    dailyAvailability: '3-4 mains + 1-2 sides + 1-2 desserts',
    items: [
      { name: 'Blackbird pie', cost: '2gp', category: 'main' },
      { name: 'Brathering', cost: '2gp', category: 'main' },
      { name: 'Jellied lamprey', cost: '2gp', category: 'main' },
      { name: 'Longmere pike', cost: '2gp', category: 'main' },
      { name: 'Maids-o\'-the-lake', cost: '2gp', category: 'main' },
      { name: 'Roast lurkey', cost: '2gp', category: 'main' },
      { name: 'Unicorn rump', cost: '2gp', category: 'main' },
      { name: 'Whole suckling pig', cost: '2gp', category: 'main' },
      { name: 'Larks\' tongues in aspic', cost: '15sp', category: 'side' },
      { name: 'Old Shuck', cost: '15sp', category: 'side' },
      { name: 'Sparrey', cost: '15sp', category: 'side' },
      { name: 'Vinegared troll moss', cost: '15sp', category: 'side' },
      { name: 'Fondant pastries', cost: '2gp', category: 'dessert' },
      { name: 'Sugared plums', cost: '2gp', category: 'dessert' },
      { name: 'Trifle', cost: '2gp', category: 'dessert' },
      { name: 'Walnut tarts', cost: '2gp', category: 'dessert' },
      { name: 'Private room, 1 night', cost: '1gp', category: 'lodging' },
      { name: 'Double room, 1 night', cost: '2gp', category: 'lodging' },
      { name: 'Private suite, 1 night', cost: '5gp', category: 'lodging' },
      { name: 'Bath in private room', cost: '4sp', category: 'service' },
      { name: 'Personal services', cost: '1gp', category: 'service' },
      { name: 'Private dining room', cost: '1gp/person', category: 'service' },
      { name: 'Stabling and fodder, 1 night', cost: '6sp', category: 'service' },
    ],
  },
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
  { name: 'Battle axe', damage: '1d8', cost: 7, weight: 100, size: 'M', slots: 1 },
  { name: 'Club', damage: '1d4', cost: 3, weight: 20, size: 'M', slots: 1 },
  { name: 'Crossbow', damage: '1d8', cost: 30, weight: 50, size: 'M', slots: 1 },
  { name: 'Dagger', damage: '1d4', cost: 3, weight: 10, size: 'S', slots: 1 },
  { name: 'Hand axe', damage: '1d6', cost: 4, weight: 20, size: 'S', slots: 1 },
  { name: 'Lance', damage: '1d6', cost: 5, weight: 100, size: 'L', slots: 2 },
  { name: 'Longbow', damage: '1d6', cost: 40, weight: 40, size: 'L', slots: 1 },
  { name: 'Longsword', damage: '1d8', cost: 10, weight: 30, size: 'M', slots: 1 },
  { name: 'Mace', damage: '1d6', cost: 5, weight: 40, size: 'M', slots: 1 },
  { name: 'Polearm', damage: '1d10', cost: 7, weight: 140, size: 'L', slots: 2 },
  { name: 'Shortbow', damage: '1d6', cost: 25, weight: 20, size: 'M', slots: 1 },
  { name: 'Shortsword', damage: '1d6', cost: 7, weight: 20, size: 'M', slots: 1 },
  { name: 'Sling', damage: '1d4', cost: 2, weight: 10, size: 'S', slots: 1 },
  { name: 'Spear', damage: '1d6', cost: 3, weight: 30, size: 'M', slots: 1 },
  { name: 'Staff', damage: '1d4', cost: 2, weight: 40, size: 'M', slots: 2 },
  { name: 'Two-handed sword', damage: '1d10', cost: 15, weight: 140, size: 'L', slots: 2 },
  { name: 'War hammer', damage: '1d6', cost: 5, weight: 40, size: 'M', slots: 1 },
];

// Legacy alias – kept for backwards compatibility during transition
export const ADVENTURING_GEAR = [
  { name: 'Backpack', cost: 4 }, { name: 'Bedroll', cost: 2 },
  { name: 'Belt pouch', cost: 1 }, { name: 'Candles (10)', cost: 1 },
  { name: 'Cooking pots', cost: 3 }, { name: 'Crowbar', cost: 10 },
  { name: 'Grappling hook', cost: 20 }, { name: 'Hammer (small)', cost: 2 },
  { name: 'Holy symbol (wooden)', cost: 10 }, { name: 'Holy water (vial)', cost: 20 },
  { name: 'Iron spikes (12)', cost: 1 }, { name: 'Lantern (hooded)', cost: 5 },
  { name: 'Lantern (bullseye)', cost: 10 }, { name: 'Oil (flask)', cost: 1 },
  { name: 'Rations (fresh, 1 day)', cost: 1 }, { name: 'Rations (preserved, 1 day)', cost: 2 },
  { name: 'Rope (50\')', cost: 50 }, { name: 'Sack', cost: 1 },
  { name: 'Tinder box', cost: 3 }, { name: 'Torches (3)', cost: 1 },
  { name: 'Waterskin', cost: 1 }, { name: 'Thieves\' tools', cost: 25 },
  { name: 'Tent', cost: 20 }, { name: 'Fishing rod and tackle', cost: 4 },
];

// ──────────────────────────────────────────────────────────
// Equipment Catalog (full data with weight/slots)
// Source: docs/rules/06-equipment.md, docs/rules/08-adventuring.md
// ──────────────────────────────────────────────────────────

export interface EquipmentEntry {
  name: string;
  cost: number;          // in gp unless costUnit says otherwise
  costUnit?: string;     // 'cp' or 'free' for sub-gp items, default 'gp'
  weight: number;        // in coins (10 coins = 1 pound)
  slots: number;         // for slot-based encumbrance
  category: 'container' | 'light' | 'camping' | 'tool' | 'clothing' | 'holy' | 'ammunition' | 'herb';
  capacity?: number;     // containers only, max weight in coins
  notes?: string;
}

export const EQUIPMENT_CATALOG: EquipmentEntry[] = [
  // ── Containers ──
  { name: 'Backpack', cost: 4, weight: 100, slots: 0, category: 'container', capacity: 400 },
  { name: 'Barrel', cost: 1, weight: 25, slots: 2, category: 'container', capacity: 3200, notes: '320 pints' },
  { name: 'Belt pouch', cost: 1, weight: 5, slots: 0, category: 'container', capacity: 50 },
  { name: 'Bucket', cost: 1, weight: 25, slots: 1, category: 'container', capacity: 400, notes: '40 pints' },
  { name: 'Casket (iron, large)', cost: 30, weight: 400, slots: 2, category: 'container', capacity: 800 },
  { name: 'Casket (iron, small)', cost: 10, weight: 100, slots: 2, category: 'container', capacity: 250 },
  { name: 'Chest (wooden, large)', cost: 5, weight: 200, slots: 2, category: 'container', capacity: 1000 },
  { name: 'Chest (wooden, small)', cost: 1, weight: 50, slots: 2, category: 'container', capacity: 300 },
  { name: 'Sack', cost: 1, weight: 50, slots: 0, category: 'container', capacity: 600, notes: 'Weight when full' },
  { name: 'Scroll case', cost: 1, weight: 5, slots: 0, category: 'container', capacity: 1, notes: '1 scroll' },
  { name: 'Vial (glass)', cost: 1, weight: 1, slots: 0, category: 'container', capacity: 5, notes: '1/2 pint' },
  { name: 'Waterskin', cost: 1, weight: 5, slots: 1, category: 'container', capacity: 20, notes: '2 pints, weight when empty' },

  // ── Light Sources ──
  { name: 'Candles (10)', cost: 1, weight: 20, slots: 1, category: 'light', notes: '5\' dim light, 1 hour each' },
  { name: 'Lantern (hooded)', cost: 5, weight: 20, slots: 1, category: 'light', notes: '30\' light, 4 hours/flask' },
  { name: 'Lantern (bullseye)', cost: 10, weight: 20, slots: 1, category: 'light', notes: '60\' beam, 4 hours/flask' },
  { name: 'Oil (flask)', cost: 1, weight: 10, slots: 1, category: 'light', notes: 'Fuel or weapon (3\' area, 1d8, 1 Turn)' },
  { name: 'Tinder box', cost: 3, weight: 10, slots: 1, category: 'light', notes: '2-in-6 in peril' },
  { name: 'Torches (3)', cost: 1, weight: 30, slots: 1, category: 'light', notes: '30\' light, 1 hour, usable in combat' },

  // ── Camping & Travel ──
  { name: 'Bedroll', cost: 2, weight: 70, slots: 1, category: 'camping' },
  { name: 'Cooking pots', cost: 3, weight: 100, slots: 1, category: 'camping' },
  { name: 'Firewood (bundle, 8hr)', cost: 1, weight: 200, slots: 2, category: 'camping' },
  { name: 'Fishing rod and tackle', cost: 4, weight: 50, slots: 1, category: 'camping' },
  { name: 'Rations (preserved, 1 day)', cost: 2, weight: 20, slots: 1, category: 'camping', notes: 'Lasts 2 months (1 week dank)' },
  { name: 'Rations (fresh, 1 day)', cost: 1, weight: 20, slots: 1, category: 'camping', notes: 'Lasts 1 week (1 day dank)' },
  { name: 'Tent', cost: 20, weight: 20, slots: 1, category: 'camping' },

  // ── Miscellaneous Tools ──
  { name: 'Bell (miniature)', cost: 1, weight: 1, slots: 0, category: 'tool' },
  { name: 'Block and tackle', cost: 5, weight: 50, slots: 1, category: 'tool' },
  { name: 'Caltrops (20)', cost: 1, weight: 20, slots: 1, category: 'tool', notes: 'Bundle of 20' },
  { name: 'Chain (10\')', cost: 30, weight: 100, slots: 1, category: 'tool' },
  { name: 'Chalk (10)', cost: 1, weight: 10, slots: 1, category: 'tool', notes: 'Bundle of 10' },
  { name: 'Chisel', cost: 2, weight: 10, slots: 1, category: 'tool' },
  { name: 'Crowbar', cost: 10, weight: 20, slots: 1, category: 'tool' },
  { name: 'Grappling hook', cost: 20, weight: 50, slots: 1, category: 'tool' },
  { name: 'Hammer (small)', cost: 2, weight: 40, slots: 1, category: 'tool' },
  { name: 'Hammer (sledge)', cost: 5, weight: 30, slots: 1, category: 'tool' },
  { name: 'Ink (vial)', cost: 1, weight: 5, slots: 0, category: 'tool' },
  { name: 'Iron spikes (12)', cost: 1, weight: 60, slots: 1, category: 'tool', notes: 'Bundle of 12' },
  { name: 'Lock', cost: 20, weight: 100, slots: 1, category: 'tool' },
  { name: 'Magnifying glass', cost: 3, weight: 20, slots: 1, category: 'tool' },
  { name: 'Manacles', cost: 15, weight: 100, slots: 1, category: 'tool' },
  { name: 'Marbles (20)', cost: 1, weight: 50, slots: 1, category: 'tool', notes: 'Bundle of 20' },
  { name: 'Mining pick', cost: 3, weight: 50, slots: 1, category: 'tool' },
  { name: 'Mirror (small)', cost: 5, weight: 50, slots: 1, category: 'tool' },
  { name: 'Musical instrument (stringed)', cost: 20, weight: 20, slots: 1, category: 'tool' },
  { name: 'Musical instrument (wind)', cost: 5, weight: 0, slots: 0, category: 'tool' },
  { name: 'Paper/parchment (2 sheets)', cost: 1, weight: 1, slots: 0, category: 'tool' },
  { name: 'Pole (10\')', cost: 1, weight: 70, slots: 2, category: 'tool' },
  { name: 'Quill', cost: 1, weight: 1, slots: 0, category: 'tool' },
  { name: 'Rope (50\')', cost: 50, weight: 200, slots: 1, category: 'tool' },
  { name: 'Rope ladder (25\')', cost: 25, weight: 20, slots: 1, category: 'tool' },
  { name: 'Saw', cost: 1, weight: 50, slots: 1, category: 'tool' },
  { name: 'Shovel', cost: 2, weight: 50, slots: 1, category: 'tool' },
  { name: 'Spell book (blank)', cost: 100, weight: 10, slots: 1, category: 'tool' },
  { name: 'Thieves\' tools', cost: 25, weight: 10, slots: 1, category: 'tool' },
  { name: 'Twine (100\')', cost: 1, weight: 1, slots: 0, category: 'tool' },
  { name: 'Whistle', cost: 5, weight: 1, slots: 0, category: 'tool' },

  // ── Clothing ──
  { name: 'Clothes, common', cost: 1, weight: 30, slots: 0, category: 'clothing' },
  { name: 'Clothes, extravagant', cost: 100, weight: 60, slots: 0, category: 'clothing' },
  { name: 'Clothes, fine', cost: 20, weight: 40, slots: 0, category: 'clothing' },
  { name: 'Habit, friar\'s', cost: 2, weight: 30, slots: 0, category: 'clothing' },
  { name: 'Robes, ritual', cost: 10, weight: 30, slots: 0, category: 'clothing' },
  { name: 'Winter cloak', cost: 2, weight: 20, slots: 0, category: 'clothing' },

  // ── Holy Items ──
  { name: 'Holy symbol (wooden)', cost: 10, weight: 5, slots: 0, category: 'holy' },
  { name: 'Holy symbol (silver)', cost: 70, weight: 25, slots: 0, category: 'holy', notes: '+1 to 2d6 turning roll' },
  { name: 'Holy symbol (gold)', cost: 50, weight: 100, slots: 1, category: 'holy', notes: '+1 to 2d4 undead affected' },
  { name: 'Holy water (vial)', cost: 20, weight: 25, slots: 1, category: 'holy', notes: '1d8 vs undead' },

  // ── Ammunition ──
  { name: 'Arrows (20)', cost: 5, weight: 20, slots: 1, category: 'ammunition' },
  { name: 'Quarrels (20)', cost: 10, weight: 20, slots: 1, category: 'ammunition' },
  { name: 'Sling stones (20)', cost: 0, costUnit: 'free', weight: 20, slots: 1, category: 'ammunition' },

  // ── Herbs & Fungi ──
  { name: 'Arrowhame', cost: 100, weight: 4, slots: 0, category: 'herb', notes: 'Save vs Doom to cure magical disease' },
  { name: 'Blood Canker', cost: 50, weight: 4, slots: 0, category: 'herb', notes: 'Heal 1d3 HP; 2-in-6 lose 1 CON' },
  { name: 'Bosun\'s Balm', cost: 50, weight: 4, slots: 0, category: 'herb', notes: 'Halve armour encumbrance for 1 day' },
  { name: 'Fenob', cost: 40, weight: 4, slots: 0, category: 'herb', notes: '+1 HP overnight healing' },
  { name: 'Gillywort', cost: 50, weight: 4, slots: 0, category: 'herb', notes: 'Detect poison in liquid (3-in-6)' },
  { name: 'Grue\'s Ear', cost: 200, weight: 4, slots: 0, category: 'herb', notes: 'Enhanced alertness (3-in-6 act in surprise)' },
  { name: 'Hogscap', cost: 125, weight: 4, slots: 0, category: 'herb', notes: 'Detect magic by touch for 1 Turn' },
  { name: 'Lankswith', cost: 15, weight: 4, slots: 0, category: 'herb', notes: 'Cure common ailments overnight' },
  { name: 'Lilywhite', cost: 25, weight: 4, slots: 0, category: 'herb', notes: '+1 to sleep CON check' },
  { name: 'Marshwick', cost: 200, weight: 4, slots: 0, category: 'herb', notes: 'Save vs Doom to neutralise animal venom' },
  { name: 'Moonhaw', cost: 100, weight: 4, slots: 0, category: 'herb', notes: 'See 10\' in total darkness for 3 Turns' },
  { name: 'Ofteritch', cost: 150, weight: 4, slots: 0, category: 'herb', notes: 'Save vs Doom to neutralise plant poison' },
  { name: 'Sallow Parsley', cost: 80, weight: 4, slots: 0, category: 'herb', notes: '+2 HP on rest day' },
  { name: 'Smottlebread', cost: 25, weight: 4, slots: 0, category: 'herb', notes: '+2 to saves vs magic (1d6 Turns)' },
  { name: 'Spirithame', cost: 80, weight: 4, slots: 0, category: 'herb', notes: 'Heal 1d2 HP (1 dose/day)' },
  { name: 'Tom-a-Merry', cost: 150, weight: 4, slots: 0, category: 'herb', notes: 'See invisible (1d6 Turns, -2 Attack/saves)' },
  { name: 'Wallowmost', cost: 150, weight: 4, slots: 0, category: 'herb', notes: 'Save vs Doom to neutralise fungal poison' },
  { name: 'Wayfarrow', cost: 100, weight: 4, slots: 0, category: 'herb', notes: '3-in-6 no forced march penalty' },
  { name: 'Witch\'s Oyster', cost: 50, weight: 4, slots: 0, category: 'herb', notes: 'Oracular vision (accuracy varies)' },
  { name: 'Wolfsbane', cost: 25, weight: 4, slots: 0, category: 'herb', notes: 'Werewolves Save vs Doom to attack bearer' },
];

// Equipment category display labels
export const EQUIPMENT_CATEGORIES: { id: EquipmentEntry['category']; label: string }[] = [
  { id: 'container', label: 'Containers' },
  { id: 'light', label: 'Light' },
  { id: 'camping', label: 'Camping' },
  { id: 'tool', label: 'Tools' },
  { id: 'clothing', label: 'Clothing' },
  { id: 'holy', label: 'Holy' },
  { id: 'ammunition', label: 'Ammo' },
  { id: 'herb', label: 'Herbs' },
];

// ──────────────────────────────────────────────────────────
// Coin Constants & Helpers
// ──────────────────────────────────────────────────────────

export const COIN_EXCHANGE = { copperPerSilver: 10, silverPerGold: 10, goldPerPellucidium: 5 };
export const COINS_PER_SLOT = 100;

export function getTotalCoinCount(coins: Coins): number {
  return coins.copper + coins.silver + coins.gold + coins.pellucidium;
}

export function getCoinWeight(coins: Coins): number {
  return getTotalCoinCount(coins);
}

export function getCoinSlots(coins: Coins): number {
  const total = getTotalCoinCount(coins);
  return total > 0 ? Math.ceil(total / COINS_PER_SLOT) : 0;
}

export function getCoinGpEquivalent(coins: Coins): number {
  return coins.pellucidium * 5 + coins.gold + coins.silver / 10 + coins.copper / 100;
}

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
// Phase 4: Skills System
// ──────────────────────────────────────────────────────────

// Kindred base skill overrides (default is 6 for listen/search/survival)
export const KINDRED_BASE_SKILL_OVERRIDES: Partial<Record<KindredId, Record<string, number>>> = {
  elf: { listen: 5, search: 5 },
  grimalkin: { listen: 5 },
  mossling: { survival: 5 },
  woodgrue: { listen: 5 },
};

// Class base skill overrides
export const CLASS_BASE_SKILL_OVERRIDES: Partial<Record<ClassId, Record<string, number>>> = {
  friar: { survival: 5 },
};

// Expertise points configuration for classes that use them
export const EXPERTISE_POINTS_CONFIG: Partial<Record<ClassId, { base: number; perLevel: number }>> = {
  bard: { base: 2, perLevel: 1 },
  hunter: { base: 2, perLevel: 1 },
  thief: { base: 4, perLevel: 2 },
};

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

// ──────────────────────────────────────────────────────────
// Grimalkin Forms
// Source: docs/rules/02-kindreds.md
// ──────────────────────────────────────────────────────────

export const GRIMALKIN_FORMS = {
  estray: { name: 'Estray', description: 'Humanoid cat form (normal)', ac: null, speed: null, attacks: null },
  chester: { name: 'Chester', description: 'Fat domestic cat', ac: 12, speed: 30, attacks: 'Bite + 2 claws (1 dmg each)' },
  wilder: { name: 'Wilder', description: 'Fey predator (1x/day, melee + below half HP)', ac: 13, speed: 30, attacks: 'Bite + 2 claws +2 Attack (1d4 each)', notes: 'Heals 2d6 HP on entry. Opponents -2 Attack. Lasts 2d4 Rounds. Cannot distinguish friend from foe.' },
} as const;

// ──────────────────────────────────────────────────────────
// Woodgrue Mad Revelry Melodies
// Source: docs/rules/02-kindreds.md
// ──────────────────────────────────────────────────────────

export const MAD_REVELRY_MELODIES = [
  { id: 'confide', name: 'Confide', effect: 'Subjects confess hidden emotions/secrets' },
  { id: 'dance', name: 'Dance', effect: 'Subjects dance in place (+1 AC, cannot move)' },
  { id: 'imbibe', name: 'Imbibe', effect: 'Subjects consume any available liquids, act drunk (-2 Attack)' },
  { id: 'jape', name: 'Jape', effect: 'Subjects mock the preceding occurrence' },
  { id: 'jubilate', name: 'Jubilate', effect: 'Irrepressible laughter, no speech, 1-in-6 chance of falling each Round' },
  { id: 'mount', name: 'Mount', effect: 'Subjects try to piggyback ride nearby creatures (Save vs Hold to resist)' },
  { id: 'revel', name: 'Revel', effect: 'Subjects bark terrible scats, half Speed if not heading toward woodgrue' },
] as const;

// ──────────────────────────────────────────────────────────
// Cleric Holy Orders
// Source: docs/rules/03-classes.md, docs/rules/09-appendices.md
// ──────────────────────────────────────────────────────────

export const CLERIC_HOLY_ORDERS = [
  { id: 'faxis', name: 'Order of St Faxis', title: 'Seekers', bonus: '+2 saves vs arcane magic; arcane casters suffer -2 saves vs your spells' },
  { id: 'sedge', name: 'Order of St Sedge', title: 'Defenders', bonus: 'Lay on hands 1x/day, heal 1 HP per cleric level' },
  { id: 'signis', name: 'Order of St Signis', title: 'Lichwards', bonus: '+1 Attack vs undead; attacks harm undead immune to non-magic weapons' },
] as const;

// ──────────────────────────────────────────────────────────
// Mossling Symbiotic Flesh d20 Table
// Source: docs/rules/02-kindreds.md
// ──────────────────────────────────────────────────────────

export const SYMBIOTIC_FLESH_TABLE = [
  { roll: 1, trait: 'Jelly fungus ears' },
  { roll: 2, trait: 'Patches of lichen' },
  { roll: 3, trait: 'Flowers bloom in beard (spring)' },
  { roll: 4, trait: 'Yeast infections' },
  { roll: 5, trait: 'Toadstools from joints' },
  { roll: 6, trait: 'Slimy green jelly coating' },
  { roll: 7, trait: 'Miniature tree from ear' },
  { roll: 8, trait: 'Skin riddled with mycelia' },
  { roll: 9, trait: 'Transparent yellow mould eyes' },
  { roll: 10, trait: 'Edible toe cheese' },
  { roll: 11, trait: 'Bracket fungus in armpits' },
  { roll: 12, trait: 'Mossy feet' },
  { roll: 13, trait: 'Climbing vines on limbs/torso' },
  { roll: 14, trait: 'Fern growth around groin' },
  { roll: 15, trait: 'Mossy biceps' },
  { roll: 16, trait: 'Puffball growths (buttocks/knees)' },
  { roll: 17, trait: 'Parsley chest hair' },
  { roll: 18, trait: 'Blackberry brambles in hair' },
  { roll: 19, trait: 'Edible mushrooms in hair' },
  { roll: 20, trait: 'Semi-sentient mushroom on head' },
] as const;

// ──────────────────────────────────────────────────────────
// Turning the Undead Reference
// Source: docs/rules/03-classes.md
// ──────────────────────────────────────────────────────────

export const TURNING_UNDEAD_TABLE = {
  results: [
    { range: '4-', effect: 'No effect' },
    { range: '5-6', effect: 'Stun 2d4 undead for 1 Round' },
    { range: '7-12', effect: 'Flee 2d4 undead for 1 Turn' },
    { range: '13+', effect: 'Destroy 2d4 undead' },
  ],
  levelModifier: '+2 per level below cleric (max +6), -2 per level above (max -6)',
  frequency: '1x per Turn',
} as const;

// ──────────────────────────────────────────────────────────
// Feature Profile Helper
// ──────────────────────────────────────────────────────────

export function getCharacterFeatureProfile(kindred: KindredId | '', classId: ClassId | '', level: number): FeatureProfile {
  const isKindredClass = kindred !== '' && kindred !== 'human' && !classId;

  return {
    hasHorns: kindred === 'breggle',
    hasGaze: kindred === 'breggle' && level >= 4,
    hasFormShift: kindred === 'grimalkin',
    hasMadRevelry: kindred === 'woodgrue',
    hasTrophies: classId === 'hunter' || (isKindredClass && kindred === 'woodgrue'),
    hasCompanion: classId === 'hunter',
    hasChivalricCode: classId === 'knight',
    hasCombatTalents: classId === 'fighter',
    hasHolyOrder: classId === 'cleric',
    hasSymbioticFlesh: kindred === 'mossling',
    hasFungalSymbiosis: kindred === 'mossling' && (isKindredClass || classId !== '') && level >= 4,
    hasTurning: classId === 'cleric' || classId === 'friar',
    hasRetainers: true,
  };
}

// ──────────────────────────────────────────────────────────
// Phase 2: Character Creation Accuracy
// ──────────────────────────────────────────────────────────

// 1a. Prime Ability Mapping
export const CLASS_PRIME_ABILITIES: Record<ClassId, (keyof AbilityScoresType)[]> = {
  bard: ['charisma', 'dexterity'],
  cleric: ['wisdom'],
  enchanter: ['charisma', 'intelligence'],
  fighter: ['strength'],
  friar: ['intelligence', 'wisdom'],
  hunter: ['constitution', 'dexterity'],
  knight: ['charisma', 'strength'],
  magician: ['intelligence'],
  thief: ['dexterity'],
};

// 1b. XP Modifier Calculation
export function getPrimeAbilityXpModifier(score: number): number {
  if (score <= 5) return -20;
  if (score <= 8) return -10;
  if (score <= 12) return 0;
  if (score <= 15) return 5;
  return 10;
}

export function calculateXpModifier(
  classId: ClassId | '',
  kindredId: KindredId | '',
  abilityScores: AbilityScoresType,
): { primeBonus: number; humanBonus: number; total: number } {
  if (!classId) return { primeBonus: 0, humanBonus: 0, total: 0 };

  const primeKeys = CLASS_PRIME_ABILITIES[classId];
  const lowestPrime = Math.min(...primeKeys.map(k => abilityScores[k]));
  const primeBonus = getPrimeAbilityXpModifier(lowestPrime);
  const humanBonus = kindredId === 'human' ? 10 : 0;

  return { primeBonus, humanBonus, total: primeBonus + humanBonus };
}

// 1c. Starting Equipment Tables
export interface StartingEquipmentEntry {
  roll: number[];
  result: string;
}

export interface StartingEquipmentTable {
  armour: StartingEquipmentEntry[];
  weapons: StartingEquipmentEntry[];
  weaponRolls: number; // how many d6 to roll for weapons
  classItems: string[];
  smallKindredNotes?: string;
}

export const STARTING_EQUIPMENT: Record<ClassId, StartingEquipmentTable> = {
  bard: {
    armour: [
      { roll: [1, 2], result: 'None' },
      { roll: [3, 4], result: 'Leather' },
      { roll: [5, 6], result: 'Chainmail' },
    ],
    weapons: [
      { roll: [1], result: 'Club' },
      { roll: [2], result: '3 daggers' },
      { roll: [3], result: 'Longsword' },
      { roll: [4], result: 'Sling + 20 stones' },
      { roll: [5], result: 'Shortbow + 20 arrows' },
      { roll: [6], result: 'Shortsword' },
    ],
    weaponRolls: 2,
    classItems: ['Musical instrument (stringed or wind)'],
  },
  cleric: {
    armour: [
      { roll: [1], result: 'Leather' },
      { roll: [2], result: 'Leather + shield' },
      { roll: [3], result: 'Chainmail' },
      { roll: [4], result: 'Chainmail + shield' },
      { roll: [5], result: 'Plate mail' },
      { roll: [6], result: 'Plate mail + shield' },
    ],
    weapons: [
      { roll: [1], result: 'Dagger' },
      { roll: [2], result: 'Longsword' },
      { roll: [3], result: 'Mace' },
      { roll: [4], result: 'Shortbow + 20 arrows' },
      { roll: [5], result: 'Shortsword' },
      { roll: [6], result: 'Warhammer' },
    ],
    weaponRolls: 2,
    classItems: ['Wooden holy symbol'],
  },
  enchanter: {
    armour: [
      { roll: [1, 2], result: 'None' },
      { roll: [3, 4], result: 'Leather' },
      { roll: [5, 6], result: 'Chainmail' },
    ],
    weapons: [
      { roll: [1], result: 'Club' },
      { roll: [2], result: 'Dagger' },
      { roll: [3], result: 'Longsword' },
      { roll: [4], result: 'Shortbow + 20 arrows' },
      { roll: [5], result: 'Spear' },
      { roll: [6], result: 'Staff' },
    ],
    weaponRolls: 2,
    classItems: [],
  },
  fighter: {
    armour: [
      { roll: [1], result: 'Leather' },
      { roll: [2], result: 'Leather + shield' },
      { roll: [3], result: 'Chainmail' },
      { roll: [4], result: 'Chainmail + shield' },
      { roll: [5], result: 'Plate mail' },
      { roll: [6], result: 'Plate mail + shield' },
    ],
    weapons: [
      { roll: [1], result: 'Crossbow + 20 quarrels' },
      { roll: [2], result: 'Dagger' },
      { roll: [3], result: 'Longsword' },
      { roll: [4], result: 'Mace' },
      { roll: [5], result: 'Shortsword' },
      { roll: [6], result: 'Spear' },
    ],
    weaponRolls: 2,
    classItems: [],
  },
  friar: {
    armour: [
      { roll: [1, 2, 3, 4, 5, 6], result: 'None' },
    ],
    weapons: [
      { roll: [1], result: 'Club' },
      { roll: [2], result: 'Dagger' },
      { roll: [3, 4], result: 'Sling + 20 stones' },
      { roll: [5, 6], result: 'Staff' },
    ],
    weaponRolls: 1,
    classItems: ["Friar's habit", 'Wooden holy symbol'],
  },
  hunter: {
    armour: [
      { roll: [1, 2, 3], result: 'Leather' },
      { roll: [4, 5, 6], result: 'Leather + shield' },
    ],
    weapons: [
      { roll: [1], result: 'Dagger' },
      { roll: [2], result: 'Longsword' },
      { roll: [3, 4], result: 'Longbow + 20 arrows' },
      { roll: [5], result: 'Shortsword' },
      { roll: [6], result: 'Sling + 20 stones' },
    ],
    weaponRolls: 2,
    classItems: [],
    smallKindredNotes: 'Small kindreds use shortbow instead of longbow',
  },
  knight: {
    armour: [
      { roll: [1], result: 'Chainmail' },
      { roll: [2, 3], result: 'Chainmail + shield' },
      { roll: [4], result: 'Plate mail' },
      { roll: [5, 6], result: 'Plate mail + shield' },
    ],
    weapons: [
      { roll: [1], result: 'Dagger' },
      { roll: [2, 3, 4], result: 'Lance' },
      { roll: [5], result: 'Longsword' },
      { roll: [6], result: 'Mace' },
    ],
    weaponRolls: 2,
    classItems: [],
    smallKindredNotes: 'Small kindreds use spear instead of lance',
  },
  magician: {
    armour: [
      { roll: [1, 2, 3, 4, 5, 6], result: 'None' },
    ],
    weapons: [
      { roll: [1, 2, 3], result: 'Dagger' },
      { roll: [4, 5, 6], result: 'Staff' },
    ],
    weaponRolls: 1,
    classItems: ['Ritual robes', 'Starting spell book'],
  },
  thief: {
    armour: [
      { roll: [1, 2, 3], result: 'None' },
      { roll: [4, 5, 6], result: 'Leather' },
    ],
    weapons: [
      { roll: [1], result: 'Club' },
      { roll: [2], result: '3 daggers' },
      { roll: [3], result: 'Longsword' },
      { roll: [4], result: 'Shortbow + 20 arrows' },
      { roll: [5], result: 'Shortsword' },
      { roll: [6], result: 'Sling + 20 stones' },
    ],
    weaponRolls: 2,
    classItems: ["Thieves' tools"],
  },
};

export function rollD6(): number {
  return Math.floor(Math.random() * 6) + 1;
}

export function rollStartingEquipment(classId: ClassId, category: 'armour' | 'weapons'): { roll: number; result: string } {
  const table = STARTING_EQUIPMENT[classId][category];
  const roll = rollD6();
  const entry = table.find(e => e.roll.includes(roll));
  return { roll, result: entry?.result ?? 'Unknown' };
}

// 1d. Language Helpers
export const CLASS_LANGUAGES: Partial<Record<ClassId, string[]>> = {
  cleric: ['Liturgic'],
  friar: ['Liturgic'],
  thief: ["Thieves' Cant"],
};

export function getCharacterLanguages(
  kindredId: KindredId | '',
  classId: ClassId | '',
  intScore: number,
): {
  nativeLanguages: string[];
  classLanguages: string[];
  bonusSlots: number;
  availableCommon: string[];
  availableObscure: string[];
} {
  const kindred = KINDREDS.find(k => k.id === kindredId);
  const nativeLanguages = kindred?.nativeLanguages ?? ['Woldish'];
  const classLanguages: string[] = (classId ? CLASS_LANGUAGES[classId] : undefined) ?? [];
  const intMod = getAbilityModifier(intScore);
  const bonusSlots = Math.max(0, intMod);

  const allKnown = new Set([...nativeLanguages, ...classLanguages]);

  const availableCommon = COMMON_LANGUAGES.filter(l => !allKnown.has(l));
  const availableObscure = OBSCURE_LANGUAGES.filter(l => !allKnown.has(l));

  return { nativeLanguages, classLanguages, bonusSlots, availableCommon, availableObscure };
}

// 1e. Alignment Validation
export function getAlignmentWarning(classId: ClassId | '', alignment: string): { text: string; severity: 'warning' | 'info' } | null {
  if (!classId || !alignment) return null;

  if ((classId === 'cleric' || classId === 'friar') && alignment === 'Chaotic') {
    return { text: `${classId === 'cleric' ? 'Clerics' : 'Friars'} must be Lawful or Neutral.`, severity: 'warning' };
  }

  if (classId === 'knight') {
    return { text: "Knights must match their liege's alignment.", severity: 'info' };
  }

  return null;
}

// 1f. Moon Sign Validation
export function canHaveMoonSign(kindredId: KindredId | ''): boolean {
  if (!kindredId) return true;
  const kindred = KINDREDS.find(k => k.id === kindredId);
  return kindred?.creatureType !== 'Fairy';
}

// ──────────────────────────────────────────────────────────
// Phase 3: Combat & Derived Stats
// ──────────────────────────────────────────────────────────

// Class Armour Restrictions
export const CLASS_ARMOUR_RESTRICTIONS: Record<ClassId, { light: boolean; medium: boolean; heavy: boolean; shield: boolean }> = {
  bard:      { light: true,  medium: true,  heavy: false, shield: false },
  cleric:    { light: true,  medium: true,  heavy: true,  shield: true },
  enchanter: { light: true,  medium: true,  heavy: false, shield: false },
  fighter:   { light: true,  medium: true,  heavy: true,  shield: true },
  friar:     { light: false, medium: false, heavy: false, shield: false },
  hunter:    { light: true,  medium: false, heavy: false, shield: true },
  knight:    { light: false, medium: true,  heavy: true,  shield: true },
  magician:  { light: false, medium: false, heavy: false, shield: false },
  thief:     { light: true,  medium: false, heavy: false, shield: false },
};

function getArmourBulkCategory(bulk: string): 'light' | 'medium' | 'heavy' | null {
  if (bulk === 'Light') return 'light';
  if (bulk === 'Medium') return 'medium';
  if (bulk === 'Heavy') return 'heavy';
  return null;
}

export function getArmourRestrictionWarning(classId: ClassId | '', armourName: string, hasShield: boolean): string | null {
  if (!classId) return null;
  const restrictions = CLASS_ARMOUR_RESTRICTIONS[classId];

  if (hasShield && !restrictions.shield) {
    const classInfo = CLASSES.find(c => c.id === classId);
    return `${classInfo?.name ?? classId} cannot use shields.`;
  }

  if (!armourName) return null;
  const armour = ARMOUR_TABLE.find(a => a.name === armourName);
  if (!armour || armour.name === 'Unarmoured') return null;

  const bulkCat = getArmourBulkCategory(armour.bulk);
  if (bulkCat && !restrictions[bulkCat]) {
    const classInfo = CLASSES.find(c => c.id === classId);
    return `${classInfo?.name ?? classId} cannot wear ${armour.bulk.toLowerCase()} armour.`;
  }

  return null;
}

// 2a. AC Calculation
export function calculateAC(
  equippedArmourName: string,
  hasShield: boolean,
  dexScore: number,
  kindred: KindredId | '',
  classId: ClassId | '',
  level: number,
): { ac: number; notes: string[] } {
  const armour = ARMOUR_TABLE.find(a => a.name === equippedArmourName);
  let ac = armour ? armour.ac : 10; // Unarmoured = 10
  const notes: string[] = [];

  if (hasShield) {
    ac += 1;
    notes.push('+1 shield');
  }

  const dexMod = getAbilityModifier(dexScore);
  if (dexMod !== 0) {
    ac += dexMod;
    notes.push(`${formatModifier(dexMod)} DEX`);
  }

  // Breggle fur: +1 if unarmoured or light armour
  if (kindred === 'breggle') {
    const bulk = armour?.bulk ?? 'None';
    if (bulk === 'None' || bulk === 'Light') {
      ac += 1;
      notes.push('+1 Breggle Fur');
    }
  }

  // Friar Armour of Faith: bonus when unarmoured
  if (classId === 'friar') {
    const isUnarmoured = !equippedArmourName || equippedArmourName === 'Unarmoured' || !armour;
    if (isUnarmoured) {
      const friarBonus = FRIAR_AC_BONUS[Math.max(1, Math.min(level, 15))] ?? 0;
      if (friarBonus > 0) {
        ac += friarBonus;
        notes.push(`+${friarBonus} Armour of Faith`);
      }
    }
  }

  // Small kindreds: situational note (not added to number)
  if (kindred === 'grimalkin' || kindred === 'mossling' || kindred === 'woodgrue') {
    notes.push('+2 AC vs Large creatures (situational)');
  }

  return { ac, notes };
}

// 2b. Attack Bonus
export function calculateAttackBonus(kindred: KindredId | '', classId: ClassId | '', level: number): number | null {
  const row = getAdvancementRow(kindred, classId, level);
  return row ? row.attackBonus : null;
}

// 2c. Save Targets
export function calculateSaveTargets(kindred: KindredId | '', classId: ClassId | '', level: number): { doom: number; ray: number; hold: number; blast: number; spell: number } | null {
  const row = getAdvancementRow(kindred, classId, level);
  return row ? { ...row.saves } : null;
}

// 2d. Magic Resistance
export function calculateMagicResistance(wisScore: number, kindred: KindredId | ''): { value: number; notes: string[] } {
  let value = getAbilityModifier(wisScore);
  const notes: string[] = [];

  if (value !== 0) notes.push(`${formatModifier(value)} WIS`);

  if (kindred === 'elf' || kindred === 'grimalkin') {
    value += 2;
    notes.push('+2 Fairy magic resistance');
  }

  if (kindred === 'mossling') {
    notes.push('+2 to all saves (+4 vs fungal) — applied to saves, not here');
  }

  return { value, notes };
}

// 2e. Melee modifier
export function calculateMeleeModifier(attackBonus: number, strScore: number): number {
  return attackBonus + getAbilityModifier(strScore);
}

// 2f. Missile modifier
export function calculateMissileModifier(attackBonus: number, dexScore: number, classId: ClassId | ''): number {
  let mod = attackBonus + getAbilityModifier(dexScore);
  if (classId === 'hunter') mod += 1;
  return mod;
}

// 2g. XP to Next Level
export function calculateXpToNextLevel(kindred: KindredId | '', classId: ClassId | '', level: number): number | null {
  if (level >= 15) return null;
  const table = getAdvancementTable(kindred, classId);
  if (!table) return null;
  const nextRow = table.rows.find(r => r.level === level + 1);
  return nextRow ? nextRow.xp : null;
}

// 2h. Speed Functions (shared between CombatStats and Inventory)
export function getSpeedByEquippedSlots(equippedSlots: number): number {
  if (equippedSlots <= 3) return 40;
  if (equippedSlots <= 5) return 30;
  if (equippedSlots <= 7) return 20;
  return 10;
}

export function getSpeedByStowedSlots(stowedSlots: number): number {
  if (stowedSlots <= 10) return 40;
  if (stowedSlots <= 12) return 30;
  if (stowedSlots <= 14) return 20;
  return 10;
}

export function getSpeedBySlots(equippedSlots: number, stowedSlots: number): number {
  return Math.min(getSpeedByEquippedSlots(equippedSlots), getSpeedByStowedSlots(stowedSlots));
}

export function getSpeedByWeight(totalWeight: number): number {
  if (totalWeight <= 400) return 40;
  if (totalWeight <= 600) return 30;
  if (totalWeight <= 800) return 20;
  return 10;
}

// ──────────────────────────────────────────────────────────
// Phase 4: Skill Calculation Functions
// ──────────────────────────────────────────────────────────

// Known skill display names (for keys that don't round-trip cleanly via title-casing)
const SKILL_DISPLAY_NAMES: Record<string, string> = {
  'climb_wall': 'Climb Wall',
  'disarm_mech.': 'Disarm Mech.',
  'monster_lore': 'Monster Lore',
  'pick_lock': 'Pick Lock',
  'detect_magic': 'Detect Magic',
};

export function skillNameToKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_');
}

export function skillKeyToDisplayName(key: string): string {
  if (SKILL_DISPLAY_NAMES[key]) return SKILL_DISPLAY_NAMES[key];
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export interface CalculatedSkills {
  targets: Record<string, number>;
  autoSkillKeys: Set<string>;
  expertisePoints: number | null;
}

export function calculateSkillTargets(
  kindred: KindredId | '',
  classId: ClassId | '',
  level: number,
): CalculatedSkills {
  const targets: Record<string, number> = {};
  const autoSkillKeys = new Set<string>();
  const clampedLevel = Math.max(1, Math.min(level, 15));

  // Determine if we're in kindred-class mode
  const isKindredClass = kindred !== '' && kindred !== 'human' && !classId;

  // 1. Start with base skills (default target = 6)
  targets.listen = 6;
  targets.search = 6;
  targets.survival = 6;
  autoSkillKeys.add('listen');
  autoSkillKeys.add('search');
  autoSkillKeys.add('survival');

  // 2. Apply kindred base overrides (e.g., Elf Listen 5)
  if (kindred) {
    const kindredOverrides = KINDRED_BASE_SKILL_OVERRIDES[kindred as KindredId];
    if (kindredOverrides) {
      for (const [key, value] of Object.entries(kindredOverrides)) {
        targets[key] = Math.min(targets[key] ?? 6, value);
        autoSkillKeys.add(key);
      }
    }
  }

  // 3. Apply class base overrides (e.g., Friar Survival 5)
  if (classId) {
    const classOverrides = CLASS_BASE_SKILL_OVERRIDES[classId as ClassId];
    if (classOverrides) {
      for (const [key, value] of Object.entries(classOverrides)) {
        targets[key] = Math.min(targets[key] ?? 6, value);
        autoSkillKeys.add(key);
      }
    }
  }

  // 4. Apply class skill tables (Bard, Hunter, Thief)
  if (classId) {
    const classSkillTable = CLASS_SKILL_TABLES[classId as ClassId];
    if (classSkillTable) {
      const row = classSkillTable.rows[clampedLevel];
      if (row) {
        for (const [name, value] of Object.entries(row)) {
          const key = skillNameToKey(name);
          // Use Math.min for overlapping skills (e.g., Bard Listen vs base Listen)
          targets[key] = Math.min(targets[key] ?? value, value);
          autoSkillKeys.add(key);
        }
      }
    }
  }

  // 5. Apply kindred-class skill tables (Grimalkin Pick Lock, Woodgrue Stealth)
  if (isKindredClass && kindred) {
    const kindredSkillTable = KINDRED_CLASS_SKILL_TABLES[kindred as KindredId];
    if (kindredSkillTable) {
      const row = kindredSkillTable.rows[clampedLevel];
      if (row) {
        for (const [name, value] of Object.entries(row)) {
          const key = skillNameToKey(name);
          targets[key] = Math.min(targets[key] ?? value, value);
          autoSkillKeys.add(key);
        }
      }
    }
  }

  // 6. Detect Magic (Enchanter, Magician, Elf kindred-class)
  const detectMagicKey = isKindredClass ? (kindred || '') : (classId || '');
  const detectMagicTarget = getDetectMagicTarget(detectMagicKey, clampedLevel);
  if (detectMagicTarget !== null) {
    targets['detect_magic'] = detectMagicTarget;
    autoSkillKeys.add('detect_magic');
  }

  // 7. Expertise points
  let expertisePoints: number | null = null;
  if (classId) {
    const config = EXPERTISE_POINTS_CONFIG[classId as ClassId];
    if (config) {
      expertisePoints = config.base + config.perLevel * clampedLevel;
    }
  }

  return { targets, autoSkillKeys, expertisePoints };
}

// ──────────────────────────────────────────────────────────
// Phase 5: Magic System Data
// Source: docs/rules/05-magic.md
// ──────────────────────────────────────────────────────────

// 5A: Arcane Spell List (72 spells, 12 per rank)
export const ARCANE_SPELLS: { name: string; rank: number }[] = [
  // Rank 1
  { name: 'Crystal Resonance', rank: 1 }, { name: 'Decipher', rank: 1 }, { name: 'Fairy Servant', rank: 1 },
  { name: 'Firelight', rank: 1 }, { name: 'Floating Disc', rank: 1 }, { name: 'Glyph of Sealing', rank: 1 },
  { name: 'Ignite/Extinguish', rank: 1 }, { name: 'Ingratiate', rank: 1 }, { name: 'Ioun Shard', rank: 1 },
  { name: 'Shield of Force', rank: 1 }, { name: 'Vapours of Dream', rank: 1 }, { name: 'Ventriloquism', rank: 1 },
  // Rank 2
  { name: 'Arcane Cypher', rank: 2 }, { name: 'Dweomerlight', rank: 2 }, { name: 'Flaming Spirit', rank: 2 },
  { name: 'Glyph of Locking', rank: 2 }, { name: 'Invisibility', rank: 2 }, { name: 'Knock', rank: 2 },
  { name: 'Levitate', rank: 2 }, { name: 'Mind Crystal', rank: 2 }, { name: 'Mirror Image', rank: 2 },
  { name: 'Perceive the Invisible', rank: 2 }, { name: 'Phantasm', rank: 2 }, { name: 'Web', rank: 2 },
  // Rank 3
  { name: 'Circle of Invisibility', rank: 3 }, { name: 'Crystal Vision', rank: 3 }, { name: 'Dark Sight', rank: 3 },
  { name: 'Dispel Magic', rank: 3 }, { name: 'Fireball', rank: 3 }, { name: 'Fly', rank: 3 },
  { name: 'Haste', rank: 3 }, { name: 'Lightning Bolt', rank: 3 }, { name: 'Missile Ward', rank: 3 },
  { name: 'Paralysation', rank: 3 }, { name: 'Serpent Glyph', rank: 3 }, { name: 'Water Breathing', rank: 3 },
  // Rank 4
  { name: 'Acid Globe', rank: 4 }, { name: 'Arcane Eye', rank: 4 }, { name: 'Confusion', rank: 4 },
  { name: 'Dimension Door', rank: 4 }, { name: 'Dominate', rank: 4 }, { name: 'Hallucinatory Terrain', rank: 4 },
  { name: 'Hex Weaving', rank: 4 }, { name: 'Plant Growth', rank: 4 }, { name: 'Polymorph', rank: 4 },
  { name: 'Wall of Fire', rank: 4 }, { name: 'Wall of Ice', rank: 4 }, { name: 'Woodland Veil', rank: 4 },
  // Rank 5
  { name: 'Air Sphere', rank: 5 }, { name: 'Animate Dead', rank: 5 }, { name: 'Cloudkill', rank: 5 },
  { name: 'Conjure Elemental', rank: 5 }, { name: 'Fabricate', rank: 5 }, { name: 'Feeblemind', rank: 5 },
  { name: 'Mire', rank: 5 }, { name: 'Passwall', rank: 5 }, { name: 'Sending', rank: 5 },
  { name: 'Telekinesis', rank: 5 }, { name: 'Teleport', rank: 5 }, { name: 'Wall of Stone', rank: 5 },
  // Rank 6
  { name: 'Anti-Magic Ward', rank: 6 }, { name: 'Control Weather', rank: 6 }, { name: 'Disintegrate', rank: 6 },
  { name: 'Dweomerfire', rank: 6 }, { name: 'Geas', rank: 6 }, { name: 'Invisible Stalker', rank: 6 },
  { name: 'Move Terrain', rank: 6 }, { name: 'Oracle', rank: 6 }, { name: 'Petrification', rank: 6 },
  { name: 'Project Image', rank: 6 }, { name: 'Wave of Force', rank: 6 }, { name: 'Word of Doom', rank: 6 },
];

// 5B: Holy Spell List (34 spells with saint associations)
export const HOLY_SPELLS: { name: string; rank: number; saint: string }[] = [
  // Rank 1
  { name: 'Detect Evil', rank: 1, saint: 'St Whittery' },
  { name: 'Detect Magic', rank: 1, saint: 'St Thorm' },
  { name: 'Frost Ward', rank: 1, saint: 'St Abthius' },
  { name: 'Lesser Healing', rank: 1, saint: 'St Lillibeth' },
  { name: 'Light', rank: 1, saint: 'St Foggarty' },
  { name: 'Mantle of Protection', rank: 1, saint: 'St Benester' },
  { name: 'Purify Food and Drink', rank: 1, saint: 'St Gretchen' },
  { name: 'Rally', rank: 1, saint: 'St Jorrael' },
  // Rank 2
  { name: 'Bless', rank: 2, saint: 'St Gondyw' },
  { name: 'Charm Serpents', rank: 2, saint: 'St Dank' },
  { name: 'Find Traps', rank: 2, saint: 'St Gripe' },
  { name: 'Flame Ward', rank: 2, saint: 'St Hollyhock' },
  { name: 'Hold Person', rank: 2, saint: 'St Waylaine' },
  { name: 'Reveal Alignment', rank: 2, saint: 'St Willofrith' },
  { name: 'Silence', rank: 2, saint: 'St Signis' },
  { name: 'Speak With Animals', rank: 2, saint: 'St Hamfast' },
  // Rank 3
  { name: 'Animal Growth', rank: 3, saint: 'St Vinicus' },
  { name: 'Bless Weapon', rank: 3, saint: 'St Sedge' },
  { name: 'Cure Affliction', rank: 3, saint: 'St Pastery' },
  { name: 'Holy Light', rank: 3, saint: 'St Eggort' },
  { name: 'Locate Object', rank: 3, saint: 'St Keye' },
  { name: 'Remove Curse', rank: 3, saint: 'St Primula' },
  // Rank 4
  { name: 'Circle of Protection', rank: 4, saint: 'St Faxis' },
  { name: 'Create Water', rank: 4, saint: 'St Quister' },
  { name: 'Greater Healing', rank: 4, saint: 'St Wick' },
  { name: 'Remove Poison', rank: 4, saint: 'St Torphia' },
  { name: 'Speak With Plants', rank: 4, saint: 'St Wort' },
  { name: 'Serpent Transformation', rank: 4, saint: 'St Horace' },
  // Rank 5
  { name: 'Communion', rank: 5, saint: 'St Elsa' },
  { name: 'Create Food', rank: 5, saint: 'St Ponch' },
  { name: 'Holy Fire', rank: 5, saint: 'St Goodenough' },
  { name: 'Holy Quest', rank: 5, saint: 'St Galaunt' },
  { name: 'Insect Plague', rank: 5, saint: 'St Cornice' },
  { name: 'Raise Dead', rank: 5, saint: 'St Clewyd' },
];

// 5C: Glamour List (20 glamours)
export const GLAMOURS: { id: number; name: string; description: string }[] = [
  { id: 1, name: 'Awe', description: 'Unnerve creatures (30\', total levels up to caster\'s level flee, 1d4 Rounds)' },
  { id: 2, name: 'Beguilement', description: 'Mortal believes caster\'s words (30\', Save vs Spell, 1d4 Rounds, 1x/day/subject)' },
  { id: 3, name: 'Breath of the Wind', description: 'Move silently (30\', 1d4 Rounds, 1x/Turn)' },
  { id: 4, name: 'Cloak of Darkness', description: 'Hide from mundane sight (Concentration/1 Round, 1x/Turn)' },
  { id: 5, name: 'Conjure Treats', description: 'Create favourite treat (permanent but not sustaining, 1x/day/subject)' },
  { id: 6, name: 'Dancing Flame', description: 'Command flame to float/move (60\', Concentration, 2d6 Rounds)' },
  { id: 7, name: 'Disguise Object', description: 'Object appears different (until touched)' },
  { id: 8, name: 'Fairy Dust', description: 'Reveal invisible creatures (30\', 1 Round, 1x/day)' },
  { id: 9, name: 'Flame Charm', description: 'Conjure/extinguish small flame' },
  { id: 10, name: 'Fool\'s Gold', description: 'Copper appears as gold (touch, 1d6 min, 20 coins/level/day)' },
  { id: 11, name: 'Forgetting', description: 'Target forgets witnessed event (30\', Save vs Spell, 1x/day/subject)' },
  { id: 12, name: 'Masquerade', description: 'Disguise facial features (permanent until dismissed)' },
  { id: 13, name: 'Mirth and Malice', description: 'Impart emotion to group (30\', 1 Turn effect, 1x/day/group)' },
  { id: 14, name: 'Moon Sight', description: 'See in darkness 60\' (always active, no fine detail)' },
  { id: 15, name: 'Seeming', description: 'Garb appears as wished (permanent until touched, visual only)' },
  { id: 16, name: 'Silver Tongue', description: 'Communicate with any being/animal (1 day, 1 language/day)' },
  { id: 17, name: 'Subtle Sight', description: 'Spot invisible creatures (always active, 3-in-6 chance)' },
  { id: 18, name: 'Through the Keyhole', description: 'Step through small aperture (1x/day/door)' },
  { id: 19, name: 'Vanishing', description: 'Disappear from one creature\'s sight (60\', 1d3 Rounds, 1x/day/subject)' },
  { id: 20, name: 'Walk in Shadows', description: 'Travel between shadows (2-in-6 in 10\'x10\' darkness, reappear within 60\')' },
];

// 5D: Fairy Runes (18 runes across 3 magnitudes)
export type RuneMagnitude = 'lesser' | 'greater' | 'mighty';

export const FAIRY_RUNES: { id: number; name: string; magnitude: RuneMagnitude; description: string }[] = [
  // Lesser (6)
  { id: 1, name: 'Deathly Blossom', magnitude: 'lesser', description: 'White rose causes deep faint (Save vs Doom, 1d6 Turns)' },
  { id: 2, name: 'Fog Cloud', magnitude: 'lesser', description: '20\' vapor blocks vision (1 Turn)' },
  { id: 3, name: 'Gust of Wind', magnitude: 'lesser', description: '10\'x60\' blast, pushes creatures (1 Round)' },
  { id: 4, name: 'Proof Against Deadly Harm', magnitude: 'lesser', description: 'Immune to 1 weapon type (2d6 Rounds)' },
  { id: 5, name: 'Rune of Vanishing', magnitude: 'lesser', description: 'Invisible to mortals/animals (1 Turn, breaks on attack)' },
  { id: 6, name: 'Sway the Mortal Mind', magnitude: 'lesser', description: 'Charm mortal (1 day, Save vs Spell)' },
  // Greater (6)
  { id: 7, name: 'Arcane Unbinding', magnitude: 'greater', description: 'Negate arcane/fairy magic in 20\' cube (120\')' },
  { id: 8, name: 'Fairy Gold', magnitude: 'greater', description: 'Conjure 2d100gp (1d6 hours, then coins vanish)' },
  { id: 9, name: 'Fairy Steed', magnitude: 'greater', description: 'Summon fairy horse (until dawn)' },
  { id: 10, name: 'Ice Storm', magnitude: 'greater', description: '30\' hail, 3d8 damage (120\')' },
  { id: 11, name: 'Rune of Invisibility', magnitude: 'greater', description: 'Invisible to all (1 day, breaks on attack)' },
  { id: 12, name: 'Sway the Mind', magnitude: 'greater', description: 'Charm any creature (1 day, Save vs Spell, fairies +4)' },
  // Mighty (6)
  { id: 13, name: 'Dream Ship', magnitude: 'mighty', description: 'Phantom galleon, 13 passengers, travel to destination' },
  { id: 14, name: 'Eternal Slumber', magnitude: 'mighty', description: 'Permanent magical sleep on mortal' },
  { id: 15, name: 'Rune of Death', magnitude: 'mighty', description: 'Kill mortals/animals in 30\' area (up to 4d8 levels, Save vs Doom)' },
  { id: 16, name: 'Rune of Wishing', magnitude: 'mighty', description: 'Alter reality (costs 1d3 permanent CON)' },
  { id: 17, name: 'Summon Wild Hunt', magnitude: 'mighty', description: 'Summon fairy hunting host (4d6 hounds, 4d20 foot + 4d20 mounted elves, 1d6 goblins)' },
  { id: 18, name: 'Unravel Death', magnitude: 'mighty', description: 'Restore dead to life (7 days max, 2 weeks recovery)' },
];

// Rune usage frequency by magnitude and level bracket
export function getRuneUsageFrequency(magnitude: RuneMagnitude, level: number): string {
  if (magnitude === 'lesser') {
    if (level <= 4) return '1x/day';
    if (level <= 9) return '2x/day';
    return '3x/day';
  }
  if (magnitude === 'greater') {
    if (level <= 4) return '1x/level';
    if (level <= 9) return '1x/week';
    return '1x/day';
  }
  // mighty
  if (level <= 9) return '1x ever';
  return '1x/year';
}

// Rune roll modifier by level
export function getRuneRollModifier(level: number): number {
  if (level <= 2) return 0;
  if (level <= 5) return 1;
  if (level <= 9) return 2;
  return 3;
}

// 5E: Mossling Knacks (6 knacks, 4 tiers each)
export const MOSSLING_KNACKS: { id: number; name: string; tiers: { level: number; description: string }[] }[] = [
  {
    id: 1, name: 'Bird Friend', tiers: [
      { level: 1, description: 'Converse with birds' },
      { level: 3, description: 'Charm Level 1- bird companion' },
      { level: 5, description: '1x/day, birds relay 10-word message at 12 miles/hour' },
      { level: 7, description: '1x/day, summon flock (L3, AC 13, HP 13, 1d6 pecks, Fly 40, 1d4 Turns)' },
    ],
  },
  {
    id: 2, name: 'Lock Singer', tiers: [
      { level: 1, description: 'Sing to simple lock, 2-in-6 chance/Turn to open' },
      { level: 3, description: 'Lock reveals key location' },
      { level: 5, description: 'Simple locks within 30\' snap shut (1 Round song)' },
      { level: 7, description: 'Song opens any lock (2-in-6/Turn, magical locks 1-in-6 backfire chance)' },
    ],
  },
  {
    id: 3, name: 'Root Friend', tiers: [
      { level: 1, description: '1x/day, ask root 1 question (truthful, 1d6 words)' },
      { level: 3, description: '1x/day, summon 1d4 fresh rations from ground' },
      { level: 5, description: '1x/day, shelter in tree roots up to 1 hour (hidden)' },
      { level: 7, description: '1x/day, summon root thing (L3, AC 13, HP 13, 2 claws 1d4 + entangle, 1d6 Turns)' },
    ],
  },
  {
    id: 4, name: 'Thread Whistling', tiers: [
      { level: 1, description: 'Tie/untie/unravel textiles in 30\' (1 Round)' },
      { level: 3, description: 'Animate threads to move 5\'/round (Concentration)' },
      { level: 5, description: 'Rope mastery: animate rope to bind, trip, or swing (30\', 1d4 Rounds)' },
      { level: 7, description: 'Animate rope to attack (Level 1 construct, AC 13, HP 4, entangle on hit, 1d6 Turns)' },
    ],
  },
  {
    id: 5, name: 'Wood Kenning', tiers: [
      { level: 1, description: 'Sense wooden item\'s creator or last person who touched it (touch, 1x/item/day)' },
      { level: 3, description: 'Sense most recent strong emotion from wood (touch)' },
      { level: 5, description: 'Momentary image through wooden barrier (door, wall, tree trunk)' },
      { level: 7, description: 'Learn a tree\'s true name; 1x/day scry surroundings through that tree' },
    ],
  },
  {
    id: 6, name: 'Yeast Master', tiers: [
      { level: 1, description: 'Ferment sweet liquids, 1 pint/Turn (2-in-6 palatable to others)' },
      { level: 3, description: 'Commune with yeast in drinks to learn drinker\'s name' },
      { level: 5, description: 'Yeasty belch 1x/day (10\' cone, Save vs Blast or faint 1d6 Rounds)' },
      { level: 7, description: 'Conjure 1d6 fresh rations of yeast feast 1x/day' },
    ],
  },
];

// 5F: Magician Starting Spell Books
export const MAGICIAN_STARTING_SPELL_BOOKS: { roll: number; name: string; spells: string[] }[] = [
  { roll: 1, name: 'Charms of the Fey Court', spells: ['Fairy Servant', 'Ingratiate', 'Ventriloquism'] },
  { roll: 2, name: 'Hogbrand\'s Incandescence', spells: ['Firelight', 'Ignite/Extinguish', 'Shield of Force'] },
  { roll: 3, name: 'Lord Oberon\'s Seals', spells: ['Decipher', 'Glyph of Sealing', 'Vapours of Dream'] },
  { roll: 4, name: 'Oliphan\'s Folio', spells: ['Crystal Resonance', 'Ioun Shard', 'Shield of Force'] },
  { roll: 5, name: 'Smythe\'s Illuminations', spells: ['Decipher', 'Ignite/Extinguish', 'Ioun Shard'] },
  { roll: 6, name: 'The Treatise on Force and Dissolution', spells: ['Crystal Resonance', 'Floating Disc', 'Vapours of Dream'] },
];

// 5G: Magic Profile Helper
export type MagicSystem = 'arcane' | 'holy' | 'glamours' | 'runes' | 'knacks' | 'none';

export interface MagicProfile {
  systems: MagicSystem[];
  spellsPerDay: number[] | null;
  maxSpellRank: number;
  glamourCount: number;
  hasRunes: boolean;
  hasKnacks: boolean;
  hasDivineResistance: boolean;
  spellType: 'arcane' | 'holy' | null;
}

export function getCharacterMagicProfile(kindred: KindredId | '', classId: ClassId | '', level: number): MagicProfile {
  const result: MagicProfile = {
    systems: [],
    spellsPerDay: null,
    maxSpellRank: 0,
    glamourCount: 0,
    hasRunes: false,
    hasKnacks: false,
    hasDivineResistance: false,
    spellType: null,
  };

  const clampedLevel = Math.max(1, Math.min(level, 15));
  const isKindredClass = kindred !== '' && kindred !== 'human' && !classId;

  if (isKindredClass) {
    switch (kindred) {
      case 'breggle': {
        result.systems = ['arcane'];
        result.spellType = 'arcane';
        result.spellsPerDay = getSpellsPerDay('breggle', clampedLevel);
        result.maxSpellRank = 5;
        break;
      }
      case 'elf': {
        result.systems = ['glamours', 'runes'];
        result.hasDivineResistance = true;
        result.hasRunes = true;
        const kindredGlamours = KINDRED_GLAMOUR_COUNT['elf']?.[clampedLevel] ?? 0;
        result.glamourCount = kindredGlamours;
        break;
      }
      case 'grimalkin': {
        result.systems = ['glamours'];
        const kindredGlamours = KINDRED_GLAMOUR_COUNT['grimalkin']?.[clampedLevel] ?? 0;
        result.glamourCount = kindredGlamours;
        break;
      }
      case 'mossling': {
        result.systems = ['knacks'];
        result.hasKnacks = true;
        break;
      }
      case 'woodgrue': {
        result.systems = ['none'];
        break;
      }
    }
  } else if (classId) {
    switch (classId) {
      case 'magician': {
        result.systems = ['arcane'];
        result.spellType = 'arcane';
        result.spellsPerDay = getSpellsPerDay('magician', clampedLevel);
        result.maxSpellRank = 6;
        break;
      }
      case 'cleric': {
        result.systems = ['holy'];
        result.spellType = 'holy';
        result.spellsPerDay = getSpellsPerDay('cleric', clampedLevel);
        result.maxSpellRank = 5;
        break;
      }
      case 'friar': {
        result.systems = ['holy'];
        result.spellType = 'holy';
        result.spellsPerDay = getSpellsPerDay('friar', clampedLevel);
        result.maxSpellRank = 5;
        break;
      }
      case 'enchanter': {
        result.systems = ['glamours', 'runes'];
        result.hasDivineResistance = true;
        result.hasRunes = true;
        let glamourCount = ENCHANTER_GLAMOUR_COUNT[clampedLevel] ?? 0;
        // Elf enchanters get kindred glamours stacked on top
        if (kindred === 'elf') {
          glamourCount += KINDRED_GLAMOUR_COUNT['elf']?.[clampedLevel] ?? 0;
        }
        result.glamourCount = glamourCount;
        break;
      }
      default: {
        result.systems = ['none'];
        break;
      }
    }
  } else {
    result.systems = ['none'];
  }

  return result;
}

// ── Adventuring Data ─────────────────────────────────────────────────

export const TERRAIN_TABLE: { terrain: string; tpCost: number; lostChance: string; mountsVehicles: string }[] = [
  { terrain: 'Road', tpCost: 2, lostChance: 'None', mountsVehicles: 'Both allowed' },
  { terrain: 'Track', tpCost: 2, lostChance: '1-in-6', mountsVehicles: 'Both allowed' },
  { terrain: 'Light (farmland, meadow, open forest)', tpCost: 2, lostChance: '1-in-6', mountsVehicles: 'Both allowed' },
  { terrain: 'Moderate (bog, hilly forest, tangled forest)', tpCost: 3, lostChance: '2-in-6', mountsVehicles: 'Mounts led only, no vehicles' },
  { terrain: 'Difficult (boggy forest, swamp, thorny forest)', tpCost: 4, lostChance: '3-in-6', mountsVehicles: 'Neither allowed' },
  { terrain: 'Lake', tpCost: 2, lostChance: 'None', mountsVehicles: 'Boat required' },
  { terrain: 'River downstream', tpCost: 2, lostChance: 'None', mountsVehicles: 'Boat required' },
  { terrain: 'River upstream', tpCost: 3, lostChance: 'None', mountsVehicles: 'Boat required' },
];

type Season = 'Winter' | 'Spring' | 'Summer' | 'Autumn';
type SleepDifficulty = 'easy' | 'moderate' | 'difficult' | 'impossible';

export const SLEEP_MATRIX: Record<string, Record<string, Record<Season, SleepDifficulty>>> = {
  none: {
    none:            { Winter: 'impossible', Spring: 'difficult',  Summer: 'moderate',  Autumn: 'difficult' },
    bedrollOrTent:   { Winter: 'impossible', Spring: 'moderate',   Summer: 'easy',      Autumn: 'moderate' },
    bedrollAndTent:  { Winter: 'difficult',  Spring: 'moderate',   Summer: 'easy',      Autumn: 'moderate' },
  },
  campfire: {
    none:            { Winter: 'impossible', Spring: 'difficult',  Summer: 'moderate',  Autumn: 'difficult' },
    bedrollOrTent:   { Winter: 'difficult',  Spring: 'easy',       Summer: 'easy',      Autumn: 'easy' },
    bedrollAndTent:  { Winter: 'moderate',   Spring: 'easy',       Summer: 'easy',      Autumn: 'easy' },
  },
};

export const SLEEP_DIFFICULTY_DESCRIPTION: Record<SleepDifficulty, string> = {
  easy: 'Good rest automatically',
  moderate: 'CON Check required',
  difficult: 'CON Check at -2',
  impossible: 'Cannot get good rest',
};

export const HUNGER_EFFECTS_MORTAL: { days: string; effect: string }[] = [
  { days: '1', effect: '-1 Attack' },
  { days: '2', effect: '-1 Attack, -10 Speed' },
  { days: '3', effect: '-2 Attack, -10 Speed' },
  { days: '4', effect: '-2 Attack, -20 Speed' },
  { days: '5', effect: '-3 Attack, -20 Speed' },
  { days: '6', effect: '-4 Attack, -30 Speed' },
  { days: '7+', effect: '-4 Attack, -30 Speed, -1 CON/day (death at 0)' },
];

export const HUNGER_EFFECTS_FAIRY: { days: string; effect: string }[] = [
  { days: '1', effect: '-1 WIS' },
  { days: '2', effect: '-2 WIS' },
  { days: '3', effect: '-4 WIS' },
  { days: '4', effect: '-6 WIS, Lawful becomes Neutral' },
  { days: '5', effect: '-8 WIS' },
  { days: '6', effect: '-10 WIS' },
  { days: '7+', effect: '-12 WIS, becomes Chaotic (min WIS 3)' },
];

export const LIGHT_SOURCE_TYPES: Record<string, { label: string; minutes: number }> = {
  torch:   { label: 'Torch',   minutes: 60 },
  lantern: { label: 'Lantern', minutes: 240 },
  candle:  { label: 'Candle',  minutes: 60 },
};

export const HEALING_RATES: { method: string; amount: string }[] = [
  { method: 'Good night\'s rest (camping)', amount: '1 HP' },
  { method: 'Overnight in settlement', amount: '1 HP' },
  { method: 'Full day of rest in settlement', amount: '1d3 HP' },
  { method: 'Lesser Healing spell', amount: '1d6+1 HP' },
  { method: 'Greater Healing spell', amount: '2d6+2 HP' },
  { method: 'Spirithame herb', amount: '1d2 HP (1 dose/day)' },
  { method: 'Blood Canker fungus', amount: '1d3 HP (risk: 2-in-6 lose 1 CON)' },
];

export const FORAGING_YIELDS: Record<Season, string> = {
  Winter: '1d4',
  Spring: '1d6',
  Summer: '1d6',
  Autumn: '1d8',
};

export function getHungerEffects(days: number, kindredId: KindredId | ''): string {
  if (days <= 0) return 'None';
  const kindred = KINDREDS.find(k => k.id === kindredId);
  const isFairy = kindred?.creatureType === 'Fairy';
  const table = isFairy ? HUNGER_EFFECTS_FAIRY : HUNGER_EFFECTS_MORTAL;
  if (days >= 7) return table[6].effect;
  return table[days - 1].effect;
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
    moonPhase: '',
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
    containers: [],
    tinyItems: '',
    coins: { copper: 0, silver: 0, gold: 10, pellucidium: 0 },
    encumbranceMethod: 'slots',
    equippedArmourName: '',
    hasShield: false,
    spells: [],
    spellNotes: '',
    glamours: [],
    runes: [],
    knack: null,
    startingSpellBook: '',
    classTraits: '',
    kindredTraits: '',
    languages: 'Woldish',
    combatTalents: '',
    otherNotes: '',
    retainers: [],
    gazeUsesRemaining: 0,
    currentForm: 'estray',
    wilderUsedToday: false,
    madRevelryUsesRemaining: 0,
    trophies: [],
    animalCompanion: null,
    liegeHouse: '',
    selectedCombatTalents: [],
    holyOrder: '',
    symbioticFleshTraits: [],
    fungalSymbiosisUsesRemaining: 0,
    currentDate: { day: 1, month: 0 },
    currentLocation: '',
    journalEntries: [],

    exhaustionLevel: 0,
    hungerDays: 0,
    thirstDays: 0,
    rations: { fresh: 0, preserved: 0 },
    activeLightSources: [],
    travelDaysWithoutRest: 0,
    forcedMarchActive: false,
    travelPointsRemaining: 0,
  };
}
