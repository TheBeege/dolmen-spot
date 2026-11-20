# Dolmen Spot — Dolmenwood Character Sheet

A digital character sheet for the [Dolmenwood](https://necroticgnome.com/collections/dolmenwood) tabletop RPG. Track characters, auto-calculate stats, manage inventory, and reference game data — all in the browser.

**Live app:** [dolmen.spot](https://www.dolmen.spot/)

![Screenshot](docs/images/screenshot.png)

## Features

### Character Creation & Management
- Support for all 6 kindreds (Breggle, Elf, Grimalkin, Human, Mossling, Woodgrue) and 9 classes (Bard, Cleric, Enchanter, Fighter, Friar, Hunter, Knight, Magician, Thief)
- Kindred-class combinations with dedicated advancement tables
- Multi-character support with import/export (JSON)
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

### Interactive Hex Map
- Dolmenwood hex map for tracking exploration

### Reference Panels
- Equipment catalog, world lore, consumables, and calendar reference
- Class and kindred feature panels with interactive mechanics (fighter talents, grimalkin forms, etc.)

## Tech Stack

- [Next.js](https://nextjs.org/) 15
- [React](https://react.dev/) 19
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/) v4
- [Lucide React](https://lucide.dev/) icons
- localStorage for persistence (no backend required), with optional Google Drive / OneDrive cloud save

## Getting Started

```bash
git clone https://github.com/TheBeege/dolmen-spot.git
cd dolmen-spot
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

Cloud save is optional. To enable it locally, copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and/or `NEXT_PUBLIC_MICROSOFT_CLIENT_ID`. Without them the app runs on localStorage alone.

## Project Structure

```
src/
  app/          # Next.js app router (sheet, /about, /changelog, layout, global styles)
  components/   # Tab components (CharacterInfo, CombatStats, Inventory, etc.)
  hooks/        # useCharacter (state + localStorage) and useCloudStorage
  lib/          # Types, game data, save migrations, and cloud providers
docs/
  DEPLOYMENT-PHASES.md  # Feature roadmap
  rules/                # Extracted rule reference (gitignored — copyrighted, local only)
scripts/
  generate-icons.mjs    # Rebuilds the raster app icons from src/app/icon.svg
```

The app icon is drawn in `src/app/icon.svg`. After changing it, run `node scripts/generate-icons.mjs` to rebuild `src/app/favicon.ico` (16, 32 and 48 px) and `src/app/apple-icon.png` (180 px, for iOS home screens) from it, and commit all three. Next.js adds the `<link>` tags for them automatically.

## Disclaimer

Dolmenwood is a trademark of [Necrotic Gnome](https://necroticgnome.com/). This is an unofficial fan project and is not affiliated with or endorsed by Necrotic Gnome. Game content is used for personal/fan use only.

The source code for this application is licensed under the [MIT License](LICENSE).
