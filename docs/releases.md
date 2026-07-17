# Release setup

## 1. Create the public repository

Create `zlisko/aval-design-studio` (or change the repository URLs in `package.json`, `src-tauri/Cargo.toml`, and the frontend fallback), then push `main`. The updater endpoint is generated from GitHub's `GITHUB_REPOSITORY` value, so forks publish updates from their own release feed.

## 2. Generate the update signing key

Run once on a trusted machine:

```sh
pnpm tauri signer generate -w ~/.tauri/aval-design-studio.key
```

Add these GitHub Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY` — the complete private key contents;
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the key password, or an empty value if intentionally generated without one;
- `TAURI_UPDATER_PUBLIC_KEY` — the printed public key. This is not secret, but storing it with release settings keeps the generated config out of source control.

Never commit the private key. Losing it prevents installed builds from trusting future updates; leaking it requires a new trust/distribution plan.

## 3. Platform signing

Updater signatures protect update integrity but do not replace operating-system signing. Before broadly distributing releases, configure Apple Developer ID signing/notarization and a Windows code-signing certificate. Linux packages do not share one universal signing system; publish checksums and use the signed updater artifact for in-app updates.

## 4. Publish the required media toolchain

Publish reviewed archives named `aval-media-toolchain-<rust-target>.tar.gz` plus matching `.sha256` records in the immutable prerelease named by `toolchain/versions.json`. Keeping it a prerelease prevents a toolchain-only release from replacing the desktop app at GitHub's `/releases/latest` updater endpoint. Each archive contains FFmpeg, FFprobe, `LICENSE`, and `SOURCE.json`; the pinned AVAL compiler and private Node runtime are built directly in release CI.

The release workflow always downloads and verifies the matching archive, builds the pinned official compiler, prepares Tauri's target-suffixed binaries/resources, and runs the toolchain smoke test. Missing or invalid media artifacts fail the release—there is no editor-only production fallback. See [toolchain.md](toolchain.md) for the archive contract and distribution gate.

## 5. Publish

Keep the version synchronized in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`; `pnpm check` enforces this. Run the **Release desktop app** workflow. It creates or updates a draft `app-v<version>` release across all platforms. Inspect its installers, signatures, and `latest.json`, then publish the draft. Published installed builds will discover it on their next update check.
