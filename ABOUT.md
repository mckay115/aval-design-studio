# About Aval Design Studio

> **Historical design record.** This document describes the initial 0.1.0 prototype and is retained for product history. The current MediaBunny playback, states-first editor, Source Prep, and AVAL compiler bridge are documented in [README.md](README.md) and the files under [docs/](docs/).

> Comprehensive system and implementation record
>
> Product version: **0.1.0**
>
> Repository: `mckay115/aval-design-studio`
>
> Initial system build and verification: July 16, 2026
>
> License: MIT for the studio source; separately licensed media tools are not yet bundled

![Aval Design Studio editor concept](docs/design/aval-design-studio-concept.png)

## Executive summary

Aval Design Studio is an open-source, cross-platform desktop authoring application for turning an ordinary local video into a structured interactive-video project intended to become an AVAL asset.

The core idea is that a video should not be treated only as one linear clip. A creator should be able to mark meaningful frame ranges—rest states, entries, loops, exits, bridges, one-shot actions, and arbitrary events—and describe how those ranges behave. The eventual output is intended to be a compiled `.avl` asset that can respond to product or interface events. The current milestone creates and saves the authoring project but does **not** yet compile the final `.avl` file.

The application currently provides:

- native local video selection;
- local video playback and scrubbing;
- an 18-image thumbnail filmstrip generated in memory;
- frame stepping;
- multiple named and colored frame segments;
- Apple-inspired trim handles for selected regions;
- editable segment roles and event names;
- segment splitting, resizing, selection, and deletion;
- selected-segment playback, including loop behavior;
- versioned `.avalstudio` project saving;
- an Unsaved/Saved document state;
- a Tauri-native shell for macOS, Windows, and Linux;
- a least-privilege Tauri capability configuration;
- GitHub Actions CI and cross-platform release workflows;
- signed in-app update infrastructure using GitHub Releases;
- a deliberately isolated contract for a future compiler/FFmpeg sidecar.

The application does **not** currently start FFmpeg while importing, previewing, scrubbing, or generating thumbnails. No resident background media process is part of the editor.

## The problem this project is solving

Conventional trim controls define one start and one end. That is useful for cutting a clip, but it is insufficient for an interactive motion asset. An interactive asset may need several semantically different parts:

- a frame or short region to hold while idle;
- a transition into an active state;
- a region that loops while an event remains active;
- a transition back out of the active state;
- a non-reversible bridge between states;
- a reversible bridge;
- a one-shot reaction;
- custom regions associated with product-defined events.

Aval Design Studio extends the familiar filmstrip-and-handles editing model to support any number of user-defined regions. The goal is to keep the first interaction understandable to someone who has used a native video trim control while making the underlying model expressive enough for an interactive asset pipeline.

## What “AVAL” means in this repository

AVAL is the project and target-asset name used by the surrounding system. This repository does not currently define an official expansion of the acronym, and this document does not invent one.

Three file/product concepts are distinct:

- **Aval Design Studio** is the desktop authoring application.
- **`.avalstudio`** is the editable, human-readable JSON project document currently produced by the application.
- **`.avl`** is the intended compiled runtime asset. Compilation is not implemented in this milestone.

## Product principles

The project was shaped around the following principles.

### Local first

Imported video remains on the user’s computer. The application does not upload source media. Preview frames are decoded through the operating system webview and thumbnails are generated in memory.

### Explicit work

Expensive media processing must be caused by an explicit user action. A future export may use FFmpeg, but normal editing must never silently transcode media in the background.

### Frame-based authoring

Segment boundaries are stored as integer frames rather than floating-point seconds. Time is used to drive the preview player, but the project model remains frame-oriented and deterministic.

### Semantic regions, not merely cuts

Each segment has a name, role, event, and half-open frame range. The meaning of a region is as important as its position.

### Open-source distribution

The studio source is MIT licensed and intended for a public GitHub repository. Media binaries are treated as separate products with separate licenses and provenance requirements.

### Cross-platform by design

The same React interface and project model are used on macOS, Windows, and Linux. Native filesystem access, packaging, and updates are provided by Tauri.

### Honest milestone boundaries

The interface must not imply that a function works when it does not. The present product is an editor and project saver. Final `.avl` compilation remains a subsequent milestone.

## Why Tauri was chosen instead of Electron

Tauri 2 is the desktop foundation.

The decision was made for several reasons:

- Tauri uses the operating system’s webview instead of shipping a complete Chromium runtime with every installation.
- The native host is written in Rust and can own sensitive filesystem, update, and future process-management boundaries.
- Tauri has maintained plugins for native dialogs, scoped filesystem access, process relaunch, and signed updates.
- Tauri supports external sidecar executables, which fits a future AVAL compiler and FFmpeg/FFprobe toolchain.
- Its capability model makes native permissions explicit and reviewable.
- It can produce native installers and updater artifacts for macOS, Windows, and Linux from GitHub Actions.
- It is a better fit for a focused desktop tool whose main interface can be built with web technology but whose distribution and media-process lifecycle need native control.

