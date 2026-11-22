// Accessibility: axe's WCAG 2.1 AA rules on every tab, with each fixture, plus
// placeholder contrast (see e2e/support/a11y.ts). Serious and critical
// problems fail.
//
// It runs at the narrowest and widest widths only, and only at the default
// font size (playwright.config.ts): axe looks at the page's elements and
// colours, which barely change in between.
import { newProblems } from './known-issues';
import { ALL_FIXTURES, openApp, openTab, TABS } from './support/app';
import { findA11yProblems } from './support/a11y';
import { expect, test, viewportAt } from './support/test';

const A11Y_WIDTHS = [320, 1280];

for (const width of A11Y_WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: viewportAt(width) });

    for (const fixture of ALL_FIXTURES) {
      test(`every tab passes axe, with the ${fixture} character`, async ({ page, defaultFontSize }) => {
        await openApp(page, fixture);
        for (const tab of TABS) {
          await openTab(page, tab);
          const problems = newProblems(await findA11yProblems(page), { tab: tab.id, width, fontSize: defaultFontSize });
          expect.soft(problems, `accessibility problems on ${tab.label}`).toEqual([]);
        }
      });
    }
  });
}
