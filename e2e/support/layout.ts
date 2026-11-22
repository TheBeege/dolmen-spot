import type { Page } from '@playwright/test';
import type { InPageHelpers } from './in-page';

export interface LayoutProblem {
  /**
   * - `page-overflow`: the page scrolls sideways. There's one problem for each
   *   of the outermost elements that reach past its right edge.
   * - `spills-card`: a control (button, field, link...) sticks out of the card
   *   that holds it, or of any other box with a background or a border all
   *   round, or is cut off by one that hides what doesn't fit.
   * - `squeezed-control`: a control is on the page but has no width left, so
   *   it can't be seen or clicked (say, a flex item that shrank to nothing).
   */
  check: 'page-overflow' | 'spills-card' | 'squeezed-control';
  /** The element, as `Section › tag "name"`: the heading of its section, then the element. */
  element: string;
  detail: string;
}

/**
 * Horizontal layout problems on the page as it is now: the page scrolling
 * sideways, and controls sticking out of their cards or squeezed to nothing.
 *
 * Left out: anything inside a container that scrolls sideways by design (such
 * as the tab bar), and the map's drawing (inside an <svg>), a canvas that pans
 * and zooms, so its hexes run past its edges.
 */
export async function findLayoutProblems(page: Page): Promise<LayoutProblem[]> {
  return page.evaluate(() => (window as unknown as { __e2e: InPageHelpers }).__e2e.findLayoutProblems());
}
