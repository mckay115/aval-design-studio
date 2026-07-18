import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8"
);

test("a missing release follows the create path instead of looking published", () => {
  assert.match(
    workflow,
    /if RELEASE_JSON="\$\(gh api "repos\/\$\{GITHUB_REPOSITORY\}\/releases\/tags\/\$\{TAG\}" 2>\/dev\/null\)"; then/u
  );
  assert.doesNotMatch(
    workflow,
    /releases\/tags\/\$\{TAG\}" 2>\/dev\/null \|\| true/u
  );
});
