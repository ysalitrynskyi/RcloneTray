# Security Policy

## Supported versions

Only the latest released version of RcloneTray receives fixes. Please make sure
you are on the newest [release](https://github.com/ysalitrynskyi/RcloneTray/releases)
before reporting.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Instead, report privately via one of:

- GitHub's [private vulnerability reporting](https://github.com/ysalitrynskyi/RcloneTray/security/advisories/new)
  (Security tab → "Report a vulnerability"), or
- email **ysalitrynskyi@gmail.com** with the subject line `RcloneTray security`.

Please include:

- a description of the issue and its impact,
- steps to reproduce (proof-of-concept if possible),
- the affected version and your OS.

You can expect an acknowledgement within a reasonable time. Once a fix is
available it will be released and credited (unless you prefer to remain anonymous).

## Scope notes

- Released binaries are **not** code-signed (no Apple Developer ID / Windows EV
  certificate). This is a known, documented trade-off for a free OSS app, not a
  vulnerability.
- The renderer runs sandboxed with context isolation, no Node integration and a
  strict Content-Security-Policy, and dialogs cannot navigate away; the only
  main↔renderer surface is the preload bridge in `src/dialogs-preload.ts`.
- Bundled rclone binaries are verified against rclone's published SHA256SUMS at
  build time.
- The optional update check (Preferences → General) sends one request to the
  GitHub releases API at startup; nothing else leaves your machine except the
  rclone traffic you start.
