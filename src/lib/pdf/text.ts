/**
 * The PDF uses the built-in Helvetica/Times fonts, which only cover the
 * Windows-1252 (WinAnsi) character set. pdfkit writes any other character as
 * a garbage code that can corrupt the surrounding text, so every string goes
 * through `pdfText()` first: accented letters lose their accents where
 * WinAnsi lacks them, common symbols get ASCII stand-ins, and anything else
 * (non-Latin scripts, emoji) becomes "?".
 *
 * Code points are written as numbers so no invisible characters end up in
 * this source file.
 */

// Windows-1252 characters outside Latin-1 (its 0x80-0x9F block).
const WIN_ANSI_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

function isWinAnsi(cp: number): boolean {
  return (
    cp === 0x0a || // newline: Text renders it as a line break
    (cp >= 0x20 && cp <= 0x7e) ||
    (cp >= 0xa0 && cp <= 0xff) ||
    WIN_ANSI_EXTRAS.has(cp)
  );
}

const EM_DASH = String.fromCharCode(0x2014);

// Look-alikes for characters that have no WinAnsi glyph and don't decompose,
// keyed by code point.
const SUBSTITUTES = new Map<number, string>([
  [0x09, ' '], // tab
  // hyphens, minus sign, horizontal bar
  [0x2010, '-'], [0x2011, '-'], [0x2012, '-'], [0x2212, '-'], [0x2015, EM_DASH],
  // fraction slash, division slash
  [0x2044, '/'], [0x2215, '/'],
  // prime, double prime
  [0x2032, "'"], [0x2033, '"'],
  // arrows and comparison signs
  [0x2190, '<-'], [0x2192, '->'], [0x2194, '<->'], [0x21d2, '=>'],
  [0x2264, '<='], [0x2265, '>='], [0x2260, '!='], [0x2248, '~'],
  // check marks, crosses, stars
  [0x2713, 'v'], [0x2714, 'v'], [0x2717, 'x'], [0x2718, 'x'], [0x2605, '*'], [0x2606, '*'],
  // Latin letters with no decomposition: L/l, D/d and H/h with stroke,
  // dotless i, kra, T/t with stroke, eng, capital sharp s
  [0x0141, 'L'], [0x0142, 'l'], [0x0110, 'D'], [0x0111, 'd'], [0x0126, 'H'], [0x0127, 'h'],
  [0x0131, 'i'], [0x0138, 'k'], [0x0166, 'T'], [0x0167, 't'], [0x014a, 'N'], [0x014b, 'n'],
  [0x1e9e, 'SS'],
  // typographic spaces
  ...[0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x202f, 0x205f, 0x3000]
    .map((cp): [number, string] => [cp, ' ']),
]);

// Invisible characters that would otherwise turn into "?".
function isIgnorable(cp: number): boolean {
  return (
    cp < 0x20 || // other control characters
    (cp >= 0x7f && cp <= 0x9f) ||
    cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0x2060 || cp === 0xfeff ||
    (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors
    (cp >= 0x1f3fb && cp <= 0x1f3ff) || // emoji skin tones
    (cp >= 0xe0020 && cp <= 0xe007f) // emoji tag sequences
  );
}

function convertChar(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  if (isWinAnsi(cp)) return ch;
  const substitute = SUBSTITUTES.get(cp);
  if (substitute !== undefined) return substitute;
  if (isIgnorable(cp)) return '';

  // Compatibility decomposition without accents, e.g. o-double-acute -> "o",
  // the "fi" ligature -> "fi", one-third -> "1/3".
  const decomposed = ch.normalize('NFKD').replace(/\p{M}/gu, '');
  if (decomposed && decomposed !== ch) {
    let out = '';
    for (const part of decomposed) {
      const partCp = part.codePointAt(0) ?? 0;
      const partSubstitute = SUBSTITUTES.get(partCp);
      if (isWinAnsi(partCp)) out += part;
      else if (partSubstitute !== undefined) out += partSubstitute;
      else return '?';
    }
    return out;
  }
  return '?';
}

/** Makes any value safe to print with the PDF's built-in fonts. */
export function pdfText(value: unknown): string {
  if (value === null || value === undefined) return '';
  const normalized = String(value).replace(/\r\n?/g, '\n').normalize('NFC');
  let out = '';
  for (const ch of normalized) out += convertChar(ch);
  return out;
}
