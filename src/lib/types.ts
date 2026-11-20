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

export type InventoryItemKind = 'spellbook' | 'scroll';

export interface SpellbookEntry {
  name: string;
  rank: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  slots: number;
  weight: number;
  notes: string;
  equipped: boolean;
  containerId?: string;  // links stowed item to a CharacterContainer
  kind?: InventoryItemKind;
  spellbookContents?: SpellbookEntry[];  // present when kind === 'spellbook'; max 3 (Player's Book p78)
  scrollSpell?: SpellbookEntry;           // present when kind === 'scroll'
  isStartingBook?: boolean;               // stamped by ApplyStartingBookButton so a rename doesn't reopen the dropdown
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

export type KnownSpellSource = 'starting' | 'studied' | 'mentor' | 'research' | 'rewrite' | 'manual';

export interface KnownSpell {
  id: string;
  name: string;
  rank: number;
  source: KnownSpellSource;
  learnedAt?: CalendarDate;       // Dolmenwood date (frozen at the entry date while in Fairy)
  learnedInFairy?: FairyDate;     // set when the spell was learned during a Fairy visit
  sinceReturnFrom?: string;       // the Fairy visit the character had last come back from (see FairyVisit)
  notes?: string;
}

export type StudySource = 'book' | 'mentor' | 'research' | 'rewrite';

export interface SpellStudyEntry {
  id: string;
  spellName: string;
  rank: number;
  source: StudySource;
  weeksRequired: number;
  goldCost: number;             // 0 for book/mentor; rank * 1000 for research/rewrite
  targetSpellbookId?: string;   // inventory item id; spell is written here on success
  notes?: string;
}

export interface ActiveSpellStudy extends SpellStudyEntry {
  startedOn: CalendarDate;        // Dolmenwood date, for display (frozen at the entry date while in Fairy)
  // Progress is measured on the character's own clock: the lived day the
  // study began (see src/lib/livedTime.ts), so days spent in Fairy count
  // and Dolmenwood time that passes while the character is away does not.
  startedLivedDay: number;
  startedInFairy?: FairyDate;     // set when the study began during a Fairy visit
  sinceReturnFrom?: string;       // the Fairy visit the character had last come back from (see FairyVisit)
}

export interface SpellStudyState {
  active: ActiveSpellStudy | null;
  queue: SpellStudyEntry[];
}

export interface FailedStudyAttempt {
  spellName: string;
  failedAtLevel: number;   // blocks restudy until character level > this
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
  year: number;  // campaign year; defaults to 1 for new characters
}

// 4-digit column-row hex coordinate (e.g. "0303" = column 3, row 3).
// See src/lib/hex-grid.ts for the canonical set of valid hexes.
export type HexCoord = string;

// 1-indexed column/row of a hex, as printed in its coordinate.
export interface HexPos {
  col: number;
  row: number;
}

export type Terrain = 'woods' | 'open';

// One hex of the printed map (src/lib/hex-grid.json).
export interface HexCell extends HexPos {
  terrain: Terrain;
}

// Calibration of the printed map image the hex grid was extracted from
// (scripts/extract_hex_grid.py). Pixel values are in that image's frame.
export interface HexGridMeta {
  imageWidth: number;
  imageHeight: number;
  labelX_col1: number;     // x of hex 0101's printed label (and of every column-01 centre)
  labelY_row1: number;     // y of hex 0101's printed label
  colPitch: number;        // horizontal distance between neighbouring columns
  rowPitch: number;        // vertical distance between rows of one column
  labelToCenterDy: number; // a hex's centre sits this far below its label
  hexSize: number;         // nominal centre-to-vertex distance (rowPitch / √3)
  orientation: 'flat-top';
  offset: 'odd-q';
  /** Number of hexes in the manifest; checked against the loaded data. */
  cellCount: number;
}

export interface MapPOI {
  id: string;
  hex: HexCoord;
  name: string;
  notes: string;
}

export type FairyDoorDestination =
  | { kind: 'wild' }
  | { kind: 'roaded'; pairedDoorId: string; roadName: string };

export interface FairyDoor {
  id: string;
  hex: HexCoord;
  name: string;
  notes: string;
  destination: FairyDoorDestination;
}

export interface LeyLine {
  id: string;
  type: string;      // free-text label, e.g. "Ley line", "Ancient Road", "Ward"
  name: string;
  color: string;     // CSS hex color, e.g. "#c4a35a"
  hexes: HexCoord[]; // ordered sequence of hex coords the line passes through
  notes: string;
}

export interface LeyLineDraft {
  name: string;
  type: string;
  color: string;
  notes: string;
  hexes: HexCoord[];
}

export interface CharacterMapData {
  pois: MapPOI[];
  fairyDoors: FairyDoor[];
  leyLines: LeyLine[];
  // In-progress ley line draft. Persisted so it survives tab unmounts;
  // absent when not drawing.
  draftLeyLine?: LeyLineDraft;
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
  moonPhase: '' | 'waxing' | 'full' | 'waning';
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
  knownSpells: KnownSpell[];
  spellStudy: SpellStudyState;
  failedStudies: FailedStudyAttempt[];

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
  currentLocationHex: HexCoord | '';
  mapData: CharacterMapData;
  journalEntries: JournalEntry[];

