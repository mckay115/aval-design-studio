import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { arch, platform } from "node:process";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";

export const REQUIRED_ENCODERS = [
  "libaom-av1",
  "libvpx-vp9",
  "libx265",
  "libx264"
];

export function hostTargetTriple(hostPlatform = platform, hostArch = arch) {
  const key = `${hostPlatform}/${hostArch}`;
  const targets = {
    "darwin/arm64": "aarch64-apple-darwin",
    "darwin/x64": "x86_64-apple-darwin",
    "linux/x64": "x86_64-unknown-linux-gnu",
    "win32/x64": "x86_64-pc-windows-msvc"
  };
  const target = targets[key];
  if (target === undefined) {
    throw new Error(`Unsupported toolchain host ${key}.`);
  }
  return target;
}

export function runTool(executable, args, label) {
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true
  });
  if (result.error !== undefined) {
    throw new Error(`Could not start ${label}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = `${result.stderr || result.stdout}`.trim().split(/\r?\n/u).slice(0, 8).join("\n");
    throw new Error(`${label} exited with ${String(result.status)}${detail ? `:\n${detail}` : "."}`);
  }
  return `${result.stdout || ""}${result.stderr || ""}`;
}

export function parseMediaVersion(text, tool) {
  const match = text.match(new RegExp(`^${tool} version ([^\\s]+)`, "mu"));
  if (match?.[1] === undefined) {
    throw new Error(`${tool} did not report a recognizable version.`);
  }
  return match[1];
}

export function parseConfigureLine(text) {
  const line = text.split(/\r?\n/u).find((entry) => entry.trimStart().startsWith("configuration:"));
  if (line === undefined) throw new Error("FFmpeg did not report its configure flags.");
  return line.trim().replace(/^configuration:\s*/u, "");
}

export function validateFfmpeg(ffmpegVersionText, encoderText) {
  const configure = parseConfigureLine(ffmpegVersionText);
  if (configure.includes("--enable-nonfree")) {
    throw new Error(
      "The selected FFmpeg was built with --enable-nonfree and cannot be redistributed."
    );
  }
  if (!configure.includes("--enable-gpl")) {
    throw new Error(
      "The selected FFmpeg must enable GPL components because AVAL requires libx264 and libx265."
    );
  }
  const encoders = REQUIRED_ENCODERS.filter((encoder) => encoderText.includes(encoder));
  const missing = REQUIRED_ENCODERS.filter((encoder) => !encoders.includes(encoder));
  if (missing.length > 0) {
    throw new Error(`FFmpeg is missing required AVAL encoders: ${missing.join(", ")}.`);
  }
  return {
    version: parseMediaVersion(ffmpegVersionText, "ffmpeg"),
    configure,
    encoders
  };
}

export function assertPortableMedia(executables, target) {
  if (target.includes("apple-darwin")) {
    for (const executable of executables) {
      const dependencies = runTool("otool", ["-L", executable], `Mach-O dependency check for ${executable}`);
      const unsupported = dependencies
        .split(/\r?\n/u)
        .slice(1)
        .map((line) => line.trim().split(/\s+/u)[0])
        .filter(Boolean)
        .filter((path) => !path.startsWith("/usr/lib/") && !path.startsWith("/System/Library/"));
      if (unsupported.length > 0) {
        throw new Error(
          `Media sidecar has unbundled macOS dependencies: ${unsupported.join(", ")}.`
        );
      }
    }
  }
  if (target.includes("unknown-linux-gnu")) {
    for (const executable of executables) {
      const result = spawnSync("ldd", [executable], { encoding: "utf8", windowsHide: true });
      const output = `${result.stdout || ""}${result.stderr || ""}`;
      const unsupported = unsupportedLinuxDependencies(output);
      if (unsupported.length > 0) {
        throw new Error(
          `${executable} has unbundled Linux dependencies: ${unsupported.join(", ")}.\n` +
            `ldd reported:\n${output.trim()}`
        );
      }
    }
  }
}

const LINUX_SYSTEM_ABI = new Set([
  "ld-linux-x86-64.so.2",
  "libc.so.6",
  "libdl.so.2",
  "libgcc_s.so.1",
  "libm.so.6",
  "libmvec.so.1",
  "libpthread.so.0",
  "librt.so.1",
  "linux-vdso.so.1"
]);

export function unsupportedLinuxDependencies(output) {
  if (/not a dynamic executable|statically linked/iu.test(output)) return [];
  const unsupported = [];
  for (const line of output.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const first = trimmed.split(/\s+/u)[0];
    const name = first.split(/[\\/]/u).at(-1);
    if (trimmed.includes("=> not found")) {
      unsupported.push(`${name} (not found)`);
    } else if (!LINUX_SYSTEM_ABI.has(name)) {
      unsupported.push(name);
    }
  }
  return unsupported;
}

export async function sha256File(path) {
  const hash = createHash("sha256");
  hash.update(await readFile(path));
  return hash.digest("hex");
}

export async function sha256Directory(path) {
  const hash = createHash("sha256");
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      const name = relative(path, absolute).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        hash.update(`${name}\0`);
        hash.update(await readFile(absolute));
        hash.update("\0");
      }
    }
  }
  await visit(path);
  return hash.digest("hex");
}

export async function assertFile(path, label) {
  const metadata = await stat(path).catch(() => null);
  if (metadata === null || !metadata.isFile()) {
    throw new Error(`Missing ${label}: ${path}`);
  }
}

export function validateMediaProvenance(provenance, observed, target, binaryHashes) {
  if (provenance?.schemaVersion !== 1 || provenance?.target !== target) {
    throw new Error("Media SOURCE.json must use schemaVersion 1 and match the requested target.");
  }
  const media = provenance.ffmpeg;
  if (media?.version !== observed.version || media?.configure !== observed.configure) {
    throw new Error("Media SOURCE.json does not match the FFmpeg binary's version/configuration.");
  }
  if (!/^https:\/\//u.test(media.sourceUrl ?? "") || !/^[a-f0-9]{64}$/u.test(media.sourceSha256 ?? "")) {
    throw new Error("Media SOURCE.json must identify an HTTPS source archive and its SHA-256 hash.");
  }
  if (!/^https:\/\//u.test(media.buildInstructionsUrl ?? "")) {
    throw new Error("Media SOURCE.json must link to reproducible build instructions.");
  }
  if (
    !/^https:\/\//u.test(media.license?.url ?? "") ||
    !/^[a-f0-9]{64}$/u.test(media.license?.sha256 ?? "")
  ) {
    throw new Error("Media SOURCE.json must identify its license text and hash.");
  }
  const distribution = media.binaryDistribution;
  if (
    typeof distribution?.provider !== "string" ||
    !/^https:\/\//u.test(distribution?.providerUrl ?? "") ||
    !/^[a-f0-9]{40}$/u.test(distribution?.builderRevision ?? "") ||
    !Array.isArray(distribution?.archives) ||
    distribution.archives.length === 0 ||
    distribution.archives.some(
      (archive) =>
        !/^https:\/\//u.test(archive?.url ?? "") ||
        !/^[a-f0-9]{64}$/u.test(archive?.sha256 ?? "")
    )
  ) {
    throw new Error("Media SOURCE.json must identify the pinned binary distribution and builder.");
  }
  if (
    !/^[a-f0-9]{64}$/u.test(media.binaries?.ffmpegSha256 ?? "") ||
    !/^[a-f0-9]{64}$/u.test(media.binaries?.ffprobeSha256 ?? "")
  ) {
    throw new Error("Media SOURCE.json must contain FFmpeg and FFprobe hashes.");
  }
  if (
    binaryHashes !== undefined &&
    (media.binaries.ffmpegSha256 !== binaryHashes.ffmpegSha256 ||
      media.binaries.ffprobeSha256 !== binaryHashes.ffprobeSha256)
  ) {
    throw new Error("Media SOURCE.json binary hashes do not match the packaged executables.");
  }
}
