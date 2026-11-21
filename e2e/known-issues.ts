import { TABS, type TabId } from './support/app';

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

const ALL_TABS: TabId[] = TABS.map((tab) => tab.id);

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
    match: /^Spell Study › /,
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
    issue:
      'Faded text is below 4.5:1 app-wide: parchment at 20–50% (`text-[#f5e6c8]/20`…`/50`, 1.8–4.5:1), gold at 30–70% (`text-[#c4a35a]/30`…`/70`), the greys `text-[#8b8b9e]` and `text-[#8a7a6a]` (4.1–4.2:1), and rows faded to 50% (cast spells). The footer is the worst, at 2.4:1.',
    checks: ['color-contrast'],
    tabs: ALL_TABS,
    match: /\((text-\[#f5e6c8\]\/[2-5]0|text-\[#c4a35a\]\/[3-7]0|text-\[#8b8b9e\]|text-\[#8a7a6a\]|text-\[#[0-9a-f]{6}\], opacity 0\.5)\)/,
  },
  {
    issue: "Placeholders are below 4.5:1 app-wide: Tailwind makes them half the field's text colour, 4.4:1 on the usual field background and 4.0:1 on a card (the map's ley line notes).",
    checks: ['placeholder-contrast'],
    tabs: ALL_TABS,
    match: /\((#88807b on #1a1a2e|#908883 on #2a2a3e),/,
  },
  {
    issue: 'Gold text on brown buttons is 4.2:1 (#c4a35a on #5a3a28): the Sync buttons for skills, magic resistance and the XP modifier.',
    checks: ['color-contrast'],
    tabs: ['character', 'abilities', 'combat'],
    match: /foreground color: #c4a35a, background color: #5a3a28/,
  },
  {
    issue: 'Coloured text below 4.5:1: the copper and pellucidium coin labels (Inventory), the sleep difficulty (Adventuring), and the seasons other than the current one, faded to 40% (1.6–2.1:1).',
    checks: ['color-contrast'],
    tabs: ['inventory', 'calendar'],
    match: /^(Coins|Camping|Season).*\(style color /,
  },
  {
    issue: 'Map: the ley lines\' "Del" buttons are dark red on dark blue (1.9:1), and their accessible names ("Delete ley line …") don\'t contain the word they show.',
    checks: ['color-contrast', 'label-content-name-mismatch'],
    tabs: ['map'],
    match: /^Ley Lines & Crossings › button/,
  },

  // ── Labels ───────────────────────────────────────────────────────────
  {
    issue: "Fields with a visible <label> that isn't tied to them (no htmlFor/id), so screen readers announce them without a name: character info, hit points, armour, retainers, bonus languages and symbiotic flesh.",
    checks: ['label', 'select-name'],
    tabs: ['character', 'combat', 'traits'],
    match: /^(Character Info|Hit Points|Armour Class|Retainers|Languages|Kindred Features) › .*\(label "/,
  },
  {
    issue: 'The "+ Add Rune..." picker has no label but its first option.',
    checks: ['select-name'],
    tabs: ['spells'],
    match: /^Fairy Runes › select /,
  },
  {
    issue: "Reference: at 320px the armour table scrolls sideways, but its scrolling box can't be reached with the keyboard.",
    checks: ['scrollable-region-focusable'],
    tabs: ['reference'],
    match: /^Quick Reference › div /,
    maxWidth: 320,
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
