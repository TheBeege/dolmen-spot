#!/usr/bin/env python3
"""Builds the fonts embedded by the PDF character-sheet export (public/fonts/pdf/).

    pip install 'fonttools==4.63.0'
    python3 scripts/build-pdf-fonts.py            # rebuild public/fonts/pdf/ and font-files.ts
    python3 scripts/build-pdf-fonts.py --check    # verify the committed files are up to date

The PDF is drawn with these fonts instead of the PDF built-ins (Helvetica and
Times), which only cover Western European letters. The script downloads pinned
Noto releases (each checked against its SHA-256), subsets them with fontTools
and writes:

  NotoSans-Regular, NotoSans-Bold,           Latin (incl. Latin Extended and Vietnamese),
  NotoSans-Italic, NotoSerif-Bold            Greek (incl. polytonic) and Cyrillic.
                                             Fetched on every export.
  NotoSansSymbols                            Symbols players write in notes (check
                                             boxes and marks, stars, card suits, dice,
                                             music...), from Noto Sans Symbols and
                                             Symbols 2. Fetched on every export.
  NotoSansCJK-Hangul                         Korean Hangul. Fetched only for sheets
                                             with Korean text.
  NotoSansCJK-HanKana                        Japanese kana and the Han characters of
                                             JIS X 0208, GB 2312, Big5 level 1 and
                                             KS X 1001, plus variant kanji common in
                                             Japanese names. Fetched only for sheets
                                             with Japanese or Chinese text.

plus the fonts' licences (SIL Open Font License 1.1). Each font file is named
after its content (NotoSans-Regular.<hash>.ttf), so the site can let browsers
cache it for a year: a changed font gets a new name. The names are written to
src/lib/pdf/font-files.ts for the app to import. Line metrics are set to
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
from fontTools.merge import Merger
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO, 'public', 'fonts', 'pdf')
# Maps each font to its content-hashed file name; src/lib/pdf/fonts.ts imports it.
MANIFEST = os.path.join(REPO, 'src', 'lib', 'pdf', 'font-files.ts')
FONTTOOLS_VERSION = '4.63.0'

# Noto Sans/Serif 2.015, Noto Sans Symbols 2.003, Noto Sans Symbols 2 2.008 and
# Noto Sans CJK 2.004, pinned to fixed commits/tags.
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
    'NotoSansSymbols-Regular.ttf': (f'{LGC}/NotoSansSymbols/unhinted/ttf/NotoSansSymbols-Regular.ttf',
                                    '6eea9cb4cd39269ea9f95ba5c2735f80ae74049dfc9e1a7c932a5cfc8f0c3030'),
    'NotoSansSymbols2-Regular.ttf': (f'{LGC}/NotoSansSymbols2/unhinted/ttf/NotoSansSymbols2-Regular.ttf',
                                     'c4a0a80f0041ce4be81e2478faad22776d23edb98ae3f0d19bd37044820ecf9d'),
    'NotoSansCJKjp-Regular.otf': (f'{CJK}/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf',
                                  '68a3fc98800b2a27b371f2fb79991daf3633bd89309d4ffaa6946fd587f375b5'),
    'OFL-Noto.txt': ('https://raw.githubusercontent.com/notofonts/latin-greek-cyrillic/NotoSans-v2.015/OFL.txt',
                     'cee9892f9f0cc8fe882c9e9537ee6a89621d86ee7ceaf70b02e2b2b1c25c061a'),
    'OFL-NotoSansSymbols.txt': ('https://raw.githubusercontent.com/notofonts/symbols/NotoSansSymbols2-v2.008/OFL.txt',
                                'b118dd41337806a5d4797052c77caf3bd096aed783e5eb21b4d11154351e1ac0'),
    'OFL-NotoSansCJK.txt': (f'{CJK}/LICENSE',
                            '6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2'),
}

LICENSES = {
    'LICENSE-NotoSans-NotoSerif.txt': 'OFL-Noto.txt',
    'LICENSE-NotoSansSymbols.txt': 'OFL-NotoSansSymbols.txt',
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

# ── Symbols ──────────────────────────────────────────────────

# Symbols players write in their notes, from Noto Sans Symbols 2 or, where
# only it has one, Noto Sans Symbols. Only symbols that are text by default:
# the sheet leaves out emoji such as 🔥, ⚡ and ✨ (see src/lib/pdf/text.ts).
SYMBOLS = ranges(
    (0x2190, 0x2199),  # arrows ← ↑ → ↓ ↔ ↕ ↖ ↗ ↘ ↙
    (0x25A0, 0x25A3), (0x25AA, 0x25AB),  # squares ■ □ ▢ ▣ ▪ ▫
    (0x25B2, 0x25B3), (0x25B6, 0x25B7), (0x25BC, 0x25BD), (0x25C0, 0x25C1),  # triangles ▲ △ ▶ ▷ ▼ ▽ ◀ ◁
    (0x25C6, 0x25C8), (0x25CB, 0x25CB), (0x25CE, 0x25D1), (0x25EF, 0x25EF),  # ◆ ◇ ◈ ○ ◎ ● ◐ ◑ ◯
    (0x25FB, 0x25FC),  # ◻ ◼
    (0x2600, 0x2606),  # weather, stars ☀ ☁ ☂ ☃ ☄ ★ ☆
    (0x2609, 0x2609),  # ☉
    (0x2610, 0x2612),  # ballot boxes ☐ ☑ ☒
    (0x2618, 0x2618),  # ☘
    (0x261A, 0x2620),  # pointing hands ☚ ☛ ☜ ☝ ☞ ☟, ☠
    (0x2624, 0x2626), (0x2628, 0x2629), (0x262F, 0x262F),  # ☤ ☥ ☦ ☨ ☩ ☯
    (0x2638, 0x2647),  # ☸ ☹ ☺ ☻ ☼, moons ☽ ☾, planets ☿ ♀ ♁ ♂ ♃ ♄ ♅ ♆ ♇
    (0x2654, 0x2667),  # chess ♔–♟, card suits ♠ ♡ ♢ ♣ ♤ ♥ ♦ ♧
    (0x2669, 0x266F),  # music ♩ ♪ ♫ ♬ ♭ ♮ ♯
    (0x2680, 0x2685),  # dice ⚀ ⚁ ⚂ ⚃ ⚄ ⚅
    (0x2690, 0x2692),  # flags ⚐ ⚑, hammer and pick ⚒
    (0x2694, 0x269A),  # crossed swords ⚔, ⚕ ⚖ ⚗ ⚘ ⚙ ⚚
    (0x269C, 0x269D),  # fleur-de-lis ⚜, ⚝
    (0x26A0, 0x26A0),  # ⚠
    (0x26B0, 0x26B1),  # coffin ⚰, urn ⚱
    (0x26CF, 0x26CF),  # pick ⛏
    (0x26E4, 0x26E7),  # pentagrams ⛤ ⛥ ⛦ ⛧
    (0x2702, 0x2702), (0x2709, 0x2709),  # ✂ ✉
    (0x270E, 0x2710),  # pencils ✎ ✏ ✐
    (0x2713, 0x2718),  # check and cross marks ✓ ✔ ✕ ✖ ✗ ✘
    (0x271D, 0x2720),  # crosses ✝ ✞ ✟ ✠
    (0x2726, 0x2727), (0x2729, 0x2730),  # stars ✦ ✧ ✩ ✪ ✫ ✬ ✭ ✮ ✯ ✰
    (0x2764, 0x2767),  # hearts ❤ ❥ ❦ ❧
    (0x1F56F, 0x1F56F), (0x1F5DD, 0x1F5DD), (0x1F5E1, 0x1F5E1), (0x1F6E1, 0x1F6E1),  # 🕯 🗝 🗡 🛡
    (0x1F5F7, 0x1F5F7), (0x1F5F9, 0x1F5F9),  # ballot boxes 🗷 🗹
)

# ── Korean, Japanese and Chinese ─────────────────────────────

CJK_PUNCTUATION = ranges(
    (0x3000, 0x303F),  # CJK Symbols and Punctuation
    (0xFE30, 0xFE4F),  # CJK Compatibility Forms
    (0xFF01, 0xFF64),  # Fullwidth ASCII and halfwidth CJK punctuation
    (0xFFE0, 0xFFEE),  # Fullwidth signs
    # "…", which react-pdf draws in the font of the text it cuts off at a line
    # limit (maxLines), so every font needs one.
    (0x2026, 0x2026),
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


# Kanji that Japanese names often use and the character sets above lack:
# variant forms (as in 髙橋, 山﨑, 𠮷田, 濵田, 栁田, 桒原, 草彅), and the twelve
# CJK compatibility ideographs that are characters of their own (Unicode
# normalization leaves them alone, unlike the rest of that block).
NAME_KANJI = {
    0x9AD9,   # 髙, a form of 高
    0x2363A,  # 𣘺, a form of 橋
    0x69D7,   # 槗, a form of 橋
    0x20BB7,  # 𠮷, a form of 吉
    0x6FF5,   # 濵, a form of 浜
    0x6801,   # 栁, a form of 柳
    0x6852,   # 桒, a form of 桑
    0x66FB,   # 曻, a form of 昇
    0x5F45,   # 彅, as in 草彅
    0x2123D,  # 𡈽, a form of 土
    0x2000B,  # 𠀋, a form of 丈
    0xFA0E, 0xFA0F, 0xFA11, 0xFA13, 0xFA14, 0xFA1F,  # 﨎 﨏 﨑 (崎) 﨓 﨔 﨟
    0xFA21, 0xFA23, 0xFA24, 0xFA27, 0xFA28, 0xFA29,  # 﨡 﨣 﨤 﨧 﨨 﨩
}


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


def add_empty_glyphs(font, code_points):
    """Maps each code point to an empty, zero-width glyph of its own."""
    order = font.getGlyphOrder()
    if 'glyf' in font:
        names = [f'uni{cp:04X}' for cp in code_points]
        order = order + names
        font.setGlyphOrder(order)
        font['glyf'].glyphOrder = order
        for name in names:
            font['glyf'].glyphs[name] = Glyph()
    else:
        # A CID-keyed CFF font (Noto Sans CJK): glyphs are named by CID.
        cff = font['CFF '].cff
        top = cff.topDictIndex[0]
        charstrings = top.CharStrings
        next_cid = max(int(name[3:]) for name in order if name.startswith('cid')) + 1
        names = [f'cid{next_cid + i:05d}' for i in range(len(code_points))]
        for name in names:
            charstring = T2CharStringPen(0, None).getCharString(private=top.FDArray[0].Private,
                                                                 globalSubrs=cff.GlobalSubrs)
            charstrings.charStringsIndex.append(charstring)
            charstrings.charStrings[name] = len(charstrings.charStringsIndex) - 1
            top.charset.append(name)
            top.FDSelect.append(0)
        font.setGlyphOrder(order + names)
    for cp, name in zip(code_points, names):
        font['hmtx'].metrics[name] = (0, 0)
        for table in font['cmap'].tables:
            if table.isUnicode():
                table.cmap[cp] = name


def subset_font(source_path, unicodes, *, layout_features, ascender, descender, drop_tables=(),
                postscript_name=None, empty=(), full_cmap_only=False):
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
    if empty:
        add_empty_glyphs(font, empty)
    if full_cmap_only:
        # Characters beyond U+FFFF (𠮷...) need a second character map covering
        # all of Unicode. Keep only that one, which is the one fontkit (react-pdf)
        # reads, rather than both: about 40 KB less.
        full = [table for table in font['cmap'].tables if (table.platformID, table.platEncID) == (3, 10)]
        if full:
            font['cmap'].tables = full

    buffer = io.BytesIO()
    font.save(buffer)
    return buffer.getvalue(), set(font.getBestCmap())


def build_symbols(cache_dir):
    """One font with every symbol in SYMBOLS, merged from Noto Sans Symbols 2 and Symbols.

    Plus Noto Sans's "…": react-pdf draws it in the font of the text it cuts
    off at a line limit (maxLines), and neither symbols font has one.
    """
    symbols2 = fetch(cache_dir, 'NotoSansSymbols2-Regular.ttf')
    symbols1 = fetch(cache_dir, 'NotoSansSymbols-Regular.ttf')
    in2 = SYMBOLS & set(TTFont(symbols2, lazy=True).getBestCmap())
    in1 = (SYMBOLS - in2) & set(TTFont(symbols1, lazy=True).getBestCmap())
    assert in1 | in2 == SYMBOLS, f'no source font has {sorted(map(hex, SYMBOLS - in1 - in2))}'
    parts = []
    sans = fetch(cache_dir, 'NotoSans-Regular.ttf')
    for source, unicodes in [(symbols2, in2), (symbols1, in1), (sans, {0x2026})]:
        data, _ = subset_font(source, unicodes, layout_features=[], ascender=900, descender=-200,
                              drop_tables=['GDEF', 'GPOS', 'GSUB', 'vhea', 'vmtx'])
        parts.append(io.BytesIO(data))
    font = Merger().merge(parts)
    # The merger stamps the fonts with the current time; keep Symbols 2's dates
    # so that the build is reproducible.
    source_head = TTFont(symbols2, lazy=True)['head']
    font['head'].created, font['head'].modified = source_head.created, source_head.modified
    font.recalcTimestamp = False
    # Empty hyphens, as for the CJK fonts below: react-pdf may break a line where
    # the text changes to or from a symbol, drawing a hyphen in this font.
    add_empty_glyphs(font, [0x2D, 0x2010])
    buffer = io.BytesIO()
    font.save(buffer)
    return buffer.getvalue(), set(font.getBestCmap())


def build(cache_dir, out_dir, manifest_path):
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
        # An empty glyph for "\n": react-pdf keeps it in the text it lays out and draws each
        # character with the first font that has it, so without one every multi-line note
        # would pull an unembedded Helvetica into the PDF.
        data, cmap = subset_font(lgc_sources[out], shared, layout_features=['kern', 'mark', 'mkmk'],
                                 ascender=ascender, descender=descender, empty=[0x0A])
        assert cmap == shared | {0x0A}, f'{out}: coverage differs from the other faces'
        report.append((out, len(cmap), data))

    data, cmap = build_symbols(cache_dir)
    report.append(('NotoSansSymbols.ttf', len(cmap), data))

    cjk_source = fetch(cache_dir, 'NotoSansCJKjp-Regular.otf')
    cjk_cmap = set(TTFont(cjk_source, lazy=True).getBestCmap())
    # Empty hyphens: where react-pdf breaks a line inside a word, it draws a hyphen
    # in the font of the text before the break, even a font without one, which
    # prints as a missing-glyph box. Korean, Japanese and Chinese never take a
    # hyphen at a break. (A hyphen typed in the text is drawn by Noto Sans, which
    # comes first in every font list.)
    cjk_options = dict(layout_features=[], ascender=900, descender=-200, empty=[0x2D, 0x2010],
                       full_cmap_only=True,
                       drop_tables=['BASE', 'GDEF', 'GPOS', 'GSUB', 'VORG', 'vhea', 'vmtx', 'DSIG'])
    for out, unicodes, postscript_name in [
        ('NotoSansCJK-Hangul.otf', HANGUL | CJK_PUNCTUATION, 'NotoSansCJKjp-Regular-Hangul'),
        ('NotoSansCJK-HanKana.otf', KANA | CJK_PUNCTUATION | han_repertoire() | NAME_KANJI,
         'NotoSansCJKjp-Regular-HanKana'),
    ]:
        missing = (unicodes & NAME_KANJI) - cjk_cmap
        assert not missing, f'{out}: the source font lacks {sorted(map(hex, missing))}'
        data, cmap = subset_font(cjk_source, unicodes & cjk_cmap, postscript_name=postscript_name, **cjk_options)
        report.append((out, len(cmap), data))

    # Name each file after its content, and remove fonts a previous build left behind.
    named = []
    for out, glyphs, data in report:
        stem, ext = os.path.splitext(out)
        named.append((stem, f'{stem}.{hashlib.sha256(data).hexdigest()[:10]}{ext}', glyphs, data))
    keep = {file for _, file, _, _ in named}
    for existing in os.listdir(out_dir):
        if existing.endswith(('.ttf', '.otf')) and existing not in keep:
            os.remove(os.path.join(out_dir, existing))
    for _, file, _, data in named:
        with open(os.path.join(out_dir, file), 'wb') as f:
            f.write(data)
    for out, src in LICENSES.items():
        shutil.copyfile(fetch(cache_dir, src), os.path.join(out_dir, out))
    with open(manifest_path, 'w', encoding='utf-8') as f:
        f.write(manifest_source(named))
    return named


def manifest_source(named):
    lines = [
        '// Generated by scripts/build-pdf-fonts.py; do not edit. The PDF fonts in',
        '// public/fonts/pdf/, each named after its content so that browsers can',
        '// cache it for good (see next.config.ts).',
        'export const PDF_FONT_FILES = {',
        *[f"  '{stem}': '{file}'," for stem, file, _, _ in named],
        '} as const;',
        '',
    ]
    return '\n'.join(lines)


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
            fonts_dir = os.path.join(tmp, 'fonts')
            os.makedirs(fonts_dir)
            manifest = os.path.join(tmp, 'font-files.ts')
            build(args.cache, fonts_dir, manifest)
            expected = sorted(os.listdir(fonts_dir))
            problems = sorted(set(os.listdir(OUT_DIR)) ^ set(expected))
            _, mismatch, errors = filecmp.cmpfiles(fonts_dir, OUT_DIR, expected, shallow=False)
            problems += mismatch + errors
            if not filecmp.cmp(manifest, MANIFEST, shallow=False):
                problems.append(os.path.relpath(MANIFEST, REPO))
            if problems:
                sys.exit(f'The PDF fonts are out of date: {", ".join(problems)}')
        print('public/fonts/pdf/ and src/lib/pdf/font-files.ts are up to date.')
        return

    named = build(args.cache, OUT_DIR, MANIFEST)
    total = 0
    for _, file, glyphs, data in named:
        total += len(data)
        print(f'{file:36s} {glyphs:6d} characters {len(data):10,d} bytes')
    print(f'{"total":36s} {"":17s} {total:10,d} bytes')


if __name__ == '__main__':
    main()
