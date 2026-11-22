import { KindredInfo, ClassInfo, Character, CalendarDate, KindredId, ClassId, AbilityScores as AbilityScoresType, AdvancementRow, ClassAdvancementTable, SkillProgressionTable, Coins, FeatureProfile, SpellSummary, SpellType } from './types';
import { CURRENT_SCHEMA_VERSION } from './migrations';
import { newId } from './ids';
import { pluralize } from './grammar';

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
  const restrictions = isKnownKindredId(kindred) ? KINDRED_CLASS_RESTRICTIONS[kindred] : {};
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

// Saved data can hold a kindred or class id the app doesn't know (a hand-edited
// or newer-version file). Check with these before indexing any table by such an
// id: they test own properties, so names every object inherits, like
// "constructor" or "__proto__", don't pass as known ids.
const KNOWN_KINDRED_IDS = Object.fromEntries(KINDREDS.map(k => [k.id, true]));
const KNOWN_CLASS_IDS = Object.fromEntries(CLASSES.map(c => [c.id, true]));

export function isKnownKindredId(id: string): id is KindredId {
  return Object.hasOwn(KNOWN_KINDRED_IDS, id);
}

export function isKnownClassId(id: string): id is ClassId {
  return Object.hasOwn(KNOWN_CLASS_IDS, id);
}

/** True when the kindred or the class is an id the app doesn't know, so values that depend on it can't be calculated. */
export function hasUnknownKindredOrClass(character: Pick<Character, 'kindred' | 'class'>): boolean {
  return (!!character.kindred && !isKnownKindredId(character.kindred))
    || (!!character.class && !isKnownClassId(character.class));
}

// Display names. The sheet shows an id it doesn't know as stored rather than
// hiding it.
export function getKindredName(id: string): string {
  return KINDREDS.find(k => k.id === id)?.name ?? id;
}

export function getClassName(id: string): string {
  return CLASSES.find(c => c.id === id)?.name ?? id;
}

/** "Woodgrue Enchanter", "Elf (kindred-class)", "Human"; '' when neither is chosen. */
export function getKindredClassLabel(character: Pick<Character, 'kindred' | 'class'>): string {
  const parts: string[] = [];
  if (character.kindred) parts.push(getKindredName(character.kindred));
  if (character.class) parts.push(getClassName(character.class));
  // Only a known kindred has a kindred-class; an unknown one is shown as stored, alone.
  else if (character.kindred && character.kindred !== 'human' && isKnownKindredId(character.kindred)) parts.push('(kindred-class)');
  return parts.join(' ');
}

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
// newMoon / fullMoon: day of the month marked with a new / full moon on the
// official Dolmenwood Calendar. They are the same every year.
export const MONTHS = [
  { name: 'Grimvold', season: 'Winter', days: 30, description: 'The Onset of Winter', moonName: 'Grinning moon', newMoon: 4, fullMoon: 19, wysendays: ['Hanglemas', "Dyboll's Day"] },
  { name: 'Lymewald', season: 'Winter', days: 28, description: 'Deep Winter', moonName: 'Dead moon', newMoon: 4, fullMoon: 18, wysendays: [] as string[] },
  { name: 'Haggryme', season: 'Winter', days: 30, description: 'The Fading of Winter', moonName: 'Beast moon', newMoon: 5, fullMoon: 20, wysendays: ["Yarl's Day", 'The Day of Virgins'] },
  { name: 'Symswald', season: 'Spring', days: 29, description: 'The Onset of Spring', moonName: 'Squamous moon', newMoon: 4, fullMoon: 19, wysendays: ['Hopfast'] },
  { name: 'Harchment', season: 'Spring', days: 29, description: 'High Spring', moonName: "Knight's moon", newMoon: 5, fullMoon: 19, wysendays: ['Smithing'] },
  { name: 'Iggwyld', season: 'Spring', days: 30, description: 'The Fading of Spring', moonName: 'Rotting moon', newMoon: 5, fullMoon: 20, wysendays: ['Shortening', "Longshank's Day"] },
  { name: 'Chysting', season: 'Summer', days: 31, description: 'The Onset of Summer', moonName: "Maiden's moon", newMoon: 4, fullMoon: 19, wysendays: ['Bradging', 'Copsewallow', 'Chalice'] },
  { name: 'Lillipythe', season: 'Summer', days: 29, description: 'High Summer', moonName: "Witch's moon", newMoon: 3, fullMoon: 17, wysendays: ["Old Dobey's Day"] },
  { name: 'Haelhold', season: 'Summer', days: 28, description: 'The Fading of Summer', moonName: "Robber's moon", newMoon: 3, fullMoon: 18, wysendays: [] as string[] },
  { name: 'Reedwryme', season: 'Autumn', days: 30, description: 'The Onset of Autumn', moonName: 'Goat moon', newMoon: 4, fullMoon: 19, wysendays: ["Shub's Eve", 'Druden Day'] },
  { name: 'Obthryme', season: 'Autumn', days: 28, description: 'Deep Autumn', moonName: 'Narrow moon', newMoon: 4, fullMoon: 19, wysendays: [] as string[] },
  { name: 'Braghold', season: 'Autumn', days: 30, description: 'The Fading of Autumn', moonName: 'Black moon', newMoon: 5, fullMoon: 20, wysendays: ['The Day of Doors', 'Dolmenday'] },
];

// Moon signs (optional rule, Player's Book pp174-175): the moon a character
// was born under (each month's moon, in calendar order) and its phase.
export const MOON_SIGNS = MONTHS.map((m) => m.moonName);

export const MOON_PHASES = ['Waxing', 'Full', 'Waning'] as const;

export const DAY_NAMES = ['Colly', 'Chime', 'Hayme', 'Moot', 'Frisk', 'Eggfast', 'Sunning'];

// Every month is 4 standard weeks, always starting on Colly, followed by
// its Wysendays (days 29+). Wysendays have their own names and are not
// part of any week, so weekdays restart with each month rather than
// running on across months and years (Player's Book p174; Dolmenwood
// Calendar).
export const WEEK_DAYS_PER_MONTH = 28;

export function isWysenday(date: CalendarDate): boolean {
  return date.day > WEEK_DAYS_PER_MONTH;
}

// Weekday name for days 1-28; the Wysenday's own name for days 29+.
export function getDayName(date: CalendarDate): string {
  if (isWysenday(date)) {
    return MONTHS[date.month]?.wysendays[date.day - WEEK_DAYS_PER_MONTH - 1] ?? 'Wysenday';
  }
  return DAY_NAMES[((date.day - 1) % 7 + 7) % 7];
}

export function formatCalendarDate(date: CalendarDate): string {
  const month = MONTHS[date.month];
  if (!month) return 'Unknown';
  const dayName = getDayName(date);
  return `${date.day} ${month.name} (${dayName}), Year ${date.year}`;
}

// The largest year the date fields accept. Date math copes with any year;
// anything bigger is almost certainly a typo. LATEST_DATE is that year's last
// day: the calendar stops there.
export const MAX_YEAR = 99999;
export const LATEST_DATE: CalendarDate = { day: MONTHS[MONTHS.length - 1].days, month: MONTHS.length - 1, year: MAX_YEAR };

// "3 Grimvold, Year 2": formatCalendarDate without the day name.
export function formatShortDate(date: CalendarDate): string {
  return `${date.day} ${MONTHS[date.month]?.name ?? 'Unknown'}, Year ${date.year}`;
}

