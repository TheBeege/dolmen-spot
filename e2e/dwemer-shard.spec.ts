// The Dwemer shard: a house feature, so there is no Player's Book entry to
// check it against — the type comments in src/lib/types.ts are the spec. This
// walks the whole of it the way a player does: add a shard to the inventory,
// say which spell it holds and what a charge gives, charge it on a ley line,
// cast it down to nothing, charge it again on a line that holds no spell, and
// see what the shard says once that line is deleted. Also checks the layout and
// accessibility with the shard row and the map's charge flow open.
import type { Locator, Page } from '@playwright/test';
import { findA11yProblems } from './support/a11y';
import { openApp, openTab, settle, TABS } from './support/app';
import { findLayoutProblems } from './support/layout';
import { A11Y_FONT_SIZE, expect, test, viewportAt, WIDTHS } from './support/test';
import { newProblems } from './known-issues';

const INVENTORY_TAB = TABS.find((tab) => tab.id === 'inventory')!;
const MAP_TAB = TABS.find((tab) => tab.id === 'map')!;

// The kitchen-sink character's lines. The Antler Line's spell is learned already
// (it holds Dweomerlight, Rank 2, from the fixture) and The Whispering Ley holds
// none, so charging on it asks the player what it holds.
const ANTLER_LINE = 'The Antler Line';
const WHISPERING_LEY = 'The Whispering Ley';
// A hex of The Antler Line, and the hex The Whispering Ley runs through.
const ANTLER_HEX = '0909';
const WHISPERING_HEX = '1309';
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

/** The spell a line holds, as its own picker shows it. */
const lineSpell = (editor: Locator) => editor.getByRole('combobox', { name: /^Spell held by / });

/** Move the party to a hex, so its ley lines can be charged on. */
async function movePartyTo(page: Page, hex: string): Promise<void> {
  await page.getByLabel('Jump to a hex by typing its 4-digit coordinate').fill(hex);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: `Hex ${hex}` })).toBeVisible();
  await page.getByRole('button', { name: /Set Current/ }).click();
  await expect(page.getByRole('button', { name: /Set Current/ })).toHaveAttribute('aria-disabled', 'true');
}

/**
 * Add a Dwemer shard to the equipped items, the way the inventory adds a spell
 * book or a scroll, and name it so the rest of the test can find it.
 */
async function addShard(page: Page): Promise<Locator> {
  const shardRows = page.getByRole('group', { name: /^.+ \(equipped item \d+\)$/ });
  const before = await shardRows.count();
  await page.getByRole('button', { name: 'Add magical item to Equipped Items' }).click();
  await page.getByRole('button', { name: /Dwemer Shard/ }).click();

  // One more shard row than there was, and it is the one the field below edits:
  // a row is a group named for the item, and its name field says where it is.
  await expect(shardRows, 'the shard was added').toHaveCount(before + 1);
  const added = shardRows.nth(before);
  await added.getByRole('textbox', { name: /^Name of equipped item \d+$/ }).fill(NEW_SHARD);
  const row = page.getByRole('group', { name: new RegExp(`^${NEW_SHARD} \\(equipped item \\d+\\)$`) });
  await expect(row).toBeVisible();
  return row;
}

