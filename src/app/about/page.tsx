import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About | Dolmen Spot',
  description: 'About Dolmen Spot — your spot for tracking your Dolmenwood character.',
};

export default function AboutPage() {
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
        <h1 className="text-2xl font-bold text-[#c4a35a] mb-1">About</h1>
        <p className="text-[#f5e6c8]/60 text-sm mb-4">
          Dolmen Spot — your spot for tracking your Dolmenwood character.
        </p>

        <section className="bg-[#2a2a3e] border border-[#5a3a28] rounded-lg p-5 mb-4">
          <p className="text-[#f5e6c8] leading-relaxed mb-3">
            Dolmen Spot is a small personal project — a digital character sheet for the Dolmenwood
            TTRPG, built to make character tracking portable and easy at the table or on the go.
          </p>
          <p className="text-[#f5e6c8] leading-relaxed mb-3">
            I&apos;m a software engineer by trade, but I&apos;m building this whole thing with the help of
            AI. The goal is convenience for players — automating the bookkeeping (XP, encumbrance,
            attack bonuses, save targets, moon phases, spell-study weeks) so you can focus on the
            game itself.
          </p>
          <p className="text-[#f5e6c8] leading-relaxed">
            I&apos;m also careful to avoid stepping on{' '}
            <a
              href="https://necroticgnome.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#c4a35a] hover:text-[#dbc07a] underline transition-colors"
            >
              Necrotic Gnome&apos;s
            </a>{' '}
            feet — Dolmenwood is their work, and this tool exists only to support play, not to
            substitute for the books. No rulebook content beyond what a character sheet needs is
            reproduced here.
          </p>
        </section>

        <section className="bg-[#2a2a3e] border border-[#5a3a28] rounded-lg p-5 mb-4">
          <h2 className="text-lg font-semibold text-[#c4a35a] mb-3">Contact</h2>
          <ul className="space-y-2 text-[#f5e6c8]">
            <li>
              <span className="text-[#f5e6c8]/60">GitHub:</span>{' '}
              <a
                href="https://github.com/TheBeege/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#c4a35a] hover:text-[#dbc07a] underline transition-colors"
              >
                github.com/TheBeege
              </a>
            </li>
            <li>
              <span className="text-[#f5e6c8]/60">Issues / feature requests:</span>{' '}
              <a
                href="https://github.com/TheBeege/dolmenwood-character-sheet/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#c4a35a] hover:text-[#dbc07a] underline transition-colors"
              >
                File on GitHub
              </a>
            </li>
            <li>
              <span className="text-[#f5e6c8]/60">Discord:</span>{' '}
              <code className="text-[#c4a35a] bg-[#1a1a2e] px-1.5 py-0.5 rounded">thebeege</code>
              <span className="text-[#f5e6c8]/60">
                {' — for bug reports or feature requests if you can’t file an issue on GitHub'}
              </span>
            </li>
          </ul>
        </section>

        <section className="bg-[#2a2a3e] border border-[#5a3a28] rounded-lg p-5">
          <h2 className="text-lg font-semibold text-[#c4a35a] mb-3">Disclaimer</h2>
          <p className="text-[#f5e6c8]/80 text-sm leading-relaxed">
            Dolmenwood is a trademark of Necrotic Gnome. This is an unofficial fan project and is
            not affiliated with or endorsed by Necrotic Gnome. Game content is referenced for
            personal/fan use only — please support the official books at{' '}
            <a
              href="https://necroticgnome.com/collections/dolmenwood"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#c4a35a] hover:text-[#dbc07a] underline transition-colors"
            >
              necroticgnome.com
            </a>
            .
          </p>
        </section>
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
