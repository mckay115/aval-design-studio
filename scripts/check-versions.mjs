import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [packageJson, tauriConfig, cargoToml] = await Promise.all([
  readFile(resolve(root, "package.json"), "utf8").then(JSON.parse),
  readFile(resolve(root, "src-tauri/tauri.conf.json"), "utf8").then(JSON.parse),
  readFile(resolve(root, "src-tauri/Cargo.toml"), "utf8")
]);
const cargoVersion = /^version\s*=\s*"([^"]+)"/mu.exec(cargoToml)?.[1];
const versions = [packageJson.version, tauriConfig.version, cargoVersion];

if (versions.some((version) => version !== versions[0])) {
  throw new Error(`Version mismatch: package.json=${versions[0]}, tauri.conf=${versions[1]}, Cargo.toml=${versions[2]}`);
}

console.log(`Version ${versions[0]} is synchronized.`);
