import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';

export const metadata: Metadata = {
  title: 'Changelog | Dolmen Spot',
  description: 'User-facing changes to Dolmen Spot, the Dolmenwood character tracker.',
};

type ChangelogSection = {
  heading: string;
  changes: string[];
};

// One entry per release, covering every player-facing PR in it, written when the release is cut.
type ChangelogEntry = {
  /** The day the release went live on dolmen.spot (YYYY-MM-DD). */
  date: string;
  title: string;
  /** The user-facing PRs included in this release. */
  prNumbers?: number[];
  /** Bullets for a single-topic release. */
  changes?: string[];
  /** For a multi-feature release: one section per feature, shown after `changes`. */
  sections?: ChangelogSection[];
};

// Add a new entry at the TOP of this list when cutting a release — never in a feature PR.
// See "Releases & Deployment" and "Changelog" in AGENTS.md.
// Write each bullet from the player's point of view — what changed for them, not what changed in code.
const ENTRIES: ChangelogEntry[] = [
  {
    date: '2026-11-20',
    title: 'Printable character sheets, calendar fixes, and a site icon',
    prNumbers: [10, 11, 18, 21],
    sections: [
      {
        heading: 'Printable PDF character sheets',
        changes: [
          'New "Download PDF" button next to "Save / Load" saves a printable character sheet of your current character, named after them. On phones it shows as a download icon.',
          'The sheet covers your character details, ability scores and modifiers, all five saving throws, combat stats (HP, AC, attack, melee, missile, speed, and magic resistance), skills, class and kindred features, languages, retainers, your spells, glamours, runes, or knacks, and your inventory by container with encumbrance and coins.',
          'The Adventuring tab (calendar, conditions, rations, travel, light sources, spell study, and journal), the map, and free-form notes stay in the app and aren\'t printed.',
          'Pages are printer-friendly with selectable text. Long inventories continue onto extra pages with their table headings repeated, and every page shows your character\'s name and a page number.',
          'Paper size follows your browser\'s language: Letter in the US, Canada, and other Letter-paper regions, A4 elsewhere.',
          'On phones, the header now hides the kindred and class and shortens long character names further, so its buttons always fit on screen.',
        ],
      },
      {
        heading: 'Calendar',
        changes: [
          'Days of the week are named correctly again: every month starts on Colly, and the Wysendays at the end of a month (such as Hanglemas and Dolmenday) show their own names instead of a weekday. Journal entries and spell-study start dates show the corrected names too.',
          'Moon phases now match the official Dolmenwood calendar, with full moons on the marked days (for example, 19 Grimvold) every year instead of drifting further off each year.',
          'Before a month\'s new moon, the calendar shows the previous month\'s moon waning (for example, 1 Grimvold shows "Black moon · Waning"). The month summary gives the month\'s own moon and its new- and full-moon days, for example "Moon: Grinning moon (new 4th, full 19th)".',
          'The Day of Virgins and The Day of Doors now carry their full names from the book.',
          'The Reference tab\'s calendar lists each month\'s new- and full-moon days and explains how weeks, Wysendays, and moon phases work. On phones, each month\'s season shows under its name so the moon days fit.',
        ],
      },
      {
        heading: 'Rules fixes',
        changes: [
          'Woodgrues with a standard class (Bard, Enchanter, Thief, and so on) get Mad Revelry once per day, as the rules say. Woodgrue kindred-class characters still get one use per Level.',
          'Kindred-class characters now get their XP modifier calculated from their Prime Abilities, with a Sync button like other classes. Editing an ability score or changing kindred no longer wipes an XP modifier the sheet can\'t calculate.',
          'Carrying more than the maximum load (over 1,600 coins of weight, or more than 10 equipped or 16 stowed slots) now gives Speed 0 on the Inventory tab and the PDF, with advice on what to stow or drop. Before, it showed 10.',
        ],
      },
      {
        heading: 'Sturdier, easier-to-read sheet',
        changes: [
          'A character saved with a class the sheet doesn\'t recognise (for example, from a hand-edited file) no longer blanks the whole app. Unrecognised classes and kindreds are shown as stored, such as "warlock (unknown class)", and the sheet doesn\'t guess values or magic it can\'t work out.',
          'If part of the sheet fails to display, a recovery screen tells you whether your characters are still saved and lets you try again, reload, or download your save data. That save-data file is a backup, not a character file, and importing it says so.',
          'The header and character list show proper names, such as "Woodgrue Enchanter", instead of lowercase ids or "???".',
          'Inventory columns line up when you carry bags, sacks, or pouches, and on phones item rows fit the screen with each field labelled.',
          'Warnings, the header\'s kindred and class, the Inventory\'s × buttons, and the character list\'s Del buttons are easier to read, and screen readers say what each of those buttons removes or deletes.',
        ],
      },
      {
        heading: 'Site icon',
        changes: [
          'Dolmen Spot has its own icon in browser tabs, bookmarks, and history: a gold dolmen on a dark tile. Adding the site to a phone\'s home screen uses the same icon.',
        ],
      },
    ],
  },
  {
    date: '2026-05-16',
    title: 'Dolmen Spot branding, About, and Changelog pages',
    prNumbers: [3],
    changes: [
      'The site is now called Dolmen Spot — your spot for tracking your Dolmenwood character. The game itself is still Dolmenwood; only the tracker has a name now.',
      'New About page describes the project and how to reach the author (GitHub issues or Discord @thebeege).',
      'New Changelog page (this one) lists user-facing changes from each release, newest first.',
      'Footer now links to the Changelog and About pages, and the "File an issue on GitHub" link points to the correct repo.',
    ],
  },
  {
    date: '2026-05-16',
    title: 'Multi-year calendar',
    prNumbers: [2],
    changes: [
      'Calendar now tracks the year alongside the date — set it directly on the Adventuring tab.',
      'Advancing past the last day of Year 1 rolls over into Year 2 (and rewinding rolls back).',
      'Moon phases stay continuous across year boundaries instead of resetting each January.',
      'Long spell studies (12+ weeks) no longer silently rewind their progress when the calendar crosses a year.',
    ],
  },
  {
    date: '2026-05-16',
    title: 'Arcane spellbooks, scrolls, and study queue',
    prNumbers: [1],
    changes: [
      'Spellbooks are now real inventory items — add them with the new "+ Magical ▾" button and pick up to 3 spells per book.',
      'Scrolls are inventory items too. Adding a scroll automatically lists it under Available Spells with a one-click "Cast" button that consumes the scroll.',
      'New Known Spells list with search, sort, rank chips, and source filter. Each spell shows whether you have the book on hand (📕), are missing it (⚠), or hold it as a scroll (📜).',
      'New Spell Study form supports all four learning paths from the rulebook — book, mentor, research, and rewrite. When studying from a book, the picker auto-filters to spells you own but don\'t yet know.',
      'Active studies show elapsed and required weeks. Completing the timer prompts an INT check for book studies; failed book studies are blocked until your next level-up.',
      'Magician starter spellbook is now a one-click add — picks the book, the spells, and stamps them in your Known list.',
      'Adventuring tab gains a "🪄 Spell Study" card that glows when your active study is ready to complete.',
    ],
  },
  {
    date: '2026-02-17',
    title: 'Initial release',
    changes: [
      'Full character creation for all 6 kindreds and 9 classes, plus kindred-class advancement tables.',
      'Auto-calculated armor class, attack bonuses, saves, and skill targets — scales with level automatically.',
      'XP tracking with level-up thresholds per class.',
      'Inventory with dual encumbrance systems (weight and slot-based), container support, and a full equipment catalog browser.',
      'Coin management for Copper, Silver, Gold, and Pellucidium.',
      'Magic system tracking for arcane spells, holy spells, glamours, fairy runes, and mossling knacks.',
      '12-month Dolmenwood calendar on the Adventuring tab with moon phases, travel, light source, and camping tools.',
      'Interactive Dolmenwood hex map for tracking exploration.',
      'Reference panels for the calendar, world lore, consumables, equipment, and class/kindred features.',
      'Multi-character support with local storage, JSON import/export, and optional cloud save to Google Drive or OneDrive.',
    ],
  },
];

