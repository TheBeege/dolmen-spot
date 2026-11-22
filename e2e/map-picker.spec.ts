// The map's kind picker, opened the way a player opens it: select a hex that
// holds a point of interest of a kind, and edit it. Checks that the picker
// names each kind, that its tiles are big enough to tap, that the arrow keys
// choose kinds, and what the legend says as the pointer moves over the tiles.
// Also checks the page's layout and accessibility with the picker open, and
// that forced colours keep each kind's glyph apart from its disc.
import type { Locator, Page } from '@playwright/test';
import { findA11yProblems } from './support/a11y';
import { openApp, openTab, TABS } from './support/app';
import { findLayoutProblems } from './support/layout';
import { expect, test, viewportAt } from './support/test';
import { newProblems } from './known-issues';

const MAP_TAB = TABS.find((tab) => tab.id === 'map')!;

// The kitchen-sink character's Prigwort: a town on a hex of its own, so the
// hex inspector shows its one point of interest expanded, picker and all.
const HEX = '1309';
const POI = 'ks-poi-04';
const POI_NAME = 'Prigwort';
const POI_KIND = 'Town or city';

/** The widths the picker must leave the page's layout and accessibility alone at. */
const WIDTHS = [320, 375, 1280] as const;

/** Open the map, select Prigwort's hex, and return the kind picker, showing. */
async function openPicker(page: Page): Promise<Locator> {
  await openApp(page, 'kitchen-sink');
  await openTab(page, MAP_TAB);
  await page.getByLabel('Jump to a hex by typing its 4-digit coordinate').fill(HEX);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: `Hex ${HEX}` })).toBeVisible();
  const picker = page.getByRole('group', { name: 'Kind' });
  // A lone point of interest on its hex opens expanded; otherwise, open it.
  if (!(await picker.isVisible())) await page.getByRole('button', { name: `Edit ${POI_NAME}` }).click();
  await expect(picker).toBeVisible();
  return picker;
}

/** The tile that chooses the kind `kind`, by the value of its radio button. */
function tile(picker: Locator, kind: string): Locator {
  return picker.locator(`label:has(input[value="${kind}"])`);
}

/**
 * What the map calls Prigwort: its marker's name, or, where the hex draws its
 * markers as one, that button's name.
 */
function mapName(page: Page): Locator {
  return page.locator(`[data-marker="${POI}"]`).or(page.locator(`[role="button"][data-hex="${HEX}"]`));
}

test.describe('at 1280px', () => {
  test.use({ viewport: viewportAt(1280) });

  test('names each kind, fits tiles a thumb can hit, and follows the arrow keys', async ({ page }) => {
    const picker = await openPicker(page);
    const legend = picker.locator('legend');

    // The stored kind is the checked tile, and the legend describes it.
    await expect(picker.getByRole('radio', { name: POI_KIND })).toBeChecked();
    await expect(legend).toContainText(POI_KIND);
    await expect(picker.getByRole('radio')).toHaveCount(15);

    // Every tile is at least 24 by 24 CSS px, whatever the font size.
    const sizes = await picker.locator('label').evaluateAll((tiles) =>
      tiles.map((el) => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      }));
    expect(sizes).toHaveLength(15);
    for (const { w, h } of sizes) {
      expect.soft(w, 'a tile a thumb can hit').toBeGreaterThanOrEqual(24);
      expect.soft(h, 'a tile a thumb can hit').toBeGreaterThanOrEqual(24);
    }

    // The legend describes the tile under the pointer, then goes back to the
    // chosen kind's when the pointer leaves: a touch screen's only description.
    await tile(picker, 'keep').hover();
    await expect(legend).toContainText('Castle, keep, fort or manor');
    await page.mouse.move(0, 0);
    await expect(legend).toContainText(POI_KIND);

    // The arrow keys choose the next kinds, which save at once and rename the
    // map's marker for the place.
    await picker.getByRole('radio', { name: POI_KIND }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(picker.getByRole('radio', { name: 'Village, hamlet or farmstead' })).toBeChecked();
    await expect(legend).toContainText('Village, hamlet or farmstead');
    await expect(mapName(page)).toHaveAttribute('aria-label', /(^Village: |\(village\))/);
    await page.keyboard.press('ArrowDown');
    await expect(picker.getByRole('radio', { name: 'Castle, keep, fort or manor' })).toBeChecked();
    await expect(mapName(page)).toHaveAttribute('aria-label', /(^Castle: |\(castle\))/);
  });

  test('forced colours keep a kind’s glyph apart from its disc', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    const picker = await openPicker(page);
    const marker = tile(picker, 'keep');
    const disc = marker.locator('.marker-disc');
    const glyph = marker.locator('.marker-glyph').first();
    const cut = marker.locator('.marker-glyph-cut').first();
    const fill = (el: Locator) => el.evaluate((node) => getComputedStyle(node).fill);
    const stroke = (el: Locator) => el.evaluate((node) => getComputedStyle(node).stroke);

    const discFill = await fill(disc);
    // The glyph is CanvasText on a Canvas disc, so a kind still reads as its
    // own drawing; the cut-outs are holes, which show the disc through them.
    expect(await fill(glyph), 'the glyph stands out from its disc').not.toBe(discFill);
    expect(await stroke(disc), 'the rim stands out from its disc').not.toBe(discFill);
    expect(await fill(cut), 'the cut-outs are holes').toBe(discFill);
  });
});

for (const width of WIDTHS) {
  test.describe(`with the picker open at ${width}px`, () => {
    test.use({ viewport: viewportAt(width) });

    test('nothing spills and axe finds no new problem', async ({ page, defaultFontSize }) => {
      await openPicker(page);
      const where = { tab: 'map' as const, width, fontSize: defaultFontSize };
      expect.soft(newProblems(await findLayoutProblems(page), where), 'layout problems with the picker open').toEqual([]);
      expect.soft(newProblems(await findA11yProblems(page), where), 'accessibility problems with the picker open').toEqual([]);
    });
  });
}
