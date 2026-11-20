/**
 * The fonts the PDF is drawn with. They are fetched from /fonts/pdf/ (same
 * origin) only when the player exports a sheet; scripts/build-pdf-fonts.py
 * builds them, documents what each covers, and names each file after its
 * content (font-files.ts), so browsers may cache them for good.
 *
 * Every export uses Noto Sans (regular, bold, italic) and Noto Serif Bold for
 * the headings: Latin, Greek and Cyrillic, about 0.8 MB together. A sheet
 * with Korean text also fetches Noto Sans CJK's Hangul (1.2 MB); one with
 * Japanese or Chinese text, its kana and Han characters (2.4 MB). Each style
 * names a list of families, and react-pdf draws every character with the
 * first family in the list that has it.
 */
import { Font } from '@react-pdf/renderer';
import { PDF_FONT_LOAD_ERROR } from './errors';
import { PDF_FONT_FILES } from './font-files';
import { breakWords } from './line-breaks';
import type { HasGlyph } from './text';

Font.registerHyphenationCallback(breakWords);

const FONT_DIR = '/fonts/pdf/';

// Italic is a family of its own rather than a fontStyle: every family in a
// style's list must have a face for that style, and the CJK fonts have no italic.
const FACES = {
  sans: [
    { file: PDF_FONT_FILES['NotoSans-Regular'], fontWeight: 400 },
    { file: PDF_FONT_FILES['NotoSans-Bold'], fontWeight: 700 },
  ],
  italic: [{ file: PDF_FONT_FILES['NotoSans-Italic'], fontWeight: 400 }],
  serif: [{ file: PDF_FONT_FILES['NotoSerif-Bold'], fontWeight: 700 }],
  hangul: [{ file: PDF_FONT_FILES['NotoSansCJK-Hangul'], fontWeight: 400 }],
  hanKana: [{ file: PDF_FONT_FILES['NotoSansCJK-HanKana'], fontWeight: 400 }],
} as const;

type FamilyKey = keyof typeof FACES;
type CjkFamilyKey = 'hangul' | 'hanKana';

// The parts of a fontkit font used here. fontkit's typings leave these out,
// though react-pdf's own font fallback relies on them too.
interface LoadedFont {
  characterSet: number[];
  hasGlyphForCodePoint: (codePoint: number) => boolean;
  glyphForCodePoint: (codePoint: number) => unknown;
}

const warmedFonts = new WeakSet<LoadedFont>();

/**
 * Works around a fontkit cache problem that garbles the second PDF made in a
 * session. Accented letters such as "ř" are composite glyphs ("r" plus a
 * caron). When a PDF embeds one, fontkit's subsetter looks up the plain "r"
 * glyph and caches it without its character, and if "r" itself wasn't used in
 * that face, the next PDF gets an "r" that copies as nothing and throws off
 * line breaking. Looking every character up once, before any PDF is made,
 * caches each glyph with its character.
 */
function warmGlyphCache(font: LoadedFont) {
  if (warmedFonts.has(font)) return;
  for (const codePoint of font.characterSet) font.glyphForCodePoint(codePoint);
  warmedFonts.add(font);
}

// The Noto Sans and Serif faces have composite glyphs; the CJK fonts (CFF outlines) don't.
const HAS_COMPOSITE_GLYPHS = new Set<FamilyKey>(['sans', 'italic', 'serif']);

/** fontFamily lists for the sheet's styles, and which characters they can draw. */
export interface SheetFonts {
  sans: string[];
  italic: string[];
  serif: string[];
  hasGlyph: HasGlyph;
}

// react-pdf keeps a font that failed to load as failed, so every later export
// would fail too. After a failure the next attempt registers the families
// again under new names, which makes it fetch them afresh.
let generation = 0;

function registerFamily(key: FamilyKey): string {
  const family = `dolmen-${key}-${generation}`;
  if (!Font.getRegisteredFontFamilies().includes(family)) {
    Font.register({
      family,
      fonts: FACES[key].map(({ file, fontWeight }) => ({ src: `${FONT_DIR}${file}`, fontWeight })),
    });
  }
  return family;
}

