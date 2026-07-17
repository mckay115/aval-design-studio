import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertFile,
  hostTargetTriple,
  parseMediaVersion,
  runTool,
  sha256Directory,
  sha256File,
  validateFfmpeg
} from "./toolchain-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [targetArgument] = process.argv.slice(2).filter((argument) => argument !== "--");
const target = targetArgument || process.env.AVAL_TARGET_TRIPLE || hostTargetTriple();
const extension = target.includes("windows") ? ".exe" : "";
const binaryDirectory = resolve(root, "src-tauri/binaries");
const runtimeDirectory = resolve(root, "src-tauri/toolchain-runtime");
const nodePath = resolve(binaryDirectory, `aval-node-${target}${extension}`);
const ffmpegPath = resolve(binaryDirectory, `ffmpeg-${target}${extension}`);
const ffprobePath = resolve(binaryDirectory, `ffprobe-${target}${extension}`);
const compilerRoot = resolve(runtimeDirectory, "node_modules/@pixel-point");
const compilerCli = resolve(compilerRoot, "aval-compiler/dist/cli.js");
const manifestPath = resolve(runtimeDirectory, "toolchain-manifest.json");
for (const [path, label] of [
  [nodePath, "packaged Node runtime"],
  [ffmpegPath, "packaged FFmpeg"],
  [ffprobePath, "packaged FFprobe"],
  [compilerCli, "packaged AVAL compiler"],
  [manifestPath, "toolchain manifest"]
]) {
  await assertFile(path, label);
}
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.target !== target) throw new Error(`Manifest target is ${manifest.target}; expected ${target}.`);
runTool(nodePath, [compilerCli, "--help"], "packaged AVAL compiler");
const observed = validateFfmpeg(
  runTool(ffmpegPath, ["-hide_banner", "-version"], "packaged FFmpeg"),
  runTool(ffmpegPath, ["-hide_banner", "-encoders"], "packaged FFmpeg encoder inventory")
);
const ffprobeVersion = parseMediaVersion(
  runTool(ffprobePath, ["-hide_banner", "-version"], "packaged FFprobe"),
  "ffprobe"
);
const checks = [
  [manifest.node.sha256, await sha256File(nodePath), "Node"],
  [manifest.ffmpeg.sha256, await sha256File(ffmpegPath), "FFmpeg"],
  [manifest.ffprobe.sha256, await sha256File(ffprobePath), "FFprobe"],
  [manifest.aval.runtimeSha256, await sha256Directory(compilerRoot), "AVAL compiler runtime"]
];
for (const [expected, actual, label] of checks) {
  if (expected !== actual) throw new Error(`${label} SHA-256 does not match the toolchain manifest.`);
}
if (observed.version !== manifest.ffmpeg.version || ffprobeVersion !== manifest.ffprobe.version) {
  throw new Error("Packaged media versions do not match the toolchain manifest.");
}
console.log(`Verified complete ${target} toolchain with ${observed.encoders.length} AVAL encoders.`);
