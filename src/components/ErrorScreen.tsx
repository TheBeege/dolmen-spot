'use client';

import { useEffect, useRef, useState } from 'react';
import { currentStore } from '@/lib/current-store';
import { downloadFile, localFileStamp } from '@/lib/download';
import { SAVE_DATA_FORMAT } from '@/lib/save-data-file';

/**
 * What app/error.tsx and app/global-error.tsx show when the sheet fails to
 * render. It must never throw itself, so it imports only dependency-free
 * modules, and every store, storage or download call sits inside try/catch.
 * It reaches this tab's character store through current-store.ts rather than
 * importing the store, so it still loads when the store's modules can't.
 */

// Every key Dolmen Spot keeps in localStorage starts with this.
const SAVE_KEY_PREFIX = 'dolmenwood-';
const ISSUES_URL = 'https://github.com/TheBeege/dolmen-spot/issues';

const BUTTON =
  'px-3 py-1.5 text-sm font-semibold rounded text-[#f5e6c8] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a35a]';

/** What can be said about the saved characters, given the error and this browser's storage. */
type SaveState = 'saved' | 'full' | 'blocked';

const MESSAGES: Record<SaveState, { status: string; next: string }> = {
  saved: {
    status: "Dolmen Spot hit an error and couldn't show this page. Your character data is still saved safely in this browser.",
    next: 'Try again, or download a copy of your save data to keep.',
  },
  full: {
    status: "This browser's storage is full, so Dolmen Spot couldn't save your latest change. Everything saved before it is still in this browser.",
    next: 'Try again to go back to your last saved version, or download a copy of your save data to keep.',
  },
  // The sheet runs without storage (in memory), so blocked storage never stops
  // it opening: an error that reaches this screen has some other cause.
  blocked: {
    status: "Dolmen Spot hit an error and couldn't show this page. The browser is also blocking its storage (site data), so nothing can be saved here.",
    next: "Try again. To save characters in this browser, allow site data for this site in your browser's settings, then reload the page.",
  },
};

/** What to say instead, from what this tab's store reports. */
const STORE_MESSAGES = {
  // This tab holds changes that aren't in storage.
  unsaved: {
    status: "Dolmen Spot hit an error and couldn't show this page. Your latest changes haven't been saved in this browser yet.",
    next: 'Choose Try Again to get back to them, or download them first. Reloading the page would lose them.',
  },
  unsavedBlocked: {
    status: "Dolmen Spot hit an error and couldn't show this page. The browser is blocking its storage (site data), so your changes haven't been saved.",
    next: 'Choose Try Again to get back to them, or download them first. Reloading the page would lose them.',
  },
  // Saved data that couldn't be read is left exactly as it was (no backup of it could be made yet).
  untouched: {
    status: "Dolmen Spot hit an error and couldn't show this page. Nothing in this browser has been changed.",
    next: 'Try again, or download a copy of your save data to keep.',
  },
} satisfies Record<string, { status: string; next: string }>;

/** What this tab's store reports, if the app opened one. */
interface StoreView {
  /** This tab holds changes that aren't in storage. */
  unsaved: boolean;
  /** The store couldn't read storage, so nothing is saved this visit. */
  blocked: boolean;
  /** Saved data the store couldn't read is kept as it was, with saving paused. */
  untouched: boolean;
}

/** Reads the store once. Never throws. */
function readStore(): StoreView {
  try {
    const status = currentStore()?.getStatus();
    return {
      unsaved: status?.hasUnsavedChanges === true,
      blocked: status?.storageUnreadable === true,
      untouched: (status?.unsavedRecovery.length ?? 0) > 0,
    };
  } catch {
    return { unsaved: false, blocked: false, untouched: false };
  }
}

/**
 * This tab's characters, in the format Export All Characters writes (so
 * Import Character takes them back), or null if no store holds any that
 * storage may not have. Never throws.
 */
function unsavedCharacters(): string | null {
  try {
    return currentStore()?.unsavedCharactersJson() ?? null;
  } catch {
    return null;
  }
}

function isQuotaError(error: unknown): boolean {
  try {
    const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
    return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
  } catch {
    return false;
  }
}