async function loadFamily(family: string, key: FamilyKey): Promise<LoadedFont[]> {
  return Promise.all(
    FACES[key].map(async ({ fontWeight }) => {
      const descriptor = { fontFamily: family, fontWeight };
      await Font.load(descriptor);
      const font = Font.getFont(descriptor).data as unknown as LoadedFont | null;
      if (!font) throw new Error(`Font ${family} ${fontWeight} did not load`);
      if (HAS_COMPOSITE_GLYPHS.has(key)) warmGlyphCache(font);
      return font;
    }),
  );
}

const isHangul = (cp: number) =>
  (cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x3130 && cp <= 0x318f) || (cp >= 0xa960 && cp <= 0xa97f) ||
  (cp >= 0xac00 && cp <= 0xd7ff) || (cp >= 0xffa0 && cp <= 0xffdc);

const isHanOrKana = (cp: number) =>
  (cp >= 0x2e80 && cp <= 0x2fdf) || (cp >= 0x3040 && cp <= 0x312f) || (cp >= 0x3190 && cp <= 0x31ff) ||
  (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0xff65 && cp <= 0xff9f) || (cp >= 0x20000 && cp <= 0x3134f);

const isCjkPunctuation = (cp: number) => (cp >= 0x3001 && cp <= 0x303f) || (cp >= 0xfe30 && cp <= 0xfe4f);

/**
 * Which CJK fonts a sheet needs. Looks at the compatibility forms
 * (fullwidth "Ａ" is "A", "㋐" is "ア") because that's what text.ts falls
 * back to when no font has the original character.
 */
export function cjkFontsFor(text: string): CjkFamilyKey[] {
  // Nothing from U+1100 up (astral characters are surrogate pairs, also in this range): no CJK text.
  if (!/[\u1100-\uffff]/.test(text)) return [];
  let hangul = false;
  let hanKana = false;
  let punctuation = false;
  for (const ch of text.normalize('NFKD')) {
    const cp = ch.codePointAt(0) ?? 0;
    if (isHangul(cp)) hangul = true;
    else if (isHanOrKana(cp)) hanKana = true;
    else if (isCjkPunctuation(cp)) punctuation = true;
  }
  const fonts: CjkFamilyKey[] = [];
  // Both CJK fonts have the CJK punctuation; Hangul is the smaller download.
  if (hangul || (punctuation && !hanKana)) fonts.push('hangul');
  if (hanKana) fonts.push('hanKana');
  return fonts;
}

/**
 * Registers and downloads the fonts for a sheet whose printable text is
 * `text`. Rejects with an error named PDF_FONT_LOAD_ERROR if a font can't be
 * fetched; calling it again then retries the download.
 */
export async function loadSheetFonts(text: string): Promise<SheetFonts> {
  const cjk = cjkFontsFor(text);
  const sans = registerFamily('sans');
  const italic = registerFamily('italic');
  const serif = registerFamily('serif');
  const cjkFamilies = cjk.map(registerFamily);

  let latinFonts: LoadedFont[];
  let cjkFonts: LoadedFont[];
  try {
    const [sansFonts, italicFonts, serifFonts, ...cjkLoaded] = await Promise.all([
      loadFamily(sans, 'sans'),
      loadFamily(italic, 'italic'),
      loadFamily(serif, 'serif'),
      ...cjk.map((key, i) => loadFamily(cjkFamilies[i], key)),
    ]);
    latinFonts = [...sansFonts, ...italicFonts, ...serifFonts];
    cjkFonts = cjkLoaded.flat();
  } catch (cause) {
    generation += 1;
    const error = new Error("Couldn't download the fonts for the PDF.", { cause });
    error.name = PDF_FONT_LOAD_ERROR;
    throw error;
  }

  // A character is printable if every Latin face has it (they cover the same
  // characters, so text keeps its look in every style) or a CJK font does.
  const cache = new Map<number, boolean>();
  const hasGlyph: HasGlyph = (codePoint) => {
    let has = cache.get(codePoint);
    if (has === undefined) {
      has =
        latinFonts.every((font) => font.hasGlyphForCodePoint(codePoint)) ||
        cjkFonts.some((font) => font.hasGlyphForCodePoint(codePoint));
      cache.set(codePoint, has);
    }
    return has;
  };

  return {
    sans: [sans, ...cjkFamilies],
    italic: [italic, ...cjkFamilies],
    serif: [serif, ...cjkFamilies],
    hasGlyph,
  };
}
