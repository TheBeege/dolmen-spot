#!/usr/bin/env python3
"""Builds the fonts embedded by the PDF character-sheet export (public/fonts/pdf/).

    pip install 'fonttools==4.63.0'
    python3 scripts/build-pdf-fonts.py            # rebuild public/fonts/pdf/
    python3 scripts/build-pdf-fonts.py --check    # verify the committed files are up to date

The PDF is drawn with these fonts instead of the PDF built-ins (Helvetica and
Times), which only cover Western European letters. The script downloads pinned
Noto releases (each checked against its SHA-256), subsets them with fontTools
and writes:

  NotoSans-Regular.ttf, NotoSans-Bold.ttf,   Latin (incl. Latin Extended and Vietnamese),
  NotoSans-Italic.ttf, NotoSerif-Bold.ttf    Greek (incl. polytonic) and Cyrillic.
                                             Fetched on every export.
  NotoSansCJK-Hangul.otf                     Korean Hangul. Fetched only for sheets
                                             with Korean text.
  NotoSansCJK-HanKana.otf                    Japanese kana and the Han characters of
                                             JIS X 0208, GB 2312, Big5 level 1 and
                                             KS X 1001. Fetched only for sheets with
                                             Japanese or Chinese text.

plus the fonts' licences (SIL Open Font License 1.1). Line metrics are set to
those of the built-in Helvetica/Times so the sheet keeps its line spacing, and
layout features are trimmed to what the sheet uses (kerning and accent
placement). The output is deterministic: rebuilding with the same fontTools
version gives byte-identical files.
"""
import argparse
import filecmp
import hashlib
import io
import os
import shutil
import sys
import tempfile
import urllib.request

from fontTools import subset
from fontTools import version as fonttools_version
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO, 'public', 'fonts', 'pdf')
FONTTOOLS_VERSION = '4.63.0'

# Noto Sans/Serif 2.015 and Noto Sans CJK 2.004, pinned to fixed commits/tags.
LGC = 'https://raw.githubusercontent.com/notofonts/notofonts.github.io/28b15b4b43b7bed62b5cf6e6b0b5ff5846270535/fonts'
CJK = 'https://raw.githubusercontent.com/notofonts/noto-cjk/Sans2.004'
SOURCES = {
    'NotoSans-Regular.ttf': (f'{LGC}/NotoSans/unhinted/ttf/NotoSans-Regular.ttf',
                             'f3961a9cde016d41a4879aecda1474d3a36d6bf54fa0e4643de029cc2248b0e8'),
    'NotoSans-Bold.ttf': (f'{LGC}/NotoSans/unhinted/ttf/NotoSans-Bold.ttf',
                          '87cb2d84472a7d66da659ee47b6cdb9552326e8c128245231f191b6ac72529d9'),
    'NotoSans-Italic.ttf': (f'{LGC}/NotoSans/unhinted/ttf/NotoSans-Italic.ttf',
                            '678288f868807d4d64a6f3b51466871d117d915780381ce9d0ed4b3bcbd06d37'),
    'NotoSerif-Bold.ttf': (f'{LGC}/NotoSerif/unhinted/ttf/NotoSerif-Bold.ttf',
                           '24ad531e6b05ddad8c3d89572d2c93eb86a6b74e652ce7ee3c3e171de68e84c3'),
    'NotoSansCJKjp-Regular.otf': (f'{CJK}/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf',
                                  '68a3fc98800b2a27b371f2fb79991daf3633bd89309d4ffaa6946fd587f375b5'),
    'OFL-Noto.txt': ('https://raw.githubusercontent.com/notofonts/latin-greek-cyrillic/NotoSans-v2.015/OFL.txt',
                     'cee9892f9f0cc8fe882c9e9537ee6a89621d86ee7ceaf70b02e2b2b1c25c061a'),
    'OFL-NotoSansCJK.txt': (f'{CJK}/LICENSE',
                            '6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2'),
}

LICENSES = {
    'LICENSE-NotoSans-NotoSerif.txt': 'OFL-Noto.txt',
    'LICENSE-NotoSansCJK.txt': 'OFL-NotoSansCJK.txt',
}


def ranges(*pairs):
    out = set()
    for lo, hi in pairs:
        out.update(range(lo, hi + 1))
    return out


# ── Latin, Greek and Cyrillic ────────────────────────────────

LGC_UNICODES = ranges(
    (0x0020, 0x007E),  # Basic Latin
    (0x00A0, 0x024F),  # Latin-1 Supplement, Latin Extended-A and -B
    (0x02B0, 0x02FF),  # Spacing Modifier Letters (ʻ ʼ ˆ ˇ ˘ ˙ ˚ ˛ ˜ ˝)
    (0x0300, 0x036F),  # Combining Diacritical Marks
    (0x0370, 0x03FF),  # Greek
    (0x0400, 0x052F),  # Cyrillic and Cyrillic Supplement
    (0x1E00, 0x1EFF),  # Latin Extended Additional (Vietnamese, Welsh...)
    (0x1F00, 0x1FFF),  # Greek Extended (polytonic)
    (0x2000, 0x206F),  # General Punctuation
    (0x2070, 0x209F),  # Superscripts and Subscripts
    (0x20A0, 0x20CF),  # Currency Symbols
    (0x2100, 0x218F),  # Letterlike Symbols, Number Forms
    (0x2200, 0x22FF),  # Mathematical Operators (Noto Sans has the minus sign)
    (0xFB00, 0xFB06),  # Latin ligatures (ﬁ ﬂ...)
)
# Never print a replacement character: the sheet shows "?" for text it can't draw.
LGC_UNICODES.discard(0xFFFD)

