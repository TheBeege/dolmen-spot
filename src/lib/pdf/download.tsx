/**
 * Entry point for the PDF export. The "Download PDF" button loads this module
 * with a dynamic import() when clicked, so @react-pdf/renderer (and its
 * layout engine) is split into its own chunk and never ships with the page.
 * The fonts are fetched from /fonts/pdf/ at the same point (see fonts.ts).
 * Browser-only: it builds a Blob and clicks a temporary download link.
 */
import { pdf } from '@react-pdf/renderer';
import type { Character } from '@/lib/types';
import { CharacterSheetDocument, sheetText } from './CharacterSheetDocument';
import { pdfFileName } from './filename';
import { loadSheetFonts } from './fonts';
import { browserPageSize } from './page-size';

// The object URL of the last PDF saved. It is released when the next PDF is
// saved or the page is left (pagehide), never on a timer: Safari on iOS asks
// before it downloads and only reads the file once the player confirms,
// however long that takes. Keeping one PDF around costs a few hundred
// kilobytes at most.
let lastUrl: string | null = null;

function releaseLastUrl() {
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = null;
}

function saveBlob(blob: Blob, fileName: string) {
  releaseLastUrl();
  // Adding the same listener again is a no-op.
  window.addEventListener('pagehide', releaseLastUrl);
  const url = URL.createObjectURL(blob);
  lastUrl = url;
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
  }
}

/** Renders the character sheet and saves it as `<name>-dolmen-spot.pdf`. */
export async function downloadCharacterPdf(character: Character): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('PDF export only runs in the browser.');
  }
  const fonts = await loadSheetFonts(sheetText(character));
  const exportedOn = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const blob = await pdf(
    <CharacterSheetDocument
      character={character}
      pageSize={browserPageSize()}
      exportedOn={exportedOn}
      fonts={fonts}
    />,
  ).toBlob();
  saveBlob(blob, pdfFileName(character.name));
}
