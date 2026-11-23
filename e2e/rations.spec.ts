// Rations: the Adventuring tab's counter card and the Inventory tab's rows take
// the same inventory items (src/lib/rations.ts). A day's rations is one item,
// fresh (1 slot) or preserved (2 slots, both weighing 20 coins), and it carries
// the lived day it was acquired on, which is what its spoilage counts from. The
// rules: fresh keeps 1 week, preserved 2 months, or 1 day and 1 week in dank
// conditions (Player's Book p116, p186).
//
// The counters on Adventuring still count days' rations, but each + makes an
// item and each − eats the one that would spoil soonest, so the Inventory shows
// the same food, the encumbrance summary counts its slots, and a spoiled ration
// is marked rather than removed.
//
// The fixture with rations is kitchen-sink: 2 fresh (1 slot each) and 6
// preserved (2 slots each), 14 slots in all. One of the preserved ones was a
// plain item from the catalog before rations were items, which the migration
// takes over too.
import type { Page } from '@playwright/test';
import { addDays } from '../src/lib/gamedata';
import { createRationItem } from '../src/lib/rations';
import type { Character } from '../src/lib/types';
import { FIXTURES, loadFixture, openApp, openTab, seedCharacters, settle, tabBar, TABS } from './support/app';
import { findA11yProblems } from './support/a11y';
import { findLayoutProblems } from './support/layout';
import { newProblems } from './known-issues';
import { expect, test, viewportAt } from './support/test';

const ADVENTURING = TABS.find((tab) => tab.id === 'calendar')!;
const INVENTORY = TABS.find((tab) => tab.id === 'inventory')!;

/** The widths this spec checks the two tabs' layout and accessibility at. */
const CHECK_WIDTHS = [320, 1280] as const;

/** One of the rations card's two cells, by its kind. */
function rationCell(page: Page, kind: 'Fresh' | 'Preserved') {
  return page.getByRole('group', { name: `${kind} rations` });
}

/** The total line under the two cells: "7 rations · 12 slots · 140 wt". */
function rationTotals(page: Page) {
  return page.getByText(/^\d+ rations? · \d+ slots? · \d+ wt$/);
}

/** The Stowed Slots row of the Inventory's encumbrance summary, which counts the rations' slots. */
function stowedSlots(page: Page) {
  return page.getByText('Stowed Slots (items):').locator('..');
}

/** The Inventory's ration rows, found by the kind each one offers. */
function rationKinds(page: Page) {
  return page.getByRole('combobox', { name: /^Kind of / });
}

/** Open a character of the test's own making, as if the player had it. */
async function openCharacter(page: Page, character: Character): Promise<void> {
  await seedCharacters(page, [character]);
  await page.goto('/');
  await expect(tabBar(page)).toBeVisible();
}

/**
 * The default character with one ration acquired `daysAgo` lived days ago. It
 * starts on lived day 0, so moving its date forward by that many days is what
 * ages the ration.
 */
function withRation(
  freshness: 'fresh' | 'preserved',
  daysAgo: number,
  fields: Partial<Character> = {},
): Character {
  const character = loadFixture(FIXTURES.default);
  return {
    ...character,
    currentDate: addDays(character.currentDate, daysAgo),
    stowedItems: [createRationItem(freshness, 0, 'ration-of-the-test')],
    ...fields,
  };
}

/** The problems on the open tab that no known issue covers, at this window. */
async function expectNoProblems(page: Page, tab: 'calendar' | 'inventory', width: number, fontSize: number) {
  await settle(page);
  const where = { tab, width, fontSize } as const;
  expect(newProblems(await findLayoutProblems(page), where), `layout problems at ${width}px`).toEqual([]);
  expect(newProblems(await findA11yProblems(page), where), `accessibility problems at ${width}px`).toEqual([]);
}

test("the counter card counts the character's ration items, and the Inventory lists them", async ({ page }) => {
  await openApp(page, FIXTURES.kitchenSink);
  await openTab(page, ADVENTURING);

  await expect(rationCell(page, 'Fresh').getByText('2', { exact: true })).toBeVisible();
  await expect(rationCell(page, 'Preserved').getByText('6', { exact: true })).toBeVisible();
  await expect(rationTotals(page)).toHaveText('8 rations · 14 slots · 160 wt');

  await openTab(page, INVENTORY);
  await expect(rationKinds(page)).toHaveCount(8);
  // Their 14 slots are in the encumbrance summary's 24: the rest of the pack
  // (books, bedroll, rope and so on) takes the other 10.
  await expect(stowedSlots(page)).toContainText('24');
});

