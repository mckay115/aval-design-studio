# Bundled desktop toolchain

Every distributed Studio build is self-contained. Users do not install Node.js,
the AVAL compiler, FFmpeg, or FFprobe. The release pipeline stages these as
Tauri external binaries and resources:

```text
src-tauri/
  binaries/
    aval-node-<rust-target>[.exe]
    ffmpeg-<rust-target>[.exe]
    ffprobe-<rust-target>[.exe]
  toolchain-runtime/
    node_modules/@pixel-point/aval-{compiler,element,format,graph,player-web}/
    licenses/
    toolchain-manifest.json
```

Tauri removes the target suffix when it places an external binary in the app.
The Rust host locates `aval-node`, then runs the pinned compiler CLI from the
resource directory. It passes the packaged FFmpeg and FFprobe paths directly to
the compiler. No shell, `PATH` lookup, runtime download, or user Node install is
involved.

## Pinned compiler

`toolchain/versions.json` pins the upstream `pixel-point/aval` commit and Node
runtime. Release CI checks out that exact commit, runs the upstream public
package build, and copies only the built package runtime, package metadata, and
licenses. `scripts/prepare-sidecars.mjs` rejects a different Git commit or
compiler version.

## Reviewed media archives

The release named in `toolchain/versions.json` must contain one pair per target:

```text
aval-media-toolchain-<rust-target>.tar.gz
aval-media-toolchain-<rust-target>.tar.gz.sha256
```

Each archive extracts this layout:

```text
ffmpeg[.exe]
ffprobe[.exe]
LICENSE
SOURCE.json
```

`SOURCE.json` is part of the release boundary:

```json
{
  "schemaVersion": 1,
  "target": "aarch64-apple-darwin",
  "ffmpeg": {
    "version": "8.1.2",
    "configure": "--enable-gpl ...",
    "sourceUrl": "https://example.invalid/ffmpeg-8.1.2.tar.xz",
    "sourceSha256": "64 lowercase hexadecimal characters",
    "buildInstructionsUrl": "https://example.invalid/reproducible-build"
  }
}
```

Preparation executes the binaries and rejects mismatched FFmpeg/FFprobe
versions, missing `libaom-av1`, `libvpx-vp9`, `libx265`, or `libx264`, missing
GPL enablement, `--enable-nonfree`, incomplete provenance, and target mismatch.
The observed configure line and executable hashes—not package labels—are written
to `toolchain-manifest.json` and included in the app.

The media archive release should be immutable and remain a prerelease so it does
not become the desktop updater's `/releases/latest` response. Exact corresponding
source archives and build instructions must remain available for as long as the
binary is distributed.

After placing a native reviewed build and its records in
`.toolchain/media/<target>`, create the exact release assets with:

```sh
pnpm toolchain:archive -- <target>
```

This repeats the encoder, redistribution, portability, and provenance checks
before writing the tarball and checksum record.

## Local/release preparation

Build the pinned upstream packages and place a reviewed media archive at
`.toolchain/media/<target>`, then run:

```sh
pnpm toolchain:prepare -- aarch64-apple-darwin
pnpm toolchain:verify -- aarch64-apple-darwin
AVAL_TARGET_TRIPLE=aarch64-apple-darwin pnpm release:config
pnpm tauri build --config src-tauri/tauri.release.conf.json
```

The generated config always includes all three external binaries and the
compiler runtime. CI cannot silently fall back to an editor-only installer.

## Runtime health

`toolchain_health` launches the private Node/compiler pair with `--help`, checks
FFmpeg and FFprobe, inventories the four required encoders, and requires the
packaged manifest. The Build drawer reports the exact manifest versions and
enables Build Bundle only when the selected codec encoders are present.

The `sidecar/` workspace remains a JSONL protocol host for toolchain development;
it is not the compiler shipped to users.

## Distribution gate

FFmpeg builds with `--enable-nonfree` are never accepted. Builds containing
x264/x265 are GPL builds, so a distributor must satisfy the applicable GPL
source, notice, and installation obligations as well as codec/patent review for
the intended regions. Code signing and notarization do not replace those duties.
