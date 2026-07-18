import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { downloadVerified, readMediaSourceCatalog } from "./media-source-lib.mjs";
import {
  assertPortableMedia,
  hostTargetTriple,
  parseMediaVersion,
  runTool,
  sha256File,
  validateFfmpeg
} from "./toolchain-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [targetArgument] = process.argv.slice(2).filter((argument) => argument !== "--");
const target = targetArgument || hostTargetTriple();
if (target !== hostTargetTriple()) {
  throw new Error(`Media inputs must be executed and reviewed on their native ${target} host.`);
}

const versions = JSON.parse(await readFile(resolve(root, "toolchain/versions.json"), "utf8"));
const catalog = await readMediaSourceCatalog(root, versions.media.archiveRelease);
const entry = catalog.targets[target];
const cacheDirectory = resolve(root, ".toolchain/downloads");
const destination = resolve(root, `.toolchain/media/${target}`);
const extractionRoot = await mkdtemp(resolve(tmpdir(), "aval-media-source-"));

try {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const archives = new Map();

  for (const file of entry.files) {
    let archive = archives.get(file.url);
    if (archive === undefined) {
      const urlName = basename(new URL(file.url).pathname);
      archive = resolve(cacheDirectory, `${file.sha256.slice(0, 16)}-${urlName}`);
      await downloadVerified(file.url, file.sha256, archive);
      const extraction = resolve(extractionRoot, String(archives.size));
      await mkdir(extraction, { recursive: true });
      runTool("tar", ["-xf", archive, "-C", extraction], `archive extraction for ${target}`);
      archives.set(file.url, { archive, extraction, sha256: file.sha256 });
      archive = archives.get(file.url);
    } else if (archive.sha256 !== file.sha256) {
      throw new Error(`Conflicting hashes were configured for ${file.url}.`);
    }
    await copyFile(resolve(archive.extraction, file.member), resolve(destination, file.output));
  }

  const extension = target.includes("windows") ? ".exe" : "";
  const ffmpeg = resolve(destination, `ffmpeg${extension}`);
  const ffprobe = resolve(destination, `ffprobe${extension}`);
  if (!extension) {
    await chmod(ffmpeg, 0o755);
    await chmod(ffprobe, 0o755);
  }
  const licensePath = resolve(destination, "LICENSE");
  try {
    await readFile(licensePath);
  } catch {
    await downloadVerified(catalog.license.url, catalog.license.sha256, licensePath);
  }
  const licenseSha256 = await sha256File(licensePath);
  if (licenseSha256 !== catalog.license.sha256) {
    throw new Error(
      `Packaged license hash is ${licenseSha256}; expected ${catalog.license.sha256}.`
    );
  }

  const ffmpegVersionText = runTool(ffmpeg, ["-hide_banner", "-version"], "FFmpeg");
  const observed = validateFfmpeg(
    ffmpegVersionText,
    runTool(ffmpeg, ["-hide_banner", "-encoders"], "FFmpeg encoder inventory")
  );
  const probeVersion = parseMediaVersion(
    runTool(ffprobe, ["-hide_banner", "-version"], "FFprobe"),
    "ffprobe"
  );
  if (probeVersion !== observed.version) {
    throw new Error(`FFmpeg ${observed.version} and FFprobe ${probeVersion} must match.`);
  }
  assertPortableMedia([ffmpeg, ffprobe], target);

  const archiveRecords = [...archives.entries()].map(([url, value]) => ({
    url,
    sha256: value.sha256
  }));
  const provenance = {
    schemaVersion: 1,
    target,
    ffmpeg: {
      version: observed.version,
      configure: observed.configure,
      sourceUrl: entry.source.url,
      sourceSha256: entry.source.sha256,
      buildInstructionsUrl: entry.buildInstructionsUrl,
      license: {
        url: catalog.license.url,
        sha256: licenseSha256
      },
      binaryDistribution: {
        provider: entry.provider,
        providerUrl: entry.providerUrl,
        publishedAt: entry.publishedAt,
        builderRevision: entry.builderRevision,
        archives: archiveRecords
      },
      binaries: {
        ffmpegSha256: await sha256File(ffmpeg),
        ffprobeSha256: await sha256File(ffprobe)
      }
    }
  };
  await writeFile(
    resolve(destination, "SOURCE.json"),
    `${JSON.stringify(provenance, null, 2)}\n`,
    "utf8"
  );
  console.log(
    `Fetched and natively validated ${entry.provider} FFmpeg ${observed.version} for ${target}.`
  );
} finally {
  await rm(extractionRoot, { recursive: true, force: true });
}
