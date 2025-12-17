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
| Windows | x64, arm64 | `.exe` installer |
| macOS | Intel & Apple Silicon | `.dmg` |
| Linux | x64 | `.AppImage`, `.deb` |

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
| `npm run test` | Run unit and integration tests |
| `npm run test:e2e` | Run E2E tests |
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

### v1.2.0 (Latest)
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
