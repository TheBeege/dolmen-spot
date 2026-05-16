import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Changelog | Dolmen Spot',
  description: 'User-facing changes to Dolmen Spot, the Dolmenwood character tracker.',
};

type ChangelogEntry = {
  date: string;
  title: string;
  prNumber?: number;
  changes: string[];
};

// Add a new entry at the TOP of this list whenever a PR with user-facing changes is merged.
// Write each bullet from the player's point of view — what changed for them, not what changed in code.
const ENTRIES: ChangelogEntry[] = [
  {
    date: '2026-05-16',
    title: 'Dolmen Spot branding, About, and Changelog pages',
    prNumber: 3,
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
    prNumber: 2,
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
    prNumber: 1,
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
                {entry.prNumber !== undefined && (
                  <a
                    href={`https://github.com/TheBeege/dolmen-spot/pull/${entry.prNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#c4a35a]/80 hover:text-[#c4a35a] underline transition-colors"
                  >
                    PR #{entry.prNumber}
                  </a>
                )}
              </header>
              <ul className="list-disc pl-5 space-y-1.5 text-[#f5e6c8] text-sm leading-relaxed marker:text-[#c4a35a]/50">
                {entry.changes.map((change, i) => (
                  <li key={i}>{change}</li>
                ))}
              </ul>
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
