/**
 * The fields of a value, as paths: `name`, `saveTargets.doom`, `spells[0].name`.
 * An empty object or list is a path of its own, so a field that should hold
 * entries and holds none is a difference too, and `null` is a value like any
 * other. Used to compare a character the app saved with the fixture it loaded.
 *
 * A key's own `.`, `[`, `]` and `\` are escaped with a backslash, so a key that
 * holds one — `{ 'a.b': 1 }` beside `{ a: { b: 1 } }` — can't take another
 * field's path and hide a difference.
 */
export function keyPaths(value: unknown, from = '', into: string[] = []): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) into.push(from);
    value.forEach((item, index) => keyPaths(item, `${from}[${index}]`, into));
  } else if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) into.push(from);
    for (const [key, item] of entries) keyPaths(item, from ? `${from}.${escapeKey(key)}` : escapeKey(key), into);
  } else {
    into.push(from);
  }
  return into;
}

/** A key with the characters that make up a path escaped. */
function escapeKey(key: string): string {
  return key.replace(/[\\.[\]]/g, (character) => `\\${character}`);
}

/**
 * What's missing from `actual` that `expected` has, and what `actual` has that
 * `expected` doesn't: two sorted lists of paths, which name the fields.
 */
export function keyPathDiff(expected: string[], actual: string[]): { missing: string[]; extra: string[] } {
  const before = new Set(expected);
  const after = new Set(actual);
  return {
    missing: [...before].filter((path) => !after.has(path)).sort(),
    extra: [...after].filter((path) => !before.has(path)).sort(),
  };
}
