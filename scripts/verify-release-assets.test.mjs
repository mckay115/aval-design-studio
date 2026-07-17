import assert from "node:assert/strict";
import test from "node:test";

import {
  RELEASE_TARGETS,
  UPDATER_PLATFORMS,
  verifyReleaseAssets
} from "./verify-release-assets.mjs";

function validFixture() {
  const files = [
    "latest.json",
    "AVAL.Design.Studio_0.2.0_aarch64.dmg",
    "AVAL.Design.Studio_0.2.0_x64.dmg",
    "aval-design-studio_0.2.0_amd64.AppImage",
    "aval-design-studio_0.2.0_amd64.deb",
    "aval-design-studio-0.2.0-1.x86_64.rpm",
    "AVAL.Design.Studio_0.2.0_x64-setup.exe",
    "AVAL.Design.Studio_0.2.0_x64_en-US.msi",
    ...RELEASE_TARGETS.map((target) => `toolchain-manifest-${target}.json`),
    ...UPDATER_PLATFORMS.map((platform) => `${platform}.updater.sig`)
  ];
  const platforms = Object.fromEntries(
    UPDATER_PLATFORMS.map((platform) => [
      platform,
      {
        url: `https://api.github.com/repos/example/studio/releases/assets/${platform}`,
        signature: `signed-${platform}`
      }
    ])
  );
  return {
    files,
    latest: { version: "0.2.0", notes: "Release", platforms }
  };
}

test("accepts one complete cross-platform release", () => {
  const fixture = validFixture();
  assert.deepEqual(verifyReleaseAssets(fixture.files, fixture.latest, "0.2.0"), {
    assets: 16,
    installers: 7,
    updaterPlatforms: 4,
    targets: 4
  });
});

test("rejects a release missing a supported updater platform", () => {
  const fixture = validFixture();
  delete fixture.latest.platforms["darwin-aarch64"];
  assert.throws(
    () => verifyReleaseAssets(fixture.files, fixture.latest, "0.2.0"),
    /latest\.json is missing darwin-aarch64/u
  );
});

test("rejects a release missing an installer family", () => {
  const fixture = validFixture();
  fixture.files = fixture.files.filter((name) => !name.endsWith(".rpm"));
  assert.throws(
    () => verifyReleaseAssets(fixture.files, fixture.latest, "0.2.0"),
    /missing the Linux RPM package/u
  );
});

test("rejects updater metadata for the wrong version", () => {
  const fixture = validFixture();
  assert.throws(
    () => verifyReleaseAssets(fixture.files, fixture.latest, "0.3.0"),
    /latest\.json version must be 0\.3\.0/u
  );
});
