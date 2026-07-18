import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8"
);
const mediaWorkflow = await readFile(
  new URL("../.github/workflows/media-toolchain.yml", import.meta.url),
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
  assert.match(workflow, /upload-release-assets\.mjs "\$\{RELEASE_ID\}"/u);
  assert.match(workflow, /download-release-assets\.mjs "\$\{RELEASE_ID\}"/u);
  assert.doesNotMatch(workflow, /gh release (?:upload|download) "\$\{TAG\}"/u);
  assert.match(workflow, /releases\/\$\{RELEASE_ID\}[\s\S]*make_latest=true/u);
});

test("Apple credentials are exported only after explicit signing opt-in", () => {
  assert.match(
    workflow,
    /Configure ad-hoc Apple signing[\s\S]*APPLE_SIGNING_IDENTITY=-/u
  );
  assert.match(
    workflow,
    /Configure Apple Developer signing[\s\S]*APPLE_SIGNING_ENABLED == 'true'/u
  );
  assert.doesNotMatch(
    workflow,
    /Build and attach release artifacts[\s\S]*APPLE_CERTIFICATE:/u
  );
});

test("media toolchain is natively validated for every desktop target", () => {
  for (const target of [
    "aarch64-apple-darwin",
    "x86_64-apple-darwin",
    "x86_64-unknown-linux-gnu",
    "x86_64-pc-windows-msvc"
  ]) {
    assert.match(mediaWorkflow, new RegExp(target, "u"));
  }
  assert.match(mediaWorkflow, /fetch-media-toolchain\.mjs \$\{\{ matrix\.target \}\}/u);
  assert.match(mediaWorkflow, /package-media-toolchain\.mjs \$\{\{ matrix\.target \}\}/u);
});

test("media toolchain stays a prerelease and cannot replace latest desktop updates", () => {
  assert.match(mediaWorkflow, /-F prerelease=true/u);
  assert.match(mediaWorkflow, /-f make_latest=false/u);
  assert.match(mediaWorkflow, /already published and immutable/u);
});
