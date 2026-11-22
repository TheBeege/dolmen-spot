import { defineConfig } from '@playwright/test';
import type { MatrixOptions } from './e2e/support/test';

// The browser tests (e2e/), run with `npm run test:e2e`. They build the app
// and test the production build. See "Browser Tests" in AGENTS.md.

const port = Number(process.env.E2E_PORT) || 3561;
const baseURL = `http://127.0.0.1:${port}`;

// Chromium's new headless mode, which is the real browser. Headless Chrome
// hides scrollbars, so they take no room; a desktop browser's do, so show them.
const chromium = { browserName: 'chromium' as const, channel: 'chromium', launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } };
const webkit = { browserName: 'webkit' as const };

// axe looks at elements and colours, which a bigger font barely changes (it only
// passes more contrast checks), so the accessibility tests run at 16px only.
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

  // The standard matrix: each browser with its default font size at 16px, and
  // at 24px (a player who has made the browser's text bigger). The layout
  // tests run each at the widths in WIDTHS (e2e/support/test.ts).
  projects: [
    // The audit walks both font sizes of the layout matrix itself, in Chromium
    // (it sets the font size through Chromium's settings), so exactly one
    // project runs it, and only under its own script.
    { name: 'chromium-16px', use: { ...chromium, defaultFontSize: 16 }, testIgnore: withAudit ? undefined : auditTests },
    { name: 'chromium-24px', use: { ...chromium, defaultFontSize: 24 }, testIgnore: [a11yTests, auditTests] },
    { name: 'webkit-16px', use: { ...webkit, defaultFontSize: 16 }, testIgnore: auditTests },
    { name: 'webkit-24px', use: { ...webkit, defaultFontSize: 24 }, testIgnore: [a11yTests, auditTests] },
  ],

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
