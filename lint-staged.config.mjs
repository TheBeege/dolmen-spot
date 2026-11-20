import { defineConfig } from "lint-staged/config";

// Pre-commit checks, run by husky (.husky/pre-commit). Nothing is auto-fixed,
// so the commit contains exactly what was staged. CI runs the same checks on
// the whole project (.github/workflows/ci.yml).
const config = defineConfig({
  // Every extension `npm run lint` covers. Errors block the commit; warnings
  // don't. --no-warn-ignored keeps staged files that ESLint ignores (e.g.
  // public/**) quiet, and --no-error-on-unmatched-pattern stops staged
  // deletions, whose paths no longer exist, from failing ESLint.
  "*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}": "eslint --no-warn-ignored --no-error-on-unmatched-pattern",
  // A change in one file can break types in another, and so can a change to
  // the TypeScript config or the installed packages, so check the whole
  // project. The function form keeps lint-staged from appending the staged
  // file names, which would make tsc ignore tsconfig.json.
  "{tsconfig.json,package.json,package-lock.json,*.{ts,tsx}}": () => "npm run typecheck",
});

export default config;
