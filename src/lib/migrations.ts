import { Character } from './types';
import { createDefaultCharacter } from './gamedata';

export const CURRENT_SCHEMA_VERSION = 9;

// Each migration transforms from version N to N+1.
// Migrations receive raw data (any) and return transformed data.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const migrations: Record<number, (data: any) => any> = {
  // v1 -> v2: Fix default skill targets from 5 to 6.
  // Only updates the 3 base skills if they're still at the old default of 5.
  1: (data) => {
    if (data.skillTargets) {
      const base = ['listen', 'search', 'survival'];
      for (const skill of base) {
        if (data.skillTargets[skill] === 5) {
          data.skillTargets[skill] = 6;
        }
      }
    }
    return data;
  },
  // v2 -> v3: Add equippedArmourName and hasShield fields for combat auto-calc.
  2: (data) => {
    if (data.equippedArmourName === undefined) data.equippedArmourName = '';
    if (data.hasShield === undefined) data.hasShield = false;
    return data;
  },
  // v3 -> v4: Add magic system fields (glamours, runes, knack, startingSpellBook).
  3: (data) => {
    if (data.glamours === undefined) data.glamours = [];
    if (data.runes === undefined) data.runes = [];
    if (data.knack === undefined) data.knack = null;
    if (data.startingSpellBook === undefined) data.startingSpellBook = '';
    return data;
  },
  // v4 -> v5: Add containers array for inventory container tracking.
  4: (data) => {
    if (data.containers === undefined) data.containers = [];
    return data;
  },
  // v5 -> v6: Add adventuring fields (exhaustion, hunger, thirst, rations, light sources, travel).
  5: (data) => {
    if (data.exhaustionLevel === undefined) data.exhaustionLevel = 0;
    if (data.hungerDays === undefined) data.hungerDays = 0;
    if (data.thirstDays === undefined) data.thirstDays = 0;
    if (data.rations === undefined) data.rations = { fresh: 0, preserved: 0 };
    if (data.activeLightSources === undefined) data.activeLightSources = [];
    if (data.travelDaysWithoutRest === undefined) data.travelDaysWithoutRest = 0;
    if (data.forcedMarchActive === undefined) data.forcedMarchActive = false;
    if (data.travelPointsRemaining === undefined) data.travelPointsRemaining = 0;
    return data;
  },
  // v6 -> v7: Add class/kindred feature fields (retainers, gaze, forms, revelry, trophies, etc.).
  6: (data) => {
    if (data.retainers === undefined) data.retainers = [];
    if (data.gazeUsesRemaining === undefined) data.gazeUsesRemaining = 0;
    if (data.currentForm === undefined) data.currentForm = 'estray';
    if (data.wilderUsedToday === undefined) data.wilderUsedToday = false;
    if (data.madRevelryUsesRemaining === undefined) data.madRevelryUsesRemaining = 0;
    if (data.trophies === undefined) data.trophies = [];
    if (data.animalCompanion === undefined) data.animalCompanion = null;
    if (data.liegeHouse === undefined) data.liegeHouse = '';
    if (data.selectedCombatTalents === undefined) data.selectedCombatTalents = [];
    if (data.holyOrder === undefined) data.holyOrder = '';
    if (data.symbioticFleshTraits === undefined) data.symbioticFleshTraits = [];
    if (data.fungalSymbiosisUsesRemaining === undefined) data.fungalSymbiosisUsesRemaining = 0;
    return data;
  },
  // v7 -> v8: Add moonPhase field for moon sign phases (Waxing/Full/Waning).
  7: (data) => {
    if (data.moonPhase === undefined) data.moonPhase = '';
    return data;
  },
  // v8 -> v9: Fix incorrect moon sign names. Old values were hallucinated;
  // clear them so users can re-select from the correct list.
  8: (data) => {
    const validMoonSigns = [
      'Grinning moon', 'Dead moon', 'Beast moon', 'Squamous moon',
      "Knight's moon", 'Rotting moon', "Maiden's moon", "Witch's moon",
      "Robber's moon", 'Goat moon', 'Narrow moon', 'Black moon',
    ];
    if (data.moonSign && !validMoonSigns.includes(data.moonSign)) {
      data.moonSign = '';
      data.moonPhase = '';
    }
    return data;
  },
};

/**
 * Deep-merge saved character data over a fresh default character.
 * Missing fields get safe defaults without overwriting existing player data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reconcileWithDefaults(data: any): any {
  const defaults = createDefaultCharacter();

  for (const key of Object.keys(defaults) as (keyof Character)[]) {
    if (data[key] === undefined) {
      data[key] = defaults[key];
    } else if (
      defaults[key] !== null &&
      typeof defaults[key] === 'object' &&
      !Array.isArray(defaults[key])
    ) {
      // One-level deep merge for nested objects (abilityScores, saveTargets, coins, currentDate, skillTargets)
      const defaultObj = defaults[key] as Record<string, unknown>;
      const dataObj = data[key] as Record<string, unknown>;
      for (const subKey of Object.keys(defaultObj)) {
        if (dataObj[subKey] === undefined) {
          dataObj[subKey] = defaultObj[subKey];
        }
      }
    }
  }

  return data;
}

/**
 * Migrate a character from any schema version to the current version,
 * then reconcile with defaults to fill any missing fields.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateCharacter(data: any): Character {
  // Characters saved before versioning have no schemaVersion field
  if (data.schemaVersion === undefined) {
    data.schemaVersion = 1;
  }

  // Run each migration in sequence
  while (data.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const migration = migrations[data.schemaVersion];
    if (!migration) {
      console.warn(`No migration found for schema version ${data.schemaVersion}`);
      break;
    }
    data = migration(data);
    data.schemaVersion = data.schemaVersion + 1;
  }

  return reconcileWithDefaults(data) as Character;
}
