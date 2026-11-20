'use client';

import { useState, useSyncExternalStore } from 'react';
import {
  getCharacterStore,
  isSavingPaused,
  NO_STORAGE_PROBLEMS,
  type RecoveryEntry,
} from '@/lib/storage';

const subscribe = (onChange: () => void) => getCharacterStore().subscribe(onChange);
const getSnapshot = () => getCharacterStore().getStatus();
const getServerSnapshot = () => NO_STORAGE_PROBLEMS;

const BUTTON = 'px-3 py-1.5 text-xs font-semibold rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a35a]';

/**
 * Warns the player when saved data couldn't be read (it has been backed up)
 * or when changes aren't being saved, and offers a download of the backed-up
 * data. Renders nothing in normal operation.
 */
export default function StorageBanner({ onExportCharacter }: { onExportCharacter(): void }) {
  const status = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [dismissed, setDismissed] = useState<string | null>(null);
  // Backups the player has downloaded; only these may be deleted.
  const [downloadedKeys, setDownloadedKeys] = useState<string[]>([]);

  const entries = [...status.backups.flatMap(b => b.record?.entries ?? []), ...status.unsavedRecovery];
  const hasRecoveryData = status.backups.length > 0 || status.unsavedRecovery.length > 0;
  const paused = isSavingPaused(status);
  const notSaving = paused || status.saveError !== null;
  if (!hasRecoveryData && !notSaving) return null;

  // Dismissing hides the banner until something about it changes.
  const signature = JSON.stringify([
    status.backups.map(b => b.key), status.unsavedRecovery.length, status.storageUnreadable, status.saveError?.since,
  ]);
  if (dismissed === signature) {
    if (!notSaving) return null;
    // While changes aren't being saved, keep a one-line reminder.
    return (
      <div role="status" className="border-t border-[#8b2500]/40 bg-[#8b2500]/20">
        <div className="max-w-6xl mx-auto px-3 py-1 flex items-center gap-2 text-xs text-[#ff6b4a]">
          <span>Changes aren&apos;t being saved.</span>
          <button type="button" onClick={() => setDismissed(null)} className="underline hover:text-[#f5e6c8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a35a] rounded">
            Details
          </button>
        </div>
      </div>
    );
  }

  const messages: string[] = [];
  if (status.storageUnreadable) {
    messages.push('Your browser isn’t letting Dolmen Spot use its storage, so nothing will be saved this visit.');
  }
  if (entries.length > 0) {
    messages.push(describeUnreadable(entries) + (status.unsavedRecovery.length > 0
      ? ' There isn’t enough browser storage to back it up, so saving is paused to keep it safe.'
      : ' A backup copy is kept in this browser, so nothing is lost.'));
  }
  if (status.saveError && !paused) {
    messages.push(`Your browser refused to save changes made since ${formatTime(status.saveError.since)} (its storage may be full). They’re only in this tab for now.`);
  }
  if (notSaving) messages.push('Export your character before closing this tab.');
  if (hasRecoveryData) messages.push('Download a copy of the unreadable data to keep it safe, or to attach to a bug report.');

  const download = () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    downloadText(`dolmen-spot-recovery-${stamp}.json`, getCharacterStore().recoveryDownload());
    setDownloadedKeys(status.backups.map(b => b.key));
  };

  const deletable = status.backups.filter(b => downloadedKeys.includes(b.key)).map(b => b.key);
  const deleteBackups = () => {
    if (!confirm('Delete the backup copy from this browser? Keep the file you downloaded.')) return;
    getCharacterStore().deleteBackups(deletable);
  };

  return (
    <div
      role={notSaving ? 'alert' : 'status'}
      className={`border-t ${notSaving ? 'border-[#8b2500]/40 bg-[#8b2500]/20' : 'border-[#c4a35a]/30 bg-[#c4a35a]/10'}`}
    >
      <div className="max-w-6xl mx-auto px-3 py-2 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${notSaving ? 'text-[#ff6b4a]' : 'text-[#c4a35a]'}`}>
            {notSaving ? 'Changes aren’t being saved' : 'Some saved data couldn’t be read'}
          </p>
          <p className="text-xs text-[#f5e6c8]/80 mt-0.5 break-words">{messages.join(' ')}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {hasRecoveryData && (
              <button type="button" onClick={download} className={`${BUTTON} bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8]`}>
                Download copy
              </button>
            )}
            {notSaving && (
              <button type="button" onClick={onExportCharacter} className={`${BUTTON} bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8]`}>
                Export character
              </button>
            )}
            {deletable.length > 0 && (
              <button type="button" onClick={deleteBackups} className={`${BUTTON} border border-[#5a3a28] text-[#f5e6c8]/70 hover:text-[#ff6b4a] hover:border-[#8b2500]`}>
                Delete backup from browser
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(signature)}
          aria-label="Dismiss"
          className="shrink-0 w-8 h-8 -mr-1 rounded text-lg leading-none text-[#f5e6c8]/60 hover:text-[#f5e6c8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a35a]"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

/** "Your saved characters couldn't be read…" / "2 saved characters couldn't be loaded (Aldric, Brannoc)." */
function describeUnreadable(entries: RecoveryEntry[]): string {
  const parts: string[] = [];
  if (entries.some(e => e.kind === 'all-characters')) {
    parts.push('Your saved characters couldn’t be read, so a fresh sheet was started.');
  }
  const names = entries.flatMap(e => (e.kind === 'character' ? [characterName(e.value)] : []));
  if (names.length > 0) {
    const count = names.length === 1 ? '1 saved character' : `${names.length} saved characters`;
    parts.push(`${count} couldn’t be loaded (${names.join(', ')}).`);
  }
  return parts.join(' ');
}

function characterName(value: unknown): string {
  const name = value && typeof value === 'object' && 'name' in value ? (value as { name: unknown }).name : null;
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : 'unnamed';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function downloadText(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
