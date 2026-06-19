# Changelog

All notable changes to RcloneTray will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - 2026-06-19

The big fix: provider forms (S3 and others) only showed the **Name** field. Plus a
round of macOS robustness work and friendlier, more discoverable guidance.

### Fixed
- **Provider forms only showed the Name field.** The option show/hide logic matched
  every provider-gated field against a single shared value (overwritten as each field
  rendered), which hid almost everything for providers like Amazon S3. Field
  dependencies are now tracked per field and evaluated against all current form values,
  so bucket, access key, region, endpoint and the rest render correctly — and
  sub-provider-specific fields appear/disappear as you change the **Provider** selector.
- **Bundled Rclone blocked by macOS Gatekeeper.** On unsigned builds the quarantine
  attribute could stop the bundled `rclone` helper from launching. RcloneTray now
  clears the quarantine attribute and marks the helper executable on first use, and the
  release binaries are de-quarantined and ad-hoc codesigned at build time.
- **Oversized dialog header.** The provider's long description was used as the title
  (a huge wall of text for S3). The header now shows the short provider name with the
  description as a clamped subtitle.
- **`--auto-confirm` on read-only startup commands.** It's no longer appended to
  `version` / `config providers|dump|file`, which could interfere with parsing.

### Added
- **Provider-dependency aware validation/saving.** Required-field checks and config
  writes now skip options that don't apply to the selected sub-provider, and only
  submitted/active values are written.
- **In-app and docs guidance for the terminal.** The Add Remote picker notes you can
  run `rclone config` in a terminal (remotes appear in the tray automatically), and the
  README gained a Troubleshooting section plus usage notes.
- **Dialogs reuse the focused window** for native message/open dialogs, with a safe
  fallback when there's no focused window.
- Unit tests for `shouldAppendAutoConfirm` and `isProviderOptionActive`.

### Notes
- **macOS is the primary, actively tested platform.** Windows and Linux builds are
  provided and should work but are not actively tested — please open an issue if you
  hit problems there.

## [1.5.1] - 2026-06-19

### Fixed
- **Creating a bookmark silently doing nothing.** The renderer's IPC wrapper
  swallowed errors and returned `undefined`, so when bookmark creation failed in the
  main process (for example, an S3 remote with a required **Bucket or Path** left
  empty), the dialog treated it as success, closed itself, and showed neither the new
  bookmark nor any error. IPC errors are now propagated, so the dialog stays open and
  shows the real reason the bookmark couldn't be created.

## [1.5.0] - 2026-06-19

Incorporates and finalizes a round of code-review changes from two other reviewers,
plus fixes a styling regression those changes introduced.

### Added
- **Unified `ui.css` design system** — shared OKLCH tokens, light/dark, form controls,
  tabs, rows, tips and spinner — so every dialog stays visually consistent.

### Changed
- **More reliable error reporting.** Rclone command failures now surface the actual
  `stderr` detail instead of a generic "Rclone command error".
- **Bookmark add/update/delete are fully async/await** with proper rollback if writing
  options fails, and the bookmarks/providers caches now reject (and log) on failure.
- **Open folders via `shell.openPath`** instead of `file://` URLs — opens the native
  file manager more reliably across platforms.
- **Platform-aware menu labels** — "Show in Finder/Explorer/Files" depending on OS.
- Providers are now lazy-loaded on first request.
- Settings `merge()` is async, persists atomically, and ensures the config dir exists.
- Dialog stylesheets load synchronously (via `<link>`), removing the earlier
  flash-of-unstyled / wrong-font race entirely.

### Fixed
- **Form fields with checkboxes now save correctly** (boolean values), select fields
  match their stored value reliably, `number` inputs render, and hidden provider
  options are filtered out.
- **Restored dialog layout styling** that was lost when the inline styles were removed
  — the Add Remote picker, Edit Bookmark, and their headers/footers are styled again.

## [1.4.2] - 2026-06-19

### Fixed
- **New bookmark now appears immediately.** Adding a remote (e.g. S3) no longer
  silently does nothing — the tray menu and in-memory cache are refreshed right
  after create/update/delete instead of relying on a sometimes-missed config file
  watcher.
- **Provider settings can no longer get stuck on just the Name field.** If a
  provider's option data fails to load, the form now shows a clear error instead of
  an empty form, and the main process always replies to the request.
- **About window buttons work again.** "Report an issue" and "License" (and the
  version pill) previously triggered infinite recursion via a shadowed global
  `open()` and did nothing; they now open in the default browser reliably.

