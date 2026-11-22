import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Allow `_`-prefixed names for intentionally discarded values,
      // e.g. `const { [key]: _, ...rest } = obj`.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Accessibility rules beyond the ones eslint-config-next turns on, plus
    // two it turns on only as warnings, raised to errors here so CI fails
    // rather than passing them by. Each catches markup that reads fine in a
    // browser and breaks for a screen reader or keyboard user, rather than a
    // style preference. Two of them allow, through their own options, markup
    // that's deliberate here; the comment at each of those places says why.
    rules: {
      // An aria-hidden subtree can't be tabbed into, so hiding a focusable
      // element leaves a keyboard user with a control they can reach but no
      // screen reader will announce (and a focus ring on nothing).
      "jsx-a11y/no-aria-hidden-on-focusable": "error",
      // A role with required states/properties missing, such as a checkbox
      // with no aria-checked, is announced without them.
      // eslint-config-next has this one already, at "warn": "error" is what
      // makes it fail a lint run.
      "jsx-a11y/role-has-required-aria-props": "error",
      // And an aria-* the role doesn't take is ignored by assistive tech,
      // which hides a mistaken role as well. Also a warning in
      // eslint-config-next, raised here for the same reason.
      "jsx-a11y/role-supports-aria-props": "error",
      // aria-activedescendant is only followed on a focused element, so it
      // needs something tabbable to live on.
      "jsx-a11y/aria-activedescendant-has-tabindex": "error",
      // A matching implicit role (e.g. role="button" on <button>) overrides
      // nothing and only makes the markup harder to read. Journal.tsx's
      // `role="list"` on an <ol> is the exception: Safari drops a list's
      // semantics when its bullets are styled away, as Tailwind's preflight
      // does, and the explicit role is what puts them back.
      "jsx-a11y/no-redundant-roles": ["error", { ol: ["list"] }],
      // An <a> with no href isn't a link to a keyboard or screen reader; it's
      // a span that looks like one.
      "jsx-a11y/anchor-is-valid": "error",
      // tabIndex on something that does nothing leaves a dead stop in the tab
      // order. The two focusable containers here do something: page.tsx's
      // tabpanels, so the keyboard reaches the panel before its first control,
      // and the sideways-scrolling table region in SpellsAndMagic.tsx, which
      // only a focusable container can scroll with the keyboard.
      "jsx-a11y/no-noninteractive-tabindex": ["error", { roles: ["tabpanel", "region"] }],
      // `jsx-a11y/interactive-supports-focus` is deliberately not on. Its one
      // finding here is TabBar's `role="tablist"`, whose keydown handler runs
      // for key presses on the tabs inside it. A tablist is meant to stay out
      // of the tab order (the selected tab is the tab stop), and the rule has
      // no option that allows a role, so keeping it would mean a pointless
      // tab stop or a tabIndex nothing uses.
    },
  },
  {
    // `react-hooks/set-state-in-effect` arrived with eslint-plugin-react-hooks v7
    // (bundled by eslint-config-next 16). These files predate it, so it's a warning
    // here until they're refactored; everywhere else it stays an error.
    files: ["src/hooks/useCharacter.ts", "src/components/CloudStorageModal.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // Playwright hands each test fixture its value through a callback named
    // `use`, which this rule takes for React's `use` hook.
    files: ["e2e/**"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  // eslint-config-next already ignores .next/, out/, build/ and next-env.d.ts
  // (node_modules/ is ignored by ESLint itself). .claude/ holds Claude Code's
  // git worktrees, each a full copy of the repo that would otherwise be linted.
  // The others are the browser tests' reports (see playwright.config.ts).
  globalIgnores(["public/**", ".claude/**", "playwright-report/**", "test-results/**", "blob-report/**"]),
]);

export default eslintConfig;
