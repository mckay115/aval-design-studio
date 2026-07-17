import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertFile,
  assertPortableMedia,
  hostTargetTriple,
  parseMediaVersion,
  runTool,
  sha256File,
  validateFfmpeg,
  validateMediaProvenance
} from "./toolchain-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arguments_ = process.argv.slice(2).filter((argument) => argument !== "--");
const target = arguments_[0] || hostTargetTriple();
const sourceDirectory = resolve(arguments_[1] || `.toolchain/media/${target}`);
const outputDirectory = resolve(arguments_[2] || ".toolchain/release");
if (target !== hostTargetTriple()) {
  throw new Error(`Media archives must be validated on their native ${target} host.`);
}
const extension = target.includes("windows") ? ".exe" : "";
const ffmpeg = resolve(sourceDirectory, `ffmpeg${extension}`);
const ffprobe = resolve(sourceDirectory, `ffprobe${extension}`);
const license = resolve(sourceDirectory, "LICENSE");
const sourceRecord = resolve(sourceDirectory, "SOURCE.json");
for (const [path, label] of [[ffmpeg, "FFmpeg"], [ffprobe, "FFprobe"], [license, "license"], [sourceRecord, "source record"]]) {
  await assertFile(path, label);
}
const observed = validateFfmpeg(
  runTool(ffmpeg, ["-hide_banner", "-version"], "FFmpeg"),
  runTool(ffmpeg, ["-hide_banner", "-encoders"], "FFmpeg encoder inventory")
);
const probeVersion = parseMediaVersion(
  runTool(ffprobe, ["-hide_banner", "-version"], "FFprobe"),
  "ffprobe"
);
if (probeVersion !== observed.version) throw new Error("FFmpeg and FFprobe versions must match.");
assertPortableMedia([ffmpeg, ffprobe], target);
validateMediaProvenance(
  JSON.parse(await readFile(sourceRecord, "utf8")),
  observed,
  target
);
await mkdir(outputDirectory, { recursive: true });
const archiveName = `aval-media-toolchain-${target}.tar.gz`;
const archive = resolve(outputDirectory, archiveName);
runTool("tar", [
  "-czf", archive,
  "-C", sourceDirectory,
  `ffmpeg${extension}`,
  `ffprobe${extension}`,
  "LICENSE",
  "SOURCE.json"
], "media toolchain archive");
const hash = await sha256File(archive);
await writeFile(`${archive}.sha256`, `${hash}  ${archiveName}\n`, "utf8");
console.log(`Created ${archive} and verified SHA-256 ${hash}.`);
