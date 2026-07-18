import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  detectDownloadPlatform,
  formatFileSize,
  validateDownloadManifest
} from "../site/downloads.js";
import { buildSiteDownloadManifest } from "./write-site-downloads.mjs";

const assets = [
  ["AVAL.Design.Studio_0.2.0_aarch64.dmg", 100],
  ["AVAL.Design.Studio_0.2.0_x64-setup.exe", 200],
  ["AVAL.Design.Studio_0.2.0_amd64.AppImage", 300]
].map(([name, size]) => ({
  name,
  size,
  browser_download_url: `https://github.com/mckay115/aval-design-studio/releases/download/app-v0.2.0/${name}`
}));

test("detects supported desktop platforms without treating mobile devices as Linux or macOS", () => {
  assert.equal(detectDownloadPlatform({ platform: "MacIntel" }), "macos");
  assert.equal(detectDownloadPlatform({ platform: "Win32" }), "windows");
  assert.equal(detectDownloadPlatform({ platform: "Linux x86_64" }), "linux");
  assert.equal(detectDownloadPlatform({ userAgent: "Mozilla Android Linux" }), null);
  assert.equal(detectDownloadPlatform({ platform: "MacIntel", maxTouchPoints: 5 }), null);
});

test("builds direct installer links for the latest coordinated release", () => {
  const manifest = buildSiteDownloadManifest({
    tag_name: "app-v0.2.0",
    published_at: "2026-07-18T00:00:00Z",
    draft: false,
    prerelease: false,
    assets
  }, "mckay115/aval-design-studio");

  assert.equal(manifest.version, "0.2.0");
  assert.match(manifest.downloads.macos.url, /\.dmg$/u);
  assert.match(manifest.downloads.windows.url, /\.exe$/u);
  assert.match(manifest.downloads.linux.url, /\.AppImage$/u);
  assert.doesNotMatch(JSON.stringify(manifest), /releases\/latest/u);
  assert.equal(validateDownloadManifest(manifest), manifest);
});

test("refuses to publish a partial download manifest", () => {
  assert.throws(() => buildSiteDownloadManifest({
    tag_name: "app-v0.2.0",
    published_at: "2026-07-18T00:00:00Z",
    draft: false,
    prerelease: false,
    assets: assets.slice(0, 2)
  }, "mckay115/aval-design-studio"), /linux installer/u);
});

test("formats release sizes for compact download metadata", () => {
  assert.equal(formatFileSize(102147296), "97.4 MB");
  assert.equal(formatFileSize(225233400), "215 MB");
});

test("Pages and desktop release workflows keep the manifest current", async () => {
  const pagesWorkflow = await readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
  const releaseWorkflow = await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");

  assert.match(pagesWorkflow, /write-site-downloads\.mjs site\/downloads\.json/u);
  assert.match(releaseWorkflow, /actions: write/u);
  assert.match(releaseWorkflow, /gh workflow run pages\.yml/u);
});
