// public/msal-redirect-bridge.min.js is a copy of the redirect bridge that
// @azure/msal-browser ships. public/blank.html, the page OneDrive sign-in
// redirects to, loads it, so it has to match the installed MSAL version. CI
// runs this check; after updating @azure/msal-browser, refresh the copy with
// the command it prints.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
// Paths relative to the repo root; absolute when outside it (e.g. a symlinked
// node_modules, which import.meta.resolve follows).
const rel = (file) => {
  const relative = path.relative(root, file);
  return relative.startsWith("..") ? file : relative;
};
const copy = path.join(root, "public", "msal-redirect-bridge.min.js");

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

let pkgJson;
try {
  pkgJson = fileURLToPath(import.meta.resolve("@azure/msal-browser/package.json"));
} catch (error) {
  fail(
    error.code === "ERR_MODULE_NOT_FOUND"
      ? "@azure/msal-browser isn't installed. Run `npm ci`, then run this check again."
      : `couldn't resolve @azure/msal-browser/package.json: ${error.message}`,
  );
}
const { version } = JSON.parse(readFileSync(pkgJson, "utf8"));
const shipped = path.join(
  path.dirname(pkgJson),
  "lib",
  "redirect-bridge",
  "msal-redirect-bridge.min.js",
);

let expected;
try {
  expected = readFileSync(shipped);
} catch {
  fail(
    `@azure/msal-browser ${version} has no ${rel(shipped)}.\n` +
      `  Find where it ships msal-redirect-bridge.min.js now, then update ${rel(fileURLToPath(import.meta.url))}.`,
  );
}

// A missing or unreadable copy counts as a mismatch.
let actual = null;
try {
  actual = readFileSync(copy);
} catch {
  // handled below
}

if (!actual?.equals(expected)) {
  const problem = actual
    ? `${rel(copy)} doesn't match the redirect bridge in @azure/msal-browser ${version}.`
    : `${rel(copy)} is missing. It should be a copy of the redirect bridge in @azure/msal-browser ${version}.`;
  fail(
    `${problem}\n` +
      `  OneDrive sign-in loads this copy. Refresh it from the repo root:\n\n` +
      `    cp ${rel(shipped)} ${rel(copy)}\n`,
  );
}

console.log(`✔ ${rel(copy)} matches @azure/msal-browser ${version}`);
