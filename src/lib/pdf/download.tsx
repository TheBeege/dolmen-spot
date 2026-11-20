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
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = pdfFileName(character.name);
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Give the browser time to start reading the blob before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
