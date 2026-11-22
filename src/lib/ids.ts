// Ids for the records the sheet mints: characters, journal entries, Fairy
// visits, map markers, spells, gear and the rest. They're only ever compared
// with each other (`visit.id === open.id`), so any string no other record
// shares will do: nothing reads one for its shape, and a saved one is kept as
// it was.

/**
 * A new id: a UUID from `crypto.randomUUID`, or a random string where that
 * isn't there. `crypto.randomUUID` is missing outside a secure context (an
 * http:// address other than localhost) and on older Safari, where calling it
 * throws, so nothing should call it directly.
 */
export function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}`;
}
