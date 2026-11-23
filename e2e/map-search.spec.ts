// The map's search box: finding the character's own places, doors and paths by
// name, and going to them. Checks what typing a name lists, what choosing a
// result does to the map and the focus, the keys, the cap, and the page's
// layout and accessibility with the list open. The matching rules themselves
// are tested in src/lib/map-search.test.ts.
import type { Locator, Page } from '@playwright/test';
import { findA11yProblems } from './support/a11y';
import { openApp, openTab, settle, TABS } from './support/app';
import { hexCenterOf } from '../src/lib/hex';
import { findLayoutProblems } from './support/layout';
import { A11Y_FONT_SIZE, expect, test, viewportAt, WIDTHS } from './support/test';
import { newProblems } from './known-issues';

const MAP_TAB = TABS.find((tab) => tab.id === 'map')!;

// The kitchen-sink character's own map items, and the hexes they're on. The two
// fairy doors on the Silver Way are listed by name, so Hollow Oak comes first.
const TOWN = 'ks-poi-01'; // Lankshorn, a town on 1106
const TOWN_HEX = '1106';
const INN = 'ks-poi-06'; // The Blue Heron, an inn on 1106 too
const ROAD = 'ks-ley-02'; // Old Drune Road, a path of type "Ancient road"
const ROAD_HEX = '0606';
const DOORS = ['ks-door-02', 'ks-door-01']; // Hollow Oak, then The Thornhole, on the Silver Way
const DOOR_HEXES = { 'ks-door-01': '1007', 'ks-door-02': '1404' };
// Matches more items than the box lists (the kitchen-sink map has 10 names,
// kinds and types with an "r" in them), so the list shows its full 8 and says
// how many it left out.
const MANY = 'r';
const MANY_MATCHES = 10;
const LISTED = 8;

/** Open the map and return its search box. */
async function openSearch(page: Page): Promise<Locator> {
  await openApp(page, 'kitchen-sink');
  await openTab(page, MAP_TAB);
  return page.getByRole('searchbox', { name: 'Search the map' });
}

/** The box's own live region, which says how much matched. */
function status(page: Page): Locator {
  return page.getByRole('search', { name: 'Map search' }).getByRole('status');
}

/** One result of the search, by the item it found. */
function result(page: Page, id: string): Locator {
  return page.locator(`[data-search-hit="${id}"]`);
}

/** Every result the list is showing. */
function results(page: Page): Locator {
  return page.locator('[data-search-hit]');
}

/** The middle of the map's picture, in the printed map's own units. */
async function mapCentre(page: Page): Promise<{ x: number; y: number }> {
  const viewBox = await page.locator('svg[data-focus-key="map"]').getAttribute('viewBox');
  const [x, y, w, h] = viewBox!.split(' ').map(Number);
  return { x: x + w / 2, y: y + h / 2 };
}

/** The map is showing `hex` in the middle, give or take a pixel. */
async function expectCentredOn(page: Page, hex: string): Promise<void> {
  const want = hexCenterOf(hex)!;
  const got = await mapCentre(page);
  expect.soft(Math.abs(got.x - want.x), `the map is centred on hex ${hex}, across`).toBeLessThan(2);
  expect.soft(Math.abs(got.y - want.y), `the map is centred on hex ${hex}, down`).toBeLessThan(2);
}

