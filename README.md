# Dolmen Spot — Dolmenwood Character Sheet

A digital character sheet for the [Dolmenwood](https://necroticgnome.com/collections/dolmenwood) tabletop RPG. Track characters, auto-calculate stats, manage inventory, and reference game data — all in the browser.

**Live app:** [dolmen.spot](https://www.dolmen.spot/)

![Screenshot](docs/images/screenshot.png)

## Features

### Character Creation & Management
- Support for all 6 kindreds (Breggle, Elf, Grimalkin, Human, Mossling, Woodgrue) and 9 classes (Bard, Cleric, Enchanter, Fighter, Friar, Hunter, Knight, Magician, Thief)
- Kindred-class combinations with dedicated advancement tables
- Multi-character support with import/export (JSON)
- Printable PDF character sheet (Letter or A4, chosen from your browser's language)
- Optional cloud save to Google Drive or OneDrive

### Auto-Calculated Stats
- Armor class, attack bonus, saves, and skills
- XP tracking with level-up thresholds per class
- Dual encumbrance systems (weight-based and slot-based)

### Magic Systems
- Arcane spells (Enchanter, Magician)
- Holy spells (Cleric, Friar)
- Glamours (Elf)
- Fairy runes and mossling knacks

### Inventory
- Full equipment catalog browser
- Container support with nested weight tracking
- Coin management (Copper, Silver, Gold, Pellucidium)

### Adventuring Tools
- 12-month Dolmenwood calendar with moon phases
- Condition and status tracking
- Travel, light source, and camping calculators

### Journal
- Entries stamped with the date (a Fairy day while in Fairy) and the map hex the party is in; coming back from Fairy asks which hex, and sets the party's location to where they came back
- Listed newest first, in the order your character lived them
- Search by text, place, hex, date or the NPCs an entry is about (quotes for an exact phrase; numbers match whole, so 606 finds hex 0606), filter by hex, and open a hex's entries from the map
- Each entry says which NPCs it is about, and the NPCs tab keeps it as one of their notes

### NPCs
- The people your character has met: name, affiliation, where they are (and the map hex when it is known), goals, and a checklist of the quests they have given you with a count of how many are done
- Notes about an NPC are journal entries that name them, so they keep the date and place they were written, show in the Journal too, and are deleted once from either tab
- The list is sorted by name and searched by their name, affiliation, place, hex, goals, quests and the words of their notes
- A note being written, or a half-filled form, is kept while you look at another tab

### Interactive Hex Map
- Dolmenwood hex map for tracking exploration

### Reference Panels
- Equipment catalog, world lore, consumables, and calendar reference
- Class and kindred feature panels with interactive mechanics (fighter talents, grimalkin forms, etc.)

## Tech Stack

- [Next.js](https://nextjs.org/) 16
- [React](https://react.dev/) 19
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/) v4
- [react-pdf](https://react-pdf.org/) (`@react-pdf/renderer`) for the PDF character sheet export
- localStorage for persistence (no backend required), with optional Google Drive / OneDrive cloud save

## Getting Started

```bash
git clone https://github.com/TheBeege/dolmen-spot.git
cd dolmen-spot
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

`npm test` runs the unit tests. `npm run test:e2e` builds the app and runs the browser tests: smoke, layout and accessibility checks in Chromium and WebKit (see "Browser Tests" in [AGENTS.md](AGENTS.md)). `npm run audit:known-issues` is a separate run: it fails on a known-issue entry that no longer matches a problem.

Cloud save is optional. To enable it locally, copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and/or `NEXT_PUBLIC_MICROSOFT_CLIENT_ID`. Without them the app runs on localStorage alone.

## Project Structure

```
src/
  app/          # Next.js app router (sheet, /about, /changelog, layout, global styles)
  components/   # Tab components (CharacterInfo, CombatStats, Inventory, etc.)
  hooks/        # useCharacter (state + localStorage) and useCloudStorage
  lib/          # Types, game data, shared sheet calculations, save migrations, cloud providers, and the PDF export
docs/
  DEPLOYMENT-PHASES.md  # Feature roadmap
  rules/                # Extracted rule reference (gitignored — copyrighted, local only)
public/fonts/pdf/       # Fonts the PDF export embeds (see below)
scripts/
  build-pdf-fonts.py    # Rebuilds the PDF fonts in public/fonts/pdf/ (see below)
  generate-icons.mjs    # Rebuilds the raster app icons from src/app/icon.svg
e2e/                    # Browser tests (Playwright), their fixture characters and the known issues they pass over
```

The app icon is drawn in `src/app/icon.svg`. After changing it, run `node scripts/generate-icons.mjs` to rebuild `src/app/favicon.ico` (16, 32 and 48 px) and `src/app/apple-icon.png` (180 px, for iOS home screens) from it, and commit all three. Next.js adds the `<link>` tags for them automatically.

## PDF Fonts

The "Download PDF" export draws the sheet with fonts from `public/fonts/pdf/`, which the browser fetches only when a sheet is exported:

| File | Covers | Size | Fetched |
|------|--------|------|---------|
| `NotoSans-Regular`, `NotoSans-Bold`, `NotoSans-Italic`, `NotoSerif-Bold` | Latin (incl. Latin Extended and Vietnamese), Greek (incl. polytonic), Cyrillic | 0.78 MB together | on every export |
| `NotoSansSymbols` | Symbols players write in notes: check boxes, check and cross marks, stars, card suits, dice, music, sun and moon, arrows... | 38 KB | on every export |
| `NotoSansCJK-Hangul` | Korean Hangul | 1.2 MB | only for sheets with Korean text |
| `NotoSansCJK-HanKana` | Japanese kana and the Han characters of JIS X 0208, GB 2312, Big5 level 1 and KS X 1001, plus variant kanji common in Japanese names | 2.5 MB | only for sheets with Japanese or Chinese text |

Each file is named after its content (`NotoSans-Regular.<hash>.ttf`), and `next.config.ts` lets browsers cache these files for a year, so each one is downloaded once. The script writes the current names to `src/lib/pdf/font-files.ts`, which the app imports.

They are subsets of [Noto Sans, Noto Serif](https://github.com/notofonts/latin-greek-cyrillic) 2.015, [Noto Sans Symbols and Symbols 2](https://github.com/notofonts/symbols) 2.003 and 2.008 (merged into one font, with Noto Sans's "…") and [Noto Sans CJK](https://github.com/notofonts/noto-cjk) 2.004, licensed under the SIL Open Font License 1.1 (`public/fonts/pdf/LICENSE-*.txt`). Emoji such as 🔥 are left out (a symbol such as ❤ prints, even when written as the emoji ❤️), and letters from scripts the fonts don't cover (Arabic, Hebrew, Devanagari, Thai...) print as `?`.

To rebuild them (for example to cover more characters), edit and run the script. It downloads the pinned releases, checks their SHA-256 and writes the subsets; with the same fontTools version the output is byte-identical:

```bash
pip install 'fonttools==4.63.0'
python3 scripts/build-pdf-fonts.py          # rebuild public/fonts/pdf/ and src/lib/pdf/font-files.ts
python3 scripts/build-pdf-fonts.py --check  # verify the committed files are up to date
```

## Patched Dependencies

`patches/` holds fixes to react-pdf's PDF export, which [patch-package](https://github.com/ds300/patch-package) applies after every `npm install` and `npm ci` (the `postinstall` script):

- `@react-pdf/textkit`: text cut off at its line limit (`maxLines`) ends in "…", also when the cut falls at a line break, which used to drop the rest of the text silently.
- `@react-pdf/textkit` and `@react-pdf/render`: accents that the font moves over their letter (a letter followed by a combining mark, as in n + U+0308) are drawn over it, raised over a capital, instead of after it.

After upgrading `@react-pdf/renderer`, check whether the new versions still need them. A patch that no longer applies fails the install, locally as well as in CI and on Vercel (`--error-on-fail`), and patch-package warns when a package's version has changed. To change a patch, edit the package in `node_modules/` and run `npx patch-package <package name>`.

A changed patch only applies to a fresh copy of its package, so reinstall with `npm ci`, which starts from an empty `node_modules`, rather than `npm install`. Vercel does the same (`installCommand` in `vercel.json`): its build cache keeps `node_modules`, with the old patches applied, from one build to the next.

## Disclaimer

Dolmenwood is a trademark of [Necrotic Gnome](https://necroticgnome.com/). This is an unofficial fan project and is not affiliated with or endorsed by Necrotic Gnome. Game content is used for personal/fan use only.

The source code for this application is licensed under the [MIT License](LICENSE).
