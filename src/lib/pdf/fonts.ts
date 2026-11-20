/**
 * The fonts the PDF is drawn with. They are fetched from /fonts/pdf/ (same
 * origin) only when the player exports a sheet; scripts/build-pdf-fonts.py
 * builds them, documents what each covers, and names each file after its
 * content (font-files.ts), so browsers may cache them for good.
 *
 * Every export uses Noto Sans (regular, bold, italic) and Noto Serif Bold for
 * the headings, covering Latin, Greek and Cyrillic, and a font of symbols
 * from Noto Sans Symbols and Symbols 2: about 0.8 MB together. A sheet with
 * Korean text also fetches Noto Sans CJK's Hangul (1.2 MB); one with Japanese
 * or Chinese text, its kana and Han characters (2.5 MB). Each style names a
 * list of families, and react-pdf draws every character with the first
 * family in the list that has it.
 */
import { Font } from '@react-pdf/renderer';
import { pdfLoadError } from './errors';
import { PDF_FONT_FILES } from './font-files';
import { breakWords } from './line-breaks';
import type { HasGlyph } from './text';

Font.registerHyphenationCallback(breakWords);

const FONT_DIR = '/fonts/pdf/';

// A font download that receives nothing for this long has stalled, and the
// export gives up so the player can try again. Only silence counts, not the
// total time: on a slow mobile connection the fonts for a Japanese sheet take
// over a minute, which is fine as long as they keep arriving.
const STALL_MS = 30_000;

// Italic is a family of its own rather than a fontStyle: every family in a
// style's list must have a face for that style, and the CJK fonts have no italic.
const FACES = {
  sans: [
    { file: PDF_FONT_FILES['NotoSans-Regular'], fontWeight: 400 },
    { file: PDF_FONT_FILES['NotoSans-Bold'], fontWeight: 700 },
  ],
  italic: [{ file: PDF_FONT_FILES['NotoSans-Italic'], fontWeight: 400 }],
  serif: [{ file: PDF_FONT_FILES['NotoSerif-Bold'], fontWeight: 700 }],
  symbols: [{ file: PDF_FONT_FILES['NotoSansSymbols'], fontWeight: 400 }],
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

// The Noto Sans and Serif faces have composite glyphs; the symbols and CJK fonts don't.
const HAS_COMPOSITE_GLYPHS = new Set<FamilyKey>(['sans', 'italic', 'serif']);

/** fontFamily lists for the sheet's styles, and which characters they can draw. */
export interface SheetFonts {
  sans: string[];
  italic: string[];
  serif: string[];
  hasGlyph: HasGlyph;
}

/** Downloads a file, giving up if nothing arrives for STALL_MS or `signal` aborts. */
async function download(url: string, signal: AbortSignal): Promise<Blob> {
  const controller = new AbortController();
  const stop = () => controller.abort(signal.reason);
  if (signal.aborted) stop();
  signal.addEventListener('abort', stop);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waitForData = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(new Error(`Nothing arrived from ${url} for ${STALL_MS / 1000} s`)), STALL_MS);
  };
  try {
    waitForData();
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`Couldn't fetch ${url}: HTTP ${response.status}`);
    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    for (;;) {
      waitForData();
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return new Blob(chunks);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
  }
}

/**
 * The file as a data: URL. react-pdf can fetch a font itself, but with no way
 * to notice a stalled download, or read one from a data: URL; so the export
 * downloads each font (above) and hands it over this way.
 */
function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

interface Family {
  name: string;
  fonts: LoadedFont[];
}

// Each family is downloaded once per page load (and kept by the browser's
// cache after that), unless the download fails.
const families = new Map<FamilyKey, Promise<Family>>();

// react-pdf keeps a font it couldn't read as failed. A family registered again
// after such a failure needs a name react-pdf hasn't seen.
let registrations = 0;

async function fetchFamily(key: FamilyKey, signal: AbortSignal): Promise<Family> {
  const faces = await Promise.all(
    FACES[key].map(async ({ file, fontWeight }) => ({
      src: await toDataUrl(await download(`${FONT_DIR}${file}`, signal)),
      fontWeight,
    })),
  );
  registrations += 1;
  const name = `dolmen-${key}-${registrations}`;
  Font.register({ family: name, fonts: faces });
  const fonts = await Promise.all(
    faces.map(async ({ fontWeight }) => {
      const descriptor = { fontFamily: name, fontWeight };
      await Font.load(descriptor);
      const font = Font.getFont(descriptor).data as unknown as LoadedFont | null;
      if (!font) throw new Error(`Font ${name} ${fontWeight} did not load`);
      if (HAS_COMPOSITE_GLYPHS.has(key)) warmGlyphCache(font);
      return font;
    }),
  );
  return { name, fonts };
}

function loadFamily(key: FamilyKey, signal: AbortSignal): Promise<Family> {
  const known = families.get(key);
  if (known) return known;
  const family = fetchFamily(key, signal);
  families.set(key, family);
  // Forget a failed download, so the next export tries again.
  family.catch(() => {
    if (families.get(key) === family) families.delete(key);
  });
  return family;
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
 * Downloads (the first time) and registers the fonts for a sheet whose
 * printable text is `text`, calling `onDownload` first if any must be
 * downloaded. Rejects with a PDF load error (errors.ts) if a font can't be
 * fetched or its download stalls; calling it again then retries the fonts
 * that failed.
 */
export async function loadSheetFonts(text: string, onDownload?: () => void): Promise<SheetFonts> {
  const keys: FamilyKey[] = ['sans', 'italic', 'serif', 'symbols', ...cjkFontsFor(text)];
  if (keys.some((key) => !families.has(key))) onDownload?.();
  const controller = new AbortController();
  let loaded: Family[];
  try {
    loaded = await Promise.all(keys.map((key) => loadFamily(key, controller.signal)));
  } catch (cause) {
    // Stop the other downloads: this export is over.
    controller.abort();
    throw pdfLoadError("Couldn't download the fonts for the PDF.", cause);
  }
  const [sans, italic, serif, symbols, ...cjk] = loaded;
  const latinFonts = [...sans.fonts, ...italic.fonts, ...serif.fonts];
  const otherFonts = [...symbols.fonts, ...cjk.flatMap((family) => family.fonts)];
  // After each style's own family: the symbols, then the CJK fonts.
  const fallbacks = [symbols.name, ...cjk.map((family) => family.name)];

  // A character is printable if every Latin face has it (they cover the same
  // characters, so text keeps its look in every style), or the symbols or a
  // CJK font does.
  const cache = new Map<number, boolean>();
  const hasGlyph: HasGlyph = (codePoint) => {
    let has = cache.get(codePoint);
    if (has === undefined) {
      has =
        latinFonts.every((font) => font.hasGlyphForCodePoint(codePoint)) ||
        otherFonts.some((font) => font.hasGlyphForCodePoint(codePoint));
      cache.set(codePoint, has);
    }
    return has;
  };

  return {
    sans: [sans.name, ...fallbacks],
    italic: [italic.name, ...fallbacks],
    serif: [serif.name, ...fallbacks],
    hasGlyph,
  };
}