### Changed
- **New app icon.** Restored the brand identity — a cloud with the "R", on the
  classic blue→green→yellow gradient in a clean modern squircle with real
  transparency (no stray white/checkerboard plate behind the rounded corners).
  Applied across macOS (.icns), Windows (.ico), Linux/app (.png), the colored
  tray icons, and the About window.
- **Larger, more polished Preferences window** (840×620, resizable) with a wider
  sidebar, section subtitles, bigger titles, and a footer with Cancel + Save.

## [1.4.1] - 2026-06-19

### Changed
- **Full visual redesign of the dialogs** (Add Remote, Edit Bookmark, About) to a
  refined, native desktop-utility aesthetic with an OKLCH indigo palette, clear type
  hierarchy, monospace for version/identifier data, and proper light/dark support.
- Add Remote / Edit Bookmark are now fully self-styled (no runtime CSS injection),
  using fixed flex layouts so content never clips behind the window edge and there is
  consistent breathing room at the bottom.
- About window buttons now follow a clear hierarchy (one primary action + ghost
  secondary actions) instead of three identical buttons.

### Fixed
- **Serif/“broken” font in the bookmark dialogs.** The dialogs relied on a stylesheet
  injected asynchronously at runtime; when it wasn't applied the UI fell back to a
  serif system font. Styles are now inlined, so typography is always correct.
- **About window showed a transparent/see-through background** (other windows bled
  through). Removed the vibrancy/transparency; it's now a solid themed window.
- **App icon had a white plate peeking out behind the rounded corners.** The icon
  artwork is now masked to a clean squircle with transparent corners, and all icon
  formats (`.icns`/`.ico`/`.png`) plus the in-app About icon were regenerated.

## [1.4.0] - 2026-06-19

### Added
- **Custom application icon.** Replaced the default Electron icon with a purpose-built
  RcloneTray app icon (`.icns` / `.ico` / `.png`) wired into electron-builder for
  macOS, Windows and Linux, and used in the About window.
- **Mount VFS cache mode setting** (Preferences → Rclone → Mounting). Defaults to
  `writes` so mounted drives behave like real disks — apps can open, edit and save
  files, and Finder/Explorer copies succeed. Choose `off`/`minimal`/`writes`/`full`.
- **In-app guidance.** The Add Remote and Edit Bookmark dialogs now explain what to
  do, and point to the Advanced tab / Custom args / rclone.org docs for power users.

### Changed
- **Redesigned "Add Remote" dialog.** The oversized native provider dropdown is gone.
  It is replaced by a searchable, scrollable provider list with colored avatars,
  human-readable names and a clear two-step flow (pick provider → fill details).
  Fixes the huge-font dropdown and the cramped, empty-looking dialog.
- Edit Bookmark and Preferences dialogs polished for consistent spacing, smaller
  fonts and helper text on cache/mount fields.

### Fixed
- **Mounts now work as read/write drives by default.** `rclone mount` previously ran
  without `--vfs-cache-mode`, which caused writes, edits and many app operations to
  fail. The new default (`--vfs-cache-mode writes`) fixes this. Also dropped the
  legacy `--allow-non-empty` flag (the mountpoint is already verified empty), which
  could make macOS/macFUSE mounts fail.

## [1.3.2] - 2026-06-19

### Fixed
- `update-rclone-binaries.sh` now fails fast when rclone version lookup,
  download, unzip, or license download fails. This prevents CI/release jobs from
  publishing packages with missing bundled rclone binaries after a silent script
  failure.
- macOS packaging now explicitly disables automatic code signing (`identity:
  null`) so local and CI builds match the documented unsigned-app workflow.

### Security
- Provider help text in the preload bridge now renders via DOM text/link nodes
  instead of `innerHTML`, removing another unnecessary HTML injection surface.

## [1.3.1] - 2026-06-19

### Security
- Dialog error messages are now rendered with `textContent` instead of `innerHTML`
  in the Preferences and Edit Bookmark dialogs, removing any chance of HTML
  injection through an error string.

## [1.3.0] - 2026-06-19

### Fixed
- **Bundled rclone not found on x64/ia32** - the runtime path used Node's `process.arch`
  (`x64`, `ia32`) while binaries are stored under rclone/Go names (`amd64`, `386`).
  Added an architecture mapping so the bundled binary resolves correctly.
- **Bundled rclone was never packaged** - the `extraResources` globs (`rclone/<os>/*`)
  did not recurse into the per-architecture subfolders, so released apps shipped
  without the bundled binary. Changed to `rclone/<os>/**`.