The choice has tradeoffs:

- installed webview versions vary by operating system;
- media codec support is not identical on every platform;
- Linux playback depends partly on WebKitGTK and installed GStreamer codecs;
- native development requires Rust and the Tauri platform prerequisites;
- debugging crosses a TypeScript/Rust boundary;
- release-time updater configuration must be kept separate from development configuration.

These tradeoffs were accepted because the smaller runtime, Rust host, native updater, and sidecar model better match the long-term product than a Chromium-plus-Node desktop runtime.

## Current user experience

### Starting state

The app opens into a dark desktop editor with:

- a top application/document bar;
- a central video stage;
- a segment inspector on the right;
- a timeline and filmstrip along the bottom;
- a status bar with media facts, source state, and frame-step controls.

Before a video is selected, the stage presents an empty state and an **Open Video** action. Timeline and transport controls are disabled.

### Importing a video

Supported picker extensions are:

- `.mp4`;
- `.mov`;
- `.m4v`;
- `.webm`.

In a packaged Tauri app, the native dialog plugin selects one local file. The selected path is converted into a scoped Tauri asset URL for the webview. In browser-only development, a temporary hidden file input is used and the browser creates a blob URL.

When a new source is selected:

- existing playback is paused;
- any previous browser blob URL is revoked;
- the old source and segments are cleared;
- the document becomes Unsaved;
- metadata is read from the video element;
- starter segments are generated after valid metadata loads.

If the system webview cannot decode the selected codec, the app displays a visible error recommending MP4/H.264 or WebM.

### Media metadata

The browser video element supplies:

- duration;
- pixel width;
- pixel height.

The video element does not expose the encoded frame rate. The current preview grid therefore uses `30000 / 1001`, approximately 29.97 fps. Total frames are calculated by multiplying duration by that preview rate and rounding to the nearest integer.

This is a known approximation. FFprobe should become authoritative for exact frame rate, stream information, rotation, color metadata, and variable-frame-rate handling when the supervised toolchain is connected.

### Starter segment layout

For a source with at least four frames, the app creates four editable regions:

| Name | Default role | Default event | Initial range rule |
|---|---|---|---|
| Rest | Finite body | `pointer.leave` | Frame 0 only |
| Entry | Locked bridge | `pointer.enter` | From frame 1 to approximately 2/15 of the source |
| Loop | Loop body | `pointer.enter` | From the end of Entry to approximately 11/15 of the source |
| Exit | Locked bridge | `pointer.leave` | Remaining frames to the end |

For a source shorter than four frames, one `Main` loop region covers the available frames.

The starter layout is only a useful default. Users can rename, resize, split, re-role, and delete regions.

### Timeline behavior

The timeline has three aligned layers:

1. semantic segment regions and labels;
2. a thumbnail filmstrip;
3. a frame ruler and playhead.

The selected segment receives a bright yellow outline and two yellow Apple-inspired handles. The handles can be dragged with a pointer or moved one frame at a time with the left and right arrow keys while focused.

The filmstrip can be clicked or dragged to scrub. It is also keyboard accessible:

- Left Arrow: previous frame;
- Right Arrow: next frame;
- Home: first frame;
- End: final frame.

The application-level keyboard controls are:

- Left Arrow: previous frame when focus is not in an editor control;
- Right Arrow: next frame when focus is not in an editor control;
- Space: play or pause the selected segment.

Very small segment labels are visually hidden to avoid collisions, but their controls retain accessible labels and tooltips.

### Segment editing

The inspector edits:

- Name;
- Role;
- Start frame;
- End frame;
- Event.

Available role identifiers are:

- `body-loop` — Loop body;
- `body-finite` — Finite body;
- `bridge-locked` — Locked bridge;
- `bridge-reversible` — Reversible bridge;
- `one-shot` — One shot;
- `event` — Event region.

The inspector displays inclusive human-facing start/end frame fields, while the model stores an inclusive start and exclusive end.

### Segment invariants

The deterministic project model enforces these rules:

- frame values are integers;
- every segment is at least one frame long;
- a start cannot move before the previous segment’s end;
- an end cannot move after the next segment’s start;
- regions therefore cannot overlap through ordinary editing;
- deleting a region may intentionally leave a gap;
- the final remaining segment cannot be deleted;
- temporarily empty numeric inputs produce `NaN`, which is ignored instead of corrupting the model;
- segment arrays are sorted by start frame before boundary operations.

### Splitting

The **+ Segment** action splits the selected segment at the playhead.

A split is allowed only when the playhead is strictly inside the selected half-open range. If the playhead is on or outside its boundary, the app displays an explanatory toast and does not change the project.

The left result preserves the original segment’s properties. The right result receives:

- a new stable ordinal ID;
- a generated name such as `Segment 5`;
- the `event` role;
- the `custom.event` event value;
- the next color from the visual palette.

### Playback

Playback is scoped to the selected segment.

