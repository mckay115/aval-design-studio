import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const RELEASE_TARGETS = [
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
  "x86_64-unknown-linux-gnu",
  "x86_64-pc-windows-msvc"
];

export const UPDATER_PLATFORMS = [
  "darwin-aarch64",
  "darwin-x86_64",
  "linux-x86_64",
  "windows-x86_64"
];

const INSTALLER_FAMILIES = [
  {
    label: "macOS Apple Silicon DMG",
    matches: (name) => /(?:aarch64|arm64).*\.dmg$/iu.test(name)
  },
  {
    label: "macOS Intel DMG",
    matches: (name) => /(?:x64|x86_64).*\.dmg$/iu.test(name)
  },
  {
    label: "Linux AppImage",
    matches: (name) => /\.AppImage$/u.test(name)
  },
  {
    label: "Linux DEB package",
    matches: (name) => /\.deb$/iu.test(name)
  },
  {
    label: "Linux RPM package",
    matches: (name) => /\.rpm$/iu.test(name)
  },
  {
    label: "Windows NSIS installer",
    matches: (name) => /(?:setup|nsis).*\.exe$/iu.test(name)
  },
  {
    label: "Windows MSI installer",
    matches: (name) => /\.msi$/iu.test(name)
  }
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function verifyReleaseAssets(fileNames, latest, expectedVersion) {
  const names = [...fileNames].sort((left, right) => left.localeCompare(right));
  assert(names.includes("latest.json"), "Release is missing latest.json.");

  for (const family of INSTALLER_FAMILIES) {
    assert(names.some(family.matches), `Release is missing the ${family.label}.`);
  }

  for (const target of RELEASE_TARGETS) {
    assert(
      names.includes(`toolchain-manifest-${target}.json`),
      `Release is missing toolchain provenance for ${target}.`
    );
  }

  assert(
    names.filter((name) => name.endsWith(".sig")).length >= UPDATER_PLATFORMS.length,
    "Release must contain at least four updater signature assets."
  );
  assert(latest !== null && typeof latest === "object", "latest.json must contain an object.");
  assert(latest.version === expectedVersion, `latest.json version must be ${expectedVersion}.`);
  assert(
    latest.platforms !== null && typeof latest.platforms === "object",
    "latest.json must contain a platforms object."
  );

  for (const platform of UPDATER_PLATFORMS) {
    const entry = latest.platforms[platform];
    assert(entry !== null && typeof entry === "object", `latest.json is missing ${platform}.`);
    assert(
      typeof entry.url === "string" && /^https:\/\//u.test(entry.url),
      `latest.json ${platform} must contain an HTTPS updater URL.`
    );
    assert(
      typeof entry.signature === "string" && entry.signature.trim().length > 0,
      `latest.json ${platform} must contain an updater signature.`
    );
  }

  return {
    assets: names.length,
    installers: INSTALLER_FAMILIES.length,
    updaterPlatforms: UPDATER_PLATFORMS.length,
    targets: RELEASE_TARGETS.length
  };
}

async function main() {
  const [directoryArgument, versionArgument] = process.argv
    .slice(2)
    .filter((argument) => argument !== "--");
  const directory = resolve(directoryArgument || "release-assets");
  const expectedVersion = versionArgument?.trim();
  assert(expectedVersion, "Usage: node scripts/verify-release-assets.mjs <directory> <version>");
  const fileNames = await readdir(directory);
  const latest = JSON.parse(await readFile(resolve(directory, "latest.json"), "utf8"));
  const summary = verifyReleaseAssets(fileNames, latest, expectedVersion);
  console.log(
    `Verified ${summary.assets} assets: ${summary.installers} installer families, ` +
      `${summary.updaterPlatforms} updater platforms, and ${summary.targets} toolchain manifests.`
  );
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  await main();
}
