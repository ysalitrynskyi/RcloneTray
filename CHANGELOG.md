# Changelog

All notable changes to RcloneTray will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