LGC_FONTS = {
    # output name: (source, hhea ascender, hhea descender)
    'NotoSans-Regular.ttf': ('NotoSans-Regular.ttf', 900, -200),
    'NotoSans-Bold.ttf': ('NotoSans-Bold.ttf', 900, -200),
    'NotoSans-Italic.ttf': ('NotoSans-Italic.ttf', 900, -200),
    'NotoSerif-Bold.ttf': ('NotoSerif-Bold.ttf', 900, -220),
}

# ── Korean, Japanese and Chinese ─────────────────────────────

CJK_PUNCTUATION = ranges(
    (0x3000, 0x303F),  # CJK Symbols and Punctuation
    (0xFE30, 0xFE4F),  # CJK Compatibility Forms
    (0xFF01, 0xFF64),  # Fullwidth ASCII and halfwidth CJK punctuation
    (0xFFE0, 0xFFEE),  # Fullwidth signs
)
HANGUL = ranges(
    (0x1100, 0x11FF),  # Hangul Jamo
    (0x3130, 0x318F),  # Hangul Compatibility Jamo
    (0xA960, 0xA97F),  # Hangul Jamo Extended-A
    (0xAC00, 0xD7A3),  # Hangul Syllables (all 11,172)
    (0xD7B0, 0xD7FF),  # Hangul Jamo Extended-B
    (0xFFA0, 0xFFDC),  # Halfwidth Hangul
)
KANA = ranges(
    (0x3040, 0x30FF),  # Hiragana, Katakana
    (0x3100, 0x312F),  # Bopomofo
    (0x31A0, 0x31BF),  # Bopomofo Extended
    (0x31F0, 0x31FF),  # Katakana Phonetic Extensions
    (0xFF65, 0xFF9F),  # Halfwidth Katakana
)


def is_han(cp):
    return 0x3400 <= cp <= 0x4DBF or 0x4E00 <= cp <= 0x9FFF or 0xF900 <= cp <= 0xFAFF or 0x20000 <= cp <= 0x3134F


def codec_han(codec, leads, trails):
    """Han characters of a double-byte national character set, read from Python's codec tables."""
    out = set()
    for lead in leads:
        for trail in trails:
            try:
                ch = bytes([lead, trail]).decode(codec)
            except UnicodeDecodeError:
                continue
            if len(ch) == 1 and is_han(ord(ch)):
                out.add(ord(ch))
    return out


def han_repertoire():
    """The everyday Han characters of Japan, China, Taiwan/Hong Kong and Korea."""
    jis_x0208 = codec_han('shift_jis', [*range(0x81, 0xA0), *range(0xE0, 0xF0)], range(0x40, 0xFD))
    gb2312 = codec_han('gb2312', range(0xA1, 0xF8), range(0xA1, 0xFF))
    big5_level1 = codec_han('big5', range(0xA4, 0xC7), [*range(0x40, 0x7F), *range(0xA1, 0xFF)])
    ks_x1001 = codec_han('euc_kr', range(0xA1, 0xFF), range(0xA1, 0xFF))
    counts = {'JIS X 0208': len(jis_x0208), 'GB 2312': len(gb2312), 'Big5 level 1': len(big5_level1),
              'KS X 1001': len(ks_x1001)}
    # The codec tables are part of CPython and have been stable for years; fail loudly if they ever change.
    expected = {'JIS X 0208': 6356, 'GB 2312': 6763, 'Big5 level 1': 5401, 'KS X 1001': 4888}
    if counts != expected:
        sys.exit(f'Unexpected Han repertoire sizes {counts}; expected {expected}')
    return jis_x0208 | gb2312 | big5_level1 | ks_x1001


# ── Building ─────────────────────────────────────────────────


def fetch(cache_dir, name):
    url, sha256 = SOURCES[name]
    path = os.path.join(cache_dir, name)
    if not os.path.exists(path):
        print(f'  downloading {url}')
        with urllib.request.urlopen(url, timeout=300) as response:
            data = response.read()
        with open(path + '.part', 'wb') as f:
            f.write(data)
        os.replace(path + '.part', path)
    with open(path, 'rb') as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    if digest != sha256:
        sys.exit(f'{name}: SHA-256 {digest} does not match the pinned {sha256}')
    return path


