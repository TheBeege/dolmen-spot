/**
 * Makes text printable with the fonts the PDF embeds (see fonts.ts).
 *
 * The sheet is drawn with Noto fonts that cover Latin, Greek and Cyrillic,
 * plus Noto Sans CJK when the sheet has Korean, Japanese or Chinese text. A
 * character none of them has must not reach react-pdf: it would fall back to
 * the PDF's built-in Helvetica, which writes a garbage code for anything
 * outside Windows-1252. So every string the sheet prints goes through a
 * sanitizer made by `createPdfText()` for the fonts in use, which:
 *
 * - turns every kind of line break into "\n" and tabs into spaces;
 * - drops invisible formatting characters (zero-width joiners, byte-order
 *   marks, direction marks, variation selectors);
 * - drops emoji (with one space next to them) instead of printing "?";
 * - keeps accents the fonts can place on the letter before them, and drops
 *   accents with no letter to sit on or that the fonts lack;
 * - replaces any other character the fonts lack with a look-alike (arrows,
 *   check marks, comparison signs), its plain form (fullwidth "Ａ" -> "A",
 *   "①" -> "1"), or "?" (scripts the fonts don't cover, such as Arabic).
 *
 * Code points are written as numbers so no invisible characters end up in
 * this source file.
 */

/** True when one of the sheet's fonts can draw the code point. */
export type HasGlyph = (codePoint: number) => boolean;

const EM_DASH = String.fromCharCode(0x2014);

// Look-alikes for common symbols the fonts lack, keyed by code point. Only
// used when the fonts can't draw the character itself.
const SUBSTITUTES = new Map<number, string>([
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
]);

// Line separator, paragraph separator, next line, vertical tab, form feed,
// and Windows/old Mac line endings.
const LINE_BREAKS = /\r\n?|[\u{2028}\u{2029}\x85\v\f]/gu;

// Characters with no visible form, dropped before anything else.
function isInvisible(cp: number): boolean {
  return (
    (cp < 0x20 && cp !== 0x0a) || // control characters other than the newline (tabs are handled first)
    (cp >= 0x7f && cp <= 0x9f) || // DEL and C1 controls
    cp === 0x034f || // combining grapheme joiner
    cp === 0x061c || // Arabic letter mark
    (cp >= 0x180b && cp <= 0x180f) || // Mongolian variation selectors
    (cp >= 0x200b && cp <= 0x200f) || // zero-width space/joiners, direction marks
    (cp >= 0x202a && cp <= 0x202e) || // direction embeddings and overrides
    (cp >= 0x2060 && cp <= 0x206f) || // word joiner, invisible operators, direction isolates
    cp === 0xfeff || // byte-order mark
    (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors (incl. the emoji one)
    (cp >= 0xe0000 && cp <= 0xe007f) || // tags (flag sequences)
    (cp >= 0xe0100 && cp <= 0xe01ef) // variation selectors supplement
  );
}

const EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier})$/u;
const MARK = /^\p{M}$/u;
const BASE = /^[\p{L}\p{N}]$/u;

/**
 * Returns a function that makes any value safe to print with fonts covering
 * the code points `hasGlyph` accepts. Applying it twice changes nothing.
 */
export function createPdfText(hasGlyph: HasGlyph): (value: unknown) => string {
  return (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text = String(value).replace(LINE_BREAKS, '\n').normalize('NFC');

    let out = '';
    // Whether the last character kept can carry an accent.
    let canTakeMark = false;
    // Set after an emoji is dropped, so it takes one adjacent space with it.
    let droppedEmoji = false;

    const append = (part: string, base: boolean) => {
      out += part;
      canTakeMark = base;
      droppedEmoji = false;
    };

    for (const ch of text) {
      const cp = ch.codePointAt(0) ?? 0;

      if (ch === '\n') {
        // react-pdf breaks the line here; the fonts have no glyph for it.
        append(ch, false);
        continue;
      }
      if (cp === 0x09 || ch === ' ') {
        // A space next to a dropped emoji goes with it: "Sir 🐸 Frog" -> "Sir Frog".
        if (droppedEmoji && (out === '' || out.endsWith(' ') || out.endsWith('\n'))) continue;
        append(' ', false);
        continue;
      }
      if (isInvisible(cp)) continue;

      if (MARK.test(ch)) {
        // Accents stay only on a letter or digit, and only if the fonts can draw them.
        if (canTakeMark && hasGlyph(cp)) append(ch, true);
        continue;
      }
      if (hasGlyph(cp)) {
        append(ch, BASE.test(ch));
        continue;
      }

      const substitute = SUBSTITUTES.get(cp);
      if (substitute !== undefined) {
        append(substitute, false);
        continue;
      }
      if (EMOJI.test(ch)) {
        if (out.endsWith(' ')) out = out.slice(0, -1);
        droppedEmoji = true;
        canTakeMark = false;
        continue;
      }

      // Compatibility decomposition: fullwidth and circled forms, ligatures,
      // precomposed letters whose accent the fonts can't place, and so on.
      const plain = plainForm(ch, hasGlyph);
      if (plain !== null) append(plain, BASE.test(plain.slice(-1)));
      else append('?', false);
    }

    // An emoji at the very end leaves no trailing space behind.
    return droppedEmoji ? out.replace(/ +$/, '') : out;
  };
}

/** The character's compatibility decomposition, if the fonts can draw it (accents they can't are left off). */
function plainForm(ch: string, hasGlyph: HasGlyph): string | null {
  const decomposed = ch.normalize('NFKD');
  if (decomposed === ch) return null;
  let out = '';
  for (const part of decomposed) {
    const cp = part.codePointAt(0) ?? 0;
    if (MARK.test(part)) {
      if (out && hasGlyph(cp)) out += part;
    } else if (hasGlyph(cp)) {
      out += part;
    } else {
      return null;
    }
  }
  return out || null;
}
