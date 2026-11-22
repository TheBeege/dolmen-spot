// Smoke tests: the app loads and keeps characters, every tab renders, and
// characters can be made, switched, exported and imported. Every test also
// fails on page errors and console errors (see e2e/support/test.ts).
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { Character } from '../src/lib/types';
import { ALL_FIXTURES, FIXTURES, loadFixture, openApp, openTab, savedCharacters, TABS } from './support/app';
import { expect, test } from './support/test';

/** What the app should have saved for a fixture: the same character, at the current schema version. */
function asSaved(fixture: Character) {
  return { ...fixture, schemaVersion: expect.any(Number) };
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

test('the matrix settings are in force', async ({ page, browserName, defaultFontSize }) => {
  await openApp(page, FIXTURES.kitchenSink);
  await openTab(page, TABS[3]); // Inventory, which is taller than the window
  const { rootFontSize, scrollbarWidth } = await page.evaluate(() => ({
    rootFontSize: getComputedStyle(document.documentElement).fontSize,
    scrollbarWidth: window.innerWidth - document.documentElement.clientWidth,
  }));
  expect(rootFontSize, "the browser's default font size").toBe(`${defaultFontSize}px`);
  // Only Chromium's is checked: whether WebKit's scrollbars take room depends on the platform.
  if (browserName === 'chromium') expect(scrollbarWidth, 'room the scrollbar takes').toBeGreaterThan(0);
});

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
    // defaults: a fixture that had lost a field would be filled back in and
    // still pass. So the saved copy must have exactly the fixture's top-level
    // fields. (A missing nested field still passes: the keys below are only the
    // top level. Compare flattened key paths to catch those too.)
    await expect.poll(async () => Object.keys((await savedCharacters(page)).characters[0] ?? {}).sort())
      .toEqual(Object.keys(character).sort());
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
