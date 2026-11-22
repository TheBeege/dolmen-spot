// The known issues audit: every entry in e2e/known-issues.ts must still match a
// problem, or it is a tolerance the app no longer needs — and a fixed problem
// that keeps its entry would stay unfixed in the tests' eyes. Nothing else
// notices: the layout and accessibility tests pass over problems an entry
// matches, so the day one stops matching, they simply stop covering it.
//
// It walks the matrix itself, in one process — the suite runs it across
// parallel workers, so no test sees more than its own tab — and fails with the
// entries that matched nothing. `npm run audit:known-issues` runs it (see
// "Browser Tests" in AGENTS.md), in Chromium alone: it sets the browser's own
// font size through Chromium's settings, as e2e/support/test.ts does, so it
// can't do the same in WebKit. An entry only WebKit shows says so with
// `browsers: ['webkit']`, and this leaves it alone.
//
// What it covers is what the layout and accessibility tests cover: every tab as
// it first opens, at every width and font size of the layout matrix, and every
// tab × fixture × width for the accessibility ones. States a spec opens by hand
// (the map's kind picker, say) are not part of it, so an entry for a problem
// only such a state shows would look unused: add that state here if one is ever
// needed.
import { expect, test, type Browser } from '@playwright/test';
import { describeKnownIssue, KNOWN_ISSUES, knownIssuesFor, type KnownIssue, type Where } from './known-issues';
import { findA11yProblems } from './support/a11y';
import { ALL_FIXTURES, openApp, openTab, TABS } from './support/app';
import { installInPageHelpers } from './support/in-page';
import { findLayoutProblems } from './support/layout';
import { viewportAt, WIDTHS } from './support/test';

/** The matrix's default font sizes (playwright.config.ts). */
const FONT_SIZES = [16, 24] as const;

/** A page at a width and font size of the matrix, set the way the page fixture sets them. */
async function matrixPage(browser: Browser, baseURL: string, width: number, fontSize: number) {
  const context = await browser.newContext({ viewport: viewportAt(width), baseURL });
  const page = await context.newPage();
  // Chrome's Settings > Appearance > Font size, which also sets the fixed-width
  // size 3px lower.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.setFontSizes', { fontSizes: { standard: fontSize, fixed: fontSize - 3 } });
  // The audit is only worth as much as the setting: a font size that didn't
  // take would hide the problems of the size it ran at instead.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), "the browser's default font size").toBe(`${fontSize}px`);
  await page.addInitScript(installInPageHelpers);
  return { context, page };
}

// Playwright.config.ts keeps this file out of the WebKit projects, so it always
// runs in Chromium: there is no other browser here to skip.
test('every known issue still matches a problem', async ({ browser, baseURL }, testInfo) => {
  // One process has to see the whole matrix, so this is one long test: it gets
  // its own timeout rather than the suite's 30s.
  test.setTimeout(20 * 60_000);

  /** The known issues a problem matched, by identity: an entry in KNOWN_ISSUES. */
  const matched = new Set<KnownIssue>();
  const visit = async (where: Where, findProblems: () => Promise<{ check: string; element: string; detail: string }[]>) => {
    for (const problem of await findProblems()) {
      for (const issue of knownIssuesFor(problem, where)) matched.add(issue);
    }
  };

  const states = { layout: 0, a11y: 0 };
  for (const fontSize of FONT_SIZES) {
    for (const width of WIDTHS) {
      for (const fixture of ALL_FIXTURES) {
        // A page of its own per fixture: a seeded character is only saved on a
        // page's first load, so one page can't show five characters.
        const { context, page } = await matrixPage(browser, baseURL!, width, fontSize);
        try {
          await openApp(page, fixture);
          for (const tab of TABS) {
            await openTab(page, tab);
            const where = { tab: tab.id, width, fontSize };
            await visit(where, () => findLayoutProblems(page));
            states.layout++;
            // axe looks at elements and colours, which a bigger font barely
            // changes, so the matrix runs it at 16px only (playwright.config.ts).
            if (fontSize !== 16) continue;
            await visit(where, () => findA11yProblems(page));
            states.a11y++;
          }
        } finally {
          await context.close();
        }
      }
    }
  }

  // An entry that leaves out Chromium can't be required to match here; one that
  // names no browser at all is every browser's, so it can.
  const required = KNOWN_ISSUES.filter((issue) => issue.browsers === undefined || issue.browsers.includes('chromium'));
  const unused = required.filter((issue) => !matched.has(issue));
  const webkitOnly = KNOWN_ISSUES.filter((issue) => !required.includes(issue));
  testInfo.annotations.push({ type: 'known issues', description: `${matched.size} of ${required.length} matched` });
  console.log(
    `known-issues audit: ${states.layout} layout and ${states.a11y} accessibility checks over ${WIDTHS.length} widths and ${FONT_SIZES.length} font sizes; ` +
      `${matched.size} of ${required.length} known issues matched a problem, ${unused.length} matched nothing` +
      (webkitOnly.length ? ` (${webkitOnly.length} WebKit-only left out)` : ''),
  );
  expect(unused.map(describeKnownIssue), 'known issues no problem matches any more: delete the entry (or fix the audit, if it misses the state)').toEqual([]);
});
