import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test as base, expect, type ConsoleMessage } from '@playwright/test';
import { installInPageHelpers } from './in-page';

/** Options each project in playwright.config.ts sets, besides the browser. */
export interface MatrixOptions {
  /** The browser's default font size in px, as a player would set it in the browser's settings. */
  defaultFontSize: number;
}

/**
 * The window widths of the matrix, in CSS px: small and common phones, a
 * tablet (Tailwind's `md`), and a laptop.
 */
export const WIDTHS = [320, 375, 768, 1280] as const;

/** The window for a width of the matrix. Only the width matters to the checks. */
export function viewportAt(width: number) {
  return { width, height: 800 };
}

interface TestFixtures {
  /**
   * Page errors and console errors seen so far in this test, apart from the
   * known harmless ones (see isKnownConsoleNoise). The `page` fixture fails
   * the test if any are left at the end.
   */
  consoleProblems: string[];
}

/**
 * Messages the app logs that aren't bugs:
 * - `next start` doesn't serve Vercel Analytics' script (only Vercel does), so
 *   loading /_vercel/insights/script.js fails with a 404.
 */
function isKnownConsoleNoise(message: ConsoleMessage): boolean {
  const where = `${message.text()} ${message.location().url}`;
  return /\/_vercel\/insights\//.test(where);
}

export const test = base.extend<TestFixtures, MatrixOptions>({
  defaultFontSize: [16, { option: true, scope: 'worker' }],

  // WebKit's default font size can only be set through MiniBrowser's settings
  // file (`--config-file`, a [websettings] group of WebKitSettings), and only
  // the window MiniBrowser opens at startup uses it; pages Playwright opens
  // later get default settings. So each WebKit test launches its own
  // persistent context and runs in that startup window (see `page`). The
  // context still gets the project's options (viewport, baseURL...) and
  // traces, as Playwright Test applies them to every context it sees.
  context: async ({ browser, browserName, defaultFontSize, launchOptions, playwright }, use) => {
    if (browserName !== 'webkit') {
      const context = await browser.newContext();
      await use(context);
      await context.close();
      return;
    }
    const dir = await mkdtemp(path.join(tmpdir(), 'dolmen-spot-e2e-webkit-'));
    const settings = path.join(dir, 'settings.ini');
    // Chrome's settings set the fixed-width size 3px below the standard one.
    await writeFile(settings, `[websettings]\ndefault-font-size=${defaultFontSize}\ndefault-monospace-font-size=${defaultFontSize - 3}\n`);
    const context = await playwright.webkit.launchPersistentContext(path.join(dir, 'profile'), {
      args: [...(launchOptions.args ?? []), `--config-file=${settings}`],
      // Emulating a locale resets WebKit's settings, font size included, and
      // its language is en-US anyway, as Playwright Test's default locale is.
      locale: undefined,
    });
    await use(context);
    await context.close();
    await rm(dir, { recursive: true, force: true });
  },

  page: async ({ context, browserName, defaultFontSize, consoleProblems }, use) => {
    const page = browserName === 'webkit' ? context.pages()[0] : await context.newPage();
    if (!page) throw new Error("WebKit didn't open its startup window, so the default font size can't be set.");
    if (browserName === 'chromium') {
      // The same preference as Chrome's Settings > Appearance > Font size,
      // which also sets the fixed-width size 3px lower.
      const cdp = await context.newCDPSession(page);
      await cdp.send('Page.setFontSizes', { fontSizes: { standard: defaultFontSize, fixed: defaultFontSize - 3 } });
    }
    // Every test starts on the settings its project promises, before the app
    // loads: the font size is the browser's own, so every rem in the sheet (and
    // every rem-based breakpoint) moves as it would for a player, and Chromium
    // shows its scrollbars, so they take room as on a desktop. A project whose
    // setting didn't take would quietly test a different layout.
    const { rootFontSize, scrollbarWidth } = await page.evaluate(() => {
      const rootFontSize = getComputedStyle(document.documentElement).fontSize;
      // Something taller than the window, to make the scrollbar show.
      const tall = document.createElement('div');
      tall.style.height = '200vh';
      document.body.appendChild(tall);
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      tall.remove();
      return { rootFontSize, scrollbarWidth };
    });
    expect(rootFontSize, "the browser's default font size").toBe(`${defaultFontSize}px`);
    // Only Chromium's is checked: whether WebKit's scrollbars take room depends on the platform.
    if (browserName === 'chromium') expect(scrollbarWidth, 'room the scrollbar takes').toBeGreaterThan(0);
    await page.addInitScript(installInPageHelpers);
    page.on('pageerror', (error) => consoleProblems.push(`page error: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' && !isKnownConsoleNoise(message)) {
        consoleProblems.push(`console error: ${message.text()} (${message.location().url})`);
      }
    });
    await use(page);
  },

  consoleProblems: async ({}, use) => {
    const problems: string[] = [];
    await use(problems);
    expect(problems, 'page errors and console errors').toEqual([]);
  },
});

export { expect };
