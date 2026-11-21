import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type { InPageHelpers } from './in-page';

/** axe's rules for WCAG 2.0 and 2.1, levels A and AA. */
const WCAG_21_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export interface A11yProblem {
  /** The axe rule (e.g. `color-contrast`, `label`), or `placeholder-contrast`. */
  check: string;
  /**
   * The element, as `Section › tag "name"`, then for a form field the text of
   * a <label> that isn't tied to it, and for a contrast problem the class (or
   * inline style) that sets its text colour.
   */
  element: string;
  /** What's wrong, e.g. the contrast axe measured. */
  detail: string;
}

/**
 * Accessibility problems on the page as it is now, one per element: axe's
 * serious and critical WCAG 2.1 AA violations, and placeholder text below AA
 * contrast, which axe doesn't check.
 */
export async function findA11yProblems(page: Page): Promise<A11yProblem[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_21_AA).analyze();
  const nodes = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .flatMap((v) => v.nodes.map((node) => ({ rule: v.id, help: v.help, node })));
  const { elements, placeholders } = await page.evaluate(
    // axe gives one selector per frame; the app has no frames, so one each.
    (targets) => {
      const helpers = (window as unknown as { __e2e: InPageHelpers }).__e2e;
      return { elements: helpers.describeTargets(targets), placeholders: helpers.findPlaceholderProblems() };
    },
    nodes.map(({ rule, node }) => ({ selector: String(node.target[0]), withColor: rule === 'color-contrast' })),
  );
  return [
    ...nodes.map(({ rule, help, node }, i) => ({
      check: rule,
      element: elements[i],
      detail: `${help}. ${(node.failureSummary ?? '').replace(/^Fix (any|all) of the following:\s*/, '').replace(/\s+/g, ' ').trim()}`,
    })),
    ...placeholders,
  ];
}
