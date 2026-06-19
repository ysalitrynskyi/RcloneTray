# AI / Maintainer Handoff

Quick reference for whoever (human or agent) works on RcloneTray next.

## Stack

- **Electron 29** + **TypeScript 5** (strict), compiled with `tsc` to `dist/`.
- **electron-builder 24** for packaging (output → `release/`).
- Tests: **vitest** (unit/integration) + **Playwright** (`_electron`) for E2E.
- Bundled **rclone** binaries downloaded at `postinstall` into `rclone/` (gitignored).

## Source map

| File | Responsibility |
|------|----------------|
| `src/main.ts` | Electron main process, all `ipcMain` handlers, app lifecycle |
| `src/tray.ts` | System tray icon + dynamic menu (per-bookmark actions) |
| `src/rclone.ts` | rclone process management, bookmark CRUD, mount/sync/serve, command builders |
| `src/settings.ts` | Persistent settings (`settings.json` in userData), defaults, coercion |
| `src/dialogs.ts` | BrowserWindow factory for dialogs, app menu, error/confirm dialogs |
| `src/dialogs-preload.ts` | `contextBridge` API exposed to renderer (the only renderer↔main surface) |
| `src/types.ts` | Shared types |
| `src/ui/` | HTML dialogs, CSS (`ui-darwin/win32/linux.css`), icons |

## Security model

All dialog windows use `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`, `webviewTag: false`. The renderer only talks to main through the
preload bridge. External links go through `setWindowOpenHandler` → `shell.openExternal`.
Keep it that way.

## Commands

```bash
npm install            # downloads ALL rclone binaries via postinstall (large)
npm run typecheck      # tsc --noEmit  (must be zero errors)
npm run lint           # eslint src    (hard gate, zero errors)
npm run test           # vitest unit + integration
npm run test:coverage  # + coverage report
npm run build          # tsc -> dist/
npm run test:e2e       # Playwright; needs build first; uses stub rclone
npm run dist           # electron-builder for current platform -> release/
```

### rclone binaries

`./update-rclone-binaries.sh [darwin|win32|linux|all]` — the optional arg limits
the download to one platform (CI uses this). Runtime path resolution maps Node's
`process.arch` (`x64`/`ia32`) to rclone names (`amd64`/`386`) — see `RcloneArchMap`
in `src/rclone.ts`. **If you add an arch, update that map.**

## Test isolation env vars

The app honors these (used by E2E and power users):

- `RCLONETRAY_TEST=1` — disables dev-only inspector/electron-reload.
- `RCLONETRAY_RCLONE_PATH` — absolute path to an rclone binary (or stub).
- `RCLONETRAY_CONFIG_FILE` / `RCLONETRAY_CONFIG_DIR` — rclone config location.
- `RCLONETRAY_SETTINGS_DIR` — directory for `settings.json`.

E2E uses `tests/e2e/fixtures/rclone-stub.sh` (POSIX shell; the launch test is
skipped on Windows).

## CI / Release

- `.github/workflows/ci.yml` — runs on push/PR to `master`/`develop`:
  lint+typecheck, unit/integration+coverage, E2E (xvfb), build on 3 OSes,
  Linux pack smoke.
- `.github/workflows/release.yml` — on tag `v*`: matrix build, then publishes a
  GitHub Release with all installers via `softprops/action-gh-release`.
  Only `GITHUB_TOKEN` is needed (no Apple/Windows signing certs).

### Cutting a release

1. Bump `version` in `package.json` and add a `CHANGELOG.md` entry.
2. Regenerate the lockfile if deps changed: `npm install --package-lock-only`.
3. Commit, push `master`.
4. Tag and push: `git tag v1.x.y && git push origin v1.x.y`.
5. The release workflow builds and publishes the binaries.

> Tag convention is **`v1.x.y`** (no extra dot). The old `v.1.2.0` tag/release is
> legacy — do not copy that format.

## Known quirks / backlog

- Builds are **unsigned** (no Apple Developer ID, no Windows EV cert). Document the
  quarantine/SmartScreen workaround (already in README + Getting Started + release notes).
- `npm audit` reports vulnerabilities mostly from `electron-builder`'s transitive
  deps; they are build-time only. Bump when convenient.
- Linux packages currently bundle all linux rclone arches via `extraResources`
  (`rclone/linux/*`); could be slimmed to the target arch to reduce size.
- Coverage is high on `settings.ts` and the `rclone.ts` command builders; the
  Electron/UI modules (`main`, `tray`, `dialogs`, preload) are exercised only by
  the E2E smoke test, not unit-covered.