- If the playhead is outside the selected region, playback begins at the segment start.
- A `body-loop` segment seeks back to its start at its exclusive end.
- Other roles pause on their final included frame.
- Playback errors produce a visible toast.

Playback remains a preview behavior. The roles do not yet drive a complete interactive state graph.

### Thumbnails

The app generates 18 thumbnails without FFmpeg:

1. it creates an offscreen HTML video element;
2. it seeks to evenly spaced points across the duration;
3. it draws each decoded frame into a 180-pixel-wide Canvas;
4. it stores each result as an in-memory JPEG data URL at quality `0.68`;
5. it cancels work and releases the video source when the selected source changes.

Each metadata or seek wait has an eight-second timeout. A decode failure clears the thumbnail set without crashing the editor.

Thumbnails are not written to disk and are not retained between sessions.

### Saving

The current primary output is a project document named:

```text
<sanitized-video-name>.avalstudio
```

In Tauri, a native save dialog chooses the destination and the scoped filesystem plugin writes the text. In browser development, the app creates a JSON blob and triggers a download.

The header changes from **Unsaved** to **Saved** only after a save completes. Editing segment metadata or boundaries changes it back to Unsaved.

The application currently saves projects but does not yet reopen them. Source relinking and project migration UI are future work.

## Visual design

The interface was designed from a generated full-editor concept informed by the supplied Apple trim-control reference.

The Apple reference contributed these interaction ideas:

- a visible filmstrip rather than an abstract time bar;
- a strong play transport adjacent to the strip;
- bright yellow selection chrome;
- tactile start and end handles;
- dark translucent surrounding surfaces.

Aval Design Studio extends that language from one trim range to multiple semantic regions. It does not copy the one-range limitation or Apple’s exact component.

The visual system uses:

- a charcoal/near-black desktop shell;
- warm amber as the primary action and selected-region color;
- coral, teal, yellow, violet, blue, and rose segment colors;
- restrained panel borders and depth;
- rounded controls and panels;
- high-contrast white play icons;
- native-system-oriented typography;
- responsive compression for narrower browser views.

The reference Tauri window is 1440 × 900 with a minimum native size of 980 × 680. A browser-only breakpoint below 760 pixels stacks the editor, makes the page scrollable, and places the wide timeline in its own horizontal scroll container.

The application icon was generated specifically for this project. It combines a play triangle, film frames, and a looping motion path in the same charcoal-and-amber language. The master is stored at `docs/design/aval-icon-master.png`; Tauri-generated platform icons are under `src-tauri/icons/`.

## System architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│                         User's computer                          │
│                                                                  │
│  Native file dialog                                              │
│          │                                                       │
│          ▼                                                       │
│  Scoped local path ──► Tauri asset URL / browser blob URL        │
│          │                                                       │
│          ├────────► HTML video preview                           │
│          │                 │                                     │
│          │                 ├────────► Canvas thumbnail sampler   │
│          │                 └────────► frame/time synchronization │
│          │                                                       │
│          ▼                                                       │
│  React editor state ──► deterministic project model              │
│          │                       │                               │
│          │                       └────► segment invariants        │
│          ▼                                                       │
│  Native save dialog ──► .avalstudio                              │
│                                                                  │
│  Future explicit Export action only                              │
│          │                                                       │
│          ▼                                                       │
│  supervised compiler sidecar + FFmpeg/FFprobe ──► .avl           │
└──────────────────────────────────────────────────────────────────┘

