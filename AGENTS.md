# Agent Instructions for Dolmenwood Character Sheet

## Before Modifying Game Logic

**Always** read the relevant `docs/rules/*.md` file before changing any game mechanics, data tables, or derived stat calculations. These files document the exact rules from the Dolmenwood Player's Book (201 pages) and serve as the source of truth for implementation.

> **Note**: `docs/rules/` is **gitignored** because it contains copyrighted content from Necrotic Gnome's Dolmenwood Player's Book. These files exist only on local machines and must never be committed. If they are missing, regenerate them from the source PDF using Claude Code (ask it to extract rules from the PDF into the 9 documented file slots below). The source PDF and its text extraction live in `source_materials/` (also gitignored).

If the docs are ambiguous or incomplete, cross-reference the source PDF at `source_materials/Dolmenwood_Player_s_Book.pdf` (gitignored, may not be available in all environments). A text extraction is also available at `source_materials/Dolmenwood_Player_s_Book.txt`.

## Rule Docs to Source File Map

| Rule Doc | Governs These Source Files |
|----------|---------------------------|
| `docs/rules/01-character-creation.md` | `src/lib/gamedata.ts` (modifiers, XP), `src/lib/types.ts` (Character interface), `src/lib/character-sheet.ts` (ability-score notes, languages, retainer limits), `src/components/CharacterInfo.tsx`, `src/components/AbilityScores.tsx` |
| `docs/rules/02-kindreds.md` | `src/lib/gamedata.ts` (KINDREDS, KINDRED_CLASS_RESTRICTIONS), `src/lib/character-sheet.ts` (Mad Revelry), `src/components/CharacterInfo.tsx` |
| `docs/rules/03-classes.md` | `src/lib/gamedata.ts` (CLASSES, advancement tables), `src/lib/character-sheet.ts` (calculated attack bonus, skill layout, and the Turning the Undead, Trophies, Code of Chivalry and Resistance to Divine Aid feature notes), `src/components/CombatStats.tsx`, `src/components/AbilityScores.tsx` |
| `docs/rules/04-kindred-classes.md` | `src/lib/gamedata.ts` (kindred-class advancement tables), `src/lib/character-sheet.ts` (calculated attack bonus, skill layout, Breggle arcane magic from Level 4, daily uses of Gaze, Mad Revelry and Fungal Symbiosis, and the Fungal Symbiosis and Resistance to Divine Aid feature notes), `src/components/CombatStats.tsx` |
| `docs/rules/05-magic.md` | `src/lib/gamedata.ts` (spell data), `src/lib/character-sheet.ts` (prepared spells per rank, spell books and scrolls), `src/components/SpellsAndMagic.tsx` |
| `docs/rules/06-equipment.md` | `src/lib/gamedata.ts` (ARMOUR_TABLE, WEAPONS_TABLE, ADVENTURING_GEAR), `src/components/Inventory.tsx` |
| `docs/rules/07-combat.md` | `src/components/CombatStats.tsx`, `src/lib/gamedata.ts` (attack modifiers), `src/lib/character-sheet.ts` (calculated attack bonus, save categories) |
| `docs/rules/08-adventuring.md` | `src/lib/gamedata.ts` (speed tables, coin slots, adventuring tables such as TERRAIN_TABLE and SLEEP_MATRIX), `src/lib/character-sheet.ts` (encumbrance totals, slot and load limits, choice of speed table), `src/components/Inventory.tsx` (encumbrance), `src/components/Adventuring.tsx` (travel, camping, hunger and condition trackers) |
| `docs/rules/09-appendices.md` | `src/lib/gamedata.ts` (MONTHS, FESTIVALS, calendar), `src/components/Adventuring.tsx` (calendar UI), `src/components/ReferencePanel.tsx` |

