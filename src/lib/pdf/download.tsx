/**
 * Entry point for the PDF export. The "Download PDF" button loads this module
 * with a dynamic import() when clicked, so @react-pdf/renderer (and its
 * layout engine) is split into its own chunk and never ships with the page.
 * Browser-only: it builds a Blob and clicks a temporary download link.
 */
import { pdf } from '@react-pdf/renderer';
import type { Character } from '@/lib/types';
import { CharacterSheetDocument } from './CharacterSheetDocument';
import { pdfFileName } from './filename';
import { browserPageSize } from './page-size';

async function renderCharacterPdf(character: Character): Promise<Blob> {
  const exportedOn = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return pdf(
    <CharacterSheetDocument character={character} pageSize={browserPageSize()} exportedOn={exportedOn} />,
  ).toBlob();
}

/** Renders the character sheet and saves it as `<name>-dolmen-spot.pdf`. */
export async function downloadCharacterPdf(character: Character): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('PDF export only runs in the browser.');
  }
  const blob = await renderCharacterPdf(character);
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
