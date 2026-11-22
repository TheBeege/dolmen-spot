import type { TabId } from './support/app';

/**
 * Problems the app already had when the browser tests were added. The layout
 * and accessibility tests pass over these, so they fail only on new problems.
 *
 * Each entry is follow-up work. When you fix one, delete its entry, and the
 * tests keep it fixed. Don't add one to get your own change through: fix the
 * problem. Add one only for a problem the app already had (one a new fixture
 * shows, say), and list it in your PR as follow-up work.
 *
 * An entry covers a problem when the problem's check is in `checks`, it's on
 * one of `tabs`, `match` matches its `element — detail` (as a failing test
 * prints it), and the window and font size fit `maxWidth` and `fontSizes`.
 */
export interface KnownIssue {
  /** What's wrong, in words: the follow-up to fix. */
  issue: string;
  /** The checks it fails: `page-overflow`, `spills-card` or `squeezed-control` (layout.ts), an axe rule id, or `placeholder-contrast`. */
  checks: string[];
  tabs: TabId[];
  match: RegExp;
  /** Only in windows this wide or narrower. */
  maxWidth?: number;
  /** Only at these default font sizes. */
  fontSizes?: number[];
}

export const KNOWN_ISSUES: KnownIssue[] = [
  // ── Contrast ─────────────────────────────────────────────────────────
  {
    issue: 'Map: the "Del" buttons of a ley line, a point of interest and a fairy door are dark red on dark blue (1.9:1; hovering them is better but still short, 2.9:1), and their accessible names ("Delete ley line …", "Delete POI …", "Delete fairy door …") don\'t contain the word they show. No test opens a fairy door\'s editor, so this entry matches the other two.',
    checks: ['color-contrast', 'label-content-name-mismatch'],
    tabs: ['map'],
    match: /^(Ley Lines & Crossings|Points of Interest) › button\[type=button\] "Delete (ley line|POI) /,
  },
];

export interface Problem {
  check: string;
  element: string;
  detail: string;
}

export interface Where {
  tab: TabId;
  width: number;
  fontSize: number;
}

export function isKnownIssue(problem: Problem, where: Where): boolean {
  return KNOWN_ISSUES.some(
    (known) =>
      known.checks.includes(problem.check) &&
      known.tabs.includes(where.tab) &&
      known.match.test(`${problem.element} — ${problem.detail}`) &&
      (known.maxWidth === undefined || where.width <= known.maxWidth) &&
      (known.fontSizes === undefined || known.fontSizes.includes(where.fontSize)),
  );
}

/** The problems no known issue covers, as lines for a test failure. */
export function newProblems(problems: Problem[], where: Where): string[] {
  return problems.filter((p) => !isKnownIssue(p, where)).map((p) => `${p.check}: ${p.element} — ${p.detail}`);
}
