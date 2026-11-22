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
// What it covers is what the layout and accessibility tests check on a tab as
// it first opens: every tab with every fixture, at every width and font size of
// the layout matrix, and at the widths and font size of the accessibility
// matrix. States a spec opens by hand — the map's kind picker, a dialog — are
// not part of it, so an entry for a problem only such a state shows would look
// unused: add that state here if one is ever needed.
//
// It makes its own pages rather than using the `page` fixture, so it does the
// two things that fixture does for every test by itself: it checks that the
// project's settings are in force — before the app loads, and again on every
// tab it opens — and it watches each page for page and console errors.
import { expect, test } from '@playwright/test';
import { describeKnownIssue, KNOWN_ISSUES, knownIssuesFor, type BrowserName, type KnownIssue, type Problem, type Where } from './known-issues';
import { findA11yProblems } from './support/a11y';
import { ALL_FIXTURES, openApp, openTab, TABS } from './support/app';
import { installInPageHelpers } from './support/in-page';
import { findLayoutProblems } from './support/layout';
import { A11Y_FONT_SIZE, A11Y_WIDTHS, expectMatrixSettings, FONT_SIZES, viewportAt, WIDTHS, watchForErrors } from './support/test';

/** The widths whose accessibility problems the suite can leave to an entry. */
const A11Y_STATES = new Set<number>(A11Y_WIDTHS);

test('every known issue still matches a problem', async ({ browser, browserName, baseURL }, testInfo) => {
  // One process has to see the whole matrix, so this is one long test: it gets
  // its own timeout rather than the suite's 30s, and the CI job's timeout is
  // longer still, so this one reports first.
  test.setTimeout(20 * 60_000);
  // It sets the browser's font size through CDP, which only Chromium has, and
  // the entries it can require are the ones Chromium shows. Playwright.config.ts
  // keeps the file in the Chromium project at A11Y_FONT_SIZE.
  expect(browserName, 'this audit runs in Chromium, whose settings it sets through CDP').toBe('chromium');

  /** The known issues a problem matched, by identity: an entry in KNOWN_ISSUES. */
  const matched = new Set<KnownIssue>();
  const visit = async (where: Where, findProblems: () => Promise<Problem[]>) => {
    for (const problem of await findProblems()) {
      for (const issue of knownIssuesFor(problem, where)) matched.add(issue);
    }
  };

  const visited = { layout: 0, a11y: 0 };
  for (const fontSize of FONT_SIZES) {
    for (const width of WIDTHS) {
      for (const fixture of ALL_FIXTURES) {
        const at = `${fixture} at ${width}px and ${fontSize}px`;
        // A page of its own per fixture: a seeded character is only saved on a
        // page's first load, so one page can't show five characters.
        const context = await browser.newContext({ viewport: viewportAt(width), baseURL });
        const page = await context.newPage();
        try {
          // Chrome's Settings > Appearance > Font size, which also sets the
          // fixed-width size 3px lower. Set before the first check measures it.
          const cdp = await context.newCDPSession(page);
          await cdp.send('Page.setFontSizes', { fontSizes: { standard: fontSize, fixed: fontSize - 3 } });
          await expectMatrixSettings(page, browserName, fontSize);
          await page.addInitScript(installInPageHelpers);
          const errors: string[] = [];
          watchForErrors(page, errors);
          await openApp(page, fixture);

          for (const tab of TABS) {
            await openTab(page, tab);
            const where = { tab: tab.id, width, fontSize };
            await visit(where, () => findLayoutProblems(page));
            visited.layout++;
            // The accessibility tests run at A11Y_WIDTHS and A11Y_FONT_SIZE
            // (playwright.config.ts), so these are the states whose problems
            // they can leave to an entry.
            if (fontSize === A11Y_FONT_SIZE && A11Y_STATES.has(width)) {
              await visit(where, () => findA11yProblems(page));
              visited.a11y++;
            }
            // Again on the sheet, as the fixture does — on every tab, so a page
            // style that pinned the root font size on any one of them is caught,
            // rather than only the tab the walk happens to end on.
            await expectMatrixSettings(page, browserName, fontSize);
          }

          expect(errors, `page and console errors with ${at}`).toEqual([]);
        } finally {
          await context.close();
        }
      }
    }
  }

  // The walk is only worth what it covered: a layout check per tab, fixture,
  // width and font size, and an accessibility check per tab, fixture and
  // accessibility width at its font size. A refactor that skips a width would
  // otherwise leave this green with half the matrix unwalked.
  expect(visited, `${TABS.length} tabs × ${ALL_FIXTURES.length} fixtures, walked in full`).toEqual({
    layout: TABS.length * ALL_FIXTURES.length * WIDTHS.length * FONT_SIZES.length,
    a11y: TABS.length * ALL_FIXTURES.length * A11Y_WIDTHS.length,
  });

  // An entry that leaves out this browser can't be required to match here; one
  // that names no browser at all is every browser's, so it can.
  const required = KNOWN_ISSUES.filter((issue) => issue.browsers === undefined || issue.browsers.includes(browserName as BrowserName));
  const requiredMatched = required.filter((issue) => matched.has(issue));
  const unused = required.filter((issue) => !matched.has(issue));
  // And an entry that leaves Chromium out must not match here either, or its
  // declaration is wrong: the problem does show in this browser.
  const misdeclared = KNOWN_ISSUES.filter((issue) => !required.includes(issue) && matched.has(issue));
  const otherBrowserOnly = KNOWN_ISSUES.length - required.length;
  testInfo.annotations.push({ type: 'known issues', description: `${requiredMatched.length} of ${required.length} matched` });
  const shared = `${TABS.length} tabs × ${ALL_FIXTURES.length} fixtures`;
  console.log(
    `known-issues audit: layout ${visited.layout} checks (${shared} × ${WIDTHS.length} widths × ${FONT_SIZES.length} font sizes), ` +
      `accessibility ${visited.a11y} checks (${shared} × ${A11Y_WIDTHS.length} widths × ${A11Y_FONT_SIZE}px); ` +
      `${requiredMatched.length} of ${required.length} known issues matched a problem, ${unused.length} matched nothing` +
      (otherBrowserOnly ? ` (${otherBrowserOnly} left out, as this browser is not one of theirs)` : ''),
  );
  expect(misdeclared.map(describeKnownIssue), 'these entries leave this browser out, but a problem in it matches them: widen them').toEqual([]);
  expect(unused.map(describeKnownIssue), 'known issues no problem matches any more: delete the entry (or fix the audit, if it misses the state)').toEqual([]);
});
