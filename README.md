# <img src="https://raw.githubusercontent.com/ysalitrynskyi/RcloneTray/master/src/ui/icons/source-icon-color.png" width="48px" align="center" alt="RcloneTray Icon" /> RcloneTray

![GitHub release](https://img.shields.io/github/release/ysalitrynskyi/RcloneTray.svg)
![CI](https://github.com/ysalitrynskyi/RcloneTray/workflows/CI/badge.svg)

RcloneTray is a simple cross-platform GUI for [Rclone](https://rclone.org/) and is intended to provide a free alternative to [Mountain Duck](https://mountainduck.io/).

![Screenshot](https://raw.githubusercontent.com/ysalitrynskyi/RcloneTray/master/screenshot.png)


## Features

- 🗂️ **Mount remote storage** as local drives
- 🔄 **Sync files** between local and remote (upload/download)
- 📡 **Serve remotes** via HTTP, FTP, WebDAV, or Restic
- 🔐 **Secure** - context isolation enabled, no remote module
- 💾 **Bundled Rclone** - works out of the box, no installation required
- 🖥️ **Cross-platform** - Windows, macOS, and Linux


## Changelog

### v1.2.0 (Latest)
- **Migrated to TypeScript** with strict type checking
- **Fixed IPC communication** - all dialogs now work properly
- **Fixed Preferences dialog** - settings load and save correctly
- **Fixed Add/Edit Bookmark dialogs** - async operations handled correctly
- **Modernized Electron APIs** - replaced deprecated APIs
- **Security hardening** - removed enableRemoteModule, proper context isolation
- **Fixed rclone command handling** - custom args filtering, stderr parsing
- **Implemented serving authentication** - username/password support for serve commands
- **Honors autoupload delay setting** - respects configured delay instead of hardcoded value
- **Added comprehensive test suite** - unit tests, integration tests, E2E smoke tests
- **Added CI pipeline** - GitHub Actions for lint, typecheck, tests, and builds

### v1.1.0
- Updated npm packages
- Fixed "WebDAV" and "Restic" on macOS
- Updated rclone for all systems and added support for ARM64
- Updated update-rclone-binaries.sh to download binaries for all supported architectures
- Fixed tray icon size on macOS
- Fixed uncaughtException() to quit the app on button click
- Fixed popup focus on macOS
- Updated app icon
- Changed About dialog


## Requirements

### Supported Operating Systems
- Windows 7/8/10/11 (x64, arm64)
- macOS 10.10 and later (Intel and Apple Silicon)
- GNU/Linux (x64), DE with tray icons support

### Mount Support
To get the mount function working, you need to install extra packages (alternatively you can mount using WebDAV):
- **Windows** - [WinFsp](http://www.secfs.net/winfsp/download/)
- **macOS** - [macFUSE](https://osxfuse.github.io/)
- **Linux** - fuse (`sudo apt install fuse` on Debian/Ubuntu)


## Installation

### Download
[Download the latest release](https://github.com/ysalitrynskyi/RcloneTray/releases) for your platform.

### Build from Source
See the [Development](#development) section below.


## Usage

1. **Launch RcloneTray** - the app starts in your system tray
2. **Create a bookmark** - click "New Bookmark" from the tray menu
3. **Select a provider** - choose your cloud storage provider (S3, Google Drive, Dropbox, etc.)
4. **Configure** - enter your credentials and settings
5. **Use** - mount, sync, or serve your remote storage from the tray menu


## FAQ

**Q: The application bundle comes with Rclone version XXX, but I want to use version YYY installed on my system**

A: Go to "Preferences" and from the "Rclone" tab, uncheck the option "Use bundled Rclone".

**Q: How do I add authentication to the serving feature?**

A: Go to "Preferences" → "Serving" tab and enter your desired username and password. These credentials will be used for all serve commands.

**Q: Why can't I mount my remote?**

A: Make sure you have the required FUSE driver installed for your OS (see [Requirements](#mount-support)).


## Development

### Prerequisites
- [Node.js](https://nodejs.org) (v20 or later recommended)
- npm

### Setup

```bash
git clone https://github.com/ysalitrynskyi/RcloneTray
cd RcloneTray
npm install
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run build:watch` | Compile TypeScript in watch mode |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run typecheck:watch` | Run TypeScript type checking in watch mode |
| `npm start` | Build and start the app |
| `npm run dev` | Build and start the app (alias for start) |
| `npm run lint` | Run ESLint |
| `npm run test` | Run unit and integration tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run pack` | Create unpacked build |
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
│   ├── dialogs-preload.ts # Preload script for renderer
│   ├── types.ts           # Shared TypeScript types
│   └── ui/                # UI assets
│       ├── dialogs/       # HTML dialog files
│       ├── icons/         # Application icons
│       └── styles/        # CSS stylesheets
├── dist/                   # Compiled JavaScript (generated)
├── tests/                  # Test files
│   ├── unit/              # Unit tests
│   ├── integration/       # Integration tests
│   └── e2e/               # E2E tests
├── rclone/                # Bundled rclone binaries (generated)
├── tsconfig.json          # TypeScript configuration
├── vitest.config.ts       # Vitest configuration
└── playwright.config.ts   # Playwright configuration
```

### Architecture

RcloneTray is an Electron application with:
- **Main Process** (`main.ts`): Handles app lifecycle, IPC, and system integration
- **Tray Module** (`tray.ts`): Manages system tray icon and menu
- **Rclone Module** (`rclone.ts`): Wraps rclone commands and manages processes
- **Settings Module** (`settings.ts`): Persists user preferences
- **Dialogs Module** (`dialogs.ts`): Creates BrowserWindow dialogs
- **Preload Script** (`dialogs-preload.ts`): Bridges main and renderer processes securely

### IPC Communication

The app uses Electron's IPC for communication between main and renderer processes:
- `ipcMain.handle()` for request/response patterns (use `ipcRenderer.invoke()`)
- `ipcMain.on()` for fire-and-forget events (use `ipcRenderer.send()`)

### Testing

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run E2E smoke tests
npm run test:e2e
```

### Building for Distribution

```bash
# Create packages for current platform
npm run dist

# Create packages for all platforms (requires appropriate build environment)
npm run publish
```


## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`npm run test`)
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request


## License

This project is licensed under the [MIT License](https://github.com/ysalitrynskyi/RcloneTray/blob/master/LICENSE.txt).


## Credits

- Original [RcloneTray](https://github.com/dimitrov-adrian/RcloneTray) by Adrian Dimitrov
- [Rclone](https://rclone.org/) by Nick Craig-Wood