function ChangeList({ changes }: { changes: string[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5 text-[#f5e6c8] text-sm leading-relaxed marker:text-[#c4a35a]/50">
      {changes.map((change, i) => (
        <li key={i}>{change}</li>
      ))}
    </ul>
  );
}

export default function ChangelogPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-[#1a1a2e] border-b border-[#5a3a28] sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-3 py-2 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-[#c4a35a] tracking-wide hover:text-[#dbc07a] transition-colors">
            Dolmen Spot
          </Link>
          <Link
            href="/"
            className="text-xs px-2 py-1 bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded transition-colors"
          >
            Back to sheet
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">
        <h1 className="text-2xl font-bold text-[#c4a35a] mb-1">Changelog</h1>
        <p className="text-[#f5e6c8]/60 text-sm mb-6">
          User-facing changes to Dolmen Spot. Newest first.
        </p>

        <div className="space-y-4">
          {ENTRIES.map((entry, idx) => (
            <article
              key={idx}
              className="bg-[#2a2a3e] border border-[#5a3a28] rounded-lg p-5"
            >
              <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-lg font-semibold text-[#c4a35a]">{entry.title}</h2>
                <span className="text-xs text-[#f5e6c8]/50">{entry.date}</span>
                {entry.prNumbers && entry.prNumbers.length > 0 && (
                  <span className="text-xs text-[#c4a35a]/80">
                    {entry.prNumbers.length === 1 ? 'PR' : 'PRs'}{' '}
                    {entry.prNumbers.map((pr, i) => (
                      <Fragment key={pr}>
                        {i > 0 && ', '}
                        <a
                          href={`https://github.com/TheBeege/dolmen-spot/pull/${pr}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-[#c4a35a] underline transition-colors"
                        >
                          #{pr}
                        </a>
                      </Fragment>
                    ))}
                  </span>
                )}
              </header>
              <div className="space-y-4">
                {entry.changes && entry.changes.length > 0 && <ChangeList changes={entry.changes} />}
                {entry.sections?.map((section) => (
                  <section key={section.heading}>
                    <h3 className="mb-1.5 text-sm font-semibold text-[#c4a35a]/90">{section.heading}</h3>
                    <ChangeList changes={section.changes} />
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>
      </main>

      <footer className="bg-[#1a1a2e] border-t border-[#5a3a28] py-3 text-center">
        <p className="text-xs text-[#f5e6c8]/30">
          <Link href="/" className="hover:text-[#c4a35a] transition-colors">Sheet</Link>
          {' · '}
          <Link href="/changelog" className="hover:text-[#c4a35a] transition-colors">Changelog</Link>
          {' · '}
          <Link href="/about" className="hover:text-[#c4a35a] transition-colors">About</Link>
        </p>
      </footer>
    </div>
  );
}
