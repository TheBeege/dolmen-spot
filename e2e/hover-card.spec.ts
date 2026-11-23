// Where the spell summary card goes: clear of the other spells' buttons in its
// list, clear of the controls in its own row, and clear of the Memorise menu
// whose rows the pointer walks down. The card is the hover preview; the panel
// the button opens is a separate thing and is checked in spell-info.spec.ts.
import type { Locator, Page } from '@playwright/test';
import { newProblems, type Where } from './known-issues';
import { findA11yProblems } from './support/a11y';
import { FIXTURES, loadFixture, openApp, openTab, seedCharacters, settle, TABS } from './support/app';
import { findLayoutProblems } from './support/layout';
import { A11Y_FONT_SIZE, expect, test, viewportAt } from './support/test';

const SPELLS_TAB = TABS.find((tab) => tab.id === 'spells')!;

const card = (page: Page) => page.locator('[data-hover-card]');

/** The known spells list, whose rows hold one info button each. */
const knownSpellsList = (page: Page) =>
  page.locator('[data-spell-list]').filter({ has: page.getByRole('button', { name: /\(known\)$/ }) });

/** The first list of rows on the tab: the prepared (or available) spells. */
const rowList = (page: Page) => page.locator('[data-spell-list]').filter({ has: page.locator('[data-spell-row]') }).first();

/** The Arcane Spell Reference's list, once the panel is open. */
const referenceList = (page: Page) =>
  page.locator('[data-spell-list]').filter({ has: page.getByRole('button', { name: /\(reference\)$/ }) });

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
  /** The list's own box, and the bottom of the page's sticky header. */
  list: { top: number; bottom: number };
  headerBottom: number;
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
    // The same controls the card keeps clear of (rowControls in SpellInfo).
    const coveredControls = row
      ? [...row.querySelectorAll('button, input, select, textarea, label, a[href]')]
          .filter((el) => !spell.contains(el))
          .filter((el) => overlaps(el.getBoundingClientRect()))
          .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim())
      : [];
    const listEl = anchor.closest('[data-spell-list]') as HTMLElement;
    const coveredButtons = [...listEl.querySelectorAll('[data-spell-info]')]
      .filter((el) => el !== spell)
      .filter((el) => [...el.querySelectorAll('button')].some((b) => overlaps(b.getBoundingClientRect()))).length;
    const listBox = listEl.getBoundingClientRect();
    const header = document.querySelector('header');
    const headerBox = header?.getBoundingClientRect();
    return {
      card: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      coveredControls,
      coveredButtons,
      list: { top: listBox.top, bottom: listBox.bottom },
      headerBottom: headerBox ? Math.max(0, headerBox.bottom) : 0,
      scrolls: cardEl.scrollHeight > cardEl.clientHeight + 1,
      cutOff: cardEl.scrollWidth > cardEl.clientWidth + 1,
    };
  }, handle!);
}

/**
 * That a capped card is still usable: it scrolls, and moving it to the end
 * keeps it there. A card's own scrolling must not count as a reason to place
 * it again (that lays it out at full height first, which throws away where the
 * player had scrolled to).
 */
async function expectKeepsItsScroll(page: Page): Promise<void> {
  const scrolled = await card(page).evaluate((cardEl) => {
    cardEl.scrollTop = 1e6;
    const bottom = cardEl.scrollTop;
    cardEl.dispatchEvent(new Event('scroll'));
    return { bottom, afterDispatch: cardEl.scrollTop };
  });
  expect(scrolled.bottom, 'a capped card scrolls at all').toBeGreaterThan(0);
  expect(scrolled.afterDispatch, 'its scroll was kept').toBeGreaterThan(0);
  await settle(page);
  expect(await card(page).evaluate((cardEl) => cardEl.scrollTop), 'and still kept a frame later').toBeGreaterThan(0);
}

