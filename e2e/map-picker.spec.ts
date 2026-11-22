// The map's kind picker, opened the way a player opens it: select a hex that
// holds a point of interest of a kind, and edit it. Checks that the picker
// names each kind, that its tiles are big enough to tap, that the arrow keys
// choose kinds, and what the legend says as the pointer moves over the tiles.
// Also checks the page's layout and accessibility with the picker open, and
// that forced colours keep each kind's glyph, and a combined marker's count,
// apart from their discs.
import type { Locator, Page } from '@playwright/test';
import { findA11yProblems } from './support/a11y';
import { openApp, openTab, settle, TABS } from './support/app';
import { findLayoutProblems } from './support/layout';
import { expect, test, viewportAt, WIDTHS } from './support/test';
import { newProblems } from './known-issues';

const MAP_TAB = TABS.find((tab) => tab.id === 'map')!;

// The kitchen-sink character's Prigwort: a town on a hex of its own, so the
// hex inspector shows its one point of interest expanded, picker and all.
const HEX = '1309';
const POI = 'ks-poi-04';
const POI_KIND = 'Town or city';

// Another of its hexes holds two points of interest, which the map draws as
// one marker with their count wherever they don't fit apart.
const COMBINED_HEX = '1106';

// The fills the map draws its discs with, as a computed style spells them:
// NIGHT (#1a1a2e) for a kind's marker and a combined marker's dark disc,
// POI_FILL (#8b2500) for a point of interest without a kind, DOOR_FILL
// (#a774d6) for a fairy door. Each comes from an SVG attribute, which forced
// colours' rules in globals.css replace with Canvas, so a disc that still has
// one of them means the emulation did nothing and every comparison below would
// hold in the ordinary palette too.
const DISC_FILLS = ['rgb(26, 26, 46)', 'rgb(139, 37, 0)', 'rgb(167, 116, 214)'];

/** Open the map, select Prigwort's hex, and return the kind picker, showing. */
async function openPicker(page: Page): Promise<Locator> {
  await openApp(page, 'kitchen-sink');
  await openTab(page, MAP_TAB);
  await page.getByLabel('Jump to a hex by typing its 4-digit coordinate').fill(HEX);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: `Hex ${HEX}` })).toBeVisible();
  const picker = page.getByRole('group', { name: 'Kind' });
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

const fill = (el: Locator) => el.evaluate((node) => getComputedStyle(node).fill);
const stroke = (el: Locator) => el.evaluate((node) => getComputedStyle(node).stroke);

/** The disc's computed fill, once it's certain the page really is in forced colours. */
async function forcedDiscFill(disc: Locator): Promise<string> {
  const discFill = await fill(disc);
  expect(DISC_FILLS, 'the disc is in forced colours').not.toContain(discFill);
  return discFill;
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

    const discFill = await forcedDiscFill(disc);
    // The glyph is CanvasText on a Canvas disc, so a kind still reads as its
    // own drawing; the cut-outs are holes, which show the disc through them.
    expect(await fill(glyph), 'the glyph stands out from its disc').not.toBe(discFill);
    expect(await stroke(disc), 'the rim stands out from its disc').not.toBe(discFill);
    expect(await fill(cut), 'the cut-outs are holes').toBe(discFill);
  });
});

test.describe('at 320px', () => {
  test.use({ viewport: viewportAt(320) });

  test('forced colours keep a combined marker’s count apart from its disc', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openApp(page, 'kitchen-sink');
    await openTab(page, MAP_TAB);
    await page.getByLabel('Jump to a hex by typing its 4-digit coordinate').fill(COMBINED_HEX);
    await page.keyboard.press('Enter');
    // The two markers don't fit apart on a phone, so the hex draws one with
    // their count; where they ever fit, zoom out until they no longer do,
    // since it's that hand-drawn marker this checks.
    const marker = page.locator(`[role="button"][data-hex="${COMBINED_HEX}"]`);
    const zoomOut = page.getByRole('button', { name: 'Zoom out' });
    for (let i = 0; i < 8 && !(await marker.isVisible()); i++) {
      await zoomOut.click();
      await settle(page);
    }
    await expect(marker).toBeVisible();

    const disc = marker.locator('.marker-disc');
    const digit = marker.locator('text');
    const discFill = await forcedDiscFill(disc);
    expect(await fill(digit), 'the count stands out from its disc').not.toBe(discFill);
  });
});

for (const width of WIDTHS) {
  test.describe(`with the picker open at ${width}px`, () => {
    test.use({ viewport: viewportAt(width) });

    test('nothing spills and axe finds no new problem', async ({ page, defaultFontSize }) => {
      await openPicker(page);
      const where = { tab: 'map' as const, width, fontSize: defaultFontSize };
      expect.soft(newProblems(await findLayoutProblems(page), where), 'layout problems with the picker open').toEqual([]);
      // The layout check runs at every font size. axe runs at 16px only, as
      // playwright.config.ts keeps a11y.spec.ts out of the 24px projects: its
      // findings barely change with the font size, and this is the heaviest
      // page in the suite.
      if (defaultFontSize !== 16) return;
      expect.soft(newProblems(await findA11yProblems(page), where), 'accessibility problems with the picker open').toEqual([]);
    });
  });
}