GitHub Actions ──► native bundles + signed update artifacts
GitHub Releases ──► installers, signatures, latest.json
Installed app ───► signature-verified update check and relaunch
```

### Frontend layer

The frontend is React 19 with strict TypeScript and Vite.

Primary responsibilities:

- render the editor and all interaction states;
- own transient document and playback state;
- translate frame positions into video seek times;
- invoke the narrow desktop abstraction instead of importing native APIs throughout the component tree;
- save a versioned, serializable project representation;
- expose updater progress when the native build enables updates.

Important files:

| Path | Responsibility |
|---|---|
| `src/App.tsx` | Main state machine and orchestration |
| `src/model/project.ts` | Project types, segment rules, splitting, deletion, serialization |
| `src/lib/desktop.ts` | Browser/Tauri file selection, native build info, project saving |
| `src/hooks/useVideoThumbnails.ts` | In-memory video thumbnail sampling |
| `src/hooks/useUpdater.ts` | Signed update check, progress, installation, and relaunch |
| `src/components/VideoStage.tsx` | Empty state, video element, stage playback control |
| `src/components/Timeline.tsx` | Segments, filmstrip, handles, playhead, ruler, scrubbing |
| `src/components/Inspector.tsx` | Segment property editing |
| `src/components/TopBar.tsx` | Product identity, file/save state, primary actions |
| `src/components/StatusBar.tsx` | Source facts, update state, frame stepping |
| `src/styles.css` | Complete visual system and responsive behavior |

### Native layer

The native host is a small Rust/Tauri application.

It initializes:

- the native dialog plugin;
- the scoped filesystem plugin;
- the process plugin for updater relaunch;
- the updater plugin only when a real non-null updater configuration exists.

The `build_info` command exposes:

- application version;
- repository URL;
- whether a media toolchain was packaged;
- whether updater commands are enabled for this build.

Development builds intentionally omit updater configuration. The updater plugin is therefore not registered and the React updater hook remains idle. Release builds merge a generated signed configuration, register the plugin, check for updates, install a verified artifact, and relaunch through the process plugin.

This conditional registration was added after a development-startup failure revealed that Tauri’s updater plugin attempts to deserialize `plugins.updater` even when the value is absent and represented as `null`. Both the no-updater development path and updater-enabled release path were subsequently compiled and launched successfully.

### Desktop abstraction

`src/lib/desktop.ts` is the intended boundary between React and native APIs.

That boundary exists so:

- most UI code remains testable without Tauri;
- browser-only development still works;
- native access is easier to audit;
- filesystem and process behaviors are not scattered through components;
- future project-open and render-job functions have one clear integration layer.

### Project model layer

`src/model/project.ts` has no Tauri dependency and no required DOM dependency. It owns deterministic data and mutations so frame-boundary behavior can be unit tested independently from the UI.

## Project document format

The current format version is `1`.

Example:

```json
{
  "projectVersion": 1,
  "name": "runner",
  "source": {
    "name": "runner.mp4",
    "path": "/Users/example/Videos/runner.mp4",
    "durationSeconds": 8.008,
    "width": 1920,
    "height": 1080,
    "frameRate": 29.97002997002997,
    "totalFrames": 240
  },
  "segments": [
    {
      "id": "segment-1",
      "name": "Entry",
      "role": "bridge-locked",
      "event": "pointer.enter",
      "startFrame": 0,
      "endFrame": 36
    }
  ]
}
```

Ranges are half-open: `[startFrame, endFrame)`. The example includes frames 0 through 35.

The serialized project excludes:

- temporary browser blob URLs;
- Tauri asset URLs;
- URL-revocation callbacks;
- visual-only segment colors.

It retains the local source path in native builds. That is useful for reopening and relinking but may reveal a local username or directory structure when a project file is shared. Users should inspect or redact the path before publishing project JSON until a portable-path policy is implemented.

Future incompatible changes must increment `projectVersion` and add explicit migrations. Unknown compatible fields should be preserved when a load/save pipeline is introduced.

## Security and privacy model

### Local media

Source video remains local. There is no media upload service, telemetry service, account system, database, or cloud project store in the current application.

### Native capability allowlist

The main Tauri window receives only these explicit capability groups:

- `core:default`;
- native dialog open;
- native dialog save;
- text-file writing;
- process restart;
- updater operations.

There is no general shell permission in the current app.

### File access

The base asset-protocol scope is empty. Paths chosen through native dialogs are dynamically authorized for the running application session. Project writing is limited to a path selected through the save dialog.

### Content Security Policy

The configured CSP limits content to the application, Tauri IPC/asset protocols, local blob/data images and media, inline application styles, and GitHub endpoints required by the release/update design.

The policy currently permits:

- self-hosted application resources;
- Tauri IPC;
- scoped Tauri asset URLs;
- browser blob/data images and media;
- GitHub and GitHub object-host connections.

### Updates

Update artifacts must be signed. The installed application contains only the updater public key. The signing private key is supplied to GitHub Actions from repository secrets and must never be committed.

An update signature proves artifact integrity and publisher continuity. It does not replace operating-system code signing or notarization.

### Secrets

Required release secrets include:

- `TAURI_SIGNING_PRIVATE_KEY`;
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`;
- `TAURI_UPDATER_PUBLIC_KEY`.

Optional/production platform-signing secrets include Apple certificate, identity, Apple ID/app-specific password, and team information. Windows signing still needs an appropriate certificate/provider strategy.

## FFmpeg and background-process policy

### Current behavior

The current application does not execute FFmpeg or FFprobe.

Video preview uses the system webview’s video decoder. Thumbnail extraction uses the same decoder and Canvas. Saving writes JSON only.

The repository contains the words `ffmpeg` and `ffprobe` in packaging scripts and documentation because those tools are planned release products, not because the editor launches them today.

### Why process lifecycle is a first-class constraint

The project was initiated in the context of concern about an FFmpeg process consuming substantial CPU in the background. The design therefore treats media-process ownership as an architectural requirement rather than an implementation detail.

A future render implementation must:

1. start only after an explicit Export action;
2. use one supervised child-process tree for each export job;
3. surface progress and a bounded log in the UI;
4. support explicit cancellation;
5. terminate the entire child tree on cancellation;
6. terminate active jobs when the app exits;
7. avoid FFmpeg for idle editing, preview, thumbnail generation, and update checks;
8. never leave a detached/orphaned encoder process;
9. write to a temporary output and atomically finalize a successful result;
10. report tool version and command provenance for supportability.

