import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { githubRequest, readRelease } from "./github-release-assets.mjs";

const [releaseId, directoryArgument] = process.argv.slice(2).filter((argument) => argument !== "--");
if (!releaseId || !directoryArgument) {
  throw new Error("Usage: node scripts/download-release-assets.mjs <release-id> <directory>");
}
const destination = resolve(directoryArgument);
const release = await readRelease(releaseId);
const names = new Set();
await mkdir(destination, { recursive: true });
for (const asset of release.assets) {
  if (basename(asset.name) !== asset.name || names.has(asset.name)) {
    throw new Error(`Release contains an unsafe or duplicate asset name: ${asset.name}`);
  }
  names.add(asset.name);
  const response = await githubRequest(asset.url, {
    headers: { accept: "application/octet-stream" }
  });
  if (response.body === null) throw new Error(`GitHub returned no data for ${asset.name}.`);
  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(resolve(destination, asset.name))
  );
  console.log(`Downloaded ${asset.name} from release ${releaseId}.`);
}
