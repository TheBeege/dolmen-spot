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
    // `react-hooks/set-state-in-effect` arrived with eslint-plugin-react-hooks v7
    // (bundled by eslint-config-next 16). These files predate it, so it's a warning
    // here until they're refactored; everywhere else it stays an error.
    files: ["src/hooks/useCharacter.ts", "src/components/CloudStorageModal.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // eslint-config-next already ignores .next/, out/, build/ and next-env.d.ts
  // (node_modules/ is ignored by ESLint itself). .claude/ holds Claude Code's
  // git worktrees, each a full copy of the repo that would otherwise be linted.
  globalIgnores(["public/**", ".claude/**"]),
]);

export default eslintConfig;
