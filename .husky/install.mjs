// Installs the git hooks. It's the `prepare` script, so `npm ci` and
// `npm install` run it.
//
// core.hooksPath lives in .git/config, which the main checkout shares with
// every linked worktree, and Claude Code's worktree setup rewrites it to the
// absolute path of the main checkout's .husky/_. husky's default install
// writes the relative ".husky/_", so the two would keep flipping it. Instead,
// this does nothing in CI or in a linked worktree, and in the main checkout it
// writes the same absolute path Claude Code does. Every worktree therefore
// runs the main checkout's hooks (see AGENTS.md).
import { execFileSync } from "node:child_process";
import path from "node:path";

function skip(reason) {
  console.log(`husky - skipping hook install: ${reason}`);
  process.exit(0);
}

const { CI, HUSKY } = process.env;
if (HUSKY === "0") skip("HUSKY=0");
if (CI && !["0", "false"].includes(CI)) skip("CI");

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let gitDir;
let commonDir;
try {
  gitDir = git("rev-parse", "--path-format=absolute", "--git-dir");
  commonDir = git("rev-parse", "--path-format=absolute", "--git-common-dir");
} catch {
  skip("not a git checkout");
}
if (gitDir !== commonDir) {
  skip("this is a linked worktree, which runs the main checkout's hooks");
}

let husky;
try {
  ({ default: husky } = await import("husky"));
} catch {
  skip("husky isn't installed");
}

// Given an absolute directory, husky creates <dir>/_ and points core.hooksPath
// at it in a single `git config` call, so a failed write (e.g. while another
// process holds .git/config.lock) leaves the old value in place. It returns a
// reason when it didn't install.
const huskyDir = path.resolve(".husky");
const message = husky(huskyDir);
if (message) {
  console.log(`husky - couldn't install the hooks, core.hooksPath unchanged: ${message.trim()}`);
  process.exit(0);
}
console.log(`husky - core.hooksPath set to ${path.join(huskyDir, "_")}`);