/** The spell the shard holds, as its row's picker shows it. */
const shardSpell = (row: Locator) => row.getByRole('combobox', { name: /^Spell held by / });
const perCharge = (row: Locator) => row.getByRole('spinbutton', { name: /^Casts per charge for / });
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

    // The field keeps what is being typed until the player leaves it, so
    // clearing it to choose a number doesn't snap back to 1 and leave "12".
    await perCharge(row).fill('');
    await perCharge(row).pressSequentially('2');
    await expect(perCharge(row)).toHaveValue('2');
    await perCharge(row).press('Enter');
    await expect(row).toContainText('0 of 2');

    // The least a charge can give is one cast.
    await perCharge(row).fill('0');
    await perCharge(row).press('Enter');
    await expect(perCharge(row)).toHaveValue('1');
    await perCharge(row).fill('3');
    await perCharge(row).press('Enter');
    await expect(row).toContainText('0 of 3');

    // ── Charging waits until the party is on a hex of the line ──
    await openTab(page, MAP_TAB);
    const antler = leyLineEditor(page, ANTLER_LINE);
    const whispering = leyLineEditor(page, WHISPERING_LEY);
    // The fixture has the party in Prigwort (1309), which The Whispering Ley
    // runs through and The Antler Line does not.
    await expect(antler.getByRole('button', { name: `Charge ${NEW_SHARD} on ${ANTLER_LINE}` })).toBeDisabled();
    await expect(antler).toContainText('The party is not on this line');
    await expect(whispering).not.toContainText('The party is not on this line');

    // ── Charged on The Antler Line, which knows its spell: one press ──
    await movePartyTo(page, ANTLER_HEX);
    await expect(antler).not.toContainText('The party is not on this line');
    await expect(lineSpell(antler)).toHaveValue('Dweomerlight');
    const chargeOnAntler = antler.getByRole('button', { name: `Charge ${NEW_SHARD} on ${ANTLER_LINE}` });
    await expect(chargeOnAntler).toBeEnabled();
    await chargeOnAntler.click();
    await expect(antler.getByRole('status')).toHaveText(`Charged ${NEW_SHARD} on ${ANTLER_LINE}.`);

    await openTab(page, INVENTORY_TAB);
    await expect(row).toContainText('3 of 3');
    await expect(row).toContainText(`Charged on ${ANTLER_LINE}`);
    // Charging sets the shard's spell from the line's, whatever it held before.
    await expect(shardSpell(row)).toHaveValue('Dweomerlight');

    // ── Cast down to nothing ──
    await expect(castButton(row)).toHaveAccessibleName(/^Cast the spell from [^:]+$/);
    for (const left of ['2 of 3', '1 of 3', '0 of 3']) {
      await castButton(row).click();
      await expect(row).toContainText(left);
    }
    // A spent shard offers nothing to press, so it cannot go below none.
    await expect(castButton(row)).toBeDisabled();
    await expect(castButton(row)).toHaveAccessibleName(/^Cast the spell from .*: no casts left$/);

    // ── Charged again, on a line that holds no spell yet ──
    await openTab(page, MAP_TAB);
    await movePartyTo(page, WHISPERING_HEX);
    await expect(lineSpell(whispering)).toHaveValue('');
    await whispering.getByRole('button', { name: `Charge ${NEW_SHARD} on ${WHISPERING_LEY}` }).click();

    // The picker is keyboard operable: it has focus, and its confirm waits for
    // a spell. Escape closes it and puts focus back on the Charge button.
    const picker = whispering.getByRole('combobox', { name: `Spell that charging a shard on ${WHISPERING_LEY} teaches` });
    await expect(picker).toBeFocused();
    const record = whispering.getByRole('button', { name: /^Record & charge/ });
    await expect(record).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(whispering.getByRole('button', { name: `Charge ${NEW_SHARD} on ${WHISPERING_LEY}` })).toBeFocused();
    // Cancelling records nothing on the line.
    await expect(lineSpell(whispering)).toHaveValue('');

    // Cancel puts the focus back the same way.
    await whispering.getByRole('button', { name: `Charge ${NEW_SHARD} on ${WHISPERING_LEY}` }).click();
    await expect(picker).toBeFocused();
    await whispering.getByRole('button', { name: `Cancel charging on ${WHISPERING_LEY}` }).click();
    await expect(picker).toHaveCount(0);
    await expect(whispering.getByRole('button', { name: `Charge ${NEW_SHARD} on ${WHISPERING_LEY}` })).toBeFocused();

    // Recording the spell charges through the picker, and focus comes back too.
    await whispering.getByRole('button', { name: `Charge ${NEW_SHARD} on ${WHISPERING_LEY}` }).click();
    await picker.selectOption(RECORDED_SPELL);
    await expect(record).toHaveAccessibleName(`Record & charge: ${RECORDED_SPELL} on ${NEW_SHARD}`);
    await record.click();

    // The line learns the spell by having a shard charged on it...
    await expect(lineSpell(whispering)).toHaveValue(RECORDED_SPELL);
    await expect(whispering).toContainText(`Rank 3`);
    await expect(whispering.getByRole('status')).toHaveText(`Charged ${NEW_SHARD} on ${WHISPERING_LEY}.`);
    await expect(picker).toHaveCount(0);
    await expect(whispering.getByRole('button', { name: `Charge ${NEW_SHARD} on ${WHISPERING_LEY}` })).toBeFocused();

    // ...and the two are in step: the shard holds it too, with a full charge.
    await openTab(page, INVENTORY_TAB);
    await expect(shardSpell(row)).toHaveValue(RECORDED_SPELL);
    await expect(row).toContainText('3 of 3');
    await expect(row).toContainText(`Charged on ${WHISPERING_LEY}`);

    // ── The line's spell can be put right, and every charge copies it ──
    await openTab(page, MAP_TAB);
    await lineSpell(whispering).selectOption('Dweomerlight');
    await expect(lineSpell(whispering)).toHaveValue('Dweomerlight');
    await whispering.getByRole('button', { name: `Charge ${NEW_SHARD} on ${WHISPERING_LEY}` }).click();
    await openTab(page, INVENTORY_TAB);
    await expect(shardSpell(row)).toHaveValue('Dweomerlight');

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
    await expect(whispering.getByRole('combobox', { name: /teaches$/ })).toBeVisible();
    await whispering.getByRole('button', { name: `Cancel charging on ${WHISPERING_LEY}` }).click();
    await expect(whispering.getByRole('combobox', { name: /teaches$/ })).toHaveCount(0);
    // Cancelling records nothing on the line.
    await expect(lineSpell(whispering)).toHaveValue('');
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
      await expect(leyLineEditor(page, WHISPERING_LEY).getByRole('combobox', { name: /teaches$/ })).toBeVisible();
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
