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
| **Windows** | `RcloneTray-<version>-x64.exe` (or `-arm64` for ARM PCs; 32-bit Windows is not supported) |
| **macOS** (Intel or Apple Silicon) | `RcloneTray-<version>-x64.dmg` or `-arm64.dmg` |
| **Linux** | `RcloneTray-<version>-x86_64.AppImage` or the `.deb` package |

> Not sure which macOS file? Apple Silicon (M-series) Macs, 2020 and later, use
> `arm64`. Older Macs are Intel (`x64`). The `x64` build also runs on Apple Silicon
> through Rosetta, but `arm64` is faster there. RcloneTray needs macOS 13 or later.

---

## 2. Install

### Windows

1. Double-click the `.exe`.
2. SmartScreen may say *"Windows protected your PC"* — this happens because the
   app is **not** code-signed yet. Click **More info → Run anyway**.
3. Follow the installer.

### macOS

1. Open the `.dmg` and drag **RcloneTray** into your **Applications** folder.
2. The first time you open it, macOS may say
   *"Apple could not verify 'RcloneTray' is free of malware."* This happens because
   release builds are not signed or notarized yet. Fix it **once** in one of these ways:

   **Option A — Terminal (most reliable):** open the Terminal app and paste:

   ```bash
   xattr -dr com.apple.quarantine /Applications/RcloneTray.app
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

If nothing happens on Ubuntu 23.10 or later and the terminal mentions the
sandbox (`chrome-sandbox` / `user namespaces`), AppArmor is blocking Chromium's
sandbox for AppImages. Prefer the `.deb` package, which is not affected. If you
must use the AppImage, `./RcloneTray-*.AppImage --no-sandbox` starts it without
the Chromium sandbox (less isolation for the app's windows).

**Debian/Ubuntu (`.deb`):**

```bash
sudo dpkg -i RcloneTray-*.deb
```

> Your desktop environment must support tray icons. On GNOME you may need the
> [AppIndicator extension](https://extensions.gnome.org/extension/615/appindicator-support/).

---

## 3. First use

1. Launch RcloneTray — look for its icon in the system tray.
2. Click the tray icon → **New Remote**.
3. Pick your storage **provider** (e.g. Google Drive, Dropbox, S3).
4. Fill in the connection details and click **Create remote**. RcloneTray uses the
   same config as rclone and changes only that remote. Existing rclone remotes show
   up automatically. An encrypted `rclone.conf` is shown as read-only. For Google
   Drive, Dropbox, OneDrive and other sign-in providers, your browser opens so you
   can sign in.
5. Click the remote in the tray menu to **Mount** it, **Upload** or **Download**
   (set the local folder under **Edit → Mappings** first), or **Serve** it.
6. Open **Activity** from the tray menu when you want to see running jobs, recent
   logs, or failures.

---

## 4. Mounting (using a remote as a normal drive/folder)

Mounting requires a FUSE driver for your OS:

| OS | Install |
|----|---------|
| **Windows** | [WinFsp](https://winfsp.dev/rel/) |
| **macOS** | [macFUSE](https://osxfuse.github.io/) or [FUSE-T](https://www.fuse-t.org/) |
| **Linux** | `sudo apt install fuse3` (Debian/Ubuntu) |

On macOS, restart your Mac after installing or updating macFUSE and allow its
system extension when macOS asks. Mounting does not work until then.

Where the mounted remote appears:
- **macOS and Linux:** a folder in your home folder named `mount.<type>.<name>`
  (for example `mount.drive.work`). It is removed again when you unmount.
- **Windows:** a free drive letter.

> No FUSE? Turn on **WebDAV** in **Preferences → Serving**, then use **Serve
> WebDAV** on the remote and connect with your file manager.

---

## 5. FAQ

**Do I need to install rclone separately?**
No — a copy of rclone is bundled. To use your own instead:
**Preferences → Rclone → uncheck "Use bundled"** (requires restart).

**Where is my configuration stored?**
The standard rclone location:
- Windows: `%APPDATA%\rclone\rclone.conf`
- macOS/Linux: `~/.config/rclone/rclone.conf`

You can point RcloneTray at another file in **Preferences → Rclone → Config file**.

**How do I password-protect a served remote?**
**Preferences → Serving** → set a username and password.

**Why do Upload and Download ask for confirmation?**
They use `rclone sync`, which can overwrite or delete files at the destination.
RcloneTray shows a dry-run preview first (how many files would be copied and
deleted) and blocks root/drive paths so a wrong mapping is harder to run
accidentally.

**Something broke / I found a bug.**
Please open an issue at
[github.com/ysalitrynskyi/RcloneTray/issues](https://github.com/ysalitrynskyi/RcloneTray/issues).
Include your OS, the app version (tray → **About**), and what you did.
