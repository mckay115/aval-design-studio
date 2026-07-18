import assert from "node:assert/strict";
import test from "node:test";

import {
  hostTargetTriple,
  parseMediaVersion,
  unsupportedLinuxDependencies,
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

test("allows the Linux system ABI while rejecting external shared libraries", () => {
  const systemOnly = `
    linux-vdso.so.1 (0x00007fff)
    libm.so.6 => /lib/x86_64-linux-gnu/libm.so.6 (0x00007fff)
    libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007fff)
    /lib64/ld-linux-x86-64.so.2 (0x00007fff)
  `;
  assert.deepEqual(unsupportedLinuxDependencies(systemOnly), []);
  assert.deepEqual(
    unsupportedLinuxDependencies(`${systemOnly}\nlibcrypto.so.3 => /usr/lib/libcrypto.so.3 (0x0)`),
    ["libcrypto.so.3"]
  );
  assert.deepEqual(
    unsupportedLinuxDependencies(`${systemOnly}\nlibx265.so.199 => not found`),
    ["libx265.so.199 (not found)"]
  );
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
  const hashes = {
    ffmpegSha256: "b".repeat(64),
    ffprobeSha256: "c".repeat(64)
  };
  assert.doesNotThrow(() => validateMediaProvenance({
    schemaVersion: 1,
    target: "aarch64-apple-darwin",
    ffmpeg: {
      version: "8.1.2",
      configure,
      sourceUrl: "https://example.com/ffmpeg.tar.xz",
      sourceSha256: "a".repeat(64),
      buildInstructionsUrl: "https://example.com/build",
      license: {
        url: "https://example.com/COPYING.GPLv3",
        sha256: "f".repeat(64)
      },
      binaryDistribution: {
        provider: "Example builder",
        providerUrl: "https://example.com",
        builderRevision: "d".repeat(40),
        archives: [{
          url: "https://example.com/ffmpeg.zip",
          sha256: "e".repeat(64)
        }]
      },
      binaries: hashes
    }
  }, observed, "aarch64-apple-darwin", hashes));
  assert.throws(() => validateMediaProvenance({ schemaVersion: 1 }, observed, "aarch64-apple-darwin"));
});
