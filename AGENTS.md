# Agent Instructions for Dolmenwood Character Sheet

## Before Modifying Game Logic

**Always** read the relevant `docs/rules/*.md` file before changing any game mechanics, data tables, or derived stat calculations. These files document the exact rules from the Dolmenwood Player's Book (201 pages) and serve as the source of truth for implementation.

> **Note**: `docs/rules/` is **gitignored** because it contains copyrighted content from Necrotic Gnome's Dolmenwood Player's Book. These files exist only on local machines and must never be committed. If they are missing, regenerate them from the source PDF using Claude Code (ask it to extract rules from the PDF into the 9 documented file slots below). The source PDF and its text extraction live in `source_materials/` (also gitignored).

If the docs are ambiguous or incomplete, cross-reference the source PDF at `source_materials/Dolmenwood_Player_s_Book.pdf` (gitignored, may not be available in all environments). A text extraction is also available at `source_materials/Dolmenwood_Player_s_Book.txt`.

## Rule Docs to Source File Map

| Rule Doc | Governs These Source Files |
|----------|---------------------------|
| `docs/rules/01-character-creation.md` | `src/lib/gamedata.ts` (modifiers, XP), `src/lib/types.ts` (Character interface), `src/components/CharacterInfo.tsx`, `src/components/AbilityScores.tsx` |
| `docs/rules/02-kindreds.md` | `src/lib/gamedata.ts` (KINDREDS, KINDRED_CLASS_RESTRICTIONS), `src/components/CharacterInfo.tsx` |
| `docs/rules/03-classes.md` | `src/lib/gamedata.ts` (CLASSES, advancement tables), `src/components/CombatStats.tsx`, `src/components/AbilityScores.tsx` |
| `docs/rules/04-kindred-classes.md` | `src/lib/gamedata.ts` (kindred-class advancement tables), `src/components/CombatStats.tsx` |
| `docs/rules/05-magic.md` | `src/lib/gamedata.ts` (spell data), `src/components/SpellsAndMagic.tsx` |
| `docs/rules/06-equipment.md` | `src/lib/gamedata.ts` (ARMOUR_TABLE, WEAPONS_TABLE, ADVENTURING_GEAR), `src/components/Inventory.tsx` |
| `docs/rules/07-combat.md` | `src/components/CombatStats.tsx`, `src/lib/gamedata.ts` (attack modifiers) |
| `docs/rules/08-adventuring.md` | `src/components/Inventory.tsx` (encumbrance), `src/components/CombatStats.tsx` (speed), `src/components/Calendar.tsx` |
| `docs/rules/09-appendices.md` | `src/lib/gamedata.ts` (MONTHS, FESTIVALS, calendar), `src/components/Calendar.tsx`, `src/components/ReferencePanel.tsx` |

## Validation Rules

When modifying game data, always verify:

1. **Advancement tables**: XP thresholds, HP dice, Attack bonuses, and all 5 Save targets must match the rulebook exactly for all 15 levels
2. **Kindred-class restrictions**: Cross-reference `02-kindreds.md` and `03-classes.md` -- some kindreds cannot take certain classes (e.g., Elves/Grimalkins/Woodgrues cannot be Clerics or Friars)
3. **Ability modifier table**: Must use the exact 3-18 mapping from `01-character-creation.md`
4. **Spell counts**: 72 arcane spells (12 per rank x 6 ranks), 34 holy spells (8+8+6+6+6), 20 glamours, 18 runes (6 lesser + 6 greater + 6 mighty), 6 mossling knacks
5. **Kindred-class vs standard class**: Kindred-classes (Breggle, Elf, Grimalkin, Mossling, Woodgrue) have their own separate advancement tables distinct from the 9 standard classes. A character uses EITHER a standard class table OR their kindred-class table, never both
6. **Equipment prices and weights**: Must match `06-equipment.md` exactly -- weights are in coins (10 coins = 1 pound)
7. **Save categories**: There are exactly 5 -- Doom, Ray, Hold, Blast, Spell. Some class tables use slightly different column names but map to these 5

## Code Conventions

- **Tech stack**: Next.js 15, TypeScript, Tailwind CSS v4 (utility classes only, no `@apply`)
- **State management**: React hooks + localStorage persistence via `src/hooks/useCharacter.ts`
- **No external UI libraries**: All components are custom
- **Theme**: Dark fantasy -- see `MEMORY.md` for exact color values
- **Types**: All game interfaces live in `src/lib/types.ts`
- **Game data**: All static game data lives in `src/lib/gamedata.ts`

## Deployment Phases

See `docs/DEPLOYMENT-PHASES.md` for the ordered feature implementation plan. Work on phases sequentially -- later phases depend on earlier ones being correct.
