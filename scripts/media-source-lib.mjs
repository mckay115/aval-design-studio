import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { sha256File } from "./toolchain-lib.mjs";

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const TARGETS = [
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
  "x86_64-unknown-linux-gnu",
  "x86_64-pc-windows-msvc"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertRemoteFile(file, label) {
  assert(file !== null && typeof file === "object", `${label} must be an object.`);
  assert(/^https:\/\//u.test(file.url ?? ""), `${label} must use an HTTPS URL.`);
  assert(!file.url.includes("/latest/"), `${label} must not use a moving latest URL.`);
  assert(HASH_PATTERN.test(file.sha256 ?? ""), `${label} must have a lowercase SHA-256.`);
}

export function validateMediaSourceCatalog(catalog, expectedRelease) {
  assert(catalog?.schemaVersion === 1, "Media source catalog must use schemaVersion 1.");
  assert(
    typeof catalog.release === "string" && catalog.release.length > 0,
    "Media source catalog must name its release."
  );
  if (expectedRelease !== undefined) {
    assert(catalog.release === expectedRelease, `Media release must be ${expectedRelease}.`);
  }
  assertRemoteFile(catalog.license, "Media license");

  const targetNames = Object.keys(catalog.targets ?? {}).sort();
  assert(
    JSON.stringify(targetNames) === JSON.stringify([...TARGETS].sort()),
    `Media source catalog must define exactly: ${TARGETS.join(", ")}.`
  );

  for (const target of TARGETS) {
    const entry = catalog.targets[target];
    assert(typeof entry.provider === "string" && entry.provider.length > 0, `${target} needs a provider.`);
    assert(/^https:\/\//u.test(entry.providerUrl ?? ""), `${target} needs an HTTPS provider URL.`);
    assert(/^https:\/\//u.test(entry.buildInstructionsUrl ?? ""), `${target} needs build instructions.`);
    assert(/^[a-f0-9]{40}$/u.test(entry.builderRevision ?? ""), `${target} needs a full builder revision.`);
    assert(!Number.isNaN(Date.parse(entry.publishedAt ?? "")), `${target} needs a publication date.`);
    assertRemoteFile(entry.source, `${target} FFmpeg source`);
    assert(Array.isArray(entry.files) && entry.files.length >= 2, `${target} needs binary inputs.`);

    const extension = target.includes("windows") ? ".exe" : "";
    const outputs = new Set(entry.files.map((file) => file.output));
    assert(outputs.has(`ffmpeg${extension}`), `${target} is missing ffmpeg${extension}.`);
    assert(outputs.has(`ffprobe${extension}`), `${target} is missing ffprobe${extension}.`);
    for (const [index, file] of entry.files.entries()) {
      assertRemoteFile(file, `${target} input ${index + 1}`);
      assert(
        typeof file.output === "string" && /^(?:ffmpeg|ffprobe)(?:\.exe)?$|^LICENSE$/u.test(file.output),
        `${target} input ${index + 1} has an unsupported output name.`
      );
      assert(
        typeof file.member === "string" &&
          file.member.length > 0 &&
          !file.member.startsWith("/") &&
          !file.member.split(/[\\/]/u).includes(".."),
        `${target} input ${index + 1} has an unsafe archive member.`
      );
    }
  }

  assert(Array.isArray(catalog.sourceOffer) && catalog.sourceOffer.length > 0, "Source offer is empty.");
  const names = new Set();
  for (const [index, source] of catalog.sourceOffer.entries()) {
    assertRemoteFile(source, `Source offer ${index + 1}`);
    assert(
      typeof source.fileName === "string" &&
        basename(source.fileName) === source.fileName &&
        source.fileName.length > 0,
      `Source offer ${index + 1} needs a safe file name.`
    );
    assert(!names.has(source.fileName), `Duplicate source offer file ${source.fileName}.`);
    names.add(source.fileName);
  }

  return catalog;
}

export async function readMediaSourceCatalog(root, expectedRelease) {
  const catalog = JSON.parse(
    await readFile(resolve(root, "toolchain/media-sources.json"), "utf8")
  );
  return validateMediaSourceCatalog(catalog, expectedRelease);
}

export async function downloadVerified(url, expectedHash, destination) {
  await mkdir(resolve(destination, ".."), { recursive: true });
  const existingHash = await sha256File(destination).catch(() => null);
  if (existingHash === expectedHash) return destination;

  const temporary = `${destination}.partial`;
  await rm(temporary, { force: true });
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "aval-design-studio-release/1" }
  });
  if (!response.ok || response.body === null) {
    throw new Error(`Download failed (${response.status}) for ${url}.`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
  const actualHash = await sha256File(temporary);
  if (actualHash !== expectedHash) {
    await rm(temporary, { force: true });
    throw new Error(`SHA-256 mismatch for ${url}: expected ${expectedHash}, received ${actualHash}.`);
  }
  await rm(destination, { force: true });
  await rename(temporary, destination);
  return destination;
}

export const MEDIA_TARGETS = TARGETS;
