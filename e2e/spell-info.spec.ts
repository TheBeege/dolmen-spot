// The spell info buttons outside the Spells & Magic tab: the spells named in
// Inventory's spell books and on its scrolls, and the spell under study on
// Adventuring's Spell Study card. Each opens that spell's summary the way the
// Spells tab's buttons do, and each has a name of its own that says where the
// spell is, so a screen reader can tell one spell's button from another's.
// Also checks the page's layout and accessibility with a summary open.
import type { Locator, Page } from '@playwright/test';
import { getSpellSummary } from '../src/lib/gamedata';
import { newProblems } from './known-issues';
import { findA11yProblems } from './support/a11y';
import { FIXTURES, openApp, openTab, settle, TABS } from './support/app';
import { findLayoutProblems } from './support/layout';
import { A11Y_FONT_SIZE, expect, test, viewportAt, WIDTHS } from './support/test';

const INVENTORY_TAB = TABS.find((tab) => tab.id === 'inventory')!;
const CALENDAR_TAB = TABS.find((tab) => tab.id === 'calendar')!;

/** The Adventuring tab's Spell Study card: the box its heading sits in. */
function studyCard(page: Page): Locator {
  return page.getByText('🪄 Spell Study', { exact: true }).locator('..');
}

/** Every info button on the page, in the page's order. */
function infoButtons(page: Page): Locator {
  return page.locator('[data-spell-info] button');
}

/** The summary panel an info button opens, found through its aria-controls. */
async function panelOf(button: Locator): Promise<Locator> {
  const panelId = await button.getAttribute('aria-controls');
  expect(panelId, 'the button says which panel it opens').toBeTruthy();
  return button.page().locator(`[id="${panelId}"]`);
}

/** That the button's panel is closed, then opens with what the spell does. */
async function expectOpensSummary(button: Locator, spell: string): Promise<Locator> {
  const summary = getSpellSummary('arcane', spell);
  expect(summary, `${spell} has a summary to show`).toBeDefined();
  const panel = await panelOf(button);

  // toBeHidden also passes for a locator that matches nothing, so the panel
  // has to be there first for its being closed to mean anything.
  await expect(panel, 'the button’s panel is on the page').toHaveCount(1);
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Range:');
  await expect(panel).toContainText(summary!.range);
  await expect(panel).toContainText(summary!.effect);
  return panel;
}

test.describe('on the Inventory tab', () => {
  test.use({ viewport: viewportAt(1280) });

  test('every spell in a spell book and on a scroll has its own info button', async ({ page }) => {
    await openApp(page, FIXTURES.kitchenSink);
    await openTab(page, INVENTORY_TAB);

    // The kitchen-sink character's four spell books hold eleven spells between
    // them, and its two scrolls one each. Every one of them has a button, and
    // every button's name is its own.
    const buttons = infoButtons(page);
    await expect(buttons).toHaveCount(13);
    const names = await buttons.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
    expect(names, 'every info button is named').not.toContain(null);
    expect(new Set(names).size, 'no two buttons share a name').toBe(names.length);
    // One list per spell book, which is what the summary card keeps off.
    await expect(page.locator('[data-spell-list]')).toHaveCount(4);

    // A spell on a scroll, in the scroll's own row, opens that spell's summary.
    const fireball = page.getByRole('button', { name: 'What Fireball does (scroll)' });
    await expect(fireball).toBeVisible();
    const panel = await expectOpensSummary(fireball, 'Fireball');
    const scrollRow = page.locator('[data-spell-row="scroll"]').filter({ has: fireball });
    await expect(scrollRow, 'the button is in the scroll’s row').toHaveCount(1);
    await expect(scrollRow.locator(`[id="${await panel.getAttribute('id')}"]`), 'the summary is in that row').toBeVisible();

    // Pressing the button again closes the summary.
    await fireball.click();
    await expect(fireball).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();

    // And a spell in a spell book: its button is in that spell's own row,
    // beside the picker that names it.
    const shield = page.getByRole('button', { name: 'What Shield of Force does (in a spell book)' });
    await expect(shield).toBeVisible();
    const shieldRow = page.locator('[data-spell-row="spell-book"]').filter({ has: shield });
    await expect(shieldRow, 'the button is in the spell’s row').toHaveCount(1);
    await expect(shieldRow.getByRole('combobox'), 'the row’s picker names that spell').toHaveValue('Shield of Force');
    await expectOpensSummary(shield, 'Shield of Force');

    // Two books holding one spell: each button then says which copy it is, as
    // the Spells tab's rows do, rather than leaving two buttons with one name.
    await page.getByLabel(/^Spell 1 in The Grimoire of Hidden Doors/).selectOption('Crystal Resonance');
    await settle(page);
    await expect(
      page.getByRole('button', { name: 'What Crystal Resonance does (in a spell book, 1 of 2)' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'What Crystal Resonance does (in a spell book, 2 of 2)' }),
    ).toBeVisible();

    // Collapsing a book takes its spells' buttons with it, and the copy left in
    // the other book is numbered against the rows that are left: one, so no
    // number at all.
    await page.getByRole('button', { name: /^Collapse Oliphan's Folio/ }).click();
    await settle(page);
    await expect(infoButtons(page)).toHaveCount(10);
    await expect(
      page.getByRole('button', { name: 'What Crystal Resonance does (in a spell book)' }),
    ).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: /^What Crystal Resonance does \(in a spell book, / }),
    ).toHaveCount(0);

    // A row whose picker names no spell gets no button, and the button count
    // follows: clearing one leaves none behind.
    const grimoireRow = page.locator('[data-spell-row="spell-book"]').filter({
      has: page.getByLabel(/^Spell 1 in The Grimoire of Hidden Doors/),
    });
    await grimoireRow.getByRole('combobox').selectOption('');
    await settle(page);
    await expect(infoButtons(page)).toHaveCount(9);
    // The row is still there, with no button and no bare <span data-spell-info>
    // either: SpellInfo renders that span whenever it's mounted, so the guard
    // has to keep it from mounting at all, or the hover card would take it for
    // a spell and keep off a box the player can't see.
    await expect(grimoireRow, 'the row outlives its button').toHaveCount(1);
    await expect(grimoireRow.locator('[data-spell-info]'), 'an empty picker has no spell, so no slot for one').toHaveCount(0);
    await expect(grimoireRow.getByRole('button', { name: /^What / }), 'an empty picker has no info button').toHaveCount(0);

    // A container's books number the same way: give one of the Sack's spells a
    // spell the Backpack's books already hold, and both say which copy they are.
    await page.getByLabel(/^Spell 1 in A Treatise on Unmaking/).selectOption('Wall of Fire');
    await settle(page);
    await expect(
      page.getByRole('button', { name: 'What Wall of Fire does (in a spell book, 1 of 2)' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'What Wall of Fire does (in a spell book, 2 of 2)' }),
    ).toBeVisible();

    // Collapsing the container takes its books' and scrolls' buttons with it,
    // and the copy left in the other container is numbered against the rows
    // that are left: one, so no number at all. The header that collapses it is
    // a clickable div with no role of its own, and the × at its end would
    // delete the container, so click its name.
    const backpackHeader = page.locator('div.cursor-pointer').filter({ hasText: 'Backpack' });
    await backpackHeader.getByText('Backpack').click();
    await settle(page);
    await expect(infoButtons(page)).toHaveCount(3);
    await expect(
      page.getByRole('button', { name: 'What Web does (scroll)' }),
      'the collapsed Backpack took its scroll',
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'What Wall of Fire does (in a spell book)' }),
      'the Sack’s copy is numbered against the rows still shown',
    ).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: /^What Wall of Fire does \(in a spell book, / }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'What Project Image does (in a spell book)' }),
      'the Sack’s book keeps its own',
    ).toHaveCount(1);
  });

  test('resting on the button shows the same summary in a card', async ({ page }) => {
    await openApp(page, FIXTURES.kitchenSink);
    await openTab(page, INVENTORY_TAB);
    const web = page.getByRole('button', { name: 'What Web does (scroll)' });
    await expect(page.locator('[data-hover-card]')).toHaveCount(0);

    await web.hover();
    const card = page.locator('[data-hover-card]');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Web');
    await expect(card).toContainText(getSpellSummary('arcane', 'Web')!.effect);

    // Escape dismisses it, as the Spells tab's cards do (WCAG 1.4.13).
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
  });
});

