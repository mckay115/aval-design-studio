import { basename, resolve } from "node:path";

import { readRelease, uploadReleaseFile } from "./github-release-assets.mjs";

const [releaseId, ...fileArguments] = process.argv.slice(2).filter((argument) => argument !== "--");
if (!releaseId || fileArguments.length === 0) {
  throw new Error("Usage: node scripts/upload-release-assets.mjs <release-id> <file> [...file]");
}
const release = await readRelease(releaseId);
for (const fileArgument of fileArguments) {
  const path = resolve(fileArgument);
  const name = basename(path);
  await uploadReleaseFile(release, path, name);
  release.assets = release.assets.filter((asset) => asset.name !== name);
  console.log(`Uploaded ${name} to release ${releaseId}.`);
}