// "a", "a and b", "a, b and c".
function joinParts(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// Years, months and days, leaving out any that are zero.
function describeParts(years: number, months: number, days: number): string {
  const parts: [number, string][] = [[years, 'year'], [months, 'month'], [days, 'day']];
  return joinParts(parts.filter(([n]) => n > 0).map(([n, unit]) => pluralize(n, unit, { grouping: true })));
}

// The time between two dates in calendar terms, e.g. "3 years, 2 months and
// 5 days" ("no time" if `to` isn't after `from`). Adding the result back with
// addElapsedTime lands on `to`.
export function describeDolmenwoodSpan(from: CalendarDate, to: CalendarDate): string {
  if (daysBetween(from, to) <= 0) return 'no time';
  const perYear = MONTHS.length;
  let months = (to.year - from.year) * perYear + (to.month - from.month);
  if (months > 0 && daysBetween(addMonths(from, months), to) < 0) months -= 1;
  const days = daysBetween(addMonths(from, months), to);
  return describeParts(Math.floor(months / perYear), months % perYear, days);
}

// A number of days as years and days ("3 years and 63 days"). Exact, since
// every Dolmenwood year has the same length.
export function describeDays(totalDays: number): string {
  const days = Math.max(0, Math.floor(totalDays));
  if (days === 0) return 'no time';
  return describeParts(Math.floor(days / DAYS_IN_YEAR), 0, days % DAYS_IN_YEAR);
}

export const FESTIVALS: Record<string, { month: number; day: number; name: string }[]> = {
  festivals: [
    { month: 0, day: 29, name: 'Hanglemas' },
    { month: 0, day: 30, name: "Dyboll's Day" },
    { month: 2, day: 29, name: "Yarl's Day" },
    { month: 2, day: 30, name: 'The Day of Virgins' },
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
    { month: 11, day: 29, name: 'The Day of Doors' },
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
// Date Arithmetic
// ──────────────────────────────────────────────────────────

export function getDayOfYear(date: CalendarDate): number {
  // Defensive clamp: out-of-range month would otherwise read
  // MONTHS[date.month].days as undefined and TypeError.
  const safeMonth = Math.max(0, Math.min(MONTHS.length - 1, date.month));
  let total = 0;
  for (let i = 0; i < safeMonth; i++) {
    total += MONTHS[i].days;
  }
  return total + date.day;
}

export const DAYS_IN_YEAR = MONTHS.reduce((sum, m) => sum + m.days, 0);

// Monotonic day count anchored so that Year 1 day 1 = absolute day 1.
// Lets all date arithmetic be plain subtraction.
export function getAbsoluteDay(date: CalendarDate): number {
  return (date.year - 1) * DAYS_IN_YEAR + getDayOfYear(date);
}

export function daysBetween(start: CalendarDate, end: CalendarDate): number {
  return getAbsoluteDay(end) - getAbsoluteDay(start);
}

// The inverse of getAbsoluteDay. Constant time (one division and at most 12
// month steps), so even a mistyped Year 99999 costs nothing. Day numbers
// below 1 land in Year 0 and earlier, matching addDays.
export function fromAbsoluteDay(absoluteDay: number): CalendarDate {
  const n = Math.floor(absoluteDay);
  const year = Math.floor((n - 1) / DAYS_IN_YEAR) + 1;
  let day = n - (year - 1) * DAYS_IN_YEAR; // 1..DAYS_IN_YEAR
  let month = 0;
  while (month < MONTHS.length - 1 && day > MONTHS[month].days) {
    day -= MONTHS[month].days;
    month += 1;
  }
  return { day, month, year };
}

// Add whole months, keeping the day of the month where it fits:
// 31 Chysting + 1 month = 29 Lillipythe (the last day of that month).
export function addMonths(date: CalendarDate, months: number): CalendarDate {
  const perYear = MONTHS.length;
  const index = (date.year - 1) * perYear + date.month + Math.trunc(months);
  const year = Math.floor(index / perYear) + 1;
  const month = index - (year - 1) * perYear;
  return { day: Math.min(date.day, MONTHS[month].days), month, year };
}

export interface ElapsedTime {
  years: number;
  months: number;
  weeks: number;
  days: number;
}

// A date plus some years, months, weeks and days, applied in that order.
// Years and months follow the calendar's month lengths (see addMonths).
export function addElapsedTime(date: CalendarDate, elapsed: ElapsedTime): CalendarDate {
  const afterMonths = addMonths(date, elapsed.years * MONTHS.length + elapsed.months);
  return fromAbsoluteDay(getAbsoluteDay(afterMonths) + elapsed.weeks * 7 + elapsed.days);
}

// Advance (or rewind) a calendar date by some number of days, wrapping
// across month and year boundaries.
export function addDays(date: CalendarDate, days: number): CalendarDate {
  let { day, month, year } = date;
  day += days;
  while (day > MONTHS[month].days) {
    day -= MONTHS[month].days;
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  while (day < 1) {
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
    day += MONTHS[month].days;
  }
  return { day, month, year };
}

// ──────────────────────────────────────────────────────────
// Moon Phase Calculator
// The lunar cycle is 29⅓ days, so exactly 12 moons fill the 352-day year
// (Player's Book p174) and new and full moons fall on the same dates every
// year: the days marked on the official calendar (MONTHS[].newMoon and
// .fullMoon). Each moon waxes from its new moon (~13 days), is full for
// 3 days centred on its full moon, then wanes (~13 days) until the next
// new moon.
// ──────────────────────────────────────────────────────────

// Day of the year of each month's new and full moon.
const LUNATIONS = MONTHS.map((m, month) => ({
  moonName: m.moonName,
  newMoon: getDayOfYear({ day: m.newMoon, month, year: 1 }),
  fullMoon: getDayOfYear({ day: m.fullMoon, month, year: 1 }),
}));

export function getMoonPhase(date: CalendarDate): { phase: 'waxing' | 'full' | 'waning'; moonName: string } {
  const doy = getDayOfYear(date);
  // The moon in the sky is the one whose new moon came most recently.
  // Until Grimvold's new moon, that is still last year's Black moon.
  const last = LUNATIONS[LUNATIONS.length - 1];
  let moon = { ...last, newMoon: last.newMoon - DAYS_IN_YEAR, fullMoon: last.fullMoon - DAYS_IN_YEAR };
  for (const lunation of LUNATIONS) {
    if (lunation.newMoon <= doy) moon = lunation;
  }
  const phase = Math.abs(doy - moon.fullMoon) <= 1 ? 'full' : doy < moon.fullMoon ? 'waxing' : 'waning';
  return { phase, moonName: moon.moonName };
}

// Name of the moon in the sky on this date. Usually the month's own moon,
// but the first few days of a month, before its new moon, still belong to
// the previous month's waning moon.
export function getMoonName(date: CalendarDate): string {
  return getMoonPhase(date).moonName;
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
    return isKnownKindredId(kindred) ? KINDRED_CLASS_ADVANCEMENT[kindred] : null;
  }
  // Standard class
  if (classId) {
    return isKnownClassId(classId) ? CLASS_ADVANCEMENT[classId] : null;
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
  if (!isKnownClassId(classOrKindred) && !isKnownKindredId(classOrKindred)) return null;
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
// Source: each Class's spells table in the Player's Book (cleric p60, friar p66,
// magician p73, breggle kindred-class p180), which docs/rules/03-classes.md and
// 04-kindred-classes.md copy. '-' in the book = 0 here.
// ──────────────────────────────────────────────────────────

export const SPELLS_PER_DAY: Record<string, Record<number, number[]>> = {
  cleric: {
    1:  [0,0,0,0,0],     2:  [1,0,0,0,0],     3:  [2,0,0,0,0],
    4:  [2,1,0,0,0],     5:  [2,2,0,0,0],     6:  [2,2,1,0,0],
    7:  [3,2,2,0,0],     8:  [3,2,2,0,0],     9:  [3,3,2,1,0],
    10: [3,3,2,2,0],     11: [4,3,3,2,0],     12: [4,3,3,2,1],
    13: [4,4,3,2,2],     14: [4,4,3,3,2],     15: [5,4,4,3,2],
  },
  friar: {
    1:  [1,0,0,0,0],     2:  [2,0,0,0,0],     3:  [2,1,0,0,0],
    4:  [2,2,0,0,0],     5:  [3,2,1,0,0],     6:  [3,2,2,0,0],
    7:  [3,3,2,1,0],     8:  [4,3,2,2,0],     9:  [4,3,3,2,1],
    10: [4,4,3,2,2],     11: [5,4,3,3,2],     12: [5,4,4,3,2],
    13: [5,5,4,3,3],     14: [6,5,4,4,3],     15: [6,5,5,4,3],
  },
  magician: {
    1:  [1,0,0,0,0,0],   2:  [2,0,0,0,0,0],   3:  [2,1,0,0,0,0],
    4:  [2,2,0,0,0,0],   5:  [2,2,1,0,0,0],   6:  [3,2,2,0,0,0],
    7:  [3,2,2,1,0,0],   8:  [3,3,2,2,0,0],   9:  [3,3,2,2,1,0],
    10: [4,3,3,2,2,0],   11: [4,3,3,2,2,1],   12: [4,4,3,3,2,2],
    13: [4,4,3,3,3,2],   14: [5,4,4,3,3,2],   15: [5,4,4,3,3,3],
  },
  breggle: {
    1:  [0,0,0,0,0],     2:  [0,0,0,0,0],     3:  [0,0,0,0,0],
    4:  [1,0,0,0,0],     5:  [2,0,0,0,0],     6:  [2,1,0,0,0],
    7:  [2,2,0,0,0],     8:  [2,2,1,0,0],     9:  [3,2,2,0,0],
    10: [3,2,2,1,0],     11: [3,3,2,2,0],     12: [3,3,2,2,1],
    13: [4,3,3,2,2],     14: [4,3,3,2,2],     15: [4,4,3,3,2],
  },
};

export function getSpellsPerDay(classOrKindred: string, level: number): number[] | null {
  if (!isKnownClassId(classOrKindred) && !isKnownKindredId(classOrKindred)) return null;
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

// Innate kindred glamours (1 each for Elf and Grimalkin)
// These are the "kindred glamours" referenced in class descriptions —
// NOT the kindred-class advancement table above.
// Source: docs/rules/02-kindreds.md lines 78, 111
export const INNATE_KINDRED_GLAMOUR_COUNT: Record<string, number> = {
  elf: 1,
  grimalkin: 1,
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
// Feature Notes: rules reminders the Traits and Spells tabs (and the PDF)
// print beside a class or kindred feature
// Source: docs/rules/02-kindreds.md, 03-classes.md, 04-kindred-classes.md
// ──────────────────────────────────────────────────────────

export const FEATURE_NOTES = {
  turningUndead: "Present holy symbol, roll 2d6 within 30'.",
  trophies: '+1 Attack/Save per creature type',
  chivalryVirtues: 'Honour, Service, Glory, Protecting the weak, Hierarchy',
  chivalryRules: "Must match liege's alignment. Cannot use missile weapons. Scorn light armour.",
  madRevelry: "30' range, affects all living creatures (including allies). Save vs Spell. Fairies/demi-fey +2 to save.",
  fungalSymbiosis: 'Spend 1 Turn to bond with non-hostile monstrous fungus (3+ levels below you). Save vs Spell.',
  // Enchanters and elves: the saints are loath to aid those allied with Fairy.
  resistanceToDivineAid: '2-in-6 chance that a beneficial holy spell cast on you has no effect.',
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

// Kindred-class Prime Abilities. Source: docs/rules/04-kindred-classes.md, and
// "Prime Abilities" in each kindred-class entry of the Player's Book appendix
// (Breggle p180, Elf p182, Grimalkin p184, Mossling p186, Woodgrue p188). The
// XP modifier applies to them as to any class (p22: "A character's score in
// their Prime Ability determines a modifier applied to all Experience Points
// earned"). Humans have no kindred-class.
export const KINDRED_CLASS_PRIME_ABILITIES: Record<KindredId, (keyof AbilityScoresType)[] | null> = {
  breggle: ['intelligence', 'strength'],
  elf: ['charisma', 'strength'],
  grimalkin: ['dexterity'],
  human: null,
  mossling: ['constitution', 'wisdom'],
  woodgrue: ['charisma', 'dexterity'],
};

// 1b. XP Modifier Calculation
export function getPrimeAbilityXpModifier(score: number): number {
  if (score <= 5) return -20;
  if (score <= 8) return -10;
  if (score <= 12) return 0;
  if (score <= 15) return 5;
  return 10;
}

/**
 * XP modifier from the Prime Abilities of the character's class, or of their
 * kindred-class when they have no class, plus the human bonus. null when there's
 * nothing to calculate it from (no class or kindred-class, or a kindred or class
 * id the app doesn't know): callers then keep the stored modifier.
 */
export function calculateXpModifier(
  classId: ClassId | '',
  kindredId: KindredId | '',
  abilityScores: AbilityScoresType,
): { primeBonus: number; humanBonus: number; total: number } | null {
  if ((classId && !isKnownClassId(classId)) || (kindredId && !isKnownKindredId(kindredId))) return null;
  const primeKeys = classId
    ? CLASS_PRIME_ABILITIES[classId]
    : kindredId ? KINDRED_CLASS_PRIME_ABILITIES[kindredId] : null;
  if (!primeKeys) return null;

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
  const table = isKnownClassId(classId) ? STARTING_EQUIPMENT[classId][category] : [];
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
  const classLanguages: string[] = (classId && isKnownClassId(classId) ? CLASS_LANGUAGES[classId] : undefined) ?? [];
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
  if (!classId || !isKnownClassId(classId)) return null;
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
): { ac: number; notes: string[] } | null {
  // Kindred (breggle fur) and class (friar Armour of Faith) both add to AC, so
  // there's nothing to calculate with an id the app doesn't know.
  if (hasUnknownKindredOrClass({ kindred, class: classId })) return null;
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
export function calculateMagicResistance(wisScore: number, kindred: KindredId | ''): { value: number; notes: string[] } | null {
  // Fairy kindreds add +2, so there's nothing to calculate with a kindred the app doesn't know.
  if (kindred && !isKnownKindredId(kindred)) return null;
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

// Encumbrance limits (docs/rules/08-adventuring.md)
export const EQUIPPED_SLOT_LIMIT = 10;
export const STOWED_SLOT_LIMIT = 16;
/** Maximum load in coins of weight; above this the character can't move. */
export const MAX_LOAD_WEIGHT = 1600;

// 2h. Speed Functions (used by calculateEncumbrance in character-sheet.ts, for
// the Inventory tab and the PDF)
// Above the maximum load Speed is 0:
// - Weight: "The maximum load any character can carry is 1,600 coins of weight.
//   Characters carrying more than this cannot move." (Player's Book p148;
//   docs/rules/08-adventuring.md)
// - Slots: "A character cannot carry more than 10 slots of equipped items" and
//   "cannot carry more than a total of 16 slots of stowed items" (p149). The
//   book doesn't give a Speed above those; treating it like the weight limit
//   (can't move) is this app's interpretation.
export function getSpeedByEquippedSlots(equippedSlots: number): number {
  if (equippedSlots <= 3) return 40;
  if (equippedSlots <= 5) return 30;
  if (equippedSlots <= 7) return 20;
  if (equippedSlots <= 10) return 10;
  return 0;
}

export function getSpeedByStowedSlots(stowedSlots: number): number {
  if (stowedSlots <= 10) return 40;
  if (stowedSlots <= 12) return 30;
  if (stowedSlots <= 14) return 20;
  if (stowedSlots <= 16) return 10;
  return 0;
}

export function getSpeedBySlots(equippedSlots: number, stowedSlots: number): number {
  return Math.min(getSpeedByEquippedSlots(equippedSlots), getSpeedByStowedSlots(stowedSlots));
}

export function getSpeedByWeight(totalWeight: number): number {
  if (totalWeight <= 400) return 40;
  if (totalWeight <= 600) return 30;
  if (totalWeight <= 800) return 20;
  if (totalWeight <= 1600) return 10;
  return 0;
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
  if (kindred && isKnownKindredId(kindred)) {
    const kindredOverrides = KINDRED_BASE_SKILL_OVERRIDES[kindred];
    if (kindredOverrides) {
      for (const [key, value] of Object.entries(kindredOverrides)) {
        targets[key] = Math.min(targets[key] ?? 6, value);
        autoSkillKeys.add(key);
      }
    }
  }

  // 3. Apply class base overrides (e.g., Friar Survival 5)
  if (classId && isKnownClassId(classId)) {
    const classOverrides = CLASS_BASE_SKILL_OVERRIDES[classId];
    if (classOverrides) {
      for (const [key, value] of Object.entries(classOverrides)) {
        targets[key] = Math.min(targets[key] ?? 6, value);
        autoSkillKeys.add(key);
      }
    }
  }

  // 4. Apply class skill tables (Bard, Hunter, Thief)
  if (classId && isKnownClassId(classId)) {
    const classSkillTable = CLASS_SKILL_TABLES[classId];
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
  if (isKindredClass && kindred && isKnownKindredId(kindred)) {
    const kindredSkillTable = KINDRED_CLASS_SKILL_TABLES[kindred];
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
  if (classId && isKnownClassId(classId)) {
    const config = EXPERTISE_POINTS_CONFIG[classId];
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

// Spell names match ignoring case, extra spaces and spaces around a slash, so
// "Ignite / Extinguish" (as the Player's Book prints it) is Ignite/Extinguish.
function spellNameKey(name: string): string {
  return name.trim().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').toLowerCase();
}

// Lookups by spellNameKey, since the Spells & Magic tab looks spells up for
// every row each time it renders.
function byNameKey<T extends { name: string }>(spells: readonly T[]): ReadonlyMap<string, T> {
  return new Map(spells.map((s) => [spellNameKey(s.name), s]));
}

const ARCANE_SPELLS_BY_KEY = byNameKey(ARCANE_SPELLS);

export function findArcaneSpell(name: string): { name: string; rank: number } | undefined {
  return ARCANE_SPELLS_BY_KEY.get(spellNameKey(name));
}

// Arcane study costs and durations (Player's Book p78).
// - Book: 1 week/rank + INT check; on fail, no retry until next level.
// - Mentor: 1 week flat (mentor must be 3+ levels higher). Auto-success.
// - Research: 2 weeks + 1,000gp per rank; minimum 1-in-6 failure chance
//   (failure costs the time and money but does not block retry).
// - Rewrite: 1 week + 1,000gp per rank (replacing a lost book's contents).
//   Auto-success (you already knew the spell).
//
// `completionCheck` controls what happens when the study finishes:
//   'int' — player decides INT-check Pass/Fail; fail records a level-gated block.
//   'd6'  — player rolls d6; 1 = fail (no level block, just lost effort).
//   null  — auto-success.
export type CompletionCheck = 'int' | 'd6' | null;

export interface StudyConfig {
  weeksRequired: number;
  goldCost: number;
  completionCheck: CompletionCheck;
}

export function getStudyConfig(source: 'book' | 'mentor' | 'research' | 'rewrite', rank: number): StudyConfig {
  switch (source) {
    case 'book':     return { weeksRequired: Math.max(1, rank),     goldCost: 0,         completionCheck: 'int' };
    case 'mentor':   return { weeksRequired: 1,                     goldCost: 0,         completionCheck: null };
    case 'research': return { weeksRequired: Math.max(2, rank * 2), goldCost: rank * 1000, completionCheck: 'd6' };
    case 'rewrite':  return { weeksRequired: Math.max(1, rank),     goldCost: rank * 1000, completionCheck: null };
    // Defensive fallback for persisted studies whose source somehow no
    // longer matches the four valid literals (e.g., a hand-edited JSON
    // import). Treat as a 1-week auto-complete with no cost.
    default:         return { weeksRequired: 1,                     goldCost: 0,         completionCheck: null };
  }
}

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

const HOLY_SPELLS_BY_KEY = byNameKey(HOLY_SPELLS);

export function findHolySpell(name: string): { name: string; rank: number; saint: string } | undefined {
  return HOLY_SPELLS_BY_KEY.get(spellNameKey(name));
}

// 5B-2: What each arcane and holy spell does, for the Spells & Magic tab.
// Mechanics only (range, duration, targets, saves, damage and numbers), written
// in our own words with no flavour text, so players can check a spell without
// the book. Keyed by the exact names in ARCANE_SPELLS and HOLY_SPELLS.
// Source: the spell entries in the Player's Book (pp80-91 arcane, pp102-111 holy).
//
// Conventions, shared with the glamour, rune and knack descriptions below and
// checked by gamedata.test.ts: plain ASCII, with feet as an apostrophe (30');
// numbers as numerals ("1 target", "3 questions"), while "half", "double" and
// "twice" stay words; how often something can be used or repeated as 1x/day,
// 1x/week and so on; and saves as "Save vs" with Doom, Ray, Hold, Blast or Spell.
export const ARCANE_SPELL_SUMMARIES: Record<string, SpellSummary> = {
  // Rank 1
  'Crystal Resonance': {
    range: "10'", duration: 'Special',
    effect: "Imprint: spend 1 Turn storing the area's light, a still image, sounds or temperature in a gem or crystal worth 50gp+ (1-in-20 it shatters). Release: replay it as harmless ambience (light or temperature for 1 Turn/Level, image for 1 Turn).",
  },
  'Decipher': {
    range: "5'", duration: '2 Turns',
    effect: 'Any writing, code or map symbol the caster passes a hand over can be read as Woldish until the spell ends; works on several texts.',
  },
  'Fairy Servant': {
    range: "30'", duration: '6 Turns',
    effect: "For a gift of a 50gp+ trinket or magical fungus, an invisible flying sprite does simple chores and moves small objects (up to 80 coins of weight). It can't fight (AC 15, HP 1, Fly 20).",
  },
  'Firelight': {
    range: 'The caster', duration: '6 Turns + 1 Turn/Level',
    effect: "Heatless flame on the caster's hand, shoulder or a held item lights a 15' radius. Flaring it ends the spell: everyone else within 30' who sees it Saves vs Spell or is dazzled for 1d4 Rounds (-2 on Attack Rolls).",
  },
  'Floating Disc': {
    range: "6'", duration: '6 Turns',
    effect: "Invisible 3'-wide disc of force follows the caster at waist height, carrying a load of up to 5,000 coins; it drops its load when the spell ends.",
  },
  'Glyph of Sealing': {
    range: "30'", duration: '2d6 Turns',
    effect: 'Holds 1 closed portal (door, gate, lid, etc.) magically shut. Knock dispels it; creatures 3+ Levels above the caster can force it open in 1 Round.',
  },
  'Ignite/Extinguish': {
    range: "30'", duration: 'Instant',
    effect: 'Ignite: 1 stream of sparks per caster Level, split among targets; light sources catch fire and creatures Save vs Ray or take 1 damage per stream. Extinguish: puts out 1 torch-sized or smaller flame per caster Level (a creature holding the flame may Save vs Spell).',
  },
  'Ingratiate': {
    range: 'Touch (object)', duration: '3 Turns',
    effect: 'The object stays enchanted for 3 Turns. Whoever willingly takes it (a mortal, fairy or demi-fey only) Saves vs Spell or is charmed, with a new save 1x/day to break free: it treats the caster as a dear friend, defends them and obeys orders given in a common tongue (refusing harmful or out-of-character ones). Large or sub-Sentient creatures are immune.',
  },
  'Ioun Shard': {
    range: "120'", duration: '2 Turns',
    effect: 'The caster conjures a crystal shard to fire at a visible target in range, at casting or any time before the spell ends: 1d6+1 damage, with no Attack Roll or save. 1 extra shard per 3 Levels (2 at Level 4, 3 at Level 7, and so on), fired together or apart.',
  },
  'Shield of Force': {
    range: 'The caster', duration: '2 Turns',
    effect: 'Invisible barrier gives the caster AC 17 against missiles and AC 15 against other attacks; Ioun Shards never get through.',
  },
  'Vapours of Dream': {
    range: "240'", duration: 'Concentration (up to 1 Round/Level)',
    effect: "Sleep vapour fills a 10' cube at a chosen point, then 1 more adjoining 10' cube each Round. Living creatures up to Level 4 in it Save vs Spell or sleep 4d4 Turns (1 blade attack kills a sleeper; a slap wakes them). Breaks if the caster takes harm, moves or acts.",
  },
  'Ventriloquism': {
    range: "60'", duration: '2 Turns',
    effect: "The caster's voice can be made to come from any point or object within range.",
  },
  // Rank 2
  'Arcane Cypher': {
    range: "5'", duration: 'Permanent',
    effect: 'Turns 1 spell in a spell book, or as much as 1 page of plain text per caster Level, into sigils only the caster can read; only magic such as Decipher reveals it. Magical writing is immune.',
  },
  'Dweomerlight': {
    range: "30'", duration: '6 Turns',
    effect: 'All magic in range glows: magic items, enchanted areas, objects and creatures, spells as they are cast (showing caster and target), and a halo around anyone with arcane spells memorised.',
  },
  'Flaming Spirit': {
    range: "60'", duration: '1 Round/Level',
    effect: "A streak of flame obeys the caster: each Round it can dart at a target within 30' of where it is (Save vs Ray or 1d6 damage).",
  },
  'Glyph of Locking': {
    range: "30'", duration: 'Permanent',
    effect: 'Magically locks 1 closed portal; the glyph turns invisible after 1 Turn (magic can reveal it). The caster, anyone given the password and arcane casters 3+ Levels higher may pass; Knock suppresses it for 1 Turn, and the caster can end it at will.',
  },
  'Invisibility': {
    range: "240'", duration: '1 hour/Level',
    effect: 'Turns 1 creature or object (the caster included) invisible, along with any carried gear (light still shines; items put down reappear). Attacking or casting a spell ends it.',
  },
  'Knock': {
    range: 'Touch (portal)', duration: 'Instant',
    effect: 'Opens 1 closed portal: locks open, bars lift, Glyph of Sealing is dispelled and other magic seals (e.g. Glyph of Locking) are suppressed for 1 Turn. Opens secret doors only if the caster knows about them.',
  },
  'Levitate': {
    range: 'The caster', duration: '6 Turns + 1 Turn/Level',
    effect: "The caster can float straight up or down at up to 20' per Round, moving sideways only by pushing off solid objects, while carrying a normal load.",
  },
  'Mind Crystal': {
    range: "60'", duration: '12 Turns',
    effect: "Holding up a gem or crystal worth 250gp+ and staying still, the caster aims it in 1 direction for 1 Turn, then hears the thoughts of every creature there within range (a jumble if several; 1 more Turn singles out 1 mind). Lead sheeting or 2' of stone blocks it.",
  },
  'Mirror Image': {
    range: 'The caster', duration: '6 Turns',
    effect: "1d4 illusory copies mimic the caster within 3'; the caster's voice and later spells seem to come from a random copy or the caster. Every attack on the caster, hit or miss, destroys 1 copy.",
  },
  'Perceive the Invisible': {
    range: "10'/Level", duration: '6 Turns',
    effect: 'The caster sees invisible creatures and objects within range.',
  },
  'Phantasm': {
    range: "240'", duration: 'Concentration',
    effect: "Silent illusion in a 20' cube: a scene (gone if touched), an attack, or a monster whose Level doesn't exceed the caster's (AC 10, gone if hit). Viewers who fail a Save vs Spell (+4 if the caster never saw the real thing) believe it; its damage is unreal and its effects wear off in 1d4 Turns. Breaks if the caster takes harm, moves or acts.",
  },
  'Web': {
    range: "30'", duration: '2 Turns/Level',
    effect: "Sticky webbing fills a 10' cube, holding creatures inside or blundering in. STR 13+ breaks free in 1d4 Turns (lower never does); Large, stronger-than-human creatures in 1d4 Rounds. Fire burns it away in 2 Rounds, dealing 1d6 to those caught.",
  },
  // Rank 3
  'Circle of Invisibility': {
    range: "120'", duration: '1 hour/Level',
    effect: "A chosen creature and all within 10' of it turn invisible with their gear; the circle moves with that creature. Anyone leaving it reappears, newcomers aren't hidden, and attacking or casting reveals that subject.",
  },
  'Crystal Vision': {
    range: "60'", duration: '12 Turns',
    effect: "Gazing into a gem or crystal worth 500gp+ and staying still, the caster aims it in 1 direction for 1 Turn, then sees (without sound) through the eyes of the nearest living creature there, and may switch to another. Lead sheeting or 2' of stone blocks it.",
  },
  'Dark Sight': {
    range: 'The caster or touch', duration: '1 day',
    effect: "The subject can see in darkness as if it were lit, out to 60'.",
  },
  'Dispel Magic': {
    range: "120'", duration: 'Instant',
    effect: "Dispels every spell effect within a 20' cube; magic from a higher-Level caster has a 5% chance per Level of difference to resist. Magic items and curses from items are unaffected, but curses from spells (e.g. Hex Weaving) are lifted.",
  },
  'Fireball': {
    range: "240'", duration: 'Instant',
    effect: "Explodes at a point in a 20' radius: 1d6 damage per caster Level (Save vs Blast for half).",
  },
  'Fly': {
    range: 'The caster or touch', duration: '1d6 Turns + 1 Turn/Level',
    effect: 'The subject flies in any direction at Speed 120 and can hover.',
  },
  'Haste': {
    range: "240'", duration: '3 Turns',
    effect: "Up to 24 chosen creatures in a 30' radius move at double Speed and make twice their normal attacks each Round (spells cast and magic item uses aren't doubled).",
  },
  'Lightning Bolt': {
    range: "180'", duration: 'Instant',
    effect: "A bolt 60' long and 5' wide from a point in range: 1d6 damage per caster Level (Save vs Ray for half). If it hits a wall short of full length, it bounces back toward the caster for the remaining distance.",
  },
  'Missile Ward': {
    range: "30'", duration: '12 Turns',
    effect: '1 subject is immune to ordinary arrows, sling stones, thrown spears and similar mundane missiles of normal size. Enchanted missiles and huge ones, like hurled boulders, still hurt.',
  },
  'Paralysation': {
    range: "60'", duration: '6 Turns',
    effect: "Creatures in a 20' cube, lowest Level first and totalling up to double the caster's Level, Save vs Hold or are paralysed (aware but helpless). Mindless creatures are immune; the caster can end it at will.",
  },
  'Serpent Glyph': {
    range: 'Touch', duration: 'Until triggered',
    effect: "Glyph (needs 100gp of powdered amber) hidden in a page of text and set off by reading it, or glowing on a surface and set off by touch. A serpent attacks the nearest creature (Attack bonus = caster's Level); on a hit the victim is trapped in a bubble of frozen time for 1d4 days (the caster can free them sooner, or it can be dispelled).",
  },
  'Water Breathing': {
    range: "30'", duration: '1 day',
    effect: '1 subject can breathe water as well as air; swimming is unaffected.',
  },
  // Rank 4
  'Acid Globe': {
    range: "150'", duration: 'Instant',
    effect: "Acid hits 1 target for 1d4 damage per caster Level (Save vs Blast for half; on a failed save, a fresh 1d4 per caster Level next Round). Everyone within 5' of the target Saves vs Blast or takes 2d4.",
  },
  'Arcane Eye': {
    range: "240'", duration: '6 Turns',
    effect: "An invisible, eye-sized magical eye the caster can see through and move (up to 120' per Turn) while concentrating; it sees 60', even in darkness, and can't pass through solid barriers.",
  },
  'Confusion': {
    range: "120'", duration: '12 Rounds',
    effect: "3d6 random creatures in a 30' radius lose control; each Round roll 2d6 for each: 2-5 attacks the caster's group, 6-8 does nothing, 9-12 attacks its own group. Those of Level 3+ may Save vs Spell each Round to act freely; lower Levels get no save.",
  },
  'Dimension Door': {
    range: "10' / 360'", duration: '1 Round',
    effect: "Opens a one-way door within 10' of the caster, leading to an exit up to 360' away (a place the caster knows, or given as distances); 1 creature may step through. An unwilling creature within 10' can be forced through (Save vs Hold resists). No effect if the exit is inside a solid object.",
  },
  'Dominate': {
    range: "120'", duration: 'Until broken',
    effect: 'Charms 3d6 living creatures of Level 3 or less, or 1 creature of higher Level (Save vs Spell resists; each can save again 1x/day to break free). The charmed befriend and defend the caster and obey orders given in a common tongue (not harmful or out-of-character ones).',
  },
  'Hallucinatory Terrain': {
    range: "240'", duration: 'Until touched',
    effect: 'An illusion makes terrain appear (such as a hill, wood or marsh) or disguises real terrain; it must fit inside the range and vanishes when an intelligent creature touches it.',
  },
  'Hex Weaving': {
    range: 'The caster or touch', duration: 'Instant or permanent',
    effect: 'Either lifts 1 curse for good (also freeing the subject from a cursed magic item), or lays a permanent curse (Save vs Spell resists) of up to -2 to saves, -4 to Attack Rolls or 1 Ability Score halved. Curses with different effects can stack.',
  },
  'Plant Growth': {
    range: "120'", duration: 'Permanent',
    effect: "Up to 3,000 sq ft of woodland or scrub (e.g. 150' x 20') becomes a thorny thicket. Large creatures can force their way across at half Speed; smaller ones must cut a path, 10' per Turn.",
  },
  'Polymorph': {
    range: "60'", duration: '1d6 Turns + 1 Turn/Level, or permanent',
    effect: "On the caster (a living form up to their Level; temporary): gains only the form's physical abilities, keeps HP, saves, Attack and mind, and can't cast spells. On another living creature (form up to double the caster's Level; permanent; Save vs Spell if unwilling): becomes the creature in every way but HP. Can't copy a specific individual; death reverts it.",
  },
  'Wall of Fire': {
    range: "60'", duration: 'Concentration + 1 Round/Level',
    effect: "Opaque wall of flame 6 inches thick and at most 20' high: a line (max 60' long) or ring (max 20' across), not in occupied space. Level 3 or lower creatures can't pass; Level 4+ can, taking 3d6 (double for undead and cold creatures). Lasts while the caster concentrates without moving, then 1 Round/Level.",
  },
  'Wall of Ice': {
    range: "120'", duration: '12 Turns',
    effect: "Wall of ice 6 inches thick and at most 20' high: a line (max 60' long) or ring (max 20' across); needs support and can't fill occupied space. Level 3 or lower creatures can't break it; Level 4+ with tools hack a 5' hole in 1d6 Turns, taking 2d6 (double for fire creatures).",
  },
  'Woodland Veil': {
    range: "240'", duration: 'Permanent',
    effect: "Up to 100 chosen Small or Medium creatures in a 120' radius look like a copse or orchard, fooling even those who walk among them. A subject who leaves the area is revealed; the caster can dismiss it any time.",
  },
  // Rank 5
  'Air Sphere': {
    range: "10' around the caster", duration: '1 Turn/Level',
    effect: "Underwater, the caster is wrapped in a bubble of breathable air 10' in radius that moves with them; swimming is unchanged.",
  },
  'Animate Dead': {
    range: "60'", duration: 'Until slain or dispelled',
    effect: 'Raises 1 Medium humanoid corpse or skeleton per caster Level as mindless Level 1 undead servants that obey the caster (AC 12, HP 1d8, weapon +0, Speed 20), with none of their powers from life.',
  },
  'Cloudkill': {
    range: "30'", duration: '6 Turns',
    effect: "Poison fog 30' across drifts at Speed 10 (with the wind, or away from the caster) and sinks into low ground. Creatures touching it take 1 damage per Round; those of Level 4 or lower also Save vs Doom each Round or die.",
  },
  'Conjure Elemental': {
    range: "240'", duration: 'Until dismissed or slain',
    effect: 'Summons a Level 16 air, earth, fire or water elemental from a large mass of that element (AC 21, HP 16d8, blow +11 for 3d8; only magic harms it; Speed: air 120, fire 40, earth 20, water 20 or swim 60). Control is lost if the caster takes harm, moves faster than half Speed or acts, and the freed elemental turns on them; while controlled it can be dismissed.',
  },
  'Fabricate': {
    range: "60'", duration: 'Permanent',
    effect: 'Turns raw materials in range into simple objects normally made from them (e.g. a door from trees, clothes from wool): as much as 1 cubic yard per caster Level, or 1 cubic foot per Level from minerals.',
  },
  'Feeblemind': {
    range: "240'", duration: 'Permanent',
    effect: '1 arcane spell-caster Saves vs Spell at -4 or has INT reduced to 3, losing clear thought and the ability to cast spells.',
  },
  'Mire': {
    range: "120'", duration: '3d6 days',
    effect: "Up to 3,000 sq ft of sand, earth or rock becomes mud 10' deep. Creatures in it move at a tenth of their Speed; heavy ones sink 1' per Round unless they can grab something, and drown if fully submerged.",
  },
  'Passwall': {
    range: "30'", duration: '3 Turns',
    effect: "Opens a temporary hole 5' across and up to 10' deep through solid rock or stone.",
  },
  'Sending': {
    range: 'Unlimited', duration: 'Instant',
    effect: 'Sends a mental message of up to 25 words to a creature the caster knows by name and sight (Animal Intelligence or better); it understands whatever its language.',
  },
  'Telekinesis': {
    range: "120'", duration: 'Concentration (up to 6 Rounds)',
    effect: "Moves 1 object or creature weighing up to 200 coins per caster Level, 20' per Round, any direction including up. A creature, or whoever holds a targeted object, may Save vs Hold to resist. Breaks if the caster takes harm, moves or acts.",
  },
  'Teleport': {
    range: "10'", duration: 'Instant',
    effect: "The caster or 1 creature (gear up to max load; unwilling: Save vs Spell) vanishes to a known open spot at ground level, any distance away. Roll d100: on target on 01-50 (place known scantly), 01-80 (moderately) or 01-95 (exactly); the top 25, 10 or 1 results land 1d10 x 10' too low, the rest 1d10 x 10' too high (a fall). Arriving inside solid matter is fatal.",
  },
  'Wall of Stone': {
    range: "60'", duration: 'Permanent',
    effect: "Creates a stone wall of any shape up to 1,000 cubic feet (e.g. 2' thick, 50' long, 10' high); it needs support and can't fill occupied space.",
  },
  // Rank 6
  'Anti-Magic Ward': {
    range: 'The caster', duration: '1 Round/Level',
    effect: 'A shell around the caster stops every Rank 1-3 spell or spell effect aimed at them, including those from scrolls or wands. Dispel Magic can end it.',
  },
  'Control Weather': {
    range: "720' around the caster", duration: 'Concentration',
    effect: "Outdoors only, brings weather of the caster's choice, e.g. calm (clears bad weather); extreme heat, fog, high winds or snow (half Speed; fog and snow cut sight to 20', winds stop missiles and flying); rain (-2 to missile Attack Rolls, mud halves Speed after 3 Turns). Breaks if the caster takes harm, moves or acts.",
  },
  'Disintegrate': {
    range: "60'", duration: 'Instant',
    effect: "Permanently destroys 1 non-magical creature (Save vs Doom resists) or object (the Referee decides what, e.g. a tree, a ship or 10' of wall).",
  },
  'Dweomerfire': {
    range: "60'", duration: '1 Round',
    effect: "Magic in a 20' cube bursts into flame: enchanted objects, areas and creatures blaze (1d6 to creatures in contact); anyone casting a spell there Saves vs Spell or takes 3d6 and the spell fails; arcane casters Save vs Spell or take 1 damage per memorised spell.",
  },
  'Geas': {
    range: "30'", duration: 'Permanent',
    effect: "The target (Save vs Spell resists) must perform or avoid a set action, or suffer growing penalties that are eventually fatal. An impossible or directly deadly geas rebounds on the caster. Dispel Magic fails; Remove Curse or Hex Weaving work only if cast by someone 2+ Levels above the geas's caster.",
  },
  'Invisible Stalker': {
    range: "Caster's presence", duration: '1 mission or until slain',
    effect: 'Summons an invisible Level 8 creature (AC 16, HP 8d8, crush +7 for 4d4, Speed 40; never loses a trail; surprises 5-in-6 unless the target can see invisible things) bound to 1 mission, pursued until done or until it is destroyed. Unless the mission is quick and easy, it keeps to its literal words while defeating their purpose.',
  },
  'Move Terrain': {
    range: "240'", duration: '6 Turns',
    effect: "Moves 1 terrain feature (such as a hill, a pool or a stand of trees) within a 120' square up to 60' per Turn, carrying any buildings and creatures on it. The caster must concentrate without moving or acting, but can pause and resume.",
  },
  'Oracle': {
    range: 'The caster', duration: '1d6 Turns',
    effect: 'Burning 1,000gp of Ishwagrande dust, ask 3 questions about an object, place or creature that is present (or an item closely tied to it); brief, cryptic answers, each 1-in-6 false or misleading. Usable 1x/week; risks a 1d6-week coma (Save vs Doom at +2).',
  },
  'Petrification': {
    range: "120'", duration: 'Permanent or instant',
    effect: 'Either turns a living creature and its gear to stone for good (Save vs Hold resists), or restores a creature turned to stone by magic, gear included.',
  },
  'Project Image': {
    range: "240'", duration: '6 Turns',
    effect: "An illusory double of the caster, told apart only by touch; the caster's spells seem to come from it, though the caster must still see the targets. Spells and missiles appear not to affect it; a touch or melee hit makes it vanish.",
  },
  'Wave of Force': {
    range: "60' ahead of the caster", duration: '1 Round per 2 Levels',
    effect: "Creatures in a 60'-long, 10'-wide path are pushed 30' per Round directly away from the caster (those faster than 30 trying to advance are pushed back at their own Speed). The caster can aim a new path each Round and must concentrate without moving or acting, but can pause and resume.",
  },
  'Word of Doom': {
    range: "240'", duration: 'Instant',
    effect: "In a 60' cube, creatures totalling up to 4d8 Levels, lowest Level first, Save vs Doom or die instantly. Undead and creatures above Level 7 are unaffected.",
  },
};

export const HOLY_SPELL_SUMMARIES: Record<string, SpellSummary> = {
  // Rank 1
  'Detect Evil': {
    range: "120'", duration: '6 Turns',
    effect: "The caster sees a malevolent aura around objects with evil enchantments and living beings intending evil, but can't read their thoughts. The Referee rules what is evil (Chaotic beings aren't always; traps and poisons aren't).",
  },
  'Detect Magic': {
    range: "60'", duration: '2 Turns',
    effect: 'All magic within range glows: enchanted objects, areas and creatures, whether the magic is lasting or temporary.',
  },
  'Frost Ward': {
    range: "30'", duration: '6 Turns',
    effect: 'All allies in range are unharmed by natural freezing cold, gain +2 to saves against cold (spells or breath, for instance) and take 1 less cold damage per damage die.',
  },
  'Lesser Healing': {
    range: 'The caster or touch', duration: 'Instant',
    effect: 'A living subject either regains 1d6+1 HP (not above their maximum) or is cured of paralysis.',
  },
  'Light': {
    range: "120'", duration: '12 Turns',
    effect: "Choose 1: a 15' radius of holy light (bright enough to read; may be cast on an object to move with it); blindness for 1 Chaotic creature for the spell's duration (Save vs Spell resists); or an end to magical darkness in a 15' radius.",
  },
  'Mantle of Protection': {
    range: 'The caster', duration: '12 Turns',
    effect: "+1 AC and +1 to saves against attacks and powers of Chaotic creatures and of magically created or summoned ones. The latter also can't make melee attacks on the caster (they can still attack from range) until the caster attacks any of them in melee; the bonuses remain.",
  },
  'Purify Food and Drink': {
    range: 'Touch', duration: 'Permanent',
    effect: 'Makes up to 12 portions of spoiled, rotten, poisoned or tainted food and drink wholesome (1 ration or 1 pint = 1 portion).',
  },
  'Rally': {
    range: 'The caster or touch', duration: '2 Turns',
    effect: 'The subject may Save vs Spell with +1 per caster Level to throw off magical fear, both fear already affecting them and any that strikes during the spell.',
  },
  // Rank 2
  'Bless': {
    range: "60'", duration: '6 Turns',
    effect: "Allies in a 20' x 20' area gain +1 to Attack Rolls and damage; retainers among them also gain +1 Loyalty.",
  },
  'Charm Serpents': {
    range: "60'", duration: '1d4 Rounds or 1d4 Turns',
    effect: "Chosen snakes whose Levels add up to no more than double the caster's Level are charmed and won't attack: 1d4 Rounds if they were already attacking, otherwise 1d4 Turns.",
  },
  'Find Traps': {
    range: "30'", duration: '2 Turns',
    effect: 'Every magical and mechanical trap within range is visibly outlined; it gives no help with disarming or avoiding them.',
  },
  'Flame Ward': {
    range: "30'", duration: '2 Turns',
    effect: '1 chosen creature is unharmed by ordinary heat and fire, gains +2 to saves against fire (spells or breath, for instance) and takes 1 less fire damage per damage die.',
  },
  'Hold Person': {
    range: "180'", duration: '9 Turns',
    effect: 'Mortals, fairies or demi-fey who fail a Save vs Hold are paralysed (aware, and may speak if the caster allows): either 1 target (saving at -2) or 1d4 chosen members of a group. Large creatures are immune; the caster can free them with a word.',
  },
  'Reveal Alignment': {
    range: "30'", duration: 'Instant',
    effect: 'The caster learns the Alignment of 1 target in range: a character or monster, or an object or area (objects and places are usually unaligned, though magic items and holy sites can have an Alignment).',
  },
  'Silence': {
    range: "180'", duration: '12 Turns',
    effect: "A 15' radius area falls silent: no sound, speech or spell-casting inside, though those within still hear sounds from outside. Cast on a creature (Save vs Spell negates), the area moves with it.",
  },
  'Speak With Animals': {
    range: 'The caster', duration: '6 Turns',
    effect: 'The caster can talk with all animals of 1 normal or giant species (not intelligent animals or fantastic monsters); friendly ones can be talked into a task they can grasp and manage.',
  },
  // Rank 3
  'Animal Growth': {
    range: "120'", duration: '12 Turns',
    effect: '1 normal or giant animal doubles in size, dealing double melee damage and carrying double its load. No effect on intelligent or magical animals or on fantastic monsters.',
  },
  'Bless Weapon': {
    range: "30'", duration: '1 Turn',
    effect: '1 weapon deals +1d6 damage and counts as magical, so it can harm monsters that only magic can hurt.',
  },
  'Cure Affliction': {
    range: "30'", duration: 'Instant',
    effect: 'A living subject is cured of 1 disease (mundane or magical), or regains lost sight or hearing, whatever the cause (disease, curse or enchantment).',
  },
  'Holy Light': {
    range: "120'", duration: 'Permanent or 6 Turns',
    effect: "Choose 1: permanent true daylight in a 30' radius at a fixed spot; light in a 15' radius around an object for 6 Turns, giving undead in it -2 to Attack Rolls and saves; or an end to magical darkness in a 30' radius.",
  },
  'Locate Object': {
    range: "120'", duration: '6 Turns',
    effect: "Shows the direction to the nearest object of a named kind (e.g. a stairway or altar) or to a specific object the caster can picture exactly, updating as the caster moves. Can't find creatures.",
  },
  'Remove Curse': {
    range: 'The caster or touch', duration: 'Instant',
    effect: 'Permanently lifts 1 curse from the subject, which also lets them get rid of a cursed magic item.',
  },
  // Rank 4
  'Circle of Protection': {
    range: "10' around the caster", duration: '12 Turns',
    effect: "A 10' radius ring moving with the caster gives the caster and allies inside it Mantle of Protection: +1 AC and saves against Chaotic and magically created or summoned creatures, and the latter can't melee them (they can still attack from range) until anyone warded attacks any of them in melee; the bonuses remain.",
  },
  'Create Water': {
    range: 'Touch', duration: 'Permanent',
    effect: "A spring bursts from a wall or the ground, giving about 50 gallons of water: a day's supply for 12 people plus 12 mounts, and for 12 more of each per caster Level above 9.",
  },
  'Greater Healing': {
    range: 'The caster or touch', duration: 'Instant',
    effect: 'A living subject regains 2d6+2 HP, not above their maximum.',
  },
  'Remove Poison': {
    range: 'The caster or touch', duration: 'Instant',
    effect: 'Neutralises poison in a living creature, or removes it from an item, food or drink. Someone killed by poison within the last 10 Rounds is revived with 1 HP.',
  },
  'Speak With Plants': {
    range: 'The caster', duration: '3 Turns',
    effect: 'The caster can talk with plants: ordinary ones report who has passed by lately and grant small favours, such as opening a way for the party or snarling up to bar pursuers. Plant monsters can be talked with too.',
  },
  'Serpent Transformation': {
    range: "120'", duration: '6 Turns',
    effect: '2d8 sticks become Level 1 adders that obey the caster (AC 13, HP 1d8, Speed 30, bite +0 for 1d3 + poison: Save vs Doom or 1 damage per Round for 1d6 Rounds). Each turns back into a stick when slain or when the spell ends.',
  },
  // Rank 5
  'Communion': {
    range: 'The caster', duration: '3 Turns',
    effect: "On a saint's feast day, ask that saint 3 questions, each answered truthfully yes or no, while entranced and unaware of the world. Usable 1x/week (the Referee may limit it to 1x/month); St Clewyd never answers.",
  },
  'Create Food': {
    range: "Caster's presence", duration: 'Permanent',
    effect: "Conjures a day's food for 12 people plus 12 mounts, and for 12 more of each per caster Level above 9.",
  },
  'Holy Fire': {
    range: "30', or the caster or touch", duration: 'Instant, or up to 1 Turn of concentration',
    effect: "Choose 1: while the caster concentrates without moving, undead and magically created or summoned creatures coming within 30' Save vs Spell or are destroyed or banished (those who save flee); 1 such creature in range Saves vs Spell at -2 or is destroyed or banished (fleeing if it saves); or a touch cures a curse, disease or similar affliction.",
  },
  'Holy Quest': {
    range: "30'", duration: 'Until the quest is done',
    effect: "Commands 1 subject to carry out a specific quest that isn't obviously suicidal (Save vs Spell resists). Refusing brings -2 to Attack Rolls and saves; the spell ends when the task is done.",
  },
  'Insect Plague': {
    range: "360'", duration: '1 Turn/Level',
    effect: "A stationary swarm 60' across: creatures of Level 1-2 caught in it flee until at least 240' away, and inside it sight is cut to 30' and every creature takes 1 damage per Round.",
  },
  'Raise Dead': {
    range: "120'", duration: 'Instant',
    effect: "Returns a mortal (not a fairy or demi-fey) to life if dead no more than 2 days per caster Level; needs a cathedral ritual with 12 priests and 2,000gp of incense. The subject then needs 2 weeks of bed rest, which no healing magic can shorten; until then they are at 1 HP and half Speed, carry nothing heavy, and can't fight, cast, use Class abilities or make Skill Checks.",
  },
};

/** The arcane or holy spell with this name (matched as findArcaneSpell does). */
export function findSpell(spellType: SpellType, name: string): { name: string; rank: number } | undefined {
  return spellType === 'arcane' ? findArcaneSpell(name) : findHolySpell(name);
}

/** What an arcane or holy spell does, looked up by name as findSpell does. */
export function getSpellSummary(spellType: SpellType, name: string): SpellSummary | undefined {
  const spell = findSpell(spellType, name);
  if (!spell) return undefined;
  return (spellType === 'arcane' ? ARCANE_SPELL_SUMMARIES : HOLY_SPELL_SUMMARIES)[spell.name];
}

// 5C: Glamour List (20 glamours)
export const GLAMOURS: { id: number; name: string; description: string }[] = [
  { id: 1, name: 'Awe', description: "Mortals and animals in a group make a Morale Check; if it fails, those whose Levels add up to no more than the caster's Level (lowest first) flee for 1d4 Rounds (30', 1x/Turn)" },
  { id: 2, name: 'Beguilement', description: "1 mortal who understands the caster believes what they say unless it Saves vs Spell; afterwards the magical trickery is obvious (30', 1d4 Rounds, 1x/day/subject)" },
  { id: 3, name: 'Breath of the Wind', description: "Move silently (30', 1d4 Rounds, 1x/Turn)" },
  { id: 4, name: 'Cloak of Darkness', description: 'Conjured gloom hides the caster from mundane sight while they stay still and do nothing else, and for 1 Round after they move or act (1x/Turn)' },
  { id: 5, name: 'Conjure Treats', description: "Produces, in the caster's hand, the favourite treat of a mortal or animal; offering it improves their attitude to the caster. Real, but not nourishing (1x/day/subject)" },
  { id: 6, name: 'Dancing Flame', description: "A small flame within 60' leaves its source and floats where the caster directs, 10' per Round, going out when the glamour ends (concentration up to 2d6 Rounds; the caster can move but not act)" },
  { id: 7, name: 'Disguise Object', description: 'A touched object looks like something else of about the same size until another being touches it; 1 object at a time' },
  { id: 8, name: 'Fairy Dust', description: "Briefly reveals invisible creatures and objects within 30'; attacks on revealed creatures take only -1 next Round (1x/day)" },
  { id: 9, name: 'Flame Charm', description: "Either a fingertip flame that lights fires or a 10' radius while the caster concentrates (moving but not acting), or a snap that snuffs an ordinary flame no bigger than a lamp within 10' (a holder may Save vs Spell)" },
  { id: 10, name: "Fool's Gold", description: 'Touched copper coins look like gold to mortals for 1d6 minutes; each viewer may Save vs Spell to see through it (up to 20 coins/Level/day)' },
  { id: 11, name: 'Forgetting', description: "1 mortal or animal forgets what it saw in the last Round unless it Saves vs Spell (30', 1x/day/subject)" },
  { id: 12, name: 'Masquerade', description: "Changes the caster's face: small details (eye or hair colour) instantly, bigger changes in 1 Turn of concentration; can't copy a specific person (until dismissed)" },
  { id: 13, name: 'Mirth and Malice', description: "After talking for 1 Turn to a group of mortals who understand them, the caster stirs up to 1 listener per Level (Save vs Spell resists) to strong affection or anger, which the caster can't steer; it fades within 1 Turn of the caster falling silent (30', 1x/day/group)" },
  { id: 14, name: 'Moon Sight', description: "See in darkness 60' (always active, no fine detail)" },
  { id: 15, name: 'Seeming', description: 'Garb appears as wished (permanent until touched, visual only)' },
  { id: 16, name: 'Silver Tongue', description: 'Communicate with any being/animal (1 day, 1 language/day)' },
  { id: 17, name: 'Subtle Sight', description: '3-in-6 chance (rolled secretly by the Referee) to notice invisible creatures and objects in sight; attacks on a spotted creature take only -1 (always active)' },
  { id: 18, name: 'Through the Keyhole', description: 'Step through a touched door with a keyhole or similar small gap to its other side; a magically sealed door needs a successful Save vs Spell (1x/day/door)' },
  { id: 19, name: 'Vanishing', description: "The caster and their gear vanish from the sight of 1 chosen creature within 60' (light still shines) for 1d3 Rounds, or until they attack it (1x/day/subject)" },
  { id: 20, name: 'Walk in Shadows', description: "Search a 10' x 10' patch of darkness: 2-in-6 to find a shadow door, through which the caster vanishes for 1 Round, then emerges from a random patch of shadow within 60'" },
];

// 5D: Fairy Runes (18 runes across 3 magnitudes)
export type RuneMagnitude = 'lesser' | 'greater' | 'mighty';

export const FAIRY_RUNES: { id: number; name: string; magnitude: RuneMagnitude; description: string }[] = [
  // Lesser (6)
  { id: 1, name: 'Deathly Blossom', magnitude: 'lesser', description: 'Conjures a rose that lasts 1 Turn or until used; a living creature that smells it Saves vs Doom or faints, seeming dead, for 1d6 Turns' },
  { id: 2, name: 'Fog Cloud', magnitude: 'lesser', description: "Fog fills a 20' radius around the caster, blocking mundane sight for all but the caster; strong winds clear it early (1 Turn)" },
  { id: 3, name: 'Gust of Wind', magnitude: 'lesser', description: "A blast of wind 10' wide and 60' long: Small and Medium creatures can't move into it and Save vs Hold or are pushed back 1d3 x 10'; it puts out candles and torches (lanterns 3-in-6), knocks over light objects and scatters fog (1 Round)" },
  { id: 4, name: 'Proof Against Deadly Harm', magnitude: 'lesser', description: "The caster takes no damage from 1 chosen kind of weapon (e.g. swords, bows or claws), except magic or cold iron weapons and magical creatures' attacks (2d6 Rounds)" },
  { id: 5, name: 'Rune of Vanishing', magnitude: 'lesser', description: 'The caster and their gear turn invisible to mortals and animals for 1 Turn; attacking makes them visible for a moment, and foes may strike back that Round or the next at -2' },
  { id: 6, name: 'Sway the Mortal Mind', magnitude: 'lesser', description: "1 Small or Medium mortal of Sentient intelligence or more, within 30', Saves vs Spell or is charmed for 1 day: it befriends and defends the caster and obeys orders in a shared language, but not harmful or out-of-character ones" },
  // Greater (6)
  { id: 7, name: 'Arcane Unbinding', magnitude: 'greater', description: "Ends all arcane and fairy magic in a 20' cube made by casters of the caster's Level or lower (not higher), and stops magic items working for 1 Turn; holy magic is unaffected (120')" },
  { id: 8, name: 'Fairy Gold', magnitude: 'greater', description: 'Conjure 2d100gp (1d6 hours, then coins vanish)' },
  { id: 9, name: 'Fairy Steed', magnitude: 'greater', description: 'Summons a Level 2 fairy horse to ride or otherwise serve the caster until dawn; it refuses suicidal orders (AC 13, HP 2d8, Speed 80)' },
  { id: 10, name: 'Ice Storm', magnitude: 'greater', description: "Hail and sleet deal 3d8 damage to all in a 30'-diameter area; the ground stays icy for 1 Turn, so crossing it without slipping takes half Speed (120')" },
  { id: 11, name: 'Rune of Invisibility', magnitude: 'greater', description: 'The caster and their gear turn invisible to all for 1 day or until the caster chooses to end it; attacking makes them visible for a moment, and foes may strike back that Round or the next at -2' },
  { id: 12, name: 'Sway the Mind', magnitude: 'greater', description: "1 creature of any kind within 30' Saves vs Spell (fairies at +4) or is charmed for 1 day: it befriends and defends the caster and obeys orders in a shared language, but not harmful or out-of-character ones" },
  // Mighty (6)
  { id: 13, name: 'Dream Ship', magnitude: 'mighty', description: 'A dream galleon carries the caster plus as many as 12 companions to any named place in Dolmenwood; the trip feels like 1d6 hours but takes 10 minutes' },
  { id: 14, name: 'Eternal Slumber', magnitude: 'mighty', description: "1 mortal within 20' falls into a timeless, endless sleep, waking only if the magic is dispelled or a condition the caster sets is met" },
  { id: 15, name: 'Rune of Death', magnitude: 'mighty', description: "Mortals and animals in a 30'-diameter area, up to 4d8 Levels in total (lowest first), Save vs Doom or die; any of Level 8+ are immune (120')" },
  { id: 16, name: 'Rune of Wishing', magnitude: 'mighty', description: "Changes reality as the caster wishes, within the Referee's limits; costs 1d3 CON for good (it can never be restored), and a caster brought to 0 CON dies beyond any resurrection" },
  { id: 17, name: 'Summon Wild Hunt', magnitude: 'mighty', description: 'A fairy hunting host (4d6 hounds, 4d20 elves on foot, 4d20 mounted elves, 1d6 goblin horn-blowers) chases a quarry the caster names, staying until it succeeds or 1d6 hours pass' },
  { id: 18, name: 'Unravel Death', magnitude: 'mighty', description: "Touch brings back a mortal, demi-fey or fairy dead no more than 7 days. They then need 2 weeks of bed rest, which healing magic can't shorten; until then they are at 1 HP and half Speed, carry nothing heavy, and can't fight, cast, use Class abilities or make Skill Checks" },
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
      { level: 3, description: 'Charm 1 bird of Level 1 or less as a companion until dismissed (Save vs Spell resists; 1 at a time)' },
      { level: 5, description: '1x/day, forest birds carry a message (10 words at most) to a named person or place at 12 miles/hour' },
      { level: 7, description: '1x/day, a Level 3 flock of woodland birds serves for 1d4 Turns (AC 13, HP 3d8, pecks +2 for 1d6, Fly 40)' },
    ],
  },
  {
    id: 2, name: 'Lock Singer', tiers: [
      { level: 1, description: 'Sing to simple lock, 2-in-6 chance/Turn to open' },
      { level: 3, description: 'Lock reveals key location' },
      { level: 5, description: "Simple locks within 30' snap shut (1 Round song)" },
      { level: 7, description: "Singing opens any lock, 2-in-6/Turn; magically sealed locks too, but with a 1-in-6 chance the magic backfires and the mossling can't open their mouth for 1d4 days" },
    ],
  },
  {
    id: 3, name: 'Root Friend', tiers: [
      { level: 1, description: '1x/day, ask root 1 question (truthful, 1d6 words)' },
      { level: 3, description: '1x/day, summon 1d4 fresh rations from ground' },
      { level: 5, description: '1x/day, shelter in tree roots up to 1 hour (hidden)' },
      { level: 7, description: "1x/day, a Level 3 monstrous root vegetable comes in 1d6 Rounds and serves for 1d6 Turns (AC 13, HP 3d8, 2 claws +2 for 1d4; if both hit, the victim is entangled: 1d4 damage a Round, can't attack, Save vs Hold each Round to escape)" },
    ],
  },
  {
    id: 4, name: 'Thread Whistling', tiers: [
      { level: 1, description: "Whistling ties, unties or unravels string, laces, cloth and other textiles finer than rope within 30'" },
      { level: 3, description: "Loose thread or string within 30' moves as directed, 5' per Round, while the mossling whistles; it can drag objects weighing 20 coins or less but can't attack" },
      { level: 5, description: "The mossling can make ropes within 30' tighten or slacken" },
      { level: 7, description: "A Level 1 rope within 30' attacks and entangles foes while the mossling whistles and concentrates (half Speed, no other actions): AC 13, HP 1d8, grab +0; an entangled victim can't move, takes 1d3 a Round if the rope constricts, and may Save vs Hold instead of attacking to escape" },
    ],
  },
  {
    id: 5, name: 'Wood Kenning', tiers: [
      { level: 1, description: 'A wooden item touched for 1 Turn tells the mossling who made it or who last handled it' },
      { level: 3, description: 'Wood touched for 1 Turn reveals the latest strong feeling a sentient being left in it' },
      { level: 5, description: 'After touching a wooden barrier, such as a door or wall, for 1 Turn, the mossling glimpses what is beyond it' },
      { level: 7, description: "A tree touched for 1 Turn reveals its true name; 1x/day, the mossling can call on any tree they know by its true name to glimpse that tree's surroundings" },
    ],
  },
  {
    id: 6, name: 'Yeast Master', tiers: [
      { level: 1, description: 'Ferment sweet liquids, 1 pint/Turn (2-in-6 palatable to others)' },
      { level: 3, description: "Sipping a drink someone else has partly drunk reveals that person's name" },
      { level: 5, description: "1x/day, a belch at 1 creature within 10', which faints for 1d6 Rounds unless it Saves vs Blast" },
      { level: 7, description: 'Conjure 1d6 fresh rations of yeast feast 1x/day' },
    ],
  },
];

// 5F: Spell Books
// Each spell book holds up to 3 spells.
export const SPELLBOOK_CAPACITY = 3;

// Magician starting spell books
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
  /** null when it depends on a kindred the app doesn't know (an Enchanter's innate glamours). */
  glamourCount: number | null;
  hasRunes: boolean;
  hasKnacks: boolean;
  hasDivineResistance: boolean;
  spellType: SpellType | null;
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
        // Add innate kindred glamours (1 for Elf/Grimalkin) on top of class
        // glamours; an unknown kindred's are unknown, so is the maximum.
        result.glamourCount = kindred && !isKnownKindredId(kindred)
          ? null
          : (ENCHANTER_GLAMOUR_COUNT[clampedLevel] ?? 0) + (kindred ? INNATE_KINDRED_GLAMOUR_COUNT[kindred] ?? 0 : 0);
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
    id: newId(),
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
    knownSpells: [],
    spellStudy: { active: null, queue: [] },
    failedStudies: [],
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
    currentDate: { day: 1, month: 0, year: 1 },
    currentLocation: '',
    currentLocationHex: '',
    mapData: { pois: [], fairyDoors: [], leyLines: [] },
    journalEntries: [],
    npcs: [],

    exhaustionLevel: 0,
    hungerDays: 0,
    thirstDays: 0,
    rations: { fresh: 0, preserved: 0 },
    activeLightSources: [],
    travelDaysWithoutRest: 0,
    forcedMarchActive: false,
    travelPointsRemaining: 0,

    fairyVisits: [],
    livedTimeStart: { day: 1, month: 0, year: 1 },
  };
}
