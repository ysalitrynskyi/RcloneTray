# <img src="https://raw.githubusercontent.com/ysalitrynskyi/RcloneTray/master/src/ui/icons/source-icon-color.png" width="48px" align="center" alt="RcloneTray Icon" /> RcloneTray

[![GitHub release](https://img.shields.io/github/release/ysalitrynskyi/RcloneTray.svg)](https://github.com/ysalitrynskyi/RcloneTray/releases)
[![CI](https://github.com/ysalitrynskyi/RcloneTray/workflows/CI/badge.svg)](https://github.com/ysalitrynskyi/RcloneTray/actions)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/ysalitrynskyi?style=social)](https://github.com/sponsors/ysalitrynskyi)

RcloneTray is a simple cross-platform GUI for [Rclone](https://rclone.org/) and is intended to provide a free alternative to [Mountain Duck](https://mountainduck.io/).

![Screenshot](https://raw.githubusercontent.com/ysalitrynskyi/RcloneTray/master/screenshot.png)

## ✨ Features

- 🗂️ **Mount remote storage** as local drives
- 🔄 **Sync files** between local and remote (upload/download)
- 📡 **Serve remotes** via HTTP, FTP, WebDAV, or Restic
- 🔐 **Secure** - context isolation enabled, sandboxed renderer
- 💾 **Bundled Rclone** - works out of the box, no installation required
- 🖥️ **Cross-platform** - Windows, macOS, and Linux
- 🌙 **Dark mode** - automatic light/dark theme support


## 📦 Installation

### Download

[**Download the latest release**](https://github.com/ysalitrynskyi/RcloneTray/releases) for your platform:

| Platform | Architecture | Download |
|----------|-------------|----------|
| Windows | x64, ia32, arm64 | `.exe` installer |
| macOS | Intel & Apple Silicon | `.dmg`, `.zip` |
| Linux | x64 | `.AppImage`, `.deb` |

> 📘 New here? Read the plain-English **[Getting Started guide](docs/GETTING_STARTED.md)** for step-by-step install instructions.

### First launch on macOS (unsigned app)

RcloneTray is **not** signed with an Apple Developer ID ($99/year — this app is free). After installing from the `.dmg`, macOS may block it with *"Apple could not verify…"*. This is normal for free, unsigned open-source apps.

**One-time fix (Terminal):**

```bash
xattr -d com.apple.quarantine /Applications/RcloneTray.app
```

Or right-click the app → **Open** → **Open**. The Terminal command is the most reliable fix.

### First launch on Windows (unsigned installer)

Windows SmartScreen may warn about an unknown publisher. Click **More info → Run anyway** to continue.

### First launch on Linux (AppImage)

Make the AppImage executable, then run it:

```bash
chmod +x RcloneTray-*.AppImage
./RcloneTray-*.AppImage
```

### Build from Source

See the [Development](#-development) section below.


## 🖥️ Requirements

### Supported Operating Systems
- Windows 7/8/10/11 (x64, arm64)
- macOS 10.10 and later (Intel and Apple Silicon)
- GNU/Linux (x64), DE with tray icons support

### Mount Support

To use the mount feature, install the appropriate FUSE driver:

| OS | Required Package |
|----|-----------------|
| **Windows** | [WinFsp](http://www.secfs.net/winfsp/download/) |
| **macOS** | [macFUSE](https://osxfuse.github.io/) |
| **Linux** | `fuse` (`sudo apt install fuse` on Debian/Ubuntu) |

> 💡 **Tip:** As an alternative to mounting, you can use the WebDAV serve feature.


## 🚀 Usage

1. **Launch RcloneTray** - the app starts in your system tray
2. **Create a bookmark** - click "New Bookmark" from the tray menu
3. **Select a provider** - choose your cloud storage (S3, Google Drive, Dropbox, etc.)
4. **Configure** - enter your credentials and settings
5. **Use** - mount, sync, or serve your remote storage from the tray menu


## ❓ FAQ

<details>
<summary><b>How do I use my own Rclone installation?</b></summary>

Go to **Preferences** → **Rclone** tab → uncheck **"Use bundled Rclone"**.
</details>

<details>
<summary><b>How do I add authentication to serving?</b></summary>

Go to **Preferences** → **Serving** tab and enter your username and password.
</details>

<details>
<summary><b>Why can't I mount my remote?</b></summary>

Make sure you have the required FUSE driver installed for your OS. See [Requirements](#mount-support).
</details>

<details>
<summary><b>My drive mounts, but files won't save / editing fails</b></summary>

Open **Preferences → Rclone → Mounting** and set **VFS cache mode** to **Writes**
(the default) or **Full**. This lets applications open, edit and save files on the
mounted drive. Re-mount the bookmark for the change to take effect.
</details>

<details>
<summary><b>Where is the config file stored?</b></summary>

RcloneTray uses the default Rclone config location:
- **Windows:** `%APPDATA%\rclone\rclone.conf`
- **macOS:** `~/.config/rclone/rclone.conf`
- **Linux:** `~/.config/rclone/rclone.conf`
</details>


## 🛠️ Development

### Prerequisites
- [Node.js](https://nodejs.org) v20 or later
- npm

### Setup

```bash
git clone https://github.com/ysalitrynskyi/RcloneTray
cd RcloneTray
npm install
```

### Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Build and start the app |
| `npm run build` | Compile TypeScript |
| `npm run typecheck` | Run type checking |
| `npm run lint` | Run ESLint |
| `npm run test` | Run unit & integration tests (vitest) |
| `npm run test:coverage` | Run tests with a coverage report |
| `npm run test:e2e` | Run E2E smoke tests (Playwright + Electron) |
| `npm run dist` | Create distribution packages |

### Project Structure

```
RcloneTray/
├── src/                    # TypeScript source files
│   ├── main.ts            # Main Electron process
│   ├── tray.ts            # System tray management
│   ├── rclone.ts          # Rclone integration
│   ├── settings.ts        # Settings management
│   ├── dialogs.ts         # Dialog window management
│   ├── dialogs-preload.ts # Preload script (context bridge)
│   ├── types.ts           # Shared TypeScript types
│   └── ui/                # UI assets (HTML, CSS, icons)
├── dist/                   # Compiled JavaScript
├── tests/                  # Test files
└── rclone/                 # Bundled rclone binaries
```

### Building for Distribution

```bash
# Current platform
npm run dist

# All platforms (requires appropriate build environment)
npm run publish
```


## 📋 Changelog

### v1.4.1 (Latest)
- **Redesigned dialogs** - Add Remote, Edit Bookmark and About rebuilt with a refined, native look (fixes broken serif fonts, clipped content, and the see-through About window)
- **Cleaner app icon** - removed a white plate that peeked out behind the icon's rounded corners

### v1.4.0
- **New app icon** - custom RcloneTray icon for macOS/Windows/Linux (no more default Electron icon)
- **Mounts fixed** - mounts now run with `--vfs-cache-mode writes` by default, so files actually save and apps can edit them; configurable in Preferences
- **Redesigned "Add Remote"** - searchable provider list with avatars instead of the oversized native dropdown, plus a clear pick-then-configure flow
- **More guidance** - in-app tips pointing to Advanced options, custom args and rclone docs

### v1.3.2
- **Release hardening** - rclone binary downloader now fails fast, mac builds are explicitly unsigned, and provider help text no longer uses `innerHTML`

### v1.3.1
- **Security** - dialog error messages now render via `textContent` (no HTML injection)

### v1.3.0
- **Reliability** - rclone commands now run via `execFile` (no shell) to avoid quoting/escaping bugs
- **Bug fix** - bundled rclone binary is now found on x64/ia32 (architecture name mapping)
- **Windows** - replaced deprecated `wmic` with PowerShell for free-drive-letter detection
- **Settings** - synchronous startup load (fixes a startup race), corrupt-file fallback, type coercion
- **Tests** - real unit tests for command builders + settings, a non-skipped E2E launch smoke test
- **CI/CD** - CI now runs on `master`, lint is a hard gate, plus a tag-triggered release pipeline that publishes installers for macOS, Windows, and Linux
- **Docs** - Getting Started guide and clear unsigned-app first-launch instructions

### v1.2.0
- **Redesigned Preferences UI** - modern sidebar navigation with light/dark mode
- **Migrated to TypeScript** with strict type checking
- **Fixed all dialog issues** - Preferences, Add/Edit Bookmark now work correctly
- **Modernized Electron APIs** - proper context isolation, no deprecated APIs
- **Security hardening** - sandboxed renderer, removed enableRemoteModule
- **Serving authentication** - username/password support for serve commands
- **Comprehensive test suite** - unit, integration, and E2E tests
- **CI pipeline** - GitHub Actions for automated testing and builds

### v1.1.0
- Updated npm packages
- Fixed WebDAV and Restic on macOS
- Updated rclone binaries (ARM64 support)
- Fixed tray icon and popup focus on macOS
- Updated app icon and About dialog

See [CHANGELOG.md](CHANGELOG.md) for full history.


## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`npm run test`)
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request


## ❤️ Support

If you find RcloneTray useful, consider supporting its development:

[![Sponsor on GitHub](https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?logo=github)](https://github.com/sponsors/ysalitrynskyi)

Your sponsorship helps maintain and improve RcloneTray!


## 📄 License

This project is licensed under the [MIT License](LICENSE.txt).


## 🙏 Credits

- Original [RcloneTray](https://github.com/dimitrov-adrian/RcloneTray) by Adrian Dimitrov
- [Rclone](https://rclone.org/) by Nick Craig-Wood
- Built with [Electron](https://www.electronjs.org/)