test.describe('at 1280px', () => {
  test.use({ viewport: viewportAt(1280) });

  test('typing a name finds the item, and choosing it selects its hex and recentres the map', async ({ page }) => {
    const search = await openSearch(page);
    await search.fill('lanks');
    await settle(page);

    // The result says what the place is and where it is.
    const hit = result(page, TOWN);
    await expect(hit).toBeVisible();
    await expect(hit).toContainText('Lankshorn');
    await expect(hit).toContainText(`Town · hex ${TOWN_HEX}`);
    await expect(status(page)).toHaveText('1 match');
    // Its accessible name is its text, so a screen reader hears the same.
    await expect(hit).toHaveAccessibleName(/Lankshorn/);
    await expect(hit).toHaveAccessibleName(new RegExp(TOWN_HEX));

    await hit.click();

    // The inspector opens on the item's hex, and the item inside it has the focus.
    await expect(page.getByRole('heading', { name: `Hex ${TOWN_HEX}` })).toBeVisible();
    await expect(page.locator(`[data-focus-key="item:${TOWN}"]`)).toBeFocused();
    await expectCentredOn(page, TOWN_HEX);
    // And the box has let go of it: no list, no query.
    await expect(hit).toHaveCount(0);
    await expect(search).toHaveValue('');
  });

  test('the arrow keys walk the results, Enter takes one, and Escape clears', async ({ page }) => {
    const search = await openSearch(page);
    await search.fill('silver');
    await settle(page);
    await expect(status(page), 'both ends of the Silver Way').toHaveText('2 matches');
    const [first, second] = DOORS;

    // Down into the list, from the box: the first result first, then the
    // second; up goes back, and up again returns to the box.
    await page.keyboard.press('ArrowDown');
    await expect(result(page, first)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(result(page, second)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(result(page, first)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(search).toBeFocused();

    // Enter in the box takes the best match; Enter on a result takes that one.
    await page.keyboard.press('Enter');
    await expect(page.locator(`[data-focus-key="item:${first}"]`)).toBeFocused();
    await expectCentredOn(page, DOOR_HEXES[first as keyof typeof DOOR_HEXES]);

    await search.fill('silver');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(result(page, second)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator(`[data-focus-key="item:${second}"]`)).toBeFocused();
    await expectCentredOn(page, DOOR_HEXES[second as keyof typeof DOOR_HEXES]);

    // Escape from the list closes it, clears the box and puts the caret back.
    await search.fill('silver');
    await page.keyboard.press('ArrowDown');
    await expect(result(page, first)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(results(page)).toHaveCount(0);
    await expect(search).toHaveValue('');
    await expect(search).toBeFocused();
    await expect(status(page)).toHaveText('');

    // So does the box's own clear button.
    await search.fill('silver');
    await expect(result(page, first)).toBeVisible();
    await page.getByRole('button', { name: 'Clear the search' }).click();
    await expect(results(page)).toHaveCount(0);
    await expect(search).toHaveValue('');
  });

  test('a query that matches nothing says so, and lists nothing', async ({ page }) => {
    const search = await openSearch(page);
    await search.fill('xyzzy');
    await settle(page);
    await expect(status(page)).toHaveText('No matches for “xyzzy”');
    await expect(results(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(status(page)).toHaveText('');
  });

  test('a path is found by its type, and choosing it highlights the path', async ({ page }) => {
    const search = await openSearch(page);
    await search.fill('ancient');
    await settle(page);
    const hit = result(page, ROAD);
    await expect(hit).toContainText('Old Drune Road');
    await expect(hit).toContainText(`Ancient road · hex ${ROAD_HEX}`);

    await hit.click();
    // A path's editor isn't in the hex inspector, so that's where the focus goes.
    const editor = page.locator(`[data-focus-key="ley-line:${ROAD}"]`);
    await expect(editor).toBeFocused();
    await expect(editor.getByRole('button', { name: /Toggle highlight/ })).toHaveAttribute('aria-pressed', 'true');
    await expectCentredOn(page, ROAD_HEX);
  });

  test('the list is capped, and says how many more matched', async ({ page }) => {
    const search = await openSearch(page);
    await search.fill(MANY);
    await settle(page);
    await expect(results(page)).toHaveCount(LISTED);
    await expect(status(page)).toHaveText(`${MANY_MATCHES} matches · ${MANY_MATCHES - LISTED} more not listed`);

    // No two results read the same way, so each is its own item to a screen reader.
    const labels = await results(page).evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim()));
    expect(labels).toHaveLength(LISTED);
    expect(new Set(labels).size, `unique names: ${labels.join(' / ')}`).toBe(LISTED);
  });
});

test.describe('at 320px', () => {
  test.use({ viewport: viewportAt(320) });

  test('a chosen item is scrolled into view, not hidden below the map', async ({ page }) => {
    const search = await openSearch(page);
    await search.fill('blue heron');
    await page.keyboard.press('Enter');
    const item = page.locator(`[data-focus-key="item:${INN}"]`);
    await expect(item).toBeFocused();
    await expect(item).toBeInViewport();
  });
});

for (const width of WIDTHS) {
  test.describe(`with the results list open at ${width}px`, () => {
    test.use({ viewport: viewportAt(width) });

    test('nothing spills and axe finds no new problem', async ({ page, defaultFontSize }) => {
      const search = await openSearch(page);
      // The longest list the box shows, so its height is the worst case.
      await search.fill(MANY);
      await expect(results(page)).toHaveCount(LISTED);
      await settle(page);
      const where = { tab: 'map' as const, width, fontSize: defaultFontSize };
      expect.soft(newProblems(await findLayoutProblems(page), where), 'layout problems with the results open').toEqual([]);
      // axe runs at the matrix's smallest font size only, as in map-picker.spec.ts.
      if (defaultFontSize !== A11Y_FONT_SIZE) return;
      expect.soft(newProblems(await findA11yProblems(page), where), 'accessibility problems with the results open').toEqual([]);
    });
  });
}
