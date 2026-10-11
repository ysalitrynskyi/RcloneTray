# AI / Maintainer Handoff

Quick reference for whoever (human or agent) works on RcloneTray next.

## Stack

- **Electron 44** + **TypeScript 5** (strict), compiled with `tsc` to `dist/`.
- **electron-builder 26** for packaging (output → `release/`).
- Tests: **vitest** (unit/integration) + **Playwright** (`_electron`) for E2E.
- Bundled **rclone** downloaded and SHA256-verified by `scripts/fetch-rclone.js` (run from `postinstall`) into `rclone/` (gitignored).

## Source map

| File | Responsibility |
|------|----------------|
| `src/main.ts` | Electron main process, all `ipcMain` handlers, app lifecycle |
| `src/tray.ts` | System tray icon + dynamic menu (per-bookmark actions) |
| `src/rclone.ts` | rclone orchestration, bookmark CRUD, mount/sync/serve, quit |
| `src/rclone/command.ts` | command formatting, `--auto-confirm` policy, terminal-safe quoting |
| `src/rclone/config-repository.ts` | config backup and symlink-safe write |
| `src/rclone/config-text.ts` | byte-preserving edits of one `rclone.conf` section |
| `src/rclone/config-mutations.ts` | create/update/delete of one remote on top of `config-text` |
| `src/rclone/config-lock.ts` | serialises config changes |
| `src/rclone/obscure.ts` | password obscuring through rclone's stdin |
| `src/rclone/provider-fields.ts` | provider field types, Hide bitmask, values to write |
| `src/rclone/remote-name.ts` | rclone remote-name rules |
| `src/rclone/custom-args.ts` | splitting and filtering of user-supplied rclone flags |
| `src/rclone/mountpoint.ts` | where a remote is mounted on each OS |
| `src/rclone/path-safety.ts` | local sync path guards (root/drive protection) |
| `src/rclone/dry-run.ts` | counting files in Upload/Download previews |
| `src/rclone/auto-upload.ts` | automatic upload delay and ignored files |
| `src/rclone/log-lines.ts` | rclone JSON log parsing, progress, secret redaction |
| `src/rclone/job-state.ts` | central job/activity state and log tails |
| `src/rclone/external-links.ts` | external URL protocol allow-list |
| `src/ipc/validation.ts` | runtime validation for IPC inputs |
| `src/settings/repository.ts` | atomic settings writes |
| `src/settings.ts` | Persistent settings (`settings.json` in userData), defaults, coercion |
| `src/dialogs.ts` | BrowserWindow factory for dialogs, app menu, error/confirm dialogs |
| `src/dialogs-preload.ts` | `contextBridge` API exposed to renderer (the only renderer↔main surface) |
| `src/dialog-guard.ts` | asks before a dialog with unsaved edits closes |
| `src/version.ts` | version comparison for the update check |
| `src/types.ts` | Shared types |
| `src/ui/` | HTML dialogs, shared CSS (`ui.css`, `about.css`), icons |

## Security model

All dialog windows use `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`, `webviewTag: false`. The renderer only talks to main through the
preload bridge. External links go through an allow-list before `shell.openExternal`.
Keep it that way. Destructive sync operations must keep dry-run confirmation and
root/drive path guards.

`rclone.conf` is not rewritten as a whole. Create, update and delete change only
the named section (`src/rclone/config-text.ts`). Passwords are obscured with
`rclone obscure` through stdin. An encrypted config (`RCLONE_ENCRYPT_V0:`) is
read-only. Every rclone child is started with `--ask-password=false`. Serving
credentials reach rclone through `RCLONE_USER`/`RCLONE_PASS`, never the command line.

## Commands

```bash
npm install            # downloads the current-platform rclone via postinstall (checksum-checked)
npm run typecheck      # tsc --noEmit  (must be zero errors)
npm run lint           # eslint src    (hard gate, zero errors)
npm run test           # vitest unit + integration
npm run test:coverage  # + coverage report
npm run build          # tsc -> dist/
npm run test:e2e       # Playwright; needs build first; uses stub rclone
npm run dist           # electron-builder for current platform -> release/
```

### rclone binaries

`node scripts/fetch-rclone.js [--platform darwin|win32|linux] [--arch all|amd64,arm64]`
— defaults to the host platform/arch. The version comes from `package.json`
`rcloneVersion` (override with `RCLONE_VERSION`); every zip is checked against
rclone's SHA256SUMS. CI and release use it per platform; `scripts/stage-rclone.js`
(electron-builder `beforePack`) copies only the target arch into the installer. Runtime path resolution maps
Node's `process.arch` (`x64`/`ia32`) to rclone names (`amd64`/`386`) — see
`RcloneArchMap` in `src/rclone.ts`. **If you add an arch, update that map.**

