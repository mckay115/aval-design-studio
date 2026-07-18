# Third-party notices

AVAL Design Studio is built with open-source JavaScript and Rust dependencies. Their license metadata is retained in the package and Cargo lockfiles and in the distributed application as required.

## MediaBunny

- **MediaBunny 1.50.8** — copyright Vanilagy and contributors; Mozilla Public License 2.0.
- **@mediabunny/prores 1.50.8 / TurboRes** — ProRes decoding extension and WebAssembly decoder; retain their MPL-2.0 notices and distributed license text.

The Studio imports these packages without modifying their source. If a release begins shipping modified MPL-covered files, those modified files must remain available under MPL-2.0.

## Bundled desktop toolchain

- **AVAL compiler 1.0.0 and supporting AVAL packages** — MIT; built from
  `pixel-point/aval` commit `96ec0fceaca31346c36b37aa4b2eadf17e066073`.
- **Node.js 22.12.0** — distributed under the Node.js license and the licenses
  of its bundled third-party components.
- **FFmpeg / FFprobe** — copyright the FFmpeg project contributors. Studio
  requires GPL-enabled builds because the compiler invokes x264 and x265.

The reviewed macOS binaries are provided by
[Martin Riedl's FFmpeg Build Server](https://ffmpeg.martin-riedl.de/). The
reviewed Windows and Linux binaries are provided by
[BtbN FFmpeg Builds](https://github.com/BtbN/FFmpeg-Builds). Their exact binary
archives, builder revisions, corresponding FFmpeg sources, and checksums are
recorded in `toolchain/media-sources.json` and mirrored on the media-toolchain
prerelease.

Each installer contains `toolchain-runtime/toolchain-manifest.json`, the Node
license, the media build's exact license, configure flags, hashes, and source
record. Release preparation rejects `--enable-nonfree`. Distributors remain
responsible for the GPL/source obligations and codec/patent review described in
the packaged media record and [toolchain documentation](docs/toolchain.md).
