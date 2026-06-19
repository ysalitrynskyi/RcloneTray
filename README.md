# <img src="https://raw.githubusercontent.com/ysalitrynskyi/RcloneTray/master/src/ui/icons/source-icon-color.png" width="42px" align="center" alt="RcloneTray" /> RcloneTray

[![GitHub release](https://img.shields.io/github/release/ysalitrynskyi/RcloneTray.svg)](https://github.com/ysalitrynskyi/RcloneTray/releases)
[![CI](https://github.com/ysalitrynskyi/RcloneTray/workflows/CI/badge.svg)](https://github.com/ysalitrynskyi/RcloneTray/actions)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/ysalitrynskyi?style=social)](https://github.com/sponsors/ysalitrynskyi)

A simple, cross-platform desktop app that lives in your system tray and gives [Rclone](https://rclone.org/) a graphical interface. Mount, sync, and serve your cloud storage without touching the command line — a free alternative to [Mountain Duck](https://mountainduck.io/).

![Screenshot](https://raw.githubusercontent.com/ysalitrynskyi/RcloneTray/master/screenshot.png)

## Contents

- [Features](#features)
- [Install](#install)
  - [First launch](#first-launch)
- [Requirements](#requirements)
- [Usage](#usage)
- [FAQ](#faq)
- [Development](#development)
- [Changelog](#changelog)
- [Contributing](#contributing)
- [Support](#support)
- [License](#license)
- [Credits](#credits)

## Features

- **Mount** remote storage as a local drive.
- **Sync** files between local folders and remotes (upload and download).
- **Serve** remotes over HTTP, FTP, WebDAV, or Restic.
- **Bundled Rclone** — works out of the box, no separate install.
- **Cross-platform** — Windows, macOS, and Linux.
- **Automatic dark mode** — follows your system theme.
- **Secure by default** — sandboxed renderer with context isolation.

## Install

[Download the latest release](https://github.com/ysalitrynskyi/RcloneTray/releases) for your platform:

| Platform | Architecture          | Files                  |
| -------- | --------------------- | ---------------------- |
| Windows  | x64, ia32, arm64      | `.exe` installer       |
| macOS    | Intel & Apple Silicon | `.dmg`, `.zip`         |
| Linux    | x64                   | `.AppImage`, `.deb`    |

New to RcloneTray? The [Getting Started guide](docs/GETTING_STARTED.md) walks through installation in plain English.

To build from source instead, see [Development](#development).

### First launch

The app is **not** code-signed (an Apple Developer ID and a Windows certificate both cost money — this app is free), so each OS shows a one-time warning for unknown apps. This is expected.

**macOS** — after installing from the `.dmg`, run this once in Terminal:

```bash
xattr -d com.apple.quarantine /Applications/RcloneTray.app
```

(Alternatively: right-click the app, choose **Open**, then **Open** again. The Terminal command is the most reliable.)

**Windows** — if SmartScreen warns about an unknown publisher, click **More info → Run anyway**.

**Linux** — make the AppImage executable, then run it:

```bash
chmod +x RcloneTray-*.AppImage
./RcloneTray-*.AppImage
```

## Requirements

**Operating systems**

- Windows 7/8/10/11 (x64, arm64)
- macOS 10.10 or later (Intel and Apple Silicon)
- Linux (x64) with a desktop environment that supports tray icons

**Mounting (optional)**

The mount feature needs a FUSE driver for your OS:

| OS      | Required package                                                            |
| ------- | -------------------------------------------------------------------------- |
| Windows | [WinFsp](http://www.secfs.net/winfsp/download/)                            |
| macOS   | [macFUSE](https://osxfuse.github.io/)                                      |
| Linux   | `fuse` (e.g. `sudo apt install fuse` on Debian/Ubuntu)                     |

If you would rather not install a FUSE driver, use the WebDAV serve feature instead.

## Usage

1. Launch RcloneTray — it starts in your system tray.
2. Open the tray menu and choose **New Bookmark**.
3. Pick a provider (Amazon S3, Google Drive, Dropbox, and so on).
4. Enter your credentials and settings.
5. Mount, sync, or serve the remote from the tray menu.

## FAQ

<details>
<summary><b>How do I use my own Rclone installation?</b></summary>

Open **Preferences → Rclone** and uncheck **Use bundled Rclone**.
</details>

<details>
<summary><b>My drive mounts, but files won't save or editing fails.</b></summary>

Open **Preferences → Rclone → Mounting** and set **VFS cache mode** to **Writes** (the default) or **Full**, then re-mount the bookmark. This lets apps open, edit, and save files on the mounted drive.
</details>

<details>
<summary><b>Why can't I mount my remote?</b></summary>

Make sure the FUSE driver for your OS is installed — see [Requirements](#requirements).
</details>

<details>
<summary><b>How do I add authentication to serving?</b></summary>

Open **Preferences → Serving** and set a username and password.
</details>

<details>
<summary><b>Where is the config file stored?</b></summary>

RcloneTray uses the default Rclone location:

- Windows: `%APPDATA%\rclone\rclone.conf`
- macOS: `~/.config/rclone/rclone.conf`
- Linux: `~/.config/rclone/rclone.conf`
</details>

## Development

**Prerequisites:** [Node.js](https://nodejs.org) v20+ and npm.

```bash
git clone https://github.com/ysalitrynskyi/RcloneTray
cd RcloneTray
npm install
npm start
```

**Scripts**

| Script                  | Description                                  |
| ----------------------- | -------------------------------------------- |
| `npm start`             | Build and start the app                      |
| `npm run build`         | Compile TypeScript                           |
| `npm run typecheck`     | Type-check without emitting                  |
| `npm run lint`          | Run ESLint                                   |
| `npm run test`          | Run unit and integration tests (Vitest)      |
| `npm run test:coverage` | Run tests with a coverage report             |
| `npm run test:e2e`      | Run E2E smoke tests (Playwright + Electron)  |
| `npm run dist`          | Build distribution packages                  |

**Project structure**

```
src/                  TypeScript source
  main.ts             Main Electron process
  tray.ts             System tray menu
  rclone.ts           Rclone integration
  settings.ts         Settings storage
  dialogs.ts          Dialog windows
  dialogs-preload.ts  Preload (context bridge)
  types.ts            Shared types
  ui/                 HTML, CSS, icons
dist/                 Compiled JavaScript
tests/                Unit, integration, E2E tests
rclone/               Bundled rclone binaries
```

## Changelog

Recent highlights — see [CHANGELOG.md](CHANGELOG.md) for the full history.

- **v1.5.0** — Reliability pass (clearer errors, safer add/update/delete, native file-manager open); unified `ui.css` design system with form-field fixes; platform-aware "Show in Finder/Explorer/Files" labels.
- **v1.4.2** — Adding a remote now appears in the tray immediately; brand icon restored and modernized; larger Preferences window; working About buttons.
- **v1.4.0** — Working mounts (`--vfs-cache-mode writes` by default); searchable provider picker; custom app icon; in-app guidance.
- **v1.3.0** — `execFile` for rclone commands, real test suite, and a tag-triggered release pipeline for all three platforms.

## Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/my-change`.
3. Make your change and run `npm run test`.
4. Commit and push, then open a Pull Request.

## Support

If RcloneTray is useful to you, consider sponsoring its development:

[![Sponsor on GitHub](https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?logo=github)](https://github.com/sponsors/ysalitrynskyi)

## License

Released under the [MIT License](LICENSE.txt).

## Credits

- Original [RcloneTray](https://github.com/dimitrov-adrian/RcloneTray) by Adrian Dimitrov
- [Rclone](https://rclone.org/) by Nick Craig-Wood
- Built with [Electron](https://www.electronjs.org/)
