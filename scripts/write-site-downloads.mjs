import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DOWNLOADS = Object.freeze({
  macos: {
    detail: "Apple Silicon · DMG",
    pattern: /_aarch64\.dmg$/u
  },
  windows: {
    detail: "x64 · Installer",
    pattern: /_x64-setup\.exe$/u
  },
  linux: {
    detail: "x64 · AppImage",
    pattern: /_amd64\.AppImage$/u
  }
});

export function buildSiteDownloadManifest(release, repository) {
  if (release.draft || release.prerelease) {
    throw new Error("The website download manifest requires a published stable release.");
  }
  const version = release.tag_name?.replace(/^app-v/u, "");
  if (!version || version === release.tag_name) {
    throw new Error(`Unexpected desktop release tag: ${release.tag_name || "missing"}.`);
  }

  const downloads = {};
  for (const [platform, configuration] of Object.entries(DOWNLOADS)) {
    const asset = release.assets?.find(({ name }) => configuration.pattern.test(name));
    if (!asset) {
      throw new Error(`The latest release is missing its ${platform} installer.`);
    }
    const expectedPrefix = `https://github.com/${repository}/releases/download/${release.tag_name}/`;
    if (!asset.browser_download_url?.startsWith(expectedPrefix)) {
      throw new Error(`The ${platform} installer URL does not belong to ${release.tag_name}.`);
    }
    downloads[platform] = {
      detail: configuration.detail,
      url: asset.browser_download_url,
      size: asset.size
    };
  }

  return {
    schemaVersion: 1,
    version,
    publishedAt: release.published_at,
    downloads
  };
}

async function readLatestRelease(repository) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "aval-design-studio-pages",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers
  });
  if (!response.ok) {
    throw new Error(`GitHub latest release request failed with ${response.status}.`);
  }
  return response.json();
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY || "mckay115/aval-design-studio";
  const output = resolve(process.argv[2] || "site/downloads.json");
  const release = await readLatestRelease(repository);
  const manifest = buildSiteDownloadManifest(release, repository);
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Wrote ${output} for AVAL Design Studio v${manifest.version}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
