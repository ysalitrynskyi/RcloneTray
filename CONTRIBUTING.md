# Contributing to RcloneTray

Thanks for your interest in improving RcloneTray! This is a small, single-maintainer
open-source project, so clear, focused contributions are very welcome.

## Development setup

Requirements: [Node.js](https://nodejs.org) 22.12+ and npm.

```bash
git clone https://github.com/ysalitrynskyi/RcloneTray
cd RcloneTray
npm install          # also fetches Electron and the bundled rclone for your platform
npm start            # build + launch the app
```

`npm install` runs `scripts/postinstall.js`, which installs the Electron binary
(npm 11 can skip Electron's own install script) and downloads the bundled rclone
for your platform, verified against rclone's SHA256SUMS. The rclone version is
pinned in `package.json` (`rcloneVersion`); set `RCLONE_VERSION` to override it.
If the download fails (offline, proxy), `npm install` still succeeds and prints a
warning; run `npm run fetch-rclone` later. `HTTPS_PROXY` is honoured.

With `--ignore-scripts` nothing is downloaded: `typecheck`, `lint` and `test`
still work, but `npm start` needs `node node_modules/electron/install.js` and
`npm run fetch-rclone` first.

To fetch rclone for another platform (as CI does for installers):
`node scripts/fetch-rclone.js --platform darwin --arch amd64,arm64`.

## Before you open a PR

Please make sure all of these pass locally:

```bash
npm run typecheck    # zero errors
npm run lint         # zero errors
npm run test         # unit + integration
npm run build        # compiles to dist/
npm run test:e2e     # E2E smoke (needs a prior build)
```

CI runs the same gates on `master` and on pull requests.

## Guidelines

- **Keep diffs focused.** Match the existing code style; avoid unrelated refactors.
- **Preserve the security model.** Dialog windows must keep `contextIsolation`,
  `sandbox`, and `nodeIntegration: false`. The only renderer↔main surface is the
  preload bridge — don't widen it unnecessarily.
- **Add tests** for behavior changes where practical (see `tests/`).
- **Don't commit** `node_modules/`, `dist/`, `release/`, or downloaded `rclone/`
  binaries (all gitignored).
- **Update docs/CHANGELOG** when you change user-facing behavior.
- Use clear, conventional-ish commit messages (e.g. `fix: …`, `feat: …`, `docs: …`).

## Reporting bugs

Open an [issue](https://github.com/ysalitrynskyi/RcloneTray/issues) with your OS,
the app version (tray → **About**), reproduction steps, and what you expected.

## Credits

RcloneTray is a fork/evolution of the original
[RcloneTray](https://github.com/dimitrov-adrian/RcloneTray) by Adrian Dimitrov,
built on [Rclone](https://rclone.org/) and [Electron](https://www.electronjs.org/).
