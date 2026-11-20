import type { CharacterMapData, FairyDoor, FairyDoorDestination } from './types';

/** Map data with nothing on it. Read-only: copy it before changing anything. */
export const EMPTY_MAP_DATA: Readonly<CharacterMapData> = Object.freeze({
  pois: [],
  fairyDoors: [],
  leyLines: [],
});

/** Colors given to new ley lines, in turn. */
export const LEY_LINE_COLORS = ['#c4a35a', '#7a5fc4', '#5fa3c4', '#c45f7a', '#7ac45f'] as const;

/** Type given to a new ley line. */
export const DEFAULT_LEY_LINE_TYPE = 'Ley line';

/**
 * Doors that `selfId` can pair with without breaking another door's link:
 * wild doors that no other door points at, and roaded doors whose partner is
 * `selfId` or no longer exists. Pass `null` for a door that doesn't exist yet.
 */
export function pairableDoors(allDoors: readonly FairyDoor[], selfId: string | null): FairyDoor[] {
  // Reverse index: doorId -> doors whose roads point at it.
  const targetedBy = new Map<string, Set<string>>();
  for (const d of allDoors) {
    if (d.destination.kind === 'roaded') {
      const set = targetedBy.get(d.destination.pairedDoorId) ?? new Set<string>();
      set.add(d.id);
      targetedBy.set(d.destination.pairedDoorId, set);
    }
  }
  return allDoors.filter((d) => {
    if (d.id === selfId) return false;
    if (d.destination.kind === 'wild') {
      const claims = targetedBy.get(d.id);
      if (!claims || claims.size === 0) return true;
      // Asymmetric data: another door points at this wild door. Pairable
      // only if that other door is self (and nobody else).
      return selfId !== null && claims.size === 1 && claims.has(selfId);
    }
    // Roaded: pairable if linked to self, or if its partner is gone.
    const partnerId = d.destination.pairedDoorId;
    if (selfId !== null && partnerId === selfId) return true;
    return !allDoors.some((x) => x.id === partnerId);
  });
}

/**
 * Every other door that must change when `selfId`'s destination goes from
 * `selfPrev` to `next`:
 *   wild → roaded(P): P points back at self; if P was paired with a different
 *     Q, Q goes wild (otherwise Q would be left pointing at P).
 *   roaded(P) → wild: P goes wild.
 *   roaded(P) → roaded(Q): P goes wild, plus the Q clean-up above.
 * The returned list doesn't include self.
 */
export function partnerUpdates(
  selfId: string,
  selfPrev: FairyDoorDestination,
  next: FairyDoorDestination,
  allDoors: readonly FairyDoor[],
): FairyDoor[] {
  const updates = new Map<string, FairyDoor>();
  const setWild = (doorId: string) => {
    if (doorId === selfId || updates.has(doorId)) return;
    const door = allDoors.find((d) => d.id === doorId);
    if (!door || door.destination.kind === 'wild') return;
    updates.set(doorId, { ...door, destination: { kind: 'wild' } });
  };

  // Self's previous partner (if any) loses its link.
  if (selfPrev.kind === 'roaded' && (next.kind !== 'roaded' || next.pairedDoorId !== selfPrev.pairedDoorId)) {
    setWild(selfPrev.pairedDoorId);
  }

  if (next.kind === 'roaded') {
    const newPartner = allDoors.find((d) => d.id === next.pairedDoorId);
    if (newPartner) {
      // A new partner that was paired with someone else leaves that door
      // without a partner: clear it too.
      if (newPartner.destination.kind === 'roaded' && newPartner.destination.pairedDoorId !== selfId) {
        setWild(newPartner.destination.pairedDoorId);
      }
      updates.set(newPartner.id, {
        ...newPartner,
        destination: { kind: 'roaded', pairedDoorId: selfId, roadName: next.roadName },
      });
    }
  }

  return Array.from(updates.values());
}

/** True if `dest` can be saved for door `selfId` given `allDoors`. */
export function isValidDestination(
  allDoors: readonly FairyDoor[],
  selfId: string | null,
  dest: FairyDoorDestination,
): boolean {
  return dest.kind === 'wild' || pairableDoors(allDoors, selfId).some((d) => d.id === dest.pairedDoorId);
}

/**
 * `allDoors` with `door` added (new id) or replaced (existing id), keeping
 * every fairy road symmetric. Call it with the current doors (inside a state
 * updater), not a render snapshot. If `door`'s roaded destination is no
 * longer valid there (its partner was deleted or taken), the door keeps its
 * previous destination (wild for a new door).
 */
export function upsertFairyDoor(allDoors: readonly FairyDoor[], door: FairyDoor): FairyDoor[] {
  const prev = allDoors.find((d) => d.id === door.id);
  const prevDest: FairyDoorDestination = prev?.destination ?? { kind: 'wild' };
  const dest = isValidDestination(allDoors, door.id, door.destination) ? door.destination : prevDest;
  const saved: FairyDoor = { ...door, destination: dest };
  const updates = partnerUpdates(door.id, prevDest, dest, allDoors);
  const out = allDoors.map((d) => (d.id === door.id ? saved : updates.find((u) => u.id === d.id) ?? d));
  if (!prev) out.push(saved);
  return out;
}

/** `allDoors` without door `id`; a door whose road led to it goes wild. */
export function deleteFairyDoor(allDoors: readonly FairyDoor[], id: string): FairyDoor[] {
  return allDoors
    .filter((d) => d.id !== id)
    .map((d): FairyDoor => (d.destination.kind === 'roaded' && d.destination.pairedDoorId === id
      ? { ...d, destination: { kind: 'wild' } }
      : d));
}
