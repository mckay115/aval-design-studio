# Architecture

```text
local file
   │
   ▼
MediaBunny probe ──► Source Prep plan ──► canonical local source
   │                                             │
   ▼                                             ▼
CanvasSink preview ──► states/units/routes ──► strict motion.json
                                                 │
                                                 ▼
                                    official AVAL compiler
                                                 │
                                                 ▼
                         av1/vp9/h265/h264 .avl + build.json
```

## Boundaries

- The React project model is deterministic and DOM-independent. It stores rational timing and half-open frame ranges.
- MediaBunny objects are lazy-loaded and held only inside `useMediaSession`. Every source replacement disposes the old input, invalidates pending work, and bounds preview canvases with a two-item pool.
- Playback is presentation-timestamp-driven. Rapid seek, mode switch, import, or pause increments a generation token so stale async frames cannot publish.
- Browser mode uses `BlobSource`; Tauri uses the scoped asset URL. Unsupported browser codecs are presented as Source Prep requirements instead of falling back to a racy HTML video element.
- The Rust host owns packaged executable discovery and the compiler invocation. The webview receives no general shell permission.
- Compilation stages sources beneath an isolated cache workspace, writes strict `motion.json`, invokes the reviewed compiler, and cleans the workspace afterward.

## Source preparation

MOV/MP4/M4V inputs are staged without modification. Other FFmpeg-decodable sources are normalized to an edit-friendly MOV before compilation, with a rational CFR, square pixels, the first video track only, and audio/subtitle/data removal. Opaque builds use ProRes 422 HQ; alpha-capable builds use ProRes 4444.

MediaBunny is the preferred lossless probe/remux layer. The packaged FFmpeg fallback remains necessary for codecs and containers unavailable to the active webview or MediaBunny's WebCodecs environment.

## Reliability

Updater initialization remains conditional on a non-null updater configuration, preventing the macOS `did_finish_launching` unwind/abort observed in development builds. Full builds are gated by compiler/FFmpeg/FFprobe discovery, and the selected output set is gated by its corresponding encoders.