  exhaustionLevel: number;
  hungerDays: number;
  thirstDays: number;
  rations: { fresh: number; preserved: number };
  activeLightSources: ActiveLightSource[];
  travelDaysWithoutRest: number;
  forcedMarchActive: boolean;
  travelPointsRemaining: number;

  // Visits to Fairy, oldest first. Only the last one can still be open
  // (returnedOn === null), which means the character is in Fairy now.
  fairyVisits: FairyVisit[];
  // The Dolmenwood date the days-lived counter counts from: when the
  // character's story began. Defaults to Year 1, 1 Grimvold.
  livedTimeStart: CountingStart;
}

// The days-lived counter's start. Like a record, it carries the Fairy visit
// the character had last come back from by then (`sinceReturnFrom`, see
// FairyVisit), so editing that return date moves the start with it and the
// count stays the same. Never a day the character was away in Fairy.
export interface CountingStart extends CalendarDate {
  sinceReturnFrom?: string;
}

// Polymorphic onChange contract used by every character-tab component and
// useCharacter.updateCharacter. Accepting both a partial-character object
// and a functional updater means callers that need to compose several
// writes in one tick (e.g. HexMap's map edits) can do so without losing
// any. Components that only ever write a single object can keep passing one.
export type CharacterUpdater =
  | Partial<Character>
  | ((prev: Character) => Partial<Character>);

export interface JournalEntry {
  id: string;
  date: CalendarDate;      // Dolmenwood date (frozen at the entry date while in Fairy)
  fairyDate?: FairyDate;   // set when the entry was written during a Fairy visit
  fairyEvent?: FairyEvent; // set on the entries the app writes when entering or leaving Fairy
  sinceReturnFrom?: string; // the Fairy visit the character had last come back from (see FairyVisit)
  location: string;
  hex?: HexCoord;          // the map hex it was written in (currentLocationHex then); absent for none
  text: string;
}

// Marks a journal entry as the automatic record of entering or leaving a
// Fairy visit, so editing that visit's return date can update it.
export interface FairyEvent {
  visitId: string;
  kind: 'entered' | 'returned';
}

// A trip into Fairy. Fairy is timeless: while the character is there,
// Dolmenwood's calendar (Character.currentDate) stays on `enteredOn` and
// only `daysInFairy` advances. On return the Referee decides how much
// Dolmenwood time has passed, which sets `returnedOn`.
//
// Records made in Dolmenwood after a return, and a days-lived counter start
// on or after it, carry that visit's id as `sinceReturnFrom`. Editing the
// return date moves exactly those with it; a date alone can't tell "before
// entering" from "after a same-day return".
export interface FairyVisit {
  id: string;
  enteredOn: CalendarDate;          // Dolmenwood date the character entered Fairy
  returnedOn: CalendarDate | null;  // Dolmenwood date they came back; null while still in Fairy
  daysInFairy: number;              // days the character lived in Fairy on this visit
}

// A day inside a Fairy visit. Refers to the visit by id, so repeat visits
// are never ambiguous. `day` is 1-based: day 1 is the day they entered.
export interface FairyDate {
  visitId: string;
  day: number;
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
