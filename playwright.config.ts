import { defineConfig } from '@playwright/test';
import { A11Y_FONT_SIZE, FONT_SIZES, type MatrixOptions } from './e2e/support/test';

// The browser tests (e2e/), run with `npm run test:e2e`. They build the app
// and test the production build. See "Browser Tests" in AGENTS.md.

const port = Number(process.env.E2E_PORT) || 3561;
const baseURL = `http://127.0.0.1:${port}`;

// Chromium's new headless mode, which is the real browser. Headless Chrome
// hides scrollbars, so they take no room; a desktop browser's do, so show them.
const BROWSERS = [
  {
    name: 'chromium',
    options: { browserName: 'chromium' as const, channel: 'chromium', launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } },
  },
  { name: 'webkit', options: { browserName: 'webkit' as const } },
];

// axe looks at elements and colours, which a bigger font barely changes (it only
// passes more contrast checks), so the accessibility tests run at the matrix's
// smallest font size only.
const a11yTests = /a11y\.spec\.ts$/;

// The known-issues audit (e2e/known-issues-audit.spec.ts) walks the whole matrix
// in one process, which the parallel suite can't: it has its own script,
// `npm run audit:known-issues`, which sets E2E_KNOWN_ISSUES_AUDIT=1.
const auditTests = /known-issues-audit\.spec\.ts$/;
const withAudit = process.env.E2E_KNOWN_ISSUES_AUDIT === '1';

export default defineConfig<MatrixOptions>({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 3 : 2,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }], ['github']] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  // The standard matrix: each browser at each default font size of FONT_SIZES
  // (e2e/support/test.ts), which the known issues audit walks as well. The
  // layout tests run every one at the widths in WIDTHS. The accessibility tests
  // run at A11Y_WIDTHS, and only at the smallest font size: axe looks at
  // elements and colours, which a bigger font barely changes.
  projects: BROWSERS.flatMap((browser) =>
    FONT_SIZES.map((fontSize) => ({
      name: `${browser.name}-${fontSize}px`,
      use: { ...browser.options, defaultFontSize: fontSize },
      testIgnore: [
        ...(fontSize === A11Y_FONT_SIZE ? [] : [a11yTests]),
        // The audit sets the browser's font size through Chromium's settings,
        // so exactly one project runs it — the smallest-font-size Chromium
        // project, and only under its own script.
        ...(browser.options.browserName === 'chromium' && fontSize === A11Y_FONT_SIZE && withAudit ? [] : [auditTests]),
      ],
    })),
  ),

  webServer: {
    // A production build. A server already on the port is only reused when
    // E2E_REUSE_SERVER=1 says so: it could be an old build, or another checkout's.
    command: `npm run build && npx next start --port ${port} --hostname 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
    timeout: 5 * 60_000,
    env: {
      // No cloud save, whatever .env.local says: the tests stay offline.
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: '',
      NEXT_PUBLIC_MICROSOFT_CLIENT_ID: '',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