No implementation should weaken these constraints merely to make the first export demo easier.

## Compiler-sidecar contract

The `sidecar/` workspace contains a reference JSON-lines protocol host. It is not the AVAL compiler.

The protocol version is `1`. Each request contains an `id` and `command`; each response repeats the `id`, reports `ok`, and contains either `result` or a structured `error`.

Implemented reference commands:

- `health` — reports protocol version and available features;
- `validateProject` — verifies the basic version and half-open segment invariants.

Reserved but intentionally unsupported:

- `compile` — will eventually invoke the reviewed compiler/render pipeline.

The reference host returns an explicit `unsupported_command` error rather than pretending to render.

When compilation is implemented:

- machine-readable protocol traffic should remain on standard output;
- human diagnostic logs should go to standard error;
- progress messages need a stable schema;
- cancellation needs a defined request and process behavior;
- source and output paths must be validated by the native host;
- arbitrary user-controlled command fragments must never be passed to a shell.

## Media-toolchain packaging

Tauri external binaries use target-suffixed names. A complete toolchain build is expected to contain:

```text
src-tauri/binaries/
  aval-node-<rust-target>[.exe]
  ffmpeg-<rust-target>[.exe]
  ffprobe-<rust-target>[.exe]
src-tauri/toolchain-runtime/
  node_modules/@pixel-point/aval-*/
  licenses/
  toolchain-manifest.json
```

`scripts/prepare-sidecars.mjs` packages a target-native private Node runtime, the compiler built from the pinned upstream AVAL commit, and reviewed media tools. It executes and hashes each product, validates provenance, rejects `--enable-nonfree`, and fails if any required encoder is missing.

Supported target names in the current release matrix are:

- `aarch64-apple-darwin`;
- `x86_64-apple-darwin`;
- `x86_64-unknown-linux-gnu`;
- `x86_64-pc-windows-msvc`.

The release job always downloads the media archive from the immutable prerelease pinned in `toolchain/versions.json`:

```text
aval-media-toolchain-<rust-target>.tar.gz
aval-media-toolchain-<rust-target>.tar.gz.sha256
```

Each archive extracts FFmpeg, FFprobe, `LICENSE`, and `SOURCE.json` at its root. The compiler and Node runtime come from pinned sources in release CI.

Toolchain-only releases should be GitHub prereleases or live in a separate repository. Otherwise a toolchain release could replace the desktop application at GitHub’s `/releases/latest` endpoint and temporarily break update discovery.

Release packaging is fail-closed. A missing compiler runtime, media executable,
license, source record, checksum, encoder, or manifest stops the build; release CI
cannot silently publish an editor-only desktop installer.

## FFmpeg licensing and provenance

FFmpeg and FFprobe are not covered by this repository’s MIT license.

An FFmpeg binary can be under LGPL terms or GPL terms depending on how it was configured. Enabling libraries such as x264 changes the relevant obligations, and codec patent considerations may vary by distribution region.

Every distributed media toolchain must record:

- exact upstream version;
- exact source revision or source archive URL;
- complete configure/build flags;
- build environment or reproducible recipe;
- SHA-256 checksum for every artifact;
- license texts and notices;
- source offer or corresponding source where required;
- AVAL compiler revision and license;
- dependency notices;
- codec/patent review appropriate to the intended distribution.

`THIRD_PARTY_NOTICES.md` intentionally contains placeholders for these exact values. A release is not ready while those placeholders remain incomplete.

## Cross-platform behavior

### macOS

- Uses WKWebView through Tauri/Wry.
- Minimum configured system version is macOS 11.0.
- Release matrix includes Apple Silicon and Intel targets.
- Public distribution should use Developer ID signing and notarization.

### Windows

- Uses Microsoft WebView2.
- Release matrix includes x64 MSVC.
- The updater uses passive installer mode.
- Public distribution should use Windows code signing.

### Linux

- Uses WebKitGTK.
- CI/release runner is Ubuntu 22.04 x64.
- Build prerequisites include WebKitGTK 4.1 development files, AppIndicator, librsvg, and patchelf.
- Runtime H.264/MP4 support may depend on distribution-installed GStreamer codec packages.
- WebM is accepted as a more portable alternative, though actual support still depends on the system media stack.

### Webview implications

The application UI is shared, but decoding performance, codec support, select/input rendering, and some CSS details may vary. Cross-platform QA must use native packaged builds, not only desktop Chrome.

## Development toolchain

### Pinned JavaScript toolchain

| Package | Version |
|---|---:|
| Node.js minimum | 22.12.0 |
| pnpm | 10.33.0 |
| React / React DOM | 19.2.7 |
| TypeScript | 7.0.2 |
| Vite | 8.1.5 |
| Vitest | 4.1.10 |
| Tauri JavaScript API | 2.11.1 |
| Tauri CLI | 2.11.4 |
| Tauri dialog plugin | 2.7.1 |
| Tauri filesystem plugin | 2.5.1 |
| Tauri process plugin | 2.3.1 |
| Tauri updater plugin | 2.10.1 |