def add_newline_glyph(font):
    """Maps U+000A to an empty, zero-width glyph.

    react-pdf keeps "\\n" in the text it lays out and draws each character with
    the first font that has it, falling back to the built-in Helvetica. Without
    this, every multi-line note would pull an unembedded Helvetica into the PDF.
    """
    name = 'uni000A'
    order = font.getGlyphOrder() + [name]
    font.setGlyphOrder(order)
    font['glyf'].glyphOrder = order
    font['glyf'].glyphs[name] = Glyph()
    font['hmtx'].metrics[name] = (0, 0)
    for table in font['cmap'].tables:
        if table.isUnicode():
            table.cmap[0x0A] = name


def subset_font(source_path, unicodes, *, layout_features, ascender, descender, drop_tables=(),
                postscript_name=None, newline=False):
    options = subset.Options()
    options.layout_features = layout_features
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # copyright, names, version, licence
    options.name_languages = [0x409]
    options.notdef_outline = True
    options.hinting = False
    options.glyph_names = False
    options.drop_tables += list(drop_tables)

    font = TTFont(source_path, recalcTimestamp=False)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)

    # react-pdf spaces lines by hhea ascender - descender + lineGap. Use the
    # built-in fonts' values so lines stay as tightly set as before.
    font['hhea'].ascent = ascender
    font['hhea'].descent = descender
    font['hhea'].lineGap = 0
    if postscript_name:
        font['name'].setName(postscript_name, 6, 3, 1, 0x409)
    if newline:
        add_newline_glyph(font)

    buffer = io.BytesIO()
    font.save(buffer)
    return buffer.getvalue(), set(font.getBestCmap())


def build(cache_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    report = []

    lgc_sources = {out: fetch(cache_dir, src) for out, (src, _, _) in LGC_FONTS.items()}
    # Give all four faces the same coverage, so any text the sheet keeps can be drawn in every style.
    shared = set(LGC_UNICODES)
    for path in lgc_sources.values():
        shared &= set(TTFont(path, lazy=True).getBestCmap())
    for out, (_, ascender, descender) in LGC_FONTS.items():
        # Kerning plus mark positioning for accents that have no precomposed letter. No 'ccmp':
        # it splits letters such as ị into i + dot below, and PDF text extraction then loses the dot.
        data, cmap = subset_font(lgc_sources[out], shared, layout_features=['kern', 'mark', 'mkmk'],
                                 ascender=ascender, descender=descender, newline=True)
        assert cmap == shared | {0x0A}, f'{out}: coverage differs from the other faces'
        report.append((out, len(cmap), data))

    cjk_source = fetch(cache_dir, 'NotoSansCJKjp-Regular.otf')
    cjk_cmap = set(TTFont(cjk_source, lazy=True).getBestCmap())
    cjk_options = dict(layout_features=[], ascender=900, descender=-200,
                       drop_tables=['BASE', 'GDEF', 'GPOS', 'GSUB', 'VORG', 'vhea', 'vmtx', 'DSIG'])
    for out, unicodes, postscript_name in [
        ('NotoSansCJK-Hangul.otf', HANGUL | CJK_PUNCTUATION, 'NotoSansCJKjp-Regular-Hangul'),
        ('NotoSansCJK-HanKana.otf', KANA | CJK_PUNCTUATION | han_repertoire(), 'NotoSansCJKjp-Regular-HanKana'),
    ]:
        data, cmap = subset_font(cjk_source, unicodes & cjk_cmap, postscript_name=postscript_name, **cjk_options)
        report.append((out, len(cmap), data))

    for out, _, data in report:
        with open(os.path.join(out_dir, out), 'wb') as f:
            f.write(data)
    for out, src in LICENSES.items():
        shutil.copyfile(fetch(cache_dir, src), os.path.join(out_dir, out))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--cache', default=os.path.join(tempfile.gettempdir(), 'dolmen-spot-pdf-font-sources'),
                        help='where to keep the downloaded source fonts (default: %(default)s)')
    parser.add_argument('--check', action='store_true',
                        help='rebuild into a temporary directory and fail if public/fonts/pdf/ differs')
    args = parser.parse_args()

    if fonttools_version != FONTTOOLS_VERSION:
        print(f'warning: fontTools {fonttools_version} may not reproduce the committed files '
              f'byte for byte (they were built with {FONTTOOLS_VERSION})', file=sys.stderr)
    os.makedirs(args.cache, exist_ok=True)

    if args.check:
        with tempfile.TemporaryDirectory() as tmp:
            build(args.cache, tmp)
            names = sorted(os.listdir(tmp))
            _, mismatch, errors = filecmp.cmpfiles(tmp, OUT_DIR, names, shallow=False)
            if mismatch or errors:
                sys.exit(f'public/fonts/pdf/ is out of date: {", ".join(mismatch + errors)}')
        print('public/fonts/pdf/ is up to date.')
        return

    report = build(args.cache, OUT_DIR)
    total = 0
    for out, glyphs, data in report:
        total += len(data)
        print(f'{out:28s} {glyphs:6d} characters {len(data):10,d} bytes')
    print(f'{"total":28s} {"":17s} {total:10,d} bytes')


if __name__ == '__main__':
    main()
