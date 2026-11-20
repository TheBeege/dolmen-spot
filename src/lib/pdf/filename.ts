const MAX_NAME_LENGTH = 60;

/**
 * "Sir Gawain the Green" -> "sir-gawain-the-green-dolmen-spot.pdf".
 * Keeps letters and digits from any script, collapses everything else
 * (spaces, punctuation, path separators, emoji) into single hyphens.
 */
export function pdfFileName(characterName: string | undefined): string {
  const slug = (characterName ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  const trimmed = Array.from(slug).slice(0, MAX_NAME_LENGTH).join('').replace(/-+$/, '');
  return `${trimmed || 'character'}-dolmen-spot.pdf`;
}
