// The Dwemer shard: a house feature, so there is no Player's Book entry to
// check it against — the type comments in src/lib/types.ts are the spec. This
// walks the whole of it the way a player does: add a shard to the inventory,
// say which spell it holds and what a charge gives, charge it on a ley line,
// cast it down to nothing, charge it again, and see what the shard says once
// its line is deleted. Also checks the layout and accessibility with the shard
// row and the map's charge flow open.
import type { Locator, Page } from '@playwright/test';
import { findA11yProblems } from './support/a11y';
import { openApp, openTab, settle, TABS } from './support/app';
import { findLayoutProblems } from './support/layout';
import { A11Y_FONT_SIZE, expect, test, viewportAt, WIDTHS } from './support/test';
import { newProblems } from './known-issues';

const INVENTORY_TAB = TABS.find((tab) => tab.id === 'inventory')!;
const MAP_TAB = TABS.find((tab) => tab.id === 'map')!;

// The kitchen-sink character's lines. The Antler Line's spell is learned
// already (it holds Dweomerlight, Rank 2, from the fixture); The Whispering
// Ley holds none, so charging on it asks the player what it holds.
const ANTLER_LINE = 'The Antler Line';
const WHISPERING_LEY = 'The Whispering Ley';
// What the player says The Whispering Ley holds.
const RECORDED_SPELL = 'Fireball';

// The shard a player adds and drives through the whole story.
const NEW_SHARD = "Wanderer's shard";
// The shard kitchen-sink already carries, for tests that do not add one.
const FIXTURE_SHARD = 'Dwemer shard';

/** The ley-line editor the map shows for a line, by the name it gives it. */
function leyLineEditor(page: Page, name: string): Locator {
  return page.getByRole('group', { name: `Ley line ${name}` });
}

/**
 * Add a Dwemer shard to the equipped items, the way the inventory adds a spell
 * book or a scroll, and name it so the rest of the test can find it.
 */
async function addShard(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Add magical item to Equipped Items' }).click();
  await page.getByRole('button', { name: /Dwemer Shard/ }).click();

  // The new shard is last in the list. Its row is a group named for the item,
  // and the name field says where it is ("equipped item 7").
  const added = page.getByRole('group', { name: /^Dwemer shard \(equipped item \d+\)$/ }).last();
  await added.getByRole('textbox', { name: /^Name of equipped item \d+$/ }).fill(NEW_SHARD);
  const row = page.getByRole('group', { name: new RegExp(`^${NEW_SHARD} \\(equipped item \\d+\\)$`) });
  await expect(row).toBeVisible();
  return row;
}

/** The spell the shard holds, as its row's picker shows it. */
const shardSpell = (row: Locator) => row.getByRole('combobox', { name: /^Spell held by / });
const perCharge = (row: Locator) => row.getByRole('spinbutton', { name: /^Casts one charge gives / });
const castButton = (row: Locator) => row.getByRole('button', { name: /^Cast the spell from / });

