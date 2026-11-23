// Where the spell summary card goes: clear of the other spells' buttons in its
// list, clear of the controls in its own row, and clear of the Memorise menu
// whose rows the pointer walks down. The card is the hover preview; the panel
// the button opens is a separate thing and is checked in spell-info.spec.ts.
import type { Locator, Page } from '@playwright/test';
import { FIXTURES, loadFixture, openApp, openTab, seedCharacters, settle, TABS } from './support/app';
import { expect, test, viewportAt } from './support/test';

const SPELLS_TAB = TABS.find((tab) => tab.id === 'spells')!;

const card = (page: Page) => page.locator('[data-hover-card]');

/** The known spells list, whose rows hold one info button each. */
const knownSpellsList = (page: Page) =>
  page.locator('[data-spell-list]').filter({ has: page.getByRole('button', { name: /\(known\)$/ }) });

/** The first list of rows on the tab: the prepared (or available) spells. */
const rowList = (page: Page) => page.locator('[data-spell-list]').filter({ has: page.locator('[data-spell-row]') }).first();

/** What a button's card is titled, from the button's own name. */
function titleOf(label: string | null): string {
  return /^What (.*) does(?: \(.*\))?$/.exec(label ?? '')?.[1] ?? '';
}

/**
 * Dismiss the card showing, if any. A card left over from the last hover can
 * cover the button being measured (which is one of the things being fixed), so
 * each one starts from none.
 */
async function dismissCard(page: Page): Promise<void> {
  if ((await card(page).count()) > 0) await page.keyboard.press('Escape');
  await expect(card(page), 'no card before the next hover').toHaveCount(0);
}

/** Rest the pointer on `button` until its card shows, and leave it there. */
async function hoverFor(page: Page, button: Locator): Promise<void> {
  const title = titleOf(await button.getAttribute('aria-label'));
  await dismissCard(page);
  await button.hover();
  await expect(card(page).locator('.font-semibold')).toHaveText(title);
}

/** The card's box and the boxes a property is measured against, in the page. */
interface Confrontation {
  card: { left: number; top: number; right: number; bottom: number };
  /** The text of each control of the anchor's own row the card covers. */
  coveredControls: string[];
  /** How many other spells' info buttons in the same list the card covers. */
  coveredButtons: number;
  /** The list's own box. */
  list: { top: number; bottom: number };
  /** Whether the card has to be scrolled to read it all. */
  scrolls: boolean;
  /** Whether any of its text is cut off sideways. */
  cutOff: boolean;
}

/** What the card showing now covers, measured around the info button it belongs to. */
async function whatItCovers(page: Page, button: Locator): Promise<Confrontation> {
  const handle = await button.elementHandle();
  return page.evaluate((anchor: Element) => {
    const cardEl = document.querySelector('[data-hover-card]') as HTMLElement;
    const box = cardEl.getBoundingClientRect();
    const overlaps = (r: DOMRect) => box.left < r.right && r.left < box.right && box.top < r.bottom && r.top < box.bottom;
    const spell = anchor.closest('[data-spell-info]') as HTMLElement;
    const row = anchor.closest('[data-spell-row]');
    const coveredControls = row
      ? [...row.querySelectorAll('button, input, select, textarea, a[href]')]
          .filter((el) => !spell.contains(el))
          .filter((el) => overlaps(el.getBoundingClientRect()))
          .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim())
      : [];
    const listEl = anchor.closest('[data-spell-list]') as HTMLElement;
    const coveredButtons = [...listEl.querySelectorAll('[data-spell-info]')]
      .filter((el) => el !== spell)
      .filter((el) => [...el.querySelectorAll('button')].some((b) => overlaps(b.getBoundingClientRect()))).length;
    const listBox = listEl.getBoundingClientRect();
    return {
      card: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      coveredControls,
      coveredButtons,
      list: { top: listBox.top, bottom: listBox.bottom },
      scrolls: cardEl.scrollHeight > cardEl.clientHeight + 1,
      cutOff: cardEl.scrollWidth > cardEl.clientWidth + 1,
    };
  }, handle!);
}

test.describe('the card and its own row', () => {
  // The worst case: the browser's largest text in the narrowest window the
  // tests use, where the card is at its tallest and its row's controls the
  // closest together.
  test.use({ viewport: { width: 320, height: 800 } });

  test('never covers the Cast, Prep or Notes of the row it belongs to', async ({ page, defaultFontSize }) => {
    test.skip(defaultFontSize !== 24, 'measured with the largest text, where the card is tallest');
    await openApp(page, FIXTURES.kitchenSink);
    await openTab(page, SPELLS_TAB);

    const buttons = rowList(page).locator('[data-spell-info] button');
    const count = await buttons.count();
    expect(count, 'rows with an info button to hover').toBeGreaterThan(10);

    const covered: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const button = buttons.nth(i);
      const label = await button.getAttribute('aria-label');
      await hoverFor(page, button);
      const measured = await whatItCovers(page, button);
      if (measured.coveredControls.length > 0) covered.push(`${label}: ${measured.coveredControls.join(', ')}`);
      // The card has to stay readable where it is put: the room above or below
      // the row is what it is capped to, and it scrolls rather than clipping.
      expect(measured.card.right - measured.card.left, 'the card is wide enough to read').toBeGreaterThan(200);
      expect(measured.cutOff, 'no text cut off sideways').toBe(false);
    }
    expect(covered, 'cards covering a control in their own row').toEqual([]);
    // And the rows the cap is there for really do have Cast and Prep boxes.
    expect(
      await rowList(page).getByRole('checkbox', { name: /^(Cast|Prep) \(/ }).count(),
      'Cast and Prep boxes among those rows',
    ).toBeGreaterThan(3);
  });
});

