'use client';

import { useRef, useState } from 'react';
import type { Character } from '@/lib/types';
import { PDF_LOAD_ERROR, pdfLoadError } from '@/lib/pdf/errors';
import type { ExportPhase } from '@/lib/pdf/download';

type ExportState =
  | { status: 'idle' }
  | { status: 'busy'; phase: ExportPhase | 'tools'; slow: boolean }
  | { status: 'error'; message: string };

// A click this soon after a PDF was saved belongs to the same action: the
// second half of a double-click, or a tap the browser queued while the page
// was busy rendering and delivered late.
const REPEAT_CLICK_MS = 1000;

// The PDF code is one download of about 0.5 MB that can't report its
// progress (the fonts' downloads can, see fonts.ts), so a stalled one is only
// given up on after this long, enough for a very slow connection.
const TOOLS_TIMEOUT_MS = 180_000;

// An export still running after this long says what it's waiting for. Only
// the first PDF downloads anything, and on a slow connection that can take a
// minute.
const SLOW_MS = 5000;

const SLOW_NOTES: Record<ExportPhase | 'tools', string> = {
  tools: 'Downloading the PDF tools (first time only)…',
  fonts: 'Downloading fonts (first time only)…',
  layout: 'Laying out the sheet…',
};

/** Loads the PDF code, or fails with a PDF load error if it takes over TOOLS_TIMEOUT_MS. */
function loadPdfTools() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(pdfLoadError('The PDF code took too long to download.')), TOOLS_TIMEOUT_MS);
  });
  return Promise.race([import('@/lib/pdf/download'), timeout]).finally(() => clearTimeout(timer));
}

/** The PDF code or its fonts couldn't be downloaded: offline, stalled, or replaced by a newer deployment. */
function isLoadError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'ChunkLoadError' ||
    err.name === PDF_LOAD_ERROR ||
    /loading (css )?chunk|dynamically imported module|importing a module script failed|failed to fetch/i.test(err.message)
  );
}

// Let the browser paint the busy state before PDF layout ties up the main thread.
function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/**
 * Header control that downloads the active character as a PDF. The PDF code
 * (@react-pdf/renderer and the sheet layout) and its fonts are fetched on the
 * first click.
 */
export default function ExportPdfButton({ character }: { character: Character }) {
  const [state, setState] = useState<ExportState>({ status: 'idle' });
  const inFlight = useRef(false);
  const lastSuccessAt = useRef(-Infinity);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const busy = state.status === 'busy';
  const slowNote = state.status === 'busy' && state.slow ? SLOW_NOTES[state.phase] : null;

  const updateBusy = (change: { phase?: ExportPhase; slow?: boolean }) =>
    setState((current) => (current.status === 'busy' ? { ...current, ...change } : current));

  const handleExport = async () => {
    // While busy the button is only aria-disabled (so it keeps keyboard focus); ignore clicks here.
    if (inFlight.current || performance.now() - lastSuccessAt.current < REPEAT_CLICK_MS) return;
    inFlight.current = true;
    setState({ status: 'busy', phase: 'tools', slow: false });
    const slowTimer = setTimeout(() => updateBusy({ slow: true }), SLOW_MS);
    try {
      await nextPaint();
      const { downloadCharacterPdf } = await loadPdfTools();
      await downloadCharacterPdf(character, (phase) => updateBusy({ phase }));
      lastSuccessAt.current = performance.now();
      setState({ status: 'idle' });
    } catch (err) {
      console.error('PDF export failed', err);
      setState({
        status: 'error',
        message: isLoadError(err)
          ? "Couldn't load the PDF tools. Check your connection or reload the page, then try again."
          : "Couldn't create the PDF. Please try again.",
      });
    } finally {
      clearTimeout(slowTimer);
      inFlight.current = false;
    }
  };

  const dismissError = () => {
    setState({ status: 'idle' });
    buttonRef.current?.focus();
  };

  return (
    <div className="relative">
      {/* The name stays "Download PDF" while busy; the status below says
          "Preparing PDF…", so screen readers hear it once. */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleExport}
        aria-disabled={busy || undefined}
        aria-label="Download PDF"
        title="Download a printable PDF of this character"
        className="text-xs px-2 py-1 bg-[#5a3a28] hover:bg-[#4a2f20] aria-disabled:cursor-wait aria-disabled:hover:bg-[#5a3a28] text-[#f5e6c8] rounded transition-colors flex items-center gap-1"
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
        {/* Both labels share one grid cell, so the button keeps the wider one's width. */}
        <span className="hidden sm:grid" aria-hidden="true">
          <span className={`col-start-1 row-start-1 ${busy ? 'invisible' : ''}`}>Download PDF</span>
          <span className={`col-start-1 row-start-1 ${busy ? '' : 'invisible'}`}>Preparing PDF…</span>
        </span>
      </button>
      {/* One live region for the whole export: "Preparing PDF…" for screen
          readers at once, then, if it's slow, a visible note of what it's
          waiting for. The note can stay up for minutes, so it sits at the foot
          of the screen (the bottom right from sm up), clear of the tabs. */}
      <div
        role="status"
        className={
          slowNote
            ? 'fixed inset-x-3 bottom-3 sm:left-auto sm:right-4 sm:bottom-4 sm:w-72 z-50 pointer-events-none bg-[#2a2a3e] border border-[#5a3a28] text-[#f5e6c8] text-xs rounded p-2 shadow-lg'
            : 'sr-only'
        }
      >
        {slowNote ?? (busy ? 'Preparing PDF…' : '')}
      </div>
      {state.status === 'error' && (
        <div
          role="alert"
          className="absolute right-0 top-full mt-2 z-50 w-64 max-w-[calc(100vw-1.5rem)] bg-[#2a2a3e] border border-[#8b2500] text-[#f5e6c8] text-xs rounded p-2 shadow-lg flex items-start gap-2"
        >
          <span className="flex-1">{state.message}</span>
          <button
            type="button"
            onClick={dismissError}
            className="-m-1 w-6 h-6 shrink-0 flex items-center justify-center rounded text-sm leading-none text-[#f5e6c8]/60 hover:text-[#f5e6c8]"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
