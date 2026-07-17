import assert from "node:assert/strict";
import test from "node:test";

import {
  hostTargetTriple,
  parseMediaVersion,
  validateFfmpeg,
  validateMediaProvenance
} from "./toolchain-lib.mjs";

const configure = "--enable-gpl --enable-libx264 --enable-libx265 --enable-libvpx --enable-libaom";
const versionText = `ffmpeg version 8.1.2\nconfiguration: ${configure}\n`;
const encoders = "libaom-av1 libvpx-vp9 libx265 libx264";

test("maps supported native hosts to Tauri target triples", () => {
  assert.equal(hostTargetTriple("darwin", "arm64"), "aarch64-apple-darwin");
  assert.equal(hostTargetTriple("win32", "x64"), "x86_64-pc-windows-msvc");
  assert.throws(() => hostTargetTriple("linux", "arm64"), /Unsupported/u);
});

test("accepts a GPL FFmpeg with every AVAL encoder", () => {
  assert.deepEqual(validateFfmpeg(versionText, encoders), {
    version: "8.1.2",
    configure,
    encoders: ["libaom-av1", "libvpx-vp9", "libx265", "libx264"]
  });
  assert.equal(parseMediaVersion("ffprobe version 8.1.2\n", "ffprobe"), "8.1.2");
});

test("rejects non-redistributable and incomplete FFmpeg builds", () => {
  assert.throws(
    () => validateFfmpeg(`${versionText.trim()} --enable-nonfree\n`, encoders),
    /cannot be redistributed/u
  );
  assert.throws(() => validateFfmpeg(versionText, "libx264"), /missing required/u);
});

test("requires exact source provenance for the observed media binary", () => {
  const observed = validateFfmpeg(versionText, encoders);
  assert.doesNotThrow(() => validateMediaProvenance({
    schemaVersion: 1,
    target: "aarch64-apple-darwin",
    ffmpeg: {
      version: "8.1.2",
      configure,
      sourceUrl: "https://example.com/ffmpeg.tar.xz",
      sourceSha256: "a".repeat(64),
      buildInstructionsUrl: "https://example.com/build"
    }
  }, observed, "aarch64-apple-darwin"));
  assert.throws(() => validateMediaProvenance({ schemaVersion: 1 }, observed, "aarch64-apple-darwin"));
});