test.describe('the card and the list it is in', () => {
  test.use({ viewport: viewportAt(375) });

  test('steps past the end of the list rather than over the other spells', async ({ page, defaultFontSize }) => {
    test.skip(defaultFontSize !== 16, 'measured at the default font size');
    await openApp(page, FIXTURES.kitchenSink);
    await openTab(page, SPELLS_TAB);

    // Near the top of a list that fills the phone's width, so nowhere beside
    // it is clear and the list's top is still on screen.
    const button = knownSpellsList(page).locator('[data-spell-info] button').nth(1);
    await button.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await settle(page);
    await hoverFor(page, button);
    const measured = await whatItCovers(page, button);

    expect(measured.coveredButtons, 'other spells’ buttons the card covers').toBe(0);
    expect(measured.card.bottom, 'the card sits above the list, clear of its spells').toBeLessThanOrEqual(measured.list.top);
    expect(measured.card.top, 'and on screen').toBeGreaterThanOrEqual(0);
  });
});

test.describe('the card and the Memorise menu', () => {
  // Large text on a tablet: the menu and the card are both too wide for the
  // card to go beside the menu.
  test.use({ viewport: { width: 768, height: 800 } });

  test('leaves every one of the menu’s info buttons reachable', async ({ page, defaultFontSize }) => {
    test.skip(defaultFontSize !== 24, 'measured with the largest text');
    // Five spells in hand: a menu short enough for the card to sit past its
    // end, which is where it belongs, rather than over the rows it has to
    // leave reachable.
    const character = loadFixture(FIXTURES.kitchenSink);
    character.knownSpells = character.knownSpells.slice(0, 5);
    await seedCharacters(page, [character]);
    await page.goto('/');
    await openTab(page, SPELLS_TAB);
    await page.getByRole('button', { name: /^\+ Memorise/ }).click();
    const menu = page.locator('[data-spell-list="whole"]');
    await expect(menu).toBeVisible();

    const buttons = menu.locator('[data-spell-info] button');
    const count = await buttons.count();
    expect(count, 'spells in the menu').toBe(5);

    // Walking the menu the way a player does, down and then back up: straight
    // onto each button, leaving the last row's card where it is.
    const blocked: string[] = [];
    const walk = async (order: number[], direction: string) => {
      for (const i of order) {
        const button = buttons.nth(i);
        const label = await button.getAttribute('aria-label');
        await button.evaluate((el) => el.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
        await settle(page);
        const at = await button.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
        });
        await page.mouse.move(at.x, at.y);
        // A card shows 250 ms after the pointer rests, so wait for one before
        // asking what is on top: the row's own card if the pointer reached its
        // button, or the last row's card, which has stayed because the pointer
        // landed on it instead.
        await expect(card(page)).toHaveCount(1);
        const onCard = await page.evaluate(
          ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-hover-card]'),
          at,
        );
        if (onCard) blocked.push(`${label} (${direction})`);
      }
    };
    const down = Array.from({ length: count }, (_, i) => i);
    await walk(down, 'down');
    await walk([...down].reverse(), 'up');
    expect(blocked, 'menu buttons the card stood in front of').toEqual([]);
  });
});

test.describe('the card and the Spell Reference', () => {
  test.use({ viewport: viewportAt(1280) });

  test('never covers another spell’s button in the reference', async ({ page, defaultFontSize }) => {
    test.skip(defaultFontSize !== 16, 'measured at the default font size');
    await openApp(page, FIXTURES.kitchenSink);
    await openTab(page, SPELLS_TAB);
    await page.getByText('Arcane Spell Reference', { exact: true }).click();
    const list = page.locator('[data-spell-list]').filter({ has: page.getByRole('button', { name: /\(reference\)$/ }) });
    await expect(list).toBeVisible();

    const buttons = list.locator('[data-spell-info] button');
    const count = await buttons.count();
    expect(count, 'spells in the reference').toBeGreaterThan(24);

    // A sample across the whole reference, every Rank included.
    const covering: string[] = [];
    for (let i = 0; i < count; i += Math.ceil(count / 12)) {
      const button = buttons.nth(i);
      const label = await button.getAttribute('aria-label');
      await hoverFor(page, button);
      const measured = await whatItCovers(page, button);
      if (measured.coveredButtons > 0) covering.push(`${label}: ${measured.coveredButtons}`);
    }
    expect(covering, 'reference spells whose card covers another’s button').toEqual([]);
  });
});
