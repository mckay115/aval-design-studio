import { chmod, cp, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import {
  assertFile,
  assertPortableMedia,
  hostTargetTriple,
  parseMediaVersion,
  runTool,
  sha256Directory,
  sha256File,
  validateFfmpeg,
  validateMediaProvenance
} from "./toolchain-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [targetArgument] = process.argv.slice(2).filter((argument) => argument !== "--");
const target = targetArgument || process.env.AVAL_TARGET_TRIPLE;
if (!target || !/^[a-z0-9_.-]+$/iu.test(target)) {
  throw new Error(
    "Pass a Rust target triple, for example: pnpm toolchain:prepare -- aarch64-apple-darwin"
  );
}
const hostTarget = hostTargetTriple();
if (hostTarget !== target) {
  throw new Error(`Toolchains must be prepared on their native host (${hostTarget}); received ${target}.`);
}

const versions = JSON.parse(await readFile(resolve(root, "toolchain/versions.json"), "utf8"));
const compilerSource = resolve(root, process.env.AVAL_COMPILER_SOURCE || ".toolchain/aval-source");
const compilerPackages = ["graph", "format", "player-web", "element", "compiler"];
const compilerPackageRoot = resolve(compilerSource, "packages");
const compilerCli = resolve(compilerPackageRoot, "compiler/dist/cli.js");
await assertFile(compilerCli, "built AVAL compiler CLI");

const compilerCommit = execFileSync("git", ["-C", compilerSource, "rev-parse", "HEAD"], {
  encoding: "utf8"
}).trim();
if (compilerCommit !== versions.aval.commit) {
  throw new Error(`AVAL source is ${compilerCommit}; expected reviewed commit ${versions.aval.commit}.`);
}
const compilerPackage = JSON.parse(
  await readFile(resolve(compilerPackageRoot, "compiler/package.json"), "utf8")
);
if (compilerPackage.version !== versions.aval.compilerVersion) {
  throw new Error(
    `AVAL compiler is ${compilerPackage.version}; expected ${versions.aval.compilerVersion}.`
  );
}

const mediaDirectory = resolve(
  root,
  process.env.AVAL_MEDIA_TOOLCHAIN_DIR || `.toolchain/media/${target}`
);
const extension = target.includes("windows") ? ".exe" : "";
const ffmpegSource = resolve(process.env.AVAL_FFMPEG_PATH || join(mediaDirectory, `ffmpeg${extension}`));
const ffprobeSource = resolve(process.env.AVAL_FFPROBE_PATH || join(mediaDirectory, `ffprobe${extension}`));
const provenanceSource = resolve(mediaDirectory, "SOURCE.json");
const mediaLicenseSource = resolve(mediaDirectory, "LICENSE");
for (const [path, label] of [
  [process.execPath, "Node runtime"],
  [ffmpegSource, "FFmpeg"],
  [ffprobeSource, "FFprobe"],
  [provenanceSource, "media provenance"],
  [mediaLicenseSource, "media license"]
]) {
  await assertFile(path, label);
}

const expectedNodeVersion = versions.node.version;
if (process.versions.node !== expectedNodeVersion && process.env.CI === "true") {
  throw new Error(`Release Node runtime is ${process.versions.node}; expected ${expectedNodeVersion}.`);
}
runTool(process.execPath, [compilerCli, "--help"], "AVAL compiler");
const ffmpegVersionText = runTool(ffmpegSource, ["-hide_banner", "-version"], "FFmpeg");
const encoderText = runTool(ffmpegSource, ["-hide_banner", "-encoders"], "FFmpeg encoder inventory");
const observedMedia = validateFfmpeg(ffmpegVersionText, encoderText);
const ffprobeVersionText = runTool(ffprobeSource, ["-hide_banner", "-version"], "FFprobe");
const ffprobeVersion = parseMediaVersion(ffprobeVersionText, "ffprobe");
if (ffprobeVersion !== observedMedia.version) {
  throw new Error(`FFmpeg ${observedMedia.version} and FFprobe ${ffprobeVersion} must match.`);
}
assertPortableMedia([ffmpegSource, ffprobeSource], target);
const provenance = JSON.parse(await readFile(provenanceSource, "utf8"));
const sourceBinaryHashes = {
  ffmpegSha256: await sha256File(ffmpegSource),
  ffprobeSha256: await sha256File(ffprobeSource)
};
validateMediaProvenance(provenance, observedMedia, target, sourceBinaryHashes);

const destinationDirectory = resolve(root, "src-tauri/binaries");
const runtimeDirectory = resolve(root, "src-tauri/toolchain-runtime");
const packageDestination = resolve(runtimeDirectory, "node_modules/@pixel-point");
const licenseDestination = resolve(runtimeDirectory, "licenses");
await rm(runtimeDirectory, { recursive: true, force: true });
await mkdir(destinationDirectory, { recursive: true });
await mkdir(packageDestination, { recursive: true });
await mkdir(licenseDestination, { recursive: true });

const binaries = [
  [process.execPath, resolve(destinationDirectory, `aval-node-${target}${extension}`)],
  [ffmpegSource, resolve(destinationDirectory, `ffmpeg-${target}${extension}`)],
  [ffprobeSource, resolve(destinationDirectory, `ffprobe-${target}${extension}`)]
];
for (const [source, destination] of binaries) {
  await copyFile(source, destination);
  if (!extension) await chmod(destination, 0o755);
}

for (const packageName of compilerPackages) {
  const source = resolve(compilerPackageRoot, packageName);
  const destination = resolve(packageDestination, `aval-${packageName}`);
  await assertFile(resolve(source, "package.json"), `@pixel-point/aval-${packageName} package`);
  await cp(resolve(source, "dist"), resolve(destination, "dist"), { recursive: true });
  for (const file of ["package.json", "LICENSE", "README.md", "THIRD_PARTY_NOTICES.md"]) {
    const sourceFile = resolve(source, file);
    try {
      await copyFile(sourceFile, resolve(destination, file));
    } catch (error) {
      if (file === "package.json" || file === "LICENSE") throw error;
    }
  }
}

const nodeLicense = resolve(
  process.env.AVAL_NODE_LICENSE || join(dirname(process.execPath), "../LICENSE")
);
await assertFile(nodeLicense, "Node.js license");
await copyFile(nodeLicense, resolve(licenseDestination, "NODE-LICENSE.txt"));
await copyFile(mediaLicenseSource, resolve(licenseDestination, "FFMPEG-LICENSE.txt"));
await copyFile(provenanceSource, resolve(licenseDestination, "FFMPEG-SOURCE.json"));

const manifest = {
  schemaVersion: 1,
  target,
  generatedAt: new Date().toISOString(),
  aval: {
    repository: versions.aval.repository,
    commit: compilerCommit,
    compilerVersion: compilerPackage.version,
    runtimeSha256: await sha256Directory(packageDestination)
  },
  node: {
    version: process.versions.node,
    sha256: await sha256File(binaries[0][1])
  },
  ffmpeg: {
    version: observedMedia.version,
    configure: observedMedia.configure,
    encoders: observedMedia.encoders,
    sha256: await sha256File(binaries[1][1]),
    sourceUrl: provenance.ffmpeg.sourceUrl,
    sourceSha256: provenance.ffmpeg.sourceSha256,
    buildInstructionsUrl: provenance.ffmpeg.buildInstructionsUrl,
    license: provenance.ffmpeg.license,
    binaryDistribution: provenance.ffmpeg.binaryDistribution
  },
  ffprobe: {
    version: ffprobeVersion,
    sha256: await sha256File(binaries[2][1])
  }
};
await writeFile(
  resolve(runtimeDirectory, "toolchain-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);
console.log(
  `Prepared ${target}: AVAL ${compilerPackage.version}, Node ${process.versions.node}, FFmpeg ${observedMedia.version}.`
);