test('adding a ration makes one item, with the slots and weight the rules give it', async ({ page }) => {
  await openApp(page, FIXTURES.default);
  await openTab(page, ADVENTURING);
  await expect(rationTotals(page)).toHaveText('0 rations · 0 slots · 0 wt');

  await page.getByRole('button', { name: "Add a day's fresh rations" }).click();
  await expect(rationCell(page, 'Fresh').getByText('1', { exact: true })).toBeVisible();
  // One day's rations is one item: 1 slot, 20 coins (10 coins = 1 pound).
  await expect(rationTotals(page)).toHaveText('1 ration · 1 slot · 20 wt');
  await expect(rationCell(page, 'Fresh')).toContainText('7 days left');

  await page.getByRole('button', { name: "Add a day's preserved rations" }).click();
  await expect(rationCell(page, 'Preserved').getByText('1', { exact: true })).toBeVisible();
  await expect(rationTotals(page)).toHaveText('2 rations · 3 slots · 40 wt');
  await expect(rationCell(page, 'Preserved')).toContainText('60 days left');

  // The same two items are on the Inventory tab, and the encumbrance counts them.
  await openTab(page, INVENTORY);
  await expect(rationKinds(page)).toHaveCount(2);
  await expect(stowedSlots(page)).toContainText('3');
  await expect(page.getByText('7 days left', { exact: true })).toBeVisible();
  await expect(page.getByText('60 days left', { exact: true })).toBeVisible();
});

test('the − counter eats the ration that would spoil soonest', async ({ page }) => {
  // Two fresh rations, one acquired today and one three days ago.
  const character: Character = {
    ...loadFixture(FIXTURES.default),
    currentDate: addDays(loadFixture(FIXTURES.default).currentDate, 3),
    stowedItems: [
      createRationItem('fresh', 3, 'acquired-today'),
      createRationItem('fresh', 0, 'acquired-three-days-ago'),
    ],
  };
  await openCharacter(page, character);
  await openTab(page, ADVENTURING);
  await expect(rationCell(page, 'Fresh').getByText('2', { exact: true })).toBeVisible();
  // The one acquired three days ago is the sooner to spoil: 4 days left.
  await expect(rationCell(page, 'Fresh')).toContainText('Soonest: 4 days left');

  await page.getByRole('button', { name: "Eat a day's fresh rations" }).click();
  await expect(rationCell(page, 'Fresh').getByText('1', { exact: true })).toBeVisible();
  // The older one was eaten, so the one left has its full week.
  await expect(rationCell(page, 'Fresh')).toContainText('7 days left');
  await openTab(page, INVENTORY);
  await expect(rationKinds(page)).toHaveCount(1);
  await expect(page.getByText('7 days left', { exact: true })).toBeVisible();

  // Down to none: the count is 0, and there's nothing left to eat.
  await openTab(page, ADVENTURING);
  await page.getByRole('button', { name: "Eat a day's fresh rations" }).click();
  await expect(rationCell(page, 'Fresh').getByText('0', { exact: true })).toBeVisible();
  await expect(rationCell(page, 'Fresh')).toContainText('Nothing kept.');
  await expect(page.getByRole('button', { name: "Eat a day's fresh rations" })).toBeDisabled();
});

test('dank storage shortens the time a ration keeps, on the card and in the Inventory', async ({ page }) => {
  const character: Character = {
    ...loadFixture(FIXTURES.default),
    stowedItems: [
      createRationItem('preserved', 0, 'preserved'),
      createRationItem('fresh', 0, 'fresh'),
    ],
  };
  await openCharacter(page, character);
  await openTab(page, ADVENTURING);
  // Out of dank conditions: a week for fresh rations, 2 months for preserved.
  await expect(rationTotals(page)).toHaveText('2 rations · 3 slots · 40 wt');
  await expect(rationCell(page, 'Fresh')).toContainText('7 days left');
  await expect(rationCell(page, 'Preserved')).toContainText('60 days left');

  await page.getByRole('checkbox', { name: /In dank conditions/ }).check();
  // In them: a day for fresh rations, a week for preserved.
  await expect(rationCell(page, 'Fresh')).toContainText('1 day left');
  await expect(rationCell(page, 'Preserved')).toContainText('7 days left');

  await openTab(page, INVENTORY);
  await expect(page.getByText('1 day left', { exact: true })).toBeVisible();
  await expect(page.getByText('7 days left', { exact: true })).toBeVisible();
  await expect(page.getByText('keeps 1 day in dank conditions')).toBeVisible();
  await expect(page.getByText('keeps 1 week in dank conditions')).toBeVisible();

  // And back out: nothing was eaten or removed.
  await openTab(page, ADVENTURING);
  await page.getByRole('checkbox', { name: /In dank conditions/ }).uncheck();
  await expect(rationCell(page, 'Preserved')).toContainText('60 days left');
  await expect(rationTotals(page)).toHaveText('2 rations · 3 slots · 40 wt');
});

