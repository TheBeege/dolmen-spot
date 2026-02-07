import { Character } from './types';
import { createDefaultCharacter } from './gamedata';

export const CURRENT_SCHEMA_VERSION = 2;

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
