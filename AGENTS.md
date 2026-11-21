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
| `docs/rules/06-equipment.md` | `src/lib/gamedata.ts` (ARMOUR_TABLE, WEAPONS_TABLE, ADVENTURING_GEAR, LIGHT_SOURCE_TYPES), `src/components/Inventory.tsx`, `src/components/Adventuring.tsx` (light tracker) |
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
- Migrations run on load (`load()` in `src/lib/storage.ts`, one character at a time) and on import (`parseImportedCharacters()`)
- Migrated data is persisted back to localStorage immediately (best-effort) so migration only runs once
- **A migration must never throw.** If one does, that character is *set aside*: it stays in the saved list unchanged (re-serialized from the parsed value; identical for anything Dolmen Spot wrote), every save keeps it there, and the next load tries it again, so once the migration is fixed the character comes back. It is also copied to a `dolmenwood-recovery-*` backup the player can download. Until then the player can't open that character, so treat a throw as a bug.
- **A character saved by a newer schema is left alone.** One whose finite numeric `schemaVersion` is above `CURRENT_SCHEMA_VERSION` (saved by a newer release, e.g. before a rollback) isn't migrated or reconciled: it's set aside unchanged (re-serialized from the parsed value; identical for anything Dolmen Spot wrote), and opens again once a release with that schema is deployed. Import refuses such files. This is what makes a schema bump safe to roll back, to any release that has the guard. A `schemaVersion` saved as a string of digits, an old quirk, counts as its number up to `CURRENT_SCHEMA_VERSION`, here as in `migrateCharacter` (both read it with `readSchemaVersion`): `"10"` is migrated from version 10. No release has saved a string, so digits above it aren't from a newer release (the old loop made `"10"` into `"101"`), and such a character opens as it always did.
- All reads and writes of saved characters go through `src/lib/storage.ts`. It never overwrites saved data it couldn't read (an unreadable whole value, or an entry that can never load, is removed only after a verified backup; a character nested more than 100 levels deep, measured from itself on load, import and in backups, is one of those), and before each save it checks that no other tab has saved since this tab last read or wrote. If another has, it stops saving rather than overwrite that tab's work. Two tabs can still disagree, though: the other tab's changes only show up after a reload.

### Testing migrations:

- Add a scenario to the relevant `src/lib/*.test.ts` file (the hex map's are in `src/lib/map-migration.test.ts`) and run `npm test`, which runs every `src/lib/*.test.ts` file with Node's test runner (via `tsx`). CI runs it on every PR. `src/lib/migrations.test.ts` also fails if `CURRENT_SCHEMA_VERSION` isn't one more than the last migration's version, which catches a bump lost when two branches that each add a migration merge
- How loading treats migrations (one character at a time, a throwing migration setting that character aside) is tested in `src/lib/storage.test.ts`, against a fake localStorage. Its "set aside ... come back once it is fixed" tests show the pattern for a migration that throws
- Manually test with a character JSON that has no `schemaVersion` (simulates legacy data)
- Test import/export round-trip with old-format files
- Verify `npm run build` passes after any schema change

## Code Conventions

- **Tech stack**: Next.js 16, TypeScript, Tailwind CSS v4 (utility classes only, no `@apply`)
- **ESLint 10 overrides**: The `overrides` in `package.json` let eslint-plugin-import, eslint-plugin-jsx-a11y and eslint-plugin-react (from eslint-config-next) use ESLint 10 before their peer ranges allow it. Remove an entry once the version eslint-config-next installs accepts ESLint 10: delete the entry, run `npm update <plugin>`, then check that `npm ci` prints no ERESOLVE warning and `npm ls --all` exits 0
- **Patched dependencies**: `patches/` holds fixes to `@react-pdf/textkit` and `@react-pdf/render`, which patch-package applies after every `npm install` and `npm ci` (the `postinstall` script). A patch that no longer applies fails the install, locally as well as in CI and on Vercel (`--error-on-fail`). When upgrading `@react-pdf/renderer` or changing a patch, follow the README's "Patched Dependencies" section. A changed patch only applies to a fresh copy of its package, so reinstall with `npm ci` rather than `npm install`; Vercel does the same (`installCommand` in `vercel.json`)
- **State management**: React hooks + localStorage persistence via `src/hooks/useCharacter.ts`
- **No external UI libraries**: All components are custom
- **Theme**: Dark fantasy -- base background `#1a1a2e`, cards `#2a2a3e`, text `#f5e6c8`, gold accent `#c4a35a`, warm-brown borders `#5a3a28`, written as arbitrary-value classes (e.g. `bg-[#2a2a3e]`)
- **Types**: All game interfaces live in `src/lib/types.ts`
- **Game data**: All static game data lives in `src/lib/gamedata.ts`, except the hex-map manifest `src/lib/hex-grid.json`. It is generated from the printed map by `scripts/extract_hex_grid.py` (don't edit it by hand) and loaded through `src/lib/hex-grid.ts`; its types are in `types.ts` like the rest

## Pre-commit Hook & CI

Next.js 16's `next build` no longer lints, so these checks do instead:

- **Pre-commit hook** (husky + lint-staged; the checks are in `lint-staged.config.mjs`, the flags in `.husky/pre-commit`):
  - ESLint on staged `.js`/`.jsx`/`.mjs`/`.cjs`/`.ts`/`.tsx`/`.mts`/`.cts` files.
  - `npm run typecheck` (`next typegen && tsc --noEmit`, whole project) when a `.ts`/`.tsx` file, `tsconfig.json`, `package.json` or `package-lock.json` is staged. Deleting a file counts as staging it.
  - Errors block the commit; warnings are printed but don't block. Nothing is auto-fixed.
- **CI** (`.github/workflows/ci.yml`) on every PR and every push to `main`: `npm run lint`, `npm run typecheck`, `npm test` and `npm run check:msal-bridge`.
  - The MSAL check fails if `public/msal-redirect-bridge.min.js` (loaded by OneDrive sign-in) no longer matches the redirect bridge in the installed `@azure/msal-browser`.
  - After updating MSAL, run `npm run check:msal-bridge`, then the `cp` command it prints.

How the hook works, and what that means for you:

- **Every worktree runs the main checkout's hook.** `core.hooksPath` lives in the `.git/config` that all worktrees share, and Claude Code pins it to `<main checkout>/.husky/_`. `npm ci` in the main checkout (the `prepare` script, `.husky/install.mjs`) writes that same path; in a worktree it leaves the setting alone.
- **The hook is active only once the main checkout is on a commit that has `.husky/pre-commit` and has run `npm ci`.** Until then, commits anywhere skip it. Run `npm ci` in the main checkout after pulling.
- **A worktree's own `npm ci` doesn't install the hook.** It installs the tools the hook runs (lint-staged, ESLint, TypeScript) along with every other dependency. Run it in every new worktree; without it, commits fail with `lint-staged: not found`.
- **Editing `.husky/pre-commit` has no effect until the change reaches the main checkout.** `lint-staged.config.mjs` is read from the committing worktree, so changes there apply right away.
- **Moving the repo directory makes the absolute hooks path stale.** Re-run `npm ci` in the main checkout to fix it.
- **The typecheck sees the working tree, not just what's staged.** Unstaged and untracked `.ts`/`.tsx` changes count; so does a file you `git rm --cached` but leave on disk. Fix or commit them; don't stash them, because the stash is shared by every worktree. CI checks the exact commit.
- **lint-staged's "Skipping backup because `--no-stash` was used" warning is expected.** Its backup would go on that same shared stash stack.
- **If the hook fails because a tracked file changed while it ran** (`--fail-on-changes`), nothing was reverted. Ignore lint-staged's advice to restore from a stash (`git apply --index <hash>`); with `--no-stash` there isn't one. Check `git status`, then commit again.
- **Commits that git makes for you skip the hook.** That covers a conflict-free `git merge` (`--no-ff` too), `git cherry-pick`, `git revert` and `git rebase`. When you finish a conflict yourself, with `git commit` or with `git merge --continue`, `git cherry-pick --continue` or `git revert --continue`, the hook runs. The exception is `git rebase --continue`, which never runs it. CI is the check for everything the hook skips.
- **Don't bypass the hook with `git commit --no-verify`.** Fix the errors instead, since CI fails on them anyway.

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
3. If any of them has player-facing changes: on a `chore/release-YYYY-MM-DD` branch from `origin/main`, add **one** entry at the top of `ENTRIES` in `src/app/changelog/page.tsx` (see Changelog below), run `npm run build`, and open a PR into `main`. Wait for it to merge; its CI must pass first. (Don't name the branch `release/...` — git can't have both a `release` branch and `release/*` branches.) Before it merges (when the user is ready to merge it, or before you merge it if asked to), re-run step 1: read anything new, and if it's player-facing, add it to the entry while the PR is still open. Push `release` (step 4) the day it merges; that day is the entry's `date`. If the push slips past it, update `date` first (in the PR, or in a follow-up PR if it has merged).
4. Fast-forward production to the merge commit of the release PR (or of its latest follow-up PR, if one amended the entry), **not** to `origin/main`: anything merged into `main` after it would ship without review or a changelog entry. Right before pushing, run this check, with `<n>` being that PR's number. Each block sets `sha` itself and stops if it comes back empty, which happens when the PR hasn't merged or `<n>` is wrong; an empty `sha` would turn the push into a deletion of `release`.

   ```bash
   git fetch origin
   sha=$(gh pr view <n> --json mergeCommit -q .mergeCommit.oid) && test -n "$sha" &&
     git log --first-parent --oneline "origin/release..$sha" &&
     gh api "repos/TheBeege/dolmen-spot/commits/$sha/check-runs" --jq '.check_runs[] | select(.name == "Lint and typecheck") | "CI: \(.name): \(.status) \(.conclusion)"'
   ```

   Check what it prints:

   - **First line:** it must be the merge commit of your release PR (or of its latest follow-up). If its subject doesn't name a PR (a custom merge subject, or a rebase merge), look the PR up as in step 1. If it's another PR, stop: `<n>` is wrong.
   - **No commits listed:** stop. `<n>` is wrong, the PR hasn't merged (the guard then stops before `git log`), or that commit is already on `release`.
   - **Other commits:** you must already have read each one, in step 2, step 3's re-run, or an earlier run of this check (this release's own changelog PRs excepted). If one is new, stop and read it as in step 2. If it's player-facing and not yet in the entry, or the entry's `date` is now wrong, amend this release's existing entry in a follow-up PR into `main` (never add a second entry), wait for it to merge, and repeat this step with that PR as `<n>`.
   - **CI:** the `CI:` line is the result of CI's `Lint and typecheck` job on that exact commit, from its push to `main` (the check leaves out other apps' check runs, such as Vercel's), and must read `CI: Lint and typecheck: completed success`. If it's missing or not yet `completed`, wait a few minutes and re-run the check. If CI failed, or never reports, stop and tell the user.

   If all of that holds, push:

   ```bash
   sha=$(gh pr view <n> --json mergeCommit -q .mergeCommit.oid) && test -n "$sha" && git push origin "$sha:refs/heads/release"
   ```

   If there's no release PR (no player-facing changes), use `sha=<the newest commit step 1 listed>` in place of the `gh pr view` call in both blocks; the check's first line must then be that commit. If git rejects the push as non-fast-forward, `release` has diverged (see Hotfixes). Never force it; the ruleset above rejects force-pushes anyway.
5. Verify that the newest production deployment is for the commit you pushed and has succeeded and, if this release has a changelog entry, that https://www.dolmen.spot/changelog shows it. Check the deployment with either:
   - Vercel MCP `list_deployments` with `projectId: "dolmenwood-character-sheet-owl"`, `slug: "beeges-projects"`, `target: "production"`, `limit: 1` (without `projectId` it lists the team's other projects too). Its `meta.githubCommitSha` must be the pushed commit and its `state` `READY`.
   - `gh api 'repos/TheBeege/dolmen-spot/deployments?environment=Production&per_page=1' --jq '.[0] | "\(.id) \(.sha)"'`, which prints the newest production deployment's id and commit. The commit must be the one you pushed. Deployments have no state of their own, so then check its status: `gh api repos/TheBeege/dolmen-spot/deployments/<id>/statuses --jq '.[0].state'` must print `success`. Vercel has only ever created these records after a successful build, so this route shows the previous release until the build succeeds, and may not show a failed build at all.

   If no production deployment for the pushed commit appears within about 10 minutes, check Vercel directly: `list_deployments` with `sha: "<pushed sha>"` (plus `projectId` and `slug`) lists that commit's deployments, failed ones included, and the production one has `target: "production"`. Without the Vercel MCP, `gh api repos/TheBeege/dolmen-spot/commits/<sha>/status --jq '.statuses[] | "\(.context): \(.state) \(.target_url)"'` links to the commit's latest Vercel build, which may still be its preview build from `main`. If no production deployment was triggered, or it failed, stop and tell the user. Don't redeploy or promote anything yourself.

### Hotfixes

If `main` holds nothing you'd mind shipping, land the fix on `main` and cut a normal release. Otherwise, branch from `origin/release` and PR the fix (plus its changelog entry, since a hotfix is a release) into `release`; its CI must pass before it merges, since merging it deploys. (A PR into `release` gets no CI run until a release has put `.github/workflows/ci.yml` on `release`; before that, `git ls-tree origin/release .github/workflows/ci.yml` prints nothing. Until then, run `npm run lint` and `npm run build` on the branch yourself and tell the user the results. A `release` from before CI has no `typecheck` script, but its `next build` typechecks.) Then merge `release` back into `main` so the next release fast-forwards again: open a PR into `main` from a new branch cut at `origin/release` (not from `release` itself, where resolving a conflict would commit `main` into `release` and deploy it). That PR must be merged with a merge commit (`gh pr merge <n> --merge`), never squashed or rebased: either of those copies the hotfix into new commits, so `release` stops being an ancestor of `main` and the next release can't fast-forward.

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
