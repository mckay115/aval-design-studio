# Security policy

Please report vulnerabilities privately through GitHub's **Security advisories → Report a vulnerability** flow for this repository. Do not open a public issue for a vulnerability that could expose local files, bypass update signatures, execute an untrusted sidecar, or escape the Tauri capability scope.

Only the latest released version receives security fixes during the pre-1.0 phase. Release artifacts are trusted through both operating-system signing (when configured) and Tauri updater signatures. Never install an update whose signature verification fails.
