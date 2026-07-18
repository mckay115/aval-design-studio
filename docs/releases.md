# Release and deployment setup

## 1. Create the public repository and Pages site

Create `mckay115/aval-design-studio` (or change the repository URLs in `package.json`, `src-tauri/Cargo.toml`, and the frontend fallback), then push `main`. The updater endpoint is generated from GitHub's `GITHUB_REPOSITORY` value, so forks publish updates from their own release feed.

In **Settings → Pages**, select **GitHub Actions** as the publishing source. `.github/workflows/pages.yml` deploys the static `site/` directory on every relevant push to `main` and exposes the deployment through the `github-pages` environment.

## 2. Generate the update signing key

Run once on a trusted machine:

```sh
pnpm tauri signer generate -w ~/.tauri/aval-design-studio.key
```

Add these GitHub Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY` — the complete private key contents;
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the key password, or an empty value if intentionally generated without one.

Add the printed public key as the GitHub Actions repository variable
`TAURI_UPDATER_PUBLIC_KEY`. The release workflow reads it through the `vars`
context and injects it into each build as the `TAURI_UPDATER_PUBLIC_KEY`
environment variable. A legacy secret with the same name remains supported as
a fallback, but new repositories should use the non-sensitive Actions variable.

Never commit the private key. Losing it prevents installed builds from trusting future updates; leaking it requires a new trust/distribution plan.

## 3. Platform signing

Updater signatures protect update integrity but do not replace operating-system signing. Before broadly distributing releases, configure Apple Developer ID signing/notarization and a Windows code-signing certificate. Apple signing is opt-in: configure the complete `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` secret set, validate it in a release build, and only then set the `APPLE_SIGNING_ENABLED` Actions variable to `true`. Until that variable is enabled, the workflow ignores partial Apple credentials and uses Tauri's ad-hoc identity so both macOS architectures can still produce testable artifacts. Linux packages do not share one universal signing system; publish checksums and use the signed updater artifact for in-app updates.

## 4. Publish the required media toolchain

Run **Publish reviewed media toolchain** from the Actions tab on `main`. The workflow downloads only the immutable archives and hashes in `toolchain/media-sources.json`, executes each build on its native OS, rejects missing codecs or nonfree configuration, and publishes `aval-media-toolchain-<rust-target>.tar.gz` plus matching `.sha256` records. It also attaches corresponding FFmpeg source and pinned open-source build recipes.

The release is an immutable prerelease named by `toolchain/versions.json`, so it cannot replace the desktop app at GitHub's `/releases/latest` updater endpoint. Each archive contains FFmpeg, FFprobe, `LICENSE`, and `SOURCE.json`; the pinned AVAL compiler and private Node runtime are built directly in desktop release CI.

The release workflow always downloads and verifies the matching archive, builds the pinned official compiler, prepares Tauri's target-suffixed binaries/resources, and runs the toolchain smoke test. Missing or invalid media artifacts fail the release—there is no editor-only production fallback. See [toolchain.md](toolchain.md) for the archive contract and distribution gate.

## 5. Publish the desktop app

Keep the version synchronized in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`; `pnpm check` enforces this.

Choose one release trigger:

- Push the matching tag, for example `app-v0.1.0`; or
- Run **Release desktop app** manually from the Actions tab.

The workflow first signs a temporary probe with the configured updater private key and password, then validates the source and creates exactly one coordinated draft release pinned to that validated commit. A bad signing secret therefore fails before the platform matrix begins. The draft's numeric GitHub release ID is passed to the macOS Apple Silicon, macOS Intel, Linux x64, and Windows x64 jobs, so every installer and updater artifact is attached to the same release even when builds finish in a different order.

After all four builds succeed, the final job downloads the complete draft and verifies the platform installer families, signed updater entries, and per-target toolchain provenance. It then attaches `SHA256SUMS` and publishes the release as latest. A missing target leaves the release in draft, so installed builds never receive a partial `latest.json`.

Do not manually publish a partial draft created by a failed workflow. Fix the failed target and rerun the workflow so `latest.json` remains complete for every supported platform.

The installers are intentionally self-contained. This makes downloads and future full-package updates substantially larger, but removes Node/FFmpeg setup from the user workflow. Updater signing authenticates Tauri update artifacts. Public distribution still needs Apple Developer ID notarization and Windows Authenticode secrets to avoid operating-system trust warnings; an updater signature alone does not provide either platform trust signal.

## 6. Verify a published release

1. Confirm the single release contains macOS Apple Silicon and Intel DMGs, Windows NSIS and MSI installers, Linux AppImage, DEB, and RPM packages, updater signatures, `latest.json`, four toolchain manifests, and `SHA256SUMS`.
2. Install the previous release on each supported OS, publish the new version, and verify check → download → signature verification → install → relaunch.
3. Confirm the Pages download buttons resolve to the new GitHub release.
4. Preserve the updater private key and its password in an offline backup. They are required for every future update trusted by existing installations.