test.describe('on the Adventuring tab', () => {
  test.use({ viewport: viewportAt(1280) });

  test('the spell under study has an info button of its own', async ({ page }) => {
    await openApp(page, FIXTURES.lowLevelMagician);
    await openTab(page, CALENDAR_TAB);

    // The study card is the only place this tab names a spell, so its one
    // button says so ("studying"), as the Spells tab's study card does.
    await expect(page.getByRole('button', { name: /^What .* does \(studying\)$/ })).toHaveCount(1);
    const button = page.getByRole('button', { name: 'What Polymorph does (studying)' });
    await expect(button).toBeVisible();

    // It's in the Spell Study card, and it opens that spell's summary.
    const card = studyCard(page);
    await expect(card.getByRole('button', { name: 'What Polymorph does (studying)' })).toBeVisible();
    const panel = await expectOpensSummary(button, 'Polymorph');
    await expect(card.locator(`[id="${await panel.getAttribute('id')}"]`), 'the summary is in the card').toBeVisible();
  });
});

for (const width of WIDTHS) {
  test.describe(`with a spell's summary open at ${width}px`, () => {
    test.use({ viewport: viewportAt(width) });

    test('nothing spills and axe finds no new problem', async ({ page, defaultFontSize }) => {
      await openApp(page, FIXTURES.kitchenSink);

      // A spell book's summary, open in its row.
      await openTab(page, INVENTORY_TAB);
      await expectOpensSummary(
        page.getByRole('button', { name: 'What Shield of Force does (in a spell book)' }),
        'Shield of Force',
      );
      await settle(page);
      const inventory = { tab: 'inventory' as const, width, fontSize: defaultFontSize };
      expect.soft(newProblems(await findLayoutProblems(page), inventory), 'layout problems with a spell book’s summary open').toEqual([]);
      // The layout check runs at every width and every font size. axe runs at
      // the matrix's smallest font size only, as playwright.config.ts keeps
      // a11y.spec.ts out of the other projects: its findings barely change
      // with the font size.
      if (defaultFontSize === A11Y_FONT_SIZE) {
        expect.soft(newProblems(await findA11yProblems(page), inventory), 'accessibility problems with a spell book’s summary open').toEqual([]);
      }

      // The Spell Study card's summary, open on Adventuring.
      await openTab(page, CALENDAR_TAB);
      await expectOpensSummary(page.getByRole('button', { name: 'What Paralysation does (studying)' }), 'Paralysation');
      await settle(page);
      const calendar = { tab: 'calendar' as const, width, fontSize: defaultFontSize };
      expect.soft(newProblems(await findLayoutProblems(page), calendar), 'layout problems with a study’s summary open').toEqual([]);
      if (defaultFontSize === A11Y_FONT_SIZE) {
        expect.soft(newProblems(await findA11yProblems(page), calendar), 'accessibility problems with a study’s summary open').toEqual([]);
      }
    });
  });
}
