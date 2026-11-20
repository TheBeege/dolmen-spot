'use client';

import { useSyncExternalStore } from 'react';
import { downloadFile, localFileStamp } from '@/lib/download';
import {
  changesNotSaved,
  getCharacterStore,
  isSavingPaused,
  NO_STORAGE_PROBLEMS,
  type StorageStatus,
  type StoredBackup,
} from '@/lib/storage';

/*
 * How storage problems reach the player:
 * - <StorageReminder> sits in the sticky header while changes aren't being
 *   saved: one line with a Details button.
 * - <StorageBanner> sits right after the header and scrolls away. It explains
 *   the problem found on this visit, with what to do first, and shows any
 *   backups left from earlier visits as one calm line. Dismissing the problem
 *   folds its backup into that line.
 * - <StorageAnnouncer> is a hidden live region, always mounted, whose text
 *   changes only when the problem does, so screen readers hear it once.
 * Nothing renders while storage works and no backups are waiting.
 */

const subscribe = (onChange: () => void) => getCharacterStore().subscribe(onChange);
const getSnapshot = () => getCharacterStore().getStatus();
const getServerSnapshot = () => NO_STORAGE_PROBLEMS;

function useStorageStatus(): StorageStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Which problem the player dismissed. Shared by the reminder and the banner,
// and kept for the whole visit (it outlives a remount of the page).
let dismissedProblem: string | null = null;
const dismissListeners = new Set<() => void>();

function setDismissedProblem(signature: string | null) {
  dismissedProblem = signature;
  dismissListeners.forEach((listener) => listener());
}

function subscribeDismissed(listener: () => void) {
  dismissListeners.add(listener);
  return () => { dismissListeners.delete(listener); };
}

function useDismissedProblem(): string | null {
  return useSyncExternalStore(subscribeDismissed, () => dismissedProblem, () => null);
}

const RELEASE_CONFIRM =
  "Your downloaded file keeps the data Dolmen Spot couldn't read. Replace it in this browser with your current characters?";
const DELETE_CONFIRM =
  "Delete the backup from this browser? Make sure the downloaded file was saved first: after this, it's the only copy.";

const BUTTON = 'text-xs font-semibold rounded border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a35a]';
const PRIMARY = `${BUTTON} px-3 py-1.5 border-transparent bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8]`;
const SECONDARY = `${BUTTON} px-3 py-1.5 border-[#5a3a28] text-[#f5e6c8]/85 hover:text-[#f5e6c8] hover:border-[#c4a35a]/60`;
const SMALL_SECONDARY = `${BUTTON} px-2 py-1 border-[#5a3a28] text-[#f5e6c8]/85 hover:text-[#f5e6c8] hover:border-[#c4a35a]/60`;
const DISMISS = 'shrink-0 w-8 h-8 -mr-1 rounded text-lg leading-none text-[#f5e6c8]/60 hover:text-[#f5e6c8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a35a]';

interface Problem {
  /** Changes aren't being saved: a warning rather than information. */
  urgent: boolean;
  title: string;
  /** Short lines, what to do first. */
  lines: string[];
  showDownload: boolean;
  showRelease: boolean;
  showReload: boolean;
}