test.describe('at 1280px', () => {
  test.use({ viewport: viewportAt(1280) });

  test('a shard is added, set up, charged, cast down and charged again', async ({ page }) => {
    await openApp(page, 'kitchen-sink');
    await openTab(page, INVENTORY_TAB);

    // ── Added: no spell yet, and no charge on it ──
    const row = await addShard(page);
    await expect(shardSpell(row)).toHaveValue('');
    await expect(row).toContainText('Not charged on a ley line yet');
    await expect(row).toContainText('0 of 1');
    // With no charge on it there is nothing to cast.
    await expect(castButton(row)).toBeDisabled();
    await expect(castButton(row)).toHaveAccessibleName(/^Cast the spell from .*: no casts left$/);

    // ── The spell it holds, and what a charge gives ──
    await shardSpell(row).selectOption(RECORDED_SPELL);
    await expect(shardSpell(row)).toHaveValue(RECORDED_SPELL);
    await perCharge(row).fill('3');
    await expect(row).toContainText('0 of 3');
    // The least a charge can give is one cast.
    await perCharge(row).fill('0');
    await expect(perCharge(row)).toHaveValue('1');
    await perCharge(row).fill('3');
    await expect(perCharge(row)).toHaveValue('3');

    // ── Charged on The Antler Line: a full charge, and that line's spell ──
    await openTab(page, MAP_TAB);
    const antler = leyLineEditor(page, ANTLER_LINE);
    await expect(antler).toContainText('Holds Dweomerlight (Rank 2)');
    await antler.getByRole('button', { name: `Charge ${NEW_SHARD} on ${ANTLER_LINE}` }).click();
    await expect(antler.getByRole('status')).toHaveText(`Charged ${NEW_SHARD} on ${ANTLER_LINE}.`);

    await openTab(page, INVENTORY_TAB);
    await expect(row).toContainText('3 of 3');
    await expect(row).toContainText(`Charged on ${ANTLER_LINE}`);
    // Charging sets the shard's spell from the line's, whatever it held before.
    await expect(shardSpell(row)).toHaveValue('Dweomerlight');

    // ── Cast down to nothing ──
    await expect(castButton(row)).toHaveAccessibleName(/^Cast the spell from Wanderer's shard \(equipped item \d+\)$/);
    for (const left of ['2 of 3', '1 of 3', '0 of 3']) {
      await castButton(row).click();
      await expect(row).toContainText(left);
    }
    await expect(castButton(row)).toBeDisabled();
    await expect(castButton(row)).toHaveAccessibleName(/^Cast the spell from .*: no casts left$/);
    // A spent shard offers nothing to press, so it cannot go below none.
    await expect(row).toContainText('0 of 3');

    // ── Charged again, on a line that holds no spell yet ──
    await openTab(page, MAP_TAB);
    const whispering = leyLineEditor(page, WHISPERING_LEY);
    await expect(whispering).toContainText('Holds no spell yet');
    await whispering.getByRole('button', { name: `Charge ${NEW_SHARD} on ${WHISPERING_LEY}` }).click();

    // The picker is keyboard operable: it has focus, and its confirm waits for a spell.
    const picker = whispering.getByRole('combobox', { name: `Spell that charging a shard on ${WHISPERING_LEY} teaches` });
    await expect(picker).toBeFocused();
    const record = whispering.getByRole('button', { name: /^Record & charge/ });
    await expect(record).toBeDisabled();
    await picker.selectOption('Dweomerlight');
    await expect(record).toHaveAccessibleName(`Record & charge: Dweomerlight on ${NEW_SHARD}`);
    await record.click();

    // The line learns the spell by having a shard charged on it...
    await expect(whispering).toContainText('Holds Dweomerlight (Rank 2)');
    await expect(whispering.getByRole('status')).toHaveText(`Charged ${NEW_SHARD} on ${WHISPERING_LEY}.`);
    await expect(picker).toHaveCount(0);

    // ...and the two are in step: the shard holds it too, with a full charge.
    await openTab(page, INVENTORY_TAB);
    await expect(shardSpell(row)).toHaveValue('Dweomerlight');
    await expect(row).toContainText('3 of 3');
    await expect(row).toContainText(`Charged on ${WHISPERING_LEY}`);

    // ── The line is deleted: the shard survives it, and says so ──
    await openTab(page, MAP_TAB);
    await whispering.getByRole('button', { name: `Delete ley line ${WHISPERING_LEY}` }).click();
    await expect(leyLineEditor(page, WHISPERING_LEY)).toHaveCount(0);
    await openTab(page, INVENTORY_TAB);
    await expect(row).toContainText('Charged on a ley line since deleted');
    await expect(shardSpell(row)).toHaveValue('Dweomerlight');
    await expect(row).toContainText('3 of 3');
  });

  test('a spell left unset drops it', async ({ page }) => {
    await openApp(page, 'kitchen-sink');
    await openTab(page, INVENTORY_TAB);
    const row = await addShard(page);

    // Setting a spell and taking it away again leaves the shard with none: the
    // type has it absent until the player learns which spell it holds.
    await shardSpell(row).selectOption(RECORDED_SPELL);
    await expect(shardSpell(row)).toHaveValue(RECORDED_SPELL);
    await shardSpell(row).selectOption('');
    await expect(shardSpell(row)).toHaveValue('');
  });
});

test.describe('at 320px', () => {
  test.use({ viewport: viewportAt(320) });

  test('the charge flow can be cancelled without charging anything', async ({ page }) => {
    await openApp(page, 'kitchen-sink');
    await openTab(page, MAP_TAB);
    const whispering = leyLineEditor(page, WHISPERING_LEY);
    await whispering.getByRole('button', { name: `Charge ${FIXTURE_SHARD} on ${WHISPERING_LEY}` }).click();
    await expect(whispering.getByRole('combobox')).toBeVisible();
    await whispering.getByRole('button', { name: `Cancel charging on ${WHISPERING_LEY}` }).click();
    await expect(whispering.getByRole('combobox')).toHaveCount(0);
    // Cancelling records nothing on the line.
    await expect(whispering).toContainText('Holds no spell yet');
  });
});

for (const width of WIDTHS) {
  test.describe(`with the shard row and the charge flow open at ${width}px`, () => {
    test.use({ viewport: viewportAt(width) });

    test('nothing spills and axe finds no new problem', async ({ page, defaultFontSize }) => {
      await openApp(page, 'kitchen-sink');
      await openTab(page, INVENTORY_TAB);
      // A fresh shard row: no spell, no charge on it, so every control shows.
      await addShard(page);
      const inventory = { tab: 'inventory' as const, width, fontSize: defaultFontSize };
      expect
        .soft(newProblems(await findLayoutProblems(page), inventory), 'layout problems with the shard row')
        .toEqual([]);

      await openTab(page, MAP_TAB);
      await leyLineEditor(page, WHISPERING_LEY)
        .getByRole('button', { name: `Charge ${NEW_SHARD} on ${WHISPERING_LEY}` })
        .click();
      await expect(leyLineEditor(page, WHISPERING_LEY).getByRole('combobox')).toBeVisible();
      const map = { tab: 'map' as const, width, fontSize: defaultFontSize };
      expect.soft(newProblems(await findLayoutProblems(page), map), 'layout problems with the charge flow open').toEqual([]);

      // axe runs at the matrix's smallest font size only, as playwright.config.ts
      // keeps a11y.spec.ts out of the other projects.
      if (defaultFontSize !== A11Y_FONT_SIZE) return;

      expect
        .soft(newProblems(await findA11yProblems(page), map), 'accessibility problems with the charge flow open')
        .toEqual([]);
      await openTab(page, INVENTORY_TAB);
      await settle(page);
      expect
        .soft(newProblems(await findA11yProblems(page), inventory), 'accessibility problems with the shard row')
        .toEqual([]);
    });
  });
}
