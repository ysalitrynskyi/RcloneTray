# Changelog

All notable changes to RcloneTray will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

