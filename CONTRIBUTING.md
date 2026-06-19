# Contributing to RcloneTray

Thanks for your interest in improving RcloneTray! This is a small, single-maintainer
open-source project, so clear, focused contributions are very welcome.

## Development setup

Requirements: [Node.js](https://nodejs.org) 20+ and npm.

```bash
git clone https://github.com/ysalitrynskyi/RcloneTray
cd RcloneTray
npm install          # also downloads bundled rclone binaries (large, one-time)
npm start            # build + launch the app
```

If you only need to run checks (no packaging), you can skip the rclone download:

```bash
npm install --ignore-scripts
```

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
