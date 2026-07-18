import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8"
);

test("release lookup includes drafts and avoids the published-only tag endpoint", () => {
  assert.match(
    workflow,
    /gh api --paginate "repos\/\$\{GITHUB_REPOSITORY\}\/releases\?per_page=100"/u
  );
  assert.match(workflow, /select\(\.tag_name == \$tag\)/u);
  assert.doesNotMatch(
    workflow,
    /releases\/tags\/\$\{TAG\}/u
  );
});

test("draft source pinning uses target_commitish before the tag exists", () => {
  assert.match(
    workflow,
    /RELEASE_TARGET="\$\(jq -r '\.target_commitish' <<< "\$\{RELEASE_JSON\}"\)"/u
  );
  assert.doesNotMatch(workflow, /commits\/\$\{TAG\}/u);
});

test("finalization resolves the draft by numeric release ID", () => {
  assert.match(
    workflow,
    /releases\/\$\{RELEASE_ID\}/u
  );
  assert.doesNotMatch(workflow, /releases\/tags\/\$\{TAG\}/u);
});
