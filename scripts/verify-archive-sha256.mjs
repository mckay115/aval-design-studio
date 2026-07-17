import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const [archiveArgument, checksumArgument] = process.argv.slice(2);
if (!archiveArgument || !checksumArgument) {
  throw new Error("Usage: node scripts/verify-archive-sha256.mjs <archive> <checksum-file>");
}
const archive = resolve(archiveArgument);
const checksumFile = resolve(checksumArgument);
const expectedLine = (await readFile(checksumFile, "utf8")).trim();
const expected = expectedLine.match(/^([a-f0-9]{64})(?:\s+\*?(.+))?$/iu);
if (expected?.[1] === undefined) throw new Error("Checksum file is not a SHA-256 record.");
if (expected[2] !== undefined && basename(expected[2]) !== basename(archive)) {
  throw new Error(`Checksum record is for ${expected[2]}, not ${basename(archive)}.`);
}
const hash = createHash("sha256");
for await (const chunk of createReadStream(archive)) hash.update(chunk);
const actual = hash.digest("hex");
if (actual.toLowerCase() !== expected[1].toLowerCase()) {
  throw new Error(`Archive SHA-256 mismatch: expected ${expected[1]}, received ${actual}.`);
}
console.log(`Verified ${basename(archive)}: ${actual}`);
