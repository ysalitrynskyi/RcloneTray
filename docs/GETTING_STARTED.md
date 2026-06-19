# Getting Started with RcloneTray

RcloneTray is a small app that lives in your system tray (the row of icons near
your clock) and lets you connect to cloud storage — Google Drive, Dropbox, S3,
and [many more](https://rclone.org/overview/) — without using the command line.

This guide is written for non-developers. No terminal knowledge required (except
one optional copy-paste step on macOS).

---

## 1. Download

Go to the [**Releases page**](https://github.com/ysalitrynskyi/RcloneTray/releases)
and download the file for your operating system:

| Your computer | Download this |
|---------------|---------------|
| **Windows** | `RcloneTray-<version>-x64.exe` (or `-arm64`/`-ia32` for those CPUs) |
| **macOS** (Intel or Apple Silicon) | `RcloneTray-<version>-x64.dmg` or `-arm64.dmg` |
| **Linux** | `RcloneTray-<version>-x86_64.AppImage` or the `.deb` package |

> Not sure which macOS file? Apple Silicon = M1/M2/M3/M4 Macs (2020+). Older Macs
> are Intel (`x64`). If unsure, the `x64` build also runs on Apple Silicon.

---

## 2. Install

### Windows

1. Double-click the `.exe`.
2. SmartScreen may say *"Windows protected your PC"* — this happens because the
   app is **not** code-signed (signing costs money; this app is free). Click
   **More info → Run anyway**.
3. Follow the installer.

### macOS

1. Open the `.dmg` and drag **RcloneTray** into your **Applications** folder.
2. The first time you open it, macOS may say
   *"Apple could not verify 'RcloneTray' is free of malware."* This is normal for
   free, unsigned open-source apps. Fix it **once** in one of these ways:

   **Option A — Terminal (most reliable):** open the Terminal app and paste:

   ```bash
   xattr -d com.apple.quarantine /Applications/RcloneTray.app
   ```

   Then open RcloneTray normally.

   **Option B — Right-click:** right-click (or Control-click) **RcloneTray** in
   Applications → **Open** → **Open** in the dialog.

### Linux

**AppImage** (works on most distros):

```bash
chmod +x RcloneTray-*.AppImage
./RcloneTray-*.AppImage
```

**Debian/Ubuntu (`.deb`):**

```bash
sudo dpkg -i RcloneTray-*.deb
```

> Your desktop environment must support tray icons. On GNOME you may need the
> [AppIndicator extension](https://extensions.gnome.org/extension/615/appindicator-support/).

---

## 3. First use

1. Launch RcloneTray — look for its icon in the system tray.
2. Click the tray icon → **New Bookmark**.
3. Pick your storage **provider** (e.g. Google Drive, Dropbox, S3).
4. Fill in the connection details and **Save**. RcloneTray uses the same config
   as rclone, so existing rclone remotes show up automatically.
5. Click the bookmark in the tray menu to **Mount**, **Sync**, or **Serve** it.

---

## 4. Mounting (using a remote as a normal drive/folder)

Mounting requires a FUSE driver for your OS:

| OS | Install |
|----|---------|
| **Windows** | [WinFsp](http://www.secfs.net/winfsp/download/) |
| **macOS** | [macFUSE](https://osxfuse.github.io/) |
| **Linux** | `sudo apt install fuse` (Debian/Ubuntu) |

> No FUSE? Use the **Serve → WebDAV** option instead and connect with your file
> manager.

---

## 5. FAQ

**Do I need to install rclone separately?**
No — a copy of rclone is bundled. To use your own instead:
**Preferences → Rclone → uncheck "Use bundled Rclone"** (requires restart).

**Where is my configuration stored?**
The standard rclone location:
- Windows: `%APPDATA%\rclone\rclone.conf`
- macOS/Linux: `~/.config/rclone/rclone.conf`

**How do I password-protect a served remote?**
**Preferences → Serving** → set a username and password.

**Something broke / I found a bug.**
Please open an issue at
[github.com/ysalitrynskyi/RcloneTray/issues](https://github.com/ysalitrynskyi/RcloneTray/issues).
Include your OS, the app version (tray → **About**), and what you did.
