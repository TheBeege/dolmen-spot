// Smoke tests: the app loads and keeps characters, every tab renders, and
// characters can be made, switched, exported and imported. Every test also
// fails on page errors and console errors (see e2e/support/test.ts).
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { Character } from '../src/lib/types';
import { ALL_FIXTURES, FIXTURES, loadFixture, openApp, openTab, savedCharacters, TABS } from './support/app';
import { keyPathDiff, keyPaths } from './support/keys';
import { expect, test } from './support/test';

/** What the app should have saved for a fixture: the same character, at the current schema version. */
function asSaved(fixture: Character) {
  return { ...fixture, schemaVersion: expect.any(Number) };
}

/**
 * The fixture's field paths, without `schemaVersion`: the comparison above
 * accepts any version there, a migration having raised it, so comparing the
 * key's presence here as well would ask for more than that check does.
 */
function fieldsOf(character: object) {
  return keyPaths(character).filter((path) => path !== 'schemaVersion');
}

/** The header button that shows the open character and opens the list of characters. */
function characterSwitcher(page: Page) {
  return page.locator('header').getByRole('button').first();
}

/** A character's row in the list of characters. */
function characterRow(page: Page, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page.locator('header').getByRole('button', { name: new RegExp(`^${escaped} .*Lv\\.\\d+$`) });
}

test('a first visit starts a new character', async ({ page }) => {
  await openApp(page);
  await expect(characterSwitcher(page)).toContainText('New Adventurer');
  // The default fixture is what the app makes for a new player.
  const fresh = { ...asSaved(loadFixture(FIXTURES.default)), id: expect.any(String) };
  await expect.poll(async () => (await savedCharacters(page)).characters).toMatchObject([fresh]);
});

for (const fixture of ALL_FIXTURES) {
  test(`every tab renders, with the ${fixture} character`, async ({ page }) => {
    const character = await openApp(page, fixture);
    await expect(page).toHaveTitle(/Dolmen Spot/);
    await expect(characterSwitcher(page)).toContainText(character.name);
    // Loading it changed nothing: the fixture is a current character.
    await expect.poll(async () => (await savedCharacters(page)).characters).toMatchObject([asSaved(character)]);
    // toMatchObject is a subset match, and load reconciles a character over the
    // defaults: a fixture that had lost a field (a nested one included) would be
    // filled back in and still pass. So the saved copy must have exactly the
    // fixture's fields, at every depth, and the failure names the paths that
    // went missing or came back.
    await expect
      .poll(
        async () => {
          const saved = (await savedCharacters(page)).characters[0] ?? {};
          return keyPathDiff(fieldsOf(character), fieldsOf(saved));
        },
        { message: `the saved ${fixture} character has the fixture's fields, at every depth` },
      )
      .toEqual({ missing: [], extra: [] });
    for (const tab of TABS) {
      await openTab(page, tab);
      await expect(page.locator('main').locator('h2, h3').first(), `${tab.label} shows its sections`).toBeVisible();
    }
  });
}

test('characters can be made and switched', async ({ page }) => {
  const character = await openApp(page, FIXTURES.kitchenSink);

  await characterSwitcher(page).click();
  await page.locator('header').getByRole('button', { name: '+ New' }).click();
  await expect(characterSwitcher(page)).toContainText('New Adventurer');
  await expect.poll(async () => (await savedCharacters(page)).characters.map((c) => c.name)).toEqual([character.name, 'New Adventurer']);

  await characterSwitcher(page).click();
  await characterRow(page, character.name).click();
  await expect(characterSwitcher(page)).toContainText(character.name);
  await expect.poll(async () => (await savedCharacters(page)).activeId).toBe(character.id);

  // Both are kept, and the one last open opens again.
  await page.reload();
  await expect(characterSwitcher(page)).toContainText(character.name);
  await characterSwitcher(page).click();
  await expect(characterRow(page, 'New Adventurer')).toBeVisible();
});

test('a character exported to a file imports as a copy', async ({ page }) => {
  await openApp(page, FIXTURES.kitchenSink);
  const [saved] = (await savedCharacters(page)).characters;
  const dialog = page.getByRole('dialog', { name: 'Save / Load Character' });

  await page.getByRole('button', { name: /^Save \/ Load/ }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Export Character' }).click()]);
  // Named after the character (WebKit swaps the spaces for underscores).
  expect(download.suggestedFilename()).toMatch(/^Wendeline.Ashgrove-Thistlecombe\.dolmenwood\.json$/);
  const file = await download.path();
  const exported: Character = JSON.parse(await readFile(file, 'utf8'));
  expect(exported).toEqual(saved);

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), dialog.getByRole('button', { name: 'Import Character' }).click()]);
  await chooser.setFiles(file);
  await expect(dialog).toBeHidden();

  // A second character, the same but for its id, and it's the one open now.
  await expect.poll(async () => (await savedCharacters(page)).characters).toHaveLength(2);
  const { characters, activeId } = await savedCharacters(page);
  const copy = characters[1];
  expect(copy.id).not.toBe(saved.id);
  expect(activeId).toBe(copy.id);
  expect({ ...copy, id: saved.id }).toEqual(saved);
});