function getSaveState(error: unknown): SaveState {
  if (isQuotaError(error)) return 'full';
  if (typeof window === 'undefined') return 'saved'; // not in a browser (never the case for these errors)
  try {
    // Throws when the browser blocks site data.
    window.localStorage.getItem(`${SAVE_KEY_PREFIX}characters`);
    return 'saved';
  } catch {
    return 'blocked';
  }
}

interface ErrorDetails {
  name: string;
  message: string;
  digest?: string;
  stack?: string;
}

function getErrorDetails(error: unknown): ErrorDetails {
  try {
    if (error instanceof Error) {
      const digest = (error as Error & { digest?: unknown }).digest;
      return {
        name: error.name,
        message: error.message,
        ...(typeof digest === 'string' ? { digest } : {}),
        ...(typeof error.stack === 'string' ? { stack: error.stack } : {}),
      };
    }
    return { name: 'Error', message: String(error) };
  } catch {
    return { name: 'Error', message: 'Unknown error' };
  }
}

function formatErrorDetails(details: ErrorDetails): string {
  const head = `${details.name}: ${details.message}`;
  // V8's stack already starts with "Name: message"; don't print it twice.
  const stack = details.stack?.startsWith(head) ? details.stack.slice(head.length).replace(/^\n/, '') : details.stack;
  return [
    head,
    details.digest ? `Digest: ${details.digest}` : '',
    stack ? `\n${stack}` : '',
  ].filter(Boolean).join('\n');
}

/** Everything the app has saved in this browser, exactly as stored, in a file that explains itself. Throws if storage can't be read. */
function buildSaveDataFile(details: ErrorDetails): string {
  const saved: Record<string, string | null> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(SAVE_KEY_PREFIX)) saved[key] = localStorage.getItem(key);
  }
  return JSON.stringify(
    {
      format: SAVE_DATA_FORMAT,
      version: 1,
      app: 'Dolmen Spot',
      about:
        "A copy of everything Dolmen Spot had saved in this browser when it hit an error, exactly as stored. " +
        `It isn't a character file and can't be imported. Keep it safe, or attach it to a bug report at ${ISSUES_URL}`,
      downloadedAt: new Date().toISOString(),
      error: details,
      localStorage: saved,
    },
    null,
    2,
  );
}

const UNREADABLE = "This browser won't let Dolmen Spot read its storage right now, so there's no save data to copy or download.";

