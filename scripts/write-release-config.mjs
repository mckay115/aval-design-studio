import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { hostTargetTriple } from "./toolchain-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(root, "src-tauri/tauri.release.conf.json");
const repository = process.env.GITHUB_REPOSITORY?.trim() || "zlisko/aval-design-studio";
const publicKey = process.env.TAURI_UPDATER_PUBLIC_KEY?.trim();
const target = process.env.AVAL_TARGET_TRIPLE || hostTargetTriple();
const extension = target.includes("windows") ? ".exe" : "";

if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/iu.test(repository)) {
  throw new Error(`GITHUB_REPOSITORY must be an owner/name pair; received ${repository}`);
}

if (process.env.CI === "true" && !publicKey) {
  throw new Error(
    "TAURI_UPDATER_PUBLIC_KEY is required. Generate it with `pnpm tauri signer generate` " +
      "and store the private key in GitHub Actions secrets."
  );
}

const manifestPath = resolve(root, "src-tauri/toolchain-runtime/toolchain-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.target !== target) {
  throw new Error(`Prepared toolchain target is ${manifest.target}; expected ${target}.`);
}
for (const executable of ["aval-node", "ffmpeg", "ffprobe"]) {
  await access(resolve(root, `src-tauri/binaries/${executable}-${target}${extension}`));
}

const bundle = {
  createUpdaterArtifacts: publicKey ? true : false,
  externalBin: [
    "binaries/aval-node",
    "binaries/ffmpeg",
    "binaries/ffprobe"
  ],
  resources: {
    "toolchain-runtime/": "toolchain-runtime/",
    "../LICENSE": "LICENSE",
    "../THIRD_PARTY_NOTICES.md": "THIRD_PARTY_NOTICES.md"
  }
};

const config = {
  bundle
};
if (publicKey) {
  config.plugins = {
    updater: {
      endpoints: [
        `https://github.com/${repository}/releases/latest/download/latest.json`
      ],
      pubkey: publicKey,
      windows: {
        installMode: "passive"
      }
    }
  };
}

await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(
  `Wrote ${destination} for ${repository} with the complete ${target} toolchain.`
);
