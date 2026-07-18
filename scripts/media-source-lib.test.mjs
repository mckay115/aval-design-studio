import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { MEDIA_TARGETS, validateMediaSourceCatalog } from "./media-source-lib.mjs";

const catalog = JSON.parse(
  await readFile(new URL("../toolchain/media-sources.json", import.meta.url), "utf8")
);

test("pins immutable, hashed GPL media inputs for every release target", () => {
  assert.doesNotThrow(() => validateMediaSourceCatalog(catalog, "aval-media-toolchain-v1"));
  assert.deepEqual(Object.keys(catalog.targets).sort(), [...MEDIA_TARGETS].sort());
  for (const target of MEDIA_TARGETS) {
    for (const file of catalog.targets[target].files) {
      assert.doesNotMatch(file.url, /\/latest\//u);
      assert.match(file.sha256, /^[a-f0-9]{64}$/u);
    }
  }
});

test("rejects moving release URLs", () => {
  const invalid = structuredClone(catalog);
  invalid.targets[MEDIA_TARGETS[0]].files[0].url =
    "https://example.com/releases/latest/ffmpeg.zip";
  assert.throws(() => validateMediaSourceCatalog(invalid), /moving latest URL/u);
});
