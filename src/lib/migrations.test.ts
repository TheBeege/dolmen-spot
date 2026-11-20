// Checks on the migration table itself. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_SCHEMA_VERSION, MIGRATION_VERSIONS } from './migrations';

// Two branches that each add a migration both bump CURRENT_SCHEMA_VERSION to
// the same number, so git merges that line without a conflict. Whoever
// merges second must renumber their migration and bump the version again;
// these fail if the bump is forgotten.
test('CURRENT_SCHEMA_VERSION is one more than the last migration', () => {
  assert.equal(Math.max(...MIGRATION_VERSIONS) + 1, CURRENT_SCHEMA_VERSION);
});

test('every version from 1 up to the current one has a migration', () => {
  const expected = Array.from({ length: CURRENT_SCHEMA_VERSION - 1 }, (_, i) => i + 1);
  assert.deepEqual(MIGRATION_VERSIONS, expected);
});
