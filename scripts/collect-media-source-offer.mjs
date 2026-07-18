import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { downloadVerified, readMediaSourceCatalog } from "./media-source-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [destinationArgument] = process.argv.slice(2).filter((argument) => argument !== "--");
const destination = resolve(destinationArgument || ".toolchain/source-offer");
const versions = JSON.parse(await readFile(resolve(root, "toolchain/versions.json"), "utf8"));
const catalog = await readMediaSourceCatalog(root, versions.media.archiveRelease);
await mkdir(destination, { recursive: true });

const checksumLines = [];
for (const source of catalog.sourceOffer) {
  const path = resolve(destination, source.fileName);
  await downloadVerified(source.url, source.sha256, path);
  checksumLines.push(`${source.sha256}  ${source.fileName}`);
}
await copyFile(
  resolve(root, "toolchain/media-sources.json"),
  resolve(destination, "media-sources.json")
);
await writeFile(resolve(destination, "SHA256SUMS"), `${checksumLines.join("\n")}\n`, "utf8");
await writeFile(
  resolve(destination, "SOURCE-OFFER.md"),
  `# Media toolchain source offer\n\n` +
    `These are the upstream FFmpeg sources and pinned open-source build recipes for ` +
    `the binaries in \`${catalog.release}\`. Binary archive URLs, hashes, observed configure ` +
    `flags, provider credits, and builder revisions are recorded in \`media-sources.json\` and ` +
    `each target's \`SOURCE.json\`. The distributed FFmpeg builds are GPL-enabled and builds ` +
    `with \`--enable-nonfree\` are rejected by release automation.\n`,
  "utf8"
);
console.log(`Collected ${catalog.sourceOffer.length} verified source archives in ${destination}.`);