The Rust channel is `stable` with the minimal rustup profile. During initial local verification, Rust 1.94.0 was installed. Cargo’s lockfile resolves the Rust Tauri crate to the compatible 2.11.x line used during verification.

### Prerequisites

- Node.js 22.12 or newer;
- pnpm 10.33;
- stable Rust and Cargo;
- Tauri’s platform prerequisites;
- Xcode command-line tools on macOS;
- WebView2 tooling/runtime as applicable on Windows;
- WebKitGTK development dependencies on Linux.

### First run

```sh
git clone https://github.com/mckay115/aval-design-studio.git
cd aval-design-studio
pnpm install
pnpm check
pnpm tauri:dev
```

The stable native development entrypoint is `pnpm tauri:dev`. It starts Vite on `127.0.0.1:1420`, watches `src-tauri`, builds the Rust host, and launches the desktop app.

For frontend-only work:

```sh
pnpm dev
```

### Package scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Start Vite at `127.0.0.1:1420` |
| `pnpm build` | Strict TypeScript project build followed by production Vite build |
| `pnpm preview` | Preview the production frontend |
| `pnpm test` | Run Vitest model tests and Node sidecar tests |
| `pnpm test:watch` | Run Vitest interactively |
| `pnpm check` | Verify version sync, tests, TypeScript, and production frontend build |
| `pnpm tauri:dev` | Start the complete native development app |
| `pnpm tauri:build` | Build through Tauri |
| `pnpm release:config` | Generate the ignored signed release overlay |
| `pnpm toolchain:prepare -- <target>` | Prepare target-suffixed executables and compiler resources |
| `pnpm toolchain:verify -- <target>` | Execute and hash-check the complete staged toolchain |

## Repository structure

```text
aval-design-studio/
├── .github/
│   ├── dependabot.yml
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── docs/
│   ├── architecture.md
│   ├── project-format.md
│   ├── releases.md
│   ├── toolchain.md
│   └── design/
│       ├── aval-design-studio-concept.png
│       └── aval-icon-master.png
├── public/
│   └── favicon.png
├── scripts/
│   ├── check-versions.mjs
│   ├── prepare-sidecars.mjs
│   └── write-release-config.mjs
├── sidecar/
│   ├── src/
│   └── test/
├── src/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── model/
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css
├── src-tauri/
│   ├── binaries/
│   ├── capabilities/
│   ├── icons/
│   ├── src/
│   ├── Cargo.toml
│   └── tauri.conf.json
├── ABOUT.md
├── README.md
├── LICENSE
├── THIRD_PARTY_NOTICES.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── package.json
├── pnpm-lock.yaml
└── rust-toolchain.toml
```

Generated and local-only paths are ignored:

- `node_modules/`;
- `dist/`;
- `src-tauri/target/`;
- `.toolchain/`;
- `.aval-cache/`;
- generated `.avl` and build-manifest files;
- prepared target sidecar binaries;
- the generated `src-tauri/tauri.release.conf.json` overlay;
- `.env` files and logs.

## Version management

The application version must match in:

- `package.json`;
- `src-tauri/tauri.conf.json`;
- `src-tauri/Cargo.toml`.

`scripts/check-versions.mjs` verifies equality and is part of `pnpm check`. A release should not proceed when those versions diverge.

