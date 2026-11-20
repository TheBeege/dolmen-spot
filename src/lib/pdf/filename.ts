const SUFFIX = '-dolmen-spot.pdf';
// Most file systems allow 255 bytes per file name; count the suffix too.
const MAX_FILE_NAME_BYTES = 255;

const encoder = new TextEncoder();

/**
 * "Sir Gawain the Green" -> "sir-gawain-the-green-dolmen-spot.pdf".
 * Keeps letters and digits from any script together with their accents and
 * vowel signs ("राम सिंह" -> "राम-सिंह"), and collapses everything else
 * (spaces, punctuation, path separators, emoji) into single hyphens.
 */
export function pdfFileName(characterName: string | undefined): string {
  const slug = (characterName ?? '')
    .normalize('NFKC')
    .toLowerCase()
    // Variation selectors and keycap marks only restyle the character before them.
    .replace(/[\ufe00-\ufe0f\u20e3\u{e0100}-\u{e01ef}]/gu, '')
    // Marks with no letter or digit to belong to.
    .replace(/(^|[^\p{L}\p{N}\p{M}])\p{M}+/gu, '$1')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  // Trim to the byte limit a whole character (with its marks) at a time.
  let name = '';
  let bytes = encoder.encode(SUFFIX).length;
  for (const unit of slug.match(/\P{M}\p{M}*/gu) ?? []) {
    bytes += encoder.encode(unit).length;
    if (bytes > MAX_FILE_NAME_BYTES) break;
    name += unit;
  }
  name = name.replace(/-+$/, '');
  return `${name || 'character'}${SUFFIX}`;
}