// ── The card and its own row ──────────────────────────────────────────────
for (const [width, height, fontSize] of [
  [320, 800, 24],
  [375, 800, 24],
  [1280, 650, 24],
  [1280, 650, 16],
] as const) {
  test(`on a spell row at ${width}x${height} with ${fontSize}px text, it covers no control in that row`, async ({
    page,
    defaultFontSize,
  }) => {
    test.skip(defaultFontSize !== fontSize, `measured at ${fontSize}px`);
    await page.setViewportSize({ width, height });
    await openApp(page, FIXTURES.kitchenSink);
    await openTab(page, SPELLS_TAB);

    // Every list on the tab whose rows have an info button: the prepared
    // spells, the scrolls, the known spells and the studies.
    const lists = page.locator('[data-spell-list]').filter({ has: page.locator('[data-spell-row]') });
    const listCount = await lists.count();
    expect(listCount, 'lists with rows').toBeGreaterThan(1);

    const covered: string[] = [];
    let hovered = 0;
    let capped = 0;
    for (let list = 0; list < listCount; list += 1) {
      const buttons = lists.nth(list).locator('[data-spell-info] button');
      const count = await buttons.count();
      hovered += count;
      for (let i = 0; i < count; i += 1) {
        const button = buttons.nth(i);
        const label = await button.getAttribute('aria-label');
        await hoverFor(page, button);
        const measured = await whatItCovers(page, button);
        if (measured.coveredControls.length > 0) covered.push(`${label}: ${measured.coveredControls.join(', ')}`);
        // The card has to stay readable where it is put: the room above or
        // below the row is what it is capped to, and it scrolls rather than
        // clipping.
        expect(measured.card.right - measured.card.left, 'the card is wide enough to read').toBeGreaterThan(200);
        expect(measured.cutOff, 'no text cut off sideways').toBe(false);
        if (measured.scrolls) {
          capped += 1;
          // A card the cap made scroll must still reach the rest of its text.
          if (capped === 1) await expectKeepsItsScroll(page);
        }
      }
    }
    expect(hovered, 'rows with an info button to hover').toBeGreaterThan(30);
    expect(covered, 'cards covering a control in their own row').toEqual([]);
    // And the rows the cap is there for really do have Cast and Prep boxes.
    expect(
      await rowList(page).getByRole('checkbox', { name: /^(Cast|Prep) \(/ }).count(),
      'Cast and Prep boxes among those rows',
    ).toBeGreaterThan(3);
    // Where the card is taller than the room above or below its row, the cap
    // has to have done something: that is the case this test exists for.
    if (fontSize === 24) expect(capped, 'cards the cap made scroll').toBeGreaterThan(0);
  });
}

// ── The card and the list it is in ───────────────────────────────────────
test.describe('the card and the list it is in', () => {
  test.use({ viewport: viewportAt(375) });

  test('steps past the nearer end of the list rather than over the other spells', async ({ page, defaultFontSize }) => {
    test.skip(defaultFontSize !== 16, 'measured at the default font size');
    await openApp(page, FIXTURES.kitchenSink);
    await openTab(page, SPELLS_TAB);
    const buttons = knownSpellsList(page).locator('[data-spell-info] button');
    const count = await buttons.count();

    // A list that fills the phone's width has no room beside it. Near its top,
    // the card goes above it; near its bottom, below it.
    const nearTop = buttons.nth(1);
    await nearTop.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await settle(page);
    await hoverFor(page, nearTop);
    const top = await whatItCovers(page, nearTop);
    expect(top.coveredButtons, 'other spells’ buttons the card covers above the list').toBe(0);
    expect(top.card.bottom, 'the card sits above the list, clear of its spells').toBeLessThanOrEqual(top.list.top);
    expect(top.card.top, 'and below the page header').toBeGreaterThanOrEqual(top.headerBottom);

    const nearBottom = buttons.nth(count - 1);
    await nearBottom.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await settle(page);
    await hoverFor(page, nearBottom);
    const bottom = await whatItCovers(page, nearBottom);
    expect(bottom.coveredButtons, 'other spells’ buttons the card covers below the list').toBe(0);
    expect(bottom.card.top, 'the card sits below the list, clear of its spells').toBeGreaterThanOrEqual(bottom.list.bottom);
    expect(bottom.card.bottom, 'and on screen').toBeLessThanOrEqual(page.viewportSize()!.height);
  });
});

// ── The card and the Memorise menu ───────────────────────────────────────
for (const [width, fontSize, knownSpells] of [
  [768, 24, 5],
  [375, 16, 24],
  [320, 16, 24],
] as const) {
  test(`leaves every one of the Memorise menu’s info buttons reachable at ${width}px with ${fontSize}px text`, async ({
    page,
    defaultFontSize,
  }) => {
    test.skip(defaultFontSize !== fontSize, `measured at ${fontSize}px`);
    // Five spells in hand makes a menu short enough for the card to sit past
    // its end; more spells than that make one as tall as the window at 768px
    // with 24px text, which no card can get past (the PR notes the cost).
    const character = loadFixture(FIXTURES.kitchenSink);
    character.knownSpells = character.knownSpells.slice(0, knownSpells);
    await seedCharacters(page, [character]);
    await page.goto('/');
    await openTab(page, SPELLS_TAB);
    await page.getByRole('button', { name: /^\+ Memorise/ }).click();
    const menu = page.locator('[data-spell-list="whole"]');
    await expect(menu).toBeVisible();

    const buttons = menu.locator('[data-spell-info] button');
    const count = await buttons.count();
    if (knownSpells === 5) expect(count, 'spells in the menu').toBe(5);
    else expect(count, 'spells in the menu').toBeGreaterThan(5);

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

    // The menu open is a state no other test checks the layout and axe on.
    const where: Where = { tab: 'spells', width, fontSize: defaultFontSize };
    expect.soft(newProblems(await findLayoutProblems(page), where), 'layout problems with the menu open').toEqual([]);
    if (defaultFontSize === A11Y_FONT_SIZE) {
      expect.soft(newProblems(await findA11yProblems(page), where), 'accessibility problems with the menu open').toEqual([]);
    }
  });
}

// ── The Spell Reference's column of names ────────────────────────────────
for (const [width, fontSize] of [
  [320, 16],
  [375, 16],
  [768, 24],
] as const) {
  test(`keeps the reference’s names at full width at ${width}px with ${fontSize}px text`, async ({ page, defaultFontSize }) => {
    test.skip(defaultFontSize !== fontSize, `measured at ${fontSize}px`);
    await page.setViewportSize(viewportAt(width));
    await openApp(page, FIXTURES.kitchenSink);
    await openTab(page, SPELLS_TAB);
    await page.getByText('Arcane Spell Reference', { exact: true }).click();
    const list = referenceList(page);
    await expect(list).toBeVisible();

    // The Rank columns only narrow to leave the card a lane where there is
    // room for one: 41rem of list, less the card's 21rem. A phone, and a
    // tablet with big text, have no lane to give, so the names keep the width.
    const widths = await list.evaluate((listEl) => {
      const style = getComputedStyle(listEl);
      const content = listEl.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return [...listEl.querySelectorAll<HTMLElement>(':scope > div')].map((rank) => ({
        content: Math.round(content),
        rank: Math.round(rank.getBoundingClientRect().width),
      }));
    });
    expect(widths.length, 'Rank blocks in the reference').toBeGreaterThan(1);
    for (const { content, rank } of widths) {
      expect(rank, `a Rank column of ${rank}px in a list of ${content}px`).toBeGreaterThanOrEqual(content - 2);
    }
  });
}

// ── The card and the Spell Reference ─────────────────────────────────────
test.describe('the card and the Spell Reference', () => {
  test.use({ viewport: viewportAt(1280) });

  test('never covers another spell’s button in the reference', async ({ page, defaultFontSize }) => {
    test.skip(defaultFontSize !== 16, 'measured at the default font size');
    await openApp(page, FIXTURES.kitchenSink);
    await openTab(page, SPELLS_TAB);
    await page.getByText('Arcane Spell Reference', { exact: true }).click();
    const list = referenceList(page);
    await expect(list).toBeVisible();

    const count = await list.locator('[data-spell-info] button').count();
    expect(count, 'spells in the reference').toBeGreaterThan(24);

    // The first, middle and last spell of every Rank, since the last names of a
    // Rank are the ones whose card must go below its row or round the end.
    const covering: string[] = [];
    const ranks = list.locator(':scope > div');
    const rankCount = await ranks.count();
    expect(rankCount, 'Rank blocks in the reference').toBeGreaterThan(1);
    for (let rank = 0; rank < rankCount; rank += 1) {
      const inRank = ranks.nth(rank).locator('[data-spell-info] button');
      const n = await inRank.count();
      for (const i of new Set([0, Math.floor(n / 2), n - 1])) {
        if (i < 0) continue;
        const button = inRank.nth(i);
        const label = await button.getAttribute('aria-label');
        await hoverFor(page, button);
        const measured = await whatItCovers(page, button);
        if (measured.coveredButtons > 0) covering.push(`${label}: ${measured.coveredButtons}`);
      }
    }
    expect(covering, 'reference spells whose card covers another’s button').toEqual([]);

    // The reference open is a state no other test checks the layout and axe on,
    // and this PR changes its layout.
    const where: Where = { tab: 'spells', width: 1280, fontSize: defaultFontSize };
    expect.soft(newProblems(await findLayoutProblems(page), where), 'layout problems with the reference open').toEqual([]);
    if (defaultFontSize === A11Y_FONT_SIZE) {
      expect
        .soft(newProblems(await findA11yProblems(page), where), 'accessibility problems with the reference open')
        .toEqual([]);
    }
  });
});