export default function ErrorScreen({ error, onTryAgain }: { error: unknown; onTryAgain: () => void }) {
  // Chosen when the screen appears (getSaveState never throws), and switched
  // to 'blocked' if storage later can't be read, so the message stays true.
  const [saveState, setSaveState] = useState<SaveState>(() => getSaveState(error));
  // Read once: nothing changes the store while this screen shows.
  const [store] = useState(readStore);
  const { unsaved } = store;
  const [details] = useState(() => getErrorDetails(error));
  // The save data, shown for copying on request or when a download fails.
  const [copyText, setCopyText] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const copyRef = useRef<HTMLTextAreaElement>(null);
  const reloadRef = useRef<HTMLButtonElement>(null);
  const unsavedRef = useRef<HTMLButtonElement>(null);

  // Move focus to the copy box when it opens, ready to copy.
  useEffect(() => {
    if (copyText === null) return;
    try {
      copyRef.current?.focus();
      copyRef.current?.select();
    } catch {
      // Focus is a convenience; the box is still there to copy from.
    }
  }, [copyText]);

  const readSaveData = (): string | null => {
    setProblem(null);
    try {
      return buildSaveDataFile(details);
    } catch {
      setSaveState('blocked');
      setProblem(unsaved ? `${UNREADABLE} Your unsaved characters can still be downloaded.` : UNREADABLE);
      // The button just pressed goes away with the blocked state; keep focus on
      // what's left to do instead of letting it fall to the page.
      setTimeout(() => {
        try {
          (unsavedRef.current ?? reloadRef.current)?.focus();
        } catch {
          // Focus is a convenience.
        }
      }, 0);
      return null;
    }
  };

  const downloadSaveData = () => {
    const text = readSaveData();
    if (text === null) return;
    try {
      downloadFile(`dolmen-spot-save-data-${localFileStamp()}.json`, text);
    } catch {
      setCopyNote("The download didn't start. Copy this text into a file to keep it:");
      setCopyText(text);
    }
  };

  const downloadUnsavedCharacters = () => {
    setProblem(null);
    const json = unsavedCharacters();
    if (json === null) {
      setProblem("Dolmen Spot couldn't get the unsaved characters. Choose Try Again to get back to them.");
      return;
    }
    try {
      downloadFile(`dolmen-spot-characters-${localFileStamp()}.dolmenwood.json`, json);
    } catch {
      setCopyNote("The download didn't start. Copy this text into a file, and import it later with Import Character:");
      setCopyText(json);
    }
  };

  const showSaveData = () => {
    const text = readSaveData();
    if (text === null) return;
    setCopyNote('Copy this text into a file to keep it:');
    setCopyText(text);
  };

  const reloadPage = () => {
    try {
      window.location.reload();
    } catch {
      // Nothing more to try; the browser's own reload still works.
    }
  };

  const canReadSaves = saveState !== 'blocked';
  const blocked = !canReadSaves || store.blocked;
  let message = MESSAGES[saveState];
  if (unsaved) message = blocked ? STORE_MESSAGES.unsavedBlocked : STORE_MESSAGES.unsaved;
  else if (blocked) message = MESSAGES.blocked;
  else if (store.untouched) message = STORE_MESSAGES.untouched;

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8 bg-[#1a1a2e] text-[#f5e6c8]">
      <div className="w-full max-w-lg bg-[#2a2a3e] border border-[#5a3a28] rounded-lg p-5 shadow-lg">
        <p className="text-sm font-bold tracking-wide text-[#c4a35a]">Dolmen Spot</p>
        <div role="alert">
          <h1 className="text-xl font-bold text-[#c4a35a] mt-1">Something went wrong</h1>
          <p className="text-sm leading-relaxed mt-3">{message.status}</p>
        </div>
        <p className="text-sm leading-relaxed mt-2 text-[#f5e6c8]/80">{message.next}</p>

        <div className="flex flex-wrap gap-2 mt-4">
          {/* Always offered: the sheet runs even with storage blocked, and Try Again gets this tab's characters back from the store. */}
          <button type="button" onClick={onTryAgain} className={`${BUTTON} bg-[#2d4a2e] hover:bg-[#3d6b3e]`}>
            Try Again
          </button>
          {unsaved && (
            <button type="button" ref={unsavedRef} onClick={downloadUnsavedCharacters} className={`${BUTTON} bg-[#5a3a28] hover:bg-[#4a2f20]`}>
              Download Unsaved Characters
            </button>
          )}
          <button type="button" ref={reloadRef} onClick={reloadPage} className={`${BUTTON} bg-[#3a3a5e] hover:bg-[#4a4a6e]`}>
            Reload Page
          </button>
          {canReadSaves && (
            <>
              <button type="button" onClick={downloadSaveData} className={`${BUTTON} bg-[#5a3a28] hover:bg-[#4a2f20]`}>
                Download Save Data
              </button>
              <button type="button" onClick={showSaveData} className={`${BUTTON} border border-[#5a3a28] hover:bg-[#3a3a4e]`}>
                Show Save Data to Copy
              </button>
            </>
          )}
        </div>

        {problem && (
          <p role="alert" className="text-xs text-[#ff6b4a] mt-3">
            {problem}
          </p>
        )}
        {copyText !== null && (
          <div className="mt-3">
            <label htmlFor="save-data-copy" className="block text-xs text-[#f5e6c8]/80 mb-1">
              {copyNote}
            </label>
            <textarea
              id="save-data-copy"
              ref={copyRef}
              readOnly
              value={copyText}
              rows={6}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full bg-[#1a1a2e] border border-[#5a3a28] rounded p-2 text-xs font-mono text-[#f5e6c8]"
            />
          </div>
        )}

        <p className="text-xs text-[#f5e6c8]/70 mt-4">
          If this keeps happening, please{' '}
          <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer" className="text-[#c4a35a] underline hover:text-[#dbc07a]">
            report it on GitHub
          </a>
          .
        </p>
        <details className="mt-3 text-xs text-[#f5e6c8]/70">
          <summary className="cursor-pointer hover:text-[#f5e6c8]/90">Technical details</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono">{formatErrorDetails(details)}</pre>
        </details>
      </div>
    </main>
  );
}