test('a spoiled ration is marked, not taken away', async ({ page }) => {
  // Acquired 10 lived days ago: a week's fresh rations are 3 days spoiled.
  await openCharacter(page, withRation('fresh', 10));
  await openTab(page, ADVENTURING);

  await expect(rationCell(page, 'Fresh').getByText('1', { exact: true })).toBeVisible();
  await expect(rationCell(page, 'Fresh')).toContainText('Spoiled 3 days ago');

  await openTab(page, INVENTORY);
  await expect(page.getByText('Spoiled 3 days ago', { exact: true })).toBeVisible();
  // Still there, still counted: a warning is not a deletion.
  await expect(rationKinds(page)).toHaveCount(1);
  await expect(stowedSlots(page)).toContainText('1');

  // A preserved one from the same day still has its 2 months.
  await openTab(page, ADVENTURING);
  await page.getByRole('button', { name: "Add a day's preserved rations" }).click();
  await expect(rationCell(page, 'Preserved')).toContainText('60 days left');
  await openTab(page, INVENTORY);
  await expect(rationKinds(page)).toHaveCount(2);
});

test('a ration can change kind, and its slots follow the rules', async ({ page }) => {
  await openCharacter(page, { ...loadFixture(FIXTURES.default), stowedItems: [createRationItem('fresh', 0, 'swapped')] });
  await openTab(page, INVENTORY);
  await expect(stowedSlots(page)).toContainText('1');

  await page.getByRole('combobox', { name: /^Kind of / }).selectOption('preserved');
  // A day's preserved rations take 2 slots, so the summary says so at once.
  await expect(stowedSlots(page)).toContainText('2');
  await openTab(page, ADVENTURING);
  await expect(rationCell(page, 'Preserved').getByText('1', { exact: true })).toBeVisible();
  await expect(rationTotals(page)).toHaveText('1 ration · 2 slots · 20 wt');
});

test('the rations and their acquisition days survive a reload', async ({ page }) => {
  await openApp(page, FIXTURES.kitchenSink);
  await openTab(page, ADVENTURING);
  await expect(rationCell(page, 'Preserved')).toContainText('60 days left');

  await page.reload();
  await expect(tabBar(page)).toBeVisible();
  await openTab(page, ADVENTURING);
  await expect(rationTotals(page)).toHaveText('8 rations · 14 slots · 160 wt');
  await expect(rationCell(page, 'Preserved')).toContainText('60 days left');
});

test('a new character has no rations, and none are invented for it', async ({ page }) => {
  await openApp(page, FIXTURES.default);
  await openTab(page, ADVENTURING);
  await expect(rationTotals(page)).toHaveText('0 rations · 0 slots · 0 wt');
  await expect(rationCell(page, 'Fresh')).toContainText('Nothing kept.');
  await expect(page.getByRole('checkbox', { name: /In dank conditions/ })).not.toBeChecked();
  await openTab(page, INVENTORY);
  await expect(rationKinds(page)).toHaveCount(0);
});

for (const width of CHECK_WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: viewportAt(width) });

    test('the rations card and the Inventory rows fit and pass axe', async ({ page, defaultFontSize }) => {
      // A spoiled ration in dank conditions reads differently, in other colours.
      const character: Character = withRation('fresh', 10, { dankConditions: true });
      character.stowedItems = [...character.stowedItems, createRationItem('preserved', 10, 'preserved')];
      await openCharacter(page, character);
      await openTab(page, ADVENTURING);
      // In dank conditions a week's fresh rations keep a day, so ten days old
      // they are nine days spoiled.
      await expect(rationCell(page, 'Fresh')).toContainText('Spoiled 9 days ago');
      await expectNoProblems(page, 'calendar', width, defaultFontSize);

      await openTab(page, INVENTORY);
      await expectNoProblems(page, 'inventory', width, defaultFontSize);

      // And with a full pack of them, as the kitchen-sink fixture has.
      await openApp(page, FIXTURES.kitchenSink);
      await openTab(page, ADVENTURING);
      await expectNoProblems(page, 'calendar', width, defaultFontSize);
      await openTab(page, INVENTORY);
      await expectNoProblems(page, 'inventory', width, defaultFontSize);
    });
  });
}