## Continuous integration

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`.

It:

1. checks out the repository;
2. installs pnpm 10.33.0;
3. installs Node.js 22.12.0 with pnpm caching;
4. installs stable Rust;
5. installs Tauri’s Ubuntu prerequisites;
6. installs dependencies from the frozen lockfile;
7. runs `pnpm check`;
8. runs locked Cargo checking for the native shell.

CI has read-only repository contents permission. Concurrent runs on the same Git ref cancel older runs.

## Release and updater pipeline

`.github/workflows/release.yml` is currently started manually with `workflow_dispatch`.

The matrix builds:

- macOS Apple Silicon;
- macOS Intel;
- Linux x64;
- Windows x64.

The workflow:

1. installs pinned Node/pnpm and stable Rust;
2. installs target-specific native prerequisites;
3. installs the frozen JavaScript workspace;
4. optionally downloads a reviewed media-toolchain prerelease;
5. prepares target-suffixed sidecars when enabled;
6. generates `src-tauri/tauri.release.conf.json` from the repository identity and updater public key;
7. enables Tauri updater artifacts;
8. builds native bundles through `tauri-apps/tauri-action`;
9. creates or updates a draft `app-v<version>` GitHub Release;
10. uploads installers, updater signatures, and `latest.json`;
11. leaves the release as a draft for inspection before publication.

The installed app checks:

```text
https://github.com/<owner>/<repository>/releases/latest/download/latest.json
```

The repository portion is generated from GitHub’s `GITHUB_REPOSITORY`, so a fork can publish updates from its own release feed after configuring its own signing keys.

The app waits approximately 2.5 seconds after startup before checking. If an update exists, the status bar can offer installation. Download progress is tracked when the server supplies content length. After verified installation, the process plugin relaunches the app.

### Development versus release updates

The base Tauri config deliberately has no updater endpoint or public key and sets `createUpdaterArtifacts` to false.

The ignored release overlay supplies:

- `createUpdaterArtifacts: true`;
- bundled license/notice resources;
- optional external binaries;
- the GitHub `latest.json` endpoint;
- the updater public key;
- passive Windows installation mode.

The Rust host inspects the merged config. It registers the updater only when `plugins.updater` is present and non-null, and reports that state to React. This prevents development startup from attempting to initialize an unconfigured updater while retaining signed production updates.

## Testing and verification completed during the initial build

### Automated model tests

Six Vitest tests cover:

- the canonical 450-frame Rest/Entry/Loop/Exit layout;
- neighbor-constrained resizing;
- rejection of non-finite numeric edits;
- splitting at a playhead;
- protection of the final remaining segment;
- serialization without transient URLs or visual colors.

### Sidecar tests

Two Node tests cover:

- protocol health and advertised capabilities;
- half-open project-frame validation.

### Build verification

The following completed successfully during initial development:

- synchronized version check;
- all eight tests;
- strict TypeScript build;
- production Vite build;
- `cargo fmt --check`;
- locked `cargo check`;
- native Tauri debug build;
- Tauri build with a generated signed updater overlay;
- launch of a development build with no updater configuration;
- launch of an updater-enabled build with a throwaway test signing key;
- clean switch back from release-overlay compilation to development compilation.

### Rendered interaction QA

A finite four-second synthetic 1280 × 720 MP4 was created in `/tmp` for local QA. FFmpeg was limited to two threads, ran in the foreground, and exited before UI testing.

The editor was then exercised in headless Chrome because the in-app browser runtime had no available backend in that session. Verified behavior included:

- correct page title and meaningful initial content;
- no Vite/framework error overlay;
- no console warnings, console errors, or page errors;
- local file import;
- 120-frame metadata at the current 29.97-fps preview rate;
- generation of all 18 thumbnails;
- four starter segments;
- rejection of a split outside the selected region;
- successful split from four to five regions inside the selected range;
- inspector rename to `Impact`;
- event change to `pointer.down`;
- one-frame keyboard handle resize;
- frame stepping;
- play and pause state changes;
- Unsaved before persistence and Saved after persistence;
- `.avalstudio` download with the edited segment present;
- no horizontal page overflow at 1440 × 900 and 820 × 900.

### Native startup incident and resolution

An early `pnpm tauri:dev` launch panicked with:

```text
failed to initialize plugin `updater`:
Error deserializing 'plugins.updater' ... invalid type: null
```

Cause: the updater plugin was registered in all desktop builds even though only release builds had updater configuration.

Resolution:

- detect a non-null `plugins.updater` configuration in the Rust host;
- register the plugin only when configured;
- expose `updatesEnabled` through `build_info`;
- keep the React updater hook idle when disabled.

The exact `pnpm tauri:dev` command was then launched past both native setup and the delayed update-check interval without a panic. A signed-overlay build was separately launched to confirm that production registration still occurs.

## Current limitations

Version 0.1.0 is an authoring MVP. Known limitations are intentional and should remain visible:

- no `.avl` compilation;
- no connected production AVAL compiler;
- no FFmpeg or FFprobe execution from the app;
- no render progress, cancellation, queue, or log UI;
- no project-open flow;
- no missing-source relink flow;
- no project migration UI;
- no undo/redo history;
- no autosave or crash recovery;
- no waveform or audio controls;
- no exact source frame-rate probing;
- no explicit variable-frame-rate normalization policy;
- no source rotation/color-space inspection;
- no persistent thumbnail cache;
- no transition/state graph editor;
- semantic roles affect selected-region playback only, not a complete runtime simulation;
- segment gaps are allowed but have no dedicated visualization beyond the empty region;
- the saved project contains an absolute native source path;
- system codec support varies, especially on Linux;
- platform signing/notarization secrets are not part of source control and still need repository setup;
- CI and cross-platform releases cannot run until the local repo is connected to GitHub;
- no committed end-to-end browser suite currently reproduces the manual rendered QA;
- the updater error state is tracked but has minimal end-user explanation;
- a toolchain-enabled build would currently show an inaccurate Export label and must not be published.

At the time of the initial build, the local Git repository had no configured remote. Creating the public GitHub repository, adding `origin`, committing the scaffold, pushing `main`, and configuring Actions secrets are external publication steps rather than completed local implementation steps.

## Recommended roadmap

### Milestone 1 — Editor foundation

Status: substantially complete.

- local video import;
- preview and thumbnails;
- semantic multi-segment timeline;
- frame editing and playback;
- project JSON saving;
- Tauri shell;
- CI/release/updater foundation.

### Milestone 2 — Durable projects and exact source facts

- open `.avalstudio` files;
- validate and migrate project versions;
- resolve relative/portable source references;
- prompt to relink missing media;
- add FFprobe as an explicit metadata job;
- record exact stream frame rate and time base;
- define variable-frame-rate behavior;
- add autosave/recovery and undo/redo.

### Milestone 3 — Compiler integration

- finalize the versioned sidecar protocol;
- connect the real open-source AVAL compiler;
- implement a native render-job supervisor;
- add progress and bounded logs;
- implement cancellation and process-tree cleanup;
- use temporary outputs and atomic completion;
- emit deterministic build manifests;
- keep idle editing FFmpeg-free;
- change Export capability reporting so the label cannot precede the implementation.

### Milestone 4 — Interactive behavior authoring

- state/transition graph;
- event catalog and validation;
- bridge direction/reversibility preview;
- runtime event simulator;
- conflict and unreachable-state diagnostics;
- richer one-shot and loop semantics.

### Milestone 5 — Release hardening

- reproducible compiler and FFmpeg builds for every target;
- complete third-party notices and source offers;
- Apple signing and notarization;
- Windows code signing;
- native smoke tests on all release artifacts;
- updater migration/rollback policy;
- checksums and software-bill-of-materials publication;
- public security-reporting process verification.

### Milestone 6 — Public project maturity

- public roadmap and issue templates;
- contributor development fixtures;
- committed end-to-end tests;
- format specification and compatibility policy;
- sample projects and example assets;
- documented brand/trademark policy;
- release cadence and support policy.

## Non-goals for the current milestone

The initial version is not intended to be:

- a general nonlinear video editor;
- a cloud video service;
- a collaborative multi-user editor;
- a full audio workstation;
- a resident transcoding daemon;
- a replacement for FFmpeg;
- a complete AVAL runtime simulator;
- proof that every codec works on every operating system;
- a claim that media-binary licensing has already been cleared.

## Operational guardrails for future contributors

Changes should preserve these rules:

- do not upload source media by default;
- do not broaden native permissions without a documented need;
- do not add a general shell escape when a typed Rust command can own the operation;
- do not run FFmpeg for idle editing or thumbnails;
- do not detach export processes;
- do not commit signing keys, prepared sidecar executables, or generated release config;
- do not publish a toolchain without exact provenance and license review;
- do not silently change the project format;
- do not use floating-point seconds as the canonical segment boundary representation;
- do not let segments overlap through ordinary editor operations;
- do not claim `.avl` output until the saved file is actually compiled and verified;
- keep development startup independent of production updater secrets;
- keep the frontend/native boundary narrow and auditable;
- test browser development and updater-enabled packaged configurations after native lifecycle changes.

## How the initial system was built

The initial build followed this sequence:

1. establish the product boundary around local video import and semantic segmentation;
2. choose Tauri 2 over Electron for the native host, updater, capability model, and future sidecars;
3. generate a full desktop-editor concept informed by the supplied Apple trim screenshot;
4. build a strict React/TypeScript/Vite frontend rather than relying on a large component framework;
5. implement the deterministic frame/segment model and tests first;
6. implement browser and Tauri file-selection/save adapters;
7. implement local preview and Canvas thumbnails without FFmpeg;
8. implement the multi-region timeline, handles, ruler, inspector, transport, and responsive styling;
9. add the Rust host and least-privilege Tauri plugins/capabilities;
10. define a truthful reference sidecar protocol without pretending the compiler exists;
11. add open-source, security, licensing, architecture, and release documentation;
12. add GitHub Actions for CI and draft cross-platform releases;
13. generate updater configuration at release time so secrets and repository identity are not hard-coded into development;
14. create and preserve project-specific concept and icon assets;
15. run unit, build, native, signed-overlay, and rendered-interaction checks;
16. fix issues discovered by real verification, including TypeScript 7 strictness, required Tauri icons, direct `serde_json` use for merged config, favicon 404s, narrow label collisions, save-state accuracy, split guards, far-right frame boundaries, and updater development startup;
17. verify that the test FFmpeg process exited and that the application itself starts no FFmpeg process.

The guiding implementation style was to build the smallest honest end-to-end authoring slice, put risky future behavior behind explicit boundaries, and leave enough release infrastructure that the public project can grow without replacing its foundation.

## Source of truth

This file is a comprehensive narrative snapshot, but executable behavior is ultimately defined by source and lockfiles.

When this document and code disagree, inspect in this order:

1. `src/model/project.ts` for project invariants;
2. `src/App.tsx` and components for editor behavior;
3. `src/lib/desktop.ts` for browser/native boundaries;
4. `src-tauri/src/lib.rs`, capabilities, and `tauri.conf.json` for native behavior;
5. release scripts and GitHub workflows for distribution behavior;
6. lockfiles for exact resolved dependencies;
7. tests for intended protected behavior.

Update `ABOUT.md` whenever a milestone changes one of the major truths above—especially `.avl` compilation, FFmpeg lifecycle, project format, updater trust, native permissions, supported platforms, or licensing provenance.
