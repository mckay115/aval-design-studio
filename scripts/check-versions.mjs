import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [packageJson, tauriConfig, cargoToml, versionsConfig, mediaSources] = await Promise.all([
  readFile(resolve(root, "package.json"), "utf8").then(JSON.parse),
  readFile(resolve(root, "src-tauri/tauri.conf.json"), "utf8").then(JSON.parse),
  readFile(resolve(root, "src-tauri/Cargo.toml"), "utf8"),
  readFile(resolve(root, "toolchain/versions.json"), "utf8").then(JSON.parse),
  readFile(resolve(root, "toolchain/media-sources.json"), "utf8").then(JSON.parse)
]);
const cargoVersion = /^version\s*=\s*"([^"]+)"/mu.exec(cargoToml)?.[1];
const versions = [packageJson.version, tauriConfig.version, cargoVersion];

if (versions.some((version) => version !== versions[0])) {
  throw new Error(`Version mismatch: package.json=${versions[0]}, tauri.conf=${versions[1]}, Cargo.toml=${versions[2]}`);
}

if (versionsConfig.media.archiveRelease !== mediaSources.release) {
  throw new Error(
    `Media release mismatch: versions.json=${versionsConfig.media.archiveRelease}, ` +
      `media-sources.json=${mediaSources.release}`
  );
}

if (
  !/^https:\/\//u.test(versionsConfig.node.licenseUrl ?? "") ||
  !/^[a-f0-9]{64}$/u.test(versionsConfig.node.licenseSha256 ?? "")
) {
  throw new Error("Node license URL and SHA-256 must be pinned in toolchain/versions.json.");
}

console.log(`Version ${versions[0]} and media release ${mediaSources.release} are synchronized.`);
