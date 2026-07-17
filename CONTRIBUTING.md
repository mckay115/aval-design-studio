# Contributing

Thanks for helping build Aval Design Studio. Open an issue before a large behavior or format change so project migrations and cross-platform implications can be agreed first.

## Development

1. Install Node.js 22.12+, pnpm 10.33+, stable Rust, and the Tauri prerequisites for your OS.
2. Run `pnpm install`.
3. Run `pnpm check` before opening a pull request.
4. For native changes, also run `cargo check --manifest-path src-tauri/Cargo.toml`.

Keep video handling local by default. New filesystem, shell, or network access must be reflected in Tauri's capability allowlist and explained in the pull request. Never make FFmpeg a resident background process; exports must have explicit lifecycle and cancellation behavior.

Tests should cover frame-boundary invariants and project migrations. Visual changes should include a screenshot at the 1440×900 reference window plus a narrow-window check.
