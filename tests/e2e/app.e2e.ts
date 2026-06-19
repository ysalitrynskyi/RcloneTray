import { test, expect, _electron as electron, ElectronApplication } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

/**
 * E2E tests for the RcloneTray Electron application.
 *
 * A stub rclone binary (tests/e2e/fixtures/rclone-stub.sh) is injected via
 * RCLONETRAY_RCLONE_PATH so the app can boot without a real rclone install or
 * network access. Config/settings are redirected to a throwaway temp directory.
 *
 * The launch smoke test is skipped on Windows (the shell stub is POSIX-only) and
 * when the build output is missing.
 */

const TEST_DATA_DIR = path.join(os.tmpdir(), 'rclonetray-e2e-test')
const RCLONE_STUB = path.join(__dirname, 'fixtures', 'rclone-stub.sh')
const MAIN_JS = path.join(__dirname, '../../dist/main.js')

function setupTestDirectories(): void {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true })
  }
  fs.mkdirSync(path.join(TEST_DATA_DIR, 'config'), { recursive: true })
  fs.mkdirSync(path.join(TEST_DATA_DIR, 'settings'), { recursive: true })
}

function cleanupTestDirectories(): void {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true })
  }
}

test.describe('RcloneTray Application launch', () => {
  let electronApp: ElectronApplication | undefined

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close()
    }
    cleanupTestDirectories()
  })

  test('boots through app "ready" without crashing', async () => {
    test.skip(process.platform === 'win32', 'POSIX shell stub not supported on Windows')
    test.skip(!fs.existsSync(MAIN_JS), 'dist/main.js missing — run "npm run build" first')

    setupTestDirectories()
    fs.chmodSync(RCLONE_STUB, 0o755)

    electronApp = await electron.launch({
      args: [MAIN_JS],
      env: {
        ...process.env,
        RCLONETRAY_TEST: '1',
        RCLONETRAY_RCLONE_PATH: RCLONE_STUB,
        RCLONETRAY_CONFIG_DIR: path.join(TEST_DATA_DIR, 'config'),
        RCLONETRAY_SETTINGS_DIR: path.join(TEST_DATA_DIR, 'settings')
      }
    })

    // The app reaches the Electron "ready" state (main process booted, tray init,
    // rclone init via the stub) without throwing.
    const isReady = await electronApp.evaluate(async ({ app }) => {
      if (app.isReady()) return true
      await app.whenReady()
      return app.isReady()
    })
    expect(isReady).toBe(true)

    // rclone.init() creates an (empty) config file in the isolated config dir.
    const configFile = path.join(TEST_DATA_DIR, 'config', 'rclone.conf')
    await expect.poll(() => fs.existsSync(configFile), { timeout: 5000 }).toBe(true)
  })
})

test.describe('Build artifacts smoke', () => {
  test('compiled main entry exists', () => {
    expect(fs.existsSync(MAIN_JS)).toBe(true)
  })

  test('HTML dialogs exist', () => {
    const dialogsPath = path.join(__dirname, '../../src/ui/dialogs')
    for (const f of ['About.html', 'Preferences.html', 'AddBookmark.html', 'EditBookmark.html']) {
      expect(fs.existsSync(path.join(dialogsPath, f))).toBe(true)
    }
  })

  test('CSS files exist', () => {
    const stylesPath = path.join(__dirname, '../../src/ui/styles')
    expect(fs.existsSync(path.join(stylesPath, 'ui.css'))).toBe(true)
    expect(fs.existsSync(path.join(stylesPath, 'about.css'))).toBe(true)
  })

  test('tray icons exist for all platforms', () => {
    const iconsPath = path.join(__dirname, '../../src/ui/icons')
    for (const f of [
      'iconTemplate.png', 'icon-connectedTemplate.png',
      'icon.ico', 'icon-connected.ico',
      'icon.png', 'icon-connected.png'
    ]) {
      expect(fs.existsSync(path.join(iconsPath, f))).toBe(true)
    }
  })
})
