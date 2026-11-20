/**
 * Makes text printable with the fonts the PDF embeds (see fonts.ts).
 *
 * The sheet is drawn with Noto fonts that cover Latin, Greek and Cyrillic and
 * the symbols players write in notes (check boxes and marks, stars, card
 * suits...), plus Noto Sans CJK when the sheet has Korean, Japanese or
 * Chinese text. A character none of them has must not reach react-pdf: it
 * would fall back to the PDF's built-in Helvetica, which writes a garbage code
 * for anything outside Windows-1252. So every string the sheet prints goes
 * through a sanitizer made by `createPdfText()` for the fonts in use, which:
 *
 * - turns every kind of line break into "\n" and tabs into spaces;
 * - drops invisible formatting characters (zero-width joiners, byte-order
 *   marks, direction marks, variation selectors);
 * - prints every character the fonts have, symbols included (a symbol
 *   written in emoji style, "❤️", prints as the plain "❤");
 * - drops emoji the fonts lack (🐸, 🔥, flags, skin tones), leaving one space
 *   where one separated two words ("Fire🔥Ice" -> "Fire Ice");
 * - keeps accents the fonts can place on the letter before them, and drops
 *   accents with no letter to sit on or that the fonts lack;
 * - replaces any other character the fonts lack with a look-alike (✅ -> ✔,
 *   "≤" -> "<="), its plain form (fullwidth "Ａ" -> "A", "①" -> "1"), or
 *   "?" (scripts the fonts don't cover, such as Arabic), so that nothing
 *   but emoji ever disappears.
 *
 * Code points are written as numbers so no invisible characters end up in
 * this source file.
 */

/** True when one of the sheet's fonts can draw the code point. */
export type HasGlyph = (codePoint: number) => boolean;

const EM_DASH = String.fromCharCode(0x2014);

// Look-alikes for characters the fonts lack, keyed by code point. Only used
// when the fonts can't draw the character itself.
const SUBSTITUTES = new Map<number, string>([
  // hyphens, minus sign, horizontal bar
  [0x2010, '-'], [0x2011, '-'], [0x2012, '-'], [0x2212, '-'], [0x2015, EM_DASH],
  // fraction slash, division slash
  [0x2044, '/'], [0x2215, '/'],
  // prime, double prime
  [0x2032, "'"], [0x2033, '"'],
  // double arrow and comparison signs
  [0x21d2, '=>'], [0x2264, '<='], [0x2265, '>='], [0x2260, '!='], [0x2248, '~'],
  // emoji with a plain symbol of the same meaning: check mark, cross mark,
  // crossed box, star
  [0x2705, String.fromCodePoint(0x2714)], [0x274c, String.fromCodePoint(0x2716)],
  [0x274e, String.fromCodePoint(0x2612)], [0x2b50, String.fromCodePoint(0x2605)],
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

// Shown as emoji by default, or part of a flag or a skin tone.
const EMOJI = /^(?:\p{Emoji_Presentation}|\p{Regional_Indicator}|\p{Emoji_Modifier})$/u;
// Symbols and pictographs that can be emoji (☀, ❤...), and are when written
// with the emoji variation selector or joined into an emoji sequence.
const PICTOGRAPHIC = /^\p{Extended_Pictographic}$/u;
const EMOJI_STYLE = String.fromCodePoint(0xfe0f);
const ZERO_WIDTH_JOINER = String.fromCodePoint(0x200d);

const MARK = /^\p{M}$/u;
const BASE = /^[\p{L}\p{N}]$/u;
// Scripts written without spaces between words.
const UNSPACED = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u;
const CLOSING = /^[\p{Pe}\p{Pf}.,:;!?%]$/u;

function isEmoji(chars: string[], i: number): boolean {
  const ch = chars[i];
  if (EMOJI.test(ch)) return true;
  return (
    PICTOGRAPHIC.test(ch) &&
    (chars[i + 1] === EMOJI_STYLE || chars[i + 1] === ZERO_WIDTH_JOINER || chars[i - 1] === ZERO_WIDTH_JOINER)
  );
}

function firstChar(text: string): string {
  return String.fromCodePoint(text.codePointAt(0) ?? 0);
}

function lastChar(text: string): string {
  const chars = Array.from(text);
  return chars[chars.length - 1] ?? '';
}

/**
 * Returns a function that makes any value safe to print with fonts covering
 * the code points `hasGlyph` accepts. Applying it twice changes nothing.
 */
export function createPdfText(hasGlyph: HasGlyph): (value: unknown) => string {
  return (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const chars = Array.from(String(value).replace(LINE_BREAKS, '\n').normalize('NFC'));

    let out = '';
    // Whether the last character kept can carry an accent.
    let canTakeMark = false;
    // Set where emoji were dropped, until the next character is kept;
    // `gapHadSpace` says whether there were spaces around them.
    let inGap = false;
    let gapHadSpace = false;

    const append = (part: string, base: boolean) => {
      if (inGap && part !== '\n' && out !== '' && !out.endsWith('\n')) {
        // One space where the emoji were, if they had space around them or
        // stood between two words ("Fire🔥Ice"), but never before closing
        // punctuation ("Frog 🐸, hi" -> "Frog, hi").
        const before = lastChar(out);
        const after = firstChar(part);
        const betweenWords = BASE.test(before) && BASE.test(after) && !UNSPACED.test(before) && !UNSPACED.test(after);
        if ((gapHadSpace || betweenWords) && !CLOSING.test(after)) out += ' ';
      }
      inGap = false;
      out += part;
      canTakeMark = base;
    };

    chars.forEach((ch, i) => {
      const cp = ch.codePointAt(0) ?? 0;

      if (ch === '\n') {
        // react-pdf breaks the line here; the fonts have an empty glyph for it.
        append(ch, false);
        return;
      }
      if (cp === 0x09 || ch === ' ') {
        // Spaces next to dropped emoji are folded into the one space (if any) put in their place.
        if (inGap) gapHadSpace = true;
        else append(' ', false);
        return;
      }
      if (isInvisible(cp)) return;

      if (MARK.test(ch)) {
        // Accents stay only on a letter or digit, and only if the fonts can draw them.
        if (canTakeMark && hasGlyph(cp)) append(ch, true);
        return;
      }
      if (hasGlyph(cp)) {
        append(ch, BASE.test(ch));
        return;
      }

      const substitute = SUBSTITUTES.get(cp);
      if (substitute !== undefined) {
        append(substitute, false);
        return;
      }
      if (isEmoji(chars, i)) {
        if (!inGap) gapHadSpace = false;
        if (out.endsWith(' ')) {
          out = out.replace(/ +$/, '');
          gapHadSpace = true;
        }
        inGap = true;
        canTakeMark = false;
        return;
      }

      // Compatibility decomposition: fullwidth and circled forms, ligatures,
      // precomposed letters whose accent the fonts can't place, and so on.
      const plain = plainForm(ch, hasGlyph);
      if (plain !== null) append(plain, BASE.test(lastChar(plain)));
      else append('?', false);
    });

    // Dropping an invisible character can bring an accent next to its letter
    // ("a", a joiner, U+0301), so compose the result again, as the input was;
    // a second pass then changes nothing. A composed character the fonts lack
    // (U+226E, which is "<" with U+0338) goes back to its parts, which print.
    const composed = out.normalize('NFC');
    if (composed === out) return out;
    return Array.from(composed, (ch) => (hasGlyph(ch.codePointAt(0) ?? 0) ? ch : ch.normalize('NFD'))).join('');
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
