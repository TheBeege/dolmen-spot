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

## Data Migration Rules

Character data is stored in localStorage and must survive schema changes across deployment phases. The migration system lives in `src/lib/migrations.ts`.

### When modifying the `Character` interface (`src/lib/types.ts`):

1. **Adding a field**: Bump `CURRENT_SCHEMA_VERSION` in `migrations.ts`, add a migration that sets the default value, and add the field to `createDefaultCharacter()` in `gamedata.ts`
2. **Changing a field type/shape**: Bump version, write a migration that transforms old data to the new shape
3. **Removing a field**: Bump version, write a migration that deletes the old field
4. **Renaming a field**: Bump version, write a migration that copies the old key to the new key and deletes the old key
5. **Never** change a field's meaning without a migration
6. **Never** assume a field exists on loaded data -- the migration + reconciliation handles missing fields, but be defensive in components

### When modifying nested interfaces (`InventoryItem`, `SpellSlot`, `JournalEntry`, etc.):

- Same rules apply -- these are embedded in `Character` and need migrations too
- Array fields need migrations that map over each element

### How migrations work:

- Each migration transforms from version N to N+1 (sequential)
- After all migrations run, `reconcileWithDefaults()` deep-merges saved data over a fresh `createDefaultCharacter()` to fill any missing fields
- Migrations run on load (`loadCharacters()`) and import (`importCharacter()`)
- Migrated data is persisted back to localStorage immediately so migration only runs once

### Testing migrations:

- Manually test with a character JSON that has no `schemaVersion` (simulates legacy data)
- Test import/export round-trip with old-format files
- Verify `npm run build` passes after any schema change

## Code Conventions

- **Tech stack**: Next.js 16, TypeScript, Tailwind CSS v4 (utility classes only, no `@apply`)
- **ESLint 10 overrides**: The `overrides` in `package.json` let eslint-plugin-import, eslint-plugin-jsx-a11y and eslint-plugin-react (from eslint-config-next) use ESLint 10 before their peer ranges allow it. Remove an entry once the version eslint-config-next installs accepts ESLint 10: delete the entry, run `npm update <plugin>`, then check that `npm ci` prints no ERESOLVE warning and `npm ls --all` exits 0
- **State management**: React hooks + localStorage persistence via `src/hooks/useCharacter.ts`
- **No external UI libraries**: All components are custom
- **Theme**: Dark fantasy -- see `MEMORY.md` for exact color values
- **Types**: All game interfaces live in `src/lib/types.ts`
- **Game data**: All static game data lives in `src/lib/gamedata.ts`

## Releases & Deployment

Production is https://dolmen.spot: the Vercel project `dolmenwood-character-sheet-owl` (team `beeges-projects`), deployed by Vercel's Git integration. **Merging a PR into `main` does not ship it to players.** Changes collect on `main` and go live together when a release is cut, so each release gets one coherent changelog entry.

| Branch | Role | Vercel deploys it to |
|--------|------|----------------------|
| PR branches | Work in progress. PRs target `main`. | Preview (per commit) |
| `main` | Integration / staging | Preview, at the stable URL `dolmenwood-character-sheet-owl-git-main-beeges-projects.vercel.app` (Vercel login required) |
| `release` | What players have | **Production** (dolmen.spot) |

- `release` only ever **fast-forwards** to `main`. Never commit to it directly, merge PRs into it (except hotfixes, below), or force-push it.
- Cut a release only when the user asks for one.
- Never deploy to production from a local checkout (`vercel --prod`). Production deploys come only from pushes to `release`.

### Cutting a release

1. `git fetch origin`, then list what's unreleased: `git log --first-parent --oneline origin/release..origin/main`. Each merge commit names its PR.
2. Read the **Player-facing changes** section of each of those PRs (`gh pr view <n>`).
3. If any PR has player-facing changes: on a `chore/release-YYYY-MM-DD` branch from `origin/main`, add **one** entry at the top of `ENTRIES` in `src/app/changelog/page.tsx` (see Changelog below), run `npm run build`, and open a PR into `main`. Wait for it to merge. (Don't name the branch `release/...` — git can't have both a `release` branch and `release/*` branches.)
4. Fast-forward production: `git fetch origin && git push origin origin/main:release`. If git rejects this as non-fast-forward, `release` has diverged (see Hotfixes). Never force it.
5. Verify that the newest production deployment is the new `release` commit and is `READY` (Vercel MCP `list_deployments` with `target: "production"`, or `gh api 'repos/TheBeege/dolmen-spot/deployments?environment=Production&per_page=1'`), and that https://dolmen.spot/changelog shows the entry.

### Hotfixes

If `main` holds nothing you'd mind shipping, land the fix on `main` and cut a normal release. Otherwise, branch from `origin/release` and PR the fix (plus its changelog entry, since a hotfix is a release) into `release`; merging it deploys. Then merge `release` back into `main` so the next release fast-forwards again.

## Changelog

The player-facing changelog lives at `src/app/changelog/page.tsx` and is shown at `/changelog`. **Entries are written when a release is cut, not in feature PRs**: one entry per release, covering every user-facing PR in it.

### In feature PRs

- **Don't edit `src/app/changelog/page.tsx`.**
- Add a `## Player-facing changes` section to the PR description: bullets written by the rules below, or `None` for internal-only changes. These are the raw material for the release entry, so keep them current if the PR's scope changes.

### Writing the release entry

1. **Player perspective, not developer perspective.** Describe what the player will see or be able to do — not what code or files changed. Compare:
   - Bad: "Refactored `addDays` to use absolute-day arithmetic"
   - Good: "Long spell studies no longer silently rewind when the calendar crosses a year."
2. **`date`** is the day the release goes live (`YYYY-MM-DD`).
3. **`title`** names the release as a whole (e.g. "Rebuilt hex map", "Map fixes and spell polish"), not one PR.
4. **`prNumbers`** lists the user-facing PRs in the release.
5. **Shape:** a single-topic release uses a flat `changes` list; a multi-feature release uses `sections`, one per feature, each with a short `heading`.
6. **Curate, don't concatenate.** Merge overlapping notes, and drop anything introduced and fixed within the same release — players never saw it.
7. **Skip purely internal changes** — refactors, lint fixes, migrations with no behavior change, doc-only changes, and dev tooling. A release with no player-facing changes gets no entry.
8. **Released entries are history.** Only edit them to fix factual errors.

## Deployment Phases

See `docs/DEPLOYMENT-PHASES.md` for the ordered feature implementation plan. Work on phases sequentially -- later phases depend on earlier ones being correct.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
