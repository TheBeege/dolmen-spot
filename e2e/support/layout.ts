import type { Page } from '@playwright/test';
import type { InPageHelpers, LayoutProblem } from './in-page';

/** A layout problem: `page-overflow`, `spills-card`, `box-spills-card` or `squeezed-control` (see in-page.ts). */
export type { LayoutProblem };

/**
 * Horizontal layout problems on the page as it is now: the page scrolling
 * sideways, controls sticking out of their cards or squeezed to nothing, and
 * boxes (a table, a grid, a div with a background) with an edge past the card
 * that holds them.
 *
 * Left out: anything inside a container that scrolls sideways by design (such
 * as the tab bar), and the map's drawing (inside an <svg>), a canvas that pans
 * and zooms, so its hexes run past its edges.
 */
export async function findLayoutProblems(page: Page): Promise<LayoutProblem[]> {
  return page.evaluate(() => (window as unknown as { __e2e: InPageHelpers }).__e2e.findLayoutProblems());
}
