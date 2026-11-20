'use client';

import { useState } from 'react';

/**
 * What app/error.tsx and app/global-error.tsx show when the sheet fails to
 * render. It must never throw itself, so it imports nothing from the app,
 * touches storage only when a button is pressed, and catches every failure.
 */

// Every key Dolmen Spot keeps in localStorage starts with this.
const SAVE_KEY_PREFIX = 'dolmenwood-';
const ISSUES_URL = 'https://github.com/TheBeege/dolmen-spot/issues';

const BUTTON =
  'px-3 py-1.5 text-sm font-semibold rounded text-[#f5e6c8] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4a35a]';

function describeError(error: unknown): string {
  try {
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    return String(error);
  } catch {
    return 'Unknown error';
  }
}

/** Everything the app has saved in this browser, exactly as stored, in a file that explains itself. */
function buildSaveDataFile(error: unknown): string {
  const saved: Record<string, string | null> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(SAVE_KEY_PREFIX)) saved[key] = localStorage.getItem(key);
  }
  return JSON.stringify(
    {
      app: 'Dolmen Spot',
      about: `Everything Dolmen Spot had saved in this browser when it hit an error, exactly as stored. Keep this file safe. It also helps if you report the problem at ${ISSUES_URL}`,
      downloadedAt: new Date().toISOString(),
      error: describeError(error),
      localStorage: saved,
    },
    null,
    2,
  );
}

export default function ErrorScreen({ error, onTryAgain }: { error: unknown; onTryAgain: () => void }) {
  // The save data, shown for copying when the browser won't start a download.
  const [copyText, setCopyText] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const downloadSaveData = () => {
    setProblem(null);
    let text: string;
    try {
      text = buildSaveDataFile(error);
    } catch {
      setProblem('This browser won’t let Dolmen Spot read its storage right now, so there’s nothing to download.');
      return;
    }
    try {
      const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `dolmen-spot-save-data-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoking straight away can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setCopyText(text);
    }
  };

  const details = describeError(error);

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8 bg-[#1a1a2e] text-[#f5e6c8]">
      <div className="w-full max-w-lg bg-[#2a2a3e] border border-[#5a3a28] rounded-lg p-5 shadow-lg">
        <p className="text-sm font-bold tracking-wide text-[#c4a35a]">Dolmen Spot</p>
        <div role="alert">
          <h1 className="text-xl font-bold text-[#c4a35a] mt-1">Something went wrong</h1>
          <p className="text-sm leading-relaxed mt-3">
            Dolmen Spot hit an error and couldn&apos;t show this page. Your character data is still saved safely in this browser.
          </p>
        </div>
        <p className="text-sm leading-relaxed mt-2 text-[#f5e6c8]/80">
          Try again, or download a copy of your save data to keep.
        </p>

        <div className="flex flex-wrap gap-2 mt-4">
          <button type="button" onClick={onTryAgain} className={`${BUTTON} bg-[#2d4a2e] hover:bg-[#3d6b3e]`}>
            Try again
          </button>
          <button type="button" onClick={downloadSaveData} className={`${BUTTON} bg-[#5a3a28] hover:bg-[#7a5a38]`}>
            Download save data
          </button>
        </div>

        {problem && <p className="text-xs text-[#ff6b4a] mt-3">{problem}</p>}
        {copyText !== null && (
          <div className="mt-3">
            <p className="text-xs text-[#f5e6c8]/80 mb-1">
              The download didn&apos;t start. Copy this text into a file to keep it:
            </p>
            <textarea
              readOnly
              value={copyText}
              rows={6}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full bg-[#1a1a2e] border border-[#5a3a28] rounded p-2 text-xs font-mono text-[#f5e6c8]"
            />
          </div>
        )}

        <p className="text-xs text-[#f5e6c8]/60 mt-4">
          If this keeps happening, please{' '}
          <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer" className="text-[#c4a35a] underline hover:text-[#dbc07a]">
            report it on GitHub
          </a>
          .
        </p>
        <details className="mt-3 text-xs text-[#f5e6c8]/60">
          <summary className="cursor-pointer hover:text-[#f5e6c8]/80">Technical details</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono">{details}</pre>
        </details>
      </div>
    </main>
  );
}
