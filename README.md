# <img src="https://raw.githubusercontent.com/ysalitrynskyi/RcloneTray/master/src/ui/icons/source-icon-color.png" width="48px" align="center" alt="RcloneTray Icon" /> RcloneTray

![GitHub release](https://img.shields.io/github/release/ysalitrynskyi/RcloneTray.svg)

RcloneTray is simple cross-platform GUI for [Rclone](https://rclone.org/) and is intended to provide a free altenative to [Mountain Duck](https://mountainduck.io/)


## Overview

This is a fork of [RcloneTray](https://github.com/dimitrov-adrian/RcloneTray) with the following changes:

2024-03-21 - v1.1.0:
- Updated npm packages
- Fixed "WebDAV" and "Restic" on macOS
- Updated rclone for all systems and added support for ARM64
- Updated update-rclone-binaries.sh to download binaries for all supported architectures
- Fixed tray icon size on macOS
- Fixed uncaughtException() to quit the app on button click
- Fixed popup focus on macOS
- Updated app icon
- Changed About dialog

Known bugs:
- Settings page is not loading properly

![Screenshot](https://raw.githubusercontent.com/ysalitrynskyi/RcloneTray/master/screenshot.png)


## Requirements
Supported operating systems:
* Windows 7/8/10/11 (x64)
* macOS 10.10 and later (Intel and Apple Silicon)
* GNU/Linux (x64), DE with tray icons support

To get mount function working, you need to install extra packages (alternatively you can mount using WebDAV):
* Windows - http://www.secfs.net/winfsp/download/
* macOS - https://osxfuse.github.io/
* Linux - fuse


## FAQ

**The application bundle comes with Rclone version XXX, but I want to use version YYY installed on my system**

Go "Preferences" and from "Rclone" tab, uncheck the option "Use bundled Rclone".


## Downloads
[Check latest releases](https://github.com/ysalitrynskyi/RcloneTray/releases)


## Contributing
Any help is welcome, just file an issue or pull request.


## Building

You'll need [Node.js](https://nodejs.org) installed on your computer in order to build this app.

```bash
$ git clone https://github.com/ysalitrynskyi/RcloneTray
$ cd RcloneTray
$ npm install
```

```bash
$ npm start
```

or:
```bash
$ npm run dist
```


## License
This project is licensed under the [MIT](https://github.com/ysalitrynskyi/RcloneTray/blob/master/LICENSE.txt) License