## Test isolation env vars

The app honors these (used by E2E and power users):

- `RCLONETRAY_TEST=1` — disables dev-only inspector/electron-reload.
- `RCLONETRAY_RCLONE_PATH` — absolute path to an rclone binary (or stub). Tests
  that need a real rclone skip when it is unset, so CI without a binary still passes.
- `RCLONETRAY_CONFIG_FILE` / `RCLONETRAY_CONFIG_DIR` — rclone config location.
- `RCLONETRAY_SETTINGS_DIR` — directory for `settings.json`.

E2E uses `tests/e2e/fixtures/rclone-stub.sh` (POSIX shell; the launch test is
skipped on Windows) and starts with an existing `settings.json` so the first-run
welcome alert does not block it on macOS.

## CI / Release

- `.github/workflows/ci.yml` — runs on push/PR to `master`/`develop`:
  lint+typecheck, unit/integration+coverage thresholds, E2E (xvfb), build on 3 OSes,
  Linux pack smoke with bundled-rclone assertions.
- `.github/workflows/release.yml` — on tag `v*`: checks that the tag matches
  `package.json`, builds every installer, then creates a **draft** GitHub Release
  via `softprops/action-gh-release`. Missing installer artifacts are fatal.
  Only `GITHUB_TOKEN` is needed (no Apple/Windows signing certs).

### Cutting a release

1. Bump the version with `npm version 1.x.y --no-git-tag-version` (updates
   `package.json` and the lockfile) and add a `CHANGELOG.md` entry.
2. Merge to `master` through a pull request once CI is green.
3. Tag and push: `git tag v1.x.y && git push origin v1.x.y`.
4. The release workflow builds every installer into a draft release.
5. Download the macOS build from the draft and check it by hand (see below).
6. Publish: `gh release edit v1.x.y --draft=false --latest`.

> Tag convention is **`v1.x.y`** (no extra dot). The old `v.1.2.0` tag/release is
> legacy — do not copy that format.

## Known quirks / backlog

- Builds are **unsigned**. A Developer ID for macOS is available, but signing and
  notarization (including the bundled `rclone` binary) are not wired into
  `release.yml` yet; that needs the certificate and an App Store Connect API key
  as repository secrets. Until then, keep the quarantine/SmartScreen workaround in
  README, Getting Started and the release notes.
- `npm audit` reports vulnerabilities mostly from `electron-builder`'s transitive
  deps; they are build-time only. Bump when convenient.
- Installers stage only the target rclone architecture in `scripts/stage-rclone.js`.
- Coverage is high on `settings.ts` and the `rclone.ts` command builders; the
  Electron/UI modules (`main`, `tray`, `dialogs`, preload) are exercised only by
  the E2E smoke test, not unit-covered.
- Generated artifacts are not source: `dist/`, `coverage/`, `rclone/`,
  `release/`, `playwright-report/`, and `test-results/` should be regenerated,
  not restored from git.

## Checking changes in the running app

The unit suite cannot see dialogs, the tray or real rclone behaviour. Before a
release, run the app against a scratch config (`RCLONETRAY_CONFIG_FILE`,
`RCLONETRAY_SETTINGS_DIR`, plus `--user-data-dir=<scratch>`) with the real bundled
rclone, and with a FUSE driver installed for mounts (WinFsp on Windows, macFUSE or
FUSE-T on macOS).

- **Windows:** Playwright's `_electron.launch` could not attach to Electron 44
  (2026-10-11). A small Electron entry script that `require`s `dist/main.js`,
  opens dialogs and calls `webContents.capturePage()` gives reliable screenshots.
- **macOS:** `_electron.launch({ executablePath: '/Applications/RcloneTray.app/Contents/MacOS/RcloneTray' })`
  drives the packaged app (2026-10-11). Pass `colorScheme: null` and call
  `page.emulateMedia({ colorScheme: null })` on each window, or Playwright forces
  `prefers-color-scheme: light` and dark mode looks broken. Register a no-op
  `page.on('dialog')` handler, or Playwright tries to answer the unsaved-changes
  prompt itself and crashes. `process.mainModule.require('./tray')` inside
  `electronApp.evaluate` reaches the app's modules.
- On macOS, native alerts without a parent window (the first-run welcome, the quit
  confirmation) are modal and block the main process until they are answered, so a
  test must seed `settings.json` or click the alert.
- macFUSE only works after a restart following its install or update.

Gated real-rclone tests run when `RCLONETRAY_RCLONE_PATH` points at an rclone
binary: `RCLONETRAY_RCLONE_PATH=$PWD/rclone/darwin/arm64/rclone npm test` (or
`rclone/win32/amd64/rclone.exe` on Windows).
