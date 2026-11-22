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
  // ── Layout ───────────────────────────────────────────────────────────
  {
    issue: "Adventuring doesn't fit phones: the light tracker's rows stick out of their card at 320 and 375px, and at a 24px font so do its add buttons, the rations and travel points cards, the season strip and the In Fairy card.",
    checks: ['page-overflow', 'spills-card'],
    tabs: ['calendar'],
    match: /^(Rations › button "\+"|Light Sources › (button "(Remove|\+10|\+1|-1|\+ Candle)"|span "\d+ min")|Travel Points › button "Reset"|Season[^›]* › div "(Spring|Summer|Autumn|Winter)"|In Fairy — day \d+ › (button\[type=button\] "Return to Dolmenwood…"|span "entered ))/,
    maxWidth: 375,
  },
  {
    issue: 'Spells & Magic: at a 24px font and 320px, the study picker and its "What … does" button stick out of the Spell Study card.',
    checks: ['spills-card'],
    tabs: ['spells'],
    // Those two controls only (the picker, and the info button of the study it
    // shows): the rest of the card, its hint included, is checked like any other.
    match: /^Spell Study › (select "Spell to study"|button\[type=button\] "What .+ does \(studying\)")/,
    maxWidth: 320,
    fontSizes: [24],
  },
  {
    issue: 'Combat: at a 24px font and 320px, the hit point − and + buttons stick out of their card.',
    checks: ['page-overflow', 'spills-card'],
    tabs: ['combat'],
    match: /^Hit Points › /,
    maxWidth: 320,
    fontSizes: [24],
  },
  {
    issue: "Character: at a 24px font, the XP modifier's total (e.g. \"+20%\") runs off the screen at 320 and 375px.",
    checks: ['page-overflow'],
    tabs: ['character'],
    match: /^Character Info › span /,
    maxWidth: 375,
    fontSizes: [24],
  },

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