`src/lib/pdf/CharacterSheetDocument.tsx`, the printable PDF sheet, prints content from every rule doc above. It reads its values from `gamedata.ts` and `character-sheet.ts`, but it lays out each section itself and hard-codes a few rules notes (such as the Hunter's +1 missile attack), so when a rules change alters what a tab shows, check the PDF as well.

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

1. **Adding a field**: Bump `CURRENT_SCHEMA_VERSION` in `migrations.ts`, add a migration that sets the default value, and add the field to `createDefaultCharacter()` in `gamedata.ts`. If the field should appear on the printable sheet, also add it to `src/lib/pdf/CharacterSheetDocument.tsx`
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
- **State management**: React hooks + localStorage persistence via `src/hooks/useCharacter.ts`
- **No external UI libraries**: All components are custom
- **Theme**: Dark fantasy -- base background `#1a1a2e`, cards `#2a2a3e`, text `#f5e6c8`, gold accent `#c4a35a`, warm-brown borders `#5a3a28`, written as arbitrary-value classes (e.g. `bg-[#2a2a3e]`)
- **Types**: All game interfaces live in `src/lib/types.ts`
- **Game data**: All static game data lives in `src/lib/gamedata.ts`

## Releases & Deployment

Production is https://www.dolmen.spot (the bare `dolmen.spot` redirects there): the Vercel project `dolmenwood-character-sheet-owl` (team `beeges-projects`), deployed by Vercel's Git integration. **Merging a PR into `main` does not ship it to players.** Changes collect on `main` and go live together when a release is cut, so each release gets one coherent changelog entry.

| Branch | Role | Vercel deploys it to |
|--------|------|----------------------|
| PR branches | Work in progress. PRs target `main`. | Preview (per commit) |
| `main` | Integration / staging | Preview, at the stable URL `dolmenwood-character-sheet-owl-git-main-beeges-projects.vercel.app` (Vercel login required) |
| `release` | What players have | **Production** (dolmen.spot) |

- `release` only ever **fast-forwards** to a commit on `main` (hotfixes, below, are the one exception). Never commit to it directly, merge PRs into it (except hotfixes), or force-push it. GitHub enforces the force-push ban: the repository ruleset "Protect release (production)" (id 27715042) rejects force-pushes and deletion of `release` for everyone, admins included. Fast-forward pushes and hotfix PR merges still work. `gh api repos/TheBeege/dolmen-spot/rules/branches/release` lists its rules, `non_fast_forward` and `deletion`.
- Cut a release only when the user asks for one.
- Never deploy to production from a local checkout (`vercel --prod`). Production deploys come only from pushes to `release`.

### Cutting a release

1. `git fetch origin`, then list what's unreleased: `git log --first-parent --oneline origin/release..origin/main`. Most lines are PR merges (`Merge pull request #<n> …`), but a merge can have a custom subject and `main` also takes direct pushes, so for any line that doesn't name its PR, look it up with `gh api repos/TheBeege/dolmen-spot/commits/<sha>/pulls --jq '.[].number'`. No output means the commit was pushed straight to `main`.
2. Read the **Player-facing changes** section of each of those PRs (`gh pr view <n>`), and read each direct commit itself (`git show <sha>`).
3. If any of them has player-facing changes: on a `chore/release-YYYY-MM-DD` branch from `origin/main`, add **one** entry at the top of `ENTRIES` in `src/app/changelog/page.tsx` (see Changelog below), run `npm run build`, and open a PR into `main`. Wait for it to merge. (Don't name the branch `release/...` — git can't have both a `release` branch and `release/*` branches.) Just before it merges, re-run step 1: read anything new, and if it's player-facing, add it to the entry while the PR is still open. Push `release` (step 4) the day it merges; that day is the entry's `date`. If the push slips past it, update `date` first (in the PR, or in a follow-up PR if it has merged).
4. Fast-forward production to the merge commit of the release PR (or of its latest follow-up PR, if one amended the entry), **not** to `origin/main`: anything merged into `main` after it would ship without review or a changelog entry. Right before pushing, run this check, with `<n>` being that PR's number. Each block sets `sha` itself and stops if it comes back empty, which happens when the PR hasn't merged or `<n>` is wrong; an empty `sha` would turn the push into a deletion of `release`.

   ```bash
   git fetch origin
   sha=$(gh pr view <n> --json mergeCommit -q .mergeCommit.oid) && test -n "$sha" && git log --first-parent --oneline "origin/release..$sha"
   ```

   The first line must be the merge commit of your release PR (or of its latest follow-up), naming that PR. If it names another PR, or the check lists no commits, stop: `<n>` is wrong or the PR hasn't merged. You must already have read every other line, in step 2 or an earlier run of this check (this release's own changelog PRs excepted). If any line is new, stop and read it as in step 2. If it's player-facing, or the entry's `date` is now wrong, amend this release's existing entry in a follow-up PR into `main` (never add a second entry), wait for it to merge, and repeat this step with that PR as `<n>`. Otherwise, push:

   ```bash
   sha=$(gh pr view <n> --json mergeCommit -q .mergeCommit.oid) && test -n "$sha" && git push origin "$sha:refs/heads/release"
   ```

   If there's no release PR (no player-facing changes), use `sha=<the newest commit step 1 listed>` in place of the `gh pr view` call in both blocks; the check's first line must then be that commit. If git rejects the push as non-fast-forward, `release` has diverged (see Hotfixes). Never force it; the ruleset above rejects force-pushes anyway.
