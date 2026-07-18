import { readFile } from "node:fs/promises";

function environment() {
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  const token = (process.env.GH_TOKEN || process.env.GITHUB_TOKEN)?.trim();
  if (!/^[^/]+\/[^/]+$/u.test(repository ?? "")) {
    throw new Error("GITHUB_REPOSITORY must contain owner/name.");
  }
  if (!token) throw new Error("GH_TOKEN or GITHUB_TOKEN is required.");
  return { repository, token };
}

export async function githubRequest(url, options = {}) {
  const { token } = environment();
  const response = await fetch(url, {
    redirect: "follow",
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "aval-design-studio-release/1",
      ...options.headers
    }
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    throw new Error(`GitHub API ${response.status} for ${url}: ${detail}`);
  }
  return response;
}

export async function readRelease(releaseId) {
  if (!/^[0-9]+$/u.test(String(releaseId))) throw new Error("Release ID must be numeric.");
  const { repository } = environment();
  const response = await githubRequest(
    `https://api.github.com/repos/${repository}/releases/${releaseId}`
  );
  return response.json();
}

export async function uploadReleaseFile(release, path, name) {
  const existing = release.assets.filter((asset) => asset.name === name);
  if (existing.length > 1) throw new Error(`Release has duplicate assets named ${name}.`);
  if (existing.length === 1) {
    const { repository } = environment();
    await githubRequest(
      `https://api.github.com/repos/${repository}/releases/assets/${existing[0].id}`,
      { method: "DELETE" }
    );
  }
  const uploadBase = release.upload_url.replace(/\{.*$/u, "");
  await githubRequest(`${uploadBase}?name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: await readFile(path)
  });
}