- **Windows free-drive-letter detection** - replaced the deprecated/removed `wmic`
  call with PowerShell (`Get-PSDrive`), restoring mount support on Windows 11.
- **Settings startup race** - settings are now loaded synchronously at startup so
  `rclone.init()` always sees the persisted config; corrupt files fall back to defaults.

### Changed
- **rclone commands run without a shell** - `doCommand`/`doCommandSync` now use
  `execFile`/`execFileSync` instead of `exec` with hand-quoted strings, removing a
  class of quoting/escaping bugs and shell-injection risk, and speeding up calls.
- **Settings type coercion** - values coming from the renderer form (strings) are
  coerced to their declared types (numbers/booleans) on merge.
- **electron-builder output** moved to `release/` so installers no longer mix with
  compiled JS in `dist/`.

### Added
- Environment overrides for isolated profiles / testing: `RCLONETRAY_RCLONE_PATH`,
  `RCLONETRAY_CONFIG_FILE`, `RCLONETRAY_CONFIG_DIR`, `RCLONETRAY_SETTINGS_DIR`.
- Real unit tests for the rclone command builders and the settings module, plus a
  **non-skipped** E2E test that boots the app through Electron `ready` using a stub
  rclone binary. `npm run test:coverage` added.
- **Release pipeline** (`.github/workflows/release.yml`) triggered on `v*` tags:
  matrix builds for macOS (x64 + arm64), Windows (x64/ia32/arm64), and Linux (x64),
  uploading `.dmg`/`.zip`/`.exe`/`.AppImage`/`.deb` to a GitHub Release.
- `docs/GETTING_STARTED.md`, `docs/AI_HANDOFF.md`, `SECURITY.md`, `CONTRIBUTING.md`,
  Dependabot config, and a committed `package-lock.json` for reproducible `npm ci`.
- `update-rclone-binaries.sh` accepts an optional platform argument
  (`darwin`/`win32`/`linux`) for faster CI downloads.

### CI
- **Fixed branch triggers** - CI now runs on `master` (previously `main`/`develop`,
  so it never ran). Lint is now a hard gate (removed `continue-on-error`).
- E2E smoke test runs in CI under `xvfb`; removed the stale `.travis.yml`.

## [1.2.0] - 2024-12-16

### Added
- TypeScript migration with strict type checking
- Comprehensive test suite (unit, integration, E2E smoke tests)
- GitHub Actions CI pipeline for lint, typecheck, tests, and builds
- Serving authentication support (username/password for serve commands)
- Missing `getConfig()` function for rclone config access
- Shared type definitions in `types.ts`
- Development documentation in README

### Changed
- Migrated all source files from JavaScript to TypeScript
- Build output now goes to `dist/` directory
- Modernized Electron APIs (setWindowOpenHandler, showMessageBoxSync)
- All dialog files now use async/await for IPC communication
- Updated package.json with new scripts and TypeScript dependencies

### Fixed
- **IPC contract issues** - Fixed handler signatures to properly include event parameter
- **Preferences dialog** - Settings now load and save correctly
- **Add/Edit Bookmark dialogs** - Async operations handled properly
- **fieldHelpText crash** - Added missing variable declaration
- **renderBookmarkSettings API** - Now accepts both DOM elements and string IDs
- **confirm() awaiting** - Properly awaited in EditBookmark delete flow
- **Custom args filtering** - Verbose flags now filtered correctly, other args preserved
- **stderr line accumulator** - Partial lines now properly buffered across data chunks
- **Autoupload delay** - Now respects `rclone_sync_autoupload_delay` setting

### Security
- Removed deprecated `enableRemoteModule`
- Proper context isolation enforced
- Replaced legacy `webContents.on('new-window')` with `setWindowOpenHandler`

### Removed
- Old JavaScript source files (replaced by TypeScript)

## [1.1.0] - 2024-03-21

### Added
- ARM64 support for all platforms
- Updated update-rclone-binaries.sh to download binaries for all supported architectures

### Changed
- Updated npm packages
- Updated rclone binaries for all systems
- Updated app icon
- Changed About dialog

### Fixed
- "WebDAV" and "Restic" serving on macOS
- Tray icon size on macOS
- uncaughtException() to quit the app on button click
- Popup focus on macOS

### Known Issues
- Settings page was not loading properly (fixed in 1.2.0)

## [1.0.0] - Initial Release

### Features
- Mount remote storage as local drives
- Sync files between local and remote
- Serve remotes via HTTP, FTP, WebDAV, Restic
- Cross-platform support (Windows, macOS, Linux)
- Bundled Rclone binary

