// Ids for the records the sheet mints: characters, journal entries, Fairy
// visits, map markers, spells, gear and the rest. They're only ever compared
// with each other (`visit.id === open.id`), so any string no other record
// shares will do: nothing reads one for its shape, and a saved one is kept as
// it was.

/**
 * A new id: a UUID from `crypto.randomUUID`, or a random string where there
 * isn't one. That method only exists in a secure context (https, or localhost)
 * and only in browsers recent enough to have it, and it is absent rather than
 * throwing there: the throw comes from calling it anyway, which is what the
 * old code did. Nothing should call it directly.
 */
export function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2) || '0'}`;
}
