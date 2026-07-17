## What changed

<!-- Describe the focused change. -->

## Why

<!-- Explain the author or developer problem this solves. -->

## Validation

- [ ] `pnpm check`
- [ ] `cargo check --locked --manifest-path src-tauri/Cargo.toml` for native changes
- [ ] 1440×900 and narrow-window visual checks for UI changes

## Safety and compatibility

- [ ] Project-format changes include migration coverage.
- [ ] New filesystem, process, or network access is reflected in Tauri capabilities.
- [ ] Media/toolchain changes document licensing and provenance impact.
- [ ] No private source media, credentials, signing keys, or local paths are included.