/** The problem this visit found, or null. Earlier visits' backups aren't problems. */
function describeProblem(status: StorageStatus, characterCount: number): Problem | null {
  const title = problemTitle(status);
  if (!title) return null;

  const yours = characterCount === 1 ? 'your character' : 'your characters';
  const paused = status.unsavedRecovery.length > 0;
  const replaced = newEntries(status).some((e) => e.kind === 'all-characters');
  const setAside = newSetAside(status);
  const removed = newEntries(status).filter((e) => e.kind === 'character' && !isCharacterLike(e.value)).length;
  const keptOthers = status.setAside.filter((e) => !isCharacterLike(e.value)).length;

  const lines: string[] = [];
  // What to do first.
  if (status.storageUnreadable) lines.push(`Export ${yours} before closing this tab.`);
  else if (status.conflict) lines.push(`Export ${yours} to keep the changes made in this tab, then reload it to continue.`);
  else if (paused && !status.downloaded?.coversUnsavedRecovery) lines.push(`Download the backup, then export ${yours} before closing this tab.`);
  else if (paused || status.saveError) lines.push(`Export ${yours} before closing this tab.`);
  else lines.push('Download the backup and keep it, or attach it to a bug report.');

  // What happened.
  if (status.storageUnreadable) {
    lines.push("Your browser is blocking this site's storage, so your saved characters can't be opened right now. They haven't been changed.");
    lines.push('Allow this site to store data in your browser settings, then reload. Until then, nothing is saved.');
  }
  if (status.conflict) {
    lines.push('Another tab saved changes to your characters, so this tab stopped saving to avoid overwriting them.');
  }
  if (paused) {
    lines.push(
      "Your saved characters couldn't be read, so a new sheet was started. Dolmen Spot couldn't save a backup of the old data " +
      "(your browser's storage may be full), so it has left the old data as it was.",
    );
    lines.push("Saving stays paused until there's room for a backup, or until you choose Start Saving Again after downloading the backup.");
  }
  if (status.saveError && !isSavingPaused(status)) {
    lines.push(
      `Your browser refused to save changes made since ${formatWhen(status.saveError.since)} (its storage may be full). ` +
      "They're only in this tab for now.",
    );
    lines.push("Saving starts again by itself once there's room.");
  }
  if (replaced && !paused) {
    lines.push(title === "Your saved characters couldn't be read"
      ? 'A new sheet was started. The old data was saved as a backup in this browser first.'
      : "Your saved characters couldn't be read, so a new sheet was started. The old data was saved as a backup in this browser first.");
  }
  if (setAside.length > 0) {
    const one = setAside.length === 1;
    lines.push(
      `${joinNames(setAside.map((e) => characterName(e.value)))} can't be opened by this version of Dolmen Spot. ` +
      `${one ? "It's" : "They're"} kept in your list as ${one ? 'it was' : 'they were'}, and Dolmen Spot tries again each time it opens.`,
    );
    if (setAside.some((e) => e.backupKey === null)) {
      lines.push(`Dolmen Spot couldn't also save a backup copy (your browser's storage may be full), so Download Backup is the only other copy.`);
    }
  }
  if (removed > 0) {
    lines.push(`${removed === 1 ? "A saved entry that wasn't a character was" : `${removed} saved entries that weren't characters were`} moved to the backup.`);
  }
  if (keptOthers > 0) {
    lines.push(`${keptOthers === 1 ? "A saved entry that isn't a character is" : `${keptOthers} saved entries that aren't characters are`} kept until there's room for a backup.`);
  }

  return {
    urgent: changesNotSaved(status),
    title,
    lines,
    showDownload: paused || replaced || setAside.length > 0 || removed > 0 || keptOthers > 0,
    showRelease: paused && status.downloaded?.coversUnsavedRecovery === true,
    showReload: status.conflict !== null,
  };
}

function problemTitle(status: StorageStatus): string | null {
  if (status.storageUnreadable) return "Changes aren't being saved";
  if (status.conflict) return 'Another tab changed your characters';
  if (changesNotSaved(status)) return "Changes aren't being saved";
  if (newEntries(status).some((e) => e.kind === 'all-characters')) return "Your saved characters couldn't be read";
  const setAside = newSetAside(status).length;
  if (setAside > 0) return `${setAside === 1 ? '1 character' : `${setAside} characters`} couldn't be opened`;
  // Entries that aren't characters are only kept in the list while no backup holds them.
  if (newEntries(status).length > 0 || status.setAside.some((e) => !isCharacterLike(e.value))) return "Some saved data couldn't be read";
  return null;
}

/** Entries in backups made on this visit: problems found now, not left from earlier visits. */
function newEntries(status: StorageStatus) {
  return status.backups.filter((b) => b.createdThisSession).flatMap((b) => b.record?.entries ?? []);
}

/** Set-aside characters first reported on this visit (no backup yet, or one made now). */
function newSetAside(status: StorageStatus) {
  return status.setAside.filter((e) => isCharacterLike(e.value) &&
    (e.backupKey === null || status.backups.some((b) => b.key === e.backupKey && b.createdThisSession)));
}

/** Changes whenever the problem does, so a dismissed problem that changes shows again. */
function problemSignature(status: StorageStatus): string {
  return JSON.stringify([
    status.storageUnreadable,
    status.conflict?.since ?? null,
    status.unsavedRecovery.length,
    status.saveError?.since ?? null,
    status.backups.filter((b) => b.createdThisSession).map((b) => b.key),
    status.setAside.map((e) => e.index),
  ]);
}

function isCharacterLike(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function characterName(value: unknown): string {
  const name = isCharacterLike(value) && typeof value.name === 'string' ? value.name.trim() : '';
  if (!name) return 'Unnamed';
  return name.length > 40 ? `${name.slice(0, 39)}…` : name;
}

/** "Aldric", "Aldric and Brannoc", "Aldric, Brannoc, Cwen and 9 more". */
function joinNames(names: string[]): string {
  const shown = names.length > 4 ? names.slice(0, 3) : names;
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0];
}

/** "7:30 PM" today, "18 Nov, 7:30 PM" on another day (with the year if it differs). */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'an earlier visit';
  const today = new Date();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === today.toDateString()) return time;
  const day = date.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
  return `${day}, ${time}`;
}

/** One sentence about backups left from earlier visits. */
function describeEarlier(status: StorageStatus, earlier: StoredBackup[]): string {
  const readable = earlier.filter((b) => b.record);
  const damaged = earlier.length - readable.length;
  const latest = readable.map((b) => b.record?.savedAt ?? '').sort().pop();
  const parts: string[] = [];
  if (!latest) {
    parts.push(earlier.length === 1
      ? "A backup of saved data Dolmen Spot couldn't read is in this browser, but it's damaged. Download Backup still includes it as it is."
      : `${earlier.length} backups of saved data Dolmen Spot couldn't read are in this browser, but they're damaged. Download Backup still includes them as they are.`);
  } else {
    parts.push(earlier.length === 1
      ? `Backup from ${formatWhen(latest)} of saved data Dolmen Spot couldn't read.`
      : `${earlier.length} backups of saved data Dolmen Spot couldn't read, the latest from ${formatWhen(latest)}.`);
    if (damaged > 0) {
      parts.push(`${damaged === 1 ? "One is damaged, but it's" : `${damaged} are damaged, but they're`} still in the download as they are.`);
    }
  }
  const keys = new Set(earlier.map((b) => b.key));
  const still = status.setAside.filter((e) => isCharacterLike(e.value) && e.backupKey !== null && keys.has(e.backupKey));
  if (still.length > 0) {
    parts.push(`Still can't be opened: ${joinNames(still.map((e) => characterName(e.value)))}. ${still.length === 1 ? "It's" : "They're"} kept in your list and tried again each visit.`);
  }
  return parts.join(' ');
}

function downloadBackup() {
  downloadFile(`dolmen-spot-backup-${localFileStamp()}.json`, getCharacterStore().recoveryDownload());
}

/** Focus an element once React has drawn it. */
function focusSoon(find: () => HTMLElement | null | undefined) {
  requestAnimationFrame(() => find()?.focus({ preventScroll: true }));
}

/** The page's main heading (visually hidden), focusable so focus has somewhere to go. */
function pageHeading(): HTMLElement | null {
  const heading = document.querySelector<HTMLElement>('main h1');
  if (heading && !heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  return heading;
}

interface BannerProps {
  characterCount: number;
  onExportCharacter(): void;
  onExportAll(): void;
}

export default function StorageBanner({ characterCount, onExportCharacter, onExportAll }: BannerProps) {
  const status = useStorageStatus();
  const dismissed = useDismissedProblem();
  const problem = describeProblem(status, characterCount);
  const signature = problemSignature(status);
  const showProblem = problem !== null && dismissed !== signature;
  // Backups from earlier visits, plus this visit's once its notice is dismissed,
  // so Download Backup stays one click away until this line is dismissed too.
  const earlier = status.backups.filter((b) => !b.dismissed && (!b.createdThisSession || !showProblem));
  if (!showProblem && earlier.length === 0) return null;

  const downloadedKeys = status.downloaded?.backupKeys ?? [];
  const deletableNow = status.backups.filter((b) => b.createdThisSession && !earlier.includes(b) && downloadedKeys.includes(b.key)).map((b) => b.key);
  const deletableEarlier = earlier.filter((b) => downloadedKeys.includes(b.key)).map((b) => b.key);

  const deleteBackups = (keys: string[], downloadButtonId: string) => {
    if (!confirm(DELETE_CONFIRM)) return;
    getCharacterStore().deleteBackups(keys);
    focusSoon(() => document.getElementById(downloadButtonId) ?? pageHeading());
  };

  const startSavingAgain = () => {
    if (!confirm(RELEASE_CONFIRM)) return;
    getCharacterStore().releaseUnsavedRecovery();
    focusSoon(pageHeading);
  };

  const dismissProblem = () => {
    setDismissedProblem(signature);
    focusSoon(() => document.getElementById('storage-reminder-details') ?? document.getElementById('storage-backups-download') ?? pageHeading());
  };

  const dismissEarlier = () => {
    getCharacterStore().dismissBackups(earlier.map((b) => b.key));
    focusSoon(() => document.getElementById('storage-banner-title') ?? pageHeading());
  };

  return (
    <div className="max-w-6xl mx-auto w-full px-3 pt-3 space-y-2">
      {showProblem && problem && (
        <section
          key="problem"
          id="storage-banner"
          aria-labelledby="storage-banner-title"
          className={`rounded-lg border px-3 py-2.5 ${problem.urgent ? 'border-[#8b2500]/60 bg-[#8b2500]/15' : 'border-[#c4a35a]/30 bg-[#c4a35a]/10'}`}
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <h2
                id="storage-banner-title"
                tabIndex={-1}
                className={`text-sm font-semibold rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a35a] ${problem.urgent ? 'text-[#ff8a70]' : 'text-[#c4a35a]'}`}
              >
                {problem.title}
              </h2>
              <div className="mt-1 space-y-1 text-xs text-[#f5e6c8]/85 break-words">
                {problem.lines.map((line, i) => (
                  <p key={line} className={i === 0 ? 'font-semibold text-[#f5e6c8]' : undefined}>{line}</p>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {problem.showDownload && (
                  <button type="button" id="storage-banner-download" onClick={downloadBackup} className={PRIMARY}>
                    Download Backup
                  </button>
                )}
                {problem.urgent && (
                  <button type="button" onClick={characterCount > 1 ? onExportAll : onExportCharacter} className={PRIMARY}>
                    {characterCount > 1 ? 'Export All Characters' : 'Export Character'}
                  </button>
                )}
                {problem.showReload && (
                  <button type="button" onClick={() => window.location.reload()} className={SECONDARY}>
                    Reload
                  </button>
                )}
                {problem.showRelease && (
                  <button type="button" onClick={startSavingAgain} className={SECONDARY}>
                    Start Saving Again
                  </button>
                )}
                {deletableNow.length > 0 && (
                  <button type="button" onClick={() => deleteBackups(deletableNow, 'storage-banner-download')} className={SECONDARY}>
                    Delete Backup
                  </button>
                )}
              </div>
            </div>
            <button type="button" onClick={dismissProblem} aria-label="Dismiss" className={DISMISS}>
              &times;
            </button>
          </div>
        </section>
      )}
      {earlier.length > 0 && (
        <section
          key="earlier"
          id="storage-backups"
          aria-label="Backups of unreadable data"
          className="rounded-lg border border-[#5a3a28] bg-[#2a2a3e]/60 px-3 py-1.5"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="flex-1 min-w-[12rem] text-xs text-[#f5e6c8]/75">{describeEarlier(status, earlier)}</p>
            <div className="flex items-center gap-2">
              <button type="button" id="storage-backups-download" onClick={downloadBackup} className={SMALL_SECONDARY}>
                Download Backup
              </button>
              {deletableEarlier.length > 0 && (
                <button type="button" onClick={() => deleteBackups(deletableEarlier, 'storage-backups-download')} className={SMALL_SECONDARY}>
                  Delete Backup
                </button>
              )}
              <button type="button" onClick={dismissEarlier} aria-label="Dismiss" className={DISMISS}>
                &times;
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/** One line in the sticky header while changes aren't being saved. */
export function StorageReminder() {
  const status = useStorageStatus();
  if (!changesNotSaved(status)) return null;

  const showDetails = () => {
    setDismissedProblem(null);
    window.scrollTo({ top: 0 });
    focusSoon(() => document.getElementById('storage-banner-title'));
  };

  return (
    <div key="reminder" id="storage-reminder" className="border-t border-[#8b2500]/40 bg-[#8b2500]/20">
      <div className="max-w-6xl mx-auto px-3 flex items-center gap-1 text-xs text-[#ff8a70]">
        <span>Changes aren&apos;t being saved</span>
        <span aria-hidden="true">&middot;</span>
        <button
          type="button"
          id="storage-reminder-details"
          onClick={showDetails}
          className="inline-flex items-center min-h-6 px-1 rounded underline hover:text-[#f5e6c8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a35a]"
        >
          Details
        </button>
      </div>
    </div>
  );
}

/** A hidden live region whose text changes only when the storage problem does. */
export function StorageAnnouncer() {
  const title = problemTitle(useStorageStatus());
  return (
    <div role="status" className="sr-only">
      {title ? `${title}.` : ''}
    </div>
  );
}
