// Layout: on every tab, with each fixture, at every width and font size of the
// matrix, the page doesn't scroll sideways, no control sticks out of its card
// or is squeezed to nothing, and no box — a table, a grid, anything with a
// background or a border all round — has an edge past the card that holds it
// (see e2e/support/layout.ts).
import { newProblems } from './known-issues';
import { ALL_FIXTURES, openApp, openTab, TABS } from './support/app';
import { findLayoutProblems } from './support/layout';
import { expect, test, viewportAt, WIDTHS } from './support/test';

for (const width of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: viewportAt(width) });

    for (const fixture of ALL_FIXTURES) {
      test(`every tab fits, with the ${fixture} character`, async ({ page, defaultFontSize }) => {
        await openApp(page, fixture);
        for (const tab of TABS) {
          await openTab(page, tab);
          const problems = newProblems(await findLayoutProblems(page), { tab: tab.id, width, fontSize: defaultFontSize });
          expect.soft(problems, `layout problems on ${tab.label}`).toEqual([]);
        }
      });
    }
  });
}
