/**
 * Where the PDF may break a line inside a word.
 *
 * react-pdf breaks lines at spaces, and inside a word only where a
 * hyphenation callback splits it, drawing a hyphen at the break. An empty
 * string between two parts is a break point that adds nothing (react-pdf
 * turns it into zero-width glue). That is how Japanese and Chinese, written
 * without spaces, get to wrap between characters.
 */

type Hyphenate = (word: string) => string[];

/** One character with any accents that follow it. */
const UNITS = /\P{M}\p{M}*|\p{M}+/gu;

const HANGUL = /\p{Script=Hangul}/u;
// Text that may wrap between any two characters: Han, kana, bopomofo, CJK
// punctuation and fullwidth forms.
const ANYWHERE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Bopomofo}\u{3000}-\u{303f}\u{30fb}\u{30fc}\u{ff00}-\u{ffef}]/u;

// Korean is written with spaces between words and wraps at them; a word this
// long (in syllables) may also wrap between syllables.
const LONG_KOREAN_WORD = 12;

// Simplified line-breaking rules for CJK text ("kinsoku"): closing
// punctuation, small kana and the long-vowel mark never start a line, and
// opening brackets never end one.
const NO_LINE_START = new Set(
  Array.from(
    ')]}.,:;!?%\u{2019}\u{201d}\u{3001}\u{3002}\u{ff0c}\u{ff0e}\u{ff1a}\u{ff1b}\u{ff1f}\u{ff01}\u{ff09}\u{ff3d}\u{ff5d}' +
      '\u{300d}\u{300f}\u{3011}\u{3015}\u{3009}\u{300b}\u{3019}\u{3017}\u{301f}' +
      '\u{30fc}\u{301c}\u{ff5e}\u{2026}\u{2025}\u{30fb}\u{309d}\u{309e}\u{30fd}\u{30fe}\u{3005}\u{303b}' +
      '\u{3041}\u{3043}\u{3045}\u{3047}\u{3049}\u{3063}\u{3083}\u{3085}\u{3087}\u{308e}\u{3095}\u{3096}' +
      '\u{30a1}\u{30a3}\u{30a5}\u{30a7}\u{30a9}\u{30c3}\u{30e3}\u{30e5}\u{30e7}\u{30ee}\u{30f5}\u{30f6}' +
      '\u{ff61}\u{ff63}\u{ff64}\u{ff65}\u{ff67}\u{ff68}\u{ff69}\u{ff6a}\u{ff6b}\u{ff6c}\u{ff6d}\u{ff6e}\u{ff6f}\u{ff70}',
  ),
);
const NO_LINE_END = new Set(
  Array.from(
    '([{\u{2018}\u{201c}\u{ff08}\u{ff3b}\u{ff5b}\u{300c}\u{300e}\u{3010}\u{3014}\u{3008}\u{300a}\u{3018}\u{3016}\u{301d}\u{ff62}',
  ),
);

const noHyphenation: Hyphenate = (word) => [word];

interface Chunk {
  text: string;
  /** Whether the line may break before or after this chunk without a hyphen. */
  open: boolean;
}

function firstChar(text: string): string {
  return String.fromCodePoint(text.codePointAt(0) ?? 0);
}

function lastChar(text: string): string {
  const chars = Array.from(text);
  return chars[chars.length - 1] ?? '';
}

/** Splits a word with Korean, Japanese or Chinese text in it at the points where it may wrap. */
function breakCjk(word: string, hyphenate: Hyphenate): string[] {
  const chunks: Chunk[] = [];
  let run = '';
  let runIsHangul = false;
  const endRun = () => {
    if (!run) return;
    const syllables = run.match(UNITS) ?? [run];
    if (runIsHangul && syllables.length > LONG_KOREAN_WORD) {
      for (const syllable of syllables) chunks.push({ text: syllable, open: true });
    } else {
      chunks.push({ text: run, open: false });
    }
    run = '';
  };
  for (const unit of word.match(UNITS) ?? [word]) {
    if (ANYWHERE.test(unit)) {
      endRun();
      chunks.push({ text: unit, open: true });
      continue;
    }
    const hangul = HANGUL.test(unit);
    if (run && hangul !== runIsHangul) endRun();
    runIsHangul = hangul;
    run += unit;
  }
  endRun();

  const parts: string[] = [];
  let group = '';
  const flush = () => {
    // Latin text keeps its usual hyphenation; Korean, Japanese and Chinese never get a hyphen.
    parts.push(...(HANGUL.test(group) || ANYWHERE.test(group) ? [group] : hyphenate(group)));
    group = '';
  };
  chunks.forEach((chunk, i) => {
    group += chunk.text;
    const next = chunks[i + 1];
    if (
      next !== undefined &&
      (chunk.open || next.open) &&
      !NO_LINE_END.has(lastChar(chunk.text)) &&
      !NO_LINE_START.has(firstChar(next.text))
    ) {
      flush();
      parts.push('');
    }
  });
  flush();
  return parts;
}

function needsCjkBreaks(word: string): boolean {
  return ANYWHERE.test(word) || HANGUL.test(word);
}

/**
 * The sheet's default (registered with Font.registerHyphenationCallback):
 * react-pdf's English hyphenation, plus break points in CJK text.
 */
export function breakWords(word: string, hyphenate: Hyphenate = noHyphenation): string[] {
  return needsCjkBreaks(word) ? breakCjk(word, hyphenate) : hyphenate(word);
}
