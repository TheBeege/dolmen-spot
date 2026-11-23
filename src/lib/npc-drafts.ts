// What has been typed into the NPCs tab but not saved, kept while the player
// looks at another tab. Picking another tab unmounts the NPCs tab
// (src/app/page.tsx), so a half-written note or a half-filled form would
// otherwise go with it, silently.
//
// It lives in sessionStorage, under the character's id: that outlives a tab
// switch, goes when the browser tab does, and is never shared with another
// browser tab. It is not part of the character: nothing here is saved with it,
// and deleting the character drops the key (forgetNpcDrafts).

/** What a form has been typed into, before it's saved. */
export interface NpcDraft {
  name: string;
  affiliation: string;
  location: string;
  goals: string;
  hex: string; // as typed; read with readHexInput on save
}

/** Which NPC's form was open: the one being added, or the one being edited. */
export type NpcEditing = { kind: 'new' } | { kind: 'npc'; id: string };

/** What the NPCs tab keeps for a character while the player is looking at another tab. */
export interface NpcDrafts {
  notes: Record<string, string>; // what has been typed into each NPC's note composer, by NPC id
  editing: NpcEditing | null;    // the form that was open...
  form: NpcDraft | null;         // ...and what had been typed into it
}

const DRAFTS_KEY_PREFIX = 'dolmenwood-npc-drafts:';

function draftsKey(characterId: string): string {
  return `${DRAFTS_KEY_PREFIX}${characterId}`;
}

const isText = (value: unknown): value is string => typeof value === 'string';
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** A saved draft, read defensively: anything that isn't one is nothing to restore. */
function asDraft(value: unknown): NpcDraft | null {
  if (!isRecord(value)) return null;
  const { name, affiliation, location, goals, hex } = value;
  if (![name, affiliation, location, goals, hex].every(isText)) return null;
  return { name, affiliation, location, goals, hex } as NpcDraft;
}

function asEditing(value: unknown): NpcEditing | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'new') return { kind: 'new' };
  return value.kind === 'npc' && isText(value.id) ? { kind: 'npc', id: value.id } : null;
}

/** What was kept for `characterId`; null when there's nothing, or it can't be read. */
export function readNpcDrafts(characterId: string): NpcDrafts | null {
  try {
    const raw = sessionStorage.getItem(draftsKey(characterId));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const kept: NpcDrafts = { notes: {}, editing: asEditing(parsed.editing), form: asDraft(parsed.form) };
    if (isRecord(parsed.notes)) {
      for (const [id, text] of Object.entries(parsed.notes)) if (isText(text)) kept.notes[id] = text;
    }
    return kept;
  } catch {
    // No sessionStorage, or nothing readable in it: the tab opens empty, as it
    // did before any of this was kept.
    return null;
  }
}

/** Keep `kept` for `characterId`, or forget it once there's nothing in it. */
export function saveNpcDrafts(characterId: string, kept: NpcDrafts): void {
  const notes = Object.fromEntries(Object.entries(kept.notes).filter(([, text]) => text !== ''));
  const empty = Object.keys(notes).length === 0 && kept.editing === null && kept.form === null;
  try {
    if (empty) sessionStorage.removeItem(draftsKey(characterId));
    else sessionStorage.setItem(draftsKey(characterId), JSON.stringify({ ...kept, notes }));
  } catch {
    // A browser that won't store it (private mode, no room left) loses the
    // drafts on a tab switch, as it did before: nothing else breaks.
  }
}

/** Forget what was kept for `characterId`, as deleting the character does. */
export function forgetNpcDrafts(characterId: string): void {
  try {
    sessionStorage.removeItem(draftsKey(characterId));
  } catch {
    // Nothing was readable in the first place: there is nothing to forget.
  }
}
