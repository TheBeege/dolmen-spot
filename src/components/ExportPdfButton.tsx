'use client';

import { useEffect, useRef, useState } from 'react';
import type { Character } from '@/lib/types';

type ExportState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'error'; message: string };

const ERROR_DISMISS_MS = 8000;

function isChunkLoadError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'ChunkLoadError' ||
    /loading (css )?chunk|dynamically imported module|importing a module script failed|failed to fetch/i.test(err.message)
  );
}

// Let the browser paint the busy state before PDF layout ties up the main thread.
function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/**
 * Header control that downloads the active character as a PDF. The PDF code
 * (@react-pdf/renderer and the sheet layout) is fetched on the first click.
 */
export default function ExportPdfButton({ character }: { character: Character }) {
  const [state, setState] = useState<ExportState>({ status: 'idle' });
  const inFlight = useRef(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
  }, []);

  const busy = state.status === 'busy';
  const label = busy ? 'Preparing PDF…' : 'Download PDF';

  const handleExport = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setState({ status: 'busy' });
    try {
      await nextPaint();
      const { downloadCharacterPdf } = await import('@/lib/pdf/download');
      await downloadCharacterPdf(character);
      setState({ status: 'idle' });
    } catch (err) {
      console.error('PDF export failed', err);
      setState({
        status: 'error',
        message: isChunkLoadError(err)
          ? "Couldn't load the PDF tools. Check your connection and try again."
          : "Couldn't create the PDF. Please try again.",
      });
      dismissTimer.current = setTimeout(() => setState({ status: 'idle' }), ERROR_DISMISS_MS);
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleExport}
        disabled={busy}
        aria-busy={busy}
        aria-label={label}
        title="Download a printable PDF of this character"
        className="text-xs px-2 py-1 bg-[#5a3a28] hover:bg-[#7a5a38] disabled:hover:bg-[#5a3a28] disabled:cursor-wait text-[#f5e6c8] rounded transition-colors flex items-center gap-1"
      >
        {busy ? (
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
        <span className="hidden sm:inline">{label}</span>
      </button>
      <span className="sr-only" aria-live="polite">
        {busy ? 'Preparing PDF' : ''}
      </span>
      {state.status === 'error' && (
        <div
          role="alert"
          className="absolute right-0 top-full mt-2 z-50 w-64 max-w-[calc(100vw-1.5rem)] bg-[#2a2a3e] border border-[#8b2500] text-[#f5e6c8] text-xs rounded p-2 shadow-lg flex items-start gap-2"
        >
          <span className="flex-1">{state.message}</span>
          <button
            type="button"
            onClick={() => setState({ status: 'idle' })}
            className="text-[#f5e6c8]/60 hover:text-[#f5e6c8] leading-none px-1"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