5. Verify that the newest production deployment is for the commit you pushed and has succeeded and, if this release has a changelog entry, that https://www.dolmen.spot/changelog shows it. Check the deployment with either:
   - Vercel MCP `list_deployments` with `projectId: "dolmenwood-character-sheet-owl"`, `slug: "beeges-projects"`, `target: "production"`, `limit: 1` (without `projectId` it lists the team's other projects too). Its `meta.githubCommitSha` must be the pushed commit and its `state` `READY`.
   - `gh api 'repos/TheBeege/dolmen-spot/deployments?environment=Production&per_page=1' --jq '.[0] | "\(.id) \(.sha)"'`, which prints the newest production deployment's id and commit. The commit must be the one you pushed. Deployments have no state of their own, so then check its status: `gh api repos/TheBeege/dolmen-spot/deployments/<id>/statuses --jq '.[0].state'` must print `success`. Vercel has only ever created these records after a successful build, so this route shows the previous release until the build succeeds, and never shows a failed build.

   If no production deployment for the pushed commit appears within about 10 minutes, check Vercel directly: `list_deployments` with `sha: "<pushed sha>"` (plus `projectId` and `slug`) lists that commit's deployments, failed ones included, and the production one has `target: "production"`. Without the Vercel MCP, `gh api repos/TheBeege/dolmen-spot/commits/<sha>/status --jq '.statuses[] | "\(.context): \(.state) \(.target_url)"'` links to the commit's latest Vercel build, which may still be its preview build from `main`. If no production deployment was triggered, or it failed, stop and tell the user. Don't redeploy or promote anything yourself.

### Hotfixes

If `main` holds nothing you'd mind shipping, land the fix on `main` and cut a normal release. Otherwise, branch from `origin/release` and PR the fix (plus its changelog entry, since a hotfix is a release) into `release`; merging it deploys. Then merge `release` back into `main` so the next release fast-forwards again: open a PR into `main` from a new branch cut at `origin/release` (not from `release` itself, where resolving a conflict would commit `main` into `release` and deploy it). That PR must be merged with a merge commit (`gh pr merge <n> --merge`), never squashed or rebased: either of those copies the hotfix into new commits, so `release` stops being an ancestor of `main` and the next release can't fast-forward.

## Changelog

The player-facing changelog lives at `src/app/changelog/page.tsx` and is shown at `/changelog`. **Entries are written when a release is cut, not in feature PRs**: one entry per release, covering every user-facing PR in it.

### In feature PRs

- **Don't edit `src/app/changelog/page.tsx`.**
- Add a `## Player-facing changes` section to the PR description: bullets written by the rules below, or `None` for internal-only changes. These are the raw material for the release entry, so keep them current if the PR's scope changes.

### Writing the release entry

1. **Player perspective, not developer perspective.** Describe what the player will see or be able to do — not what code or files changed. Compare:
   - Bad: "Refactored `addDays` to use absolute-day arithmetic"
   - Good: "Long spell studies no longer silently rewind when the calendar crosses a year."
2. **`date`** is the day the release goes live (`YYYY-MM-DD`). In a normal release, `release` is pushed the day the release PR merges (step 3); a hotfix deploys as it merges. If the push slips past `date`, update it first: in the PR, or in a follow-up PR if it has merged.
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
